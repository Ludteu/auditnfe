const ContaMarketplace = require('../models/ContaMarketplace');
const PedidoMarketplace = require('../models/PedidoMarketplace');
const Produto = require('../models/Produto');
const mercadoLivreService = require('../services/mercadoLivreService');
const emissaoService = require('../services/emissaoService');

/**
 * GET /api/marketplace/contas
 * Lista as contas de marketplace conectadas (hoje só Mercado Livre).
 */
const listarContas = async (req, res) => {
  try {
    const contas = await ContaMarketplace.findAll({
      where: { usuarioId: req.usuario.id },
      attributes: { exclude: ['accessToken', 'refreshToken'] }
    });
    res.json({ contas, mercadoLivreConfigurado: mercadoLivreService.configurado() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/marketplace/mercado-livre/autorizar
 * Devolve a URL de autorização OAuth2 — a SPA navega pra ela.
 */
const autorizarMercadoLivre = (req, res) => {
  try {
    const url = mercadoLivreService.gerarUrlAutorizacao(req.usuario.id);
    res.json({ url });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * GET /api/marketplace/mercado-livre/callback
 * Rota PÚBLICA (sem Bearer token) — é o Mercado Livre redirecionando o
 * navegador de volta pra cá com ?code=...&state=.... O usuarioId vem do
 * `state` assinado (ver mercadoLivreService.verificarState).
 */
const callbackMercadoLivre = async (req, res) => {
  const { code, state, error: erroOAuth } = req.query;
  const redirecionarComResultado = (ok, mensagem) => {
    const destino = `/emitir.html?marketplace=${ok ? 'conectado' : 'erro'}&msg=${encodeURIComponent(mensagem)}`;
    res.redirect(destino);
  };

  if (erroOAuth) return redirecionarComResultado(false, `Mercado Livre recusou a autorização: ${erroOAuth}`);

  try {
    const usuarioId = mercadoLivreService.verificarState(state);
    const tokenData = await mercadoLivreService.trocarCodigoPorToken(code);
    const vendedor = await mercadoLivreService.buscarDadosVendedor(tokenData.access_token);

    await ContaMarketplace.upsert({
      usuarioId,
      plataforma: 'mercado_livre',
      contaExternaId: String(vendedor.id),
      nomeExibicao: vendedor.nickname,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiraEm: new Date(Date.now() + tokenData.expires_in * 1000),
      ativo: true
    }, { conflictFields: ['usuarioId', 'plataforma'] });

    redirecionarComResultado(true, `Conectado como ${vendedor.nickname}`);
  } catch (error) {
    redirecionarComResultado(false, error.message);
  }
};

const obterContaAtiva = async (usuarioId, plataforma) => {
  const conta = await ContaMarketplace.findOne({ where: { usuarioId, plataforma, ativo: true } });
  if (!conta) throw Object.assign(new Error(`Nenhuma conta de ${plataforma} conectada`), { status: 404 });

  if (conta.tokenExpiraEm && new Date(conta.tokenExpiraEm) < new Date()) {
    const novoToken = await mercadoLivreService.renovarToken(conta.refreshToken);
    conta.accessToken = novoToken.access_token;
    conta.refreshToken = novoToken.refresh_token;
    conta.tokenExpiraEm = new Date(Date.now() + novoToken.expires_in * 1000);
    await conta.save();
  }

  return conta;
};

/**
 * POST /api/marketplace/mercado-livre/sincronizar
 * Busca pedidos novos do vendedor conectado e salva como
 * PedidoMarketplace (pendente), pra depois virar NF-e.
 */
const sincronizarMercadoLivre = async (req, res) => {
  try {
    const conta = await obterContaAtiva(req.usuario.id, 'mercado_livre');
    const pedidosMl = await mercadoLivreService.buscarPedidos(conta.accessToken, conta.contaExternaId, conta.ultimaSincronizacaoEm);

    let novos = 0;
    for (const pedidoMl of pedidosMl) {
      const [, criado] = await PedidoMarketplace.findOrCreate({
        where: { usuarioId: req.usuario.id, plataforma: 'mercado_livre', pedidoExternoId: String(pedidoMl.id) },
        defaults: {
          usuarioId: req.usuario.id,
          contaMarketplaceId: conta.id,
          plataforma: 'mercado_livre',
          pedidoExternoId: String(pedidoMl.id),
          dataPedido: pedidoMl.date_created,
          comprador: mercadoLivreService.mapearComprador(pedidoMl),
          itens: mercadoLivreService.mapearItensPedido(pedidoMl),
          valorTotal: pedidoMl.total_amount,
          status: 'pendente'
        }
      });
      if (criado) novos += 1;
    }

    conta.ultimaSincronizacaoEm = new Date();
    await conta.save();

    res.json({ totalNaPlataforma: pedidosMl.length, novos });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
};

/**
 * GET /api/marketplace/pedidos
 */
const listarPedidos = async (req, res) => {
  try {
    const { status } = req.query;
    const where = { usuarioId: req.usuario.id };
    if (status) where.status = status;

    const pedidos = await PedidoMarketplace.findAll({ where, order: [['dataPedido', 'DESC']], limit: 50 });
    res.json({ pedidos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/marketplace/pedidos/:id/emitir
 * Converte um pedido importado em NF-e de verdade, casando cada item
 * por código (SKU) com o catálogo de produtos. Itens sem produto
 * correspondente bloqueiam a emissão — nada de adivinhar preço/NCM.
 */
const emitirNfeDoPedido = async (req, res) => {
  try {
    const pedido = await PedidoMarketplace.findOne({ where: { id: req.params.id, usuarioId: req.usuario.id } });
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (pedido.status === 'nfe_emitida') return res.status(409).json({ error: 'Esse pedido já tem NF-e emitida' });

    const { destinatario: destinatarioOverride } = req.body;
    if (!destinatarioOverride?.cpfCnpj || !destinatarioOverride?.uf) {
      return res.status(400).json({
        error: 'O marketplace não fornece CPF/CNPJ e UF do comprador — informe destinatario.cpfCnpj e destinatario.uf no corpo da requisição para emitir'
      });
    }

    const itensParaEmitir = [];
    const semCorrespondencia = [];

    for (const item of pedido.itens) {
      const produto = await Produto.findOne({ where: { usuarioId: req.usuario.id, codigo: String(item.skuExterno) } });
      if (!produto) {
        semCorrespondencia.push(item);
        continue;
      }
      itensParaEmitir.push({ produtoId: produto.id, quantidade: item.quantidade, valorUnitario: item.valorUnitario });
    }

    if (semCorrespondencia.length > 0) {
      return res.status(422).json({
        error: 'Alguns itens do pedido não têm produto correspondente no catálogo (por código/SKU) — cadastre-os em Produtos antes de emitir',
        itensSemCorrespondencia: semCorrespondencia
      });
    }

    const resultado = await emissaoService.emitirNFe(req.usuario.id, {
      destinatario: {
        nome: pedido.comprador?.nome || 'Comprador Marketplace',
        cpfCnpj: destinatarioOverride.cpfCnpj,
        uf: destinatarioOverride.uf,
        cidade: destinatarioOverride.cidade
      },
      itens: itensParaEmitir,
      naturezaOperacao: `Venda via ${pedido.plataforma} — pedido ${pedido.pedidoExternoId}`
    });

    pedido.status = 'nfe_emitida';
    pedido.nfeId = resultado.nfe.id;
    await pedido.save();

    res.status(201).json({ mensagem: 'NF-e emitida a partir do pedido', ...resultado });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
};

module.exports = {
  listarContas,
  autorizarMercadoLivre,
  callbackMercadoLivre,
  sincronizarMercadoLivre,
  listarPedidos,
  emitirNfeDoPedido
};
