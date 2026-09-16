const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NFe = sequelize.define('NFe', {
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
  destinatarioId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'destinatarios',
      key: 'id'
    }
  },
  naturezaOperacao: {
    type: DataTypes.STRING,
    allowNull: true
  },
  chaveNFe: {
    type: DataTypes.STRING(44),
    allowNull: false,
    unique: true,
    index: true
  },
  cnpj: {
    type: DataTypes.STRING(14),
    allowNull: false,
    index: true
  },
  numero: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  serie: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  xmlContent: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  xmlAssinado: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  statusSEFAZ: {
    type: DataTypes.ENUM('pendente', 'enviada', 'autorizada', 'rejeitada', 'cancelada'),
    defaultValue: 'pendente'
  },
  protocolo: {
    type: DataTypes.STRING(15),
    allowNull: true
  },
  dataEmissao: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  descricaoRejeicao: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  valor: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  nomeCliente: {
    type: DataTypes.STRING,
    allowNull: true
  },
  cpfCnpjCliente: {
    type: DataTypes.STRING(14),
    allowNull: true
  }
}, {
  tableName: 'nfes',
  timestamps: true,
  indexes: [
    {
      fields: ['chaveNFe', 'cnpj']
    },
    {
      fields: ['cnpj', 'dataEmissao']
    },
    {
      fields: ['statusSEFAZ']
    }
  ]
});

module.exports = NFe;
