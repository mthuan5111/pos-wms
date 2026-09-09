using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using POS_WMS.WebApi.Common;
using System;
using System.Text.Json;
using System.Threading.Tasks;
using POS_WMS.Application.Interfaces;
using Microsoft.Extensions.DependencyInjection;

namespace POS_WMS.WebApi.Middlewares
{
    public class GlobalExceptionMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<GlobalExceptionMiddleware> _logger;

        public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var correlationId = context.Request.Headers["X-Correlation-ID"].ToString();
            if (string.IsNullOrEmpty(correlationId) || correlationId.Length > 100)
            {
                correlationId = Guid.NewGuid().ToString();
            }

            context.Response.Headers.Append("X-Correlation-ID", correlationId);

            using (_logger.BeginScope(new { CorrelationId = correlationId }))
            {
                try
                {
                    await _next(context);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Đã xảy ra lỗi hệ thống: {Message}", ex.Message);
                    await HandleExceptionAsync(context, ex, correlationId);
                }
            }
        }

        private async Task HandleExceptionAsync(HttpContext context, Exception exception, string correlationId)
        {
            if (context.Response.HasStarted)
            {
                _logger.LogWarning("Response đã bắt đầu, không thể ghi đè bằng lỗi.");
                return;
            }

            // Ghi AuditLog thông qua IServiceScopeFactory để lấy IAuditLogService
            try
            {
                var auditLogService = context.RequestServices.GetRequiredService<IAuditLogService>();
                
                // Xác định UserId nếu đã đăng nhập
                int? userId = null;
                var userIdClaim = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
                if (userIdClaim != null && int.TryParse(userIdClaim.Value, out int id))
                {
                    userId = id;
                }

                await auditLogService.LogActionAsync(
                    userId ?? 0,
                    userId.HasValue ? context.User.Identity?.Name ?? "Unknown" : "System",
                    "SYSTEM_ERROR",
                    "Exception",
                    null,
                    "Lỗi hệ thống không xử lý được",
                    "FAILED",
                    correlationId
                );
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi ghi AuditLog trong GlobalExceptionMiddleware");
            }

            context.Response.ContentType = "application/json";
            context.Response.StatusCode = 500;

            var response = ApiResponse<object>.Failure($"Đã xảy ra lỗi máy chủ. Vui lòng liên hệ quản trị viên. CorrelationId: {correlationId}");

            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            var json = JsonSerializer.Serialize(response, options);

            await context.Response.WriteAsync(json);
        }
    }
}
