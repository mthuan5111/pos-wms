using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Infrastructure.Persistence;

namespace POS_WMS.Infrastructure.Services
{
    public class OrderService : IOrderService
    {
        private readonly ApplicationDbContext _context;

        public OrderService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<OrderDto> CreateOrderAsync(OrderSyncRequestDto request)
        {
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

                foreach (var detail in request.Details)
                {
                    var rowsAffected = await _context.Inventories
                        .Where(i => i.ProductId == detail.ProductId && i.StockQuantity >= detail.Quantity)
                        .ExecuteUpdateAsync(s => s.SetProperty(
                            i => i.StockQuantity,
                            i => i.StockQuantity - detail.Quantity
                        ));

                    if (rowsAffected == 0)
                    {
                        throw new InvalidOperationException($"Sản phẩm ID {detail.ProductId} không đủ số lượng trong kho.");
                    }

                    order.OrderDetails.Add(new OrderDetail
                    {
                        ProductId = detail.ProductId,
                        Quantity = detail.Quantity,
                        UnitPrice = detail.UnitPrice
                    });
                }

                await _context.Orders.AddAsync(order);
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return new OrderDto
                {
                    Id = order.Id,
                    TotalAmount = order.TotalAmount,
                    OfflineReferenceId = order.OfflineReferenceId ?? string.Empty
                };
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }
    }
}