const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Um pedido importado de um marketplace, aguardando (ou já com) emissão
 * de NF-e. `itens` guarda um snapshot do pedido como veio da plataforma
 * (JSON livre) — o de-para pra produtos do catálogo (por SKU) acontece
 * na hora de emitir, não na importação, pra não perder o pedido original
 * se o SKU não bater com nada cadastrado ainda.
 */
const PedidoMarketplace = sequelize.define('PedidoMarketplace', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  usuarioId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'usuarios',
      key: 'id'
    }
  },
  contaMarketplaceId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'contas_marketplace',
      key: 'id'
    }
  },
  plataforma: {
    type: DataTypes.ENUM('mercado_livre', 'shopee', 'magalu', 'tiktok_shop'),
    allowNull: false
  },
  pedidoExternoId: {
    // id do pedido na plataforma de origem
    type: DataTypes.STRING,
    allowNull: false
  },
  dataPedido: {
    type: DataTypes.DATE,
    allowNull: true
  },
  shippingIdExterno: {
    // id do envio na plataforma — necessário para "fechar o ciclo"
    // (informar a nota fiscal de volta pro marketplace)
    type: DataTypes.STRING,
    allowNull: true
  },
  notaInformadaAoMarketplace: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  erroSincronizacaoMarketplace: {
    type: DataTypes.STRING,
    allowNull: true
  },
  comprador: {
    // { nome, cpfCnpj, uf, cidade, ... } — formato varia por plataforma
    type: DataTypes.JSONB,
    allowNull: true
  },
  itens: {
    // [{ skuExterno, descricao, quantidade, valorUnitario }]
    type: DataTypes.JSONB,
    allowNull: false
  },
  valorTotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pendente', 'nfe_emitida', 'ignorado'),
    defaultValue: 'pendente'
  },
  nfeId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'nfes',
      key: 'id'
    }
  }
}, {
  tableName: 'pedidos_marketplace',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['usuarioId', 'plataforma', 'pedidoExternoId'] },
    { fields: ['status'] }
  ]
});

module.exports = PedidoMarketplace;
