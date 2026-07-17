import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { fetchEventLocations } from "@/features/events/api/tenant-events-api";

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
};

export function EventLocationInput({ value, onChange, id }: Props) {
  const [focused, setFocused] = useState(false);
  const locationsQuery = useQuery({
    queryKey: ["event-locations"],
    queryFn: fetchEventLocations,
  });

  const suggestions = useMemo(() => {
    const term = value.trim().toLowerCase();
    if (!term) return (locationsQuery.data ?? []).slice(0, 8);
    return (locationsQuery.data ?? [])
      .filter((loc) => loc.toLowerCase().includes(term))
      .slice(0, 8);
  }, [locationsQuery.data, value]);

  const showSuggestions =
    focused && suggestions.length > 0 && suggestions.some((s) => s !== value.trim());

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        placeholder="Ex.: Auditório principal"
        autoComplete="off"
      />
      {showSuggestions && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
          {suggestions.map((loc) => (
            <li key={loc}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(loc);
                  setFocused(false);
                }}
              >
                {loc}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
