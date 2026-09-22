using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.DTOs;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using POS_WMS.Domain.Enums;
using POS_WMS.Infrastructure.Persistence;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace POS_WMS.Infrastructure.Services
{
    public class StockMovementService : IStockMovementService
    {
        private readonly ApplicationDbContext _context;

        public StockMovementService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task RecordMovementAsync(int productId, StockMovementType type, int quantity, string referenceType, int? referenceId, int balanceAfter, string createdBy, int? shiftId = null)
        {
            var movement = new StockMovement
            {
                ProductId = productId,
                MovementType = type,
                Quantity = quantity,
                ReferenceType = referenceType,
                ReferenceId = referenceId,
                BalanceAfter = balanceAfter,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow,
                ShiftId = shiftId
            };

            await _context.StockMovements.AddAsync(movement);
            await _context.SaveChangesAsync();
        }

        public async Task<List<StockMovementDto>> GetMovementsAsync(int? productId, string? type, DateTime? startDate, DateTime? endDate, int page = 1, int pageSize = 50)
        {
            var query = _context.StockMovements
                .Include(m => m.Product)
                .AsQueryable();

            if (productId.HasValue)
                query = query.Where(m => m.ProductId == productId.Value);
            if (!string.IsNullOrEmpty(type) && Enum.TryParse<StockMovementType>(type, true, out var movementType))
                query = query.Where(m => m.MovementType == movementType);
            if (startDate.HasValue)
                query = query.Where(m => m.CreatedAt >= startDate.Value);
            if (endDate.HasValue)
                query = query.Where(m => m.CreatedAt <= endDate.Value);

            return await query
                .OrderByDescending(m => m.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(m => new StockMovementDto
                {
                    Id = m.Id,
                    ProductId = m.ProductId,
                    ProductName = m.Product != null ? m.Product.Name : "Unknown",
                    MovementType = m.MovementType.ToString(),
                    Quantity = m.Quantity,
                    ReferenceType = m.ReferenceType,
                    ReferenceId = m.ReferenceId,
                    BalanceAfter = m.BalanceAfter,
                    CreatedAt = m.CreatedAt,
                    CreatedBy = m.CreatedBy
                })
                .ToListAsync();
        }
    }
}
