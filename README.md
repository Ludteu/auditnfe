# 🚀 NFe Emitter — NF-e + Estoque + Tributação

Sistema para emissão e gestão de Notas Fiscais Eletrônicas (NF-e), controle de estoque e extração automática de tributação com geração de arquivo EFD-ICMS/IPI simplificado.

Veja [RUN.md](RUN.md) para o guia rápido de execução (Docker, Linux/Mac, Windows) e [EMISSAO.md](EMISSAO.md) para a tela de emissão (`/emitir.html`) — destinatário + itens do catálogo, CFOP/CST automáticos, numeração e baixa de estoque.

## 📋 Características

- ✅ Emissão e gestão de NF-es
- ✅ Assinatura digital com certificado PFX (simulada — veja aviso em [ARQUITETURA.md](ARQUITETURA.md))
- ✅ Integração com webservices SEFAZ
- ✅ Busca e filtro de NF-es por múltiplos critérios
- ✅ Visualização de XML formatado
- ✅ Autenticação com JWT
- ✅ Gerenciamento de certificados digitais
- ✅ Controle de estoque com preço médio ponderado e alertas de estoque mínimo
- ✅ Sugestão automática de CFOP/CST/CSOSN a partir da finalidade do item e do regime tributário da empresa (ver [CLASSIFICACAO_FISCAL.md](CLASSIFICACAO_FISCAL.md))
- ✅ Extração automática de tributação (NCM, CFOP, ICMS, IPI) a partir do XML da NF-e
- ✅ Geração de arquivo EFD-ICMS/IPI simplificado (ver aviso em [TRIBUTACAO_EFD.md](TRIBUTACAO_EFD.md))
- ✅ API RESTful completa

## 🏗️ Arquitetura

```
auditnfe/
├── server/
│   ├── config/          # Configuração do banco de dados
│   ├── controllers/     # Lógica de negócio (auth, nfe, estoque, tributação)
│   ├── models/          # Modelos Sequelize
│   ├── routes/          # Rotas da API
│   ├── services/        # Serviços (SEFAZ, Assinatura, Estoque, Tributação, SPED)
│   ├── middleware/      # Middlewares (Autenticação)
│   ├── utils/           # Utilitários (XML, etc)
│   └── index.js         # Entry point
├── scripts/             # Scripts utilitários (reset de banco)
├── docker-compose.yml   # Sobe app + PostgreSQL
├── setup.sh / setup.bat # Instalação automática
├── .env.example         # Variáveis de ambiente
└── package.json
```

## 🛠️ Stack Técnico

### Backend
- **Node.js** com Express
- **PostgreSQL** com Sequelize ORM
- **JWT** para autenticação
- **XML parsing** com xml2js

### Dependências principais
```json
{
  "express": "^4.18.2",
  "sequelize": "^6.35.0",
  "pg": "^8.11.0",
  "axios": "^1.6.0",
  "xml2js": "^0.6.2",
  "jsonwebtoken": "^9.1.2"
}
```

## 📦 Instalação

### 1. Clonar e instalar dependências

```bash
cd nfe-emitter-project
npm install
```

### 2. Configurar banco de dados

Criar banco PostgreSQL:
```sql
CREATE DATABASE nfe_emitter;
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Editar `.env` com suas configurações:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nfe_emitter
DB_USER=postgres
DB_PASSWORD=sua_senha

PORT=5000
NODE_ENV=development

JWT_SECRET=sua_chave_super_secreta

SEFAZ_ENV=homologacao
SEFAZ_UF=SP
```

### 4. Sincronizar banco de dados

```bash
npm run db:migrate
```

### 5. Iniciar servidor

```bash
npm run dev
```

O servidor estará disponível em `http://localhost:5000`

## 📚 API Endpoints

### Autenticação

#### Registrar usuário
```http
POST /api/auth/registrar
Content-Type: application/json

{
  "nome": "Empresa LTDA",
  "email": "contato@empresa.com",
  "cnpj": "12345678000191",
  "senha": "senha_segura",
  "razaoSocial": "Empresa Razão Social LTDA"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "contato@empresa.com",
  "senha": "senha_segura"
}
```

**Resposta:**
```json
{
  "mensagem": "Login realizado com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": "uuid",
    "nome": "Empresa LTDA",
    "email": "contato@empresa.com"
  }
}
```

### NF-es

Todas as rotas de NF-e requerem header de autenticação:
```
Authorization: Bearer {token}
```

#### Listar NF-es com filtros
```http
GET /api/nfe?status=autorizada&cnpj=12345678000191&pagina=1&limite=20
```

**Parâmetros de query:**
- `status`: pendente, enviada, autorizada, rejeitada, cancelada
- `cnpj`: Filtrar por CNPJ
- `dataInicio`: Data inicial (YYYY-MM-DD)
- `dataFim`: Data final (YYYY-MM-DD)
- `pagina`: Número da página (padrão: 1)
- `limite`: Itens por página (padrão: 20)

#### Buscar NF-es por critérios
```http
GET /api/nfe/buscar?chaveNFe=3523064177666000165550010000000001173450123&cnpj=12345678000191
```

#### Emitir NF-e a partir de destinatário + itens do catálogo (ver EMISSAO.md)
```http
POST /api/nfe/emitir
Content-Type: application/json

{
  "destinatarioId": "uuid-do-cliente",
  "itens": [{ "produtoId": "uuid-do-produto", "quantidade": 3 }]
}
```

#### Criar NF-e a partir de um XML já pronto (fluxo avançado/import)
```http
POST /api/nfe
Content-Type: application/json

{
  "xmlContent": "<?xml version=\"1.0\"?>...",
  "cnpj": "12345678000191",
  "numero": 123,
  "serie": 1,
  "valor": 1000.00,
  "nomeCliente": "Cliente LTDA",
  "cpfCnpjCliente": "98765432000199"
}
```

#### Obter detalhes de uma NF-e
```http
GET /api/nfe/{id}
```

#### Assinar NF-e
```http
POST /api/nfe/{id}/assinar
```

Requer certificado digital cadastrado para o CNPJ da NF-e.

#### Enviar para SEFAZ
```http
POST /api/nfe/{id}/enviar
```

#### Consultar status na SEFAZ
```http
GET /api/nfe/{chaveNFe}/status
```

#### Obter XML formatado
```http
GET /api/nfe/{id}/xml
```

### Certificados

#### Listar certificados do usuário
```http
GET /api/usuarios/certificados
Authorization: Bearer {token}
```

#### Adicionar certificado
```http
POST /api/usuarios/certificados
Content-Type: application/json
Authorization: Bearer {token}

{
  "cnpj": "12345678000191",
  "validoAte": "2025-12-31",
  "descricao": "Certificado principal",
  "caminhoArquivo": "/path/to/certificado.pfx"
}
```

#### Ativar certificado
```http
PUT /api/usuarios/certificados/{id}/ativar
Authorization: Bearer {token}
```

### Estoque

Todas as rotas requerem `Authorization: Bearer {token}`. Detalhes e exemplos completos em [MODULO_ESTOQUE.md](MODULO_ESTOQUE.md) e [ESTOQUE_REQUISICOES.http](ESTOQUE_REQUISICOES.http).

```http
POST   /api/estoque/produtos          # Cadastrar produto
GET    /api/estoque/produtos          # Listar produtos (busca, paginação)
GET    /api/estoque/produtos/:id      # Detalhes de um produto
PUT    /api/estoque/produtos/:id      # Atualizar dados cadastrais
DELETE /api/estoque/produtos/:id      # Inativar produto

POST   /api/estoque/entrada           # Registrar entrada (atualiza preço médio)
POST   /api/estoque/saida             # Registrar saída (valida saldo)
POST   /api/estoque/ajuste            # Ajuste de inventário

GET    /api/estoque/alertas           # Produtos abaixo do estoque mínimo
GET    /api/estoque/historico         # Histórico de movimentações
GET    /api/estoque/relatorio         # Resumo consolidado de estoque
```

### Classificação fiscal, tributação e SPED

Detalhes e exemplos completos em [CLASSIFICACAO_FISCAL.md](CLASSIFICACAO_FISCAL.md), [TRIBUTACAO_EFD.md](TRIBUTACAO_EFD.md) e [TRIBUTACAO_REQUISICOES.http](TRIBUTACAO_REQUISICOES.http).

```http
POST /api/fiscal/classificacao/sugerir # Sugere CFOP/CST/CSOSN a partir da finalidade do item
POST /api/fiscal/tributacao/extrair    # Extrai NCM/CFOP/ICMS/IPI de um XML ou NF-e cadastrada
POST /api/fiscal/tributacao/produtos   # Aplica dados extraídos a um produto
PUT  /api/fiscal/tributacao/:id        # Atualiza tributação de um produto manualmente
POST /api/fiscal/tributacao/resumo     # Resumo fiscal do período (ICMS/IPI/carga tributária)

POST /api/fiscal/sped/efd              # Gera EFD-ICMS/IPI simplificado (retorna JSON)
GET  /api/fiscal/sped/efd/download     # Gera e baixa o arquivo EFD (.txt)
```

## 🔐 Segurança

### Certificado Digital
- Armazenar certificados fora do diretório publicamente acessível
- Usar variável de ambiente para senha do certificado
- Implementar rotação periódica de certificados

### Autenticação
- Tokens JWT expiram em 7 dias (configurável)
- Senha criptografada com bcryptjs
- Validação de entrada em todas as rotas

### SEFAZ
- Ambiente de homologação para testes
- Certificado SSL/TLS obrigatório
- Timeout configurável para requisições

## 🧪 Exemplos de Uso

### Com cURL

#### 1. Registrar usuário
```bash
curl -X POST http://localhost:5000/api/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Minha Empresa",
    "email": "contato@empresa.com",
    "cnpj": "12345678000191",
    "senha": "senha123"
  }'
```

#### 2. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "contato@empresa.com",
    "senha": "senha123"
  }'
```

#### 3. Buscar NF-es
```bash
curl -X GET "http://localhost:5000/api/nfe/buscar?chaveNFe=3523064177666000165550010000000001173450123" \
  -H "Authorization: Bearer SEU_TOKEN_JWT"
```

## 🗄️ Estrutura do Banco de Dados

### Tabela: usuarios
```sql
- id (UUID)
- nome (VARCHAR)
- email (VARCHAR, unique)
- cnpj (VARCHAR, unique)
- senha (VARCHAR)
- razaoSocial (VARCHAR)
- regimeTributario (ENUM: simples_nacional, lucro_presumido, lucro_real, opcional)
- ativo (BOOLEAN)
- createdAt / updatedAt
```

### Tabela: nfes
```sql
- id (UUID)
- usuarioId (UUID, FK)
- chaveNFe (VARCHAR, unique)
- cnpj (VARCHAR)
- numero (INTEGER)
- serie (INTEGER)
- xmlContent (TEXT)
- xmlAssinado (TEXT)
- statusSEFAZ (ENUM)
- protocolo (VARCHAR)
- dataEmissao (DATE)
- descricaoRejeicao (TEXT)
- valor (DECIMAL)
- nomeCliente (VARCHAR)
- cpfCnpjCliente (VARCHAR)
- createdAt / updatedAt
```

### Tabela: certificados
```sql
- id (UUID)
- usuarioId (UUID, FK)
- cnpj (VARCHAR)
- caminhoArquivo (VARCHAR)
- validoAte (DATE)
- ativo (BOOLEAN)
- descricao (VARCHAR)
- createdAt / updatedAt
```

### Tabela: destinatarios
```sql
- id (UUID)
- usuarioId (UUID, FK)
- nome, cpfCnpj (VARCHAR) -- único por usuário
- contribuinteIcms (BOOLEAN), inscricaoEstadual (VARCHAR)
- uf, cidade, cep, logradouro, numero, bairro
- ativo (BOOLEAN)
- createdAt / updatedAt
```

### Tabela: itens_nfe
```sql
- id (UUID)
- nfeId (UUID, FK)
- produtoId (UUID, FK)
- codigo, descricao, ncm, cfop, unidade
- quantidade, valorUnitario, valorTotal (DECIMAL)
- tabelaIcms (CST|CSOSN), codigoIcms, icmsAliquota, icmsValor
- cstIpi, ipiAliquota, ipiValor
```

### Tabela: produtos
```sql
- id (UUID)
- usuarioId (UUID, FK)
- codigo (VARCHAR) -- único por usuário
- descricao (VARCHAR)
- unidade (VARCHAR)
- finalidade (ENUM: revenda, producao_propria, materia_prima_insumo, uso_consumo, ativo_imobilizado)
- quantidade (DECIMAL) -- saldo atual
- estoqueMinimo (DECIMAL)
- precoCusto / precoMedioCusto / precoVenda (DECIMAL)
- ncm / cfop / cstIcms / icmsAliquota / cstIpi / ipiAliquota
- ativo (BOOLEAN)
- createdAt / updatedAt
```

### Tabela: movimentacoes_estoque
```sql
- id (UUID)
- usuarioId (UUID, FK)
- produtoId (UUID, FK)
- nfeId (UUID, FK, opcional)
- tipo (ENUM: entrada, saida, ajuste)
- quantidade (DECIMAL)
- precoUnitario (DECIMAL)
- saldoAnterior / saldoPosterior (DECIMAL)
- motivo (VARCHAR)
- dataMovimentacao (DATE)
- createdAt / updatedAt
```

## 📝 Próximas Features

- [ ] Frontend com React
- [ ] Dashboard com gráficos
- [ ] Cancelamento de NF-es
- [ ] Inutilização de numeração
- [ ] Contingência offline
- [ ] Backup automático
- [ ] Webhooks para notificações
- [ ] Multi-tenancy
- [ ] API com rate limiting
- [ ] EFD completo (blocos E/G/H/K) validado no PVA oficial

## ⚠️ Importantes

### Para Produção
1. Usar certificado SSL/TLS real
2. Migrar para ambiente de SEFAZ produção
3. Implementar rate limiting
4. Adicionar logs estruturados
5. Implementar monitoramento
6. Backup automático de banco
7. Usar secrets manager para variáveis sensíveis
8. Implementar CI/CD

### Certificado Digital
1. Obter junto à ICP-Brasil
2. Testar em homologação primeiro
3. Manter certificado seguro
4. Renovar antes de vencer

## 📖 Documentação Adicional

- [SEFAZ NFe v4.00](https://www.nfe.fazenda.gov.br/)
- [Webservices SEFAZ](https://www.nfe.fazenda.gov.br/portal/webServices.shtml)
- [ICP-Brasil](https://www.gov.br/cidadania/pt-br/acesso-a-informacao/acoes-e-programas/transformacao-digital/icp-brasil)

## 📄 Licença

MIT

## 🤝 Contribuições

Aberto a contribuições e melhorias!

---

**Desenvolvido com ❤️ para simplificar a emissão de NF-es**
