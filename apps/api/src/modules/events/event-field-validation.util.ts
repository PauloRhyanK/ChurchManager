import { BadRequestException } from '@nestjs/common';

/** Chaves de campos do sistema satisfeitas pelos dados do pagador/inscrição. */
export const SYSTEM_FIELD_KEYS = new Set(['name', 'email', 'phone', 'cpf']);

export type TicketFieldRequirement = {
  fieldId: string;
  key: string;
  label: string;
  type?: string;
  enabled: boolean;
  required: boolean;
};

export type ProvidedFieldValue = { fieldId: string; value: string };

/**
 * Valida os campos obrigatórios e devolve os pares (fieldId, value) a persistir.
 * Campos do sistema (name/email/phone/cpf) são satisfeitos fora desta função.
 */
export function collectFieldValues(
  requirements: TicketFieldRequirement[],
  provided: ProvidedFieldValue[] | undefined,
): Array<{ fieldId: string; value: string }> {
  const providedMap = new Map<string, string>();
  for (const fv of provided ?? []) {
    const v = String(fv.value ?? '').trim();
    if (v) providedMap.set(fv.fieldId, v);
  }

  const enabledById = new Map<string, TicketFieldRequirement>();
  for (const req of requirements) {
    if (req.enabled) enabledById.set(req.fieldId, req);
  }

  for (const req of enabledById.values()) {
    if (!req.required) continue;
    if (SYSTEM_FIELD_KEYS.has(req.key)) continue;
    const val = providedMap.get(req.fieldId);
    if (!val || (req.type === "TERMS" && (val === "false" || val === "0"))) {
      throw new BadRequestException(
        req.type === "TERMS"
          ? `É necessário aceitar os termos: ${req.label}`
          : `Campo obrigatório: ${req.label}`,
      );
    }
  }

  const result: Array<{ fieldId: string; value: string }> = [];
  for (const [fieldId, value] of providedMap) {
    if (enabledById.has(fieldId)) {
      result.push({ fieldId, value });
    }
  }
  return result;
}
