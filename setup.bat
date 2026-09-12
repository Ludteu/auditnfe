@echo off
echo Configurando NFe Emitter...

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js nao encontrado. Instale Node.js 18+ antes de continuar.
  exit /b 1
)

echo Instalando dependencias...
call npm install

if not exist ".env" (
  echo Criando .env a partir de .env.example...
  copy .env.example .env >nul
  echo Edite o arquivo .env com suas configuracoes antes de iniciar.
)

echo.
echo Setup concluido.
echo Crie o banco 'nfe_emitter' no PostgreSQL se ainda nao existir.
echo Depois rode: npm run dev
