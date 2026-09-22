using POS_WMS.Domain.Enums;
namespace POS_WMS.Domain.Entities
{
    public class User
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public UserRole Role { get; set; } = UserRole.Cashier; // Default role is "Cashier"
        public bool IsActive { get; set; } = true; // Default to active
        public bool IsSystemAdmin { get; set; } = false;
        public bool IsProtected { get; set; } = false;
        public string NormalizedUsername { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string? RefreshToken { get; set; }
        public DateTime? RefreshTokenExpiryTime { get; set; }
    }
}