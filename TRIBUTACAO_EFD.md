# 🧾 Tributação Automática e EFD

## ⚠️ Aviso importante

O gerador de EFD deste projeto produz um arquivo **simplificado e didático**: cobre apenas os blocos `0` (abertura) e `C` (documentos fiscais, registros `C100`/`C170`), sem os blocos obrigatórios completos (`E`, `G`, `H`, `K`, totalizadores, etc.) exigidos pelo layout oficial da EFD-ICMS/IPI. **Não use este arquivo para entrega real à Receita Federal** sem revisão de um contador e validação no Programa Validador e Assinador (PVA-EFD) oficial. O objetivo aqui é servir de ponto de partida técnico, não substituir a apuração fiscal formal.

## Extração automática de tributação

A extração lê o XML da NF-e (tags `det`, `prod`, `imposto/ICMS`, `imposto/IPI`) e devolve, por item: NCM, CFOP, quantidade, valor, CST/alíquota/valor de ICMS e de IPI.

```http
POST /api/fiscal/tributacao/extrair
{
  "nfeId": "uuid-da-nfe"
}
```

ou enviando o XML diretamente:

```http
POST /api/fiscal/tributacao/extrair
{
  "xmlContent": "<?xml version=\"1.0\"?>..."
}
```

## Preencher produto automaticamente

Depois de extrair, aplique os dados de um item a um produto cadastrado no estoque:

```http
POST /api/fiscal/tributacao/produtos
{
  "produtoId": "uuid-do-produto",
  "ncm": "73181500",
  "cfop": "5102",
  "icms": { "cst": "00", "aliquota": 18 },
  "ipi": { "cst": "50", "aliquota": 5 }
}
```

Ou atualize manualmente via `PUT /api/fiscal/tributacao/:id` com o mesmo corpo.

## Resumo fiscal do período

```http
POST /api/fiscal/tributacao/resumo
{ "dataInicio": "2026-01-01", "dataFim": "2026-01-31" }
```

Soma, a partir do XML de cada NF-e emitida no período: valor total de produtos, ICMS, IPI e a carga tributária percentual resultante. NF-es com XML incompleto são ignoradas no somatório, sem interromper o cálculo.

## Gerar EFD-ICMS/IPI

```http
POST /api/fiscal/sped/efd
{ "dataInicio": "2026-01-01", "dataFim": "2026-01-31", "cnpj": "12345678000191", "razaoSocial": "Empresa LTDA" }
```

Retorna o conteúdo do arquivo (texto pipe-delimitado) e metadados (`totalNotas`, `totalRegistros`, `nomeArquivo`).

Para baixar diretamente como `.txt`:

```http
GET /api/fiscal/sped/efd/download?dataInicio=2026-01-01&dataFim=2026-01-31&cnpj=12345678000191&razaoSocial=Empresa LTDA
```
