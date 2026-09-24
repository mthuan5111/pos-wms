namespace POS_WMS.Application.DTOs
{
    public class CleanupImageRequestDto
    {
        public string PublicId { get; set; } = string.Empty;
    }

    public class ImageUploadResponseDto
    {
        public string SecureUrl { get; set; } = string.Empty;
        public string Url => SecureUrl;
        public string PublicId { get; set; } = string.Empty;
        public int Width { get; set; }
        public int Height { get; set; }
        public string Format { get; set; } = string.Empty;
        public long Bytes { get; set; }
    }
}
