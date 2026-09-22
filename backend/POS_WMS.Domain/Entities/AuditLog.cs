using System.ComponentModel.DataAnnotations.Schema;

namespace POS_WMS.Domain.Entities
{
    public class AuditLog
    {
        public int Id { get; set; }
        public int? UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string EntityType { get; set; } = string.Empty;
        public string? EntityId { get; set; }
        public string? Details { get; set; }
        public string? IpAddress { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public string? CorrelationId { get; set; }
        public string? Result { get; set; }

        [ForeignKey("UserId")]
        public User? User { get; set; }
    }
}
