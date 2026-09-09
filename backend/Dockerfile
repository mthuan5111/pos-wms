FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["POS_WMS.WebApi/POS_WMS.WebApi.csproj", "POS_WMS.WebApi/"]
COPY ["POS_WMS.Infrastructure/POS_WMS.Infrastructure.csproj", "POS_WMS.Infrastructure/"]
COPY ["POS_WMS.Application/POS_WMS.Application.csproj", "POS_WMS.Application/"]
COPY ["POS_WMS.Domain/POS_WMS.Domain.csproj", "POS_WMS.Domain/"]
RUN dotnet restore "POS_WMS.WebApi/POS_WMS.WebApi.csproj"

COPY . .
WORKDIR "/src/POS_WMS.WebApi"
RUN dotnet build "POS_WMS.WebApi.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "POS_WMS.WebApi.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=publish /app/publish .

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

ENTRYPOINT ["dotnet", "POS_WMS.WebApi.dll"] 