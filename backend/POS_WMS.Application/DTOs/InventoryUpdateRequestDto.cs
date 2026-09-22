namespace POS_WMS.Application.DTOs
{
    public class InventoryUpdateRequestDto
    {
        public int StockQuantity { get; set; }
        public string RowVersion { get; set; } = string.Empty;
        public string? Reason { get; set; }
        public string? OfflineReferenceId { get; set; }
        public int? ShiftId { get; set; }
    }

    public class StockAdjustmentSyncDto
    {
        public string OfflineReferenceId { get; set; } = string.Empty;
        public int ProductId { get; set; }
        public int Delta { get; set; }
        public string? Reason { get; set; }
        public int? UserId { get; set; }
        public int? ShiftId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
