using System.ComponentModel.DataAnnotations.Schema;

namespace POS_WMS.Domain.Entities
{
    public class GoodsReceipt
    {
        public int Id { get; set; }
        public int SupplierId { get; set; }
        public int UserId { get; set; }
        public DateTime ReceiptDate { get; set; } = DateTime.UtcNow;
        public decimal TotalAmount { get; set; }
        public string? Remarks { get; set; }
        public string? OfflineReferenceId { get; set; }
        public int? ShiftId { get; set; }

        [ForeignKey("SupplierId")]
        public Supplier? Supplier { get; set; }
        [ForeignKey("UserId")]
        public User? User { get; set; }
        [ForeignKey("ShiftId")]
        public Shift? Shift { get; set; }
        public ICollection<GoodsReceiptDetail> GoodsReceiptDetails { get; set; } = new List<GoodsReceiptDetail>();
    }
}