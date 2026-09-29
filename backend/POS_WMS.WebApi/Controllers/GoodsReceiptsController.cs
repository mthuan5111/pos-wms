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
    [Authorize(Roles = "Admin,Manager,WarehouseStaff,DemoUser")]
    public class GoodsReceiptsController : ControllerBase
    {
        private readonly IGoodsReceiptService _goodsReceiptService;

        public GoodsReceiptsController(IGoodsReceiptService goodsReceiptService)
        {
            _goodsReceiptService = goodsReceiptService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] int? userId = null)
        {
            try
            {
                var receipts = await _goodsReceiptService.GetAllAsync();
                var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
                var currentUserIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                int.TryParse(currentUserIdClaim, out var currentUserId);

                if (string.Equals(userRole, "WarehouseStaff", StringComparison.OrdinalIgnoreCase))
                {
                    receipts = receipts.Where(r => r.UserId == currentUserId).ToList();
                }
                else if (userId.HasValue && userId.Value > 0)
                {
                    receipts = receipts.Where(r => r.UserId == userId.Value).ToList();
                }

                bool canViewFinancials = User.IsInRole("Admin") || User.IsInRole("Manager");
                if (!canViewFinancials)
                {
                    foreach (var r in receipts)
                    {
                        r.TotalAmount = null;
                        if (r.Details != null)
                        {
                            foreach (var d in r.Details)
                            {
                                d.CostPrice = null;
                            }
                        }
                    }
                }

                return Ok(ApiResponse<List<GoodsReceiptDto>>.Success(receipts));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<List<GoodsReceiptDto>>.Failure($"Lỗi: {ex.Message}"));
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            try
            {
                var receipt = await _goodsReceiptService.GetByIdAsync(id);
                bool canViewFinancials = User.IsInRole("Admin") || User.IsInRole("Manager");
                if (!canViewFinancials && receipt != null)
                {
                    receipt.TotalAmount = null;
                    if (receipt.Details != null)
                    {
                        foreach (var d in receipt.Details)
                        {
                            d.CostPrice = null;
                        }
                    }
                }
                return Ok(ApiResponse<GoodsReceiptDto>.Success(receipt));
            }
            catch (KeyNotFoundException)
            {
                return NotFound(ApiResponse<GoodsReceiptDto>.Failure("Không tìm thấy phiếu nhập kho", "ERR_NOT_FOUND"));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<GoodsReceiptDto>.Failure($"Lỗi: {ex.Message}", "ERR_GET_RECEIPT"));
            }
        }

        [HttpPost]
        [Authorize(Roles = "Admin,Manager,WarehouseStaff")]
        public async Task<IActionResult> Create([FromBody] CreateGoodsReceiptRequestDto request)
        {
            try
            {
                if (request.UserId <= 0)
                {
                    var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                    if (int.TryParse(userIdClaim, out var claimUserId))
                    {
                        request.UserId = claimUserId;
                    }
                }

                var receipt = await _goodsReceiptService.CreateAsync(request);
                return Ok(ApiResponse<GoodsReceiptDto>.Success(receipt, "Tạo phiếu nhập kho thành công"));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ApiResponse<GoodsReceiptDto>.Failure(ex.Message));
            }
            catch (Exception ex)
            {
                var msg = ex.InnerException != null ? $"{ex.Message} --> {ex.InnerException.Message}" : ex.Message;
                return StatusCode(500, ApiResponse<GoodsReceiptDto>.Failure($"Lỗi tạo phiếu nhập: {msg}"));
            }
        }

        [HttpPost("sync")]
        [Authorize(Roles = "Admin,Manager,WarehouseStaff")]
        public async Task<IActionResult> Sync([FromBody] GoodsReceiptSyncRequestDto request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ApiResponse<int>.Failure("Dữ liệu đầu vào không hợp lệ"));
                }

                var receiptId = await _goodsReceiptService.SyncOfflineGoodsReceiptAsync(request);
                return Ok(ApiResponse<int>.Success(receiptId, "Đồng bộ phiếu nhập thành công"));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ApiResponse<int>.Failure(ex.Message));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ApiResponse<int>.Failure(ex.Message));
            }
            catch (Exception ex)
            {
                return StatusCode(500, ApiResponse<int>.Failure($"Lỗi đồng bộ phiếu nhập: {ex.Message}"));
            }
        }
    }
}