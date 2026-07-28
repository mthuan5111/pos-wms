using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.WebApi.Common;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("/[controller]")]
    [Authorize(Roles = "Admin,Manager,WarehouseStaff")]
    public class SuppliersController : ControllerBase
    {
        private readonly IGenericRepository<Supplier> _supplierRepository;
        private readonly IUnitOfWork _unitOfWork;

        public SuppliersController(IGenericRepository<Supplier> supplierRepository, IUnitOfWork unitOfWork)
        {
            _supplierRepository = supplierRepository;
            _unitOfWork = unitOfWork;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllSuppliers()
        {
            try
            {
                var suppliers = await _supplierRepository.GetAllAsync();
                var dtos = new List<SupplierDto>();

                foreach (var s in suppliers)
                {
                    dtos.Add(new SupplierDto
                    {
                        Id = s.Id,
                        Name = s.Name,
                        ContactPerson = s.ContactPerson,
                        Phone = s.Phone,
                        Address = s.Address

                    });
                }
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
                    Address = supplier.Address
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
                var supplier = new Supplier
                {
                    Name = request.Name,
                    ContactPerson = request.ContactPerson,
                    Phone = request.Phone,
                    Address = request.Address
                };
                await _supplierRepository.AddAsync(supplier);
                await _unitOfWork.SaveChangesAsync();

                return Ok(ApiResponse<int>.Success(supplier.Id, "Thêm nhà cung cấp thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<int>.Failure($"Lỗi: {ex.Message}", "ERR_CREATE_SUPPLIER"));
            }
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Updatesupplier(int id, [FromBody] SupplierRequestDto request)
        {
            try
            {
                var supplier = await _supplierRepository.GetByIdAsync(id);
                if (supplier == null)
                {
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy nhà cung cấp", "ERR_NOT_FOUND"));
                }
                supplier.Name = request.Name;
                supplier.ContactPerson = request.ContactPerson;
                supplier.Phone = request.Phone;
                supplier.Address = request.Address;
                _supplierRepository.Update(supplier);
                await _unitOfWork.SaveChangesAsync();
                return Ok(ApiResponse<bool>.Success(true, "Cập nhật thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}", "ERR_UPDATE_SUPPLIER"));
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
                _supplierRepository.Delete(supplier);
                await _unitOfWork.SaveChangesAsync();
                return Ok(ApiResponse<bool>.Success(true, "Xóa nhà cung cấp thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}", "ERR_DELETE_SUPPLIER"));
            }
        }
    }
}