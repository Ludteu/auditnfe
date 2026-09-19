const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');
const { SEGMENTOS_VALIDOS, ALIQUOTA_IBS_TESTE_2026, ALIQUOTA_CBS_TESTE_2026 } = require('../services/reformaTributariaService');

const Usuario = sequelize.define('Usuario', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nome: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  cnpj: {
    type: DataTypes.STRING(14),
    allowNull: false,
    unique: true
  },
  senha: {
    type: DataTypes.STRING,
    allowNull: false
  },
  razaoSocial: {
    type: DataTypes.STRING,
    allowNull: true
  },
  regimeTributario: {
    type: DataTypes.ENUM('simples_nacional', 'lucro_presumido', 'lucro_real'),
    allowNull: true
  },
  uf: {
    type: DataTypes.STRING(2),
    allowNull: true
  },
  nomeFantasia: {
    type: DataTypes.STRING,
    allowNull: true
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
  telefone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  segmentoTributario: {
    // Segmento padrão da empresa para a Reforma Tributária (IBS/CBS) —
    // ver reformaTributariaService.js. Serve de default para produtos novos.
    type: DataTypes.ENUM(...SEGMENTOS_VALIDOS),
    allowNull: false,
    defaultValue: 'padrao'
  },
  aliquotaIbsTeste: {
    type: DataTypes.DECIMAL(5, 3),
    allowNull: false,
    defaultValue: ALIQUOTA_IBS_TESTE_2026
  },
  aliquotaCbsTeste: {
    type: DataTypes.DECIMAL(5, 3),
    allowNull: false,
    defaultValue: ALIQUOTA_CBS_TESTE_2026
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'usuarios',
  timestamps: true
});

// Hook para criptografar senha antes de salvar
Usuario.beforeCreate(async (usuario) => {
  usuario.senha = await bcrypt.hash(usuario.senha, 10);
});

Usuario.prototype.verificarSenha = async function(senhaFornecida) {
  return await bcrypt.compare(senhaFornecida, this.senha);
};

module.exports = Usuario;
