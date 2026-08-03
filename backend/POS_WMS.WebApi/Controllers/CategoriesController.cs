using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Collections.Generic;
using System.Threading.Tasks;
using POS_WMS.Application.Interfaces;
using POS_WMS.Application.DTOs;
using POS_WMS.Domain.Entities;
using POS_WMS.WebApi.Common;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class CategoriesController : ControllerBase
    {
        private readonly IGenericRepository<Category> _categoryRepository;
        private readonly IUnitOfWork _unitOfWork;

        public CategoriesController(IGenericRepository<Category> categoryRepository, IUnitOfWork unitOfWork)
        {
            _categoryRepository = categoryRepository;
            _unitOfWork = unitOfWork;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllCategories()
        {
            try
            {
                var category = await _categoryRepository.GetAllAsync();
                var dtos = new List<CategoryDto>();

                foreach (var c in category)
                {
                    dtos.Add(new CategoryDto
                    {
                        Id = c.Id,
                        Name = c.Name,
                        Description = c.Description
                    });
                }
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
                    Description = category.Description
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
                var category = new Category
                {
                    Name = request.Name,
                    Description = request.Description
                };
                await _categoryRepository.AddAsync(category);
                await _unitOfWork.SaveChangesAsync();

                return Ok(ApiResponse<int>.Success(category.Id, "Thêm danh mục thành công"));
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

                category.Name = request.Name;
                category.Description = request.Description;

                _categoryRepository.Update(category);
                await _unitOfWork.SaveChangesAsync();
                return Ok(ApiResponse<bool>.Success(true, "Cập nhật thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}", "ERR_UPDATE_CATEGORY"));
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
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy danh mục", "ERR_NOT_FOUND"));
                }
                _categoryRepository.Delete(category);
                await _unitOfWork.SaveChangesAsync();
                return Ok(ApiResponse<bool>.Success(true, "Xóa danh mục thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}", "ERR_DELETE_CATEGORY"));
            }
        }
    }
}