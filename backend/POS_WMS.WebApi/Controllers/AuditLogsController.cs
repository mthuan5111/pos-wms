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
    [Authorize(Roles = "Admin")]
    public class AuditLogsController : ControllerBase
    {
        private readonly IAuditLogService _auditLogService;

        public AuditLogsController(IAuditLogService auditLogService)
        {
            _auditLogService = auditLogService;
        }

        [HttpGet]
        public async Task<IActionResult> GetLogs(
            [FromQuery] int? userId,
            [FromQuery] string? action,
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50)
        {
            try
            {
                pageSize = Math.Min(pageSize, 50);
                var logs = await _auditLogService.GetLogsAsync(userId, action, startDate, endDate, page, pageSize);
                var totalCount = await _auditLogService.GetTotalCountAsync(userId, action, startDate, endDate);

                var result = new
                {
                    Data = logs,
                    TotalCount = totalCount,
                    Page = page,
                    PageSize = pageSize,
                    TotalPages = (int)Math.Ceiling((double)totalCount / pageSize)
                };

                return Ok(ApiResponse<object>.Success(result));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<object>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("by-user/{userId}")]
        public async Task<IActionResult> GetLogsByUser(int userId, [FromQuery] int limit = 50)
        {
            try
            {
                var logs = await _auditLogService.GetLogsByUserAsync(userId, limit);
                return Ok(ApiResponse<List<AuditLogDto>>.Success(logs));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<AuditLogDto>>.Failure($"Lỗi: {ex.Message}"));
            }
        }
    }
}
