using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace StockSync.API.Controllers;

/// <summary>
/// Receptor de webhooks dos marketplaces.
/// Retorna 200 imediatamente e processa em fila assíncrona (padrão recomendado).
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class WebhooksController : ControllerBase
{
    private readonly ILogger<WebhooksController> _logger;
    // TODO: injetar IMessageQueue quando RabbitMQ for configurado

    public WebhooksController(ILogger<WebhooksController> logger)
    {
        _logger = logger;
    }

    [HttpPost("{platform}")]
    public IActionResult Receive(string platform, [FromBody] JsonElement payload)
    {
        // Retorna 200 IMEDIATAMENTE — nunca processe aqui
        _logger.LogInformation(
            "Webhook recebido: platform={Platform} payload_size={Size}",
            platform, payload.GetRawText().Length);

        // TODO: publicar na fila (RabbitMQ / Azure Service Bus)
        // await _queue.PublishAsync(new WebhookMessage { Platform = platform, Payload = payload.ToString() });

        return Ok();
    }
}
