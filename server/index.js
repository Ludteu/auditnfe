require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./config/database');

// Importar rotas
const nfeRoutes = require('./routes/nfe');
const authRoutes = require('./routes/auth');
const usuarioRoutes = require('./routes/usuario');
const estoqueRoutes = require('./routes/estoque');
const fiscalRoutes = require('./routes/fiscal');
const destinatarioRoutes = require('./routes/destinatario');
const atualizacoesRoutes = require('./routes/atualizacoes');
const nfePortalService = require('./services/nfePortalService');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Pasta de uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Console de testes (interface HTML simples que consome a API)
app.use(express.static(path.join(__dirname, 'public')));

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/nfe', nfeRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/fiscal', fiscalRoutes);
app.use('/api/destinatarios', destinatarioRoutes);
app.use('/api/atualizacoes', atualizacoesRoutes);

// Rota de health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno do servidor',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Sincronizar BD e iniciar servidor
const PORT = process.env.PORT || 5000;

sequelize.sync({ alter: false }).then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📊 Ambiente: ${process.env.NODE_ENV}`);
  });

  // Verifica novos informes do Portal da NF-e (Notas Técnicas, tabelas
  // atualizadas etc.) ao iniciar e depois periodicamente — é isso que
  // mantém a aba "Atualizações" avisando sem precisar de ação manual.
  const INTERVALO_VERIFICACAO_MS = 12 * 60 * 60 * 1000; // 12h

  const verificarInformesPortal = () => {
    nfePortalService.verificarEAtualizarCache()
      .then(({ novos, totalNoPortal }) => {
        if (novos.length > 0) {
          console.log(`📰 ${novos.length} novo(s) informe(s) do Portal da NF-e: ${novos.map(n => n.titulo).join(' | ')}`);
        } else {
          console.log(`📰 Portal da NF-e verificado (${totalNoPortal} informes, nenhum novo)`);
        }
      })
      .catch((err) => console.warn('⚠️ Não foi possível verificar o Portal da NF-e agora:', err.message));
  };

  verificarInformesPortal();
  setInterval(verificarInformesPortal, INTERVALO_VERIFICACAO_MS);
}).catch(err => {
  console.error('❌ Erro ao conectar BD:', err);
  process.exit(1);
});

module.exports = app;
