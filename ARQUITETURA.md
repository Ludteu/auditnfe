# 🏗️ Arquitetura do Sistema NFe Emitter

## Diagrama Geral do Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND REACT                           │
│                    (Em desenvolvimento)                          │
└────────────────────────┬──────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       EXPRESS.JS API                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  ROTAS & CONTROLLERS                     │   │
│  │  ├─ POST /auth/registrar                                 │   │
│  │  ├─ POST /auth/login                                     │   │
│  │  ├─ GET  /nfe (listar)                                   │   │
│  │  ├─ POST /nfe (criar)                                    │   │
│  │  ├─ POST /nfe/:id/assinar                                │   │
│  │  ├─ POST /nfe/:id/enviar                                 │   │
│  │  ├─ GET  /nfe/:id/status                                 │   │
│  │  └─ GET  /usuarios/certificados                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         │                                        │
│         ┌───────────────┼───────────────┐                        │
│         ▼               ▼               ▼                        │
│  ┌─────────────┐ ┌────────────┐ ┌─────────────┐                 │
│  │  SERVICES   │ │  UTILS     │ │ MIDDLEWARE  │                 │
│  │             │ │            │ │             │                 │
│  │ ├─ SEFAZ    │ │├─ XML      │ │├─ Auth JWT  │                 │
│  │ ├─ Sign     │ │├─ Validar  │ │└─ Errors    │                 │
│  │ └─ Cert     │ │└─ Format   │ └─────────────┘                 │
│  └─────────────┘ └────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
         │                 │                    │
         ▼                 ▼                    ▼
   ┌──────────┐      ┌──────────┐       ┌─────────────┐
   │   SEFAZ  │      │XML Parser│       │PostgreSQL   │
   │Webservice│      │Validator │       │  Database   │
   └──────────┘      └──────────┘       └─────────────┘
```

## Fluxo de Emissão de NF-e

```
┌─────────────┐
│  Usuário    │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ 1. Criar NF-e       │
│ POST /nfe           │
│ - XML content       │
│ - Dados básicos     │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 2. Validar XML      │ ◄──── xmlHelper.validarXmlBasico()
│ - Schema NFe 4.00   │       ├─ Estrutura básica
│ - Campos obrigatórios       ├─ Tags requiridas
└──────┬──────────────┘        └─ Chave NF-e
       │
       ▼
┌─────────────────────┐
│ 3. Salvar em BD     │ ◄──── NFe.create()
│ - Status: pendente  │       └─ Armazena XML original
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 4. Assinar XML      │
│ POST /nfe/:id/     │ ◄──── assinaturaService.assinarXml()
│        assinar      │       ├─ Carrega certificado PFX
│ - Certificado       │       ├─ Calcula hash SHA256
│ - Senha cert        │       └─ Gera assinatura RSA
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 5. Salvar XML       │ ◄──── NFe.update()
│    Assinado         │       └─ Status: pronta_para_envio
│ - Armazena XML assinado
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 6. Enviar SEFAZ     │
│ POST /nfe/:id/      │ ◄──── sefazService.enviarNFeAutorizacao()
│        enviar       │       ├─ Conecta com cert SSL/TLS
│                     │       ├─ Envia SOAP XML assinado
│ - Cert SSL/TLS      │       └─ Aguarda resposta
│ - XML Assinado      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 7. Processar        │
│    Resposta SEFAZ   │ ◄──── parseResponstaAutorizacao()
│ - Protocolo         │       ├─ Extrai protocolo
│ - Status NFe        │       ├─ Verifica autorização
│ - Timestamp         │       └─ Trata rejeições
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 8. Atualizar BD     │ ◄──── NFe.update()
│ - Status: autorizada│       ├─ Status: autorizada
│ - Protocolo SEFAZ   │       ├─ Protocolo 15 dígitos
│ - Data recebimento  │       └─ Timestamp resposta
└──────┬──────────────┘
       │
       ▼
┌─────────────┐
│ NF-e Pronta │ ✅
│ para Uso    │
└─────────────┘
```

## Fluxo de Autenticação

```
┌──────────────────┐
│    Login/Reg     │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Enviar email + senha             │
│ POST /auth/login                 │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ 1. Buscar usuário por email      │
│    Usuario.findOne({email})      │
└────────┬─────────────────────────┘
         │
    ┌────┴────┐
    │          │
    ▼          ▼
┌─────────┐ ┌──────────────┐
│ Existe? │ │ Não existe   │
│  Sim    │ │ Error: 401   │
└────┬────┘ └──────────────┘
     │
     ▼
┌──────────────────────────────────┐
│ 2. Verificar senha               │
│    bcrypt.compare()              │
└────────┬─────────────────────────┘
     │
  ┌──┴──┐
  │     │
  ▼     ▼
┌───┐ ┌──────────────┐
│OK?│ │ Não OK       │
│Sim│ │ Error: 401   │
└─┬─┘ └──────────────┘
  │
  ▼
┌──────────────────────────────────┐
│ 3. Gerar JWT Token               │
│ jwt.sign({id, email}, SECRET)    │
│ - Expira em 7 dias               │
└────────┬─────────────────────────┘
     │
     ▼
┌──────────────────────────────────┐
│ 4. Retornar token                │
│ + dados do usuário               │
└────────┬─────────────────────────┘
     │
     ▼
┌──────────────────────┐
│ Token armazenado     │
│ no frontend          │
└──────────────────────┘
```

## Proteção de Rotas com JWT

```
┌─────────────────────────────┐
│ Requisição com JWT          │
│ Authorization: Bearer TOKEN │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Middleware: autenticacao.js             │
│ ├─ Extrai token do header               │
│ ├─ Verifica assinatura com SECRET       │
│ ├─ Decodifica payload {id, email}       │
│ └─ Adiciona req.usuario ao request      │
└────────┬────────────────────────────────┘
         │
    ┌────┴──────┐
    │            │
    ▼            ▼
┌─────────┐ ┌──────────────────┐
│ Válido? │ │ Inválido/Expirado│
│  Sim    │ │ Error: 401       │
└────┬────┘ └──────────────────┘
     │
     ▼
┌─────────────────────────────┐
│ Rotado acessa req.usuario.id│
│ Filtra dados por usuário    │
└─────────────────────────────┘
```

## Estrutura de Certificado Digital

```
┌──────────────────────────────────────┐
│     Arquivo .pfx (PKCS#12)           │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Chave Privada RSA             │  │
│  │  ├─ 2048 ou 4096 bits          │  │
│  │  └─ Protegida por senha        │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Certificado X.509             │  │
│  │  ├─ Emitido por ICP-Brasil     │  │
│  │  ├─ CNPJ da empresa            │  │
│  │  ├─ Validade                   │  │
│  │  └─ Dados do titular           │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Cadeia de certificados        │  │
│  │  └─ Certificados intermediários│  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## Fluxo de Assinatura Digital

```
┌─────────────┐
│ XML Original│
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│ 1. Normalizar XML           │
│    (c14n - Canonical XML)   │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ 2. Calcular Hash            │
│    SHA256(XML normalizado)  │
│    = DigestValue (base64)   │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ 3. Criar estrutura XML de   │
│    assinatura com:          │
│    ├─ SignedInfo            │
│    ├─ Transforms            │
│    ├─ DigestValue           │
│    └─ SignatureMethod       │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ 4. Assinar SignedInfo com   │
│    Chave Privada (RSA)      │
│    = SignatureValue (base64)│
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ 5. Montar XML com Signature │
│    ├─ infNfe               │
│    └─ Signature             │
│        ├─ SignedInfo        │
│        ├─ SignatureValue    │
│        └─ KeyInfo           │
└──────┬──────────────────────┘
       │
       ▼
┌──────────────────────┐
│ XML Assinado Pronto  │✅
│ para envio ao SEFAZ  │
└──────────────────────┘
```

## Integração com SEFAZ

```
┌──────────────────────┐
│  NFe Assinada        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Criar Envelope SOAP              │
│ ├─ Namespace SOAP                │
│ ├─ NFe dentro de <nfeDadosMsg>   │
│ └─ Headers HTTP apropriados      │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Conectar SEFAZ                   │
│ ├─ HTTPS com certificado SSL/TLS│
│ ├─ Certificado digital (PFX)     │
│ └─ Verificação de hostname       │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Enviar SOAP POST                 │
│ - URL: https://nfe.sefaz.XX      │
│ - Body: Envelope XML             │
│ - Timeout: 30s (configurável)    │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ SEFAZ Processa                   │
│ ├─ Valida XML                    │
│ ├─ Verifica certificado          │
│ ├─ Autentica empresa             │
│ └─ Emite protocolo ou rejeita    │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Resposta SOAP                    │
│ ├─ Protocolo (15 dígitos)        │
│ ├─ Status de autorização         │
│ ├─ Timestamp de recebimento      │
│ └─ Descrição de rejeições (se)   │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────┐
│ Atualizar Status BD  │✅
│ NF-e Autorizada      │
└──────────────────────┘
```

## Busca e Filtro

```
┌────────────────────────────┐
│  Critérios de Busca        │
│  ├─ chaveNFe: "352306..." │
│  ├─ cnpj: "1234..."       │
│  ├─ numero: 123            │
│  ├─ status: "autorizada"  │
│  ├─ dataInicio: "2024-01" │
│  └─ dataFim: "2024-12"    │
└────────────┬───────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ Construir cláusula WHERE         │
│ WHERE usuarioId = ?              │
│   AND chaveNFe = ?               │
│   AND cnpj = ?                   │
│   AND statusSEFAZ = ?            │
│   AND dataEmissao BETWEEN ? AND ?│
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ Executar query com índices       │
│ - idx_nfes_chaveNFe              │
│ - idx_nfes_cnpj                  │
│ - idx_nfes_status                │
│ - idx_nfes_data                  │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ Retornar resultados              │
│ - Paginados                      │
│ - Ordenados por data descending  │
│ - Limitado a 50 resultados       │
└──────────────────────────────────┘
```

## Camadas e Responsabilidades

### 🌐 Camada de Apresentação
- API RESTful Express
- Validação de entrada
- Formatação de resposta
- CORS e segurança

### 🔧 Camada de Negócio
- Controllers (orquestração)
- Validações de regra de negócio
- Transformações de dados

### 🔌 Camada de Integração
- SEFAZ (webservices)
- Assinatura digital
- XML parsing

### 💾 Camada de Dados
- Modelos Sequelize
- Queries otimizadas
- Índices de banco de dados

### 🛡️ Camada de Segurança
- Autenticação JWT
- Criptografia de senha (bcrypt)
- Validação de acesso (usuarioId)

## Performance

### Índices de Banco

```sql
-- Busca rápida por chave
CREATE INDEX idx_nfes_chaveNFe ON nfes(chaveNFe);

-- Filtro por CNPJ
CREATE INDEX idx_nfes_cnpj ON nfes(cnpj);

-- Filtro por status
CREATE INDEX idx_nfes_status ON nfes(statusSEFAZ);

-- Range de datas
CREATE INDEX idx_nfes_data ON nfes(dataEmissao);

-- Combinações comuns
CREATE INDEX idx_nfes_chave_cnpj ON nfes(chaveNFe, cnpj);
CREATE INDEX idx_nfes_cnpj_data ON nfes(cnpj, dataEmissao);
```

### Caching (Futuro)
- Redis para sessões JWT
- Cache de XMLs formatados
- Cache de respostas SEFAZ

---

**Arquitetura modular e escalável! 🚀**
