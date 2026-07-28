using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.WebApi.Common;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class InventoriesController : ControllerBase
    {
        private readonly IGenericRepository<Inventory> _inventoryRepository;
        private readonly IGenericRepository<Product> _productRepository;
        private readonly IUnitOfWork _unitOfWork;

        public InventoriesController(IGenericRepository<Inventory> inventoryRepository, IGenericRepository<Product> productRepository, IUnitOfWork unitOfWork)
        {
            _inventoryRepository = inventoryRepository;
            _productRepository = productRepository;
            _unitOfWork = unitOfWork;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var inventories = await _inventoryRepository.GetAllAsync();
                var products = await _productRepository.GetAllAsync();

                var dtos = new List<InventoryDto>();
                foreach (var inv in inventories)
                {
                    var product = products.FirstOrDefault(p => p.Id == inv.ProductId);

                    dtos.Add(new InventoryDto
                    {
                        Id = inv.Id,
                        ProductId = inv.ProductId,
                        ProductName = products != null ? product.Name : "Sản phẩm không xác định",
                        StockQuantity = inv.StockQuantity,
                        RowVersion = Convert.ToBase64String(inv.RowVersion)
                    });
                }
                return Ok(ApiResponse<List<InventoryDto>>.Success(dtos));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<InventoryDto>>.Failure($"Lỗi: {ex.Message}"));
            }
        }
        [HttpPut("{id}")]
        [Authorize(Roles = "Admin,Manager,WarehouseStaff")]
        public async Task<IActionResult> AdjustStock(int id, [FromBody] InventoryUpdateRequestDto request)
        {
            try
            {
                var inventory = await _inventoryRepository.GetByIdAsync(id);
                if (inventory == null)
                {
                    return NotFound(ApiResponse<bool>.Failure("Không tìm thấy thông tin tồn kho"));
                }
                byte[] clientRowVersion = Convert.FromBase64String(request.RowVersion);

                if (!inventory.RowVersion.SequenceEqual(clientRowVersion))
                {
                    return BadRequest(ApiResponse<bool>.Failure("Cảnh báo: Số lượng tồn kho đã bị thay đổi bởi một nhân viên khác! Vui lòng làm mới trang và thử lại"));
                }
                inventory.StockQuantity = request.StockQuantity;
                _inventoryRepository.Update(inventory);
                await _unitOfWork.SaveChangesAsync();

                return Ok(ApiResponse<bool>.Success(true, "Điều chỉnh số lượng tồn kho thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<bool>.Failure($"Lỗi hệ thống: {ex.Message}"));
            }
        }
    };
}