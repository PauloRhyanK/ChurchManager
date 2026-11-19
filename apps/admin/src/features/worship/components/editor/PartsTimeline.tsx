import type { DerivedPart } from "../../lib/document";

interface PartsTimelineProps {
  parts: DerivedPart[];
  duration: number | null;
  time: number;
  colorOf: (part: DerivedPart) => { background: string; color: string };
  onSeek?: (time: number) => void;
}

/**
 * As partes da música na linha do tempo do áudio. Com todas as partes
 * marcadas, cada bloco ocupa o trecho que dura; antes disso, ficam iguais.
 */
export function PartsTimeline({ parts, duration, time, colorOf, onSeek }: PartsTimelineProps) {
  const timed =
    !!duration &&
    parts.length > 0 &&
    parts.every((p, i) => p.time !== null && (i === 0 || p.time > (parts[i - 1].time ?? 0)) && p.time < duration);

  const segments = parts.map((p, i) => {
    if (!timed || !duration) return { part: p, left: (i / parts.length) * 100, width: 100 / parts.length };
    const start = p.time ?? 0;
    const end = parts[i + 1]?.time ?? duration;
    return { part: p, left: (start / duration) * 100, width: ((end - start) / duration) * 100 };
  });
  const playhead = duration ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div
      className={`relative h-11 w-full overflow-hidden rounded-lg bg-muted ${onSeek && duration ? "cursor-pointer" : ""}`}
      onClick={(e) => {
        if (!onSeek || !duration) return;
        const box = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - box.left) / box.width) * duration);
      }}
    >
      {segments.map(({ part, left, width }) => (
        <div
          key={part.rowId}
          title={part.name}
          className="absolute inset-y-0 flex items-center overflow-hidden border-r border-background/70 px-2 text-xs font-semibold"
          style={{ left: `${left}%`, width: `${width}%`, ...colorOf(part) }}
        >
          <span className="truncate">{part.name}</span>
        </div>
      ))}
      {duration ? (
        <div aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${playhead}%` }} />
      ) : null}
    </div>
  );
}
