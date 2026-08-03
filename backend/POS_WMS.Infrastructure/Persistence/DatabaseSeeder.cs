using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
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
            await context.Database.MigrateAsync();

            if (!context.Set<User>().Any())
            {
                var passwordHasher = new PasswordHasher<User>();

                var admin = new User
                {
                    Username = "admin",
                    Name = "Quản trị viên hệ thống",
                    Role = UserRole.Admin,
                    Phone = "0987654321",
                    IsActive = true
                };
                admin.PasswordHash = passwordHasher.HashPassword(admin, "Admin@123");

                var cashier = new User
                {
                    Username = "cashier1",
                    Name = "Nguyễn Thu Ngân",
                    Role = UserRole.Cashier,
                    Phone = "0123456789",
                    IsActive = true
                };
                cashier.PasswordHash = passwordHasher.HashPassword(cashier, "Cashier@123");

                var warehouse = new User
                {
                    Username = "warehouse1",
                    Name = "Nguyễn Thủ Kho",
                    Role = UserRole.WarehouseStaff,
                    Phone = "0111122223",
                    IsActive = true
                };
                warehouse.PasswordHash = passwordHasher.HashPassword(warehouse, "Warehouse@123");

                await context.Set<User>().AddRangeAsync(admin, cashier, warehouse);
                await context.SaveChangesAsync();

                Console.WriteLine("Seed thử 3 user");
            }
        }
    }
}