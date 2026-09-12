const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MovimentacaoEstoque = sequelize.define('MovimentacaoEstoque', {
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
  produtoId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'produtos',
      key: 'id'
    }
  },
  nfeId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'nfes',
      key: 'id'
    }
  },
  tipo: {
    type: DataTypes.ENUM('entrada', 'saida', 'ajuste'),
    allowNull: false
  },
  quantidade: {
    type: DataTypes.DECIMAL(15, 3),
    allowNull: false
  },
  precoUnitario: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: true
  },
  saldoAnterior: {
    type: DataTypes.DECIMAL(15, 3),
    allowNull: false
  },
  saldoPosterior: {
    type: DataTypes.DECIMAL(15, 3),
    allowNull: false
  },
  motivo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  dataMovimentacao: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'movimentacoes_estoque',
  timestamps: true,
  indexes: [
    {
      fields: ['produtoId']
    },
    {
      fields: ['dataMovimentacao']
    },
    {
      fields: ['usuarioId', 'produtoId']
    }
  ]
});

module.exports = MovimentacaoEstoque;
