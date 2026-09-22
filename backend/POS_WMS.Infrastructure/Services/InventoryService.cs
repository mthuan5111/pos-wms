using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Infrastructure.Persistence;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace POS_WMS.Infrastructure.Services
{
    public class InventoryService : IInventoryService
    {
        private readonly ApplicationDbContext _context;
        private readonly IStockMovementService? _stockMovementService;

        public InventoryService(ApplicationDbContext context, IStockMovementService? stockMovementService = null)
        {
            _context = context;
            _stockMovementService = stockMovementService;
        }

        public async Task<List<InventoryDto>> GetAllInventoriesAsync()
        {
            var inventories = await _context.Inventories.ToListAsync();
            var productIds = inventories.Select(i => i.ProductId).Distinct().ToList();
            var products = await _context.Products
                .Where(p => productIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, p => p.Name);

            return inventories.Select(inv => new InventoryDto
            {
                Id = inv.Id,
                ProductId = inv.ProductId,
                ProductName = products.TryGetValue(inv.ProductId, out var name) ? name : $"Sản phẩm không xác định (#{inv.ProductId})",
                StockQuantity = inv.StockQuantity,
                RowVersion = inv.RowVersion != null ? Convert.ToBase64String(inv.RowVersion) : string.Empty
            }).ToList();
        }

        public async Task<bool> AdjustStockAsync(int id, InventoryUpdateRequestDto request)
        {
            var inventory = await _context.Inventories.FirstOrDefaultAsync(i => i.Id == id);
            if (inventory == null)
            {
                throw new KeyNotFoundException("Không tìm thấy thông tin tồn kho");
            }

            byte[] clientRowVersion = Convert.FromBase64String(request.RowVersion);

            if (!inventory.RowVersion.SequenceEqual(clientRowVersion))
            {
                throw new DbUpdateConcurrencyException("Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại.");
            }

            int oldStock = inventory.StockQuantity;
            inventory.StockQuantity = request.StockQuantity;
            int delta = request.StockQuantity - oldStock;

            try
            {
                await _context.SaveChangesAsync();

                if (delta != 0 && _stockMovementService != null)
                {
                    var reason = string.IsNullOrEmpty(request.Reason) ? "Điều chỉnh tồn kho thủ công" : request.Reason;
                    await _stockMovementService.RecordMovementAsync(
                        inventory.ProductId,
                        Domain.Enums.StockMovementType.Adjustment,
                        Math.Abs(delta),
                        "ADJUSTMENT",
                        inventory.Id,
                        inventory.StockQuantity,
                        "Admin",
                        request.ShiftId
                    );
                }

                return true;
            }
            catch (DbUpdateConcurrencyException)
            {
                throw new DbUpdateConcurrencyException("Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại.");
            }
        }

        public async Task<bool> SyncAdjustmentAsync(StockAdjustmentSyncDto request)
        {
            if (string.IsNullOrWhiteSpace(request.OfflineReferenceId))
            {
                throw new ArgumentException("OfflineReferenceId không được để trống.");
            }

            // Check if this adjustment was already applied (idempotent deduplication)
            var alreadyProcessed = await _context.StockMovements
                .AnyAsync(sm => sm.ReferenceType == "ADJUSTMENT" && sm.CreatedBy.Contains(request.OfflineReferenceId));
            if (alreadyProcessed)
            {
                return true;
            }

            var inventory = await _context.Inventories.FirstOrDefaultAsync(i => i.ProductId == request.ProductId);
            if (inventory == null)
            {
                var product = await _context.Products.FindAsync(request.ProductId);
                if (product == null)
                {
                    throw new KeyNotFoundException($"Không tìm thấy thông tin sản phẩm ID {request.ProductId}");
                }
                inventory = new Inventory
                {
                    ProductId = request.ProductId,
                    StockQuantity = 0
                };
                await _context.Inventories.AddAsync(inventory);
            }

            int targetStock = inventory.StockQuantity + request.Delta;
            if (targetStock < 0)
            {
                throw new InvalidOperationException($"Số lượng tồn kho sau điều chỉnh không thể âm (Hiện tại: {inventory.StockQuantity}, Delta: {request.Delta})");
            }

            inventory.StockQuantity = targetStock;
            await _context.SaveChangesAsync();

            if (_stockMovementService != null)
            {
                var actorName = "Admin";
                if (request.UserId.HasValue && request.UserId > 0)
                {
                    var u = await _context.Users.FindAsync(request.UserId.Value);
                    actorName = u?.Username ?? $"User#{request.UserId.Value}";
                }

                await _stockMovementService.RecordMovementAsync(
                    inventory.ProductId,
                    Domain.Enums.StockMovementType.Adjustment,
                    Math.Abs(request.Delta),
                    "ADJUSTMENT",
                    inventory.Id,
                    inventory.StockQuantity,
                    $"{actorName}:{request.OfflineReferenceId}",
                    request.ShiftId
                );
            }

            return true;
        }
    }
}
