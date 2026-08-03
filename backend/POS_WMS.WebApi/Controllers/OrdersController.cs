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
        private readonly IGenericRepository<Order> _orderRepository;
        private readonly IGenericRepository<OrderDetail> _orderDetailRepository;
        private readonly IGenericRepository<Inventory> _inventoryRepository;
        private readonly IGenericRepository<Product> _productRepository;
        private readonly IGenericRepository<User> _userRepository;
        private readonly IUnitOfWork _unitOfWork;

        public OrdersController(IGenericRepository<Order> orderRepository, IGenericRepository<OrderDetail> orderDetailRepository, IGenericRepository<Inventory> inventoryRepository, IGenericRepository<Product> productRepository, IGenericRepository<User> userRepository, IUnitOfWork unitOfWork)
        {
            _orderRepository = orderRepository;
            _orderDetailRepository = orderDetailRepository;
            _inventoryRepository = inventoryRepository;
            _productRepository = productRepository;
            _userRepository = userRepository;
            _unitOfWork = unitOfWork;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllOrders()
        {
            try
            {
                var orders = await _orderRepository.GetAllAsync();
                var orderDetails = await _orderDetailRepository.GetAllAsync();
                var products = await _productRepository.GetAllAsync();
                var users = await _userRepository.GetAllAsync();
                var orderDtos = new List<OrderDto>();
                foreach (var order in orders)
                {
                    var detailsForThisOrder = orderDetails.Where(d => d.OrderId == order.Id).ToList();
                    var detailDtos = new List<OrderDetailDto>();

                    foreach (var detail in detailsForThisOrder)
                    {
                        var product = products.FirstOrDefault(p => p.Id == detail.ProductId);
                        detailDtos.Add(new OrderDetailDto
                        {
                            Id = detail.Id,
                            ProductId = detail.ProductId,
                            ProductName = product != null ? product.Name : "Sản phẩm đã bị xóa hoặc không tồn tại",
                            Quantity = detail.Quantity,
                            UnitPrice = detail.UnitPrice
                        });
                    }

                    var user = users.FirstOrDefault(u => u.Id == order.UserId);

                    orderDtos.Add(new OrderDto
                    {
                        Id = order.Id,
                        UserId = order.UserId,
                        UserName = user != null ? user.Username : "Nhân viên không xác định",
                        CustomerId = order.CustomerId,
                        TotalAmount = order.TotalAmount,
                        OrderDate = order.OrderDate,
                        Status = order.Status,
                        OfflineReferenceId = order.OfflineReferenceId ?? string.Empty,
                        Details = detailDtos
                    });
                }
                return Ok(ApiResponse<List<OrderDto>>.Success(orderDtos));
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
                var order = await _orderRepository.GetByIdAsync(id);
                if (order == null)
                    return NotFound(ApiResponse<OrderDto>.Failure("Không tìm thấy hóa đơn", "ERR_NOT_FOUND"));

                var allDetails = await _orderDetailRepository.GetAllAsync();
                var specificDetails = allDetails.Where(d => d.OrderId == order.Id);
                var products = await _productRepository.GetAllAsync();
                var detailDtos = new List<OrderDetailDto>();
                foreach (var detail in specificDetails)
                {
                    var product = products.FirstOrDefault(p => p.Id == detail.ProductId);
                    detailDtos.Add(new OrderDetailDto
                    {
                        Id = detail.Id,
                        ProductId = detail.ProductId,
                        ProductName = product != null ? product.Name : "Sản phẩm đã bị xóa hoặc không tồn tại",
                        Quantity = detail.Quantity,
                        UnitPrice = detail.UnitPrice
                    });
                }
                var user = await _userRepository.GetByIdAsync(order.UserId);
                var orderDto = new OrderDto
                {
                    Id = order.Id,
                    UserId = order.UserId,
                    UserName = user != null ? user.Username : "Nhân viên không xác định",
                    CustomerId = order.CustomerId,
                    TotalAmount = order.TotalAmount,
                    OrderDate = order.OrderDate,
                    Status = order.Status,
                    OfflineReferenceId = order.OfflineReferenceId ?? string.Empty,
                    Details = detailDtos
                };
                return Ok(ApiResponse<OrderDto>.Success(orderDto));
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
                if (string.IsNullOrEmpty(request.OfflineReferenceId))
                    return BadRequest(ApiResponse<string>.Failure("Thiếu mã OfflineReference"));
                var existingOrders = await _orderRepository.GetAllAsync();
                bool isAlreadySynced = existingOrders.Any(o => o.OfflineReferenceId == request.OfflineReferenceId);

                if (isAlreadySynced)
                {
                    return Ok(ApiResponse<string>.Success("Hóa đơn này đã được đồng bộ trước đó"));
                }

                var allInventories = await _inventoryRepository.GetAllAsync();

                var newOrder = new Order
                {
                    UserId = request.UserId,
                    CustomerId = request.CustomerId,
                    TotalAmount = request.TotalAmount,
                    OrderDate = request.OrderDate,
                    Status = request.Status,
                    OfflineReferenceId = request.OfflineReferenceId
                };

                await _orderRepository.AddAsync(newOrder);
                await _unitOfWork.SaveChangesAsync();

                foreach (var detailDto in request.Details)
                {
                    var newDetail = new OrderDetail
                    {
                        OrderId = newOrder.Id,
                        ProductId = detailDto.ProductId,
                        Quantity = detailDto.Quantity,
                        UnitPrice = detailDto.UnitPrice
                    };
                    await _orderDetailRepository.AddAsync(newDetail);
                    var inventoryItem = allInventories.FirstOrDefault(i => i.ProductId == detailDto.ProductId);
                    if (inventoryItem == null)
                    {
                        throw new Exception($"Sản phẩm có ID {detailDto.ProductId} không tồn tại trong kho.");
                    }
                    if (inventoryItem.StockQuantity < detailDto.Quantity)
                    {
                        throw new Exception($"Không đủ hàng trong kho cho sản phẩm ID {detailDto.ProductId}. Tồn: {inventoryItem.StockQuantity}, Cần: {detailDto.Quantity}");
                    }

                    inventoryItem.StockQuantity -= detailDto.Quantity;
                    _inventoryRepository.Update(inventoryItem);
                }
                await _unitOfWork.SaveChangesAsync();
                return Ok(ApiResponse<int>.Success(newOrder.Id, "Đồng bộ hóa đơn và trừ kho thành công"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<string>.Failure($"Đồng bộ thất bại: {ex.Message}"));
            }
        }

    }
}