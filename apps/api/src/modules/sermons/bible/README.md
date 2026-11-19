# Bíblia (texto para busca e leitura)

As tabelas `bible_translations` e `bible_verses` são globais (sem tenant) e vêm vazias: o texto é carregado por script, uma vez por ambiente (local, QA e produção).

## Tradução disponível

`BLIVRE`: Bíblia Livre (eBible.org, `porbr2018`, fevereiro de 2018), licença Creative Commons Atribuição 4.0 Brasil.

## Como importar

1. Baixe `https://ebible.org/Scriptures/porbr2018_vpl.zip` e extraia `porbr2018_vpl.txt`. Confira os SHA-256, verificados em 19/11/2026:
   - `porbr2018_vpl.zip`: `3d9c4c8a36d33e16f92258f86ca3eef8c4df230055ec8fb9268594f9100fcda0`
   - `porbr2018_vpl.txt`: `20f7cccf95e99d0b07d3a483aeebe9a0dcad0c8b52cb169cf917c9e684a4d858`
2. Em `apps/api`, com `DATABASE_URL` do ambiente no `.env`:

   ```
   npm run script:import-bible -- --file <caminho do porbr2018_vpl.txt> --code BLIVRE
   ```

   Saída esperada: `BLIVRE: 31102 versículos importados.`

Rodar de novo substitui os versículos da tradução, sem duplicar. A importação confere os 66 livros e os capítulos de cada um antes de gravar; se algo não bater, nada é escrito.

## Observações

- O arquivo de texto **não vai para o Git**.
- A licença exige o crédito: `Bíblia Livre (BLIVRE), Copyright © Diego Santos, Mario Sérgio, e Marco Teles, http://sites.google.com/site/biblialivre/ - fevereiro de 2018. Licença Creative Commons Atribuição 4.0 Brasil (http://creativecommons.org/licenses/by/4.0/br/).` O texto fica em `bible_translations.attribution` e deve aparecer onde a Bíblia for exibida.
- O arquivo de origem marca as letras do acróstico do Salmo 119 no começo do versículo (`[Nun] :`); esses marcadores são removidos na importação. Outros colchetes (`[Ela] :`, `[Dizendo] :`) fazem parte do texto e ficam.
