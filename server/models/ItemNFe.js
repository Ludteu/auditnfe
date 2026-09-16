const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ItemNFe = sequelize.define('ItemNFe', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nfeId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'nfes',
      key: 'id'
    }
  },
  produtoId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'produtos',
      key: 'id'
    }
  },
  codigo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  descricao: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ncm: {
    type: DataTypes.STRING(8),
    allowNull: true
  },
  cfop: {
    type: DataTypes.STRING(4),
    allowNull: false
  },
  unidade: {
    type: DataTypes.STRING(6),
    defaultValue: 'UN'
  },
  quantidade: {
    type: DataTypes.DECIMAL(15, 3),
    allowNull: false
  },
  valorUnitario: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: false
  },
  valorTotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  tabelaIcms: {
    type: DataTypes.STRING(5),
    allowNull: true
  },
  codigoIcms: {
    type: DataTypes.STRING(3),
    allowNull: true
  },
  icmsAliquota: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  icmsValor: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  cstIpi: {
    type: DataTypes.STRING(2),
    allowNull: true
  },
  ipiAliquota: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  ipiValor: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  }
}, {
  tableName: 'itens_nfe',
  timestamps: true,
  indexes: [
    { fields: ['nfeId'] }
  ]
});

module.exports = ItemNFe;
