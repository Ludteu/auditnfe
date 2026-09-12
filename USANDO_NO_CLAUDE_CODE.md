# 🚀 Usando o Projeto no Claude Code

Guia completo para importar e desenvolver este projeto no Claude Code Desktop.

## 📋 Pré-requisitos

- **Claude Code Desktop** instalado
- **Node.js** v18+ instalado
- **PostgreSQL** rodando localmente ou acesso a um banco remoto
- **Git** (opcional, mas recomendado)

## 🎯 Passos para Importar

### 1. Abrir Claude Code

```bash
# Se tiver instalado, execute:
claude-code

# Ou abra o aplicativo Claude Code Desktop
```

### 2. Criar novo projeto

No Claude Code:
- Clique em "New Project"
- Escolha "Import from folder"
- Navegue até a pasta `nfe-emitter-project`

### 3. Instalar dependências

No terminal integrado do Claude Code:

```bash
npm install
```

### 4. Configurar arquivo .env

```bash
# Copiar exemplo
cp .env.example .env

# Editar com suas configurações
# Abra .env no editor e configure
```

Exemplo de .env mínimo:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nfe_emitter
DB_USER=postgres
DB_PASSWORD=postgres

PORT=5000
NODE_ENV=development

JWT_SECRET=sua_chave_super_secreta_aqui
```

### 5. Criar banco de dados

```bash
# Conectar ao PostgreSQL
psql -U postgres

# Criar banco
CREATE DATABASE nfe_emitter;

# Sair
\q
```

### 6. Sincronizar modelos

No terminal do Claude Code:

```bash
npm run start
```

O Sequelize criará as tabelas automaticamente no primeiro inicia.

## 💻 Desenvolvendo no Claude Code

### Estrutura de Pastas no Editor

```
nfe-emitter-project/
├── server/
│   ├── index.js              ← Entry point
│   ├── config/
│   │   ├── database.js       ← Config BD
│   │   └── init-db.sql       ← Schema SQL
│   ├── models/
│   │   ├── Usuario.js
│   │   ├── NFe.js
│   │   └── Certificado.js
│   ├── controllers/
│   │   ├── authController.js
│   │   └── nfeController.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── nfe.js
│   │   └── usuario.js
│   ├── services/
│   │   ├── sefazService.js
│   │   └── assinaturaService.js
│   ├── middleware/
│   │   └── autenticacao.js
│   └── utils/
│       └── xmlHelper.js
└── README.md, package.json, etc
```

### Atalhos Úteis do Claude Code

| Atalho | Ação |
|--------|------|
| `Ctrl+~` | Abrir/fechar terminal |
| `Ctrl+Shift+P` | Command palette |
| `F5` | Debug |
| `Ctrl+Shift+D` | Debug panel |

### Terminal Integrado

```bash
# Iniciar em modo desenvolvimento (com nodemon)
npm run dev

# Abrir outra aba de terminal
# Ctrl + Shift + ` (backtick)

# Testar endpoints
curl -X GET http://localhost:5000/api/health
```

## 🧪 Testando a API

### Método 1: Usar arquivo REQUISICOES.http

1. Instale extensão "REST Client" do VSCode no Claude Code
2. Abra arquivo `REQUISICOES.http`
3. Clique em "Send Request" acima de cada requisição

### Método 2: Usar cURL no Terminal

```bash
# Health check
curl http://localhost:5000/api/health

# Registrar usuário
curl -X POST http://localhost:5000/api/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Empresa Test",
    "email": "test@empresa.com",
    "cnpj": "12345678000191",
    "senha": "senha123"
  }'
```

### Método 3: Usar Postman

1. Importe as requisições do arquivo `REQUISICOES.http`
2. Configure a URL base: `http://localhost:5000/api`
3. Execute conforme necessário

## 📝 Fluxo de Desenvolvimento Recomendado

### Fase 1: Backend Básico ✅
- [x] Modelos de banco criados
- [x] Rotas de autenticação
- [x] API de NF-e básica
- [x] Validação de XML

**Próximos passos:**
- Implementar integração SEFAZ real
- Testar com certificado real
- Adicionar mais validações

### Fase 2: Assinatura Digital
- [ ] Integrar xmlsec1 do sistema operacional
- [ ] Implementar assinatura RSA real
- [ ] Validar certificado PFX
- [ ] Testes com certificado ICP-Brasil

### Fase 3: Integração SEFAZ
- [ ] Implementar SOAP completo
- [ ] Parsing de resposta SEFAZ
- [ ] Consulta de status
- [ ] Tratamento de rejeições

### Fase 4: Frontend React
- [ ] Componentes de login
- [ ] Dashboard de NF-es
- [ ] Formulário de criação
- [ ] Visualizador de XML

## 🐛 Debugging

### Ativar logs detalhados

Adicione ao arquivo `.env`:
```env
NODE_ENV=development
```

### Usar debugger do VSCode

1. Abra arquivo que quer debugar
2. Clique na linha para adicionar breakpoint (ponto vermelho)
3. Pressione F5 ou Ctrl+Shift+D
4. Selecione "Node.js"
5. Execute `npm run dev` no terminal

### Ver logs do banco de dados

No arquivo `server/config/database.js`, Sequelize já loga queries em desenvolvimento.

## 📊 Estrutura de Dados

### Exemplo de JSON retornado - Criar NF-e

```json
{
  "mensagem": "NF-e criada com sucesso",
  "nfe": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "usuarioId": "550e8400-e29b-41d4-a716-446655440001",
    "chaveNFe": "3523064177666000165550010000000001173450123",
    "cnpj": "12345678000191",
    "numero": 123,
    "serie": 1,
    "statusSEFAZ": "pendente",
    "dataEmissao": "2024-01-15T10:00:00.000Z",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

## 🔧 Configurações Úteis

### Para ambiente de desenvolvimento

```env
NODE_ENV=development
SEFAZ_ENV=homologacao
DEBUG=*
```

### Para ambiente de produção

```env
NODE_ENV=production
SEFAZ_ENV=producao
```

## 🚨 Troubleshooting

### Erro: "Cannot find module 'pg'"
```bash
npm install pg
```

### Erro: "Connection refused" (PostgreSQL)
- Verifique se PostgreSQL está rodando
- Verifique credenciais em `.env`
- Teste conectar manualmente: `psql -U postgres -h localhost`

### Erro: "EADDRINUSE" (Porta já em uso)
```bash
# Mude a porta em .env
PORT=5001

# Ou mate o processo usando a porta
lsof -i :5000
kill -9 PID
```

### Erro: "Token expired"
- Gere novo token fazendo login novamente
- Aumente tempo de expiração em `.env`: `JWT_EXPIRE=30d`

## 📚 Recursos Adicionais

### Documentação
- Express.js: https://expressjs.com/
- Sequelize: https://sequelize.org/
- JWT: https://jwt.io/
- PostgreSQL: https://www.postgresql.org/docs/

### Ferramentas
- Postman: https://www.postman.com/
- DBeaver: https://dbeaver.io/ (gerenciar BD graficamente)
- Thunder Client: VSCode extension para testes
- SQL Editor: https://sqliteonline.com/ (testar queries)

## ✅ Checklist de Setup

- [ ] Node.js v18+ instalado
- [ ] PostgreSQL instalado e rodando
- [ ] Projeto clonado/importado
- [ ] `npm install` executado
- [ ] `.env` configurado
- [ ] Banco de dados criado
- [ ] `npm run dev` funcionando
- [ ] `GET http://localhost:5000/api/health` retorna 200
- [ ] Conseguiu fazer login na API
- [ ] Extensão REST Client instalada (opcional)

## 🎓 Próximos Passos

1. **Explorar Modelos**: Abra `server/models/` e entenda cada modelo
2. **Testar Rotas**: Use `REQUISICOES.http` para testar cada endpoint
3. **Implementar Features**: Escolha uma feature da lista TODO no README
4. **Adicionar Testes**: Crie testes unitários em `__tests__/`
5. **Documentar**: Mantenha código comentado e README atualizado

---

**Dúvidas?** Consulte o README.md ou procure a documentação específica de cada tecnologia.

Happy Coding! 🚀
