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
const https = require('https');
const zlib = require('zlib');
const { xmlParaObjeto } = require('../utils/xmlHelper');
const { CODIGO_UF } = require('./nfeXmlBuilder');
const Certificado = require('../models/Certificado');
const NFe = require('../models/NFe');
const { descriptografar } = require('../utils/criptografia');
const { extrairPemDoPfx } = require('./certificadoPfxService');

// Limite de páginas por sincronização (cada página traz até 50 documentos) —
// cobre bem mais que o volume normal de 90 dias sem arriscar loop indevido.
const MAX_PAGINAS_POR_SINCRONIZACAO = 40;

// URLs do Ambiente Nacional (AN) — a Distribuição DFe é centralizada,
// não usa os webservices estaduais de autorização.
const URLS_DISTRIBUICAO = {
  homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  producao: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
};

// Entrega o par cert/key já em PEM (ver certificadoPfxService.extrairPemDoPfx)
// em vez de { pfx, passphrase } — o parser de PKCS#12 nativo do Node/OpenSSL
// 3.x rejeita a cifra RC2-40-CBC que a maioria dos certificados A1 da
// ICP-Brasil usa, mesmo com a senha certa. Não define `ca`: a validação do
// certificado do SERVIDOR da SEFAZ usa a lista de raízes confiáveis padrão
// do Node normalmente — só a nossa identidade (cert/key) é que vem do .pfx.
const criarAgenteCertificado = (caminhoArquivo, senha) => {
  const { certPem, keyPem } = extrairPemDoPfx(caminhoArquivo, senha);
  return new https.Agent({ cert: certPem, key: keyPem });
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

/**
 * A chave de acesso de 44 dígitos já embute série e número da nota
 * (posições 22-24 e 25-33). Serve de fallback pra documentos tipo resNFe,
 * que não trazem esses campos separadamente.
 */
const extrairNumeroSerieDaChave = (chaveNFe) => {
  if (!chaveNFe || chaveNFe.length !== 44) return { numero: 0, serie: 1 };
  return {
    serie: parseInt(chaveNFe.substring(22, 25), 10) || 1,
    numero: parseInt(chaveNFe.substring(25, 34), 10) || 0
  };
};

/**
 * Interpreta um documento devolvido pela Distribuição DFe. A SEFAZ manda
 * schemas diferentes conforme o caso:
 * - resNFe_v1.01: resumo (sem XML completo da nota) — ainda dá pra listar
 *   data/fornecedor/valor, mas o "download" só vai ter esse resumo mesmo.
 * - procNFe/nfeProc: NF-e completa autorizada — dá pra baixar de verdade.
 * - resEvento e outros: eventos (cancelamento, carta de correção etc.),
 *   não são notas — ignorados aqui (não fazem sentido numa listagem de compras).
 */
const interpretarDocumento = async (doc) => {
  const obj = await xmlParaObjeto(doc.xml);

  if (obj.resNFe) {
    const r = obj.resNFe;
    const chaveNFe = r.chNFe?.[0] || null;
    return {
      chaveNFe,
      cnpjFornecedor: r.CNPJ?.[0] || r.CPF?.[0] || null,
      nomeFornecedor: r.xNome?.[0] || null,
      valor: r.vNF?.[0] ? Number(r.vNF[0]) : null,
      dataEmissao: r.dhEmi?.[0] || null,
      xmlCompleto: false,
      ...extrairNumeroSerieDaChave(chaveNFe)
    };
  }

  const infNfe = obj.nfeProc?.NFe?.[0]?.infNfe?.[0] || obj.NFe?.infNfe?.[0];
  if (infNfe) {
    const ide = infNfe.ide?.[0] || {};
    const emit = infNfe.emit?.[0] || {};
    const total = infNfe.total?.[0]?.ICMSTot?.[0] || {};
    const chaveNFe = infNfe.$?.Id?.replace('NFe', '') || null;
    return {
      chaveNFe,
      cnpjFornecedor: emit.CNPJ?.[0] || null,
      nomeFornecedor: emit.xNome?.[0] || null,
      valor: total.vNF?.[0] ? Number(total.vNF[0]) : null,
      dataEmissao: ide.dhEmi?.[0] || null,
      xmlCompleto: true,
      numero: ide.nNF?.[0] ? parseInt(ide.nNF[0], 10) : extrairNumeroSerieDaChave(chaveNFe).numero,
      serie: ide.serie?.[0] ? parseInt(ide.serie[0], 10) : extrairNumeroSerieDaChave(chaveNFe).serie
    };
  }

  return null; // schema não tratado (evento, etc.)
};

/**
 * Pagina a Distribuição DFe do zero (NSU 0) até não haver mais documento
 * novo, juntando tudo. Como a SEFAZ mantém os documentos disponíveis por um
 * período limitado (não configurável por data), isso já cobre naturalmente
 * o que estiver disponível — na prática, os últimos ~90 dias.
 */
const buscarTodosDocumentosDisponiveis = async (usuarioId, { cnpj, uf }) => {
  let ultimoNSU = '0';
  const documentos = [];

  for (let pagina = 0; pagina < MAX_PAGINAS_POR_SINCRONIZACAO; pagina++) {
    const resultado = await buscarNovasNotas(usuarioId, { cnpj, uf, ultimoNSU });

    if (resultado.documentos?.length) {
      documentos.push(...resultado.documentos);
    }

    // cStat 138 = "documento(s) localizado(s)"; qualquer outro código (137 =
    // nenhum documento novo, entre outros) significa que já pegamos tudo.
    if (resultado.cStat !== '138') {
      return { documentos, cStat: resultado.cStat, xMotivo: resultado.xMotivo };
    }

    if (!resultado.ultimoNSU || (resultado.maxNSU && resultado.ultimoNSU >= resultado.maxNSU)) {
      return { documentos, cStat: resultado.cStat, xMotivo: resultado.xMotivo };
    }

    ultimoNSU = resultado.ultimoNSU;
  }

  return { documentos, cStat: '138', xMotivo: `Limite de ${MAX_PAGINAS_POR_SINCRONIZACAO} páginas atingido — pode haver mais documentos não sincronizados` };
};

/**
 * Busca tudo que a SEFAZ tiver disponível e salva como NF-e recebida (o
 * que já existir, por chave de acesso, é ignorado — sem duplicar). Retorna
 * um resumo pra UI, nunca o XML cru (isso fica pra tela de listagem).
 */
const sincronizarNotasRecebidas = async (usuarioId, { cnpj, uf }) => {
  const { documentos, cStat, xMotivo } = await buscarTodosDocumentosDisponiveis(usuarioId, { cnpj, uf });

  let novas = 0;
  let ignoradas = 0;

  for (const doc of documentos) {
    const info = await interpretarDocumento(doc);
    if (!info || !info.chaveNFe) {
      ignoradas++;
      continue;
    }

    const jaExiste = await NFe.findOne({ where: { usuarioId, chaveNFe: info.chaveNFe } });
    if (jaExiste) {
      ignoradas++;
      continue;
    }

    await NFe.create({
      usuarioId,
      chaveNFe: info.chaveNFe,
      cnpj: info.cnpjFornecedor || '00000000000000',
      numero: info.numero,
      serie: info.serie,
      xmlContent: doc.xml,
      direcao: 'recebida',
      naturezaOperacao: info.xmlCompleto
        ? 'Compra (via SEFAZ)'
        : 'Resumo (via SEFAZ) — XML completo não disponibilizado para este documento',
      dataEmissao: info.dataEmissao ? new Date(info.dataEmissao) : new Date(),
      valor: info.valor,
      // nomeCliente/cpfCnpjCliente guardam "a outra parte da nota" — aqui é
      // o fornecedor, mesma convenção usada em importarNotaCompra (manual).
      nomeCliente: info.nomeFornecedor,
      cpfCnpjCliente: info.cnpjFornecedor,
      statusSEFAZ: 'autorizada'
    });
    novas++;
  }

  return { totalDocumentos: documentos.length, novas, ignoradas, cStat, xMotivo };
};

module.exports = {
  buscarNovasNotas,
  buscarTodosDocumentosDisponiveis,
  sincronizarNotasRecebidas,
  montarEnvelopeDistDFe,
  processarRespostaDistDFe
};
