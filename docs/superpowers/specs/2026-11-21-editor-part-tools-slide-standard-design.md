# Editor de músicas: partes e padrão de slides

Data: 21/11/2026 · Estado: aguardando aprovação do design.

## Intenção

Facilitar a organização manual de letras no passo Letra e manter apresentações de músicas consistentes entre as pessoas da mesma igreja. Hoje a tela mostra partes coloridas e números de slide; anotações podem ser arrastadas entre linhas, mas a posição de soltura é ambígua perto do fim de um grupo. A organização automática usa 28 caracteres por linha e até 3 linhas por slide, sem configuração por igreja. A edição manual pode ultrapassar esses limites sem aviso.

## Objetivos

- Dar controles visíveis para ações sobre uma parte inteira e tornar a divisão, união e reordenação previsíveis.
- Permitir mover anotações com alvos de inserção explícitos, sem alterar partes ou slides acidentalmente.
- Configurar por igreja o máximo de caracteres por linha e linhas por slide, compartilhado entre todos os editores.
- Usar esses limites na organização automática, avisar quando uma edição manual os exceder e oferecer ajuste da quebra sem reescrever a letra.
- Ao mover uma parte, manter com ela suas linhas, anotações, tempos e clima.

## Fora do escopo

- Slides de sermão, estilos visuais de projeção e conteúdo da Ponte do Culto.
- Reorganizar automaticamente a letra durante a digitação ou bloquear uma edição manual fora do limite.
- Alterar o texto da música ao ajustar quebras de slide.

## Abordagens consideradas

1. **Aprimorar só a organização inicial:** parametrizar o organizador e conservar a edição manual atual. Menor mudança, mas não evita inconsistências entre editores.
2. **Configuração compartilhada e ferramentas no editor (escolhida):** salvar os limites por igreja, aplicá-los ao organizar, mostrar excedentes no editor e oferecer correção estrutural explícita. Acrescentar ações nos blocos de parte e alvos de inserção visíveis para anotações. Dá consistência sem impedir exceções manuais deliberadas.
3. **Aplicar os limites estritamente ao salvar:** toda letra fora do limite seria rejeitada ou reescrita. Garante uniformidade, mas interrompe o trabalho e pode alterar quebras escolhidas pela equipe.

## Comportamento proposto

### Partes e anotações

- Cada bloco colorido de parte ganha um menu de ações identificável, inclusive por teclado: renomear/classificar, mover a parte para cima ou para baixo, dividir a partir do trecho/linha selecionado e unir à parte anterior ou seguinte.
- Dividir cria uma parte nova no ponto escolhido e pede o tipo/nome, com sugestão baseada no tipo atual. Unir conserva todas as linhas e anotações; o bloco de destino mantém seu tipo e nome.
- Ao dividir, a nova parte herda o clima da parte original. Ao unir, prevalece o clima da parte de destino (a que recebe o outro bloco).
- Mover bloco reordena suas linhas integralmente e preserva tempos, clima, notas e ordem interna.
- Arrastar uma anotação mostra alvos antes, entre e depois dos slides/linhas. O alvo selecionado fica destacado antes de soltar; no fim de uma parte há um alvo dentro da parte e outro fora dela, claramente separados.
- O menu da parte também oferece inserir anotação no começo/fim do bloco. Alt+setas continua disponível como alternativa de teclado.
- Dividir ou unir partes não divide automaticamente slides; o padrão de limites de slide é uma regra separada.

### Padrão dos slides

- Usar a configuração da igreja, com valores padrão compatíveis com o organizador atual: 28 caracteres por linha e 3 linhas por slide.
- Guardar os dois valores em `WorshipSettings`, existente e isolado por `tenantId`. Atualizar a leitura/escrita de configurações e passar os valores para `formatLyrics` no organizador.
- Disponibilizar a configuração em Cultos, com leitura para quem pode ver Cultos e edição para quem tem `SETTINGS:EDIT`. Validar limites razoáveis no DTO no servidor; o painel explica que a regra vale para todas as pessoas da igreja.
- No editor, indicar no slide a contagem de linhas/caracteres e destacar excedentes sem bloquear a edição. Uma ação “Ajustar quebra do slide” divide o conteúdo em slides que respeitam os limites, preservando palavras e ordem; não muda tipo/nome da parte, anotações ou texto. Se uma única linha exceder o limite, oferecer quebra em palavras.
- Salvar continua campo a campo conforme o contrato existente; limites não entram no corpo de gravação da música, pois vêm do tenant autenticado.

## Restrições e decisões para implementação

- O tenant é sempre derivado do JWT; nunca do corpo ou URL.
- DTOs mantêm `whitelist` e `forbidNonWhitelisted`; valores de configuração precisam de validação explícita.
- Textos de interface em pt-BR. Reutilizar `WorshipSettings`, operações puras de `row-ops.ts`, temas de parte e o padrão de consulta/mutação de configurações de Cultos.
- A divisão/união/reordenação deve preservar IDs quando a linha continua existindo e manter dados anexados às linhas corretas. Confirmar as invariantes e testes existentes antes da implementação.
- Se o valor atual do formatador for 28/3, persistir valores novos não deve alterar igrejas existentes. Migração adiciona defaults sem exigir revisão manual.
- Autorização de escrita da configuração: `SETTINGS:EDIT`; edição de letra: `WORSHIP:EDIT`.

## Critérios de aceite

- Uma igreja pode definir e consultar seus limites; outra igreja não recebe nem altera esses valores.
- Uma nova organização aplica os limites configurados pela igreja; configuração ausente usa 28/3.
- Uma letra editada manualmente acima do limite recebe indicação localizada e pode ser readequada sem perder texto, anotações, tempo ou clima.
- Ações de dividir, unir e mover blocos são visíveis, funcionam no teclado e preservam os dados relacionados à parte conforme as regras de clima acima. Tempos e anotações ficam ligados às linhas onde foram definidos.
- Soltar anotação no fim de um bloco permite escolher explicitamente entre permanecer no bloco ou ir para o próximo, sem criar divisão acidental.

## Ainda a cargo da implementação

Definir faixas mínimas/máximas concretas dos limites com base nos limites de linha atuais e escolher o ponto de navegação mais coerente para a tela de configuração. Usar testes focados da API e do painel e inspecionar o comportamento visual do editor.
