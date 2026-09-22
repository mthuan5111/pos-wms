using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Common;
using POS_WMS.Domain.Entities;
using POS_WMS.Infrastructure.Persistence;
using POS_WMS.WebApi.Common;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin,Manager,WarehouseStaff")]
    public class SuppliersController : ControllerBase
    {
        private readonly IGenericRepository<Supplier> _supplierRepository;
        private readonly IGenericRepository<GoodsReceipt> _goodsReceiptRepository;
        private readonly IGenericRepository<Product> _productRepository;
        private readonly IUnitOfWork _unitOfWork;
        private readonly ApplicationDbContext _context;
        private readonly IAuditLogService _auditLogService;

        public SuppliersController(
            IGenericRepository<Supplier> supplierRepository,
            IGenericRepository<GoodsReceipt> goodsReceiptRepository,
            IGenericRepository<Product> productRepository,
            IUnitOfWork unitOfWork,
            ApplicationDbContext context,
            IAuditLogService auditLogService)
        {
            _supplierRepository = supplierRepository;
            _goodsReceiptRepository = goodsReceiptRepository;
            _productRepository = productRepository;
            _unitOfWork = unitOfWork;
            _context = context;
            _auditLogService = auditLogService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllSuppliers()
        {
            try
            {
                var query = _context.Suppliers.AsQueryable();
                // WarehouseStaff sees active suppliers, Admin/Manager see all
                if (User?.IsInRole("WarehouseStaff") == true && !User.IsInRole("Admin") && !User.IsInRole("Manager"))
                {
                    query = query.Where(s => s.IsActive);
                }

                var suppliers = await query.ToListAsync();
                var dtos = suppliers.Select(s => new SupplierDto
                {
                    Id = s.Id,
                    Name = s.Name,
                    ContactPerson = s.ContactPerson,
                    Phone = s.Phone,
                    Email = s.Email,
                    TaxCode = s.TaxCode,
                    Address = s.Address,
                    IsActive = s.IsActive,
                    DeactivatedAt = s.DeactivatedAt,
                    DeactivationReason = s.DeactivationReason
                }).ToList();

                return Ok(ApiResponse<List<SupplierDto>>.Success(dtos));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<SupplierDto>>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetSupplierById(int id)
        {
            try
            {
                var supplier = await _supplierRepository.GetByIdAsync(id);
                if (supplier == null)
                {
                    return NotFound(ApiResponse<SupplierDto>.Failure("Không tìm thấy nhà cung cấp", "ERR_NOT_FOUND"));
                }
                var dto = new SupplierDto
                {
                    Id = supplier.Id,
                    Name = supplier.Name,
                    ContactPerson = supplier.ContactPerson,
                    Phone = supplier.Phone,
                    Email = supplier.Email,
                    TaxCode = supplier.TaxCode,
                    Address = supplier.Address,
                    IsActive = supplier.IsActive,
                    DeactivatedAt = supplier.DeactivatedAt,
                    DeactivationReason = supplier.DeactivationReason
                };
                return Ok(ApiResponse<SupplierDto>.Success(dto));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<SupplierDto>.Failure($"Lỗi: {ex.Message}", "ERR_GET_SUPPLIER"));
            }
        }

        [HttpPost]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> CreateSupplier([FromBody] SupplierRequestDto request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    return BadRequest(ApiResponse<int>.Failure("Tên nhà cung cấp không được để trống.", "SUPPLIER_NAME_REQUIRED"));
                }

                var normName = StringNormalizationHelper.NormalizeForComparison(request.Name);
                var normDisplayName = StringNormalizationHelper.NormalizeDisplayName(request.Name);
                var normPhone = StringNormalizationHelper.NormalizePhone(request.Phone);
                var normEmail = StringNormalizationHelper.NormalizeEmail(request.Email);
                var normTaxCode = StringNormalizationHelper.NormalizeTaxCode(request.TaxCode);

                // Check duplicate Name
                if (await _context.Suppliers.AnyAsync(s => s.NormalizedName == normName))
                {
                    return StatusCode(409, ApiResponse<int>.Failure("Tên nhà cung cấp đã tồn tại.", "SUPPLIER_NAME_ALREADY_EXISTS"));
                }

                // Check duplicate TaxCode
                if (!string.IsNullOrEmpty(normTaxCode) && await _context.Suppliers.AnyAsync(s => s.TaxCode == normTaxCode))
                {
                    return StatusCode(409, ApiResponse<int>.Failure("Mã số thuế đã được sử dụng.", "SUPPLIER_TAX_CODE_ALREADY_EXISTS"));
                }

                // Check duplicate Phone
                if (!string.IsNullOrEmpty(normPhone) && await _context.Suppliers.AnyAsync(s => s.Phone == normPhone))
                {
                    return StatusCode(409, ApiResponse<int>.Failure("Số điện thoại đã được sử dụng bởi nhà cung cấp khác.", "SUPPLIER_PHONE_ALREADY_EXISTS"));
                }

                // Check duplicate Email
                if (!string.IsNullOrEmpty(normEmail) && await _context.Suppliers.AnyAsync(s => s.Email == normEmail))
                {
                    return StatusCode(409, ApiResponse<int>.Failure("Email đã được sử dụng bởi nhà cung cấp khác.", "SUPPLIER_EMAIL_ALREADY_EXISTS"));
                }

                var supplier = new Supplier
                {
                    Name = normDisplayName,
                    NormalizedName = normName,
                    ContactPerson = StringNormalizationHelper.NormalizeDisplayName(request.ContactPerson),
                    Phone = normPhone,
                    Email = normEmail,
                    TaxCode = normTaxCode,
                    Address = (request.Address ?? string.Empty).Trim(),
                    IsActive = true
                };

                await _supplierRepository.AddAsync(supplier);
                await _unitOfWork.SaveChangesAsync();

                int.TryParse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var adminId);
                var adminName = User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "SUPPLIER_CREATED", "Supplier", supplier.Id.ToString(), $"Tạo nhà cung cấp: {supplier.Name} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<int>.Success(supplier.Id, "Thêm nhà cung cấp thành công"));
            }
            catch (DbUpdateException dbEx)
            {
                return StatusCode(409, ApiResponse<int>.Failure($"Xung đột dữ liệu nhà cung cấp: {dbEx.InnerException?.Message ?? dbEx.Message}", "SUPPLIER_CONFLICT"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<int>.Failure($"Lỗi: {ex.Message}", "ERR_CREATE_SUPPLIER"));
            }
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> UpdateSupplier(int id, [FromBody] SupplierRequestDto request)
        {
            try
            {
                var supplier = await _supplierRepository.GetByIdAsync(id);
                if (supplier == null)
                {
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy nhà cung cấp", "ERR_NOT_FOUND"));
                }

                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    return BadRequest(ApiResponse<bool>.Failure("Tên nhà cung cấp không được để trống.", "SUPPLIER_NAME_REQUIRED"));
                }

                var normName = StringNormalizationHelper.NormalizeForComparison(request.Name);
                var normDisplayName = StringNormalizationHelper.NormalizeDisplayName(request.Name);
                var normPhone = StringNormalizationHelper.NormalizePhone(request.Phone);
                var normEmail = StringNormalizationHelper.NormalizeEmail(request.Email);
                var normTaxCode = StringNormalizationHelper.NormalizeTaxCode(request.TaxCode);

                // Check duplicate Name (excluding current)
                if (await _context.Suppliers.AnyAsync(s => s.NormalizedName == normName && s.Id != id))
                {
                    return StatusCode(409, ApiResponse<bool>.Failure("Tên nhà cung cấp đã tồn tại.", "SUPPLIER_NAME_ALREADY_EXISTS"));
                }

                // Check duplicate TaxCode (excluding current)
                if (!string.IsNullOrEmpty(normTaxCode) && await _context.Suppliers.AnyAsync(s => s.TaxCode == normTaxCode && s.Id != id))
                {
                    return StatusCode(409, ApiResponse<bool>.Failure("Mã số thuế đã được sử dụng.", "SUPPLIER_TAX_CODE_ALREADY_EXISTS"));
                }

                // Check duplicate Phone (excluding current)
                if (!string.IsNullOrEmpty(normPhone) && await _context.Suppliers.AnyAsync(s => s.Phone == normPhone && s.Id != id))
                {
                    return StatusCode(409, ApiResponse<bool>.Failure("Số điện thoại đã được sử dụng bởi nhà cung cấp khác.", "SUPPLIER_PHONE_ALREADY_EXISTS"));
                }

                // Check duplicate Email (excluding current)
                if (!string.IsNullOrEmpty(normEmail) && await _context.Suppliers.AnyAsync(s => s.Email == normEmail && s.Id != id))
                {
                    return StatusCode(409, ApiResponse<bool>.Failure("Email đã được sử dụng bởi nhà cung cấp khác.", "SUPPLIER_EMAIL_ALREADY_EXISTS"));
                }

                supplier.Name = normDisplayName;
                supplier.NormalizedName = normName;
                supplier.ContactPerson = StringNormalizationHelper.NormalizeDisplayName(request.ContactPerson);
                supplier.Phone = normPhone;
                supplier.Email = normEmail;
                supplier.TaxCode = normTaxCode;
                supplier.Address = (request.Address ?? string.Empty).Trim();

                _supplierRepository.Update(supplier);
                await _unitOfWork.SaveChangesAsync();

                int.TryParse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var adminId);
                var adminName = User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "SUPPLIER_UPDATED", "Supplier", supplier.Id.ToString(), $"Cập nhật nhà cung cấp: {supplier.Name} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Cập nhật thành công"));
            }
            catch (DbUpdateException dbEx)
            {
                return StatusCode(409, ApiResponse<bool>.Failure($"Xung đột dữ liệu nhà cung cấp: {dbEx.InnerException?.Message ?? dbEx.Message}", "SUPPLIER_CONFLICT"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}", "ERR_UPDATE_SUPPLIER"));
            }
        }

        [HttpPut("{id}/deactivate")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> DeactivateSupplier(int id, [FromBody] DeactivateRequestDto? request)
        {
            try
            {
                var supplier = await _supplierRepository.GetByIdAsync(id);
                if (supplier == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy nhà cung cấp", "ERR_NOT_FOUND"));

                if (string.IsNullOrWhiteSpace(request?.Reason))
                    return BadRequest(ApiResponse<bool>.Failure("Vui lòng nhập lý do ngừng sử dụng.", "REASON_REQUIRED"));

                int.TryParse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var adminId);
                var adminName = User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";

                supplier.IsActive = false;
                supplier.DeactivatedAt = DateTime.UtcNow;
                supplier.DeactivatedByUserId = adminId;
                supplier.DeactivationReason = request.Reason.Trim();

                _supplierRepository.Update(supplier);
                await _unitOfWork.SaveChangesAsync();

                await _auditLogService.LogActionAsync(adminId, adminName, "SUPPLIER_DEACTIVATED", "Supplier", supplier.Id.ToString(), $"Ngừng sử dụng nhà cung cấp: {supplier.Name}. Lý do: {supplier.DeactivationReason}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Đã ngừng sử dụng nhà cung cấp"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPut("{id}/reactivate")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> ReactivateSupplier(int id)
        {
            try
            {
                var supplier = await _supplierRepository.GetByIdAsync(id);
                if (supplier == null)
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy nhà cung cấp", "ERR_NOT_FOUND"));

                // Conflict checks on reactivate
                var nameExists = await _context.Suppliers.AnyAsync(s => s.NormalizedName == supplier.NormalizedName && s.Id != id);
                if (nameExists)
                {
                    return StatusCode(409, ApiResponse<bool>.Failure("Không thể kích hoạt lại: Tên nhà cung cấp đã bị trùng với nhà cung cấp khác.", "SUPPLIER_NAME_ALREADY_EXISTS"));
                }

                if (!string.IsNullOrEmpty(supplier.TaxCode) && await _context.Suppliers.AnyAsync(s => s.TaxCode == supplier.TaxCode && s.Id != id))
                {
                    return StatusCode(409, ApiResponse<bool>.Failure("Không thể kích hoạt lại: Mã số thuế đã bị trùng với nhà cung cấp khác.", "SUPPLIER_TAX_CODE_ALREADY_EXISTS"));
                }

                int.TryParse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var adminId);
                var adminName = User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";

                supplier.IsActive = true;
                supplier.DeactivatedAt = null;
                supplier.DeactivatedByUserId = null;
                supplier.DeactivationReason = null;

                _supplierRepository.Update(supplier);
                await _unitOfWork.SaveChangesAsync();

                await _auditLogService.LogActionAsync(adminId, adminName, "SUPPLIER_UPDATED", "Supplier", supplier.Id.ToString(), $"Kích hoạt lại nhà cung cấp: {supplier.Name} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Kích hoạt lại nhà cung cấp thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> DeleteSupplier(int id)
        {
            try
            {
                var supplier = await _supplierRepository.GetByIdAsync(id);
                if (supplier == null)
                {
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy nhà cung cấp", "ERR_NOT_FOUND"));
                }

                var allReceipts = await _goodsReceiptRepository.GetAllAsync();
                if (allReceipts.Any(r => r.SupplierId == id))
                {
                    return StatusCode(409, ApiResponse<bool>.Failure("Không thể xóa nhà cung cấp vì đã phát sinh phiếu nhập kho. Vui lòng sử dụng tính năng Ngừng sử dụng.", "ERR_SUPPLIER_IN_USE"));
                }

                var allProducts = await _productRepository.GetAllAsync();
                if (allProducts.Any(p => p.SupplierId == id))
                {
                    return StatusCode(409, ApiResponse<bool>.Failure("Không thể xóa nhà cung cấp đang được gán cho sản phẩm. Vui lòng chuyển sản phẩm sang nhà cung cấp khác hoặc sử dụng tính năng Ngừng sử dụng.", "ERR_SUPPLIER_IN_USE"));
                }

                _supplierRepository.Delete(supplier);
                await _unitOfWork.SaveChangesAsync();

                int.TryParse(User?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var adminId);
                var adminName = User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
                await _auditLogService.LogActionAsync(adminId, adminName, "SUPPLIER_DEACTIVATED", "Supplier", id.ToString(), $"Xóa nhà cung cấp: {supplier.Name} bởi {adminName}", "SUCCESS");

                return Ok(ApiResponse<bool>.Success(true, "Xóa nhà cung cấp thành công"));
            }
            catch (DbUpdateException)
            {
                return StatusCode(409, ApiResponse<bool>.Failure("Không thể xóa nhà cung cấp vì có chứng từ hoặc sản phẩm liên kết.", "ERR_CONFLICT"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}", "ERR_DELETE_SUPPLIER"));
            }
        }
    }
}
