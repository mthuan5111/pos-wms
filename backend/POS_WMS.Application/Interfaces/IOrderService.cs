using POS_WMS.Application.DTOs;

namespace POS_WMS.Application.Interfaces
{
    public interface IOrderService
    {
        Task<List<OrderDto>> GetAllOrdersAsync();
        Task<OrderDto> GetOrderByIdAsync(int id);
        Task<int> SyncOfflineOrderAsync(OrderSyncRequestDto request);
    }
}