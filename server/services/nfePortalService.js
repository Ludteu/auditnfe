/**
 * Busca os "Informes" (Notas Técnicas, atualizações de tabela, avisos)
 * publicados na página inicial do Portal Nacional da NF-e.
 *
 * Isso é REAL — diferente da tentativa anterior via ferramenta de fetch
 * simples (que caía numa página de erro), aqui o próprio servidor faz a
 * dança de cookie que o portal exige: a primeira requisição recebe um
 * redirect (?AspxAutoDetectCookieSupport=1) e um cookie de sessão
 * (ASP.NET_SessionId); a segunda, reenviando esse cookie, retorna a
 * página de verdade com a lista de informes. `axios` com `withCredentials`
 * mais um cookie jar manual resolve isso em duas requisições.
 *
 * ⚠️ Isto lê a home do portal (HTML), não uma API oficial — se a Receita
 * mudar o HTML/IDs dos elementos, o parser para de encontrar itens (falha
 * visível — retorna lista vazia com aviso —, não dados inventados).
 */

const axios = require('axios');
const cheerio = require('cheerio');

const URL_PORTAL = 'https://www.nfe.fazenda.gov.br/portal/principal.aspx';

const buscarCookieSessao = async () => {
  const primeira = await axios.get(URL_PORTAL, {
    maxRedirects: 0,
    validateStatus: (status) => status === 200 || status === 302
  }).catch((err) => err.response);

  if (!primeira) throw new Error('Portal da NF-e não respondeu');

  const cookiesIniciais = (primeira.headers['set-cookie'] || []).map((c) => c.split(';')[0]);

  if (primeira.status === 302) {
    const location = primeira.headers.location;
    const segunda = await axios.get(new URL(location, URL_PORTAL).toString(), {
      headers: { Cookie: cookiesIniciais.join('; ') }
    });
    const cookiesFinais = (segunda.headers['set-cookie'] || []).map((c) => c.split(';')[0]);
    return { html: segunda.data, cookies: [...cookiesIniciais, ...cookiesFinais].join('; ') };
  }

  return { html: primeira.data, cookies: cookiesIniciais.join('; ') };
};

/**
 * Busca e retorna a lista de informes publicados na home do portal,
 * mais recentes primeiro (é a ordem em que o próprio portal os lista).
 */
const buscarInformes = async () => {
  const { html } = await buscarCookieSessao();
  const $ = cheerio.load(html);

  const informes = [];

  $('a.linkInformes').each((_, el) => {
    const linkTitulo = $(el);
    const linha = linkTitulo.closest('tr');
    const linkData = linha.find('a').first();

    const titulo = linkTitulo.text().trim();
    const dataTexto = linkData.text().trim(); // formato DD/MM/YYYY
    const href = linkTitulo.attr('href') || '';
    const tokenMatch = href.match(/Informe=([^&]+)/);
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;

    if (!titulo || !dataTexto || !token) return;

    const [dia, mes, ano] = dataTexto.split('/');
    const dataIso = ano && mes && dia ? `${ano}-${mes}-${dia}` : null;

    informes.push({
      id: token,
      data: dataIso,
      titulo,
      url: `https://www.nfe.fazenda.gov.br/portal/${href.replace(/&amp;/g, '&')}`
    });
  });

  if (informes.length === 0) {
    throw new Error('Nenhum informe encontrado — o portal pode ter mudado a estrutura da página. Confira manualmente em nfe.fazenda.gov.br.');
  }

  return informes;
};

/**
 * Busca os informes ao vivo no portal e atualiza o cache local
 * (informes_nfe), retornando quais são realmente novos desde a última
 * verificação — é isso que dispara o "avisar quando publicar layout novo".
 */
const verificarEAtualizarCache = async () => {
  const InformeNFe = require('../models/InformeNFe');

  const informesAtuais = await buscarInformes();
  const novos = [];

  for (const informe of informesAtuais) {
    const [, criado] = await InformeNFe.findOrCreate({
      where: { id: informe.id },
      defaults: informe
    });
    if (criado) novos.push(informe);
  }

  return { verificadoEm: new Date(), totalNoPortal: informesAtuais.length, novos };
};

module.exports = { buscarInformes, verificarEAtualizarCache };
