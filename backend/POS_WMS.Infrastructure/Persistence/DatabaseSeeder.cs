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
            if (context.Database.IsRelational())
            {
                await context.Database.MigrateAsync();
            }

            var envName = configuration["ASPNETCORE_ENVIRONMENT"] ?? Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";
            bool isDevOrTest = envName.Equals("Development", StringComparison.OrdinalIgnoreCase) || envName.Equals("Testing", StringComparison.OrdinalIgnoreCase);
            bool seedDemoData = string.Equals(configuration["SeedDemoData"], "true", StringComparison.OrdinalIgnoreCase) || isDevOrTest;

            var passwordHasher = new PasswordHasher<User>();
            bool hasChanges = false;

            // Read seed passwords from configuration (environment variables or appsettings)
            var adminPassword = configuration["SeedPasswords:Admin"];
            var managerPassword = configuration["SeedPasswords:Manager"];
            var cashierPassword = configuration["SeedPasswords:Cashier"];
            var warehousePassword = configuration["SeedPasswords:Warehouse"];

            // 1. System Admin account: can be bootstrapped in any environment if configured and no Admin exists
            var existingAdmin = await context.Set<User>().FirstOrDefaultAsync(u => u.Role == UserRole.Admin);
            if (!string.IsNullOrWhiteSpace(adminPassword) && existingAdmin == null)
            {
                var admin = new User
                {
                    Username = "admin",
                    NormalizedUsername = "admin",
                    Name = "Quản trị viên hệ thống",
                    Role = UserRole.Admin,
                    Phone = "0987654321",
                    IsActive = true,
                    IsSystemAdmin = true,
                    IsProtected = true
                };
                admin.PasswordHash = passwordHasher.HashPassword(admin, adminPassword);
                await context.Set<User>().AddAsync(admin);
                hasChanges = true;
            }
            else if (existingAdmin != null)
            {
                if (!existingAdmin.IsSystemAdmin || !existingAdmin.IsProtected || string.IsNullOrEmpty(existingAdmin.NormalizedUsername))
                {
                    existingAdmin.IsSystemAdmin = true;
                    existingAdmin.IsProtected = true;
                    existingAdmin.NormalizedUsername = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeUsername(existingAdmin.Username);
                    hasChanges = true;
                }
            }

            // 2. Demo staff accounts: ONLY created if seedDemoData is enabled (Dev/Test or SeedDemoData=true)
            if (seedDemoData)
            {
                if (!string.IsNullOrWhiteSpace(managerPassword) && !context.Set<User>().Any(u => u.Username == "manager1"))
                {
                    var manager = new User
                    {
                        Username = "manager1",
                        NormalizedUsername = "manager1",
                        Name = "Nguyễn Quản Lý",
                        Role = UserRole.Manager,
                        Phone = "0912345678",
                        IsActive = true
                    };
                    manager.PasswordHash = passwordHasher.HashPassword(manager, managerPassword);
                    await context.Set<User>().AddAsync(manager);
                    hasChanges = true;
                }

                if (!string.IsNullOrWhiteSpace(cashierPassword) && !context.Set<User>().Any(u => u.Username == "cashier1"))
                {
                    var cashier = new User
                    {
                        Username = "cashier1",
                        NormalizedUsername = "cashier1",
                        Name = "Nguyễn Thu Ngân",
                        Role = UserRole.Cashier,
                        Phone = "0123456789",
                        IsActive = true
                    };
                    cashier.PasswordHash = passwordHasher.HashPassword(cashier, cashierPassword);
                    await context.Set<User>().AddAsync(cashier);
                    hasChanges = true;
                }

                if (!string.IsNullOrWhiteSpace(warehousePassword) && !context.Set<User>().Any(u => u.Username == "warehouse1"))
                {
                    var warehouse = new User
                    {
                        Username = "warehouse1",
                        NormalizedUsername = "warehouse1",
                        Name = "Nguyễn Thủ Kho",
                        Role = UserRole.WarehouseStaff,
                        Phone = "0111122223",
                        IsActive = true
                    };
                    warehouse.PasswordHash = passwordHasher.HashPassword(warehouse, warehousePassword);
                    await context.Set<User>().AddAsync(warehouse);
                    hasChanges = true;
                }
            }

            // Normalize any existing users, categories, suppliers, and products that might be missing normalized fields
            var unnormalizedUsers = await context.Set<User>().Where(u => string.IsNullOrEmpty(u.NormalizedUsername)).ToListAsync();
            foreach (var u in unnormalizedUsers)
            {
                u.NormalizedUsername = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeUsername(u.Username);
                hasChanges = true;
            }

            var unnormalizedCategories = await context.Set<Category>().Where(c => string.IsNullOrEmpty(c.NormalizedName)).ToListAsync();
            foreach (var c in unnormalizedCategories)
            {
                c.NormalizedName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeForComparison(c.Name);
                hasChanges = true;
            }

            var unnormalizedSuppliers = await context.Set<Supplier>().Where(s => string.IsNullOrEmpty(s.NormalizedName)).ToListAsync();
            foreach (var s in unnormalizedSuppliers)
            {
                s.NormalizedName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeForComparison(s.Name);
                hasChanges = true;
            }

            var unnormalizedProducts = await context.Set<Product>().Where(p => string.IsNullOrEmpty(p.NormalizedName)).ToListAsync();
            foreach (var p in unnormalizedProducts)
            {
                p.NormalizedName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeForComparison(p.Name);
                hasChanges = true;
            }

            if (hasChanges)
            {
                await context.SaveChangesAsync();
                Console.WriteLine("[Seed] Đã cập nhật tài khoản người dùng ban đầu");
            }

            // 3. System Customer: WALK_IN_CUSTOMER (Idempotent required reference record)
            var defaultCustomer = await context.Set<Customer>().FirstOrDefaultAsync(c => c.Code == "WALK_IN_CUSTOMER" || c.Phone == "0000000000");
            if (defaultCustomer == null)
            {
                defaultCustomer = new Customer
                {
                    Name = "Khách lẻ",
                    Phone = "0000000000",
                    Address = "Khách mua trực tiếp tại quầy",
                    Code = "WALK_IN_CUSTOMER",
                    IsSystem = true
                };
                context.Set<Customer>().Add(defaultCustomer);
                await context.SaveChangesAsync();
                Console.WriteLine("[Seed] Đã tạo khách hàng mặc định (WALK_IN_CUSTOMER)");
            }
            else if (defaultCustomer.Code != "WALK_IN_CUSTOMER" || !defaultCustomer.IsSystem)
            {
                defaultCustomer.Code = "WALK_IN_CUSTOMER";
                defaultCustomer.IsSystem = true;
                await context.SaveChangesAsync();
            }

            // 4. System Category: UNCATEGORIZED (Idempotent required reference record)
            var defaultCategory = await context.Set<Category>().FirstOrDefaultAsync(c => c.Code == "UNCATEGORIZED" || c.IsSystem);
            if (defaultCategory == null)
            {
                defaultCategory = new Category
                {
                    Name = "Mặc định",
                    Description = "Danh mục mặc định của hệ thống",
                    Code = "UNCATEGORIZED",
                    IsSystem = true
                };
                context.Set<Category>().Add(defaultCategory);
                await context.SaveChangesAsync();
                Console.WriteLine("[Seed] Đã tạo danh mục hệ thống mặc định");
            }

            
            // Ensure every active product has an Inventory record
            var activeProducts = await context.Set<Product>().Where(p => p.IsActive).ToListAsync();
            bool addedInventory = false;
            foreach (var p in activeProducts)
            {
                if (!await context.Set<Inventory>().AnyAsync(i => i.ProductId == p.Id))
                {
                    await context.Set<Inventory>().AddAsync(new Inventory { ProductId = p.Id, StockQuantity = 50 });
                    addedInventory = true;
                }
            }
            if (addedInventory)
            {
                await context.SaveChangesAsync();
                Console.WriteLine("[Seed] Đã cập nhật bản ghi tồn kho cho các sản phẩm còn thiếu");
            }
        }
    }
}