using System;
using System.Collections.Generic;

namespace POS_WMS.Application.DTOs
{
    public class SyncChangeDto
    {
        public long ChangeId { get; set; }
        public string EntityType { get; set; } = string.Empty;
        public string EntityId { get; set; } = string.Empty;
        public string Operation { get; set; } = "Upsert";
        public DateTime ChangedAt { get; set; }
        public long Version { get; set; }
        public object? Data { get; set; }
    }

    public class SyncPullResponseDto
    {
        public List<SyncChangeDto> Changes { get; set; } = new();
        public long NextCursor { get; set; }
        public bool HasMore { get; set; }
        public DateTime ServerTime { get; set; } = DateTime.UtcNow;
        public int SchemaVersion { get; set; } = 1;
    }

    public class SyncCursorResponseDto
    {
        public long CurrentCursor { get; set; }
        public DateTime ServerTime { get; set; } = DateTime.UtcNow;
    }
}
