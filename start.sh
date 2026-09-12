#!/usr/bin/env bash
set -e

echo "🚀 Iniciando NFe Emitter..."

if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado. Instale Node.js 18+ antes de continuar."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "📦 Instalando dependências..."
  npm install
fi

if [ ! -f ".env" ]; then
  echo "⚙️  Criando .env a partir de .env.example..."
  cp .env.example .env
fi

if command -v createdb &> /dev/null; then
  createdb nfe_emitter 2>/dev/null || echo "ℹ️  Banco nfe_emitter já existe ou createdb indisponível (ok se estiver usando Docker)."
fi

echo "▶️  Iniciando servidor (npm run dev)..."
npm run dev
