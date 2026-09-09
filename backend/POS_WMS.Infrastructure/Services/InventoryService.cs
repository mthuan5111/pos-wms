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
    public class InventoryService : IInventoryService
    {
        private readonly ApplicationDbContext _context;

        public InventoryService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<InventoryDto>> GetAllInventoriesAsync()
        {
            var inventories = await _context.Inventories
                .Select(inv => new
                {
                    inv,
                    ProductName = _context.Products.FirstOrDefault(p => p.Id == inv.ProductId)!.Name
                })
                .ToListAsync();

            return inventories.Select(x => new InventoryDto
            {
                Id = x.inv.Id,
                ProductId = x.inv.ProductId,
                ProductName = x.ProductName ?? "Sản phẩm không xác định",
                StockQuantity = x.inv.StockQuantity,
                RowVersion = Convert.ToBase64String(x.inv.RowVersion)
            }).ToList();
        }

        public async Task<bool> AdjustStockAsync(int id, InventoryUpdateRequestDto request)
        {
            var inventory = await _context.Inventories.FirstOrDefaultAsync(i => i.Id == id);
            if (inventory == null)
            {
                throw new KeyNotFoundException("Không tìm thấy thông tin tồn kho");
            }

            byte[] clientRowVersion = Convert.FromBase64String(request.RowVersion);

            if (!inventory.RowVersion.SequenceEqual(clientRowVersion))
            {
                throw new DbUpdateConcurrencyException("Cảnh báo: Số lượng tồn kho đã bị thay đổi bởi một nhân viên khác! Vui lòng làm mới trang và thử lại");
            }

            inventory.StockQuantity = request.StockQuantity;
            _context.Inventories.Update(inventory);
            
            try
            {
                await _context.SaveChangesAsync();
                return true;
            }
            catch (DbUpdateConcurrencyException)
            {
                throw new DbUpdateConcurrencyException("Cảnh báo: Số lượng tồn kho đã bị thay đổi bởi một nhân viên khác! Vui lòng làm mới trang và thử lại");
            }
        }
    }
}
