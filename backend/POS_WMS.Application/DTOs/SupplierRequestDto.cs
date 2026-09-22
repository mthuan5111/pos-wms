namespace POS_WMS.Application.DTOs
{
    public class SupplierRequestDto
    {
        public string Name { get; set; } = string.Empty;
        public string ContactPerson { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string? Email { get; set; }
        public string? TaxCode { get; set; }
        public string Address { get; set; } = string.Empty;
    }
}