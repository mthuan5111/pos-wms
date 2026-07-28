namespace POS_WMS.Domain.Entities
{
    public class GoodsReceipt
    {
        public int Id { get; set; }
        public int SupplierId { get; set; }
        public int UserId { get; set; }
        public DateTime ReceiptDate { get; set; } = DateTime.UtcNow;
        public decimal TotalAmount { get; set; }
    }
}