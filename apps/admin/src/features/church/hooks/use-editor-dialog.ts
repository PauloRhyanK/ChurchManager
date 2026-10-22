import { useState } from "react";

/** Estado de um diálogo de edição que sabe se há alterações não salvas. */
export function useEditorDialog<T>() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<T | null>(null);
  const [initial, setInitial] = useState("");

  return {
    open,
    value,
    setValue,
    dirty: open && JSON.stringify(value) !== initial,
    openWith(next: T) {
      setValue(next);
      setInitial(JSON.stringify(next));
      setOpen(true);
    },
    close: () => setOpen(false),
  };
}
