using POS_WMS.Domain.Enums;
using System.ComponentModel.DataAnnotations.Schema;

namespace POS_WMS.Domain.Entities
{
    public class Order
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public int CustomerId { get; set; } = 1;
        public decimal TotalAmount { get; set; }
        public DateTime OrderDate { get; set; } = DateTime.UtcNow;
        public OrderStatus Status { get; set; } = OrderStatus.Pending;
        public string PaymentMethod { get; set; } = "CASH";
        public string? OfflineReferenceId { get; set; }
        public int? ShiftId { get; set; }

        [ForeignKey("UserId")]
        public User? User { get; set; }
        [ForeignKey("CustomerId")]
        public Customer? Customer { get; set; }
        [ForeignKey("ShiftId")]
        public Shift? Shift { get; set; }
        public ICollection<OrderDetail> OrderDetails { get; set; } = new List<OrderDetail>();
    }
}