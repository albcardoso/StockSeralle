using Microsoft.AspNetCore.Mvc;
using StockSync.Application.Interfaces;

namespace StockSync.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EstoqueController : ControllerBase
{
    private readonly IEstoqueService _estoqueService;
    private readonly ILogger<EstoqueController> _logger;

    public EstoqueController(IEstoqueService estoqueService, ILogger<EstoqueController> logger)
    {
        _estoqueService = estoqueService;
        _logger = logger;
    }

    /// <summary>
    /// Retorna métricas consolidadas da conciliação
    /// </summary>
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var stats = await _estoqueService.GetStatsAsync();
        return Ok(stats);
    }

    /// <summary>
    /// Lista itens da conciliação com filtros
    /// </summary>
    [HttpGet("conciliacao")]
    public async Task<IActionResult> GetConciliacao(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? status = null)
    {
        var result = await _estoqueService.GetConciliacaoAsync(page, pageSize, status);
        return Ok(result);
    }

    /// <summary>
    /// Upload e processamento de arquivo ERP (Space/VTEX)
    /// </summary>
    [HttpPost("importar/erp")]
    [RequestSizeLimit(50_000_000)] // 50 MB
    public async Task<IActionResult> ImportarErp(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("Arquivo inválido");

        using var stream = file.OpenReadStream();
        var resultado = await _estoqueService.ImportarErpAsync(stream, file.FileName);

        _logger.LogInformation("ERP importado: {Itens} itens processados", resultado.ItensProcessados);
        return Ok(resultado);
    }

    /// <summary>
    /// Upload e processamento de arquivo MeLi
    /// </summary>
    [HttpPost("importar/meli")]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> ImportarMeli(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("Arquivo inválido");

        using var stream = file.OpenReadStream();
        var resultado = await _estoqueService.ImportarMeliAsync(stream, file.FileName);

        _logger.LogInformation("MeLi importado: {Itens} itens processados", resultado.ItensProcessados);
        return Ok(resultado);
    }
}
