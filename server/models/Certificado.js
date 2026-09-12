const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Certificado = sequelize.define('Certificado', {
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
  cnpj: {
    type: DataTypes.STRING(14),
    allowNull: false
  },
  caminhoArquivo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  validoAte: {
    type: DataTypes.DATE,
    allowNull: false
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  descricao: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'certificados',
  timestamps: true
});

module.exports = Certificado;
