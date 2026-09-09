using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using POS_WMS.Application.DTOs.Auth;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace POS_WMS.Infrastructure.Services
{
    public class AuthService : IAuthService
    {
        private readonly IUserRepository _userRepository;
        private readonly IUnitOfWork _unitOfWork;
        private readonly IConfiguration _configuration;
        private readonly PasswordHasher<User> _passwordHasher;
        private readonly IAuditLogService _auditLogService;

        public AuthService(IUserRepository userRepository, IUnitOfWork unitOfWork, IConfiguration configuration, IAuditLogService auditLogService)
        {
            _userRepository = userRepository;
            _unitOfWork = unitOfWork;
            _configuration = configuration;
            _passwordHasher = new PasswordHasher<User>();
            _auditLogService = auditLogService;
        }

        public async Task<AuthResponseDTO?> LoginAsync(LoginRequestDTO request)
        {
            var user = await _userRepository.GetByUsernameAsync(request.Username);
            if (user == null)
            {
                // Can't log to DB due to FK constraint for UserId
                return null;
            }
            if (!user.IsActive)
            {
                await _auditLogService.LogActionAsync(user.Id, request.Username ?? "Unknown", "LOGIN_FAILED", "System", null, "Tài khoản bị khóa", "FAILED");
                return null;
            }

            var result = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
            if (result == PasswordVerificationResult.Failed)
            {
                await _auditLogService.LogActionAsync(user.Id, user.Username, "LOGIN_FAILED", "User", user.Id.ToString(), "Sai mật khẩu", "FAILED");
                return null;
            }

            var accessToken = GenerateAccessToken(user);
            var refreshToken = GenerateRefreshToken();

            user.RefreshToken = refreshToken;
            var refreshTokenDaysStr = _configuration["Jwt:RefreshTokenExpirationDays"];
            var refreshTokenDays = double.TryParse(refreshTokenDaysStr, out var days) ? days : 7;
            user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(refreshTokenDays);
            _userRepository.Update(user);
            await _unitOfWork.SaveChangesAsync();

            await _auditLogService.LogActionAsync(user.Id, user.Username, "LOGIN_SUCCESS", "User", user.Id.ToString(), $"Đăng nhập thành công ({user.Role})", "SUCCESS");

            return new AuthResponseDTO
            {
                Id = user.Id,
                AccessToken = accessToken,
                RefreshToken = refreshToken,
                Username = user.Username,
                Name = user.Name,
                Role = user.Role.ToString()
            };
        }

        public async Task<AuthResponseDTO?> RefreshTokenAsync(TokenRequestDTO request)
        {
            var principal = GetPrincipalFromExpiredToken(request.AccessToken);
            if (principal == null) return null;
            var username = principal.Identity?.Name;
            var user = await _userRepository.GetByUsernameAsync(username!);
            if (user == null || user.RefreshToken != request.RefreshToken || user.RefreshTokenExpiryTime <= DateTime.UtcNow)
                return null;
            var newAccessToken = GenerateAccessToken(user);
            var newRefreshToken = GenerateRefreshToken();

            user.RefreshToken = newRefreshToken;
            _userRepository.Update(user);
            await _unitOfWork.SaveChangesAsync();

            return new AuthResponseDTO
            {
                Id = user.Id,
                AccessToken = newAccessToken,
                RefreshToken = newRefreshToken,
                Username = user.Username,
                Name = user.Name,
                Role = user.Role.ToString()
            };
        }

        private string GenerateAccessToken(User user)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!);

            var accessTokenMinutesStr = _configuration["Jwt:AccessTokenExpirationMinutes"];
            var accessTokenMinutes = double.TryParse(accessTokenMinutesStr, out var mins) ? mins : 60;

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                    new Claim(ClaimTypes.Name, user.Username),
                    new Claim(ClaimTypes.Role, user.Role.ToString())
                }),
                Expires = DateTime.UtcNow.AddMinutes(accessTokenMinutes),
                Issuer = _configuration["Jwt:Issuer"],
                Audience = _configuration["Jwt:Audience"],
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }

        private string GenerateRefreshToken()
        {
            var randomNumber = new byte[64];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(randomNumber);
            return Convert.ToBase64String(randomNumber);
        }

        private ClaimsPrincipal? GetPrincipalFromExpiredToken(string token)
        {
            var tokenValidationParameters = new TokenValidationParameters
            {
                ValidateAudience = false,
                ValidateIssuer = false,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!)),
                ValidateLifetime = false
            };
            var tokenHandler = new JwtSecurityTokenHandler();
            var principal = tokenHandler.ValidateToken(token, tokenValidationParameters, out SecurityToken securityToken);
            if (securityToken is not JwtSecurityToken jwtSecurityToken ||
                !jwtSecurityToken.Header.Alg.Equals(SecurityAlgorithms.HmacSha256, StringComparison.InvariantCultureIgnoreCase))
                return null;
            return principal;
        }
    }
}