# Fontes dos slides

Os títulos dos slides usam a **Palast Var** (HVD Fonts, fonte comercial: https://www.hvdfonts.com/fonts/palast-text). Ela **não está no repositório**. Enquanto a igreja não fornecer os arquivos licenciados, os títulos usam a **Playfair Display Italic** (Google Fonts, licença aberta). O texto usa **Poppins** (Google Fonts).

## Quem abre o .pptx

A apresentação exportada não leva as fontes embutidas. Para abrir com a identidade, o computador precisa ter instaladas:

- [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) (ou a Palast Var, se ela foi ativada como abaixo);
- [Poppins](https://fonts.google.com/specimen/Poppins).

No `.pptx`, subtítulo e versículo aparecem em Poppins Regular (a prévia usa Poppins Medium): o formato só conhece negrito ligado ou desligado.

## Ativar a Palast Var

1. Pôr nesta pasta (`apps/admin/public/fonts/`) os arquivos da licença da igreja, com estes nomes:
   - `PalastVar.woff2` — versão romana (variável);
   - `PalastVar-Italic.woff2` — versão itálica (variável). É a que os títulos usam.
2. Definir `VITE_SLIDE_TITLE_FONT=Palast Var` no ambiente do `vite build`. A variável é lida na hora de gerar o painel, não quando ele roda.
   - Em desenvolvimento ou build fora do Docker: no `.env` da raiz do monorepo (o painel lê as variáveis de lá) e gerar o painel de novo.
   - A prévia passa a desenhar os títulos com os arquivos daqui (`@font-face` em `src/features/sermons/slide-identity.css`).
   - A apresentação exportada passa a pedir a fonte "Palast Var", que precisa estar instalada no computador que a abre.

Sem a variável, a prévia e o `.pptx` usam a Playfair Display.

### No Docker

O build da imagem do painel usa `apps/admin` como contexto e não vê o `.env` da raiz, então a variável precisa entrar como argumento de build. Hoje o `Dockerfile` e os `docker-compose*.yml` **não** a repassam; para ativar, é preciso:

1. Em `apps/admin/Dockerfile`, no estágio `builder`, antes de `RUN npm run build` (junto de `ARG API_URL`):

   ```dockerfile
   ARG VITE_SLIDE_TITLE_FONT
   ENV VITE_SLIDE_TITLE_FONT=${VITE_SLIDE_TITLE_FONT}
   ```

2. No serviço do painel em cada compose que gera a imagem (`docker-compose.dev.yml`: `churchmanager-frontend-admin`; `docker-compose.qa.yml`: `qa-admin`), em `build.args`, junto de `API_URL`:

   ```yaml
   VITE_SLIDE_TITLE_FONT: ${VITE_SLIDE_TITLE_FONT:-}
   ```

   e definir `VITE_SLIDE_TITLE_FONT=Palast Var` no `.env` da raiz usado pelo compose.

3. Os arquivos `.woff2` precisam estar em `apps/admin/public/fonts/` **antes** de gerar a imagem (`COPY . .` os leva para dentro; o Vite os copia para `dist/fonts/`). Copiar depois para o contêiner não basta se a imagem for gerada de novo.

## Licença

**Não commitar os arquivos da fonte** sem uma licença que permita distribuí-los junto com o código. O `.gitignore` desta pasta já deixa de fora todo arquivo que não seja este LEIA-ME; no servidor, ponha os arquivos na pasta antes de gerar a imagem.
