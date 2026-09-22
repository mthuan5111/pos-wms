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

        public async Task LogActionAsync(int? userId, string userName, string action, string entityType, string? entityId, string? details, string? result = null, string? correlationId = null)
        {
            int? validUserId = null;
            if (userId.HasValue && userId.Value > 0)
            {
                var userExists = await _context.Users.AnyAsync(u => u.Id == userId.Value);
                if (userExists)
                {
                    validUserId = userId.Value;
                }
            }

            var log = new AuditLog
            {
                UserId = validUserId,
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
            {
                var upper = action.ToUpperInvariant();
                if (upper == "LOGIN")
                {
                    query = query.Where(l => l.Action == "LOGIN_SUCCESS" || l.Action == "LOGIN_FAILURE" || l.Action == "LOGIN_FAILED" || l.Action == "LOGOUT");
                }
                else if (upper == "USER" || upper == "ACCOUNT")
                {
                    query = query.Where(l => l.Action.StartsWith("USER_"));
                }
                else if (upper == "PRODUCT")
                {
                    query = query.Where(l => l.Action.StartsWith("PRODUCT_"));
                }
                else if (upper == "CATEGORY")
                {
                    query = query.Where(l => l.Action.StartsWith("CATEGORY_"));
                }
                else if (upper == "SUPPLIER")
                {
                    query = query.Where(l => l.Action.StartsWith("SUPPLIER_"));
                }
                else if (upper == "ORDER" || upper == "SALE")
                {
                    query = query.Where(l => l.Action == "ORDER_CREATED" || l.Action == "SALE");
                }
                else if (upper == "RECEIPT" || upper == "IMPORT")
                {
                    query = query.Where(l => l.Action == "GOODS_RECEIPT_CREATED" || l.Action == "RECEIPT" || l.Action == "IMPORT");
                }
                else if (upper == "STOCK" || upper == "INVENTORY")
                {
                    query = query.Where(l => l.Action == "STOCK_ADJUSTED" || l.Action.Contains("ADJUST"));
                }
                else
                {
                    query = query.Where(l => l.Action == action);
                }
            }

            if (startDate.HasValue)
            {
                var utcStart = startDate.Value.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(startDate.Value, DateTimeKind.Utc)
                    : startDate.Value.ToUniversalTime();
                query = query.Where(l => l.CreatedAt >= utcStart);
            }
            if (endDate.HasValue)
            {
                var utcEnd = endDate.Value.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(endDate.Value, DateTimeKind.Utc)
                    : endDate.Value.ToUniversalTime();
                query = query.Where(l => l.CreatedAt <= utcEnd);
            }

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
                    CreatedAt = DateTime.SpecifyKind(l.CreatedAt, DateTimeKind.Utc),
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
                    CreatedAt = DateTime.SpecifyKind(l.CreatedAt, DateTimeKind.Utc),
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
            {
                var upper = action.ToUpperInvariant();
                if (upper == "LOGIN")
                {
                    query = query.Where(l => l.Action == "LOGIN_SUCCESS" || l.Action == "LOGIN_FAILURE" || l.Action == "LOGIN_FAILED" || l.Action == "LOGOUT");
                }
                else if (upper == "USER" || upper == "ACCOUNT")
                {
                    query = query.Where(l => l.Action.StartsWith("USER_"));
                }
                else if (upper == "PRODUCT")
                {
                    query = query.Where(l => l.Action.StartsWith("PRODUCT_"));
                }
                else if (upper == "CATEGORY")
                {
                    query = query.Where(l => l.Action.StartsWith("CATEGORY_"));
                }
                else if (upper == "SUPPLIER")
                {
                    query = query.Where(l => l.Action.StartsWith("SUPPLIER_"));
                }
                else if (upper == "ORDER" || upper == "SALE")
                {
                    query = query.Where(l => l.Action == "ORDER_CREATED" || l.Action == "SALE");
                }
                else if (upper == "RECEIPT" || upper == "IMPORT")
                {
                    query = query.Where(l => l.Action == "GOODS_RECEIPT_CREATED" || l.Action == "RECEIPT" || l.Action == "IMPORT");
                }
                else if (upper == "STOCK" || upper == "INVENTORY")
                {
                    query = query.Where(l => l.Action == "STOCK_ADJUSTED" || l.Action.Contains("ADJUST"));
                }
                else
                {
                    query = query.Where(l => l.Action == action);
                }
            }

            if (startDate.HasValue)
            {
                var utcStart = startDate.Value.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(startDate.Value, DateTimeKind.Utc)
                    : startDate.Value.ToUniversalTime();
                query = query.Where(l => l.CreatedAt >= utcStart);
            }
            if (endDate.HasValue)
            {
                var utcEnd = endDate.Value.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(endDate.Value, DateTimeKind.Utc)
                    : endDate.Value.ToUniversalTime();
                query = query.Where(l => l.CreatedAt <= utcEnd);
            }

            return await query.CountAsync();
        }
    }
}
