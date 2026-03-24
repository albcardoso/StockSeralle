namespace StockSync.Application.DTOs;

public record EstoqueStatsDto(
    int TotalErp,
    int TotalMeli,
    int Divergencias,
    int SoErp,
    int SoMeli,
    int OkCount
);

public record ConciliacaoItemDto(
    string Sku,
    string? Descricao,
    int? QtdErp,
    int? QtdMeli,
    int? Diferenca,
    string Status // "ok" | "divergente" | "so_erp" | "so_meli"
);

public record ImportResultDto(
    int ItensProcessados,
    int ItensInvalidos,
    string[] Erros
);

public class PagedResult<T>
{
    public List<T> Data { get; init; } = new();
    public int Total { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public bool HasNext => (Page * PageSize) < Total;
}
