# Identidade visual e padronização de slides — Igreja Paraíso

Resumo do "Manual de identidade visual e padronização de slides" da Igreja Paraíso. É a referência do gerador de slides da Palavra (`apps/api/src/modules/sermons` e `apps/admin/src/features/sermons`): a IA, a prévia e a exportação seguem o que está aqui. A seção final diz como o sistema aplica cada regra.

## Formato e margens

- 16:9, 1920×1080.
- Área de segurança para texto essencial: 240 px nas laterais e 190 px em cima e embaixo. O manual também cita 120/90 px como margem geral.

## Paleta

| Cor | Hex | Uso |
|---|---|---|
| Verde oliva | `#708836` | apoio e destaque |
| Azul institucional | `#334C71` | fundo principal |
| Azul profundo | `#182F5D` | impacto |
| Verde profundo | `#092A1E` | fundos elegantes |
| Azul-claro | `#A1C0DA` | apoio, composições suaves |
| Off-white | `#F1EBE2` | texto |

Combinações de fundo e texto:

| Fundo | Texto | Para |
|---|---|---|
| `#334C71` | `#F1EBE2` | títulos e versículos |
| `#182F5D` | `#F1EBE2` | títulos de impacto |
| `#092A1E` | `#FFFFFF` | mensagens e ministrações |
| `#708836` | `#FFFFFF` | destaques |
| `#A1C0DA` | `#182F5D` | slides claros |

Fundo sólido, uma cor de fundo e uma de texto por slide; não usar todas as cores num slide. Gradiente só pontual. Não pôr azul-claro sobre os verdes.

## Tipografia

- **Palast Var** (de preferência Italic, Medium ou Bold): títulos e frases de impacto.
- **Poppins** (Medium, SemiBold, Bold): subtítulo, versículo e texto.
- Só essas duas fontes, e no máximo três pesos.
- Tracking: títulos de -60 a -80; títulos menores e subtítulos de -40 a -60; versículos de -20 a -40.

## Zonas e alinhamento

- Zona superior: título e chamada. Central: subtítulo e versículo. Inferior: referência e informação complementar.
- Centralizar frases curtas, títulos de impacto e versículos curtos.
- Alinhar à esquerda títulos longos, textos bíblicos maiores, listas e conteúdo denso, mantendo um eixo esquerdo único.

## Os quatro modelos

| Modelo | Conteúdo | Medidas |
|---|---|---|
| **01** | Só título (impacto) | Palast Var Italic de 100 a 150 px, tracking de -60 a -80, de 1 a 3 linhas, no centro óptico, sem mais nada |
| **02** | Título e subtítulo | título Palast Var de 95 a 135 px; subtítulo Poppins de 36 a 48 px, até 2 ou 3 linhas; de 55 a 90 px entre os blocos; o subtítulo nunca compete com o título |
| **03** | Título e versículo | título Palast Var de 95 a 135 px no terço superior; versículo Poppins de 36 a 46 px em linhas equilibradas; referência Poppins Bold de 36 a 42 px |
| **04** | Título, subtítulo e versículo | título de 85 a 115 px; subtítulo de 34 a 42 px; versículo de 30 a 38 px; referência Bold de 30 a 38 px. Se não couber, divide em dois slides |

Espaçamentos: título e subtítulo de 35 a 55 px; título e versículo de 55 a 90 px; subtítulo e versículo de 30 a 50 px; versículo e referência de 8 a 16 px; blocos independentes de 45 a 70 px.

## Elementos gráficos

Com moderação: gradiente discreto, formas em 5 a 15% de opacidade, número grande ao fundo, textura sutil, destaque retangular atrás de uma palavra (não de uma frase). No máximo um ou dois por slide. Sem sombras pesadas nem 3D.

## Versículos

Identificar a versão; texto fiel, sem cortes que mudem o sentido; referência junto e em negrito; sem fonte decorativa; sem texto pequeno; passagens longas viram vários slides.

## Evitar

Misturar fontes; título e versículo do mesmo tamanho; texto perto da borda; encher todo espaço vazio; comprimir texto para caber numa tela; alinhamentos sem justificativa.

## Checklist final

16:9 · margens · paleta · só Poppins e Palast Var · hierarquia do título · subtítulo subordinado · versículo fiel · referência identificada · contraste · espaçamentos · nada decorativo desnecessário · consistência · ortografia.

---

## Como o sistema aplica

### Modelo de cada slide

Cada slide gerado guarda o modelo (`layout`: `M01` a `M04`). Quem decide:

| Origem | Modelo | Observação |
|---|---|---|
| Título da palavra | 01 | |
| Ponto | 01 | em "Slides completos" a IA pode escolher 02 e escrever o subtítulo |
| Versículo | 03 | o título é o Ponto em que o versículo está (antes do primeiro ponto, o título da palavra); em "Slides completos" a IA pode escolher 04 e escrever um subtítulo curto |
| Resumo (Abertura, Ilustração, Aplicação, seção) | 02 | título do contexto e a frase como subtítulo |

Os modos de geração mapeiam assim: **Só versículos** → modelo 03; **Versículos e pontos** → 01 e 03; **Slides completos** → a IA escolhe entre 01 e 02 para cada ponto e entre 03 e 04 para cada versículo, e escreve os resumos em 02.

### Texto que não cabe

A fonte nunca sai da faixa do manual. O tamanho é escolhido dentro da faixa pelo comprimento do texto; o que passa do limite do modelo é dividido em mais slides:

| Modelo | Título | Subtítulo | Versículo |
|---|---|---|---|
| 01 | até 75 caracteres | | |
| 02 | até 60 | até 150 | |
| 03 | até 50 | | até 220 por slide |
| 04 | até 45 | até 90 | até 160 por slide |

- Versículo maior que o limite vira vários slides, cortando em frases.
- Modelo 04 que não cabe é dividido em dois: um slide 02 (título e subtítulo) e os slides 03 do versículo.
- Título de contexto maior que o limite do modelo 03 ou 04 aparece cortado na última palavra que cabe, com reticências: o título inteiro já apareceu no próprio slide.

### Versículo fiel

O texto do versículo vem sempre do bloco do esboço, que por sua vez vem da Bíblia importada (ou do que o pregador digitou). A IA recebe o versículo só como contexto e a resposta dela não tem campo de texto bíblico: ela não consegue reescrever. A referência vai em negrito logo abaixo, com a sigla da tradução ("Mateus 5:14 · BLIVRE").

### Cores

O visual escolhido pelo pregador define a combinação, sempre uma cor de fundo e uma de texto por slide:

| Visual | Modelos 02, 03 e 04 | Modelo 01 |
|---|---|---|
| **Azul institucional** | `#334C71` com `#F1EBE2` | `#182F5D` com `#F1EBE2` (impacto) |
| **Verde profundo** | `#092A1E` com `#FFFFFF` | `#092A1E` com `#FFFFFF` |

Verde oliva e azul-claro ficam reservados; o gerador não usa elementos gráficos decorativos.

### Fontes

- **Poppins** vem do Google Fonts (licença aberta).
- **Palast Var** é uma fonte comercial da HVD Fonts (https://www.hvdfonts.com/fonts/palast-text) e **não está no repositório**. Enquanto a igreja não fornecer os arquivos licenciados, os títulos usam **Playfair Display Italic** (Google Fonts, licença aberta) como substituta.
- Para ativar a Palast Var: pôr os arquivos `.woff2` em `apps/admin/public/fonts/` com os nomes indicados em `apps/admin/src/features/sermons/lib/slide-identity.ts`. A prévia passa a usá-la sozinha. Para a apresentação exportada (`.pptx`), definir `VITE_SLIDE_TITLE_FONT=Palast Var`; o arquivo `.pptx` não leva a fonte embutida, então ela precisa estar instalada no computador que abre a apresentação.
- Pesos usados: título em itálico médio; subtítulo e versículo em Poppins médio; referência em Poppins negrito.

### Medidas na tela

Tudo é calculado numa tela de 1920×1080 e reduzido em escala na prévia. Área de segurança de 240 px nas laterais e 190 px em cima e embaixo. Tracking: títulos -70, subtítulos e títulos do modelo 04 -50, versículos -30. Espaços: título e subtítulo 55 px; título e versículo 70 px; subtítulo e versículo 40 px; versículo e referência 12 px. Texto curto centralizado; versículo com mais de 110 caracteres ou título com mais de 35 alinha tudo à esquerda, num eixo só.
