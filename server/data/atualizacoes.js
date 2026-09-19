/**
 * Conteúdo da aba "Atualizações". Duas listas mantidas manualmente:
 *
 * - changelogSistema: o que foi construído neste projeto, extraído do
 *   histórico real de commits — sempre preciso, porque é gerado a partir
 *   do que de fato mudou aqui.
 * - marcosReformaTributaria: marcos conhecidos e datados da Reforma
 *   Tributária (EC 132/2023, LC 214/2025). Isso sim é conteúdo de
 *   referência mantido à mão (não muda com frequência) — não substitui
 *   acompanhar as fontes oficiais listadas em linksOficiais.
 *
 * Os informes técnicos do dia-a-dia (Notas Técnicas, atualização de
 * tabelas de CFOP/NCM etc.) NÃO estão aqui — esses são buscados ao vivo
 * de verdade em nfePortalService.js e cacheados na tabela informes_nfe
 * (rota /api/atualizacoes/portal-nfe). A subpágina antiga de "atualização
 * de sistema" do portal (atualizacaoSistemaLista.aspx) continua retornando
 * erro mesmo num navegador real — mas a home do portal (principal.aspx)
 * funciona e lista os mesmos informes na seção "Informes".
 */

const changelogSistema = [
  {
    data: '2026-09-19',
    titulo: 'Busca de CNPJ para clientes, certificado digital, layout de emissão e SEFAZ',
    itens: [
      'Busca de CNPJ (Receita Federal) também no cadastro de cliente',
      'Upload real de certificado digital (.pfx/.p12) em "Minha empresa"',
      'Tela de emissão redesenhada: cabeçalho de documento + resumo fixo lateral + observações no XML',
      'Busca automática de NF-e direto na SEFAZ (Distribuição DFe) — exige certificado A1 real'
    ]
  },
  {
    data: '2026-09-19',
    titulo: 'Consulta pública de CNPJ, reconhecimento de NF-e de entrada e app shell',
    itens: [
      'Consulta de CNPJ na Receita Federal para pré-preencher o cadastro da empresa',
      'Reconhecimento automático de produtos a partir do XML de uma NF-e de compra recebida',
      'Tela reorganizada em abas: Emitir NF-e, Buscar NF-e, Clientes, Produtos, Minha empresa'
    ]
  },
  {
    data: '2026-09-16',
    titulo: 'Motor de classificação fiscal e tela de emissão',
    itens: [
      'Sugestão automática de CFOP/CST/CSOSN a partir da finalidade do produto e do regime tributário',
      'Emissão de NF-e a partir de destinatário + itens do catálogo (numeração e baixa de estoque automáticas)'
    ]
  },
  {
    data: '2026-09-12',
    titulo: 'Reconstrução do projeto: estoque, tributação e EFD',
    itens: [
      'Controle de estoque com preço médio ponderado',
      'Extração de tributação (NCM/ICMS/IPI) a partir do XML da NF-e',
      'Geração de EFD-ICMS/IPI simplificada',
      'Console de testes servido pela própria API'
    ]
  }
];

const marcosReformaTributaria = [
  {
    data: '2023-12-20',
    titulo: 'EC 132/2023 promulgada',
    descricao: 'Emenda constitucional que institui a Reforma Tributária sobre o consumo, criando IBS e CBS em substituição gradual a ICMS, ISS, PIS e COFINS.'
  },
  {
    data: '2025-01-16',
    titulo: 'LC 214/2025 sancionada',
    descricao: 'Lei complementar que regulamenta IBS e CBS: fato gerador, base de cálculo, não-cumulatividade, regimes específicos e os anexos com percentuais de redução por setor (a tabela usada em "Minha empresa" vem daqui).'
  },
  {
    data: '2026-01-01',
    titulo: 'Início da fase de testes (2026)',
    descricao: 'CBS cobrada a 0,9% e IBS a 0,1%, só para calibração dos sistemas — o valor pago é compensado com outros tributos, sem aumento de carga. É o default usado no cálculo desta tela.'
  },
  {
    data: '2027-01-01',
    titulo: 'CBS em vigor (previsto)',
    descricao: 'Extinção de PIS/COFINS e cobrança efetiva da CBS. IBS ainda em fase de teste com alíquota estadual/municipal reduzida.'
  },
  {
    data: '2029-01-01',
    titulo: 'Transição do IBS (previsto, até 2032)',
    descricao: 'Redução progressiva de ICMS/ISS e aumento gradual do IBS ao longo de 4 anos.'
  },
  {
    data: '2033-01-01',
    titulo: 'Sistema novo consolidado (previsto)',
    descricao: 'Extinção definitiva de ICMS e ISS — só IBS e CBS em vigor.'
  }
];

const linksOficiais = [
  { titulo: 'Portal Nacional da NF-e — Página inicial (seção "Informes")', url: 'https://www.nfe.fazenda.gov.br/portal/principal.aspx' },
  { titulo: 'gov.br — Reforma Tributária', url: 'https://www.gov.br/fazenda/pt-br/acesso-a-informacao/acoes-e-programas/reforma-tributaria' },
  { titulo: 'Planalto — LC 214/2025 (texto integral)', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm' }
];

module.exports = { changelogSistema, marcosReformaTributaria, linksOficiais };
