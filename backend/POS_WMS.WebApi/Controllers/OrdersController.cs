using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.WebApi.Common;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin,Manager,Cashier,DemoUser")]
    public class OrdersController : ControllerBase
    {
        private readonly IOrderService _orderService;

        public OrdersController(IOrderService orderService)
        {
            _orderService = orderService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllOrders([FromQuery] int? userId = null)
        {
            try
            {
                var orders = await _orderService.GetAllOrdersAsync();
                var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
                var currentUserIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                int.TryParse(currentUserIdClaim, out var currentUserId);

                if (string.Equals(userRole, "Cashier", StringComparison.OrdinalIgnoreCase))
                {
                    orders = orders.Where(o => o.UserId == currentUserId).ToList();
                }
                else if (userId.HasValue && userId.Value > 0)
                {
                    orders = orders.Where(o => o.UserId == userId.Value).ToList();
                }

                return Ok(ApiResponse<List<OrderDto>>.Success(orders));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<OrderDto>>.Failure($"Lỗi trích xuất lịch sử bán hàng: {ex.Message}"));
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetOrderById(int id)
        {
            try
            {
                var order = await _orderService.GetOrderByIdAsync(id);
                return Ok(ApiResponse<OrderDto>.Success(order));
            }
            catch (KeyNotFoundException)
            {
                return NotFound(ApiResponse<OrderDto>.Failure("Không tìm thấy hóa đơn", "ERR_NOT_FOUND"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<OrderDto>.Failure($"Lỗi: {ex.Message}", "ERR_GET_ORDER"));
            }
        }

        [HttpPost("sync")]
        [Authorize(Roles = "Admin,Manager,Cashier")]
        public async Task<IActionResult> SyncOfflineOrder([FromBody] OrderSyncRequestDto request)
        {
            try
            {
                var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                int callerUserId = int.TryParse(userIdClaim, out var claimUserId) ? claimUserId : 0;
                var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "Cashier";

                // Cashier must use their own authenticated Identity
                if (string.Equals(userRole, "Cashier", StringComparison.OrdinalIgnoreCase) || request.UserId <= 0)
                {
                    request.UserId = callerUserId;
                }

                var orderId = await _orderService.SyncOfflineOrderAsync(request);

                if (orderId == 0)
                {
                    return Ok(ApiResponse<string>.Success("Hóa đơn này đã được đồng bộ trước đó"));
                }

                return Ok(ApiResponse<int>.Success(orderId, "Đồng bộ hóa đơn và trừ kho thành công"));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ApiResponse<string>.Failure(ex.Message));
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, ApiResponse<string>.Failure(ex.Message, "SHIFT_ACCESS_DENIED"));
            }
            catch (InvalidOperationException ex)
            {
                if (ex.Message.StartsWith("SHIFT_NOT_OPEN:"))
                {
                    return StatusCode(409, ApiResponse<string>.Failure("Bạn cần mở ca trước khi thực hiện giao dịch bán hàng.", "SHIFT_NOT_OPEN"));
                }
                if (ex.Message.StartsWith("SHIFT_ALREADY_CLOSED:"))
                {
                    return StatusCode(409, ApiResponse<string>.Failure("Ca làm việc đã kết thúc và không thể phát sinh thêm giao dịch.", "SHIFT_ALREADY_CLOSED"));
                }
                if (ex.Message.StartsWith("SHIFT_NOT_FOUND:"))
                {
                    return StatusCode(404, ApiResponse<string>.Failure("Ca làm việc không tồn tại trên hệ thống.", "SHIFT_NOT_FOUND"));
                }
                return BadRequest(ApiResponse<string>.Failure(ex.Message));
            }
            catch (Exception ex)
            {
                var msg = ex.InnerException != null ? $"{ex.Message} --> {ex.InnerException.Message}" : ex.Message;
                return StatusCode(500, ApiResponse<string>.Failure($"Đồng bộ thất bại: {msg}"));
            }
        }
    }
}