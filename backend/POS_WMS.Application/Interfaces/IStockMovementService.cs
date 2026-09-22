using POS_WMS.Application.DTOs;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace POS_WMS.Application.Interfaces
{
    public interface IStockMovementService
    {
        Task RecordMovementAsync(int productId, Domain.Enums.StockMovementType type, int quantity, string referenceType, int? referenceId, int balanceAfter, string createdBy, int? shiftId = null);
        Task<List<StockMovementDto>> GetMovementsAsync(int? productId, string? type, DateTime? startDate, DateTime? endDate, int page = 1, int pageSize = 50);
    }
}
