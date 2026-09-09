using POS_WMS.Application.DTOs;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace POS_WMS.Application.Interfaces
{
    public interface IReportService
    {
        Task<DashboardSummaryDto> GetDashboardSummaryAsync(DateTime? startDate, DateTime? endDate);
        Task<List<TopProductDto>> GetTopSellingProductsAsync(int limit, DateTime? startDate, DateTime? endDate);
        Task<List<RevenueComparisonPointDto>> GetRevenueChartComparisonAsync(DateTime currentStart, DateTime currentEnd, DateTime previousStart, DateTime previousEnd);
        
        // Keep existing endpoints to avoid breaking other potential consumers
        Task<List<RevenueByDayDto>> GetRevenueChartDataAsync(DateTime startDate, DateTime endDate);
        Task<decimal> GetPurchaseSummaryAsync(DateTime? startDate, DateTime? endDate);
        Task<List<LowStockProductDto>> GetLowStockProductsAsync(int threshold);
    }

    public class DashboardSummaryDto
    {
        public decimal NetRevenue { get; set; }
        public decimal? GrossProfit { get; set; }
        public decimal? GrossMarginPercent { get; set; }
        public bool HasGrossProfitData { get; set; }
        public int MissingCostSoldProductCount { get; set; }

        public int CompletedOrders { get; set; }
        public int CancelledOrders { get; set; }
        public decimal AverageOrderValue { get; set; }

        public decimal? TotalInventoryValue { get; set; }
        public bool HasInventoryValueData { get; set; }
        public int MissingCostInventoryProductCount { get; set; }

        public int TotalSKUs { get; set; }
        public int OutOfStockSKUs { get; set; }
        public int LowStockSKUs { get; set; }

        public int PendingOrders { get; set; }

        public bool SupportsDiscounts { get; set; } = false;
        public bool SupportsReturns { get; set; } = false;
    }

    public class TopProductDto
    {
        public int ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string Barcode { get; set; } = string.Empty;
        public int QuantitySold { get; set; }
        public decimal Revenue { get; set; }
        public int StockQuantity { get; set; }
        public string? StockStatus { get; set; }
    }

    public class RevenueComparisonPointDto
    {
        public string Label { get; set; } = string.Empty;
        public DateTime? CurrentPeriodTimestamp { get; set; }
        public DateTime? PreviousPeriodTimestamp { get; set; }
        public decimal CurrentPeriodRevenue { get; set; }
        public decimal PreviousPeriodRevenue { get; set; }
    }

    // Legacy DTOs for other endpoints
    public class RevenueByDayDto
    {
        public DateTime Date { get; set; }
        public decimal Revenue { get; set; }
    }

    public class LowStockProductDto
    {
        public int ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public int StockQuantity { get; set; }
        public string CategoryName { get; set; } = string.Empty;
        public DateTime? LastReceiptDate { get; set; }
    }
}
