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
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        }
        else
        {
            // Explicit production whitelist fallback if configuration is missing (no wildcard)
            policy.WithOrigins(
                "https://pos-wms-frontend.com",
                "http://localhost:8081",
                "http://localhost:8082",
                "http://localhost:3000",
                "http://127.0.0.1:8081",
                "http://127.0.0.1:8082"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
        }
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

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseStaticFiles();
app.UseRouting();
app.UseCors(CorsPolicyName);
app.UseMiddleware<POS_WMS.WebApi.Middlewares.GlobalExceptionMiddleware>();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

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