using System;
using System.ComponentModel.DataAnnotations.Schema;
using POS_WMS.Domain.Enums;

namespace POS_WMS.Domain.Entities
{
    public class Shift
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Role { get; set; } = string.Empty;
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
        public DateTime? EndedAt { get; set; }
        public ShiftStatus Status { get; set; } = ShiftStatus.Open;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string? FinalReportSnapshot { get; set; }
        public string? ClosingRemarks { get; set; }

        [ForeignKey("UserId")]
        public User? User { get; set; }
    }
}
