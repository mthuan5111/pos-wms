using POS_WMS.Domain.Enums;

namespace POS_WMS.Application.DTOs
{
    public class OrderDetailSyncDto
    {
        public int ProductId { get; set; }
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
    }

    public class OrderSyncRequestDto
    {
        public int UserId { get; set; }
        public int CustomerId { get; set; }
        public decimal TotalAmount { get; set; }
        public DateTime OrderDate { get; set; }
        public OrderStatus Status { get; set; }
        public string OfflineReferenceId { get; set; } = string.Empty;

        public List<OrderDetailSyncDto> Details { get; set; } = new List<OrderDetailSyncDto>();
    }
}