const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Destinatario = sequelize.define('Destinatario', {
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
  nome: {
    type: DataTypes.STRING,
    allowNull: false
  },
  cpfCnpj: {
    type: DataTypes.STRING(14),
    allowNull: false
  },
  contribuinteIcms: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  inscricaoEstadual: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  telefone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  uf: {
    type: DataTypes.STRING(2),
    allowNull: false
  },
  cidade: {
    type: DataTypes.STRING,
    allowNull: true
  },
  cep: {
    type: DataTypes.STRING(8),
    allowNull: true
  },
  logradouro: {
    type: DataTypes.STRING,
    allowNull: true
  },
  numero: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bairro: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'destinatarios',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['usuarioId', 'cpfCnpj']
    }
  ]
});

module.exports = Destinatario;
