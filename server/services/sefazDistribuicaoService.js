/**
 * Busca automática de NF-e recebidas direto no Ambiente Nacional da NF-e,
 * pelo protocolo real "Distribuição DFe" (o mesmo que softwares como
 * Arquivei, NFe Vault etc. usam para baixar notas sem depender do
 * fornecedor mandar o XML por e-mail).
 *
 * ⚠️ IMPORTANTE: Este serviço monta a requisição real (URL, envelope SOAP,
 * autenticação por certificado A1/A3) conforme o Manual de Orientação do
 * Contribuinte da NF-e. Mas ele SÓ funciona com um certificado digital A1
 * real, emitido pela ICP-Brasil para o CNPJ da empresa — a SEFAZ exige TLS
 * mútuo (o certificado autentica quem está perguntando). Sem um certificado
 * real cadastrado em "Minha empresa", esta função sempre vai falhar com uma
 * mensagem clara, nunca com dados inventados.
 */

const axios = require('axios');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const { xmlParaObjeto } = require('../utils/xmlHelper');
const { CODIGO_UF } = require('./nfeXmlBuilder');
const Certificado = require('../models/Certificado');
const { descriptografar } = require('../utils/criptografia');

// URLs do Ambiente Nacional (AN) — a Distribuição DFe é centralizada,
// não usa os webservices estaduais de autorização.
const URLS_DISTRIBUICAO = {
  homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  producao: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
};

const criarAgenteCertificado = (caminhoArquivo, senha) => {
  const pfx = fs.readFileSync(caminhoArquivo);
  return new https.Agent({ pfx, passphrase: senha });
};

const montarEnvelopeDistDFe = ({ tpAmb, cUFAutor, cnpj, ultNSU }) => {
  const corpo = `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>${tpAmb}</tpAmb><cUFAutor>${cUFAutor}</cUFAutor><CNPJ>${cnpj}</CNPJ><distNSU><ultNSU>${String(ultNSU).padStart(15, '0')}</ultNSU></distNSU></distDFeInt>`;

  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>${corpo}</nfeDadosMsg></nfeDistDFeInteresse></soap:Body></soap:Envelope>`;
};

/**
 * Descompacta um <docZip> (Base64 + GZip) da resposta da SEFAZ.
 */
const descompactarDocZip = (base64Gzip) => {
  return zlib.gunzipSync(Buffer.from(base64Gzip, 'base64')).toString('utf-8');
};

/**
 * Navega a resposta SOAP até a lista de documentos e descompacta cada um.
 * Layout real: Envelope > Body > nfeDistDFeInteresseResponse > nfeDistDFeInteresseResult
 * > retDistDFeInt > loteDistDFeInt > docZip[] (cada um com atributo NSU e schema).
 */
const processarRespostaDistDFe = async (respostaXml) => {
  const obj = await xmlParaObjeto(respostaXml);
  const envelope = obj['soap:Envelope'] || obj.Envelope || obj;
  const body = envelope?.['soap:Body']?.[0] || envelope?.Body?.[0];

  const resultado = body?.nfeDistDFeInteresseResponse?.[0]?.nfeDistDFeInteresseResult?.[0];
  if (!resultado) {
    throw new Error('Resposta da SEFAZ em formato inesperado — verifique manualmente o XML retornado.');
  }

  const ret = resultado.retDistDFeInt?.[0];
  const cStat = ret?.cStat?.[0];
  const xMotivo = ret?.xMotivo?.[0];

  if (cStat !== '138') {
    // 138 = "Documento(s) localizado(s)"; outros códigos indicam erro ou nenhum documento novo
    return { cStat, xMotivo, ultimoNSU: ret?.ultNSU?.[0] || null, documentos: [] };
  }

  const docZips = ret.loteDistDFeInt?.[0]?.docZip || [];
  const documentos = docZips.map((doc) => {
    const xml = descompactarDocZip(doc._);
    return { nsu: doc.$.NSU, schema: doc.$.schema, xml };
  });

  return { cStat, xMotivo, ultimoNSU: ret?.ultNSU?.[0] || null, maxNSU: ret?.maxNSU?.[0] || null, documentos };
};

/**
 * Consulta novas notas para o CNPJ do usuário. Usa o certificado ativo
 * cadastrado para esse CNPJ; sem um, recusa com mensagem clara.
 */
const buscarNovasNotas = async (usuarioId, { cnpj, uf, ultimoNSU = '0' }) => {
  const certificado = await Certificado.findOne({ where: { usuarioId, cnpj, ativo: true } });
  if (!certificado) {
    throw new Error('Nenhum certificado digital ativo encontrado para este CNPJ. Cadastre um em "Minha empresa" → Certificado digital.');
  }

  let agente;
  try {
    agente = criarAgenteCertificado(certificado.caminhoArquivo, descriptografar(certificado.senha));
  } catch (error) {
    throw new Error(`Não foi possível carregar o certificado: ${error.message}. Confira se o arquivo é um .pfx/.p12 válido.`);
  }

  const cUFAutor = CODIGO_UF[String(uf || '').toUpperCase()];
  if (!cUFAutor) {
    throw new Error(`UF inválida: "${uf}"`);
  }

  const ambiente = process.env.SEFAZ_ENV === 'producao' ? 'producao' : 'homologacao';
  const url = URLS_DISTRIBUICAO[ambiente];
  const tpAmb = ambiente === 'producao' ? '1' : '2';

  const envelope = montarEnvelopeDistDFe({ tpAmb, cUFAutor, cnpj: String(cnpj).replace(/\D/g, ''), ultNSU: ultimoNSU });

  let resposta;
  try {
    resposta = await axios.post(url, envelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse'
      },
      httpsAgent: agente,
      timeout: parseInt(process.env.SEFAZ_TIMEOUT || '30000', 10)
    });
  } catch (error) {
    throw new Error(
      `Não foi possível conectar à SEFAZ com este certificado: ${error.message}. ` +
      `Isso é esperado se o certificado cadastrado não for um A1 real emitido pela ICP-Brasil para este CNPJ — ` +
      `a SEFAZ exige autenticação mútua por certificado válido para este serviço.`
    );
  }

  return processarRespostaDistDFe(resposta.data);
};

module.exports = { buscarNovasNotas, montarEnvelopeDistDFe, processarRespostaDistDFe };
