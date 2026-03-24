namespace StockSync.Domain.Entities;

/// <summary>
/// Representa um item de estoque da filial, após conciliação ERP x marketplace.
/// </summary>
public class ItemEstoque
{
    public string Id { get; set; } = string.Empty;

    /// <summary>SKU normalizado (chave de conciliação)</summary>
    public string Sku { get; set; } = string.Empty;

    public string? Descricao { get; set; }

    /// <summary>Quantidade no ERP (Space/VTEX)</summary>
    public int? QuantidadeErp { get; set; }

    /// <summary>Quantidade no Mercado Livre</summary>
    public int? QuantidadeMeli { get; set; }

    /// <summary>Status da conciliação</summary>
    public StatusConciliacao Status { get; set; }

    public DateTime UltimaAtualizacao { get; set; } = DateTime.UtcNow;

    /// <summary>Calcula a diferença MeLi - ERP</summary>
    public int? Diferenca =>
        QuantidadeMeli.HasValue && QuantidadeErp.HasValue
            ? QuantidadeMeli.Value - QuantidadeErp.Value
            : null;
}

public enum StatusConciliacao
{
    Ok,
    Divergente,
    SoErp,
    SoMeli
}
