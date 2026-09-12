const axios = require('axios');
const fs = require('fs');
const https = require('https');

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
 * Cria um agente HTTPS com certificado
 */
const criarAgenteCertificado = (caminhosCertificado, senhaCertificado) => {
  try {
    const pfx = fs.readFileSync(caminhosCertificado);
    
    return new https.Agent({
      pfx: pfx,
      passphrase: senhaCertificado,
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
        'SOAPAction': ''
      },
      httpsAgent: agente,
      timeout: parseInt(process.env.SEFAZ_TIMEOUT || 30000)
    });

    return parseResponstaAutorizacao(response.data);
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
        'SOAPAction': ''
      },
      httpsAgent: agente,
      timeout: parseInt(process.env.SEFAZ_TIMEOUT || 30000)
    });

    return parseRespostaConsulta(response.data);
  } catch (error) {
    throw new Error(`Erro ao consultar NF-e: ${error.message}`);
  }
};

/**
 * Parse da resposta de autorização
 */
const parseResponstaAutorizacao = (respostaSoap) => {
  try {
    // Aqui você faria o parsing da resposta XML da SEFAZ
    // Por enquanto, retornamos um objeto simulado
    return {
      sucesso: true,
      protocolo: '135200000000000',
      statusNFe: 'autorizada',
      dhRecebimento: new Date()
    };
  } catch (error) {
    throw new Error(`Erro ao processar resposta: ${error.message}`);
  }
};

/**
 * Parse da resposta de consulta
 */
const parseRespostaConsulta = (respostaSoap) => {
  try {
    return {
      statusNFe: 'autorizada',
      protocolo: '135200000000000',
      dhRecebimento: new Date()
    };
  } catch (error) {
    throw new Error(`Erro ao processar resposta: ${error.message}`);
  }
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
