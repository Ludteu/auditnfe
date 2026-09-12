#!/usr/bin/env bash
set -e

echo "🔧 Configurando NFe Emitter..."

if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado. Instale Node.js 18+ antes de continuar."
  exit 1
fi

echo "📦 Instalando dependências..."
npm install

if [ ! -f ".env" ]; then
  echo "⚙️  Criando .env a partir de .env.example..."
  cp .env.example .env
  echo "   Edite o arquivo .env com suas configurações antes de iniciar."
fi

if command -v createdb &> /dev/null; then
  createdb nfe_emitter 2>/dev/null || echo "ℹ️  Banco nfe_emitter já existe."
fi

echo "✅ Setup concluído. Rode 'npm run dev' para iniciar o servidor."
