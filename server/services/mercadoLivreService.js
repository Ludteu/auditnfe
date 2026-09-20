/**
 * Integração com o Mercado Livre (OAuth2 + API de pedidos).
 *
 * ⚠️ IMPORTANTE: isto está implementado seguindo a documentação pública
 * do Mercado Livre Devs, mas — ao contrário do resto do projeto — não
 * pôde ser testado contra a API de verdade nesta sessão, porque exige
 * um app registrado no Devcenter do Mercado Livre (Client ID/Secret
 * próprios do usuário, não algo que se possa simular). O que É garantido:
 * a montagem da URL de autorização e a assinatura/verificação do `state`
 * (JWT, evita CSRF) foram testadas isoladamente. O que precisa de
 * confirmação assim que houver credenciais reais: o nome exato do campo
 * de SKU em order_items (a API já teve `seller_sku` e `seller_custom_field`
 * em versões diferentes — o código tenta os dois, mas isso deve ser
 * validado contra um pedido real antes de confiar no de-para automático).
 *
 * Como conseguir credenciais: https://developers.mercadolivre.com.br/
 * → criar aplicação → anotar Client ID/Secret → configurar Redirect URI
 * igual ao MERCADOLIVRE_REDIRECT_URI do .env.
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');

const AUTH_URL = 'https://auth.mercadolivre.com.br/authorization';
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const API_BASE = 'https://api.mercadolibre.com';

const configurado = () => Boolean(process.env.MERCADOLIVRE_CLIENT_ID && process.env.MERCADOLIVRE_CLIENT_SECRET && process.env.MERCADOLIVRE_REDIRECT_URI);

/**
 * Gera a URL de autorização OAuth2. `state` carrega o usuarioId assinado
 * (JWT curto) para o callback saber a qual conta vincular o retorno —
 * o callback é um GET direto do Mercado Livre, sem o Bearer token da SPA.
 */
const gerarUrlAutorizacao = (usuarioId) => {
  if (!configurado()) {
    throw new Error('Integração com Mercado Livre não configurada — defina MERCADOLIVRE_CLIENT_ID, MERCADOLIVRE_CLIENT_SECRET e MERCADOLIVRE_REDIRECT_URI no .env (ver instruções em mercadoLivreService.js)');
  }

  const state = jwt.sign({ usuarioId }, process.env.JWT_SECRET, { expiresIn: '15m' });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.MERCADOLIVRE_CLIENT_ID,
    redirect_uri: process.env.MERCADOLIVRE_REDIRECT_URI,
    state
  });

  return `${AUTH_URL}?${params.toString()}`;
};

const verificarState = (state) => {
  try {
    const { usuarioId } = jwt.verify(state, process.env.JWT_SECRET);
    return usuarioId;
  } catch (error) {
    throw new Error('State inválido ou expirado — inicie a conexão novamente');
  }
};

/**
 * Troca o `code` do callback OAuth por access_token/refresh_token.
 */
const trocarCodigoPorToken = async (code) => {
  const { data } = await axios.post(TOKEN_URL, new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.MERCADOLIVRE_CLIENT_ID,
    client_secret: process.env.MERCADOLIVRE_CLIENT_SECRET,
    code,
    redirect_uri: process.env.MERCADOLIVRE_REDIRECT_URI
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  return data; // { access_token, refresh_token, expires_in, user_id, ... }
};

const renovarToken = async (refreshToken) => {
  const { data } = await axios.post(TOKEN_URL, new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.MERCADOLIVRE_CLIENT_ID,
    client_secret: process.env.MERCADOLIVRE_CLIENT_SECRET,
    refresh_token: refreshToken
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  return data;
};

const buscarDadosVendedor = async (accessToken) => {
  const { data } = await axios.get(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return data; // { id, nickname, ... }
};

/**
 * Busca pedidos pagos/recentes do vendedor. `desde` (ISO date) filtra
 * pedidos criados a partir dessa data, se informado.
 */
const buscarPedidos = async (accessToken, sellerId, desde) => {
  const params = { seller: sellerId, sort: 'date_desc' };
  if (desde) params['order.date_created.from'] = desde;

  const { data } = await axios.get(`${API_BASE}/orders/search`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params
  });

  return data.results || [];
};

/**
 * ⚠️ MAIOR INCERTEZA DESTA INTEGRAÇÃO: fecha o ciclo avisando o Mercado
 * Livre qual nota fiscal corresponde ao pedido, para o comprador conseguir
 * ver/baixar a NF-e pela própria área de compras dele. Diferente do OAuth
 * e da busca de pedidos (endpoints centrais, bem documentados e estáveis),
 * o endpoint exato de anexar nota fiscal ao envio é uma parte do catálogo
 * de APIs do ML que muda mais e tem menos documentação pública — o
 * caminho abaixo (anexar à Shipment) é o mais plausível pela documentação
 * disponível, mas PRECISA ser confirmado contra um pedido real assim que
 * houver credenciais, antes de confiar nisso silenciosamente. Por isso o
 * chamador (marketplaceController) trata isso como best-effort: se falhar,
 * a NF-e já emitida continua válida, só fica marcada como "não informada
 * ao Mercado Livre" para nova tentativa manual.
 */
const informarNotaFiscal = async (accessToken, { shippingId, chaveNFe, numero, serie, dataEmissao }) => {
  if (!shippingId) {
    throw new Error('Pedido sem shipping_id — o Mercado Livre não fornece um envio para anexar a nota fiscal (ex: retirada em loja ou combinado fora da plataforma)');
  }

  await axios.post(`${API_BASE}/shipments/${shippingId}/invoices`, {
    invoice_number: numero,
    invoice_series: serie,
    invoice_key: chaveNFe,
    invoice_date: dataEmissao
  }, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  return true;
};

/**
 * Converte um pedido do Mercado Livre para o formato interno usado por
 * PedidoMarketplace.itens. O nome do campo de SKU varia entre integrações
 * ML — tenta as duas formas conhecidas antes de cair no id do anúncio.
 */
const mapearItensPedido = (pedidoMl) => {
  return (pedidoMl.order_items || []).map((oi) => ({
    skuExterno: oi.item?.seller_sku || oi.item?.seller_custom_field || oi.item?.id,
    descricao: oi.item?.title || 'Item sem descrição',
    quantidade: oi.quantity,
    valorUnitario: oi.unit_price
  }));
};

const mapearComprador = (pedidoMl) => ({
  nome: pedidoMl.buyer?.nickname || pedidoMl.buyer?.first_name || 'Comprador Mercado Livre',
  // ML normalmente não expõe CPF/CNPJ do comprador via API pública —
  // precisa ser completado manualmente antes de emitir, ver aviso na UI.
  cpfCnpj: null,
  uf: null
});

module.exports = {
  configurado,
  gerarUrlAutorizacao,
  verificarState,
  trocarCodigoPorToken,
  renovarToken,
  buscarDadosVendedor,
  buscarPedidos,
  mapearItensPedido,
  mapearComprador,
  informarNotaFiscal
};
