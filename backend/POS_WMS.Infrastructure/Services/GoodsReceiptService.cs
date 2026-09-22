using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Domain.Enums;
using POS_WMS.Infrastructure.Persistence;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace POS_WMS.Infrastructure.Services
{
    public class GoodsReceiptService : IGoodsReceiptService
    {
        private readonly ApplicationDbContext _context;
        private readonly IAuditLogService _auditLogService;
        private readonly IStockMovementService _stockMovementService;

        public GoodsReceiptService(ApplicationDbContext context, IAuditLogService auditLogService, IStockMovementService stockMovementService)
        {
            _context = context;
            _auditLogService = auditLogService;
            _stockMovementService = stockMovementService;
        }

        public async Task<List<GoodsReceiptDto>> GetAllAsync()
        {
            var receipts = await _context.GoodsReceipts
                .Include(g => g.Supplier)
                .Include(g => g.User)
                .Include(g => g.GoodsReceiptDetails)
                .ThenInclude(d => d.Product)
                .OrderByDescending(g => g.ReceiptDate)
                .ToListAsync();

            return receipts.Select(g => new GoodsReceiptDto
            {
                Id = g.Id,
                SupplierId = g.SupplierId,
                SupplierName = g.Supplier?.Name ?? "Unknown",
                UserId = g.UserId,
                UserName = g.User?.Username ?? "Unknown",
                TotalAmount = g.TotalAmount,
                ReceiptDate = g.ReceiptDate,
                Remarks = g.Remarks ?? string.Empty,
                OfflineReferenceId = g.OfflineReferenceId,
                SyncStatus = "Synced",
                Status = "COMPLETED",
                ShiftId = g.ShiftId,
                Details = g.GoodsReceiptDetails.Select(d => new GoodsReceiptDetailDto
                {
                    Id = d.Id,
                    ProductId = d.ProductId,
                    ProductName = !string.IsNullOrEmpty(d.ProductName) ? d.ProductName : (d.Product?.Name ?? $"SP #{d.ProductId}"),
                    Barcode = !string.IsNullOrEmpty(d.Barcode) ? d.Barcode : (d.Product?.Barcode ?? string.Empty),
                    Quantity = d.Quantity,
                    CostPrice = d.CostPrice
                }).ToList()
            }).ToList();
        }

        public async Task<GoodsReceiptDto> GetByIdAsync(int id)
        {
            var receipt = await _context.GoodsReceipts
                .Include(g => g.Supplier)
                .Include(g => g.User)
                .Include(g => g.GoodsReceiptDetails)
                .ThenInclude(d => d.Product)
                .FirstOrDefaultAsync(g => g.Id == id);

            if (receipt == null) throw new KeyNotFoundException("Không tìm thấy phiếu nhập kho");

            return new GoodsReceiptDto
            {
                Id = receipt.Id,
                SupplierId = receipt.SupplierId,
                SupplierName = receipt.Supplier?.Name ?? "Unknown",
                UserId = receipt.UserId,
                UserName = receipt.User?.Username ?? "Unknown",
                TotalAmount = receipt.TotalAmount,
                ReceiptDate = receipt.ReceiptDate,
                Remarks = receipt.Remarks ?? string.Empty,
                OfflineReferenceId = receipt.OfflineReferenceId,
                SyncStatus = "Synced",
                Status = "COMPLETED",
                ShiftId = receipt.ShiftId,
                Details = receipt.GoodsReceiptDetails.Select(d => new GoodsReceiptDetailDto
                {
                    Id = d.Id,
                    ProductId = d.ProductId,
                    ProductName = !string.IsNullOrEmpty(d.ProductName) ? d.ProductName : (d.Product?.Name ?? $"SP #{d.ProductId}"),
                    Barcode = !string.IsNullOrEmpty(d.Barcode) ? d.Barcode : (d.Product?.Barcode ?? string.Empty),
                    Quantity = d.Quantity,
                    CostPrice = d.CostPrice
                }).ToList()
            };
        }

        public async Task<GoodsReceiptDto> CreateAsync(CreateGoodsReceiptRequestDto request)
        {
            if (!string.IsNullOrEmpty(request.OfflineReferenceId))
            {
                var existingReceiptPreCheck = await _context.GoodsReceipts.FirstOrDefaultAsync(r => r.OfflineReferenceId == request.OfflineReferenceId);
                if (existingReceiptPreCheck != null)
                {
                    return await GetByIdAsync(existingReceiptPreCheck.Id);
                }
            }

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                int effectiveUserId = request.UserId;
                var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == effectiveUserId);
                if (user == null)
                {
                    user = await _context.Users.FirstOrDefaultAsync(u => u.IsActive);
                    effectiveUserId = user?.Id ?? 2;
                }

                var openShift = await _context.Shifts.FirstOrDefaultAsync(s => s.UserId == effectiveUserId && s.Status == ShiftStatus.Open);

                var receipt = new GoodsReceipt
                {
                    UserId = effectiveUserId,
                    SupplierId = request.SupplierId,
                    ReceiptDate = DateTime.UtcNow,
                    Remarks = request.Remarks,
                    TotalAmount = request.Details.Sum(d => d.Quantity * d.CostPrice),
                    OfflineReferenceId = request.OfflineReferenceId,
                    ShiftId = request.ShiftId ?? openShift?.Id
                };

                await _context.GoodsReceipts.AddAsync(receipt);
                await _context.SaveChangesAsync();

                foreach (var detail in request.Details)
                {
                    var product = await _context.Products.FirstOrDefaultAsync(p => p.Id == detail.ProductId);
                    var prodName = product?.Name ?? $"SP #{detail.ProductId}";
                    var prodBarcode = product?.Barcode ?? string.Empty;

                    receipt.GoodsReceiptDetails.Add(new GoodsReceiptDetail
                    {
                        GoodsReceiptId = receipt.Id,
                        ProductId = detail.ProductId,
                        Quantity = detail.Quantity,
                        CostPrice = detail.CostPrice,
                        ProductName = prodName,
                        Barcode = prodBarcode
                    });

                    var inventoryItem = await _context.Inventories.FirstOrDefaultAsync(i => i.ProductId == detail.ProductId);
                    if (inventoryItem == null)
                    {
                        inventoryItem = new Inventory
                        {
                            ProductId = detail.ProductId,
                            StockQuantity = detail.Quantity
                        };
                        await _context.Inventories.AddAsync(inventoryItem);
                    }
                    else
                    {
                        inventoryItem.StockQuantity += detail.Quantity;
                    }

                    await _context.SaveChangesAsync();

                    await _stockMovementService.RecordMovementAsync(
                        detail.ProductId,
                        StockMovementType.In,
                        detail.Quantity,
                        "GoodsReceipt",
                        receipt.Id,
                        inventoryItem.StockQuantity,
                        user?.Username ?? "Unknown"
                    );
                }

                await transaction.CommitAsync();

                // Audit log
                await _auditLogService.LogActionAsync(
                    effectiveUserId,
                    user?.Username ?? "Unknown",
                    "IMPORT",
                    "GoodsReceipt",
                    receipt.Id.ToString(),
                    $"Nhập kho: {receipt.TotalAmount:N0}đ ({request.Details.Count} sản phẩm)"
                );

                return await GetByIdAsync(receipt.Id);
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        public async Task<int> SyncOfflineGoodsReceiptAsync(GoodsReceiptSyncRequestDto request)
        {
            if (string.IsNullOrEmpty(request.OfflineReferenceId))
                throw new ArgumentException("Thiếu mã OfflineReferenceId");

            var existingReceiptPreCheck = await _context.GoodsReceipts.FirstOrDefaultAsync(r => r.OfflineReferenceId == request.OfflineReferenceId);
            if (existingReceiptPreCheck != null)
            {
                return existingReceiptPreCheck.Id;
            }

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                int effectiveUserId = request.UserId;
                var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == effectiveUserId);
                if (user == null)
                {
                    user = await _context.Users.FirstOrDefaultAsync(u => u.IsActive);
                    effectiveUserId = user?.Id ?? 2;
                }

                var openShift = await _context.Shifts.FirstOrDefaultAsync(s => s.UserId == effectiveUserId && s.Status == ShiftStatus.Open);

                var receipt = new GoodsReceipt
                {
                    UserId = effectiveUserId,
                    SupplierId = request.SupplierId,
                    ReceiptDate = DateTime.UtcNow,
                    Remarks = request.Remarks,
                    TotalAmount = request.Details.Sum(d => d.Quantity * d.CostPrice),
                    OfflineReferenceId = request.OfflineReferenceId,
                    ShiftId = request.ShiftId ?? openShift?.Id
                };

                await _context.GoodsReceipts.AddAsync(receipt);
                await _context.SaveChangesAsync();

                foreach (var detail in request.Details)
                {
                    var product = await _context.Products.FirstOrDefaultAsync(p => p.Id == detail.ProductId);
                    var prodName = product?.Name ?? $"SP #{detail.ProductId}";
                    var prodBarcode = product?.Barcode ?? string.Empty;

                    receipt.GoodsReceiptDetails.Add(new GoodsReceiptDetail
                    {
                        GoodsReceiptId = receipt.Id,
                        ProductId = detail.ProductId,
                        Quantity = detail.Quantity,
                        CostPrice = detail.CostPrice,
                        ProductName = prodName,
                        Barcode = prodBarcode
                    });

                    var inventoryItem = await _context.Inventories.FirstOrDefaultAsync(i => i.ProductId == detail.ProductId);
                    if (inventoryItem == null)
                    {
                        inventoryItem = new Inventory
                        {
                            ProductId = detail.ProductId,
                            StockQuantity = detail.Quantity
                        };
                        await _context.Inventories.AddAsync(inventoryItem);
                    }
                    else
                    {
                        inventoryItem.StockQuantity += detail.Quantity;
                    }

                    await _context.SaveChangesAsync();

                    await _stockMovementService.RecordMovementAsync(
                        detail.ProductId,
                        StockMovementType.In,
                        detail.Quantity,
                        "GoodsReceipt",
                        receipt.Id,
                        inventoryItem.StockQuantity,
                        user?.Username ?? "Unknown"
                    );
                }

                await transaction.CommitAsync();

                await _auditLogService.LogActionAsync(
                    effectiveUserId,
                    user?.Username ?? "Unknown",
                    "IMPORT",
                    "GoodsReceipt",
                    receipt.Id.ToString(),
                    $"Đồng bộ phiếu nhập: {receipt.TotalAmount:N0}đ ({request.Details.Count} sản phẩm)"
                );

                return receipt.Id;
            }
            catch (DbUpdateException ex)
            {
                await transaction.RollbackAsync();

                if (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx &&
                    (sqlEx.Number == 2601 || sqlEx.Number == 2627) &&
                    sqlEx.Message.Contains("IX_GoodsReceipts_OfflineReferenceId"))
                {
                    var existingReceipt = await _context.GoodsReceipts.FirstOrDefaultAsync(r => r.OfflineReferenceId == request.OfflineReferenceId);
                    if (existingReceipt != null)
                    {
                        return existingReceipt.Id; // Idempotent success
                    }
                }

                throw; // Rethrow to be caught by GlobalExceptionMiddleware
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }
    }
}
