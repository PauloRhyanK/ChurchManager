# Segurança de Segredos (Produção)

## ENCRYPTION_KEY

- Injetar `ENCRYPTION_KEY` como **secret/variável de ambiente** no ambiente de produção.
- Formato obrigatório: string hexadecimal com **64 caracteres** (32 bytes).
- A API falha no startup se a chave estiver ausente/inválida.
- Nunca versionar esta chave no Git.

## Rotação

- Definir owner operacional para rotação.
- Definir janela de manutenção para rotação.
- Backlog: estratégia de key versioning/re-cifra para permitir troca sem perder leitura de dados antigos.

## Asaas por Tenant

- `tenants.asaas_api_key` e `tenants.asaas_webhook_token` são armazenados cifrados.
- Atualização de credenciais via endpoint administrativo valida a nova chave no Asaas antes de persistir.

