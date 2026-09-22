using POS_WMS.Application.DTOs;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace POS_WMS.Application.Interfaces
{
    public interface IAuditLogService
    {
        Task LogActionAsync(int? userId, string userName, string action, string entityType, string? entityId, string? details, string? result = null, string? correlationId = null);
        Task<List<AuditLogDto>> GetLogsAsync(int? userId, string? action, DateTime? startDate, DateTime? endDate, int page = 1, int pageSize = 50);
        Task<List<AuditLogDto>> GetLogsByUserAsync(int userId, int limit = 50);
        Task<int> GetTotalCountAsync(int? userId, string? action, DateTime? startDate, DateTime? endDate);
    }
}
