using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Domain.Enums;
using POS_WMS.Infrastructure.Persistence;

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

            var existingOrderPreCheck = await _context.Orders.FirstOrDefaultAsync(o => o.OfflineReferenceId == request.OfflineReferenceId);
            if (existingOrderPreCheck != null)
            {
                return existingOrderPreCheck.Id;
            }

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var order = new Order
                {
                    UserId = request.UserId,
                    CustomerId = request.CustomerId,
                    TotalAmount = request.TotalAmount,
                    OrderDate = request.OrderDate,
                    Status = request.Status,
                    OfflineReferenceId = request.OfflineReferenceId
                };

                await _context.Orders.AddAsync(order);
                await _context.SaveChangesAsync();

                foreach (var detail in request.Details)
                {
                    int rowsAffected = await _context.Database.ExecuteSqlInterpolatedAsync(
                        $"UPDATE Inventories SET StockQuantity = StockQuantity - {detail.Quantity} WHERE ProductId = {detail.ProductId} AND StockQuantity >= {detail.Quantity}");
                    
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
                    var userName = await _context.Users.Where(u => u.Id == request.UserId).Select(u => u.Username).FirstOrDefaultAsync() ?? "Unknown";

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
                var user = await _context.Users.FindAsync(request.UserId);
                await _auditLogService.LogActionAsync(
                    request.UserId,
                    user?.Username ?? "Unknown",
                    "SALE",
                    "Order",
                    order.Id.ToString(),
                    $"Đồng bộ đơn hàng: {request.TotalAmount:N0}đ ({request.Details.Count} sản phẩm)"
                );

                return order.Id;
            }
            catch (DbUpdateException ex)
            {
                await transaction.RollbackAsync();

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
                await transaction.RollbackAsync();
                throw;
            }
        }
    }
}