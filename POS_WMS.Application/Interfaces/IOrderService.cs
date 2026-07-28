using POS_WMS.Application.DTOs;

namespace POS_WMS.Application.Interfaces
{
    public interface IOrderService
    {
        Task<OrderDto> CreateOrderAsync(OrderSyncRequestDto request);
    }
}