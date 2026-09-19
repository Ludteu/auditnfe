/**
 * Reforma Tributária (EC 132/2023, LC 214/2025) — IBS e CBS.
 *
 * ⚠️ IMPORTANTE: A reforma está em fase de implantação e os detalhes técnicos
 * (layout de XML, tabela oficial de cClassTrib, alíquotas definitivas) ainda
 * estão sendo publicados e ATUALIZADOS pela Receita Federal/Comitê Gestor do
 * IBS ao longo da transição (2026-2033). Este módulo implementa o CÁLCULO da
 * base reduzida por segmento — que é a parte estável e já definida em lei —,
 * mas NÃO gera o XML de IBS/CBS (o grupo de tags ainda não está consolidado)
 * nem cobre situações específicas de cada anexo em detalhe (cesta básica
 * nacional, por exemplo, tem lista fechada de produtos por NCM que não está
 * embutida aqui). Trate os percentuais como ponto de partida a confirmar com
 * um contador, não como fonte definitiva.
 *
 * Alíquotas: 2026 é ano de teste (LC 214/2025, art. 136) com CBS a 0,9% e
 * IBS a 0,1%, só para calibração — sem cobrança efetiva (compensam com
 * outros tributos). As alíquotas "cheias" (~26,5% combinado, ainda em
 * calibração pelo Senado) só entram em vigor gradualmente a partir de 2027
 * (CBS) e 2029 (IBS), com extinção total do sistema antigo em 2033. Por
 * isso os campos de alíquota ficam configuráveis por empresa, não fixos.
 */

const SEGMENTOS_REFORMA = {
  padrao: { percentualReducao: 0, descricao: 'Padrão (comércio, indústria, serviços gerais)' },
  profissoes_intelectuais: { percentualReducao: 30, descricao: 'Profissões intelectuais (advogado, contador, arquiteto, engenheiro, médico)' },
  bares_restaurantes: { percentualReducao: 40, descricao: 'Bares e restaurantes' },
  hotelaria_parques: { percentualReducao: 40, descricao: 'Hotelaria e parques (diversão / temáticos)' },
  transporte_coletivo: { percentualReducao: 40, descricao: 'Transporte coletivo (rodoviário / ferroviário / hidroviário)' },
  transporte_aereo_regional: { percentualReducao: 40, descricao: 'Transporte aéreo regional' },
  agencias_turismo: { percentualReducao: 40, descricao: 'Agências de turismo' },
  operacoes_imobiliarias: { percentualReducao: 50, descricao: 'Operações imobiliárias (venda / incorporação)' },
  educacao: { percentualReducao: 60, descricao: 'Educação (Anexo II da LC 214/2025)' },
  saude_humana: { percentualReducao: 60, descricao: 'Saúde humana (Anexo III da LC 214/2025)' },
  dispositivos_medicos: { percentualReducao: 60, descricao: 'Dispositivos médicos (Anexo IV da LC 214/2025)' },
  medicamentos_nao_essenciais: { percentualReducao: 60, descricao: 'Medicamentos não-essenciais (Anexo V da LC 214/2025)' },
  higiene_limpeza: { percentualReducao: 60, descricao: 'Higiene pessoal e limpeza (Anexo VIII da LC 214/2025)' },
  produtos_agropecuarios: { percentualReducao: 60, descricao: 'Produtos agropecuários (Anexo IX da LC 214/2025)' },
  locacao_imoveis: { percentualReducao: 70, descricao: 'Locação de imóveis (aluguel)' },
  cesta_basica_pcd: { percentualReducao: 100, descricao: 'Cesta básica nacional / medicamentos essenciais / itens para PCD' }
};

const SEGMENTOS_VALIDOS = Object.keys(SEGMENTOS_REFORMA);

// Alíquotas de teste vigentes em 2026 (LC 214/2025) — servem só de default inicial
const ALIQUOTA_IBS_TESTE_2026 = 0.1;
const ALIQUOTA_CBS_TESTE_2026 = 0.9;

/**
 * Calcula a base reduzida e os valores de IBS/CBS para uma operação, a
 * partir do percentual de redução do segmento.
 */
const calcularIbsCbs = ({ valorOperacao, segmento = 'padrao', aliquotaIbs, aliquotaCbs }) => {
  const config = SEGMENTOS_REFORMA[segmento];
  if (!config) {
    throw new Error(`Segmento inválido. Use um de: ${SEGMENTOS_VALIDOS.join(', ')}`);
  }
  if (valorOperacao == null || valorOperacao < 0) {
    throw new Error('valorOperacao deve ser um número maior ou igual a zero');
  }

  const valor = Number(valorOperacao);
  const percentualReducao = config.percentualReducao;
  const baseCalculoReduzida = Number((valor * (1 - percentualReducao / 100)).toFixed(2));

  const pIbs = aliquotaIbs != null ? Number(aliquotaIbs) : ALIQUOTA_IBS_TESTE_2026;
  const pCbs = aliquotaCbs != null ? Number(aliquotaCbs) : ALIQUOTA_CBS_TESTE_2026;

  const valorIbs = Number((baseCalculoReduzida * (pIbs / 100)).toFixed(2));
  const valorCbs = Number((baseCalculoReduzida * (pCbs / 100)).toFixed(2));

  return {
    segmento,
    segmentoDescricao: config.descricao,
    percentualReducao,
    baseCalculoOriginal: Number(valor.toFixed(2)),
    baseCalculoReduzida,
    aliquotaIbs: pIbs,
    aliquotaCbs: pCbs,
    valorIbs,
    valorCbs,
    valorTotalTributos: Number((valorIbs + valorCbs).toFixed(2)),
    aviso: 'Cálculo de referência (percentual de redução por segmento). Alíquotas de teste 2026 por padrão — confirme com um contador antes de usar em produção.'
  };
};

module.exports = {
  SEGMENTOS_REFORMA,
  SEGMENTOS_VALIDOS,
  ALIQUOTA_IBS_TESTE_2026,
  ALIQUOTA_CBS_TESTE_2026,
  calcularIbsCbs
};
