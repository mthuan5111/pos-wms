using System;
namespace POS_WMS.Application.DTOs
{
    public class InventoryDto
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public int StockQuantity { get; set; }
        public string RowVersion { get; set; } = string.Empty;
    }
}