import type { SermonSummary } from "../api/sermons-api";
import { formatSituation } from "../lib/format";

const DOT: Record<SermonSummary["status"], string> = {
  DRAFT: "bg-muted-foreground/50",
  SENT: "bg-primary",
  PREACHED: "bg-emerald-600",
};

export function SituationLabel({ sermon }: { sermon: Pick<SermonSummary, "status" | "delivery"> }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-semibold">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[sermon.status]}`} />
      {formatSituation(sermon)}
    </span>
  );
}
