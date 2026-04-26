export function toValueCents(value?: number | null): number | null {
  if (value === undefined || value === null) return null;
  return Math.round(value * 100);
}

export function fromValueCents(cents?: number | null): number | undefined {
  if (cents === undefined || cents === null) return undefined;
  return cents / 100;
}

export function normalizeMaybe(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildReuseKey(parts: Record<string, string | number | boolean | null>) {
  const ordered = Object.keys(parts)
    .sort()
    .map((key) => {
      const value = parts[key];
      return `${key}:${value === null ? '-' : String(value)}`;
    });
  return ordered.join('|');
}
