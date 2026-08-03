using System;
using System.Collections.Generic;
using POS_WMS.Domain.Entities;
using POS_WMS.Domain.Enums;

namespace POS_WMS.Application.DTOs
{
    public class OrderDetailDto
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
    }

    public class OrderDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public int CustomerId { get; set; }
        public decimal TotalAmount { get; set; }
        public DateTime OrderDate { get; set; }
        public OrderStatus Status { get; set; }
        public string OfflineReferenceId { get; set; } = string.Empty;

        public List<OrderDetailDto> Details { get; set; } = new List<OrderDetailDto>();
    }
}