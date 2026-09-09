using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using POS_WMS.Application.Interfaces;
using POS_WMS.WebApi.Common;
using System;
using System.Threading.Tasks;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin,Manager")]
    public class ReportsController : ControllerBase
    {
        private readonly IReportService _reportService;

        public ReportsController(IReportService reportService)
        {
            _reportService = reportService;
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary([FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate)
        {
            try
            {
                var result = await _reportService.GetDashboardSummaryAsync(startDate, endDate);
                return Ok(ApiResponse<object>.Success(result));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<object>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("top-products")]
        public async Task<IActionResult> GetTopProducts([FromQuery] int limit = 5, [FromQuery] DateTime? startDate = null, [FromQuery] DateTime? endDate = null)
        {
            try
            {
                var result = await _reportService.GetTopSellingProductsAsync(limit, startDate, endDate);
                return Ok(ApiResponse<object>.Success(result));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<object>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("revenue-chart")]
        public async Task<IActionResult> GetRevenueChart([FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
        {
            try
            {
                var result = await _reportService.GetRevenueChartDataAsync(startDate, endDate);
                return Ok(ApiResponse<object>.Success(result));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<object>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("revenue-chart-comparison")]
        public async Task<IActionResult> GetRevenueChartComparison(
            [FromQuery] DateTime currentStart, [FromQuery] DateTime currentEnd,
            [FromQuery] DateTime previousStart, [FromQuery] DateTime previousEnd)
        {
            try
            {
                var result = await _reportService.GetRevenueChartComparisonAsync(currentStart, currentEnd, previousStart, previousEnd);
                return Ok(ApiResponse<object>.Success(result));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<object>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("purchase-summary")]
        public async Task<IActionResult> GetPurchaseSummary([FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate)
        {
            try
            {
                var result = await _reportService.GetPurchaseSummaryAsync(startDate, endDate);
                return Ok(ApiResponse<decimal>.Success(result));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<decimal>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("low-stock")]
        public async Task<IActionResult> GetLowStock([FromQuery] int threshold = 10)
        {
            try
            {
                var result = await _reportService.GetLowStockProductsAsync(threshold);
                return Ok(ApiResponse<object>.Success(result));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<object>.Failure($"Lỗi: {ex.Message}"));
            }
        }
    }
}
