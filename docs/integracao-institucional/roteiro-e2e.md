# Roteiro ponta a ponta painel → API → site

> Executado **fora do Warren**, depois que os planos `pl-a788` (ChurchManager, `qa`) e `pl-5edb` (site, `homologacao`) forem integrados. O Warren trabalha um repositório por vez e não consegue provar a cadeia completa. Diagnóstico e limites: [diagnostico.md](diagnostico.md).

## Preparação

1. ChurchManager na `qa` atualizada: Postgres (`docker compose up -d db`), `npx prisma migrate deploy`, `npx prisma db seed`, API (`npm run dev` em `apps/api`, porta do `.env`) e admin (`npm run dev` em `apps/admin`, porta 8080). Login do seed.
2. Site na `homologacao` atualizada, com `npm run build && npm start` (modo produção, para o cache valer) e:
   - `NEXT_PUBLIC_DONATIONS_API_BASE` = URL da API local, `NEXT_PUBLIC_DONATIONS_TENANT_SLUG` = slug do tenant do seed;
   - `REVALIDATION_SECRET` = valor de teste; `SITE_MEDIA_HOSTNAMES` = host público do R2 (ou de um bucket de teste).
3. Na API: `SITE_REVALIDATION_SECRET` = mesmo valor de teste; `SITE_REVALIDATION_TARGETS` = `{"<slug>":["http://localhost:<porta do site>"]}` (http só vale fora de produção).
4. Origem do site registrada em Configurações → Site público (CORS), se o site chamar a API pelo navegador.

## Casos (registrar resultado e evidência de cada um)

| # | Ação no painel | Esperado na API | Esperado no site | Tempo |
|---|---|---|---|---|
| 1 | Criar filial ativa com imagem e Maps | 201; imagem em `tenants/{tenantId}/church/` | aparece em `/` e `/nossas-igrejas` com a imagem | próxima visita |
| 2 | Editar nome e imagem da filial | 200; GET devolve o novo valor | novo nome e imagem | próxima visita |
| 3 | Desativar a filial | 200 | some de `/` e `/nossas-igrejas` | próxima visita |
| 4 | Excluir a filial | 200; arquivo no R2 **preservado** | não aparece | próxima visita |
| 5 | Repetir 1–4 para pastor (`/time-pastoral`) e ministério | idem | idem (ministério: conferir no JSON público; o site não exibe a seção hoje) | próxima visita |
| 6 | Criar, editar, desativar horário na Agenda Semanal | 200 | programação da home e `/contato` refletem | próxima visita |
| 7 | Alterar telefone, e-mail, endereço e redes em Ofertório, Redes e Contatos | 200 | rodapé e `/contato` refletem | próxima visita |
| 8 | Alterar PIX/banco | 200 | seção de ofertório reflete | próxima visita |
| 9 | Editar e repor seção na Gestão do Site (ex.: missão) | 200 | home reflete; repor volta ao padrão | próxima visita |
| 10 | Revalidação desligada (`SITE_REVALIDATION_TARGETS` vazio) e editar algo | 200 | conteúdo novo em até 300 s | ≤ 300 s |
| 11 | Parar a API e visitar o site | — | textos de reserva; nenhuma igreja, pastor ou horário fixo | — |
| 12 | Usuário só com CHURCH:VIEW | PUT/POST/DELETE → 403 | — | — |
| 13 | Upload de SVG, de arquivo > 5 MB e de PNG renomeado | 400 / 413 / aceito como `image/png` | — | — |
| 14 | Tenant B tenta ler ou editar id do tenant A | 404, nada muda | site do tenant A inalterado | — |

Para cada caso de site: screenshot em 1280px e 375px. Em qualquer divergência: registrar, corrigir no repositório responsável e repetir o caso.

## Depois do deploy no ambiente QA

- Upload real no R2 com as credenciais do ambiente (caso 1) e leitura do log da API em caso de falha — é aqui que se confirma ou descarta a hipótese dos checksums.
- Conferir que `SITE_REVALIDATION_TARGETS`, `SITE_MEDIA_HOSTNAMES` e `REVALIDATION_SECRET` estão definidos nos ambientes, e que as variáveis `CHURCHMANAGER_ADMIN_*` foram removidas da Vercel e o usuário técnico do painel paralelo foi desativado no ChurchManager.

## Registro

Resultados em `docs/qa/2026-10-integracao-institucional-e2e.md` (deste repositório): SHAs dos dois repositórios, tabela dos casos com atendido / não atendido / não verificável, evidências e pendências.
