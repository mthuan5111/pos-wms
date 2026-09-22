using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.WebApi.Common;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ShiftsController : ControllerBase
    {
        private readonly IShiftService _shiftService;

        public ShiftsController(IShiftService shiftService)
        {
            _shiftService = shiftService;
        }

        private int GetUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(claim, out var id) ? id : 0;
        }

        private string GetUserRole()
        {
            return User.FindFirst(ClaimTypes.Role)?.Value ?? "Cashier";
        }

        [HttpGet("current")]
        public async Task<IActionResult> GetCurrentShift()
        {
            var userId = GetUserId();
            var shift = await _shiftService.GetCurrentShiftAsync(userId);
            return Ok(ApiResponse<ShiftDto?>.Success(shift, "Lấy thông tin ca hiện tại thành công"));
        }

        [HttpPost("open")]
        public async Task<IActionResult> OpenShift([FromBody] OpenShiftRequestDto request)
        {
            var userId = GetUserId();
            var role = GetUserRole();
            var shift = await _shiftService.OpenShiftAsync(userId, role, request);
            return Ok(ApiResponse<ShiftDto>.Success(shift, "Mở ca làm việc thành công"));
        }

        [HttpGet("{id}/preview")]
        public async Task<IActionResult> GetShiftPreview(int id)
        {
            try
            {
                var userId = GetUserId();
                var report = await _shiftService.GetShiftPreviewAsync(id, userId);
                return Ok(ApiResponse<ShiftReportDto>.Success(report, "Lấy bản xem trước báo cáo ca thành công"));
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(ApiResponse<ShiftReportDto>.Failure(ex.Message, "SHIFT_NOT_FOUND"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<ShiftReportDto>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpPost("{id}/end")]
        public async Task<IActionResult> EndShift(int id, [FromBody] EndShiftRequestDto request)
        {
            try
            {
                var userId = GetUserId();
                var report = await _shiftService.EndShiftAsync(id, userId, request);
                return Ok(ApiResponse<ShiftReportDto>.Success(report, "Đã kết thúc ca làm việc."));
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(ApiResponse<ShiftReportDto>.Failure(ex.Message, "SHIFT_NOT_FOUND"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<ShiftReportDto>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("{id}/report")]
        public async Task<IActionResult> GetShiftReport(int id)
        {
            try
            {
                var userId = GetUserId();
                var role = GetUserRole();
                var report = await _shiftService.GetShiftReportAsync(id, userId, role);
                if (report == null)
                    return NotFound(ApiResponse<ShiftReportDto>.Failure("Không tìm thấy ca làm việc", "SHIFT_NOT_FOUND"));

                return Ok(ApiResponse<ShiftReportDto>.Success(report, "Lấy báo cáo ca thành công"));
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, ApiResponse<ShiftReportDto>.Failure(ex.Message, "FORBIDDEN"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<ShiftReportDto>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("history")]
        public async Task<IActionResult> GetShiftHistory([FromQuery] int? userId = null, [FromQuery] string? role = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            var callerUserId = GetUserId();
            var callerRole = GetUserRole();

            // Cashier/WarehouseStaff can only view own history
            if (!callerRole.Equals("Admin", StringComparison.OrdinalIgnoreCase) && !callerRole.Equals("Manager", StringComparison.OrdinalIgnoreCase))
            {
                userId = callerUserId;
            }

            var history = await _shiftService.GetShiftHistoryAsync(userId, role, page, pageSize);
            return Ok(ApiResponse<System.Collections.Generic.List<ShiftDto>>.Success(history, "Lấy lịch sử ca thành công"));
        }
    }
}
