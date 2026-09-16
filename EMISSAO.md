# 🧾 Emissão de NF-e (fluxo estilo Bling/Conta Azul)

Tela: **`/emitir.html`** (acesse com o servidor rodando, ex: `http://localhost:5000/emitir.html`).

Este é o fluxo "de verdade" de emissão — diferente do `POST /api/nfe` original (que espera um XML já pronto), aqui você escolhe um destinatário e itens do catálogo, e o sistema:

1. Sugere CFOP + CST/CSOSN automaticamente para cada item (via [CLASSIFICACAO_FISCAL.md](CLASSIFICACAO_FISCAL.md), a partir da `finalidade` do produto)
2. Numera a nota automaticamente (próximo número da série, por empresa)
3. Monta o XML completo, com uma chave de acesso de 44 dígitos estruturalmente válida (dígito verificador real, calculado por módulo 11)
4. Baixa o estoque de cada item — e se qualquer item não tiver saldo suficiente, **nada é criado** (é uma única transação de banco: tudo ou nada)

## Pré-requisitos (uma vez só)

1. Configurar a UF e o regime tributário da empresa: `PUT /api/usuarios/perfil` com `{ "uf": "SP", "regimeTributario": "simples_nacional" }` — a tela de emissão tem um card pra isso.
2. Ter ao menos um produto cadastrado com `finalidade` definida (ver [MODULO_ESTOQUE.md](MODULO_ESTOQUE.md)).

## Emitir via API

```http
POST /api/nfe/emitir
{
  "destinatarioId": "uuid-do-cliente",
  "itens": [
    { "produtoId": "uuid-do-produto", "quantidade": 3 }
  ]
}
```

Ou com cadastro rápido de cliente embutido (cria o destinatário se ainda não existir, casando por CPF/CNPJ):

```http
POST /api/nfe/emitir
{
  "destinatario": { "nome": "Cliente Final", "cpfCnpj": "12345678909", "uf": "RJ" },
  "itens": [{ "produtoId": "uuid-do-produto", "quantidade": 3 }]
}
```

### Campos opcionais

| Campo | Padrão | Efeito |
|---|---|---|
| `serie` | `1` | Série da nota (numeração é por empresa + série) |
| `naturezaOperacao` | `"Venda de mercadoria"` | Texto livre, vai pro XML |
| `tipoOperacao` | `"venda"` | `"venda"` ou `"devolucaoDeCompra"` — só operações de saída podem ser emitidas aqui |
| `baixarEstoque` | `true` | Se `false`, não mexe no estoque (ex: nota de serviço sem produto físico) |
| item `.valorUnitario` | `produto.precoVenda` | Sobrescreve o preço de venda cadastrado |
| item `.cfop` + `.tabelaIcms` + `.codigoIcms` | (sugestão automática) | Informe os três juntos pra pular o motor de sugestão e usar valores manuais |

### Resposta

```json
{
  "mensagem": "NF-e emitida com sucesso",
  "nfe": { "numero": 1, "chaveNFe": "35260911789...", "valor": "135.00", "statusSEFAZ": "pendente" },
  "itens": [ { "cfop": "6102", "tabelaIcms": "CSOSN", "codigoIcms": "102", ... } ],
  "destinatario": { ... },
  "avisos": ["Sugestão automática: não cobre ICMS-ST..."]
}
```

A partir daqui, a NF-e criada segue o mesmo ciclo de vida das notas antigas: `POST /api/nfe/:id/assinar` e `POST /api/nfe/:id/enviar` (ambos simulados — ver aviso em [ARQUITETURA.md](ARQUITETURA.md)).

## Destinatários (clientes)

CRUD simples em `/api/destinatarios` (mesmo padrão de auth/paginação dos outros módulos): `POST /`, `GET /?busca=`, `GET /:id`, `PUT /:id`, `DELETE /:id` (soft delete via `ativo`).

## O que a tela faz e o que ela não faz

✅ Busca de cliente e produto com autocomplete, cadastro rápido de cliente inline, CFOP/CST sugeridos e editáveis por item, totais calculados ao vivo, lista das últimas NF-es emitidas com visualização do XML.

❌ Ainda não cobre: emissão de nota de devolução/entrada pela tela (só venda), múltiplas séries simultâneas na UI, edição de uma NF-e já criada, cancelamento, nem qualquer envio real para a SEFAZ (isso já era simulado antes e continua sendo).

## Limitações conhecidas (honestas)

- A baixa de estoque assume que **todos os itens da nota saem do estoque na mesma direção** (`venda` e `devolucaoDeCompra` diminuem o saldo). Não há suporte a misturar uma devolução de entrada na mesma nota.
- O aviso "CFOP/CST informados manualmente" aparece sempre que a tela reenvia um CFOP já preenchido (mesmo que o usuário não tenha mexido nele) — o backend não distingue "aceitei a sugestão como veio" de "editei". Não afeta o resultado, só a mensagem.
- Endereço completo do emitente (logradouro, CEP, etc.) não é modelado ainda — só a UF, que é o mínimo necessário para decidir CFOP interno/interestadual e montar a chave de acesso.
