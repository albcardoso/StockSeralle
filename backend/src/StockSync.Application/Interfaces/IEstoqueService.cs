using StockSync.Application.DTOs;

namespace StockSync.Application.Interfaces;

public interface IEstoqueService
{
    Task<EstoqueStatsDto> GetStatsAsync();

    Task<PagedResult<ConciliacaoItemDto>> GetConciliacaoAsync(
        int page, int pageSize, string? status);

    Task<ImportResultDto> ImportarErpAsync(Stream fileStream, string fileName);

    Task<ImportResultDto> ImportarMeliAsync(Stream fileStream, string fileName);
}
