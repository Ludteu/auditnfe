# Deploy — Render (recomendado para o MVP)

Este guia sobe o sistema pro ar usando o **Render** (tem plano gratuito, não pede
cartão pro free tier de web service, e você recebe um subdomínio grátis tipo
`nfe-emitter.onrender.com` — não precisa comprar domínio pra rodar o MVP).

Já deixei tudo pronto no código: `Dockerfile`, `.dockerignore` e `render.yaml`
(um "Blueprint" que cria o web service + banco Postgres de uma vez só). O que
falta são duas contas que só você pode criar (GitHub e Render) — eu não posso
criar contas em serviços terceiros por você.

## O que eu já preparei

- `server/config/database.js` agora aceita tanto as variáveis separadas (uso
  local) quanto uma `DATABASE_URL` única (formato que Render/Railway/Heroku
  usam), com SSL automático quando necessário.
- `render.yaml` — Blueprint que cria o web service (free) e um Postgres (free)
  já conectados via `DATABASE_URL`, e gera um `JWT_SECRET` aleatório sozinho.
- `.dockerignore` — evita subir `node_modules`, `.env`, certificados e uploads
  locais pra imagem Docker.

## Limitação importante que preciso te avisar (não escondi/contornei)

**Upload de certificado digital (`uploads/certificados/`) e o Postgres free do
Render não são permanentes:**

- O plano **free** do Render **não tem disco persistente** — qualquer arquivo
  salvo em disco (o certificado .pfx que o cliente sobe) **some a cada deploy
  ou reinício** do serviço. Pra esse MVP isso é aceitável (permite testar o
  fluxo), mas antes de usar com certificado real de produção, o certo é: (a)
  trocar pra plano pago do Render com disco persistente, ou (b) guardar o
  certificado em storage externo (S3, Cloudflare R2 etc. — não implementei
  porque exigiria credenciais de um provedor de nuvem que você ainda não tem).
- O **Postgres free do Render expira em 90 dias** (política deles) — passado
  esse prazo, os dados somem se você não fizer upgrade ou backup antes. De novo,
  ok pra validar o MVP, não pra produção real.

Não contornei isso fabricando uma solução falsa — prefiro que você saiba disso
antes de colocar dados reais de clientes lá.

## Passo a passo

### 1. Criar o repositório no GitHub (você precisa fazer — é sua conta)

Não achei o `gh` (GitHub CLI) instalado nesta máquina, então o caminho mais
simples é pelo site:

1. Acesse [github.com/new](https://github.com/new), logado na sua conta.
2. Nome sugerido: `auditnfe` (ou o que preferir). Pode deixar **privado**.
3. **Não** marque "Add a README" (o projeto já tem arquivos).
4. Clique em "Create repository" e copie a URL que aparece (formato
   `https://github.com/SEU_USUARIO/auditnfe.git`).

Me manda essa URL que eu configuro o remote e faço o push pra você
(`git remote add origin <url>` + `git push -u origin master`) — só vou
precisar que você já esteja autenticado no `git` desta máquina pro GitHub
(via Git Credential Manager, que geralmente abre uma janela de login do
navegador na hora do primeiro `push`).

### 2. Criar conta no Render (você precisa fazer)

1. Acesse [render.com](https://render.com) e crie uma conta (pode ser com login
   do GitHub, o que já facilita o passo seguinte).
2. No dashboard, clique em **New > Blueprint**.
3. Selecione o repositório `auditnfe` que você acabou de criar.
4. O Render vai ler o `render.yaml` sozinho e mostrar o que vai criar: 1 web
   service + 1 banco Postgres, ambos free. Clique em **Apply**.
5. Aguarde o build (uns 3-5 min na primeira vez). Quando terminar, o Render
   mostra a URL pública (algo como `https://nfe-emitter.onrender.com`).

### 3. Variáveis de ambiente do Mercado Livre (opcional, se for usar a integração)

O `render.yaml` já deixou 3 variáveis marcadas como "defina manualmente"
(`sync: false`): `MERCADOLIVRE_CLIENT_ID`, `MERCADOLIVRE_CLIENT_SECRET`,
`MERCADOLIVRE_REDIRECT_URI`. Se você já tiver um app criado em
[developers.mercadolivre.com.br](https://developers.mercadolivre.com.br):

1. No painel do Render, abra o serviço `nfe-emitter` > **Environment**.
2. Preencha as 3 variáveis. O `MERCADOLIVRE_REDIRECT_URI` precisa ser
   `https://SEU-SUBDOMINIO.onrender.com/api/marketplace/mercado-livre/callback`.
3. **No painel do Mercado Livre**, atualize a "Redirect URI" do seu app pra
   essa mesma URL (eles exigem que bata exatamente).

Se ainda não tiver credenciais do ML, pode pular — o sistema mostra
"integração não configurada" normalmente, sem quebrar nada.

### 4. Primeiro acesso

Depois do deploy, acesse a URL pública e crie o primeiro usuário normalmente
pela tela de cadastro — o banco sobe vazio (schema criado automaticamente pelo
Sequelize no primeiro start, sem dados de teste).

## O que eu não posso fazer por você

- Criar a conta no GitHub ou no Render (autenticação é sua).
- Registrar/comprar um domínio próprio (opcional — o subdomínio `.onrender.com`
  já funciona pro MVP; se quiser um domínio próprio depois, me avisa e eu
  configuro o DNS/CNAME, mas a compra do domínio em si é sua).
- Preencher senha/cartão em qualquer um desses sites — isso é sempre manual,
  por segurança.

Qualquer coisa que eu **possa** automatizar depois que você me passar a URL
do repositório (o push, por exemplo), eu faço.
