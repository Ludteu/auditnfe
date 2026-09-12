const xml2js = require('xml2js');
const js2xmlparser = require('js2xmlparser');

const xmlBuilder = new xml2js.Builder({
  rootName: 'NFe',
  xmldec: { version: '1.0', encoding: 'UTF-8' }
});

const xmlParser = new xml2js.Parser();

/**
 * Converte objeto JavaScript para XML
 */
const objetoParaXml = (dados) => {
  try {
    return js2xmlparser.parse('NFe', dados);
  } catch (error) {
    throw new Error(`Erro ao converter para XML: ${error.message}`);
  }
};

/**
 * Converte XML para objeto JavaScript
 */
const xmlParaObjeto = async (xmlContent) => {
  try {
    return await xmlParser.parseStringPromise(xmlContent);
  } catch (error) {
    throw new Error(`Erro ao parsear XML: ${error.message}`);
  }
};

/**
 * Valida estrutura básica do XML NF-e
 */
const validarXmlBasico = async (xmlContent) => {
  try {
    const obj = await xmlParaObjeto(xmlContent);
    
    const nfe = obj?.NFe?.infNfe?.[0];
    if (!nfe) {
      throw new Error('XML inválido: estrutura NF-e não encontrada');
    }

    const campos = {
      ide: nfe.ide?.[0],
      emit: nfe.emit?.[0],
      dest: nfe.dest?.[0],
      det: nfe.det
    };

    for (const [campo, valor] of Object.entries(campos)) {
      if (!valor) {
        throw new Error(`Campo obrigatório ausente: ${campo}`);
      }
    }

    return true;
  } catch (error) {
    throw new Error(`Validação XML falhou: ${error.message}`);
  }
};

/**
 * Extrai chave NF-e do XML
 */
const extrairChaveNFe = async (xmlContent) => {
  try {
    const obj = await xmlParaObjeto(xmlContent);
    return obj?.NFe?.infNfe?.[0]?.$?.Id?.replace('NFe', '');
  } catch (error) {
    throw new Error(`Erro ao extrair chave: ${error.message}`);
  }
};

/**
 * Formata XML com indentação
 */
const formatarXml = (xmlContent) => {
  try {
    const reg = /(>)(<)(\/*)/g;
    let formatado = xmlContent.replace(reg, '$1\n$2$3');
    let pad = 0;
    
    formatado = formatado.split('\n').map(node => {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (node.match(/^<\/\w/)) {
        if (pad !== 0) {
          pad -= 1;
        }
      } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
        indent = 1;
      } else {
        indent = 0;
      }
      
      let padding = '';
      for (let i = 0; i < pad; i++) {
        padding += '  ';
      }
      
      pad += indent;
      return padding + node;
    }).join('\n');
    
    return formatado;
  } catch (error) {
    return xmlContent;
  }
};

module.exports = {
  objetoParaXml,
  xmlParaObjeto,
  validarXmlBasico,
  extrairChaveNFe,
  formatarXml
};
