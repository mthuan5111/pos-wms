using Microsoft.EntityFrameworkCore;
using POS_WMS.Domain.Entities;
using POS_WMS.Domain.Enums;

namespace POS_WMS.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
    {
    }

    public DbSet<Category> Categories { get; set; }
    public DbSet<Customer> Customers { get; set; }
    public DbSet<GoodsReceipt> GoodsReceipts { get; set; }
    public DbSet<GoodsReceiptDetail> GoodsReceiptDetails { get; set; }
    public DbSet<Inventory> Inventories { get; set; }
    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderDetail> OrderDetails { get; set; }
    public DbSet<Product> Products { get; set; }
    public DbSet<Supplier> Suppliers { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<AuditLog> AuditLogs { get; set; }
    public DbSet<StockMovement> StockMovements { get; set; }
    public DbSet<Shift> Shifts { get; set; }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.Entity is User user && (entry.State == EntityState.Added || entry.State == EntityState.Modified))
            {
                user.NormalizedUsername = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeUsername(user.Username);
                user.Name = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeDisplayName(user.Name);
            }
            else if (entry.Entity is Category cat && (entry.State == EntityState.Added || entry.State == EntityState.Modified))
            {
                cat.NormalizedName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeForComparison(cat.Name);
                cat.Name = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeDisplayName(cat.Name);
            }
            else if (entry.Entity is Supplier sup && (entry.State == EntityState.Added || entry.State == EntityState.Modified))
            {
                sup.NormalizedName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeForComparison(sup.Name);
                sup.Name = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeDisplayName(sup.Name);
                if (!string.IsNullOrWhiteSpace(sup.TaxCode))
                    sup.TaxCode = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeTaxCode(sup.TaxCode);
                if (!string.IsNullOrWhiteSpace(sup.Email))
                    sup.Email = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeEmail(sup.Email);
                if (!string.IsNullOrWhiteSpace(sup.Phone))
                    sup.Phone = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizePhone(sup.Phone);
            }
            else if (entry.Entity is Product prod && (entry.State == EntityState.Added || entry.State == EntityState.Modified))
            {
                prod.NormalizedName = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeForComparison(prod.Name);
                prod.Name = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeDisplayName(prod.Name);
                prod.Barcode = POS_WMS.Domain.Common.StringNormalizationHelper.NormalizeBarcode(prod.Barcode);
            }
            else if (entry.Entity is OrderDetail od && entry.State == EntityState.Added)
            {
                if (string.IsNullOrEmpty(od.ProductName) && od.Product != null)
                {
                    od.ProductName = od.Product.Name;
                    od.Barcode = od.Product.Barcode;
                }
            }
            else if (entry.Entity is GoodsReceiptDetail grd && entry.State == EntityState.Added)
            {
                if (string.IsNullOrEmpty(grd.ProductName) && grd.Product != null)
                {
                    grd.ProductName = grd.Product.Name;
                    grd.Barcode = grd.Product.Barcode;
                }
            }
        }
        return base.SaveChangesAsync(cancellationToken);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);


        modelBuilder.Entity<User>()
        .Property(u => u.Role)
        .HasConversion<string>();

        modelBuilder.Entity<Category>(entity =>
        {
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.NormalizedName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.Code).HasMaxLength(50);
            entity.Property(e => e.DeactivationReason).HasMaxLength(500);
            entity.HasIndex(e => e.NormalizedName).IsUnique();
            entity.HasIndex(e => e.Code).IsUnique().HasFilter("[Code] IS NOT NULL");
        });

        modelBuilder.Entity<Customer>(entity =>
        {
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Phone).IsRequired().HasMaxLength(20);
            entity.Property(e => e.Address).HasMaxLength(500);
            entity.Property(e => e.Code).HasMaxLength(50);
            entity.HasIndex(e => e.Code).IsUnique().HasFilter("[Code] IS NOT NULL");
            entity.HasIndex(e => e.Phone).IsUnique();
        });

        modelBuilder.Entity<GoodsReceipt>(entity =>
        {
            entity.Property(e => e.TotalAmount).HasColumnType("decimal(18,2)");
            entity.Property(e => e.OfflineReferenceId).HasMaxLength(100);
            entity.HasIndex(e => e.OfflineReferenceId).IsUnique().HasFilter("[OfflineReferenceId] IS NOT NULL");
            entity.ToTable(t => t.HasCheckConstraint("CK_GoodsReceipt_TotalAmount_NonNegative", "[TotalAmount] >= 0"));
        });

        modelBuilder.Entity<GoodsReceiptDetail>(entity =>
        {
            entity.Property(e => e.CostPrice).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.ProductName).HasMaxLength(200);
            entity.Property(e => e.Barcode).HasMaxLength(50);
            entity.ToTable(t =>
            {
                t.HasCheckConstraint("CK_GoodsReceiptDetail_CostPrice_NonNegative", "[CostPrice] >= 0");
                t.HasCheckConstraint("CK_GoodsReceiptDetail_Quantity_Positive", "[Quantity] > 0");
            });
        });

        modelBuilder.Entity<Inventory>(entity =>
        {
            entity.Property(e => e.StockQuantity).IsRequired();
            entity.ToTable(t => t.HasCheckConstraint("CK_Inventory_StockQuantity_NonNegative", "[StockQuantity] >= 0"));
            entity.Property(e => e.RowVersion).IsRowVersion();
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.Property(e => e.TotalAmount).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.OfflineReferenceId).HasMaxLength(100);
            entity.HasIndex(e => e.OfflineReferenceId).IsUnique().HasFilter("[OfflineReferenceId] IS NOT NULL");
            entity.ToTable(t => t.HasCheckConstraint("CK_Order_TotalAmount_NonNegative", "[TotalAmount] >= 0"));
            entity.Property(e => e.Status).HasConversion<string>();
            entity.Property(e => e.PaymentMethod).HasMaxLength(50).HasDefaultValue("CASH");
        });

        modelBuilder.Entity<OrderDetail>(entity =>
        {
            entity.Property(e => e.UnitPrice).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.ProductName).HasMaxLength(200);
            entity.Property(e => e.Barcode).HasMaxLength(50);
            entity.ToTable(t =>
            {
                t.HasCheckConstraint("CK_OrderDetail_Quantity_Positive", "[Quantity] > 0");
                t.HasCheckConstraint("CK_OrderDetail_UnitPrice_NonNegative", "[UnitPrice] >= 0");
            });
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.Property(e => e.NormalizedName).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Barcode).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Price).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.CostPrice).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.ImageUrl).HasMaxLength(1000);
            entity.Property(e => e.DeactivationReason).HasMaxLength(500);
            entity.HasIndex(e => e.Barcode).IsUnique();
            // Requirement 7A.B.2: Uniqueness of normalized product name scoped to category
            entity.HasIndex(e => new { e.NormalizedName, e.CategoryId }).IsUnique();
            entity.ToTable(t => t.HasCheckConstraint("CK_Product_Price_NonNegative", "[Price] >= 0"));

            entity.HasOne(p => p.Supplier)
                .WithMany()
                .HasForeignKey(p => p.SupplierId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Supplier>(entity =>
        {
            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.Property(e => e.NormalizedName).IsRequired().HasMaxLength(200);
            entity.Property(e => e.ContactPerson).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Phone).IsRequired().HasMaxLength(20);
            entity.Property(e => e.Email).HasMaxLength(100);
            entity.Property(e => e.TaxCode).HasMaxLength(50);
            entity.Property(e => e.Address).HasMaxLength(500);
            entity.Property(e => e.DeactivationReason).HasMaxLength(500);
            entity.HasIndex(e => e.NormalizedName).IsUnique();
            entity.HasIndex(e => e.TaxCode).IsUnique().HasFilter("[TaxCode] IS NOT NULL");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Username).IsRequired().HasMaxLength(50);
            entity.Property(e => e.NormalizedUsername).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PasswordHash).IsRequired().HasMaxLength(500);
            entity.Property(e => e.Phone).IsRequired().HasMaxLength(20);
            entity.HasIndex(e => e.Username).IsUnique();
            entity.HasIndex(e => e.NormalizedUsername).IsUnique();
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.Property(e => e.UserName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Action).IsRequired().HasMaxLength(50);
            entity.Property(e => e.EntityType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.EntityId).HasMaxLength(50);
            entity.Property(e => e.Details).HasMaxLength(1000);
            entity.Property(e => e.IpAddress).HasMaxLength(50);
            entity.Property(e => e.CorrelationId).HasMaxLength(100);
            entity.Property(e => e.Result).HasMaxLength(50);
            entity.HasIndex(e => e.CreatedAt);
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.Action);

            entity.HasOne(a => a.User)
                .WithMany()
                .HasForeignKey(a => a.UserId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<StockMovement>(entity =>
        {
            entity.Property(e => e.MovementType).HasConversion<string>().HasMaxLength(20);
            entity.Property(e => e.ReferenceType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.CreatedBy).IsRequired().HasMaxLength(100);
            entity.HasIndex(e => e.ProductId);
            entity.HasIndex(e => e.CreatedAt);
        });

        modelBuilder.Entity<GoodsReceipt>()
        .HasOne(g => g.Supplier)
        .WithMany()
        .HasForeignKey(g => g.SupplierId)
        .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<GoodsReceipt>()
        .HasOne(g => g.User)
        .WithMany()
        .HasForeignKey(g => g.UserId)
        .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<GoodsReceiptDetail>()
        .HasOne(gd => gd.GoodsReceipt)
        .WithMany(g => g.GoodsReceiptDetails)
        .HasForeignKey(gd => gd.GoodsReceiptId)
        .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<GoodsReceiptDetail>()
        .HasOne(gd => gd.Product)
        .WithMany()
        .HasForeignKey(gd => gd.ProductId)
        .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Product>()
        .HasOne(p => p.Category)
        .WithMany()
        .HasForeignKey(p => p.CategoryId)
        .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Inventory>()
        .HasOne(i => i.Product)
        .WithOne()
        .HasForeignKey<Inventory>(i => i.ProductId)
        .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Order>()
        .HasOne(o => o.User)
        .WithMany()
        .HasForeignKey(o => o.UserId)
        .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Order>()
        .HasOne(o => o.Customer)
        .WithMany()
        .HasForeignKey(o => o.CustomerId)
        .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<OrderDetail>()
        .HasOne(od => od.Order)
        .WithMany(o => o.OrderDetails)
        .HasForeignKey(od => od.OrderId)
        .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<OrderDetail>()
        .HasOne(od => od.Product)
        .WithMany()
        .HasForeignKey(od => od.ProductId)
        .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Shift>(entity =>
        {
            entity.Property(e => e.Role).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(e => e.ClosingRemarks).HasMaxLength(500);
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.StartedAt);

            entity.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Order>()
            .HasOne(o => o.Shift)
            .WithMany()
            .HasForeignKey(o => o.ShiftId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<GoodsReceipt>()
            .HasOne(g => g.Shift)
            .WithMany()
            .HasForeignKey(g => g.ShiftId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<StockMovement>()
            .HasOne(sm => sm.Shift)
            .WithMany()
            .HasForeignKey(sm => sm.ShiftId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Product>()
            .Property(p => p.LowStockThreshold)
            .HasDefaultValue(10);

        modelBuilder.Entity<Product>()
            .Property(p => p.IsSalePriceConfigured)
            .HasDefaultValue(true);
    }
}
