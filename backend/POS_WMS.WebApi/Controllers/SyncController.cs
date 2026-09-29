using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.DTOs;
using POS_WMS.Infrastructure.Persistence;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;

namespace POS_WMS.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class SyncController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public SyncController(ApplicationDbContext context)
        {
            _context = context;
        }

        [HttpGet("cursor")]
        public async Task<IActionResult> GetCurrentCursor()
        {
            long currentCursor = 0;
            long minCursor = 0;
            if (await _context.SyncChanges.AnyAsync())
            {
                currentCursor = await _context.SyncChanges.MaxAsync(c => c.ChangeId);
                minCursor = await _context.SyncChanges.MinAsync(c => c.ChangeId);
            }

            return Ok(new SyncCursorResponseDto
            {
                CurrentCursor = currentCursor,
                MinimumAvailableCursor = minCursor,
                ServerTime = DateTime.UtcNow
            });
        }

        [HttpGet("changes")]
        public async Task<IActionResult> GetChanges([FromQuery] long after = 0, [FromQuery] int limit = 50)
        {
            if (limit <= 0) limit = 50;
            if (limit > 100) limit = 100;

            bool hasChanges = await _context.SyncChanges.AnyAsync();
            long minCursor = hasChanges ? await _context.SyncChanges.MinAsync(c => c.ChangeId) : 0;
            long maxCursor = hasChanges ? await _context.SyncChanges.MaxAsync(c => c.ChangeId) : 0;

            // Stale cursor / retention check:
            // If the client's cursor is older than the minimum available cursor (purged by retention),
            // return RequiresBootstrap = true so the client re-bootstraps instead of silently skipping data.
            if (hasChanges && after > 0 && after < minCursor - 1)
            {
                return Ok(new SyncPullResponseDto
                {
                    RequiresBootstrap = true,
                    MinimumAvailableCursor = minCursor,
                    Changes = new List<SyncChangeDto>(),
                    NextCursor = maxCursor,
                    HasMore = false,
                    ServerTime = DateTime.UtcNow,
                    SchemaVersion = 1
                });
            }

            var isDemo = User.IsInRole("DemoUser") || User.FindFirst("is_demo")?.Value == "true";
            var isCashier = User.IsInRole("Cashier");

            var query = _context.SyncChanges.AsNoTracking().Where(c => c.ChangeId > after);

            // Role-based filtering
            if (isDemo)
            {
                // Demo is strictly restricted to read-only master data and inventory snapshots
                query = query.Where(c => c.EntityType == "Category" ||
                                         c.EntityType == "Product" ||
                                         c.EntityType == "Supplier" ||
                                         c.EntityType == "Inventory");
            }

            var items = await query
                .OrderBy(c => c.ChangeId)
                .Take(limit + 1)
                .ToListAsync();

            bool hasMore = items.Count > limit;
            var resultItems = items.Take(limit).ToList();
            long nextCursor = resultItems.Count > 0 ? resultItems.Last().ChangeId : after;

            var changes = new List<SyncChangeDto>();
            foreach (var item in resultItems)
            {
                object? parsedData = null;
                if (!string.IsNullOrEmpty(item.DataJson))
                {
                    try
                    {
                        parsedData = JsonSerializer.Deserialize<object>(item.DataJson);
                    }
                    catch
                    {
                        parsedData = null;
                    }
                }

                changes.Add(new SyncChangeDto
                {
                    ChangeId = item.ChangeId,
                    EntityType = item.EntityType,
                    EntityId = item.EntityId,
                    Operation = item.Operation,
                    ChangedAt = item.ChangedAt,
                    Version = item.Version,
                    Data = parsedData
                });
            }

            return Ok(new SyncPullResponseDto
            {
                RequiresBootstrap = false,
                MinimumAvailableCursor = minCursor,
                Changes = changes,
                NextCursor = nextCursor,
                HasMore = hasMore,
                ServerTime = DateTime.UtcNow,
                SchemaVersion = 1
            });
        }

        [HttpPost("cleanup-retention")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> CleanupRetention([FromQuery] int daysToKeep = 30, [FromQuery] int batchSize = 500)
        {
            if (daysToKeep < 7) daysToKeep = 7; // Never delete changes younger than 7 days
            var cutoff = DateTime.UtcNow.AddDays(-daysToKeep);

            int totalDeleted = 0;
            while (true)
            {
                var idsToDelete = await _context.SyncChanges
                    .Where(c => c.ChangedAt < cutoff)
                    .OrderBy(c => c.ChangeId)
                    .Select(c => c.ChangeId)
                    .Take(batchSize)
                    .ToListAsync();

                if (idsToDelete.Count == 0) break;

                var changes = await _context.SyncChanges.Where(c => idsToDelete.Contains(c.ChangeId)).ToListAsync();
                _context.SyncChanges.RemoveRange(changes);
                await _context.SaveChangesAsync();
                totalDeleted += idsToDelete.Count;

                if (idsToDelete.Count < batchSize) break;
            }

            return Ok(new { success = true, totalDeleted, cutoffDate = cutoff });
        }

        [HttpGet("bootstrap-snapshot")]
        public async Task<IActionResult> GetBootstrapSnapshot()
        {
            var isDemo = User.IsInRole("DemoUser") || User.FindFirst("is_demo")?.Value == "true";
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            int.TryParse(userIdStr, out var userId);

            long currentCursor = 0;
            if (await _context.SyncChanges.AnyAsync())
            {
                currentCursor = await _context.SyncChanges.MaxAsync(c => c.ChangeId);
            }

            // Master data snapshot
            var categories = await _context.Categories.AsNoTracking()
                .Select(c => new
                {
                    id = c.Id,
                    name = c.Name,
                    description = c.Description ?? "",
                    code = c.Code,
                    isSystem = c.IsSystem,
                    isActive = c.IsActive
                })
                .ToListAsync();

            var suppliers = await _context.Suppliers.AsNoTracking()
                .Select(s => new
                {
                    id = s.Id,
                    name = s.Name,
                    contactPerson = s.ContactPerson ?? "",
                    phone = s.Phone ?? "",
                    address = s.Address ?? "",
                    isActive = s.IsActive
                })
                .ToListAsync();

            var products = await _context.Products.AsNoTracking()
                .Select(p => new
                {
                    id = p.Id,
                    categoryId = p.CategoryId,
                    supplierId = p.SupplierId,
                    name = p.Name,
                    price = p.Price,
                    barcode = p.Barcode,
                    imageUrl = p.ImageUrl,
                    imagePublicId = p.ImagePublicId,
                    lowStockThreshold = p.LowStockThreshold,
                    isSalePriceConfigured = p.IsSalePriceConfigured,
                    isActive = p.IsActive
                })
                .ToListAsync();

            var inventories = await _context.Inventories.AsNoTracking()
                .Select(i => new
                {
                    id = i.Id,
                    productId = i.ProductId,
                    stockQuantity = i.StockQuantity
                })
                .ToListAsync();

            object? recentOrders = null;
            object? recentGoodsReceipts = null;

            if (!isDemo)
            {
                // Fetch recent orders for the device/user (last 30 days or up to 50 records)
                var cutoffDate = DateTime.UtcNow.AddDays(-30);
                recentOrders = await _context.Orders.AsNoTracking()
                    .Where(o => o.OrderDate >= cutoffDate)
                    .OrderByDescending(o => o.OrderDate)
                    .Take(50)
                    .Select(o => new
                    {
                        id = o.Id,
                        offlineReferenceId = o.OfflineReferenceId,
                        userId = o.UserId,
                        customerId = o.CustomerId,
                        totalAmount = o.TotalAmount,
                        paymentMethod = o.PaymentMethod,
                        orderDate = o.OrderDate,
                        status = o.Status,
                        shiftId = o.ShiftId,
                        details = o.OrderDetails.Select(d => new
                        {
                            id = d.Id,
                            productId = d.ProductId,
                            quantity = d.Quantity,
                            unitPrice = d.UnitPrice
                        }).ToList()
                    })
                    .ToListAsync();

                // Fetch recent goods receipts (up to 30 records)
                recentGoodsReceipts = await _context.GoodsReceipts.AsNoTracking()
                    .OrderByDescending(g => g.ReceiptDate)
                    .Take(30)
                    .Select(g => new
                    {
                        id = g.Id,
                        offlineReferenceId = g.OfflineReferenceId,
                        supplierId = g.SupplierId,
                        supplierName = g.Supplier != null ? g.Supplier.Name : "Unknown",
                        userId = g.UserId,
                        totalAmount = g.TotalAmount,
                        remarks = g.Remarks,
                        receiptDate = g.ReceiptDate,
                        status = "COMPLETED",
                        shiftId = g.ShiftId,
                        details = g.GoodsReceiptDetails.Select(d => new
                        {
                            id = d.Id,
                            productId = d.ProductId,
                            quantity = d.Quantity,
                            costPrice = d.CostPrice
                        }).ToList()
                    })
                    .ToListAsync();
            }

            return Ok(new
            {
                categories,
                suppliers,
                products,
                inventories,
                recentOrders,
                recentGoodsReceipts,
                currentCursor,
                serverTime = DateTime.UtcNow
            });
        }
    }
}
