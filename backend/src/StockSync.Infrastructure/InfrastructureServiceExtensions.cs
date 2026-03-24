using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using StockSync.Infrastructure.Repositories;

namespace StockSync.Infrastructure;

public static class InfrastructureServiceExtensions
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // MongoDB
        var mongoConn = configuration["MongoDB:ConnectionString"]
            ?? "mongodb://localhost:27017";
        var mongoDb = configuration["MongoDB:DatabaseName"]
            ?? "stocksync";

        services.AddSingleton<IMongoClient>(_ => new MongoClient(mongoConn));
        services.AddSingleton(sp =>
            sp.GetRequiredService<IMongoClient>().GetDatabase(mongoDb));

        // Repositórios
        services.AddScoped<IEstoqueRepository, EstoqueRepository>();

        // TODO: registrar HttpClients com Polly para MeLi, Amazon, Shopee
        // services.AddHttpClient<IMeliHttpClient>()
        //     .AddPolicyHandler(PollyPolicies.RetryWithBackoff());

        return services;
    }
}
