# 🚀 Guia de Deploy — StockSync

## Visão Geral

| Parte | Plataforma | Custo |
|-------|-----------|-------|
| **Frontend** (Next.js) | Vercel | Grátis (Hobby plan) |
| **Backend** (.NET 8) | Railway | ~$5/mês (Starter) |
| **MongoDB** | Railway Plugin | ~$5/mês |

> **Para testes da equipe agora:** o frontend funciona 100% de forma independente
> (importação de arquivos, conciliação, exportação CSV são tudo client-side).
> Você pode fazer o deploy **só do frontend na Vercel** hoje, sem precisar do backend.

---

## PARTE 1 — Frontend na Vercel

### Passo a passo

**1. Acesse [vercel.com](https://vercel.com) e faça login com o GitHub**

**2. Clique em "Add New Project" → "Import Git Repository"**
- Selecione o repositório `stocksync-seralle`

**3. Configure o projeto:**
- **Framework Preset:** Next.js (detectado automático)
- **Root Directory:** `frontend` ← *IMPORTANTE: clique em "Edit" e coloque `frontend`*
- **Build Command:** `npm run build` (padrão)
- **Output Directory:** `.next` (padrão)

**4. Variáveis de Ambiente (clique em "Environment Variables"):**

| Nome | Valor | Quando usar |
|------|-------|-------------|
| `API_URL` | `https://SEU-BACKEND.up.railway.app` | Após criar o backend no Railway |

> Se não tiver backend ainda, deixe sem a variável — o frontend funciona sem ele.

**5. Clique em "Deploy"**

Após ~2 minutos, você terá a URL: `https://stocksync-seralle.vercel.app`

---

### Adicionar seu domínio na Vercel

1. Vá em **Project Settings → Domains**
2. Clique em **"Add Domain"**
3. Digite seu domínio, ex: `estoque.seudominio.com.br`
4. A Vercel mostrará dois registros DNS para adicionar:

```
Tipo    Nome                    Valor
CNAME   estoque                 cname.vercel-dns.com
  — ou —
A       estoque                 76.76.21.21
```

5. Acesse o painel do seu provedor de domínio (Registro.br, GoDaddy, Cloudflare, etc.)
6. Adicione os registros DNS conforme mostrado
7. Aguarde até 1 hora para propagação
8. A Vercel provisiona SSL (HTTPS) automaticamente ✅

---

## PARTE 2 — Backend + MongoDB no Railway

> **Só necessário quando quiser persistência de dados e funcionalidades futuras.**

### Passo a passo

**1. Acesse [railway.app](https://railway.app) e faça login com o GitHub**

**2. Clique em "New Project" → "Deploy from GitHub repo"**
- Selecione o repositório `stocksync-seralle`

**3. Configure o serviço do backend:**
- **Root Directory:** `backend` ← clique em "Settings" e configure
- Railway detecta o Dockerfile automaticamente ✅

**4. Adicione o MongoDB:**
- No mesmo projeto, clique em **"+ New Service" → "Database" → "MongoDB"**
- Railway cria um MongoDB gerenciado e injeta `MONGODB_URL` automaticamente

**5. Variáveis de Ambiente do backend** (em Settings → Variables):

| Nome | Valor |
|------|-------|
| `MongoDB__ConnectionString` | Cole o valor de `MONGODB_URL` que o Railway gerou |
| `MongoDB__DatabaseName` | `stocksync` |
| `AllowedOrigins` | `https://seudominio.com.br,https://stocksync.vercel.app` |
| `ASPNETCORE_URLS` | `http://+:${{PORT}}` |

> O Railway substitui `${{PORT}}` pelo valor dinâmico da porta automaticamente.

**6. Deploy automático** acontece ao fazer push no GitHub ✅

**7. Copie a URL do serviço** (ex: `https://stocksync-backend.up.railway.app`)
e cole no campo `API_URL` das variáveis do frontend na Vercel.

---

## Domínio personalizado no Railway

1. Em **Settings → Networking → Custom Domain**
2. Adicione, ex: `api.seudominio.com.br`
3. Adicione o registro CNAME no seu provedor:
   ```
   CNAME   api   SEU-PROJETO.up.railway.app
   ```

---

## Fluxo de Deploy Contínuo (CD)

Após a configuração inicial, toda vez que fizer `git push origin main`:

- **Vercel** redeploya o frontend automaticamente em ~1-2 min
- **Railway** rebuilda o backend automaticamente em ~3-5 min

```bash
# Fluxo de trabalho no dia a dia:
git add .
git commit -m "feat: melhoria X"
git push origin main
# → Vercel e Railway fazem deploy automaticamente
```

---

## Checklist final

### Frontend (Vercel)
- [ ] Repositório conectado na Vercel
- [ ] Root Directory configurado como `frontend`
- [ ] Primeiro deploy funcionando
- [ ] Domínio personalizado adicionado e DNS configurado
- [ ] HTTPS ativo (automático pela Vercel)

### Backend (Railway) — opcional para MVP
- [ ] Serviço criado com Dockerfile do `backend/`
- [ ] MongoDB adicionado ao projeto
- [ ] Variáveis de ambiente configuradas
- [ ] URL do backend copiada para `API_URL` na Vercel
- [ ] CORS configurado com o domínio final (`AllowedOrigins`)

---

## Troubleshooting

**Build falha na Vercel com "Module not found":**
> Confirme que Root Directory está como `frontend` nas configurações do projeto.

**Erro de CORS no console do navegador:**
> Adicione a URL da Vercel/domínio na variável `AllowedOrigins` do backend no Railway.

**Backend não conecta no MongoDB:**
> Confirme que `MongoDB__ConnectionString` tem o valor completo de `MONGODB_URL` do Railway (inclui usuário, senha e host).

**Domínio não propaga:**
> DNS pode levar até 48h. Use [whatsmydns.net](https://whatsmydns.net) para verificar propagação.
