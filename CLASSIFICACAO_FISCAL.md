# 🧭 Classificação Fiscal Automática (CFOP/CST/CSOSN)

## ⚠️ Aviso importante

Este motor é um **apoio à decisão**, não um substituto do contador. Ele cobre um subconjunto dos casos mais comuns da tabela oficial de CFOP e das tabelas de CST (regime normal) e CSOSN (Simples Nacional). **Não cobre**: substituição tributária (ICMS-ST) por NCM, DIFAL para consumidor final não contribuinte, benefícios fiscais estaduais, zona franca, exportação, nem PIS/COFINS. Toda sugestão deve ser revisada antes de ser usada numa emissão real — principalmente se o produto está sujeito a ICMS-ST ou a regime diferenciado.

## O modelo: duas perguntas decidem a classificação

**1. Por que a empresa tem esse item?** — campo `finalidade` no cadastro do produto ([MODULO_ESTOQUE.md](MODULO_ESTOQUE.md)):

| Finalidade | Significado |
|---|---|
| `revenda` | Comprado pronto para ser vendido sem alteração |
| `producao_propria` | Fabricado/transformado pela própria empresa |
| `materia_prima_insumo` | Comprado para entrar num processo de industrialização |
| `uso_consumo` | Comprado para uso interno (não é vendido) |
| `ativo_imobilizado` | Bem durável do patrimônio da empresa (máquina, móvel, veículo) |

**2. O que está acontecendo com ele agora?** — campo `tipoOperacao`, informado na hora de pedir a sugestão:

| Operação | Significado | Direção |
|---|---|---|
| `compra` | A empresa está comprando o item | Entrada |
| `venda` | A empresa está vendendo o item | Saída |
| `devolucaoDeVenda` | Um cliente devolveu algo que a empresa vendeu | Entrada |
| `devolucaoDeCompra` | A empresa está devolvendo algo que comprou | Saída |

A combinação das duas, mais se a operação é **interna** (mesmo estado) ou **interestadual**, determina o CFOP. O **regime tributário da empresa** (configurado em `PUT /api/usuarios/perfil`, campo `regimeTributario`: `simples_nacional`, `lucro_presumido` ou `lucro_real`) decide se a resposta traz CSOSN ou CST.

## Por que operações de entrada não recebem CST/CSOSN sugerido

Numa compra, quem define o CST/CSOSN do ICMS é **quem emitiu a nota** (o fornecedor) — não a empresa que está comprando. Por isso, para `compra` e `devolucaoDeVenda` o motor sugere só o CFOP e aponta para o endpoint que já existe para ler o XML de terceiros:

```http
POST /api/fiscal/tributacao/extrair
```

## Configurar o regime tributário da empresa

```http
PUT /api/usuarios/perfil
{ "regimeTributario": "simples_nacional" }
```

Aceita `simples_nacional`, `lucro_presumido` ou `lucro_real`. Sem isso configurado, o motor ainda sugere o CFOP, mas avisa que não pode sugerir CST/CSOSN.

## Pedir uma sugestão

Por produto já cadastrado (usa a `finalidade` salva nele):

```http
POST /api/fiscal/classificacao/sugerir
{
  "produtoId": "uuid-do-produto",
  "tipoOperacao": "venda",
  "ufOrigem": "SP",
  "ufDestino": "RJ"
}
```

Ou informando a finalidade diretamente (sem produto cadastrado ainda):

```http
POST /api/fiscal/classificacao/sugerir
{
  "finalidade": "materia_prima_insumo",
  "tipoOperacao": "compra",
  "ufOrigem": "SP",
  "ufDestino": "SP"
}
```

**Resposta (venda interna, Simples Nacional, item de revenda):**
```json
{
  "cfop": "5102",
  "cfopDescricao": "Venda de mercadoria adquirida ou recebida de terceiros",
  "operacao": "interna",
  "tabelaIcms": "CSOSN",
  "codigoIcms": "102",
  "codigoIcmsDescricao": "Tributada pelo Simples Nacional sem permissão de crédito",
  "avisos": ["Sugestão automática: não cobre ICMS-ST..."]
}
```

## Aplicar a sugestão a um produto

O motor só sugere — para gravar no cadastro do produto, use o endpoint que já existe:

```http
POST /api/fiscal/tributacao/produtos
{
  "produtoId": "uuid-do-produto",
  "cfop": "5102",
  "icms": { "cst": "00", "aliquota": 18 }
}
```

## Tabela de CFOP coberta

| Finalidade | Operação | CFOP interno | CFOP interestadual |
|---|---|---|---|
| `producao_propria` | venda | 5101 | 6101 |
| `producao_propria` | devolucaoDeVenda | 1201 | 2201 |
| `revenda` | compra | 1102 | 2102 |
| `revenda` | venda | 5102 | 6102 |
| `revenda` | devolucaoDeVenda | 1202 | 2202 |
| `revenda` | devolucaoDeCompra | 5202 | 6202 |
| `materia_prima_insumo` | compra | 1101 | 2101 |
| `materia_prima_insumo` | devolucaoDeCompra | 5201 | 6201 |
| `uso_consumo` | compra | 1556 | 2556 |
| `uso_consumo` | devolucaoDeCompra | 5556 | 6556 |
| `ativo_imobilizado` | compra | 1551 | 2551 |
| `ativo_imobilizado` | venda | 5551 | 6551 |
| `ativo_imobilizado` | devolucaoDeCompra | 5553 | 6553 |

Uma combinação fora dessa tabela cai num CFOP genérico (`5949`/`6949` para saída, `1949`/`2949` para entrada) com aviso explícito para revisão manual — a lista acima **não é a tabela completa oficial de CFOP** (que tem centenas de códigos), é o subconjunto de operações mais comuns de comércio/indústria.

O código-fonte fica em [server/services/fiscalRulesService.js](server/services/fiscalRulesService.js) — é só um objeto de lookup, então adicionar uma combinação nova (por exemplo, remessa para conserto, exportação) é editar essa tabela.
