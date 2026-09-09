using System.ComponentModel.DataAnnotations.Schema;
using POS_WMS.Domain.Enums;

namespace POS_WMS.Domain.Entities
{
    public class StockMovement
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public StockMovementType MovementType { get; set; }
        public int Quantity { get; set; }
        public string ReferenceType { get; set; } = string.Empty;
        public int? ReferenceId { get; set; }
        public int BalanceAfter { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;

        [ForeignKey("ProductId")]
        public Product? Product { get; set; }
    }
}
