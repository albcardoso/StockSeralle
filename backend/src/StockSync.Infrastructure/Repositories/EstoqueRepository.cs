using MongoDB.Driver;
using StockSync.Domain.Entities;

namespace StockSync.Infrastructure.Repositories;

public interface IEstoqueRepository
{
    Task<List<ItemEstoque>> GetAllAsync(int page, int pageSize, StatusConciliacao? status = null);
    Task<long> CountAsync(StatusConciliacao? status = null);
    Task UpsertAsync(ItemEstoque item);
    Task BulkUpsertAsync(IEnumerable<ItemEstoque> items);
    Task DeleteAllAsync();
}

public class EstoqueRepository : IEstoqueRepository
{
    private readonly IMongoCollection<ItemEstoque> _collection;

    public EstoqueRepository(IMongoDatabase database)
    {
        _collection = database.GetCollection<ItemEstoque>("estoque");

        // Índice único por SKU
        var indexKeys = Builders<ItemEstoque>.IndexKeys.Ascending(x => x.Sku);
        var indexOptions = new CreateIndexOptions { Unique = true };
        _collection.Indexes.CreateOne(new CreateIndexModel<ItemEstoque>(indexKeys, indexOptions));
    }

    public async Task<List<ItemEstoque>> GetAllAsync(
        int page, int pageSize, StatusConciliacao? status = null)
    {
        var filter = status.HasValue
            ? Builders<ItemEstoque>.Filter.Eq(x => x.Status, status.Value)
            : Builders<ItemEstoque>.Filter.Empty;

        return await _collection
            .Find(filter)
            .SortBy(x => x.Status)
            .Skip((page - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync();
    }

    public async Task<long> CountAsync(StatusConciliacao? status = null)
    {
        var filter = status.HasValue
            ? Builders<ItemEstoque>.Filter.Eq(x => x.Status, status.Value)
            : Builders<ItemEstoque>.Filter.Empty;

        return await _collection.CountDocumentsAsync(filter);
    }

    public async Task UpsertAsync(ItemEstoque item)
    {
        var filter = Builders<ItemEstoque>.Filter.Eq(x => x.Sku, item.Sku);
        var options = new ReplaceOptions { IsUpsert = true };
        await _collection.ReplaceOneAsync(filter, item, options);
    }

    public async Task BulkUpsertAsync(IEnumerable<ItemEstoque> items)
    {
        var ops = items.Select(item =>
        {
            var filter = Builders<ItemEstoque>.Filter.Eq(x => x.Sku, item.Sku);
            return new ReplaceOneModel<ItemEstoque>(filter, item) { IsUpsert = true };
        }).ToList();

        if (ops.Count > 0)
            await _collection.BulkWriteAsync(ops);
    }

    public async Task DeleteAllAsync() =>
        await _collection.DeleteManyAsync(Builders<ItemEstoque>.Filter.Empty);
}
