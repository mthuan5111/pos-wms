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
    public class OrderService : IOrderService
    {
        private readonly ApplicationDbContext _context;
        private readonly IAuditLogService _auditLogService;
        private readonly IStockMovementService _stockMovementService;

        public OrderService(ApplicationDbContext context, IAuditLogService auditLogService, IStockMovementService stockMovementService)
        {
            _context = context;
            _auditLogService = auditLogService;
            _stockMovementService = stockMovementService;
        }

        public async Task<List<OrderDto>> GetAllOrdersAsync()
        {
            var orders = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.OrderDetails)
                .ThenInclude(d => d.Product)
                .OrderByDescending(o => o.OrderDate)
                .ToListAsync();

            return orders.Select(o => new OrderDto
            {
                Id = o.Id,
                UserId = o.UserId,
                UserName = o.User?.Username ?? "Unknown",
                CustomerId = o.CustomerId,
                TotalAmount = o.TotalAmount,
                OrderDate = o.OrderDate,
                Status = o.Status,
                PaymentMethod = o.PaymentMethod,
                OfflineReferenceId = o.OfflineReferenceId ?? string.Empty,
                Details = o.OrderDetails.Select(d => new OrderDetailDto
                {
                    Id = d.Id,
                    ProductId = d.ProductId,
                    ProductName = d.Product?.Name ?? "Unknown",
                    Quantity = d.Quantity,
                    UnitPrice = d.UnitPrice
                }).ToList()
            }).ToList();
        }

        public async Task<OrderDto> GetOrderByIdAsync(int id)
        {
            var o = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.OrderDetails)
                .ThenInclude(d => d.Product)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (o == null) throw new KeyNotFoundException("Không tìm thấy hóa đơn");

            return new OrderDto
            {
                Id = o.Id,
                UserId = o.UserId,
                UserName = o.User?.Username ?? "Unknown",
                CustomerId = o.CustomerId,
                TotalAmount = o.TotalAmount,
                OrderDate = o.OrderDate,
                Status = o.Status,
                PaymentMethod = o.PaymentMethod,
                OfflineReferenceId = o.OfflineReferenceId ?? string.Empty,
                Details = o.OrderDetails.Select(d => new OrderDetailDto
                {
                    Id = d.Id,
                    ProductId = d.ProductId,
                    ProductName = d.Product?.Name ?? "Unknown",
                    Quantity = d.Quantity,
                    UnitPrice = d.UnitPrice
                }).ToList()
            };
        }

        public async Task<int> SyncOfflineOrderAsync(OrderSyncRequestDto request)
        {
            if (string.IsNullOrEmpty(request.OfflineReferenceId))
                throw new ArgumentException("Thiếu mã OfflineReferenceId");

            var normalizedPaymentMethod = string.IsNullOrWhiteSpace(request.PaymentMethod)
                ? "CASH"
                : request.PaymentMethod.Trim().ToUpperInvariant();

            if (normalizedPaymentMethod != "CASH" && normalizedPaymentMethod != "QR")
            {
                throw new ArgumentException($"Phương thức thanh toán không hợp lệ: {request.PaymentMethod}. Chỉ chấp nhận CASH hoặc QR.");
            }

            var existingOrderPreCheck = await _context.Orders.FirstOrDefaultAsync(o => o.OfflineReferenceId == request.OfflineReferenceId);
            if (existingOrderPreCheck != null)
            {
                return existingOrderPreCheck.Id;
            }

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                int effectiveCustomerId = request.CustomerId;
                if (effectiveCustomerId <= 0)
                {
                    var defaultCustomer = await _context.Customers
                        .FirstOrDefaultAsync(c => c.Code == "WALK_IN_CUSTOMER")
                        ?? await _context.Customers.FirstOrDefaultAsync(c => c.Phone == "0000000000" || c.Name == "Khách lẻ");
                    if (defaultCustomer == null)
                    {
                        defaultCustomer = new Customer
                        {
                            Name = "Khách lẻ",
                            Phone = "0000000000",
                            Address = "Khách mua trực tiếp tại quầy",
                            Code = "WALK_IN_CUSTOMER",
                            IsSystem = true
                        };
                        await _context.Customers.AddAsync(defaultCustomer);
                        await _context.SaveChangesAsync();
                    }
                    effectiveCustomerId = defaultCustomer.Id;
                }
                else
                {
                    var customerExists = await _context.Customers.AnyAsync(c => c.Id == effectiveCustomerId);
                    if (!customerExists)
                    {
                        var defaultCustomer = await _context.Customers
                            .FirstOrDefaultAsync(c => c.Code == "WALK_IN_CUSTOMER")
                            ?? await _context.Customers.FirstOrDefaultAsync(c => c.Phone == "0000000000" || c.Name == "Khách lẻ");
                        effectiveCustomerId = defaultCustomer?.Id ?? 1;
                    }
                }

                int effectiveUserId = request.UserId;
                var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == effectiveUserId);
                if (user == null)
                {
                    var firstAdmin = await _context.Users.FirstOrDefaultAsync(u => u.IsActive);
                    effectiveUserId = firstAdmin?.Id ?? 2;
                    user = firstAdmin;
                }

                // Check unconfigured sale price
                var productIds = request.Details.Select(d => d.ProductId).Distinct().ToList();
                var unconfigured = await _context.Products.Where(p => productIds.Contains(p.Id) && !p.IsSalePriceConfigured).ToListAsync();
                if (unconfigured.Any())
                {
                    var names = string.Join(", ", unconfigured.Select(p => p.Name));
                    throw new InvalidOperationException($"Sản phẩm chưa được cấu hình giá bán, không thể thanh toán: {names}");
                }

                var openShift = await _context.Shifts.FirstOrDefaultAsync(s => s.UserId == effectiveUserId && s.Status == ShiftStatus.Open);

                var order = new Order
                {
                    UserId = effectiveUserId,
                    CustomerId = effectiveCustomerId,
                    TotalAmount = request.TotalAmount,
                    OrderDate = request.OrderDate,
                    Status = request.Status,
                    PaymentMethod = normalizedPaymentMethod,
                    OfflineReferenceId = request.OfflineReferenceId,
                    ShiftId = request.ShiftId ?? openShift?.Id
                };

                await _context.Orders.AddAsync(order);
                await _context.SaveChangesAsync();

                foreach (var detail in request.Details)
                {
                    int rowsAffected = 0;
                    if (_context.Database.IsRelational())
                    {
                        rowsAffected = await _context.Database.ExecuteSqlInterpolatedAsync(
                            $"UPDATE Inventories SET StockQuantity = StockQuantity - {detail.Quantity} WHERE ProductId = {detail.ProductId} AND StockQuantity >= {detail.Quantity}");
                    }
                    else
                    {
                        var inv = await _context.Inventories.FirstOrDefaultAsync(i => i.ProductId == detail.ProductId);
                        if (inv != null && inv.StockQuantity >= detail.Quantity)
                        {
                            inv.StockQuantity -= detail.Quantity;
                            rowsAffected = 1;
                        }
                    }

                    if (rowsAffected == 0)
                    {
                        throw new InvalidOperationException($"Không đủ hàng trong kho cho sản phẩm ID {detail.ProductId} hoặc sản phẩm không tồn tại.");
                    }

                    order.OrderDetails.Add(new OrderDetail
                    {
                        OrderId = order.Id,
                        ProductId = detail.ProductId,
                        Quantity = detail.Quantity,
                        UnitPrice = detail.UnitPrice
                    });

                    // Record stock movement
                    var inventory = await _context.Inventories.FirstOrDefaultAsync(i => i.ProductId == detail.ProductId);
                    var balanceAfter = inventory?.StockQuantity ?? 0;
                    var userName = user?.Username ?? "Unknown";

                    await _stockMovementService.RecordMovementAsync(
                        detail.ProductId,
                        StockMovementType.Out,
                        detail.Quantity,
                        "Order",
                        order.Id,
                        balanceAfter,
                        userName
                    );
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                // Audit log
                var isRecovery = request.RecoveredByUserId.HasValue && request.RecoveredByUserId.Value != request.UserId;
                var actorId = isRecovery ? request.RecoveredByUserId!.Value : effectiveUserId;
                var actorUser = await _context.Users.FindAsync(actorId);
                var actionType = isRecovery ? "RECOVERY" : "SALE";
                var auditDetails = isRecovery
                    ? $"Đồng bộ thu hồi ca trước cho đơn {request.OfflineReferenceId} (chủ ca gốc: UserId {request.UserId}): {request.TotalAmount:N0}đ ({request.Details.Count} sản phẩm)"
                    : $"Đồng bộ đơn hàng: {request.TotalAmount:N0}đ ({request.Details.Count} sản phẩm)";

                await _auditLogService.LogActionAsync(
                    actorId,
                    actorUser?.Username ?? (isRecovery ? "Admin" : "Unknown"),
                    actionType,
                    "Order",
                    order.Id.ToString(),
                    auditDetails
                );

                return order.Id;
            }
            catch (DbUpdateException ex)
            {
                try { await transaction.RollbackAsync(); } catch {}

                if (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx &&
                    (sqlEx.Number == 2601 || sqlEx.Number == 2627) &&
                    sqlEx.Message.Contains("IX_Orders_OfflineReferenceId"))
                {
                    var existingOrder = await _context.Orders.FirstOrDefaultAsync(o => o.OfflineReferenceId == request.OfflineReferenceId);
                    if (existingOrder != null)
                    {
                        return existingOrder.Id; // Idempotent success
                    }
                }

                throw; // Rethrow to be caught by GlobalExceptionMiddleware
            }
            catch
            {
                try { await transaction.RollbackAsync(); } catch {}
                throw;
            }
        }
    }
}
