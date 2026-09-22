using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.IO;
using System.Linq;
using System;
using System.Threading.Tasks;
using System.Collections.Generic;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Application.DTOs;
using POS_WMS.Infrastructure.Persistence;
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
        private readonly IGenericRepository<Category> _categoryRepository;
        private readonly IGenericRepository<Supplier> _supplierRepository;
        private readonly IGenericRepository<OrderDetail> _orderDetailRepository;
        private readonly IGenericRepository<GoodsReceiptDetail> _goodsReceiptDetailRepository;
        private readonly IUnitOfWork _unitOfWork;
        private readonly IConfiguration _config;
        private readonly ApplicationDbContext _context;
        private readonly IAuditLogService _auditLogService;

        public ProductsController(
            IGenericRepository<Product> productRepository,
            IGenericRepository<Category> categoryRepository,
            IGenericRepository<Supplier> supplierRepository,
            IGenericRepository<OrderDetail> orderDetailRepository,
            IGenericRepository<GoodsReceiptDetail> goodsReceiptDetailRepository,
            IUnitOfWork unitOfWork,
            IConfiguration config,
            ApplicationDbContext context,
            IAuditLogService auditLogService)
        {
            _productRepository = productRepository;
            _categoryRepository = categoryRepository;
            _supplierRepository = supplierRepository;
            _orderDetailRepository = orderDetailRepository;
            _goodsReceiptDetailRepository = goodsReceiptDetailRepository;
            _unitOfWork = unitOfWork;
            _config = config;
            _context = context;
            _auditLogService = auditLogService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllProducts()
        {
            try
            {
                var query = _context.Products.Include(p => p.Supplier).AsQueryable();

                // Cashier only sees active products
                if (User.IsInRole("Cashier"))
                {
                    query = query.Where(p => p.IsActive);
                }

                var products = await query.ToListAsync();
                var productDtos = products.Select(p => new ProductDto
                {
                    Id = p.Id,
                    CategoryId = p.CategoryId,
                    SupplierId = p.SupplierId,
                    SupplierName = p.Supplier?.Name,
                    Name = p.Name,
                    Barcode = p.Barcode,
                    Price = p.Price,
                    CostPrice = p.CostPrice,
                    IsActive = p.IsActive,
                    ImageUrl = p.ImageUrl,
                    DeactivatedAt = p.DeactivatedAt,
                    DeactivationReason = p.DeactivationReason,
                    LowStockThreshold = p.LowStockThreshold,
                    IsSalePriceConfigured = p.IsSalePriceConfigured
                }).ToList();

                return Ok(ApiResponse<List<ProductDto>>.Success(productDtos, "Tải danh sách sản phẩm thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<ProductDto>>.Failure($"Lỗi trích xuất dữ liệu: {ex.Message}", "ERR_GET_PRODUCTS_FAILED"));
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetProductById(int id)
        {
            try
            {
                var product = await _context.Products.Include(p => p.Supplier).FirstOrDefaultAsync(p => p.Id == id);
                if (product == null)
                {
                    return NotFound(ApiResponse<ProductDto>.Failure("Không tìm thấy sản phẩm", "ERR_NOT_FOUND"));
                }

                var productDto = new ProductDto
                {
                    Id = product.Id,
                    CategoryId = product.CategoryId,
                    SupplierId = product.SupplierId,
                    SupplierName = product.Supplier?.Name,
                    Name = product.Name,
                    Barcode = product.Barcode,
                    Price = product.Price,
                    CostPrice = product.CostPrice,
                    IsActive = product.IsActive,
                    ImageUrl = product.ImageUrl,
                    DeactivatedAt = product.DeactivatedAt,
                    DeactivationReason = product.DeactivationReason,
                    LowStockThreshold = product.LowStockThreshold,
                    IsSalePriceConfigured = product.IsSalePriceConfigured
                };
                return Ok(ApiResponse<ProductDto>.Success(productDto));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<ProductDto>.Failure($"Lỗi hệ thống: {ex.Message}", "ERR_GET_BY_ID"));
            }
        }

        [HttpPost]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> CreateProduct([FromBody] ProductRequestDto request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Name))
                    return BadRequest(ApiResponse<int>.Failure("Tên sản phẩm không được để trống.", "PRODUCT_NAME_REQUIRED"));

                if (!request.CategoryId.HasValue)
                    return BadRequest(ApiResponse<int>.Failure("Vui lòng chọn danh mục hợp lệ.", "PRODUCT_CATEGORY_REQUIRED"));

                var category = await _categoryRepository.GetByIdAsync(request.CategoryId.Value);
                if (category == null || !category.IsActive)
                    return BadRequest(ApiResponse<int>.Failure("Danh mục chỉ định không tồn tại hoặc đã ngừng sử dụng.", "ERR_INVALID_CATEGORY"));

                if (string.IsNullOrWhiteSpace(request.Barcode))
                    return BadRequest(ApiResponse<int>.Failure("Mã vạch không được để trống.", "PRODUCT_BARCODE_REQUIRED"));

                if (request.Price < 0)
                    return BadRequest(ApiResponse<int>.Failure("Giá bán không được nhỏ hơn 0.", "PRODUCT_PRICE_INVALID"));

                if (request.CostPrice < 0)
                    return BadRequest(ApiResponse<int>.Failure("Giá nhập không được nhỏ hơn 0.", "PRODUCT_COST_PRICE_INVALID"));

                if (string.IsNullOrWhiteSpace(request.ImageUrl))
                    return BadRequest(ApiResponse<int>.Failure("Ảnh sản phẩm là bắt buộc.", "PRODUCT_IMAGE_REQUIRED"));

                if (!request.SupplierId.HasValue)
                    return BadRequest(ApiResponse<int>.Failure("Vui lòng chọn nhà cung cấp hợp lệ.", "PRODUCT_SUPPLIER_REQUIRED"));

                var supplier = await _supplierRepository.GetByIdAsync(request.SupplierId.Value);
                if (supplier == null || !supplier.IsActive)
                    return BadRequest(ApiResponse<int>.Failure("Nhà cung cấp chỉ định không tồn tại hoặc đã ngừng sử dụng.", "ERR_INVALID_SUPPLIER"));

                var normBarcode = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeBarcode(request.Barcode);
                var normName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeForComparison(request.Name);

                // Uniqueness rule 1: Barcode is unique across all products
                var barcodeExists = await _context.Products.AnyAsync(p => p.Barcode == normBarcode);
                if (barcodeExists)
                {
                    return Conflict(ApiResponse<int>.Failure("Mã vạch này đã được sử dụng bởi sản phẩm khác.", "PRODUCT_BARCODE_ALREADY_EXISTS"));
                }

                // Uniqueness rule 2: NormalizedName is unique within Category
                var nameExists = await _context.Products.AnyAsync(p => p.NormalizedName == normName && p.CategoryId == request.CategoryId.Value);
                if (nameExists)
                {
                    return Conflict(ApiResponse<int>.Failure("Tên sản phẩm đã tồn tại trong danh mục này.", "PRODUCT_NAME_ALREADY_EXISTS"));
                }

                if (request.LowStockThreshold < 0)
                    return BadRequest(ApiResponse<int>.Failure("Ngưỡng sắp hết không được nhỏ hơn 0.", "PRODUCT_THRESHOLD_INVALID"));

                var product = new Product
                {
                    CategoryId = request.CategoryId.Value,
                    SupplierId = request.SupplierId,
                    Name = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeDisplayName(request.Name),
                    NormalizedName = normName,
                    Barcode = normBarcode,
                    Price = request.Price,
                    CostPrice = request.CostPrice,
                    IsActive = true,
                    ImageUrl = request.ImageUrl,
                    LowStockThreshold = request.LowStockThreshold >= 0 ? request.LowStockThreshold : 10,
                    IsSalePriceConfigured = request.IsSalePriceConfigured
                };

                await _productRepository.AddAsync(product);
                await _unitOfWork.SaveChangesAsync();

                // Ensure initial inventory entry exists
                var inv = await _context.Inventories.FirstOrDefaultAsync(i => i.ProductId == product.Id);
                if (inv == null)
                {
                    await _context.Inventories.AddAsync(new Inventory { ProductId = product.Id, StockQuantity = 0 });
                    await _unitOfWork.SaveChangesAsync();
                }

                int.TryParse(User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var adminId);
                var adminName = User?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "PRODUCT_CREATED", "Product", product.Id.ToString(), $"Tạo sản phẩm: {product.Name} (Mã: {product.Barcode}) bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<int>.Success(product.Id, "Thêm sản phẩm thành công"));
            }
            catch (DbUpdateException dbEx)
            {
                return Conflict(ApiResponse<int>.Failure($"Xung đột dữ liệu sản phẩm: {dbEx.InnerException?.Message ?? dbEx.Message}", "PRODUCT_CONFLICT"));
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
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy sản phẩm", "ERR_NOT_FOUND"));

                if (string.IsNullOrWhiteSpace(request.Name))
                    return BadRequest(ApiResponse<bool>.Failure("Tên sản phẩm không được để trống.", "PRODUCT_NAME_REQUIRED"));

                if (string.IsNullOrWhiteSpace(request.Barcode))
                    return BadRequest(ApiResponse<bool>.Failure("Mã vạch không được để trống.", "PRODUCT_BARCODE_REQUIRED"));

                if (request.Price < 0)
                    return BadRequest(ApiResponse<bool>.Failure("Giá bán không được nhỏ hơn 0.", "PRODUCT_PRICE_INVALID"));

                if (request.CostPrice < 0)
                    return BadRequest(ApiResponse<bool>.Failure("Giá nhập không được nhỏ hơn 0.", "PRODUCT_COST_PRICE_INVALID"));

                int targetCategoryId = request.CategoryId ?? product.CategoryId;
                var category = await _categoryRepository.GetByIdAsync(targetCategoryId);
                if (category == null || !category.IsActive)
                    return BadRequest(ApiResponse<bool>.Failure("Danh mục chỉ định không tồn tại hoặc đã ngừng sử dụng.", "ERR_INVALID_CATEGORY"));

                if (request.SupplierId.HasValue)
                {
                    var supplier = await _supplierRepository.GetByIdAsync(request.SupplierId.Value);
                    if (supplier == null || !supplier.IsActive)
                        return BadRequest(ApiResponse<bool>.Failure("Nhà cung cấp chỉ định không tồn tại hoặc đã ngừng sử dụng.", "ERR_INVALID_SUPPLIER"));
                    product.SupplierId = request.SupplierId.Value;
                }

                var normBarcode = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeBarcode(request.Barcode);
                var normName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeForComparison(request.Name);

                // Barcode unique excluding self
                var barcodeExists = await _context.Products.AnyAsync(p => p.Barcode == normBarcode && p.Id != id);
                if (barcodeExists)
                {
                    return Conflict(ApiResponse<bool>.Failure("Mã vạch này đã được sử dụng bởi sản phẩm khác.", "PRODUCT_BARCODE_ALREADY_EXISTS"));
                }

                // Name unique in Category excluding self
                var nameExists = await _context.Products.AnyAsync(p => p.NormalizedName == normName && p.CategoryId == targetCategoryId && p.Id != id);
                if (nameExists)
                {
                    return Conflict(ApiResponse<bool>.Failure("Tên sản phẩm đã tồn tại trong danh mục này.", "PRODUCT_NAME_ALREADY_EXISTS"));
                }

                if (request.LowStockThreshold < 0)
                    return BadRequest(ApiResponse<bool>.Failure("Ngưỡng sắp hết không được nhỏ hơn 0.", "PRODUCT_THRESHOLD_INVALID"));

                product.CategoryId = targetCategoryId;
                product.Name = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeDisplayName(request.Name);
                product.NormalizedName = normName;
                product.Barcode = normBarcode;
                product.Price = request.Price;
                product.CostPrice = request.CostPrice;
                product.LowStockThreshold = request.LowStockThreshold >= 0 ? request.LowStockThreshold : product.LowStockThreshold;
                product.IsSalePriceConfigured = request.IsSalePriceConfigured;
                if (!string.IsNullOrWhiteSpace(request.ImageUrl))
                    product.ImageUrl = request.ImageUrl;

                _productRepository.Update(product);
                await _unitOfWork.SaveChangesAsync();

                var adminId = int.Parse(User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "PRODUCT_UPDATED", "Product", product.Id.ToString(), $"Cập nhật sản phẩm: {product.Name} (Mã: {product.Barcode}) bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Cập nhật thành công"));
            }
            catch (DbUpdateException dbEx)
            {
                return Conflict(ApiResponse<bool>.Failure($"Xung đột cập nhật dữ liệu: {dbEx.InnerException?.Message ?? dbEx.Message}", "PRODUCT_CONFLICT"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi hệ thống: {ex.Message}"));
            }
        }

        [HttpPut("{id}/deactivate")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> DeactivateProduct(int id, [FromBody] DeactivateRequestDto request)
        {
            try
            {
                var product = await _productRepository.GetByIdAsync(id);
                if (product == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy sản phẩm", "ERR_NOT_FOUND"));

                if (string.IsNullOrWhiteSpace(request?.Reason))
                {
                    return BadRequest(ApiResponse<bool>.Failure("Vui lòng nhập lý do ngừng kinh doanh.", "REASON_REQUIRED"));
                }

                var adminId = int.Parse(User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";

                product.IsActive = false;
                product.DeactivatedAt = DateTime.UtcNow;
                product.DeactivatedByUserId = adminId;
                product.DeactivationReason = request.Reason.Trim();

                _productRepository.Update(product);
                await _unitOfWork.SaveChangesAsync();

                await _auditLogService.LogActionAsync(adminId, adminName, "PRODUCT_DEACTIVATED", "Product", product.Id.ToString(), $"Ngừng kinh doanh sản phẩm: {product.Name}. Lý do: {product.DeactivationReason}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Đã ngừng kinh doanh sản phẩm. Sản phẩm không còn xuất hiện ở màn hình bán hàng; dữ liệu lịch sử vẫn được bảo toàn."));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPut("{id}/reactivate")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> ReactivateProduct(int id)
        {
            try
            {
                var product = await _productRepository.GetByIdAsync(id);
                if (product == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy sản phẩm", "ERR_NOT_FOUND"));

                // Conflict check before reactivating
                var barcodeExists = await _context.Products.AnyAsync(p => p.Barcode == product.Barcode && p.Id != id);
                if (barcodeExists)
                {
                    return Conflict(ApiResponse<bool>.Failure("Không thể kích hoạt lại: Mã vạch đã bị xung đột với sản phẩm khác.", "PRODUCT_BARCODE_ALREADY_EXISTS"));
                }

                var nameExists = await _context.Products.AnyAsync(p => p.NormalizedName == product.NormalizedName && p.CategoryId == product.CategoryId && p.Id != id);
                if (nameExists)
                {
                    return Conflict(ApiResponse<bool>.Failure("Không thể kích hoạt lại: Tên sản phẩm đã tồn tại trong danh mục này.", "PRODUCT_NAME_ALREADY_EXISTS"));
                }

                var adminId = int.Parse(User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "0");
                var adminName = User?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";

                product.IsActive = true;
                product.DeactivatedAt = null;
                product.DeactivatedByUserId = null;
                product.DeactivationReason = null;

                _productRepository.Update(product);
                await _unitOfWork.SaveChangesAsync();

                await _auditLogService.LogActionAsync(adminId, adminName, "PRODUCT_UPDATED", "Product", product.Id.ToString(), $"Kích hoạt lại sản phẩm: {product.Name} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Kích hoạt lại sản phẩm thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
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

                var allOrderDetails = await _orderDetailRepository.GetAllAsync();
                if (allOrderDetails.Any(od => od.ProductId == id))
                {
                    return Conflict(ApiResponse<bool>.Failure("Không thể xóa vĩnh viễn sản phẩm này vì đã phát sinh chứng từ. Bạn có thể chọn Ngừng kinh doanh để ẩn sản phẩm khỏi màn hình bán hàng nhưng vẫn giữ nguyên hóa đơn, phiếu nhập và báo cáo lịch sử.", "PRODUCT_HAS_HISTORY"));
                }

                var allReceiptDetails = await _goodsReceiptDetailRepository.GetAllAsync();
                if (allReceiptDetails.Any(rd => rd.ProductId == id))
                {
                    return Conflict(ApiResponse<bool>.Failure("Không thể xóa vĩnh viễn sản phẩm này vì đã phát sinh chứng từ. Bạn có thể chọn Ngừng kinh doanh để ẩn sản phẩm khỏi màn hình bán hàng nhưng vẫn giữ nguyên hóa đơn, phiếu nhập và báo cáo lịch sử.", "PRODUCT_HAS_HISTORY"));
                }

                _productRepository.Delete(product);
                await _unitOfWork.SaveChangesAsync();

                int.TryParse(User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var adminId);
                var adminName = User?.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "PRODUCT_DEACTIVATED", "Product", id.ToString(), $"Xóa vĩnh viễn sản phẩm: {product.Name} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Xóa sản phẩm thành công"));
            }
            catch (DbUpdateException)
            {
                return StatusCode(409, ApiResponse<bool>.Failure("Không thể xóa sản phẩm vì có ràng buộc chứng từ liên kết.", "ERR_CONFLICT"));
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

                var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".webp" };
                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!allowedExtensions.Contains(ext))
                {
                    return BadRequest(ApiResponse<string>.Failure("Định dạng file không được hỗ trợ. Chỉ chấp nhận JPG, PNG, WEBP.", "INVALID_MIME"));
                }

                if (file.Length > 10 * 1024 * 1024)
                {
                    return BadRequest(ApiResponse<string>.Failure("Kích thước file ảnh tối đa là 10MB.", "FILE_TOO_LARGE"));
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
                        Transformation = new Transformation().Height(800).Width(800).Crop("fill").Gravity("auto")
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
