using System.ComponentModel.DataAnnotations.Schema;

namespace POS_WMS.Domain.Entities
{
    public class GoodsReceiptDetail
    {
        public int Id { get; set; }
        public int GoodsReceiptId { get; set; }
        public int ProductId { get; set; }
        public int Quantity { get; set; }
        public decimal CostPrice { get; set; }

        [ForeignKey("GoodsReceiptId")]
        public GoodsReceipt? GoodsReceipt { get; set; }
        [ForeignKey("ProductId")]
        public Product? Product { get; set; }
    }
}