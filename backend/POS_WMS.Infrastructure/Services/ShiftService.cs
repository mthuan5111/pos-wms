using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Domain.Enums;
using POS_WMS.Infrastructure.Persistence;

namespace POS_WMS.Infrastructure.Services
{
    public class ShiftService : IShiftService
    {
        private readonly ApplicationDbContext _context;
        private readonly IAuditLogService _auditLogService;

        public ShiftService(ApplicationDbContext context, IAuditLogService auditLogService)
        {
            _context = context;
            _auditLogService = auditLogService;
        }

        public async Task<ShiftDto?> GetCurrentShiftAsync(int userId)
        {
            var shift = await _context.Shifts
                .Include(s => s.User)
                .Where(s => s.UserId == userId && s.Status == ShiftStatus.Open)
                .OrderByDescending(s => s.StartedAt)
                .FirstOrDefaultAsync();

            if (shift == null) return null;

            return MapToDto(shift);
        }

        public async Task<ShiftDto> OpenShiftAsync(int userId, string role, OpenShiftRequestDto request)
        {
            if (request != null && request.OpeningCash < 0)
            {
                throw new ArgumentException("Số tiền đầu ca không được là số âm.");
            }
            if (request != null && request.OpeningCash > 10_000_000_000m)
            {
                throw new ArgumentException("Số tiền đầu ca vượt quá giới hạn cho phép.");
            }

            // Idempotency: if already has an open shift, return it
            var existing = await _context.Shifts
                .Include(s => s.User)
                .Where(s => s.UserId == userId && s.Status == ShiftStatus.Open)
                .OrderByDescending(s => s.StartedAt)
                .FirstOrDefaultAsync();

            if (existing != null)
            {
                return MapToDto(existing);
            }

            decimal openingCash = request?.OpeningCash ?? 0;
            var initialSnapshot = JsonSerializer.Serialize(new
            {
                OpeningCash = openingCash,
                StartedAt = DateTime.UtcNow,
                Status = "Open"
            });

            var user = await _context.Users.FindAsync(userId);
            var shift = new Shift
            {
                UserId = userId,
                Role = string.IsNullOrWhiteSpace(role) ? (user?.Role.ToString() ?? "Cashier") : role,
                StartedAt = DateTime.UtcNow,
                Status = ShiftStatus.Open,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                FinalReportSnapshot = initialSnapshot,
                ClosingRemarks = request?.Remarks
            };

            await _context.Shifts.AddAsync(shift);
            await _context.SaveChangesAsync();

            var userName = user?.Name ?? user?.Username ?? "Unknown";
            await _auditLogService.LogActionAsync(
                userId,
                userName,
                "SHIFT_OPENED",
                "Shift",
                shift.Id.ToString(),
                $"Mở ca làm việc #{shift.Id} vai trò {shift.Role} cho {userName}. Tiền đầu ca: {openingCash:N0} đ",
                "SUCCESS"
            );

            return MapToDto(shift, userName);
        }

        public async Task<ShiftReportDto> GetShiftPreviewAsync(int shiftId, int userId)
        {
            var shift = await _context.Shifts
                .Include(s => s.User)
                .FirstOrDefaultAsync(s => s.Id == shiftId);

            if (shift == null)
            {
                throw new KeyNotFoundException("Không tìm thấy ca làm việc");
            }

            // If shift already has a locked snapshot, return it
            if (!string.IsNullOrWhiteSpace(shift.FinalReportSnapshot))
            {
                try
                {
                    var cached = JsonSerializer.Deserialize<ShiftReportDto>(shift.FinalReportSnapshot);
                    if (cached != null && shift.Status == ShiftStatus.Closed) return cached;
                }
                catch { }
            }

            return await CalculateShiftReportAsync(shift);
        }

        public async Task<ShiftReportDto> EndShiftAsync(int shiftId, int userId, EndShiftRequestDto request)
        {
            var shift = await _context.Shifts
                .Include(s => s.User)
                .FirstOrDefaultAsync(s => s.Id == shiftId);

            if (shift == null)
            {
                throw new KeyNotFoundException("Không tìm thấy ca làm việc");
            }

            if (request?.ActualCash.HasValue == true && request.ActualCash.Value < 0)
            {
                throw new ArgumentException("Số tiền kiểm đếm thực tế không được là số âm.");
            }

            // Idempotency: if already closed, return locked snapshot
            if (shift.Status == ShiftStatus.Closed && !string.IsNullOrWhiteSpace(shift.FinalReportSnapshot))
            {
                try
                {
                    var cached = JsonSerializer.Deserialize<ShiftReportDto>(shift.FinalReportSnapshot);
                    if (cached != null) return cached;
                }
                catch { }
            }

            // Calculate reconciled report with cash drawer till reconciliation
            var report = await CalculateShiftReportAsync(shift);
            report.EndedAt = DateTime.UtcNow;
            report.Status = "Closed";
            report.ClosingRemarks = request?.ClosingRemarks ?? shift.ClosingRemarks;
            report.ActualCash = request?.ActualCash;
            report.Difference = request?.ActualCash.HasValue == true
                ? request.ActualCash.Value - report.ExpectedCash
                : null;

            var snapshotJson = JsonSerializer.Serialize(report);

            shift.Status = ShiftStatus.Closed;
            shift.EndedAt = report.EndedAt;
            shift.FinalReportSnapshot = snapshotJson;
            shift.ClosingRemarks = report.ClosingRemarks;
            shift.UpdatedAt = DateTime.UtcNow;

            _context.Shifts.Update(shift);
            await _context.SaveChangesAsync();

            var userName = shift.User?.Name ?? shift.User?.Username ?? "Unknown";
            await _auditLogService.LogActionAsync(
                userId,
                userName,
                "SHIFT_CLOSED",
                "Shift",
                shift.Id.ToString(),
                $"Kết thúc ca làm việc #{shift.Id} bởi {userName}. Doanh thu: {report.TotalRevenue:N0} đ. Dự kiến két: {report.ExpectedCash:N0} đ. Thực tế: {report.ActualCash?.ToString("N0") ?? "N/A"} đ. Chênh lệch: {report.Difference?.ToString("N0") ?? "N/A"} đ",
                "SUCCESS"
            );

            return report;
        }

        public async Task<ShiftReportDto> ForceCloseShiftAsync(int shiftId, int callerUserId, string callerRole, ForceCloseShiftRequestDto request)
        {
            if (!callerRole.Equals("Admin", StringComparison.OrdinalIgnoreCase) &&
                !callerRole.Equals("Manager", StringComparison.OrdinalIgnoreCase))
            {
                throw new UnauthorizedAccessException("Chỉ Quản lý hoặc Quản trị viên mới có quyền kết ca cưỡng chế.");
            }

            if (string.IsNullOrWhiteSpace(request?.Reason))
            {
                throw new ArgumentException("Bắt buộc nhập lý do đóng ca cưỡng chế.");
            }

            var shift = await _context.Shifts
                .Include(s => s.User)
                .FirstOrDefaultAsync(s => s.Id == shiftId);

            if (shift == null)
            {
                throw new KeyNotFoundException("Không tìm thấy ca làm việc");
            }

            if (shift.Status == ShiftStatus.Closed && !string.IsNullOrWhiteSpace(shift.FinalReportSnapshot))
            {
                try
                {
                    var cached = JsonSerializer.Deserialize<ShiftReportDto>(shift.FinalReportSnapshot);
                    if (cached != null) return cached;
                }
                catch { }
            }

            var callerUser = await _context.Users.FindAsync(callerUserId);
            var callerName = callerUser?.Name ?? callerUser?.Username ?? "Quản lý";
            var shiftUserName = shift.User?.Name ?? shift.User?.Username ?? "Unknown";

            var report = await CalculateShiftReportAsync(shift);
            report.EndedAt = DateTime.UtcNow;
            report.Status = "Closed";
            report.ClosedByUserId = callerUserId;
            report.ClosedByUserName = callerName;
            report.ForceCloseReason = request.Reason.Trim();
            report.ClosingRemarks = $"[ĐÓNG CA CƯỠNG CHẾ bởi {callerName}]: {request.Reason.Trim()}";

            var snapshotJson = JsonSerializer.Serialize(report);

            shift.Status = ShiftStatus.Closed;
            shift.EndedAt = report.EndedAt;
            shift.FinalReportSnapshot = snapshotJson;
            shift.ClosingRemarks = report.ClosingRemarks;
            shift.UpdatedAt = DateTime.UtcNow;

            _context.Shifts.Update(shift);
            await _context.SaveChangesAsync();

            await _auditLogService.LogActionAsync(
                callerUserId,
                callerName,
                "SHIFT_FORCE_CLOSED",
                "Shift",
                shift.Id.ToString(),
                $"Đóng ca cưỡng chế ca #{shift.Id} của {shiftUserName} bởi {callerName}. Lý do: {request.Reason.Trim()}",
                "SUCCESS"
            );

            return report;
        }

        public async Task<ShiftReportDto?> GetShiftReportAsync(int shiftId, int callerUserId, string callerRole)
        {
            var shift = await _context.Shifts
                .Include(s => s.User)
                .FirstOrDefaultAsync(s => s.Id == shiftId);

            if (shift == null) return null;

            bool isAdminOrManager = callerRole.Equals("Admin", StringComparison.OrdinalIgnoreCase) ||
                                   callerRole.Equals("Manager", StringComparison.OrdinalIgnoreCase);

            if (!isAdminOrManager && shift.UserId != callerUserId)
            {
                throw new UnauthorizedAccessException("Không có quyền xem báo cáo ca của người khác");
            }

            if (!string.IsNullOrWhiteSpace(shift.FinalReportSnapshot))
            {
                try
                {
                    var cached = JsonSerializer.Deserialize<ShiftReportDto>(shift.FinalReportSnapshot);
                    if (cached != null) return cached;
                }
                catch { }
            }

            return await CalculateShiftReportAsync(shift);
        }

        public async Task<List<ShiftDto>> GetShiftHistoryAsync(int? userId, string? role, int page = 1, int pageSize = 20)
        {
            var query = _context.Shifts.Include(s => s.User).AsQueryable();

            if (userId.HasValue)
                query = query.Where(s => s.UserId == userId.Value);

            if (!string.IsNullOrWhiteSpace(role))
                query = query.Where(s => s.Role == role);

            var shifts = await query
                .OrderByDescending(s => s.StartedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return shifts.Select(s => MapToDto(s)).ToList();
        }

        private async Task<ShiftReportDto> CalculateShiftReportAsync(Shift shift)
        {
            decimal openingCash = 0;
            if (!string.IsNullOrWhiteSpace(shift.FinalReportSnapshot))
            {
                try
                {
                    using var doc = JsonDocument.Parse(shift.FinalReportSnapshot);
                    if (doc.RootElement.TryGetProperty("OpeningCash", out var prop) ||
                        doc.RootElement.TryGetProperty("openingCash", out prop))
                    {
                        openingCash = prop.GetDecimal();
                    }
                }
                catch { }
            }

            var orders = await _context.Orders
                .Where(o => o.ShiftId == shift.Id || (o.UserId == shift.UserId && o.OrderDate >= shift.StartedAt && (shift.EndedAt == null || o.OrderDate <= shift.EndedAt.Value)))
                .ToListAsync();

            var completedOrders = orders.Where(o => o.Status == OrderStatus.Completed).ToList();
            var canceledOrders = orders.Where(o => o.Status == OrderStatus.Cancelled).ToList();

            var cashRev = completedOrders
                .Where(o => o.PaymentMethod.Equals("CASH", StringComparison.OrdinalIgnoreCase))
                .Sum(o => o.TotalAmount);

            var qrRev = completedOrders
                .Where(o => !o.PaymentMethod.Equals("CASH", StringComparison.OrdinalIgnoreCase))
                .Sum(o => o.TotalAmount);

            var receipts = await _context.GoodsReceipts
                .Include(g => g.GoodsReceiptDetails)
                .Where(g => g.ShiftId == shift.Id || (g.UserId == shift.UserId && g.ReceiptDate >= shift.StartedAt && (shift.EndedAt == null || g.ReceiptDate <= shift.EndedAt.Value)))
                .ToListAsync();

            var stockMovements = await _context.StockMovements
                .Where(sm => sm.ShiftId == shift.Id || (sm.CreatedBy == (shift.User != null ? shift.User.Username : "") && sm.CreatedAt >= shift.StartedAt && (shift.EndedAt == null || sm.CreatedAt <= shift.EndedAt.Value)))
                .ToListAsync();

            var incAdjustments = stockMovements.Where(sm => sm.ReferenceType == "ADJUSTMENT" && sm.MovementType == StockMovementType.StockIn).ToList();
            var decAdjustments = stockMovements.Where(sm => sm.ReferenceType == "ADJUSTMENT" && sm.MovementType == StockMovementType.StockOut).ToList();

            return new ShiftReportDto
            {
                ShiftId = shift.Id,
                UserId = shift.UserId,
                UserName = shift.User?.Name ?? shift.User?.Username ?? "Unknown",
                Role = shift.Role,
                StartedAt = shift.StartedAt,
                EndedAt = shift.EndedAt,
                Status = shift.Status.ToString(),
                ClosingRemarks = shift.ClosingRemarks,

                OpeningCash = openingCash,
                CashRevenue = cashRev,
                QrRevenue = qrRev,
                TotalRevenue = cashRev + qrRev,
                ExpectedCash = openingCash + cashRev,

                OrderCount = orders.Count,
                CompletedOrderCount = completedOrders.Count,
                CanceledOrderCount = canceledOrders.Count,
                PendingSyncCount = 0,

                ReceiptCount = receipts.Count,
                TotalReceiptAmount = receipts.Sum(r => r.TotalAmount),
                ReceiptQuantityTotal = receipts.Sum(r => r.GoodsReceiptDetails?.Sum(d => d.Quantity) ?? 0),
                AdjustmentIncreaseCount = incAdjustments.Count,
                AdjustmentIncreaseQuantity = incAdjustments.Sum(a => a.Quantity),
                AdjustmentDecreaseCount = decAdjustments.Count,
                AdjustmentDecreaseQuantity = decAdjustments.Sum(a => a.Quantity)
            };
        }

        private ShiftDto MapToDto(Shift shift, string? userName = null)
        {
            decimal openingCash = 0;
            if (!string.IsNullOrWhiteSpace(shift.FinalReportSnapshot))
            {
                try
                {
                    using var doc = JsonDocument.Parse(shift.FinalReportSnapshot);
                    if (doc.RootElement.TryGetProperty("OpeningCash", out var prop) ||
                        doc.RootElement.TryGetProperty("openingCash", out prop))
                    {
                        openingCash = prop.GetDecimal();
                    }
                }
                catch { }
            }

            return new ShiftDto
            {
                Id = shift.Id,
                UserId = shift.UserId,
                UserName = userName ?? shift.User?.Name ?? shift.User?.Username ?? "Unknown",
                Role = shift.Role,
                StartedAt = shift.StartedAt,
                EndedAt = shift.EndedAt,
                Status = shift.Status.ToString(),
                OpeningCash = openingCash,
                FinalReportSnapshot = shift.FinalReportSnapshot,
                ClosingRemarks = shift.ClosingRemarks
            };
        }
    }
}
