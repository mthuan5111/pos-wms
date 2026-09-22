using System;

namespace POS_WMS.Application.DTOs
{
    public class ProductDto
    {
        public int Id { get; set; }
        public int CategoryId { get; set; }
        public int? SupplierId { get; set; }
        public string? SupplierName { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Barcode { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public decimal CostPrice { get; set; }
        public bool IsActive { get; set; }
        public string? ImageUrl { get; set; }
        public DateTime? DeactivatedAt { get; set; }
        public string? DeactivationReason { get; set; }
        public int LowStockThreshold { get; set; } = 10;
        public bool IsSalePriceConfigured { get; set; } = true;
    }
}
