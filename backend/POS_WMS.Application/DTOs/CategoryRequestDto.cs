namespace POS_WMS.Application.DTOs
{
    public class CategoryRequestDto
    {
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string? Code { get; set; }
    }
}