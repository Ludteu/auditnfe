const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { SEGMENTOS_VALIDOS } = require('../services/reformaTributariaService');

const Produto = sequelize.define('Produto', {
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
  codigo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  descricao: {
    type: DataTypes.STRING,
    allowNull: false
  },
  unidade: {
    type: DataTypes.STRING(6),
    defaultValue: 'UN'
  },
  finalidade: {
    type: DataTypes.ENUM('revenda', 'producao_propria', 'materia_prima_insumo', 'uso_consumo', 'ativo_imobilizado'),
    allowNull: false,
    defaultValue: 'revenda'
  },
  segmentoTributario: {
    // Override por item do segmento da Reforma Tributária (IBS/CBS).
    // null = usa o segmento padrão cadastrado na empresa.
    type: DataTypes.ENUM(...SEGMENTOS_VALIDOS),
    allowNull: true
  },
  quantidade: {
    type: DataTypes.DECIMAL(15, 3),
    allowNull: false,
    defaultValue: 0
  },
  estoqueMinimo: {
    type: DataTypes.DECIMAL(15, 3),
    allowNull: false,
    defaultValue: 0
  },
  precoCusto: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: true,
    defaultValue: 0
  },
  precoMedioCusto: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: true,
    defaultValue: 0
  },
  precoVenda: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: true,
    defaultValue: 0
  },
  ncm: {
    type: DataTypes.STRING(8),
    allowNull: true
  },
  cfop: {
    type: DataTypes.STRING(4),
    allowNull: true
  },
  cstIcms: {
    type: DataTypes.STRING(3),
    allowNull: true
  },
  icmsAliquota: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: 0
  },
  cstIpi: {
    type: DataTypes.STRING(2),
    allowNull: true
  },
  ipiAliquota: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: 0
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'produtos',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['usuarioId', 'codigo']
    },
    {
      fields: ['quantidade']
    },
    {
      fields: ['ncm']
    }
  ]
});

module.exports = Produto;
