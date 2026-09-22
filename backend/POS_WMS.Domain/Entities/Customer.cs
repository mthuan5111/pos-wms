namespace POS_WMS.Domain.Entities
{
    public class Customer
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string? Address { get; set; }
        public string? Code { get; set; }
        public bool IsSystem { get; set; } = false;
    }
}
