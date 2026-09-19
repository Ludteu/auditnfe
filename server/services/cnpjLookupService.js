const axios = require('axios');

/**
 * Consulta dados públicos de um CNPJ via BrasilAPI, que agrega o
 * cadastro da Receita Federal. Não requer chave de API.
 * https://brasilapi.com.br/docs#tag/CNPJ
 */
const consultarCnpj = async (cnpj) => {
  const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
  if (cnpjLimpo.length !== 14) {
    throw new Error('CNPJ deve ter 14 dígitos');
  }

  let data;
  try {
    const resposta = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`, { timeout: 8000 });
    data = resposta.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error('CNPJ não encontrado na Receita Federal');
    }
    throw new Error('Não foi possível consultar o CNPJ agora. Tente novamente em instantes.');
  }

  const regimeMaisRecente = Array.isArray(data.regime_tributario) && data.regime_tributario.length > 0
    ? [...data.regime_tributario].sort((a, b) => b.ano - a.ano)[0]
    : null;

  let regimeTributarioSugerido = null;
  if (regimeMaisRecente?.forma_de_tributacao === 'LUCRO REAL') regimeTributarioSugerido = 'lucro_real';
  else if (regimeMaisRecente?.forma_de_tributacao === 'LUCRO PRESUMIDO') regimeTributarioSugerido = 'lucro_presumido';
  else if (data.opcao_pelo_simples === true) regimeTributarioSugerido = 'simples_nacional';

  return {
    cnpj: data.cnpj,
    razaoSocial: data.razao_social,
    nomeFantasia: data.nome_fantasia || null,
    situacaoCadastral: data.descricao_situacao_cadastral,
    ativa: data.descricao_situacao_cadastral === 'ATIVA',
    uf: data.uf,
    cidade: data.municipio,
    cep: data.cep ? String(data.cep).replace(/\D/g, '') : null,
    logradouro: [data.descricao_tipo_de_logradouro, data.logradouro].filter(Boolean).join(' '),
    numero: data.numero || null,
    bairro: data.bairro || null,
    telefone: data.ddd_telefone_1 || null,
    cnaePrincipal: data.cnae_fiscal_descricao || null,
    regimeTributarioSugerido,
    avisoRegime: regimeTributarioSugerido
      ? null
      : 'Não foi possível determinar o regime tributário automaticamente a partir dos dados públicos — selecione manualmente.'
  };
};

module.exports = { consultarCnpj };
