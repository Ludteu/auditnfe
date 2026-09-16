const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

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
