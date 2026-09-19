const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Cache dos informes (Notas Técnicas, atualizações de tabela, avisos)
 * já vistos na home do Portal Nacional da NF-e — ver nfePortalService.js.
 * Não é por usuário: é o mesmo feed pra todo mundo que usa o sistema.
 */
const InformeNFe = sequelize.define('InformeNFe', {
  id: {
    // O token opaco que o próprio portal usa (parâmetro ?Informe=...)
    type: DataTypes.STRING,
    primaryKey: true
  },
  data: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  titulo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  primeiraVezVistoEm: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'informes_nfe',
  timestamps: false
});

module.exports = InformeNFe;
