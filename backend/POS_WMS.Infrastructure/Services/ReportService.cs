using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Enums;
using POS_WMS.Infrastructure.Persistence;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace POS_WMS.Infrastructure.Services
{
    public class ReportService : IReportService
    {
        private readonly ApplicationDbContext _context;
        public const int LowStockThreshold = 10;

        public ReportService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<DashboardSummaryDto> GetDashboardSummaryAsync(DateTime? startDate, DateTime? endDate)
        {
            var dto = new DashboardSummaryDto();

            // 1. Fetch relevant orders
            var completedOrdersQuery = _context.Orders
                .Include(o => o.OrderDetails)
                .Where(o => o.Status == OrderStatus.Completed);
                
            var cancelledOrdersQuery = _context.Orders
                .Where(o => o.Status == OrderStatus.Cancelled);

            if (startDate.HasValue)
            {
                completedOrdersQuery = completedOrdersQuery.Where(o => o.OrderDate >= startDate.Value);
                cancelledOrdersQuery = cancelledOrdersQuery.Where(o => o.OrderDate >= startDate.Value);
            }
            if (endDate.HasValue)
            {
                completedOrdersQuery = completedOrdersQuery.Where(o => o.OrderDate < endDate.Value);
                cancelledOrdersQuery = cancelledOrdersQuery.Where(o => o.OrderDate < endDate.Value);
            }

            var completedOrders = await completedOrdersQuery.ToListAsync();
            
            dto.CompletedOrders = completedOrders.Count;
            dto.CancelledOrders = await cancelledOrdersQuery.CountAsync();
            dto.PendingOrders = await _context.Orders.CountAsync(o => o.Status == OrderStatus.Pending);

            dto.NetRevenue = completedOrders.Sum(o => o.TotalAmount);
            dto.AverageOrderValue = dto.CompletedOrders > 0 ? dto.NetRevenue / dto.CompletedOrders : 0;

            // 2. Resolve cost prices
            var productCosts = await _context.GoodsReceiptDetails
                .Include(grd => grd.GoodsReceipt)
                .Where(grd => grd.GoodsReceipt != null)
                .GroupBy(grd => grd.ProductId)
                .Select(g => new
                {
                    ProductId = g.Key,
                    CostPrice = g.OrderByDescending(x => x.GoodsReceipt!.ReceiptDate)
                                 .ThenByDescending(x => x.Id)
                                 .Select(x => x.CostPrice)
                                 .FirstOrDefault()
                })
                .ToDictionaryAsync(x => x.ProductId, x => x.CostPrice);

            // 3. Gross Profit
            if (dto.CompletedOrders == 0)
            {
                dto.GrossProfit = 0;
                dto.HasGrossProfitData = true;
                dto.MissingCostSoldProductCount = 0;
                dto.GrossMarginPercent = null;
            }
            else
            {
                decimal cogs = 0;
                bool hasMissingCost = false;
                var missingCostProductIds = new HashSet<int>();

                foreach (var order in completedOrders)
                {
                    foreach (var detail in order.OrderDetails)
                    {
                        if (productCosts.TryGetValue(detail.ProductId, out var cost))
                        {
                            cogs += detail.Quantity * cost;
                        }
                        else
                        {
                            hasMissingCost = true;
                            missingCostProductIds.Add(detail.ProductId);
                        }
                    }
                }

                if (hasMissingCost)
                {
                    dto.GrossProfit = null;
                    dto.HasGrossProfitData = false;
                    dto.MissingCostSoldProductCount = missingCostProductIds.Count;
                    dto.GrossMarginPercent = null;
                }
                else
                {
                    dto.GrossProfit = dto.NetRevenue - cogs;
                    dto.HasGrossProfitData = true;
                    dto.MissingCostSoldProductCount = 0;
                    dto.GrossMarginPercent = dto.NetRevenue > 0 ? (dto.GrossProfit / dto.NetRevenue) * 100 : null;
                }
            }

            // 4. Warehouse (Current State)
            var activeProducts = await _context.Products
                .Where(p => p.IsActive)
                .Select(p => new
                {
                    ProductId = p.Id,
                    StockQuantity = _context.Inventories.Where(i => i.ProductId == p.Id).Select(i => (int?)i.StockQuantity).FirstOrDefault() ?? 0
                })
                .ToListAsync();

            dto.TotalSKUs = activeProducts.Count(p => p.StockQuantity > 0);
            dto.OutOfStockSKUs = activeProducts.Count(p => p.StockQuantity <= 0);
            dto.LowStockSKUs = activeProducts.Count(p => p.StockQuantity > 0 && p.StockQuantity <= LowStockThreshold);

            decimal inventoryValue = 0;
            bool inventoryHasMissingCost = false;
            int missingCostInventoryCount = 0;

            foreach (var p in activeProducts.Where(p => p.StockQuantity > 0))
            {
                if (productCosts.TryGetValue(p.ProductId, out var cost))
                {
                    inventoryValue += p.StockQuantity * cost;
                }
                else
                {
                    inventoryHasMissingCost = true;
                    missingCostInventoryCount++;
                }
            }

            if (inventoryHasMissingCost)
            {
                dto.TotalInventoryValue = null;
                dto.HasInventoryValueData = false;
                dto.MissingCostInventoryProductCount = missingCostInventoryCount;
            }
            else
            {
                dto.TotalInventoryValue = inventoryValue;
                dto.HasInventoryValueData = true;
                dto.MissingCostInventoryProductCount = 0;
            }

            return dto;
        }

        public async Task<List<TopProductDto>> GetTopSellingProductsAsync(int limit, DateTime? startDate, DateTime? endDate)
        {
            var query = _context.OrderDetails
                .Include(od => od.Order)
                .Where(od => od.Order.Status == OrderStatus.Completed);

            if (startDate.HasValue)
                query = query.Where(od => od.Order.OrderDate >= startDate.Value);
            if (endDate.HasValue)
                query = query.Where(od => od.Order.OrderDate < endDate.Value);

            var topProducts = await query
                .GroupBy(od => od.ProductId)
                .Select(g => new
                {
                    ProductId = g.Key,
                    QuantitySold = g.Sum(od => od.Quantity),
                    Revenue = g.Sum(od => od.Quantity * od.UnitPrice)
                })
                .OrderByDescending(x => x.QuantitySold)
                .ThenByDescending(x => x.Revenue)
                .ThenBy(x => x.ProductId)
                .Take(limit)
                .ToListAsync();

            var result = new List<TopProductDto>();
            foreach(var tp in topProducts)
            {
                var product = await _context.Products.FirstOrDefaultAsync(p => p.Id == tp.ProductId);
                var stock = await _context.Inventories.Where(i => i.ProductId == tp.ProductId).Select(i => (int?)i.StockQuantity).FirstOrDefaultAsync() ?? 0;
                
                string? stockStatus = null;
                if (stock <= 0) stockStatus = "HẾT HÀNG";
                else if (stock <= LowStockThreshold) stockStatus = "SẮP HẾT";

                result.Add(new TopProductDto
                {
                    ProductId = tp.ProductId,
                    ProductName = product?.Name ?? string.Empty,
                    Barcode = product?.Barcode ?? string.Empty,
                    QuantitySold = tp.QuantitySold,
                    Revenue = tp.Revenue,
                    StockQuantity = stock,
                    StockStatus = stockStatus
                });
            }

            return result;
        }

        public async Task<List<RevenueComparisonPointDto>> GetRevenueChartComparisonAsync(DateTime currentStart, DateTime currentEnd, DateTime previousStart, DateTime previousEnd)
        {
            var isHourly = (currentEnd - currentStart).TotalHours <= 24;

            var currentOrders = await _context.Orders
                .Where(o => o.Status == OrderStatus.Completed && o.OrderDate >= currentStart && o.OrderDate < currentEnd)
                .Select(o => new { o.OrderDate, o.TotalAmount })
                .ToListAsync();

            var previousOrders = await _context.Orders
                .Where(o => o.Status == OrderStatus.Completed && o.OrderDate >= previousStart && o.OrderDate < previousEnd)
                .Select(o => new { o.OrderDate, o.TotalAmount })
                .ToListAsync();

            var result = new List<RevenueComparisonPointDto>();

            if (isHourly)
            {
                for (int i = 0; i < 24; i++)
                {
                    var curDt = currentStart.AddHours(i);
                    var prevDt = previousStart.AddHours(i);
                    
                    var curRev = currentOrders.Where(o => o.OrderDate >= curDt && o.OrderDate < curDt.AddHours(1)).Sum(o => o.TotalAmount);
                    var prevRev = previousOrders.Where(o => o.OrderDate >= prevDt && o.OrderDate < prevDt.AddHours(1)).Sum(o => o.TotalAmount);
                    
                    result.Add(new RevenueComparisonPointDto
                    {
                        Label = $"{curDt.Hour:00}:00",
                        CurrentPeriodTimestamp = curDt,
                        PreviousPeriodTimestamp = prevDt,
                        CurrentPeriodRevenue = curRev,
                        PreviousPeriodRevenue = prevRev
                    });
                }
            }
            else
            {
                var days = (int)Math.Ceiling((currentEnd - currentStart).TotalDays);
                for (int i = 0; i < days; i++)
                {
                    var curDt = currentStart.AddDays(i);
                    var prevDt = previousStart.AddDays(i);
                    
                    var curRev = currentOrders.Where(o => o.OrderDate >= curDt && o.OrderDate < curDt.AddDays(1)).Sum(o => o.TotalAmount);
                    var prevRev = previousOrders.Where(o => o.OrderDate >= prevDt && o.OrderDate < prevDt.AddDays(1)).Sum(o => o.TotalAmount);
                    
                    result.Add(new RevenueComparisonPointDto
                    {
                        Label = $"{curDt.Day:00}/{curDt.Month:00}",
                        CurrentPeriodTimestamp = curDt,
                        PreviousPeriodTimestamp = prevDt,
                        CurrentPeriodRevenue = curRev,
                        PreviousPeriodRevenue = prevRev
                    });
                }
            }

            return result;
        }

        // Legacy endpoints
        public async Task<List<RevenueByDayDto>> GetRevenueChartDataAsync(DateTime startDate, DateTime endDate)
        {
            var orders = await _context.Orders
                .Where(o => o.Status == OrderStatus.Completed && o.OrderDate >= startDate && o.OrderDate < endDate)
                .Select(o => new { o.OrderDate, o.TotalAmount })
                .ToListAsync();

            var chartData = orders
                .GroupBy(o => o.OrderDate.Date)
                .Select(g => new RevenueByDayDto
                {
                    Date = g.Key,
                    Revenue = g.Sum(o => o.TotalAmount)
                })
                .OrderBy(x => x.Date)
                .ToList();

            var result = new List<RevenueByDayDto>();
            for (var date = startDate.Date; date <= endDate.Date; date = date.AddDays(1))
            {
                var existing = chartData.FirstOrDefault(x => x.Date == date);
                if (existing != null)
                {
                    result.Add(existing);
                }
                else
                {
                    result.Add(new RevenueByDayDto { Date = date, Revenue = 0 });
                }
            }

            return result;
        }

        public async Task<decimal> GetPurchaseSummaryAsync(DateTime? startDate, DateTime? endDate)
        {
            var query = _context.GoodsReceipts.AsQueryable();

            if (startDate.HasValue)
                query = query.Where(g => g.ReceiptDate >= startDate.Value);
            if (endDate.HasValue)
                query = query.Where(g => g.ReceiptDate < endDate.Value);

            return await query.SumAsync(g => g.TotalAmount);
        }

        public async Task<List<LowStockProductDto>> GetLowStockProductsAsync(int threshold)
        {
            var lowStockItems = await _context.Inventories
                .Include(i => i.Product)
                .ThenInclude(p => p!.Category)
                .Where(i => i.StockQuantity < threshold && i.StockQuantity > 0)
                .Select(i => new LowStockProductDto
                {
                    ProductId = i.ProductId,
                    ProductName = i.Product!.Name,
                    StockQuantity = i.StockQuantity,
                    CategoryName = i.Product.Category!.Name
                })
                .ToListAsync();
            
            foreach (var item in lowStockItems)
            {
                var lastReceipt = await _context.GoodsReceiptDetails
                    .Include(d => d.GoodsReceipt)
                    .Where(d => d.ProductId == item.ProductId)
                    .OrderByDescending(d => d.GoodsReceipt!.ReceiptDate)
                    .Select(d => d.GoodsReceipt!.ReceiptDate)
                    .FirstOrDefaultAsync();
                
                if (lastReceipt != default)
                {
                    item.LastReceiptDate = lastReceipt;
                }
            }

            return lowStockItems.OrderBy(i => i.StockQuantity).ToList();
        }
    }
}
