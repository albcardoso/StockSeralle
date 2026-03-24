# StockSync — Serallê

Plataforma de conciliação de estoque **ERP × Mercado Livre** para a filial Sampa Full.

---

## Stack

| Camada     | Tecnologia                    |
|-----------|-------------------------------|
| Frontend  | Next.js 15 + React 19 + TypeScript + Tailwind |
| Backend   | .NET 8 (C#) — ASP.NET Core Web API |
| Banco     | MongoDB 7                     |
| Auth      | OAuth 2.0 (MeLi) + JWT        |
| Infra dev | Docker Compose                |

---

## Estrutura do projeto (monorepo)

```
stocksync-seralle/
├── backend/                       ← .NET Core API
│   ├── src/
│   │   ├── StockSync.API/         ← Controllers, Program.cs
│   │   ├── StockSync.Application/ ← Services, DTOs, Interfaces
│   │   ├── StockSync.Domain/      ← Entidades de domínio
│   │   └── StockSync.Infrastructure/ ← MongoDB, Adapters MeLi
│   ├── tests/StockSync.Tests/
│   ├── Dockerfile
│   └── StockSync.sln
├── frontend/                      ← Next.js App
│   ├── src/
│   │   ├── app/
│   │   │   ├── (dashboard)/       ← Dashboard, Conciliação, Estoque
│   │   │   └── api/               ← Webhooks, OAuth callbacks
│   │   ├── components/
│   │   │   ├── layout/            ← Header, Sidebar
│   │   │   └── features/          ← Componentes por feature
│   │   ├── lib/                   ← API client, xlsx-parser
│   │   └── types/                 ← TypeScript types
│   ├── legacy/                    ← MVP HTML de referência
│   └── Dockerfile
├── docs/
├── .vscode/                       ← Extensions recomendadas + launch configs
├── docker-compose.yml
└── .gitignore
```

---

## Como rodar localmente

### Opção 1: Docker Compose (recomendado)

```bash
# Sobe MongoDB + API + Frontend
docker compose up

# Acesse:
# Frontend:      http://localhost:3000
# API (Swagger): http://localhost:5000/swagger
# Mongo Express: http://localhost:8081
```

### Opção 2: Rodar separado (sem Docker)

**Backend (requer .NET 8 SDK)**
```bash
cd backend
dotnet restore
dotnet run --project src/StockSync.API
# API em http://localhost:5000
```

**Frontend (requer Node.js 18+)**
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
# Frontend em http://localhost:3000
```

---

## Variáveis de ambiente

```bash
# frontend/.env.local
API_URL=http://localhost:5000
MELI_APP_ID=
MELI_CLIENT_SECRET=
MELI_REDIRECT_URI=http://localhost:3000/api/auth/mercadolivre/callback
```

---

## Features implementadas (MVP)

- [x] Conciliação ERP (Space/VTEX) × Mercado Livre via upload XLSX
- [x] Dashboard com métricas de divergência
- [x] Tabela filtrada por status (OK, Divergente, Só ERP, Só MeLi)

## Próximos passos

- [ ] Conectar frontend ao backend via API REST
- [ ] Persistência dos dados no MongoDB
- [ ] Auth com OAuth MeLi
- [ ] Sincronização automática via API MeLi
- [ ] Deploy (Vercel + Railway / Azure)

---

## Git workflow

```
main        ← produção (protegido)
develop     ← integração
feature/*   ← novas funcionalidades
fix/*       ← correções
```

Commits seguem Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`