const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const { xmlParaObjeto } = require('../utils/xmlHelper');

/**
 * DANFE simplificado (Documento Auxiliar da Nota Fiscal Eletrônica) — layout
 * inspirado no modelo oficial (retrato, blocos de emitente/destinatário,
 * chave de acesso com código de barras, tabela de itens, totais), mas sem
 * pretender ser 100% conforme o Manual de Orientação do Contribuinte em
 * cada detalhe de posicionamento. Serve pra conferir a nota antes/depois
 * da emissão — não é o layout usado pela SEFAZ pra nada além de leitura.
 *
 * Importante: um DANFE só tem valor fiscal de verdade quando a NF-e por
 * trás dele foi autorizada pela SEFAZ (protocolo de autorização real).
 * Como a transmissão real ainda não está implementada neste sistema (ver
 * aviso em sefazService.js), todo PDF gerado aqui carimba isso com
 * clareza — nunca finge uma autorização que não existe.
 */

const formatarMoeda = (valor) => `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;

const formatarChave = (chave) => (chave || '').replace(/(\d{4})(?=\d)/g, '$1 ');

const formatarData = (data) => {
  if (!data) return '—';
  return new Date(data).toLocaleString('pt-BR', { timeZone: 'UTC' });
};

/**
 * Monta os dados normalizados do DANFE a partir dos registros já
 * estruturados no banco — usado para notas EMITIDAS por esta empresa
 * (temos ItemNFe, Usuario emitente e Destinatario com todos os campos).
 */
const montarDadosDeRegistrosLocais = ({ nfe, itens, emitente, destinatario }) => ({
  chaveNFe: nfe.chaveNFe,
  numero: nfe.numero,
  serie: nfe.serie,
  naturezaOperacao: nfe.naturezaOperacao,
  dataEmissao: nfe.dataEmissao,
  statusSEFAZ: nfe.statusSEFAZ,
  protocolo: nfe.protocolo,
  emitente: {
    nome: emitente.razaoSocial || emitente.nome,
    cnpj: emitente.cnpj,
    endereco: [emitente.logradouro, emitente.numero, emitente.bairro].filter(Boolean).join(', '),
    cidadeUf: [emitente.cidade, emitente.uf].filter(Boolean).join(' - ')
  },
  destinatario: destinatario ? {
    nome: destinatario.nome,
    cpfCnpj: destinatario.cpfCnpj,
    endereco: [destinatario.logradouro, destinatario.numero, destinatario.bairro].filter(Boolean).join(', '),
    cidadeUf: [destinatario.cidade, destinatario.uf].filter(Boolean).join(' - ')
  } : { nome: nfe.nomeCliente || '—', cpfCnpj: nfe.cpfCnpjCliente || '—', endereco: '', cidadeUf: '' },
  itens: itens.map((item) => ({
    codigo: item.codigo,
    descricao: item.descricao,
    ncm: item.ncm,
    cfop: item.cfop,
    unidade: item.unidade,
    quantidade: Number(item.quantidade),
    valorUnitario: Number(item.valorUnitario),
    valorTotal: Number(item.valorTotal),
    icmsValor: Number(item.icmsValor || 0)
  })),
  valorTotalProdutos: itens.reduce((soma, i) => soma + Number(i.valorTotal), 0),
  valorTotalIcms: itens.reduce((soma, i) => soma + Number(i.icmsValor || 0), 0),
  valorTotalNota: Number(nfe.valor || 0)
});

/**
 * Monta os dados do DANFE a partir do XML puro — usado para notas
 * RECEBIDAS (importadas manualmente ou trazidas pela busca da SEFAZ),
 * onde só temos o XML, não linhas estruturadas no banco. Aceita tanto
 * <NFe> na raiz quanto <nfeProc><NFe>...— os dois formatos que aparecem
 * dependendo de como o documento chegou. Retorna null quando o XML é só
 * um resumo (resNFe), que não tem itens nem dados suficientes pra montar
 * um DANFE de verdade.
 */
const montarDadosDeXml = async (xmlContent) => {
  const obj = await xmlParaObjeto(xmlContent);
  const infNfe = obj.nfeProc?.NFe?.[0]?.infNfe?.[0] || obj.NFe?.infNfe?.[0];
  if (!infNfe) return null;

  const ide = infNfe.ide?.[0] || {};
  const emit = infNfe.emit?.[0] || {};
  const enderEmit = emit.enderEmit?.[0] || {};
  const dest = infNfe.dest?.[0] || {};
  const enderDest = dest.enderDest?.[0] || {};
  const total = infNfe.total?.[0]?.ICMSTot?.[0] || {};
  const protNFe = obj.nfeProc?.protNFe?.[0]?.infProt?.[0];

  const detalhes = infNfe.det || [];
  const itens = detalhes.map((det) => {
    const prod = det.prod?.[0] || {};
    const imposto = det.imposto?.[0] || {};
    const icms = imposto.ICMS?.[0];
    const icmsGrupo = icms ? Object.values(icms)[0]?.[0] : {};
    return {
      codigo: prod.cProd?.[0] || '',
      descricao: prod.xProd?.[0] || '',
      ncm: prod.NCM?.[0] || '',
      cfop: prod.CFOP?.[0] || '',
      unidade: prod.uCom?.[0] || 'UN',
      quantidade: Number(prod.qCom?.[0] || 0),
      valorUnitario: Number(prod.vUnCom?.[0] || 0),
      valorTotal: Number(prod.vProd?.[0] || 0),
      icmsValor: Number(icmsGrupo?.vICMS?.[0] || 0)
    };
  });

  return {
    chaveNFe: infNfe.$?.Id?.replace('NFe', '') || null,
    numero: ide.nNF?.[0] ? parseInt(ide.nNF[0], 10) : null,
    serie: ide.serie?.[0] ? parseInt(ide.serie[0], 10) : 1,
    naturezaOperacao: ide.natOp?.[0] || null,
    dataEmissao: ide.dhEmi?.[0] || null,
    statusSEFAZ: protNFe ? 'autorizada' : 'pendente',
    protocolo: protNFe?.nProt?.[0] || null,
    emitente: {
      nome: emit.xNome?.[0] || '—',
      cnpj: emit.CNPJ?.[0] || '',
      endereco: [enderEmit.xLgr?.[0], enderEmit.nro?.[0], enderEmit.xBairro?.[0]].filter(Boolean).join(', '),
      cidadeUf: [enderEmit.xMun?.[0], enderEmit.UF?.[0]].filter(Boolean).join(' - ')
    },
    destinatario: {
      nome: dest.xNome?.[0] || '—',
      cpfCnpj: dest.CNPJ?.[0] || dest.CPF?.[0] || '',
      endereco: [enderDest.xLgr?.[0], enderDest.nro?.[0], enderDest.xBairro?.[0]].filter(Boolean).join(', '),
      cidadeUf: [enderDest.xMun?.[0], enderDest.UF?.[0]].filter(Boolean).join(' - ')
    },
    itens,
    valorTotalProdutos: Number(total.vProd?.[0] || 0),
    valorTotalIcms: Number(total.vICMS?.[0] || 0),
    valorTotalNota: Number(total.vNF?.[0] || 0)
  };
};

const gerarCodigoBarras = (chave) => new Promise((resolve, reject) => {
  bwipjs.toBuffer({ bcid: 'code128', text: chave, scale: 2, height: 12, includetext: false }, (err, png) => {
    if (err) reject(err); else resolve(png);
  });
});

/**
 * Gera o PDF do DANFE a partir dos dados normalizados (ver funções acima).
 * Retorna um Buffer.
 */
const gerarDanfePdf = async (dados) => {
  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const fim = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const autorizada = dados.statusSEFAZ === 'autorizada';

  // Cabeçalho
  doc.rect(30, 30, largura, 70).stroke();
  doc.fontSize(9).font('Helvetica-Bold').text(dados.emitente.nome, 38, 38, { width: largura * 0.55 });
  doc.fontSize(8).font('Helvetica').text(dados.emitente.endereco, 38, 52, { width: largura * 0.55 });
  doc.text(dados.emitente.cidadeUf, 38, 64, { width: largura * 0.55 });
  doc.text(`CNPJ: ${dados.emitente.cnpj}`, 38, 76, { width: largura * 0.55 });

  doc.fontSize(14).font('Helvetica-Bold').text('DANFE', 30 + largura * 0.58, 38, { width: largura * 0.42, align: 'center' });
  doc.fontSize(7).font('Helvetica').text('Documento Auxiliar da Nota Fiscal Eletrônica', 30 + largura * 0.58, 54, { width: largura * 0.42, align: 'center' });
  doc.fontSize(9).font('Helvetica-Bold').text(`Nº ${dados.numero || '—'}   Série ${dados.serie || '—'}`, 30 + largura * 0.58, 68, { width: largura * 0.42, align: 'center' });
  doc.fontSize(7).font('Helvetica').text(`Emissão: ${formatarData(dados.dataEmissao)}`, 30 + largura * 0.58, 82, { width: largura * 0.42, align: 'center' });

  let y = 108;

  // Selo de status — nunca deixa parecer autorizada sem protocolo real
  doc.rect(30, y, largura, 18).fillOpacity(1).fillAndStroke(autorizada ? '#e6f4ea' : '#fdeaea', '#999');
  doc.fillColor(autorizada ? '#1e7e34' : '#b02a2a').fontSize(8).font('Helvetica-Bold').text(
    autorizada
      ? `AUTORIZADA — Protocolo ${dados.protocolo || '—'}`
      : 'SEM VALOR FISCAL — NF-e ainda não autorizada pela SEFAZ (protocolo real de autorização inexistente)',
    38, y + 5, { width: largura - 16 }
  );
  doc.fillColor('black');
  y += 26;

  // Chave de acesso + código de barras
  doc.rect(30, y, largura, 48).stroke();
  try {
    const barras = await gerarCodigoBarras(dados.chaveNFe || '0'.repeat(44));
    doc.image(barras, 38, y + 6, { width: 220, height: 26 });
  } catch (e) {
    doc.fontSize(7).text('(código de barras indisponível)', 38, y + 14);
  }
  doc.fontSize(8).font('Helvetica').text('Chave de acesso', 270, y + 6);
  doc.fontSize(9).font('Helvetica-Bold').text(formatarChave(dados.chaveNFe), 270, y + 18, { width: largura - 250 });
  doc.fontSize(6).font('Helvetica').text('Consulte a autenticidade em www.nfe.fazenda.gov.br', 270, y + 34);
  y += 56;

  // Natureza da operação
  doc.rect(30, y, largura, 20).stroke();
  doc.fontSize(7).text('Natureza da operação', 38, y + 3);
  doc.fontSize(9).font('Helvetica-Bold').text(dados.naturezaOperacao || '—', 38, y + 11);
  y += 28;

  // Destinatário
  doc.rect(30, y, largura, 44).stroke();
  doc.fontSize(7).font('Helvetica').text('Destinatário', 38, y + 4);
  doc.fontSize(9).font('Helvetica-Bold').text(dados.destinatario.nome, 38, y + 14);
  doc.fontSize(8).font('Helvetica').text(`CPF/CNPJ: ${dados.destinatario.cpfCnpj || '—'}`, 38, y + 26);
  doc.text(`${dados.destinatario.endereco || ''}  ${dados.destinatario.cidadeUf || ''}`, 250, y + 26, { width: largura - 220 });
  y += 54;

  // Tabela de itens
  const colunas = [
    { titulo: 'Código', largura: 45 },
    { titulo: 'Descrição', largura: 140 },
    { titulo: 'NCM', largura: 45 },
    { titulo: 'CFOP', largura: 35 },
    { titulo: 'Un.', largura: 30 },
    { titulo: 'Qtd.', largura: 45 },
    { titulo: 'Vl. Unit.', largura: 60 },
    { titulo: 'Vl. ICMS', largura: 55 },
    { titulo: 'Vl. Total', largura: 60 }
  ];

  const desenharCabecalhoTabela = () => {
    doc.rect(30, y, largura, 16).fillAndStroke('#eeeeee', '#999');
    doc.fillColor('black').fontSize(7).font('Helvetica-Bold');
    let x = 30;
    colunas.forEach((col) => {
      doc.text(col.titulo, x + 2, y + 4, { width: col.largura - 4 });
      x += col.largura;
    });
    y += 16;
  };

  desenharCabecalhoTabela();
  doc.font('Helvetica').fontSize(7);

  for (const item of dados.itens) {
    if (y > doc.page.height - 140) {
      doc.addPage();
      y = 30;
      desenharCabecalhoTabela();
      doc.font('Helvetica').fontSize(7);
    }
    const alturaLinha = 14;
    let x = 30;
    const valores = [
      item.codigo, item.descricao, item.ncm, item.cfop, item.unidade,
      item.quantidade.toFixed(2), formatarMoeda(item.valorUnitario), formatarMoeda(item.icmsValor), formatarMoeda(item.valorTotal)
    ];
    valores.forEach((valor, i) => {
      doc.text(String(valor ?? ''), x + 2, y + 3, { width: colunas[i].largura - 4 });
      x += colunas[i].largura;
    });
    doc.moveTo(30, y + alturaLinha).lineTo(30 + largura, y + alturaLinha).strokeColor('#ddd').stroke();
    doc.strokeColor('black');
    y += alturaLinha;
  }

  y += 10;
  if (y > doc.page.height - 80) { doc.addPage(); y = 30; }

  // Totais
  doc.rect(30, y, largura, 30).stroke();
  doc.fontSize(7).font('Helvetica').text('Valor total dos produtos', 38, y + 4);
  doc.fontSize(10).font('Helvetica-Bold').text(formatarMoeda(dados.valorTotalProdutos), 38, y + 14);

  doc.fontSize(7).font('Helvetica').text('Valor total do ICMS', 38 + largura / 3, y + 4);
  doc.fontSize(10).font('Helvetica-Bold').text(formatarMoeda(dados.valorTotalIcms), 38 + largura / 3, y + 14);

  doc.fontSize(7).font('Helvetica').text('Valor total da nota', 38 + (largura / 3) * 2, y + 4);
  doc.fontSize(11).font('Helvetica-Bold').text(formatarMoeda(dados.valorTotalNota), 38 + (largura / 3) * 2, y + 14);

  doc.fontSize(6).font('Helvetica-Oblique').text(
    'DANFE gerado internamente pelo NFe Emitter para conferência — layout simplificado, não segue 100% o Manual de Orientação do Contribuinte.',
    30, doc.page.height - 40, { width: largura, align: 'center' }
  );

  doc.end();
  return fim;
};

module.exports = { montarDadosDeRegistrosLocais, montarDadosDeXml, gerarDanfePdf };
