using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.WebApi.Common;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin,Manager,WarehouseStaff")]
    public class StockMovementsController : ControllerBase
    {
        private readonly IStockMovementService _stockMovementService;

        public StockMovementsController(IStockMovementService stockMovementService)
        {
            _stockMovementService = stockMovementService;
        }

        [HttpGet]
        public async Task<IActionResult> GetMovements(
            [FromQuery] int? productId,
            [FromQuery] string? type,
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50)
        {
            try
            {
                var movements = await _stockMovementService.GetMovementsAsync(productId, type, startDate, endDate, page, pageSize);
                return Ok(ApiResponse<List<StockMovementDto>>.Success(movements));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<StockMovementDto>>.Failure($"Lỗi: {ex.Message}"));
            }
        }
    }
}
