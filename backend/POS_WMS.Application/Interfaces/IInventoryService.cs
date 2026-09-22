using POS_WMS.Application.DTOs;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace POS_WMS.Application.Interfaces
{
    public interface IInventoryService
    {
        Task<List<InventoryDto>> GetAllInventoriesAsync();
        Task<bool> AdjustStockAsync(int id, InventoryUpdateRequestDto request);
        Task<bool> SyncAdjustmentAsync(StockAdjustmentSyncDto request);
    }
}
