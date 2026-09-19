/**
 * Monta o XML de uma NF-e a partir de dados estruturados (emitente,
 * destinatário, itens já classificados fiscalmente).
 *
 * A chave de acesso (44 dígitos) segue a estrutura real da NF-e —
 * inclusive o dígito verificador, calculado pelo algoritmo padrão
 * (módulo 11) — mas não passa pela SEFAZ, então tpEmis e cNF são
 * simulados. Os grupos de ICMS/IPI seguem os nomes de tag reais
 * (ICMS00, ICMS40, ICMSSN102, IPITrib...) para o subconjunto de
 * CST/CSOSN que o fiscalRulesService sugere.
 */

const CODIGO_UF = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
  MG: '31', ES: '32', RJ: '33', SP: '35',
  PR: '41', SC: '42', RS: '43',
  MS: '50', MT: '51', GO: '52', DF: '53'
};

const escapeXml = (valor) => String(valor ?? '').replace(/[<>&'"]/g, (c) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
}[c]));

const calcularDVChave = (chave43) => {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  let pesoIndex = 0;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += parseInt(chave43[i], 10) * pesos[pesoIndex];
    pesoIndex = (pesoIndex + 1) % pesos.length;
  }
  const resto = soma % 11;
  return resto === 0 || resto === 1 ? 0 : 11 - resto;
};

const gerarChaveNFe = ({ ufSigla, cnpj, numero, serie, dataEmissao }) => {
  const cUF = CODIGO_UF[String(ufSigla || '').toUpperCase()];
  if (!cUF) {
    throw new Error(`UF do emitente inválida ou não configurada: "${ufSigla}". Configure em PUT /api/usuarios/perfil.`);
  }

  const data = new Date(dataEmissao);
  const aamm = `${String(data.getUTCFullYear()).slice(2)}${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
  const cnpjLimpo = String(cnpj).replace(/\D/g, '').padStart(14, '0');
  const modelo = '55';
  const serieStr = String(serie).padStart(3, '0');
  const numeroStr = String(numero).padStart(9, '0');
  const tpEmis = '1';
  const cNF = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');

  const chave43 = `${cUF}${aamm}${cnpjLimpo}${modelo}${serieStr}${numeroStr}${tpEmis}${cNF}`;
  const dv = calcularDVChave(chave43);

  return `${chave43}${dv}`;
};

/**
 * Monta o grupo XML de ICMS de um item, com o nome de tag real
 * correspondente ao CST/CSOSN sugerido pelo fiscalRulesService.
 */
const montarGrupoIcms = (item) => {
  const codigo = item.codigoIcms || '00';

  if (item.tabelaIcms === 'CSOSN') {
    const tag = `ICMSSN${codigo}`;
    // CSOSN 101/900 podem levar campos de crédito, mas isso é feature futura.
    return `<ICMS><${tag}><orig>0</orig><CSOSN>${codigo}</CSOSN></${tag}></ICMS>`;
  }

  const tag = `ICMS${codigo}`;
  if (codigo === '40' || codigo === '41') {
    // Isenta / não tributada: sem base de cálculo
    return `<ICMS><${tag}><orig>0</orig><CST>${codigo}</CST></${tag}></ICMS>`;
  }

  const base = Number(item.icmsBaseCalculo ?? item.valorTotal).toFixed(2);
  const aliquota = Number(item.icmsAliquota || 0).toFixed(2);
  const valor = Number(item.icmsValor || 0).toFixed(2);
  return `<ICMS><${tag}><orig>0</orig><CST>${codigo}</CST><modBC>3</modBC><vBC>${base}</vBC><pICMS>${aliquota}</pICMS><vICMS>${valor}</vICMS></${tag}></ICMS>`;
};

const montarGrupoIpi = (item) => {
  if (!item.ipiAliquota || Number(item.ipiAliquota) <= 0) return '';
  const cst = item.cstIpi || '50';
  const base = Number(item.valorTotal).toFixed(2);
  const aliquota = Number(item.ipiAliquota).toFixed(2);
  const valor = Number(item.ipiValor || 0).toFixed(2);
  return `<IPI><IPITrib><CST>${cst}</CST><vBC>${base}</vBC><pIPI>${aliquota}</pIPI><vIPI>${valor}</vIPI></IPITrib></IPI>`;
};

/**
 * Monta o XML completo da NF-e. Retorna { xmlContent, chaveNFe }.
 */
const montarXmlNFe = ({ emitente, destinatario, itens, numero, serie, naturezaOperacao, dataEmissao, observacoes }) => {
  const dataFinal = dataEmissao || new Date();
  const chaveNFe = gerarChaveNFe({ ufSigla: emitente.uf, cnpj: emitente.cnpj, numero, serie, dataEmissao: dataFinal });

  const detsXml = itens.map((item, idx) => `
    <det nItem="${idx + 1}">
      <prod>
        <cProd>${escapeXml(item.codigo)}</cProd>
        <xProd>${escapeXml(item.descricao)}</xProd>
        <NCM>${escapeXml(item.ncm || '00000000')}</NCM>
        <CFOP>${escapeXml(item.cfop)}</CFOP>
        <uCom>${escapeXml(item.unidade || 'UN')}</uCom>
        <qCom>${Number(item.quantidade).toFixed(4)}</qCom>
        <vUnCom>${Number(item.valorUnitario).toFixed(4)}</vUnCom>
        <vProd>${Number(item.valorTotal).toFixed(2)}</vProd>
      </prod>
      <imposto>
        ${montarGrupoIcms(item)}
        ${montarGrupoIpi(item)}
      </imposto>
    </det>`).join('');

  const enderEmit = [
    emitente.logradouro ? `<xLgr>${escapeXml(emitente.logradouro)}</xLgr>` : '',
    emitente.numero ? `<nro>${escapeXml(emitente.numero)}</nro>` : '',
    emitente.bairro ? `<xBairro>${escapeXml(emitente.bairro)}</xBairro>` : '',
    emitente.cidade ? `<xMun>${escapeXml(emitente.cidade)}</xMun>` : '',
    `<UF>${emitente.uf.toUpperCase()}</UF>`,
    emitente.cep ? `<CEP>${escapeXml(emitente.cep)}</CEP>` : ''
  ].join('');

  const infAdic = observacoes ? `<infAdic><infCpl>${escapeXml(observacoes)}</infCpl></infAdic>` : '';

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNfe Id="NFe${chaveNFe}" versao="4.00"><ide><cUF>${CODIGO_UF[emitente.uf.toUpperCase()]}</cUF><natOp>${escapeXml(naturezaOperacao || 'Venda de mercadoria')}</natOp><mod>55</mod><serie>${serie}</serie><nNF>${numero}</nNF><dhEmi>${new Date(dataFinal).toISOString()}</dhEmi></ide><emit><CNPJ>${escapeXml(String(emitente.cnpj).replace(/\D/g, ''))}</CNPJ><xNome>${escapeXml(emitente.razaoSocial || emitente.nome)}</xNome><enderEmit>${enderEmit}</enderEmit></emit><dest><CNPJ>${escapeXml(String(destinatario.cpfCnpj).replace(/\D/g, ''))}</CNPJ><xNome>${escapeXml(destinatario.nome)}</xNome><enderDest><UF>${destinatario.uf.toUpperCase()}</UF></enderDest></dest>${detsXml}${infAdic}</infNfe></NFe>`;

  return { xmlContent, chaveNFe };
};

module.exports = {
  montarXmlNFe,
  gerarChaveNFe,
  calcularDVChave,
  CODIGO_UF
};
