const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Uma conta conectada num marketplace (hoje só Mercado Livre — ver
 * mercadoLivreService.js). Guarda os tokens OAuth2 pra buscar pedidos.
 */
const ContaMarketplace = sequelize.define('ContaMarketplace', {
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
  plataforma: {
    type: DataTypes.ENUM('mercado_livre', 'shopee', 'magalu', 'tiktok_shop'),
    allowNull: false
  },
  contaExternaId: {
    // id do vendedor na plataforma (ex: user_id do Mercado Livre)
    type: DataTypes.STRING,
    allowNull: true
  },
  nomeExibicao: {
    type: DataTypes.STRING,
    allowNull: true
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tokenExpiraEm: {
    type: DataTypes.DATE,
    allowNull: true
  },
  ultimaSincronizacaoEm: {
    type: DataTypes.DATE,
    allowNull: true
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'contas_marketplace',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['usuarioId', 'plataforma'] }
  ]
});

module.exports = ContaMarketplace;
