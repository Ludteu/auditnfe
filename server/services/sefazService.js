const axios = require('axios');
const https = require('https');
const { extrairPemDoPfx } = require('./certificadoPfxService');
const { xmlParaObjeto } = require('../utils/xmlHelper');

/**
 * Procura uma tag em qualquer profundidade do objeto que o xml2js gera
 * (tudo vem como array em cada nível) — usado pra achar cStat/xMotivo/
 * nProt/nRec na resposta da SEFAZ sem depender de saber a estrutura
 * exata de envelope de cada UF (varia entre síncrono e assíncrono).
 */
const buscarTag = (obj, tag) => {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const achado = buscarTag(item, tag);
      if (achado != null) return achado;
    }
    return null;
  }
  if (tag in obj) {
    const valor = obj[tag];
    return Array.isArray(valor) ? valor[0] : valor;
  }
  for (const chave of Object.keys(obj)) {
    const achado = buscarTag(obj[chave], tag);
    if (achado != null) return achado;
  }
  return null;
};

// URLs dos webservices SEFAZ por UF
const URLS_SEFAZ = {
  homologacao: {
    SP: 'https://nfe.sefaz.sp.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
    MG: 'https://nfe.sefaz.mg.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
    // Adicione outras UFs conforme necessário
  },
  producao: {
    SP: 'https://nfe.sefaz.sp.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
    MG: 'https://nfe.sefaz.mg.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
  }
};

/**
 * Cria um agente HTTPS com certificado. Usa o par cert/key já em PEM (ver
 * certificadoPfxService.extrairPemDoPfx) em vez de { pfx, passphrase } — o
 * parser de PKCS#12 nativo do Node/OpenSSL 3.x rejeita a cifra RC2-40-CBC
 * que a maioria dos certificados A1 da ICP-Brasil usa, mesmo com a senha
 * certa e o arquivo íntegro.
 */
const criarAgenteCertificado = (caminhosCertificado, senhaCertificado) => {
  try {
    const { certPem, keyPem } = extrairPemDoPfx(caminhosCertificado, senhaCertificado);
    return new https.Agent({
      cert: certPem,
      key: keyPem,
      rejectUnauthorized: false // ⚠️ Apenas para desenvolvimento
    });
  } catch (error) {
    throw new Error(`Erro ao carregar certificado: ${error.message}`);
  }
};

/**
 * Envia NF-e para autorização na SEFAZ
 */
const enviarNFeAutorizacao = async (xmlAssinado, certificado, senhaCertificado, uf = 'SP') => {
  try {
    const ambiente = process.env.SEFAZ_ENV || 'homologacao';
    const url = URLS_SEFAZ[ambiente]?.[uf];

    if (!url) {
      throw new Error(`URL SEFAZ não configurada para ${uf} em ${ambiente}`);
    }

    const agente = criarAgenteCertificado(certificado, senhaCertificado);

    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/webservices/NFeAutorizacao4">
      ${xmlAssinado}
    </nfeDadosMsg>
  </soap:Body>
</soap:Envelope>`;

    const response = await axios.post(url, soap, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote'
      },
      httpsAgent: agente,
      timeout: parseInt(process.env.SEFAZ_TIMEOUT || 30000)
    });

    return await parseResponstaAutorizacao(response.data);
  } catch (error) {
    throw new Error(`Erro ao enviar NF-e para SEFAZ: ${error.message}`);
  }
};

/**
 * Consulta status de uma NF-e na SEFAZ
 */
const consultarStatusNFe = async (chaveNFe, certificado, senhaCertificado, uf = 'SP') => {
  try {
    const ambiente = process.env.SEFAZ_ENV || 'homologacao';
    const url = URLS_SEFAZ[ambiente]?.[uf];

    if (!url) {
      throw new Error(`URL SEFAZ não configurada para ${uf}`);
    }

    const agente = criarAgenteCertificado(certificado, senhaCertificado);

    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/webservices/NFeConsultaProtocolo4">
      <chNFe>${chaveNFe}</chNFe>
    </nfeDadosMsg>
  </soap:Body>
</soap:Envelope>`;

    const response = await axios.post(url, soap, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF'
      },
      httpsAgent: agente,
      timeout: parseInt(process.env.SEFAZ_TIMEOUT || 30000)
    });

    return await parseRespostaConsulta(response.data);
  } catch (error) {
    throw new Error(`Erro ao consultar NF-e: ${error.message}`);
  }
};

/**
 * Parse da resposta REAL de autorização. Nunca inventa um protocolo — só
 * reporta "autorizada" quando a SEFAZ de verdade mandou cStat 100 com um
 * nProt junto. As UFs mais modernas respondem de forma assíncrona (dão só
 * um recibo de lote, cStat 103/104, e a confirmação real vem de uma
 * segunda chamada a NFeRetAutorizacao4, que este sistema ainda não
 * implementa) — nesse caso falha com uma mensagem clara em vez de fingir
 * que já sabe o resultado.
 */
const parseResponstaAutorizacao = async (respostaSoap) => {
  const obj = await xmlParaObjeto(respostaSoap);
  const cStat = buscarTag(obj, 'cStat');
  const xMotivo = buscarTag(obj, 'xMotivo');
  const nProt = buscarTag(obj, 'nProt');
  const nRec = buscarTag(obj, 'nRec');

  if (!cStat) {
    throw new Error('Resposta da SEFAZ em formato inesperado — não foi possível localizar o status (cStat) nela. Confira o XML retornado manualmente.');
  }

  if (cStat === '100' && nProt) {
    return { statusNFe: 'autorizada', protocolo: nProt, cStat, xMotivo };
  }

  if (nRec && !nProt) {
    throw new Error(
      `A SEFAZ recebeu o lote (recibo ${nRec}, cStat ${cStat} — ${xMotivo || 'processamento assíncrono'}), mas a consulta do resultado final ` +
      '(webservice NFeRetAutorizacao4) ainda não está implementada neste sistema — não dá pra confirmar autorização automaticamente ainda.'
    );
  }

  return { statusNFe: 'rejeitada', protocolo: null, cStat, xMotivo: xMotivo || 'Rejeitada pela SEFAZ (motivo não identificado na resposta)' };
};

/**
 * Parse da resposta REAL de consulta de protocolo — mesma lógica: só
 * reporta o que a SEFAZ respondeu de verdade.
 */
const parseRespostaConsulta = async (respostaSoap) => {
  const obj = await xmlParaObjeto(respostaSoap);
  const cStat = buscarTag(obj, 'cStat');
  const xMotivo = buscarTag(obj, 'xMotivo');
  const nProt = buscarTag(obj, 'nProt');

  if (!cStat) {
    throw new Error('Resposta da SEFAZ em formato inesperado — não foi possível localizar o status (cStat) nela.');
  }

  return {
    statusNFe: cStat === '100' ? 'autorizada' : 'rejeitada',
    protocolo: nProt || null,
    cStat,
    xMotivo
  };
};

/**
 * Valida certificado
 */
const validarCertificado = (caminhosCertificado, senhaCertificado) => {
  try {
    const agente = criarAgenteCertificado(caminhosCertificado, senhaCertificado);
    return {
      valido: true,
      mensagem: 'Certificado carregado com sucesso'
    };
  } catch (error) {
    return {
      valido: false,
      erro: error.message
    };
  }
};

module.exports = {
  enviarNFeAutorizacao,
  consultarStatusNFe,
  validarCertificado
};
