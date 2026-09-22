using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Domain.Enums;
using POS_WMS.Infrastructure.Persistence;
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
    [Authorize]
    public class UsersController : ControllerBase
    {
        private readonly IUserRepository _userRepository;
        private readonly IUnitOfWork _unitOfWork;
        private readonly IAuditLogService _auditLogService;
        private readonly ApplicationDbContext _context;

        public UsersController(IUserRepository userRepository, IUnitOfWork unitOfWork, IAuditLogService auditLogService, ApplicationDbContext context)
        {
            _userRepository = userRepository;
            _unitOfWork = unitOfWork;
            _auditLogService = auditLogService;
            _context = context;
        }

        [HttpGet]
        [Authorize(Roles = "Admin")]
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
                    IsActive = u.IsActive,
                    IsSystemAdmin = u.IsSystemAdmin,
                    IsProtected = u.IsProtected
                }).ToList();
                return Ok(ApiResponse<List<UserDto>>.Success(dtos));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<UserDto>>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserRequestDto request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Username))
                    return BadRequest(ApiResponse<int>.Failure("Tên đăng nhập không được để trống.", "USERNAME_REQUIRED"));

                var normUsername = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeUsername(request.Username);

                // Case-insensitive & normalized uniqueness check including disabled accounts
                var exists = await _context.Users.AnyAsync(u => u.NormalizedUsername == normUsername || u.Username.ToLower() == normUsername);
                if (exists)
                {
                    return Conflict(ApiResponse<int>.Failure("Tên đăng nhập đã tồn tại.", "USERNAME_ALREADY_EXISTS"));
                }

                if (!Enum.TryParse<UserRole>(request.Role, true, out var role))
                    return BadRequest(ApiResponse<int>.Failure("Vai trò không hợp lệ.", "INVALID_ROLE"));

                var user = new User
                {
                    Username = request.Username.Trim(),
                    NormalizedUsername = normUsername,
                    Name = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeDisplayName(request.Name),
                    Role = role,
                    Phone = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizePhone(request.Phone),
                    IsActive = true,
                    IsSystemAdmin = false,
                    IsProtected = false
                };

                var passwordHasher = new PasswordHasher<User>();
                user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

                await _userRepository.AddAsync(user);
                await _unitOfWork.SaveChangesAsync();

                var adminId = int.Parse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "USER_CREATED", "User", user.Id.ToString(), $"Tạo tài khoản: {user.Username} ({user.Role}) bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<int>.Success(user.Id, "Tạo tài khoản thành công"));
            }
            catch (DbUpdateException)
            {
                return Conflict(ApiResponse<int>.Failure("Tên đăng nhập đã tồn tại trong cơ sở dữ liệu.", "USERNAME_ALREADY_EXISTS"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<int>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserRequestDto request)
        {
            try
            {
                var user = await _userRepository.GetByIdAsync(id);
                if (user == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy tài khoản", "USER_NOT_FOUND"));

                var callerRole = User?.FindFirst(ClaimTypes.Role)?.Value ?? "";
                if (callerRole.Equals("Manager", StringComparison.OrdinalIgnoreCase) && user.Role == UserRole.Admin)
                {
                    return StatusCode(403, ApiResponse<bool>.Failure("Manager không có quyền quản lý Admin.", "FORBIDDEN_MANAGE_ADMIN"));
                }

                if (!Enum.TryParse<UserRole>(request.Role, true, out var role))
                    return BadRequest(ApiResponse<bool>.Failure("Vai trò không hợp lệ", "INVALID_ROLE"));

                // Protection: cannot demote SystemAdmin or last active Admin
                if (user.Role == UserRole.Admin && role != UserRole.Admin)
                {
                    if (user.IsSystemAdmin || user.IsProtected)
                    {
                        return BadRequest(ApiResponse<bool>.Failure("Không thể hạ quyền tài khoản System Admin.", "SYSTEM_ADMIN_PROTECTED"));
                    }

                    var otherActiveAdmins = await _context.Users.CountAsync(u => u.Role == UserRole.Admin && u.IsActive && u.Id != id);
                    if (otherActiveAdmins == 0)
                    {
                        return BadRequest(ApiResponse<bool>.Failure("Không thể hạ quyền Admin hoạt động cuối cùng của hệ thống.", "LAST_ADMIN_PROTECTED"));
                    }
                }

                var oldRole = user.Role.ToString();
                var newRole = role.ToString();
                var roleChanged = !oldRole.Equals(newRole, StringComparison.OrdinalIgnoreCase);

                var oldName = user.Name ?? string.Empty;
                var newName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeDisplayName(request.Name);
                var nameChanged = !oldName.Equals(newName, StringComparison.Ordinal);

                var oldPhone = user.Phone ?? string.Empty;
                var newPhone = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizePhone(request.Phone);
                var phoneChanged = !oldPhone.Equals(newPhone, StringComparison.Ordinal);

                if (!roleChanged && !nameChanged && !phoneChanged)
                {
                    return Ok(ApiResponse<bool>.Success(true, "Không có thay đổi nào"));
                }

                user.Name = newName;
                user.Role = role;
                user.Phone = newPhone;

                _userRepository.Update(user);
                await _unitOfWork.SaveChangesAsync();

                var adminId = int.Parse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";

                var changes = new List<string>();
                if (roleChanged) changes.Add($"Role: {oldRole} → {newRole}");
                if (nameChanged) changes.Add($"Họ tên: '{oldName}' → '{newName}'");
                if (phoneChanged) changes.Add($"SĐT: '{oldPhone}' → '{newPhone}'");

                var action = (roleChanged && !nameChanged && !phoneChanged) ? "USER_ROLE_CHANGED" : "USER_UPDATED";
                await _auditLogService.LogActionAsync(adminId, adminName, action, "User", user.Id.ToString(), $"Cập nhật: {user.Username} ({string.Join(", ", changes)}) bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Cập nhật thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPut("{id}/toggle-status")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> ToggleUserStatus(int id)
        {
            try
            {
                var user = await _userRepository.GetByIdAsync(id);
                if (user == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy tài khoản", "USER_NOT_FOUND"));

                var callerRole = User?.FindFirst(ClaimTypes.Role)?.Value ?? "";
                if (callerRole.Equals("Manager", StringComparison.OrdinalIgnoreCase) && user.Role == UserRole.Admin)
                {
                    return StatusCode(403, ApiResponse<bool>.Failure("Manager không có quyền khóa tài khoản Admin.", "FORBIDDEN_MANAGE_ADMIN"));
                }

                var adminId = int.Parse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";

                // Rule 1: No one can disable System Admin
                if ((user.IsSystemAdmin || user.IsProtected) && user.IsActive)
                {
                    return BadRequest(ApiResponse<bool>.Failure("Không thể khóa tài khoản System Admin.", "SYSTEM_ADMIN_PROTECTED"));
                }

                // Rule 2: Cannot disable self
                if (user.Id == adminId && user.IsActive)
                {
                    return BadRequest(ApiResponse<bool>.Failure("Không thể tự khóa tài khoản của chính mình.", "CANNOT_DISABLE_SELF"));
                }

                // Rule 3: Cannot disable last active Admin
                if (user.IsActive && user.Role == UserRole.Admin)
                {
                    var otherActiveAdmins = await _context.Users.CountAsync(u => u.Role == UserRole.Admin && u.IsActive && u.Id != id);
                    if (otherActiveAdmins == 0)
                    {
                        return BadRequest(ApiResponse<bool>.Failure("Không thể khóa Admin hoạt động cuối cùng của hệ thống.", "LAST_ADMIN_PROTECTED"));
                    }
                }

                user.IsActive = !user.IsActive;
                _userRepository.Update(user);
                await _unitOfWork.SaveChangesAsync();

                var status = user.IsActive ? "Kích hoạt" : "Vô hiệu hóa";
                var action = user.IsActive ? "USER_ENABLED" : "USER_DISABLED";
                await _auditLogService.LogActionAsync(adminId, adminName, action, "User", user.Id.ToString(), $"{status} tài khoản: {user.Username} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, $"{status} tài khoản thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPut("{id}/reset-password")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> ResetPassword(int id, [FromBody] ResetPasswordRequestDto request)
        {
            try
            {
                var user = await _userRepository.GetByIdAsync(id);
                if (user == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy tài khoản", "USER_NOT_FOUND"));

                var callerRole = User?.FindFirst(ClaimTypes.Role)?.Value ?? "";
                if (callerRole.Equals("Manager", StringComparison.OrdinalIgnoreCase) && user.Role == UserRole.Admin)
                {
                    return StatusCode(403, ApiResponse<bool>.Failure("Manager không có quyền đặt lại mật khẩu của Admin.", "FORBIDDEN_MANAGE_ADMIN"));
                }

                var adminId = int.Parse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";

                if ((user.IsSystemAdmin || user.IsProtected) && user.Id != adminId)
                {
                    return BadRequest(ApiResponse<bool>.Failure("Không thể đặt lại mật khẩu cho tài khoản System Admin.", "SYSTEM_ADMIN_PROTECTED"));
                }

                if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
                {
                    return BadRequest(ApiResponse<bool>.Failure("Mật khẩu mới phải có ít nhất 6 ký tự.", "PASSWORD_TOO_SHORT"));
                }

                var passwordHasher = new PasswordHasher<User>();
                user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);

                _userRepository.Update(user);
                await _unitOfWork.SaveChangesAsync();

                await _auditLogService.LogActionAsync(adminId, adminName, "USER_PASSWORD_RESET", "User", user.Id.ToString(), $"Đặt lại mật khẩu cho tài khoản {user.Username} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Đặt lại mật khẩu thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPut("{id}/change-password")]
        [Authorize]
        public async Task<IActionResult> ChangePassword(int id, [FromBody] ChangePasswordRequestDto request)
        {
            try
            {
                var callerIdStr = User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(callerIdStr, out var callerId) || callerId != id)
                {
                    return StatusCode(403, ApiResponse<bool>.Failure("Bạn chỉ có thể đổi mật khẩu cho tài khoản của chính mình.", "FORBIDDEN_USER_MISMATCH"));
                }

                var user = await _userRepository.GetByIdAsync(id);
                if (user == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy tài khoản", "USER_NOT_FOUND"));

                if (string.IsNullOrWhiteSpace(request.CurrentPassword))
                {
                    return BadRequest(ApiResponse<bool>.Failure("Mật khẩu hiện tại không được để trống.", "CURRENT_PASSWORD_REQUIRED"));
                }

                if (string.IsNullOrWhiteSpace(request.NewPassword))
                {
                    return BadRequest(ApiResponse<bool>.Failure("Mật khẩu mới không được để trống.", "NEW_PASSWORD_REQUIRED"));
                }

                if (request.NewPassword.Length < 6)
                {
                    return BadRequest(ApiResponse<bool>.Failure("Mật khẩu mới phải có ít nhất 6 ký tự.", "PASSWORD_TOO_SHORT"));
                }

                var passwordHasher = new PasswordHasher<User>();
                var verifyResult = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword);
                if (verifyResult == PasswordVerificationResult.Failed)
                {
                    return BadRequest(ApiResponse<bool>.Failure("Mật khẩu hiện tại không chính xác.", "INVALID_CURRENT_PASSWORD"));
                }

                if (request.CurrentPassword == request.NewPassword)
                {
                    return BadRequest(ApiResponse<bool>.Failure("Mật khẩu mới không được trùng với mật khẩu hiện tại.", "NEW_PASSWORD_SAME_AS_CURRENT"));
                }

                user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);
                _userRepository.Update(user);
                await _unitOfWork.SaveChangesAsync();

                await _auditLogService.LogActionAsync(user.Id, user.Username, "USER_PASSWORD_CHANGED", "User", user.Id.ToString(), $"Người dùng {user.Username} đã tự đổi mật khẩu.", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Đổi mật khẩu thành công."));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            try
            {
                var user = await _userRepository.GetByIdAsync(id);
                if (user == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy tài khoản", "USER_NOT_FOUND"));

                var callerRole = User?.FindFirst(ClaimTypes.Role)?.Value ?? "";
                if (callerRole.Equals("Manager", StringComparison.OrdinalIgnoreCase) && user.Role == UserRole.Admin)
                {
                    return StatusCode(403, ApiResponse<bool>.Failure("Manager không có quyền xóa tài khoản Admin.", "FORBIDDEN_MANAGE_ADMIN"));
                }

                var adminId = int.Parse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";

                if (user.IsSystemAdmin || user.IsProtected || user.Username.ToLower() == "admin")
                    return BadRequest(ApiResponse<bool>.Failure("Không thể xóa tài khoản System Admin.", "SYSTEM_ADMIN_PROTECTED"));

                if (user.Id == adminId)
                    return BadRequest(ApiResponse<bool>.Failure("Không thể tự xóa chính mình.", "CANNOT_DELETE_SELF"));

                if (user.Role == UserRole.Admin)
                {
                    var otherActiveAdmins = await _context.Users.CountAsync(u => u.Role == UserRole.Admin && u.IsActive && u.Id != id);
                    if (otherActiveAdmins == 0)
                    {
                        return BadRequest(ApiResponse<bool>.Failure("Không thể xóa Admin hoạt động cuối cùng của hệ thống.", "LAST_ADMIN_PROTECTED"));
                    }
                }

                _userRepository.Delete(user);
                await _unitOfWork.SaveChangesAsync();

                await _auditLogService.LogActionAsync(adminId, adminName, "USER_DELETED", "User", user.Id.ToString(), $"Đã xóa tài khoản: {user.Username} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Xóa tài khoản thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }
    }
}
