using POS_WMS.Application.DTOs;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace POS_WMS.Application.Interfaces
{
    public interface IGoodsReceiptService
    {
        Task<List<GoodsReceiptDto>> GetAllAsync();
        Task<GoodsReceiptDto> GetByIdAsync(int id);
        Task<GoodsReceiptDto> CreateAsync(CreateGoodsReceiptRequestDto request);
        Task<int> SyncOfflineGoodsReceiptAsync(GoodsReceiptSyncRequestDto request);
    }
}
