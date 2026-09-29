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
        private readonly IInventoryService _inventoryService;

        public InventoriesController(IInventoryService inventoryService)
        {
            _inventoryService = inventoryService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var dtos = await _inventoryService.GetAllInventoriesAsync();
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
                await _inventoryService.AdjustStockAsync(id, request);
                return Ok(ApiResponse<bool>.Success(true, "Điều chỉnh số lượng tồn kho thành công"));
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(ApiResponse<bool>.Failure(ex.Message));
            }
            catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException)
            {
                return Conflict(ApiResponse<bool>.Failure("Không thể đồng bộ dữ liệu. Dữ liệu trên hệ thống đã được cập nhật từ thiết bị khác. Vui lòng tải lại trước khi tiếp tục.", "DATA_CONCURRENT_UPDATE"));
            }
            catch (Exception)
            {
                return StatusCode(500, ApiResponse<bool>.Failure("Hệ thống gặp sự cố khi điều chỉnh tồn kho. Vui lòng thử lại sau."));
            }
        }

        [HttpPost("adjust")]
        [Authorize(Roles = "Admin,Manager,WarehouseStaff")]
        public async Task<IActionResult> SyncAdjustment([FromBody] StockAdjustmentSyncDto request)
        {
            try
            {
                await _inventoryService.SyncAdjustmentAsync(request);
                return Ok(ApiResponse<bool>.Success(true, "Đồng bộ điều chỉnh tồn kho thành công"));
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(ApiResponse<bool>.Failure(ex.Message));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ApiResponse<bool>.Failure(ex.Message));
            }
            catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException)
            {
                return Conflict(ApiResponse<bool>.Failure("Không thể đồng bộ dữ liệu. Dữ liệu trên hệ thống đã được cập nhật từ thiết bị khác. Vui lòng tải lại trước khi tiếp tục.", "DATA_CONCURRENT_UPDATE"));
            }
            catch (Exception)
            {
                return StatusCode(500, ApiResponse<bool>.Failure("Hệ thống gặp sự cố khi đồng bộ điều chỉnh tồn kho. Vui lòng thử lại sau."));
            }
        }
    }
}
