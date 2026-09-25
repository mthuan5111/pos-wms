using System;

namespace POS_WMS.Domain.Entities
{
    public class SyncChange
    {
        public long ChangeId { get; set; }
        public string EntityType { get; set; } = string.Empty; // "Product", "Category", "Supplier", "Inventory", "Order", "GoodsReceipt"
        public string EntityId { get; set; } = string.Empty;
        public string Operation { get; set; } = "Upsert"; // "Upsert", "Delete"
        public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
        public long Version { get; set; }
        public string? DataJson { get; set; }
    }
}
