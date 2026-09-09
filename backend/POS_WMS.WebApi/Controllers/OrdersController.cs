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
    [Authorize(Roles = "Admin,Manager,Cashier")]
    public class OrdersController : ControllerBase
    {
        private readonly IOrderService _orderService;

        public OrdersController(IOrderService orderService)
        {
            _orderService = orderService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllOrders()
        {
            try
            {
                var orders = await _orderService.GetAllOrdersAsync();
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
        public async Task<IActionResult> SyncOfflineOrder([FromBody] OrderSyncRequestDto request)
        {
            try
            {
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
            catch (InvalidOperationException ex)
            {
                return BadRequest(ApiResponse<string>.Failure(ex.Message));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<string>.Failure($"Đồng bộ thất bại: {ex.Message}"));
            }
        }
    }
}