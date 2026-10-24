# Contrato público — Agenda do telão (`projection-agenda`)

Alimenta a tela `/projecao-agenda` do site (Holyrics) com eventos e programação semanal numa linha do tempo. Configurada no painel em **Igreja → Site → Agenda do telão**.

```http
GET {API_ORIGIN}/api/public/tenants/{slug}/projection-agenda
```

Sem autenticação. Resposta:

```json
{
  "items": [
    {
      "key": "schedule:<id>:2026-10-25",
      "kind": "schedule",
      "sourceId": "<id do horário>",
      "title": "Culto da Família",
      "date": "2026-10-25",
      "timeStart": "09:00",
      "timeEnd": null,
      "location": "Templo",
      "note": "Ceia do Senhor"
    }
  ]
}
```

- `kind: "schedule"`: horário ativo da Agenda Semanal, repetido em cada dia correspondente dos **próximos 7 dias** (a contar de hoje, fuso America/Sao_Paulo). `note` = descrição do horário.
- `kind: "event"`: evento **publicado** com data de hoje em diante (sem limite de dias). `note` = `shortDescription`; `timeStart`/`timeEnd` podem ser `null`.
- Ordem: data, horário (sem horário primeiro), evento antes de horário no empate, título.
- Itens marcados como ocultos no painel não aparecem. `key` é estável por ocorrência.

Painel: `GET /admin/tenants/me/projection/agenda` (`SITE:VIEW`, mesma lista com `hidden`) e `PUT /admin/tenants/me/projection/settings` (`SITE:EDIT`) com `{ "hiddenEventIds": [...], "hiddenScheduleIds": [...] }`. Ocultar um horário vale para todas as semanas. Salvar dispara a revalidação do site.
