# 📦 Módulo de Estoque

Controle de produtos com saldo, preço médio de custo e histórico de movimentações. Todas as rotas exigem `Authorization: Bearer {token}`.

## Conceitos

- **Preço médio de custo**: a cada entrada com preço unitário informado, o custo médio é recalculado como média ponderada entre o saldo/custo atuais e a nova entrada.
- **Saída**: sempre valida se há saldo suficiente antes de debitar o estoque; usa o preço médio de custo vigente no registro da movimentação.
- **Ajuste**: define a quantidade final diretamente (ex.: contagem de inventário), gerando uma movimentação do tipo `ajuste` com a diferença.
- Toda movimentação é registrada em `movimentacoes_estoque`, com `saldoAnterior` e `saldoPosterior`, permitindo reconstruir o histórico completo.

## Cadastrar um produto

```http
POST /api/estoque/produtos
{
  "codigo": "SKU-001",
  "descricao": "Parafuso M6",
  "unidade": "UN",
  "quantidade": 100,
  "estoqueMinimo": 20,
  "precoCusto": 0.50,
  "precoVenda": 1.20,
  "ncm": "73181500"
}
```

## Registrar entrada

```http
POST /api/estoque/entrada
{
  "produtoId": "uuid-do-produto",
  "quantidade": 50,
  "precoUnitario": 0.55,
  "motivo": "Compra NF 1234"
}
```

## Registrar saída

```http
POST /api/estoque/saida
{
  "produtoId": "uuid-do-produto",
  "quantidade": 10,
  "motivo": "Venda NF 5678"
}
```

Retorna erro `400` se a quantidade solicitada for maior que o saldo atual.

## Ajuste de inventário

```http
POST /api/estoque/ajuste
{
  "produtoId": "uuid-do-produto",
  "novaQuantidade": 130,
  "motivo": "Contagem de inventário mensal"
}
```

## Alertas de estoque mínimo

```http
GET /api/estoque/alertas
```

Retorna todos os produtos ativos cujo saldo está igual ou abaixo do `estoqueMinimo`, com a quantidade que falta para atingi-lo.

## Histórico e relatório

```http
GET /api/estoque/historico?produtoId=...&tipo=entrada&dataInicio=2026-01-01&dataFim=2026-01-31
GET /api/estoque/relatorio
```

O relatório soma o valor total em estoque a custo médio e a preço de venda, e conta quantos itens estão abaixo do mínimo.

## Integração com NF-e (opcional)

As movimentações aceitam um campo `nfeId` para vincular a entrada/saída a uma nota fiscal específica — útil para dar baixa automática de estoque ao emitir uma NF-e de venda ou registrar entrada ao receber uma NF-e de compra. Essa vinculação é manual nesta versão: chame `/api/estoque/saida` (ou `/entrada`) informando o `nfeId` depois de criar a NF-e correspondente.
