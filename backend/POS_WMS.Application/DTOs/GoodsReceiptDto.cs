using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace POS_WMS.Application.DTOs
{
    public class GoodsReceiptDto
    {
        public int Id { get; set; }
        public int SupplierId { get; set; }
        public string SupplierName { get; set; } = string.Empty;
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public DateTime ReceiptDate { get; set; }
        public decimal TotalAmount { get; set; }
        public string Remarks { get; set; } = string.Empty;
        public string? OfflineReferenceId { get; set; }
        public string SyncStatus { get; set; } = "Synced";
        public string Status { get; set; } = "COMPLETED";
        public int? ShiftId { get; set; }
        public List<GoodsReceiptDetailDto> Details { get; set; } = new();
    }

    public class GoodsReceiptDetailDto
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string Barcode { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public decimal CostPrice { get; set; }
        public decimal Subtotal => Quantity * CostPrice;
    }

    public class CreateGoodsReceiptRequestDto
    {
        public string? OfflineReferenceId { get; set; }

        [Required]
        public int SupplierId { get; set; }

        [Required]
        public int UserId { get; set; }

        public string Remarks { get; set; } = string.Empty;

        public int? ShiftId { get; set; }

        [Required]
        public List<CreateGoodsReceiptDetailRequestDto> Details { get; set; } = new();
    }

    public class CreateGoodsReceiptDetailRequestDto
    {
        [Required]
        public int ProductId { get; set; }

        [Required]
        [Range(1, int.MaxValue, ErrorMessage = "Số lượng phải lớn hơn 0")]
        public int Quantity { get; set; }

        [Required]
        [Range(0, double.MaxValue, ErrorMessage = "Giá nhập không được âm")]
        public decimal CostPrice { get; set; }
    }

    public class GoodsReceiptSyncRequestDto
    {
        [Required]
        public string OfflineReferenceId { get; set; } = string.Empty;

        [Required]
        public int SupplierId { get; set; }

        [Required]
        public int UserId { get; set; }

        public string Remarks { get; set; } = string.Empty;

        public int? ShiftId { get; set; }

        [Required]
        public List<CreateGoodsReceiptDetailRequestDto> Details { get; set; } = new();
    }
}
