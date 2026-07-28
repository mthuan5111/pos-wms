using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;
using System.IO;
using System.Linq;
using System;
using System.Threading.Tasks;
using System.Collections.Generic;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Application.DTOs;
using POS_WMS.WebApi.Common;
using Microsoft.Extensions.Configuration;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ProductsController : ControllerBase
    {
        private readonly IGenericRepository<Product> _productRepository;
        private readonly IUnitOfWork _unitOfWork;
        private readonly IConfiguration _config;

        public ProductsController(IGenericRepository<Product> productRepository, IUnitOfWork unitOfWork, IConfiguration config)
        {
            _productRepository = productRepository;
            _unitOfWork = unitOfWork;
            _config = config;
        }
        [HttpGet]
        public async Task<IActionResult> GetAllProducts()
        {
            try
            {
                var products = await _productRepository.GetAllAsync();

                var ProductDtos = new List<ProductDto>();
                foreach (var p in products)
                {
                    ProductDtos.Add(new ProductDto
                    {
                        Id = p.Id,
                        CategoryId = p.CategoryId,
                        Name = p.Name,
                        Barcode = p.Barcode,
                        Price = p.Price,
                        IsActive = p.IsActive,
                        ImageUrl = p.ImageUrl
                    });
                }
                var response = ApiResponse<List<ProductDto>>.Success(ProductDtos, "Tải danh sách sản phẩm thành công");
                return Ok(response);
            }
            catch (Exception ex)
            {
                var errorResponse = ApiResponse<List<ProductDto>>.Failure(
                    $"Lỗi trích xuất dữ liệu: {ex.Message}",
                    "ERR_GET_PRODUCTS_FAILED"
                );
                return StatusCode(500, errorResponse);
            }
        }
        [HttpGet("{id}")]
        public async Task<IActionResult> GetProductById(int id)
        {
            try
            {
                var product = await _productRepository.GetByIdAsync(id);
                if (product == null)
                {
                    return NotFound(ApiResponse<ProductDto>.Failure("Không tìm thấy sản phẩm", "ERR_NOT_FOUND"));
                }
                var productDto = new ProductDto
                {
                    Id = product.Id,
                    CategoryId = product.CategoryId,
                    Name = product.Name,
                    Barcode = product.Barcode,
                    Price = product.Price,
                    IsActive = product.IsActive,
                    ImageUrl = product.ImageUrl
                };
                return Ok(ApiResponse<ProductDto>.Success(productDto));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<ProductDto>.Failure($"Lỗi hệ thống: {ex.Message}", "ERR_GET_BY_ID"));
            }
        }

        [HttpGet("by-category/{categoryId}")]
        public async Task<IActionResult> GetProductsByCategory(int categoryId)
        {
            try
            {
                var allProducts = await _productRepository.GetAllAsync();
                var products = allProducts.Where(p => p.CategoryId == categoryId).ToList();
                var productDtos = new List<ProductDto>();
                foreach (var p in products)
                {
                    productDtos.Add(new ProductDto
                    {
                        Id = p.Id,
                        CategoryId = p.CategoryId,
                        Name = p.Name,
                        Barcode = p.Barcode,
                        Price = p.Price,
                        IsActive = p.IsActive,
                        ImageUrl = p.ImageUrl
                    });
                }
                return Ok(ApiResponse<List<ProductDto>>.Success(productDtos));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<ProductDto>>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPost]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> CreateProduct([FromBody] ProductRequestDto request)
        {
            try
            {
                var product = new Product
                {
                    CategoryId = request.CategoryId,
                    Name = request.Name,
                    Barcode = request.Barcode,
                    Price = request.Price,
                    IsActive = request.IsActive,
                    ImageUrl = request.ImageUrl
                };
                await _productRepository.AddAsync(product);
                await _unitOfWork.SaveChangesAsync();

                return Ok(ApiResponse<int>.Success(product.Id, "Thêm sản phẩm thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<int>.Failure($"Lỗi hệ thống: {ex.Message}", "ERR_CREATE"));
            }
        }
        [HttpPut("{id}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> UpdateProduct(int id, [FromBody] ProductRequestDto request)
        {
            try
            {
                var product = await _productRepository.GetByIdAsync(id);
                if (product == null)
                {
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy sản phẩm để cập nhật", "ERR_NOT_FOUND"));
                }

                product.CategoryId = request.CategoryId;
                product.Name = request.Name;
                product.Barcode = request.Barcode;
                product.Price = request.Price;
                product.IsActive = request.IsActive;
                product.ImageUrl = request.ImageUrl;

                _productRepository.Update(product);
                await _unitOfWork.SaveChangesAsync();

                return Ok(ApiResponse<bool>.Success(true, "Cập nhật thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure("$Lỗi hệ thống: {ex.Message}", "ERR_UPDATE"));
            }
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> DeleteProduct(int id)
        {
            try
            {
                var product = await _productRepository.GetByIdAsync(id);
                if (product == null)
                {
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy sản phẩm để xóa", "ERR_NOT_FOUND"));
                }

                _productRepository.Delete(product);
                await _unitOfWork.SaveChangesAsync();

                return Ok(ApiResponse<bool>.Success(true, "Xóa sản phẩm thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi hệ thống: {ex.Message}", "ERR_DELETE"));
            }
        }

        [HttpPost("upload-image")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> UploadImage(IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(ApiResponse<string>.Failure("Không tìm thấy file ảnh"));
                }
                Account account = new Account(
                    _config["CloudinarySettings:CloudName"],
                    _config["CloudinarySettings:ApiKey"],
                    _config["CloudinarySettings:ApiSecret"]
                );
                Cloudinary cloudinary = new Cloudinary(account);

                var uploadResult = new ImageUploadResult();
                using (var stream = file.OpenReadStream())
                {
                    var uploadParams = new ImageUploadParams()
                    {
                        File = new FileDescription(file.FileName, stream),
                        Transformation = new Transformation().Height(500).Width(500).Crop("fill")
                    };
                    uploadResult = await cloudinary.UploadAsync(uploadParams);
                }
                if (uploadResult.Error != null)
                    return StatusCode(500, ApiResponse<string>.Failure($"Lỗi Cloudinary: {uploadResult.Error.Message}"));

                string imageUrl = uploadResult.SecureUrl.ToString();

                return Ok(ApiResponse<string>.Success(imageUrl, "Upload thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<string>.Failure($"Lỗi: {ex.Message}"));
            }
        }
    }
}