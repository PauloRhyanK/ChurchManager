import type { Pending, SongStatus } from "../lib/document";
import { situationOf } from "../lib/labels";

export function SituationBadge({ status, pending }: { status: SongStatus; pending: Pending[] }) {
  const s = situationOf(status, pending);
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-semibold ${s.textClass}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.dotClass}`} />
      {s.label}
    </span>
  );
}
