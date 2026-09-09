using System.ComponentModel.DataAnnotations.Schema;

namespace POS_WMS.Domain.Entities
{
    public class Inventory
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public int StockQuantity { get; set; }
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();

        [ForeignKey("ProductId")]
        public Product? Product { get; set; }
    }
}