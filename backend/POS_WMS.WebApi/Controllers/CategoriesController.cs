using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using POS_WMS.Application.Interfaces;
using POS_WMS.Application.DTOs;
using POS_WMS.Domain.Entities;
using POS_WMS.Infrastructure.Persistence;
using POS_WMS.WebApi.Common;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class CategoriesController : ControllerBase
    {
        private readonly IGenericRepository<Category> _categoryRepository;
        private readonly IGenericRepository<Product> _productRepository;
        private readonly IUnitOfWork _unitOfWork;
        private readonly ApplicationDbContext _context;
        private readonly IAuditLogService _auditLogService;

        public CategoriesController(
            IGenericRepository<Category> categoryRepository,
            IGenericRepository<Product> productRepository,
            IUnitOfWork unitOfWork,
            ApplicationDbContext context,
            IAuditLogService auditLogService)
        {
            _categoryRepository = categoryRepository;
            _productRepository = productRepository;
            _unitOfWork = unitOfWork;
            _context = context;
            _auditLogService = auditLogService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllCategories()
        {
            try
            {
                var query = _context.Categories.AsQueryable();
                if (User.IsInRole("Cashier"))
                {
                    query = query.Where(c => c.IsActive);
                }

                var categories = await query.ToListAsync();
                var dtos = categories.Select(c => new CategoryDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Description = c.Description ?? string.Empty,
                    Code = c.Code,
                    IsSystem = c.IsSystem,
                    IsActive = c.IsActive,
                    DeactivatedAt = c.DeactivatedAt,
                    DeactivationReason = c.DeactivationReason
                }).ToList();

                return Ok(ApiResponse<List<CategoryDto>>.Success(dtos));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<CategoryDto>>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetCategoryById(int id)
        {
            try
            {
                var category = await _categoryRepository.GetByIdAsync(id);
                if (category == null)
                {
                    return NotFound(ApiResponse<CategoryDto>.Failure("Không tìm thấy danh mục", "ERR_NOT_FOUND"));
                }
                var dto = new CategoryDto
                {
                    Id = category.Id,
                    Name = category.Name,
                    Description = category.Description ?? string.Empty,
                    Code = category.Code,
                    IsSystem = category.IsSystem,
                    IsActive = category.IsActive,
                    DeactivatedAt = category.DeactivatedAt,
                    DeactivationReason = category.DeactivationReason
                };
                return Ok(ApiResponse<CategoryDto>.Success(dto));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<CategoryDto>.Failure($"Lỗi: {ex.Message}", "ERR_GET_CATEGORY"));
            }
        }

        [HttpPost]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> CreateCategory([FromBody] CategoryRequestDto request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Name))
                    return BadRequest(ApiResponse<int>.Failure("Tên danh mục không được để trống.", "CATEGORY_NAME_REQUIRED"));

                var normName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeForComparison(request.Name);

                // Uniqueness rule: Category Name is unique normalized
                var nameExists = await _context.Categories.AnyAsync(c => c.NormalizedName == normName);
                if (nameExists)
                {
                    return Conflict(ApiResponse<int>.Failure("Tên danh mục đã tồn tại.", "CATEGORY_NAME_ALREADY_EXISTS"));
                }

                // Protect system code UNCATEGORIZED
                if (!string.IsNullOrWhiteSpace(request.Code) && request.Code.Trim().ToUpperInvariant() == "UNCATEGORIZED")
                {
                    return BadRequest(ApiResponse<int>.Failure("Không thể dùng mã danh mục hệ thống UNCATEGORIZED.", "CATEGORY_CODE_RESERVED"));
                }

                if (!string.IsNullOrWhiteSpace(request.Code))
                {
                    var codeExists = await _context.Categories.AnyAsync(c => c.Code == request.Code.Trim());
                    if (codeExists)
                    {
                        return Conflict(ApiResponse<int>.Failure("Mã danh mục đã tồn tại.", "CATEGORY_CODE_ALREADY_EXISTS"));
                    }
                }

                var category = new Category
                {
                    Name = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeDisplayName(request.Name),
                    NormalizedName = normName,
                    Description = request.Description?.Trim(),
                    Code = string.IsNullOrWhiteSpace(request.Code) ? null : request.Code.Trim().ToUpperInvariant(),
                    IsSystem = false,
                    IsActive = true
                };

                await _categoryRepository.AddAsync(category);
                await _unitOfWork.SaveChangesAsync();

                var adminId = int.Parse(User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "CATEGORY_CREATED", "Category", category.Id.ToString(), $"Tạo danh mục: {category.Name} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<int>.Success(category.Id, "Thêm danh mục thành công"));
            }
            catch (DbUpdateException dbEx)
            {
                return Conflict(ApiResponse<int>.Failure($"Xung đột dữ liệu danh mục: {dbEx.InnerException?.Message ?? dbEx.Message}", "CATEGORY_CONFLICT"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<int>.Failure($"Lỗi: {ex.Message}", "ERR_CREATE_CATEGORY"));
            }
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> UpdateCategory(int id, [FromBody] CategoryRequestDto request)
        {
            try
            {
                var category = await _categoryRepository.GetByIdAsync(id);
                if (category == null)
                {
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy danh mục", "ERR_NOT_FOUND"));
                }

                if (string.IsNullOrWhiteSpace(request.Name))
                    return BadRequest(ApiResponse<bool>.Failure("Tên danh mục không được để trống.", "CATEGORY_NAME_REQUIRED"));

                var normName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeForComparison(request.Name);

                // Uniqueness check excluding self
                var nameExists = await _context.Categories.AnyAsync(c => c.NormalizedName == normName && c.Id != id);
                if (nameExists)
                {
                    return Conflict(ApiResponse<bool>.Failure("Tên danh mục đã tồn tại.", "CATEGORY_NAME_ALREADY_EXISTS"));
                }

                if (category.IsSystem && !string.IsNullOrWhiteSpace(request.Code) && request.Code != category.Code)
                {
                    return BadRequest(ApiResponse<bool>.Failure("Không được sửa mã danh mục hệ thống.", "SYSTEM_CATEGORY_PROTECTED"));
                }

                category.Name = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeDisplayName(request.Name);
                category.NormalizedName = normName;
                category.Description = request.Description?.Trim();

                _categoryRepository.Update(category);
                await _unitOfWork.SaveChangesAsync();

                var adminId = int.Parse(User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "CATEGORY_UPDATED", "Category", category.Id.ToString(), $"Cập nhật danh mục: {category.Name} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Cập nhật thành công"));
            }
            catch (DbUpdateException dbEx)
            {
                return Conflict(ApiResponse<bool>.Failure($"Xung đột cập nhật danh mục: {dbEx.InnerException?.Message ?? dbEx.Message}", "CATEGORY_CONFLICT"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}", "ERR_UPDATE_CATEGORY"));
            }
        }

        [HttpPut("{id}/deactivate")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> DeactivateCategory(int id, [FromBody] DeactivateRequestDto request)
        {
            try
            {
                var category = await _categoryRepository.GetByIdAsync(id);
                if (category == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy danh mục", "ERR_NOT_FOUND"));

                if (category.IsSystem)
                    return BadRequest(ApiResponse<bool>.Failure("Không thể vô hiệu hóa danh mục hệ thống mặc định.", "SYSTEM_CATEGORY_PROTECTED"));

                if (string.IsNullOrWhiteSpace(request?.Reason))
                    return BadRequest(ApiResponse<bool>.Failure("Vui lòng nhập lý do ngừng sử dụng.", "REASON_REQUIRED"));

                var adminId = int.Parse(User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";

                category.IsActive = false;
                category.DeactivatedAt = DateTime.UtcNow;
                category.DeactivatedByUserId = adminId;
                category.DeactivationReason = request.Reason.Trim();

                _categoryRepository.Update(category);
                await _unitOfWork.SaveChangesAsync();

                await _auditLogService.LogActionAsync(adminId, adminName, "CATEGORY_DEACTIVATED", "Category", category.Id.ToString(), $"Ngừng sử dụng danh mục: {category.Name}. Lý do: {category.DeactivationReason}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Đã ngừng sử dụng danh mục"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPut("{id}/reactivate")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> ReactivateCategory(int id)
        {
            try
            {
                var category = await _categoryRepository.GetByIdAsync(id);
                if (category == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy danh mục", "ERR_NOT_FOUND"));

                var nameExists = await _context.Categories.AnyAsync(c => c.NormalizedName == category.NormalizedName && c.Id != id);
                if (nameExists)
                {
                    return Conflict(ApiResponse<bool>.Failure("Không thể kích hoạt lại: Tên danh mục đã bị trùng với danh mục khác.", "CATEGORY_NAME_ALREADY_EXISTS"));
                }

                var adminId = int.Parse(User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";

                category.IsActive = true;
                category.DeactivatedAt = null;
                category.DeactivatedByUserId = null;
                category.DeactivationReason = null;

                _categoryRepository.Update(category);
                await _unitOfWork.SaveChangesAsync();

                await _auditLogService.LogActionAsync(adminId, adminName, "CATEGORY_UPDATED", "Category", category.Id.ToString(), $"Kích hoạt lại danh mục: {category.Name} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Kích hoạt lại danh mục thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> DeleteCategory(int id)
        {
            try
            {
                var category = await _categoryRepository.GetByIdAsync(id);
                if (category == null)
                {
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy danh mục để xóa", "ERR_NOT_FOUND"));
                }

                if (category.IsSystem)
                {
                    return BadRequest(ApiResponse<bool>.Failure("Không thể xóa danh mục hệ thống mặc định.", "ERR_DELETE_SYSTEM_CATEGORY"));
                }

                var allProducts = await _productRepository.GetAllAsync();
                if (allProducts.Any(p => p.CategoryId == id))
                {
                    return StatusCode(409, ApiResponse<bool>.Failure("Không thể xóa danh mục đang chứa sản phẩm. Vui lòng chuyển sản phẩm sang danh mục khác hoặc sử dụng tính năng Ngừng sử dụng.", "ERR_CATEGORY_HAS_PRODUCTS"));
                }

                _categoryRepository.Delete(category);
                await _unitOfWork.SaveChangesAsync();

                int.TryParse(User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var adminId);
                var adminName = User?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "CATEGORY_DEACTIVATED", "Category", id.ToString(), $"Xóa danh mục: {category.Name} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Xóa danh mục thành công"));
            }
            catch (DbUpdateException)
            {
                return StatusCode(409, ApiResponse<bool>.Failure("Không thể xóa danh mục vì có sản phẩm hoặc chứng từ tham chiếu.", "ERR_CONFLICT"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}", "ERR_DELETE_CATEGORY"));
            }
        }
    }
}
