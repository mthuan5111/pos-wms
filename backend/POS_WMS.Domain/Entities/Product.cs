namespace POS_WMS.Domain.Entities
{
    public class Product
    {
        public int Id { get; set; }
        public int CategoryId { get; set; }
        public int? SupplierId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string NormalizedName { get; set; } = string.Empty;
        public string Barcode { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public decimal CostPrice { get; set; } = 0;
        public bool IsActive { get; set; }
        public string? ImageUrl { get; set; }
        public DateTime? DeactivatedAt { get; set; }
        public int? DeactivatedByUserId { get; set; }
        public string? DeactivationReason { get; set; }
        public int LowStockThreshold { get; set; } = 10;
        public bool IsSalePriceConfigured { get; set; } = true;

        [System.ComponentModel.DataAnnotations.Schema.ForeignKey("CategoryId")]
        public Category? Category { get; set; }

        [System.ComponentModel.DataAnnotations.Schema.ForeignKey("SupplierId")]
        public Supplier? Supplier { get; set; }
    }
}
