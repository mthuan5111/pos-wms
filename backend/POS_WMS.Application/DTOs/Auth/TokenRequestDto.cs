namespace POS_WMS.Application.DTOs.Auth
{
    public class TokenRequestDTO
    {
        public string AccessToken { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
    }
}