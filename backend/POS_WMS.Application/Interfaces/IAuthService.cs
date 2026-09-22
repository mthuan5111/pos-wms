using POS_WMS.Application.DTOs.Auth;
using System.Threading.Tasks;

namespace POS_WMS.Application.Interfaces
{
    public interface IAuthService
    {
        Task<AuthResponseDTO?> LoginAsync(LoginRequestDTO request);
        Task<AuthResponseDTO?> RefreshTokenAsync(TokenRequestDTO request);
        Task LogoutAsync(int userId, string username);
    }
}