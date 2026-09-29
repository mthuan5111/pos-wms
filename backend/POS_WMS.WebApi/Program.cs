using System;
using System.Collections.Generic;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.EntityFrameworkCore;
using POS_WMS.Infrastructure.Persistence;
using POS_WMS.Infrastructure.Services;
using POS_WMS.Application.Interfaces;
using Scalar.AspNetCore;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicyName = "FrontendCors";

// 1. Thu thập danh sách allowed origins từ cấu hình appsettings và biến môi trường
var configOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
var envOriginsString = builder.Configuration["CORS_ALLOWED_ORIGINS"]
    ?? builder.Configuration["Cors:AllowedOrigins"]
    ?? string.Empty;

var rawOrigins = new List<string>(configOrigins);
if (!string.IsNullOrWhiteSpace(envOriginsString))
{
    var split = envOriginsString.Split(new[] { ',', ';', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
    rawOrigins.AddRange(split);
}

// 2. Chuẩn hóa: trim khoảng trắng, bỏ dấu '/' cuối URL, loại bỏ phần tử rỗng và trùng lặp
var allowedOriginsSet = rawOrigins
    .Select(o => o.Trim().TrimEnd('/'))
    .Where(o => !string.IsNullOrEmpty(o))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToHashSet(StringComparer.OrdinalIgnoreCase);

// 3. Danh sách origin phát triển mặc định (localhost, 127.0.0.1 các cổng thông dụng)
var devOrigins = new[]
{
    "http://localhost:8081",
    "http://localhost:8082",
    "http://localhost:3000",
    "http://localhost:5050",
    "http://localhost:5173",
    "http://localhost:19006",
    "http://127.0.0.1:8081",
    "http://127.0.0.1:8082",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5050"
};

bool isDevelopment = builder.Environment.IsDevelopment();
bool allowExpoTunnel = isDevelopment ||
    builder.Configuration.GetValue<bool>("Cors:AllowExpoTunnel") ||
    string.Equals(builder.Configuration["CORS_ALLOW_EXPO_TUNNEL"], "true", StringComparison.OrdinalIgnoreCase);

if (isDevelopment)
{
    foreach (var devOrigin in devOrigins)
    {
        allowedOriginsSet.Add(devOrigin);
    }
}
else
{
    // Fallback domain production nếu chưa cấu hình trong biến môi trường
    if (allowedOriginsSet.Count == 0)
    {
        allowedOriginsSet.Add("https://pos-wms-frontend.com");
    }
}

// Startup validation & diagnostics logging (không ghi thông tin nhạy cảm)
Console.WriteLine($"[CORS Startup] Môi trường: {builder.Environment.EnvironmentName}, Cho phép Expo Tunnel: {allowExpoTunnel}, Tổng Origins cho phép: {allowedOriginsSet.Count}");
foreach (var origin in allowedOriginsSet)
{
    Console.WriteLine($"[CORS Startup] -> Cho phép: {origin}");
}

// Hàm kiểm tra Origin hợp lệ với quy tắc nghiêm ngặt
bool IsOriginPermitted(string? origin)
{
    if (string.IsNullOrWhiteSpace(origin)) return false;
    var normalized = origin.Trim().TrimEnd('/');

    if (allowedOriginsSet.Contains(normalized)) return true;

    // Trong môi trường development cho phép mọi port của localhost / 127.0.0.1
    if (isDevelopment && Uri.TryCreate(normalized, UriKind.Absolute, out var uriDev))
    {
        if ((uriDev.Scheme == Uri.UriSchemeHttp || uriDev.Scheme == Uri.UriSchemeHttps) &&
            (uriDev.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
             uriDev.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }
    }

    // Expo tunnel: Chỉ cho phép HTTPS và hostname phải kết thúc bằng .exp.direct
    if (allowExpoTunnel && Uri.TryCreate(normalized, UriKind.Absolute, out var uriTunnel))
    {
        if (uriTunnel.Scheme == Uri.UriSchemeHttps &&
            (uriTunnel.Host.Equals("exp.direct", StringComparison.OrdinalIgnoreCase) ||
             uriTunnel.Host.EndsWith(".exp.direct", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }
    }

    return false;
}

// Đăng ký bộ validator vào DI để middleware exception có thể tái sử dụng
builder.Services.AddSingleton<Func<string?, bool>>(IsOriginPermitted);

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
    {
        policy.SetIsOriginAllowed(IsOriginPermitted)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.MigrationsAssembly("POS_WMS.Infrastructure")
    ));

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer<BearerSecuritySchemeTransformer>();
});

builder.Services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddScoped<IInventoryService, InventoryService>();
builder.Services.AddScoped<IGoodsReceiptService, GoodsReceiptService>();
builder.Services.AddScoped<IReportService, ReportService>();
builder.Services.AddScoped<IAuditLogService, AuditLogService>();
builder.Services.AddScoped<IStockMovementService, StockMovementService>();
builder.Services.AddScoped<IShiftService, ShiftService>();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
    };
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = async context =>
        {
            var isDemoClaim = context.Principal?.FindFirst("is_demo")?.Value;
            var roleClaim = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            var userIdClaim = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (isDemoClaim == "true" || roleClaim == "DemoUser" || userIdClaim == "0")
            {
                // Virtual Demo user bypasses DB check to preserve clean database baseline without seeding
                return;
            }
            if (!int.TryParse(userIdClaim, out var userId) || userId <= 0)
            {
                context.Fail("Invalid user identifier.");
                return;
            }
            var dbContext = context.HttpContext.RequestServices.GetRequiredService<ApplicationDbContext>();
            var user = await dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null || !user.IsActive)
            {
                context.Fail("User is deactivated or no longer exists.");
            }
        }
    };
});

var app = builder.Build();

app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options.WithOpenApiRoutePattern("openapi/v1.json");
        options.WithTitle("POS WMS API Dashboard");
        options.WithTheme(ScalarTheme.Mars);
    });
}

app.UseMiddleware<POS_WMS.WebApi.Middlewares.GlobalExceptionMiddleware>();

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseStaticFiles();
app.UseRouting();
app.UseCors(CorsPolicyName);
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new
{
    status = "Healthy",
    timestamp = DateTime.UtcNow,
    environment = app.Environment.EnvironmentName
}));

app.Run();

internal sealed class BearerSecuritySchemeTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        var bearerScheme = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            In = ParameterLocation.Header,
            BearerFormat = "JWT"
        };

        document.Components ??= new OpenApiComponents();
        document.AddComponent("Bearer", bearerScheme);

        var securityRequirement = new OpenApiSecurityRequirement
        {
            [new OpenApiSecuritySchemeReference("Bearer", document)] = []
        };
        if (document.Paths != null)
        {
            foreach (var path in document.Paths.Values)
            {
                if (path.Operations != null)
                {
                    foreach (var operation in path.Operations.Values)
                    {
                        operation.Security ??= new List<OpenApiSecurityRequirement>();
                        operation.Security.Add(securityRequirement);
                    }
                }
            }
        }
        return Task.CompletedTask;
    }
}
