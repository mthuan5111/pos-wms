using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using POS_WMS.Domain.Entities;
using POS_WMS.Domain.Enums;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace POS_WMS.Infrastructure.Persistence
{
    public static class DatabaseSeeder
    {
        public static async Task SeedDataAsync(IServiceProvider serviceProvider)
        {
            var context = serviceProvider.GetRequiredService<ApplicationDbContext>();
            var configuration = serviceProvider.GetRequiredService<IConfiguration>();
            await context.Database.MigrateAsync();

            var passwordHasher = new PasswordHasher<User>();
            bool hasChanges = false;

            // Read seed passwords from configuration (environment variables or appsettings)
            var adminPassword = configuration["SeedPasswords:Admin"];
            var managerPassword = configuration["SeedPasswords:Manager"];
            var cashierPassword = configuration["SeedPasswords:Cashier"];
            var warehousePassword = configuration["SeedPasswords:Warehouse"];

            if (string.IsNullOrWhiteSpace(adminPassword) ||
                string.IsNullOrWhiteSpace(managerPassword) ||
                string.IsNullOrWhiteSpace(cashierPassword) ||
                string.IsNullOrWhiteSpace(warehousePassword))
            {
                Console.WriteLine("[Seed] WARNING: Seed passwords not configured (SeedPasswords:Admin/Manager/Cashier/Warehouse). Skipping default account creation.");
            }
            else
            {
                if (!context.Set<User>().Any(u => u.Username == "admin"))
                {
                    var admin = new User
                    {
                        Username = "admin",
                        Name = "Quản trị viên hệ thống",
                        Role = UserRole.Admin,
                        Phone = "0987654321",
                        IsActive = true
                    };
                    admin.PasswordHash = passwordHasher.HashPassword(admin, adminPassword);
                    await context.Set<User>().AddAsync(admin);
                    hasChanges = true;
                }

                if (!context.Set<User>().Any(u => u.Username == "manager1"))
                {
                    var manager = new User
                    {
                        Username = "manager1",
                        Name = "Nguyễn Quản Lý",
                        Role = UserRole.Manager,
                        Phone = "0912345678",
                        IsActive = true
                    };
                    manager.PasswordHash = passwordHasher.HashPassword(manager, managerPassword);
                    await context.Set<User>().AddAsync(manager);
                    hasChanges = true;
                }

                if (!context.Set<User>().Any(u => u.Username == "cashier1"))
                {
                    var cashier = new User
                    {
                        Username = "cashier1",
                        Name = "Nguyễn Thu Ngân",
                        Role = UserRole.Cashier,
                        Phone = "0123456789",
                        IsActive = true
                    };
                    cashier.PasswordHash = passwordHasher.HashPassword(cashier, cashierPassword);
                    await context.Set<User>().AddAsync(cashier);
                    hasChanges = true;
                }

                if (!context.Set<User>().Any(u => u.Username == "warehouse1"))
                {
                    var warehouse = new User
                    {
                        Username = "warehouse1",
                        Name = "Nguyễn Thủ Kho",
                        Role = UserRole.WarehouseStaff,
                        Phone = "0111122223",
                        IsActive = true
                    };
                    warehouse.PasswordHash = passwordHasher.HashPassword(warehouse, warehousePassword);
                    await context.Set<User>().AddAsync(warehouse);
                    hasChanges = true;
                }

                if (hasChanges)
                {
                    await context.SaveChangesAsync();
                    Console.WriteLine("[Seed] Đã cập nhật tài khoản mặc định (Admin, Manager, Cashier, WarehouseStaff)");
                }
            }

            if (!context.Set<Customer>().Any())
            {
                var defaultCustomer = new Customer
                {
                    Name = "Khách lẻ",
                    Phone = "0000000000",
                    Address = "Khách mua trực tiếp tại quầy"
                };
                context.Set<Customer>().Add(defaultCustomer);
                await context.SaveChangesAsync();
                Console.WriteLine("[Seed] Đã tạo khách hàng mặc định");
            }

            // ONE-TIME CLEANUP: Clear old mock data if it exists
            var hasMockProducts = await context.Set<Product>().AnyAsync(p => p.Name.Contains("Mock") || p.Name == "Cà phê đen" || p.Name == "Áo thun cơ bản");
            if (hasMockProducts || await context.Set<Order>().AnyAsync())
            {
                context.Set<OrderDetail>().RemoveRange(context.Set<OrderDetail>());
                context.Set<Order>().RemoveRange(context.Set<Order>());
                context.Set<GoodsReceiptDetail>().RemoveRange(context.Set<GoodsReceiptDetail>());
                context.Set<GoodsReceipt>().RemoveRange(context.Set<GoodsReceipt>());
                context.Set<Inventory>().RemoveRange(context.Set<Inventory>());
                context.Set<Product>().RemoveRange(context.Set<Product>());
                context.Set<Category>().RemoveRange(context.Set<Category>());
                
                await context.SaveChangesAsync();
                Console.WriteLine("[Seed] Đã dọn dẹp sạch dữ liệu mock cũ");
            }
        }
    }
}