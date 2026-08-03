using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.WebApi.Common;
using CloudinaryDotNet.Actions;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin,Manager,Cashier")]
    public class CustomerController : ControllerBase
    {
        private readonly IGenericRepository<Customer> _customerRepository;
        private readonly IUnitOfWork _unitOfWork;

        public CustomerController(IGenericRepository<Customer> customerRepository, IUnitOfWork unitOfWork)
        {
            _customerRepository = customerRepository;
            _unitOfWork = unitOfWork;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllCustomers()
        {
            try
            {
                var customers = await _customerRepository.GetAllAsync();
                var dtos = new List<CustomerDto>();

                foreach (var c in customers)
                {
                    dtos.Add(new CustomerDto
                    {
                        Id = c.Id,
                        Name = c.Name,
                        Phone = c.Phone,
                        Address = c.Address

                    });
                }
                return Ok(ApiResponse<List<CustomerDto>>.Success(dtos));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<CustomerDto>>.Failure($"Lỗi: {ex.Message}"));
            }
        }
        [HttpGet("{id}")]
        public async Task<IActionResult> GetCustomerById(int id)
        {
            try
            {
                var customer = await _customerRepository.GetByIdAsync(id);
                if (customer == null)
                {
                    return NotFound(ApiResponse<CustomerDto>.Failure("Không tìm thấy khách hàng", "ERR_NOT_FOUND"));
                }
                var dto = new CustomerDto
                {
                    Id = customer.Id,
                    Name = customer.Name,
                    Phone = customer.Phone,
                    Address = customer.Address
                };
                return Ok(ApiResponse<CustomerDto>.Success(dto));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<CustomerDto>.Failure($"Lỗi: {ex.Message}", "ERR_GET_CUSTOMER"));
            }
        }

        [HttpPost]
        public async Task<IActionResult> CreateCustomer([FromBody] CustomerRequestDto request)
        {
            try
            {
                var customer = new Customer
                {
                    Name = request.Name,
                    Phone = request.Phone,
                    Address = request.Address
                };
                await _customerRepository.AddAsync(customer);
                await _unitOfWork.SaveChangesAsync();

                return Ok(ApiResponse<int>.Success(customer.Id, "Thêm khách hàng thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<int>.Failure($"Lỗi: {ex.Message}", "ERR_CREATE_CUSTOMER"));
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateCustomer(int id, [FromBody] CustomerRequestDto request)
        {
            try
            {
                var customer = await _customerRepository.GetByIdAsync(id);
                if (customer == null)
                {
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy khách hàng", "ERR_NOT_FOUND"));
                }

                customer.Name = request.Name;
                customer.Phone = request.Phone;
                customer.Address = request.Address;

                _customerRepository.Update(customer);
                await _unitOfWork.SaveChangesAsync();
                return Ok(ApiResponse<bool>.Success(true, "Cập nhật thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}", "ERR_UPDATE_CUSTOMER"));
            }
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> DeleteCustomer(int id)
        {
            try
            {
                var customer = await _customerRepository.GetByIdAsync(id);
                if (customer == null)
                {
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy khách hàng", "ERR_NOT_FOUND"));
                }
                _customerRepository.Delete(customer);
                await _unitOfWork.SaveChangesAsync();
                return Ok(ApiResponse<bool>.Success(true, "Xóa khách hàng thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi: {ex.Message}", "ERR_DELETE_CUSTOMER"));
            }
        }
    }
}