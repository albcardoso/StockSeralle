using Microsoft.Extensions.DependencyInjection;

namespace StockSync.Application;

public static class ApplicationServiceExtensions
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        // TODO: registrar services, commands, queries aqui à medida que forem criados
        // Exemplo:
        // services.AddScoped<IEstoqueService, EstoqueService>();

        return services;
    }
}
