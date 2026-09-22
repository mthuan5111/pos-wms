using System.Collections.Generic;
using System.Threading.Tasks;
using POS_WMS.Application.DTOs;

namespace POS_WMS.Application.Interfaces
{
    public interface IShiftService
    {
        Task<ShiftDto?> GetCurrentShiftAsync(int userId);
        Task<ShiftDto> OpenShiftAsync(int userId, string role, OpenShiftRequestDto request);
        Task<ShiftReportDto> GetShiftPreviewAsync(int shiftId, int userId);
        Task<ShiftReportDto> EndShiftAsync(int shiftId, int userId, EndShiftRequestDto request);
        Task<ShiftReportDto?> GetShiftReportAsync(int shiftId, int callerUserId, string callerRole);
        Task<List<ShiftDto>> GetShiftHistoryAsync(int? userId, string? role, int page = 1, int pageSize = 20);
    }
}
