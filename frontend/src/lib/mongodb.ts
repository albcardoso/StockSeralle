/**
 * Conexão singleton com MongoDB para as API Routes do Next.js.
 *
 * Usa cache global para reutilizar a conexão entre requisições
 * (evita abrir uma nova conexão a cada request em serverless).
 *
 * Variável de ambiente:
 *   MONGODB_URI  — ex: mongodb://mongo:27017  (default: mongodb://localhost:27017)
 *   MONGODB_DB   — nome do banco              (default: stocksync)
 */

import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const MONGODB_DB = process.env.MONGODB_DB ?? "stocksync";

// Cache global para reusar conexão entre requests (Next.js hot-reload safe)
const globalWithMongo = globalThis as typeof globalThis & {
  _mongoClient?: MongoClient;
  _mongoClientPromise?: Promise<MongoClient>;
};

function getClientPromise(): Promise<MongoClient> {
  if (globalWithMongo._mongoClientPromise) {
    return globalWithMongo._mongoClientPromise;
  }

  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  globalWithMongo._mongoClientPromise = client.connect();
  globalWithMongo._mongoClient = client;

  return globalWithMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(MONGODB_DB);
}

export { MONGODB_URI, MONGODB_DB };
