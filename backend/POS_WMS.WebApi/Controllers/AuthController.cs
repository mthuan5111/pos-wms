using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.DTOs.Auth;
using POS_WMS.Application.Interfaces;
using POS_WMS.WebApi.Common;
using System.Threading.Tasks;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;
        public AuthController(IAuthService authService)
        {
            _authService = authService;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequestDTO request)
        {
            var response = await _authService.LoginAsync(request);

            if (response == null)
            {
                return Unauthorized(ApiResponse<AuthResponseDTO>.Failure("Tên đăng nhập hoặc mật khẩu không chính xác", "ERR_UNAUTHORIZED"));
            }

            return Ok(ApiResponse<AuthResponseDTO>.Success(response, "Đăng nhập thành công"));
        }
        [HttpPost("refresh-token")]
        public async Task<IActionResult> RefreshToken([FromBody] TokenRequestDTO request)
        {
            var response = await _authService.RefreshTokenAsync(request);
            if (response == null)
            {
                return BadRequest(ApiResponse<AuthResponseDTO>.Failure("Refresh Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại!", "ERR_INVALID_TOKEN"));
            }
            return Ok(ApiResponse<AuthResponseDTO>.Success(response, "Làm mới mã truy cập thành công!"));
        }

        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            var userIdStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var username = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Người dùng";
            int.TryParse(userIdStr, out var userId);

            await _authService.LogoutAsync(userId, username);
            return Ok(ApiResponse<bool>.Success(true, "Đăng xuất thành công"));
        }
    }
}