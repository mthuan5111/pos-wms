# start_clone_backend.ps1
# Runs local backend targeting POS_WMS_TEST_CLONE
$env:ConnectionStrings__DefaultConnection = "Server=localhost;Database=POS_WMS_TEST_CLONE;Integrated Security=True;TrustServerCertificate=True;MultipleActiveResultSets=True;"
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet run --project backend/POS_WMS.WebApi/POS_WMS.WebApi.csproj
