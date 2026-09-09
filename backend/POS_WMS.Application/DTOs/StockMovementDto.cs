namespace POS_WMS.Application.DTOs
{
    public class StockMovementDto
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string MovementType { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public string ReferenceType { get; set; } = string.Empty;
        public int? ReferenceId { get; set; }
        public int BalanceAfter { get; set; }
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }
}
