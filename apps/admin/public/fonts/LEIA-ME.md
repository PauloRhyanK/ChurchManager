# Fontes dos slides

Os títulos dos slides usam a **Palast Var** (HVD Fonts, fonte comercial: https://www.hvdfonts.com/fonts/palast-text). Ela **não está no repositório**. Enquanto a igreja não fornecer os arquivos licenciados, os títulos usam a **Playfair Display Italic** (Google Fonts, licença aberta). O texto usa **Poppins** (Google Fonts).

## Ativar a Palast Var

1. Pôr nesta pasta (`apps/admin/public/fonts/`) os arquivos da licença da igreja, com estes nomes:
   - `PalastVar.woff2` — versão romana (variável);
   - `PalastVar-Italic.woff2` — versão itálica (variável). É a que os títulos usam.
2. Definir `VITE_SLIDE_TITLE_FONT=Palast Var` no `.env` da raiz do monorepo (o painel lê as variáveis de lá) e gerar o painel de novo.
   - A prévia passa a desenhar os títulos com os arquivos daqui (`@font-face` em `src/features/sermons/slide-identity.css`).
   - A apresentação exportada (`.pptx`) passa a pedir a fonte "Palast Var". O `.pptx` não leva a fonte embutida: ela precisa estar instalada no computador que abre a apresentação.

Sem a variável, a prévia e o `.pptx` usam a Playfair Display.

## Licença

**Não commitar os arquivos da fonte** sem uma licença que permita distribuí-los junto com o código. O `.gitignore` desta pasta já deixa de fora todo arquivo que não seja este LEIA-ME; na VPS, copie os arquivos direto para a pasta publicada.
