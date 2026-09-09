using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Infrastructure.Persistence;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace POS_WMS.Infrastructure.Services
{
    public class AuditLogService : IAuditLogService
    {
        private readonly ApplicationDbContext _context;

        public AuditLogService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task LogActionAsync(int userId, string userName, string action, string entityType, string? entityId, string? details, string? result = null, string? correlationId = null)
        {
            var log = new AuditLog
            {
                UserId = userId,
                UserName = userName,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                Details = details,
                CreatedAt = DateTime.UtcNow,
                Result = result,
                CorrelationId = correlationId
            };

            await _context.AuditLogs.AddAsync(log);
            await _context.SaveChangesAsync();
        }

        public async Task<List<AuditLogDto>> GetLogsAsync(int? userId, string? action, DateTime? startDate, DateTime? endDate, int page = 1, int pageSize = 50)
        {
            var query = _context.AuditLogs.AsQueryable();

            if (userId.HasValue)
                query = query.Where(l => l.UserId == userId.Value);
            if (!string.IsNullOrEmpty(action))
                query = query.Where(l => l.Action == action);
            if (startDate.HasValue)
                query = query.Where(l => l.CreatedAt >= startDate.Value);
            if (endDate.HasValue)
                query = query.Where(l => l.CreatedAt <= endDate.Value);

            return await query
                .OrderByDescending(l => l.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(l => new AuditLogDto
                {
                    Id = l.Id,
                    UserId = l.UserId,
                    UserName = l.UserName,
                    Action = l.Action,
                    EntityType = l.EntityType,
                    EntityId = l.EntityId,
                    Details = l.Details,
                    CreatedAt = l.CreatedAt,
                    CorrelationId = l.CorrelationId,
                    Result = l.Result
                })
                .ToListAsync();
        }

        public async Task<List<AuditLogDto>> GetLogsByUserAsync(int userId, int limit = 50)
        {
            return await _context.AuditLogs
                .Where(l => l.UserId == userId)
                .OrderByDescending(l => l.CreatedAt)
                .Take(limit)
                .Select(l => new AuditLogDto
                {
                    Id = l.Id,
                    UserId = l.UserId,
                    UserName = l.UserName,
                    Action = l.Action,
                    EntityType = l.EntityType,
                    EntityId = l.EntityId,
                    Details = l.Details,
                    CreatedAt = l.CreatedAt,
                    CorrelationId = l.CorrelationId,
                    Result = l.Result
                })
                .ToListAsync();
        }

        public async Task<int> GetTotalCountAsync(int? userId, string? action, DateTime? startDate, DateTime? endDate)
        {
            var query = _context.AuditLogs.AsQueryable();

            if (userId.HasValue)
                query = query.Where(l => l.UserId == userId.Value);
            if (!string.IsNullOrEmpty(action))
                query = query.Where(l => l.Action == action);
            if (startDate.HasValue)
                query = query.Where(l => l.CreatedAt >= startDate.Value);
            if (endDate.HasValue)
                query = query.Where(l => l.CreatedAt <= endDate.Value);

            return await query.CountAsync();
        }
    }
}
