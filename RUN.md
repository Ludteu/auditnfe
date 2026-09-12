# ⚡ Como executar

## Opção 1 — Docker (recomendado)

```bash
docker-compose up
```

Aguarde o banco ficar saudável e acesse `http://localhost:5000`.

Parar: `Ctrl+C`. Resetar tudo (apaga dados): `docker-compose down -v`.

## Opção 2 — Linux/Mac

Pré-requisitos: Node.js 18+, PostgreSQL rodando localmente.

```bash
bash setup.sh   # instala dependências e cria .env
npm run dev
```

## Opção 3 — Windows

Pré-requisitos: Node.js 18+, PostgreSQL rodando localmente.

```cmd
setup.bat
npm run dev
```

## Opção 4 — Manual

```bash
npm install
cp .env.example .env
createdb nfe_emitter
npm run dev
```

## Testar

```bash
curl http://localhost:5000/api/health
```

Depois use [REQUISICOES.http](REQUISICOES.http), [ESTOQUE_REQUISICOES.http](ESTOQUE_REQUISICOES.http) e [TRIBUTACAO_REQUISICOES.http](TRIBUTACAO_REQUISICOES.http) com a extensão **REST Client** do VSCode — comece registrando um usuário e fazendo login para obter o token JWT usado nos demais exemplos.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `ECONNREFUSED` ao iniciar | PostgreSQL não está rodando ou `.env` com host/porta errados |
| `relation "usuarios" does not exist` | Rode `npm run db:reset` (recria as tabelas via Sequelize) |
| Porta 5000 em uso | Mude `PORT` no `.env` |
| `npm install` falha | `npm cache clean --force` e tente de novo |
