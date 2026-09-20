const { Sequelize } = require('sequelize');

// Plataformas de hospedagem (Render, Railway, Heroku) injetam uma única
// DATABASE_URL, diferente do Postgres local que usamos em dev (variáveis
// separadas). As duas formas convivem aqui. `PGSSLMODE=disable` permite
// desligar o SSL quando o banco for outro container na mesma rede interna.
const usarSsl = process.env.DATABASE_URL && process.env.PGSSLMODE !== 'disable';

const opcoesComuns = {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions: usarSsl
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {}
};

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, opcoesComuns)
  : new Sequelize(
      process.env.DB_NAME || 'nfe_emitter',
      process.env.DB_USER || 'postgres',
      process.env.DB_PASSWORD || 'postgres',
      {
        ...opcoesComuns,
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432
      }
    );

sequelize.authenticate().then(() => {
  console.log('✅ Conexão com banco de dados estabelecida');
}).catch(err => {
  console.error('❌ Erro ao conectar com BD:', err);
});

module.exports = sequelize;
