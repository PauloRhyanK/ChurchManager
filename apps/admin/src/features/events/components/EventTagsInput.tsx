import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchEventTags } from "@/features/events/api/tenant-event-tags-api";

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
};

export function EventTagsInput({ value, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const tagsQuery = useQuery({
    queryKey: ["event-tags"],
    queryFn: fetchEventTags,
  });

  const suggestions = useMemo(() => {
    const term = draft.trim().toLowerCase();
    const existing = new Set(value.map((t) => t.toLowerCase()));
    return (tagsQuery.data ?? [])
      .filter(
        (t) =>
          !existing.has(t.name.toLowerCase()) &&
          (term === "" || t.name.toLowerCase().includes(term)),
      )
      .slice(0, 6);
  }, [tagsQuery.data, draft, value]);

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (value.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  }

  function removeTag(name: string) {
    onChange(value.filter((t) => t !== name));
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-0.5 rounded-full hover:text-destructive"
                aria-label={`Remover ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            removeTag(value[value.length - 1]);
          }
        }}
        placeholder="Digite e pressione Enter (ex.: culto, retiro)"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => addTag(tag.name)}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            >
              + {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
