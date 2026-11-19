/** 252.4 → "4:12". */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "–:––";
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 131.25 → "2:11,2" (para conferir tempo de slide). */
export function formatClockTenths(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "–:––";
  const tenths = Math.max(0, Math.round(seconds * 10));
  const whole = Math.floor(tenths / 10);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")},${tenths % 10}`;
}

/** "Sol · 72 bpm · 4:12", ou "Só a letra" quando não há ficha nem áudio. */
export function songFicha(song: {
  musicalKey: string | null;
  bpm: number | null;
  audio: { durationSeconds: number | null } | null;
}): string {
  const parts = [
    song.musicalKey,
    song.bpm ? `${song.bpm} bpm` : null,
    song.audio?.durationSeconds ? formatClock(song.audio.durationSeconds) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Só a letra";
}

/** Minúsculas e sem acento, para busca por título. */
export function plain(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** "2026-11-22" + "19:00" → "Domingo, 22/11 · 19h". */
export function formatServiceLabel(date: string, startTime: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  const short = weekday.replace("-feira", "");
  const [hh, mm] = startTime.split(":");
  const hour = mm === "00" ? `${Number(hh)}h` : `${Number(hh)}h${mm}`;
  return `${short.charAt(0).toUpperCase()}${short.slice(1)}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} · ${hour}`;
}

/** Lê a duração de um arquivo de áudio no navegador; null se não der. */
export function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}
