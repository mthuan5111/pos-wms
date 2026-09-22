namespace POS_WMS.Domain.Entities
{
    public class Supplier
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string NormalizedName { get; set; } = string.Empty;
        public string ContactPerson { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string? Email { get; set; }
        public string? TaxCode { get; set; }
        public string Address { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
        public DateTime? DeactivatedAt { get; set; }
        public int? DeactivatedByUserId { get; set; }
        public string? DeactivationReason { get; set; }
    }
}