using System;

namespace POS_WMS.Application.DTOs
{
    public class ShiftDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public DateTime StartedAt { get; set; }
        public DateTime? EndedAt { get; set; }
        public string Status { get; set; } = "Open";
        public decimal OpeningCash { get; set; } = 0;
        public string? FinalReportSnapshot { get; set; }
        public string? ClosingRemarks { get; set; }
    }

    public class OpenShiftRequestDto
    {
        public decimal OpeningCash { get; set; } = 0;
        public string? Remarks { get; set; }
    }

    public class EndShiftRequestDto
    {
        public decimal? ActualCash { get; set; }
        public string? ClosingRemarks { get; set; }
    }

    public class ForceCloseShiftRequestDto
    {
        public string Reason { get; set; } = string.Empty;
    }

    public class ShiftReportDto
    {
        public int ShiftId { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public DateTime StartedAt { get; set; }
        public DateTime? EndedAt { get; set; }
        public string Status { get; set; } = "Open";
        public string? ClosingRemarks { get; set; }

        // Cash drawer & Till reconciliation
        public decimal OpeningCash { get; set; }
        public decimal CashRevenue { get; set; }
        public decimal QrRevenue { get; set; }
        public decimal TotalRevenue { get; set; }
        public decimal ExpectedCash { get; set; }
        public decimal? ActualCash { get; set; }
        public decimal? Difference { get; set; }

        // Admin/Manager force-close metadata
        public int? ClosedByUserId { get; set; }
        public string? ClosedByUserName { get; set; }
        public string? ForceCloseReason { get; set; }

        // Cashier sales summary
        public int OrderCount { get; set; }
        public int CompletedOrderCount { get; set; }
        public int CanceledOrderCount { get; set; }
        public int PendingSyncCount { get; set; }

        // Warehouse activity summary (if applicable)
        public int ReceiptCount { get; set; }
        public decimal TotalReceiptAmount { get; set; }
        public int ReceiptQuantityTotal { get; set; }
        public int AdjustmentIncreaseCount { get; set; }
        public int AdjustmentIncreaseQuantity { get; set; }
        public int AdjustmentDecreaseCount { get; set; }
        public int AdjustmentDecreaseQuantity { get; set; }
    }
}
