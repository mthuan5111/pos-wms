namespace POS_WMS.Application.DTOs
{
    public class InventoryUpdateRequestDto
    {
        public int StockQuantity { get; set; }
        public string RowVersion { get; set; } = string.Empty;
    }
}