using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Domain.Enums;
using POS_WMS.WebApi.Common;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin")]
    public class UsersController : ControllerBase
    {
        private readonly IUserRepository _userRepository;
        private readonly IUnitOfWork _unitOfWork;
        private readonly IAuditLogService _auditLogService;

        public UsersController(IUserRepository userRepository, IUnitOfWork unitOfWork, IAuditLogService auditLogService)
        {
            _userRepository = userRepository;
            _unitOfWork = unitOfWork;
            _auditLogService = auditLogService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllUsers()
        {
            try
            {
                var users = await _userRepository.GetAllAsync();
                var dtos = users.Select(u => new UserDto
                {
                    Id = u.Id,
                    Username = u.Username,
                    Name = u.Name,
                    Role = u.Role.ToString(),
                    Phone = u.Phone,
                    IsActive = u.IsActive
                }).ToList();
                return Ok(ApiResponse<List<UserDto>>.Success(dtos));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<UserDto>>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPost]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserRequestDto request)
        {
            try
            {
                var existing = await _userRepository.GetByUsernameAsync(request.Username);
                if (existing != null)
                    return BadRequest(ApiResponse<int>.Failure("Tên đăng nhập đã tồn tại"));

                if (!Enum.TryParse<UserRole>(request.Role, true, out var role))
                    return BadRequest(ApiResponse<int>.Failure("Vai trò không hợp lệ"));

                var user = new User
                {
                    Username = request.Username,
                    Name = request.Name,
                    Role = role,
                    Phone = request.Phone,
                    IsActive = true
                };

                var passwordHasher = new PasswordHasher<User>();
                user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

                await _userRepository.AddAsync(user);
                await _unitOfWork.SaveChangesAsync();

                var adminId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "USER_CREATE", "User", user.Id.ToString(), $"Tạo tài khoản: {user.Username} ({user.Role})");

                return Ok(ApiResponse<int>.Success(user.Id, "Tạo tài khoản thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<int>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserRequestDto request)
        {
            try
            {
                var user = await _userRepository.GetByIdAsync(id);
                if (user == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy tài khoản"));

                if (!Enum.TryParse<UserRole>(request.Role, true, out var role))
                    return BadRequest(ApiResponse<bool>.Failure("Vai trò không hợp lệ"));

                var oldRole = user.Role.ToString();
                user.Name = request.Name;
                user.Role = role;
                user.Phone = request.Phone;

                _userRepository.Update(user);
                await _unitOfWork.SaveChangesAsync();

                var adminId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "USER_UPDATE", "User", user.Id.ToString(), $"Cập nhật: {user.Username} (Role: {oldRole} → {role})");

                return Ok(ApiResponse<bool>.Success(true, "Cập nhật thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPut("{id}/toggle-status")]
        public async Task<IActionResult> ToggleUserStatus(int id)
        {
            try
            {
                var user = await _userRepository.GetByIdAsync(id);
                if (user == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy tài khoản"));

                user.IsActive = !user.IsActive;
                _userRepository.Update(user);
                await _unitOfWork.SaveChangesAsync();

                var status = user.IsActive ? "Kích hoạt" : "Vô hiệu hóa";
                var adminId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "USER_TOGGLE", "User", user.Id.ToString(), $"{status} tài khoản: {user.Username}");

                return Ok(ApiResponse<bool>.Success(true, $"{status} tài khoản thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPut("{id}/reset-password")]
        public async Task<IActionResult> ResetPassword(int id, [FromBody] ResetPasswordRequestDto request)
        {
            try
            {
                var user = await _userRepository.GetByIdAsync(id);
                if (user == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy tài khoản"));

                var passwordHasher = new PasswordHasher<User>();
                user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);

                _userRepository.Update(user);
                await _unitOfWork.SaveChangesAsync();

                var adminId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "USER_RESET_PASSWORD", "User", user.Id.ToString(), $"Đặt lại mật khẩu: {user.Username}");

                return Ok(ApiResponse<bool>.Success(true, "Đặt lại mật khẩu thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            try
            {
                var user = await _userRepository.GetByIdAsync(id);
                if (user == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy tài khoản"));

                if (user.Username.ToLower() == "admin")
                    return BadRequest(ApiResponse<bool>.Failure("Không thể xóa tài khoản admin hệ thống"));

                _userRepository.Delete(user);
                await _unitOfWork.SaveChangesAsync();

                var adminId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "USER_DELETE", "User", user.Id.ToString(), $"Đã xóa tài khoản: {user.Username}");

                return Ok(ApiResponse<bool>.Success(true, "Xóa tài khoản thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }
    }
}
