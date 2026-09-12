require('dotenv').config();
const { sequelize } = require('../server/models');

sequelize.sync({ force: true })
  .then(() => {
    console.log('✅ Banco de dados resetado e sincronizado');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erro ao resetar banco de dados:', err);
    process.exit(1);
  });
