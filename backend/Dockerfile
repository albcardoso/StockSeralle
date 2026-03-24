# ── Build stage ──────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copia solution e projects para restaurar dependências (layer cache)
COPY StockSync.sln .
COPY src/StockSync.API/StockSync.API.csproj src/StockSync.API/
COPY src/StockSync.Application/StockSync.Application.csproj src/StockSync.Application/
COPY src/StockSync.Domain/StockSync.Domain.csproj src/StockSync.Domain/
COPY src/StockSync.Infrastructure/StockSync.Infrastructure.csproj src/StockSync.Infrastructure/

RUN dotnet restore

# Copia o restante e publica
COPY . .
RUN dotnet publish src/StockSync.API/StockSync.API.csproj \
    -c Release -o /app/publish --no-restore

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "StockSync.API.dll"]
