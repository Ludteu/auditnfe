-- Criar extensão UUID se não existir
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR NOT NULL,
  email VARCHAR UNIQUE NOT NULL,
  cnpj VARCHAR(14) UNIQUE NOT NULL,
  senha VARCHAR NOT NULL,
  razaoSocial VARCHAR,
  regimeTributario VARCHAR(20),
  ativo BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para usuários
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_cnpj ON usuarios(cnpj);
CREATE INDEX IF NOT EXISTS idx_usuarios_ativo ON usuarios(ativo);

ALTER TABLE usuarios ADD CONSTRAINT chk_regime_tributario
  CHECK (regimeTributario IS NULL OR regimeTributario IN ('simples_nacional', 'lucro_presumido', 'lucro_real'));

-- Tabela de certificados
CREATE TABLE IF NOT EXISTS certificados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuarioId UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cnpj VARCHAR(14) NOT NULL,
  caminhoArquivo VARCHAR NOT NULL,
  validoAte TIMESTAMP NOT NULL,
  ativo BOOLEAN DEFAULT true,
  descricao VARCHAR,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para certificados
CREATE INDEX IF NOT EXISTS idx_certificados_usuarioId ON certificados(usuarioId);
CREATE INDEX IF NOT EXISTS idx_certificados_cnpj ON certificados(cnpj);
CREATE INDEX IF NOT EXISTS idx_certificados_ativo ON certificados(ativo);
CREATE INDEX IF NOT EXISTS idx_certificados_valido ON certificados(validoAte);

-- Tabela de NF-es
CREATE TABLE IF NOT EXISTS nfes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuarioId UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  chaveNFe VARCHAR(44) UNIQUE NOT NULL,
  cnpj VARCHAR(14) NOT NULL,
  numero INTEGER NOT NULL,
  serie INTEGER DEFAULT 1,
  xmlContent TEXT NOT NULL,
  xmlAssinado TEXT,
  statusSEFAZ VARCHAR(20) DEFAULT 'pendente',
  protocolo VARCHAR(15),
  dataEmissao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  descricaoRejeicao TEXT,
  valor DECIMAL(15, 2),
  nomeCliente VARCHAR,
  cpfCnpjCliente VARCHAR(14),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para NF-es
CREATE INDEX IF NOT EXISTS idx_nfes_chaveNFe ON nfes(chaveNFe);
CREATE INDEX IF NOT EXISTS idx_nfes_usuarioId ON nfes(usuarioId);
CREATE INDEX IF NOT EXISTS idx_nfes_cnpj ON nfes(cnpj);
CREATE INDEX IF NOT EXISTS idx_nfes_status ON nfes(statusSEFAZ);
CREATE INDEX IF NOT EXISTS idx_nfes_data ON nfes(dataEmissao);
CREATE INDEX IF NOT EXISTS idx_nfes_chave_cnpj ON nfes(chaveNFe, cnpj);
CREATE INDEX IF NOT EXISTS idx_nfes_cnpj_data ON nfes(cnpj, dataEmissao);

-- Constraints adicionais
ALTER TABLE nfes ADD CONSTRAINT chk_status_nfe 
  CHECK (statusSEFAZ IN ('pendente', 'enviada', 'autorizada', 'rejeitada', 'cancelada'));

-- Tabela de produtos
CREATE TABLE IF NOT EXISTS produtos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuarioId UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo VARCHAR NOT NULL,
  descricao VARCHAR NOT NULL,
  unidade VARCHAR(6) DEFAULT 'UN',
  finalidade VARCHAR(25) NOT NULL DEFAULT 'revenda',
  quantidade DECIMAL(15, 3) NOT NULL DEFAULT 0,
  estoqueMinimo DECIMAL(15, 3) NOT NULL DEFAULT 0,
  precoCusto DECIMAL(15, 4) DEFAULT 0,
  precoMedioCusto DECIMAL(15, 4) DEFAULT 0,
  precoVenda DECIMAL(15, 4) DEFAULT 0,
  ncm VARCHAR(8),
  cfop VARCHAR(4),
  cstIcms VARCHAR(3),
  icmsAliquota DECIMAL(5, 2) DEFAULT 0,
  cstIpi VARCHAR(2),
  ipiAliquota DECIMAL(5, 2) DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuarioId, codigo)
);

-- Índices para produtos
CREATE INDEX IF NOT EXISTS idx_produtos_usuario_codigo ON produtos(usuarioId, codigo);
CREATE INDEX IF NOT EXISTS idx_produtos_quantidade ON produtos(quantidade);
CREATE INDEX IF NOT EXISTS idx_produtos_ncm ON produtos(ncm);

ALTER TABLE produtos ADD CONSTRAINT chk_finalidade_produto
  CHECK (finalidade IN ('revenda', 'producao_propria', 'materia_prima_insumo', 'uso_consumo', 'ativo_imobilizado'));

-- Tabela de movimentações de estoque
CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuarioId UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  produtoId UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  nfeId UUID REFERENCES nfes(id) ON DELETE SET NULL,
  tipo VARCHAR(10) NOT NULL,
  quantidade DECIMAL(15, 3) NOT NULL,
  precoUnitario DECIMAL(15, 4),
  saldoAnterior DECIMAL(15, 3) NOT NULL,
  saldoPosterior DECIMAL(15, 3) NOT NULL,
  motivo VARCHAR,
  dataMovimentacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para movimentações
CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto ON movimentacoes_estoque(produtoId);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_data ON movimentacoes_estoque(dataMovimentacao);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_usuario_produto ON movimentacoes_estoque(usuarioId, produtoId);

ALTER TABLE movimentacoes_estoque ADD CONSTRAINT chk_tipo_movimentacao
  CHECK (tipo IN ('entrada', 'saida', 'ajuste'));

-- Comentários nas tabelas
COMMENT ON TABLE usuarios IS 'Usuários da plataforma com informações de empresa';
COMMENT ON TABLE certificados IS 'Certificados digitais dos usuários para assinatura';
COMMENT ON TABLE nfes IS 'Notas Fiscais Eletrônicas emitidas';
COMMENT ON TABLE produtos IS 'Produtos cadastrados com dados de estoque e tributação';
COMMENT ON TABLE movimentacoes_estoque IS 'Histórico de entradas, saídas e ajustes de estoque';
