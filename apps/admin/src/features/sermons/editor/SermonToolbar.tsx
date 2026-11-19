import { useEditorState, type Editor } from "@tiptap/react";
import { ChevronDown, List } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BLOCK_COLORS, BLOCK_LABELS, type CalloutKind, type SermonBlockKind } from "./block-colors";
import { VerseDialog } from "./VerseDialog";

type TextStyle = "paragraph" | "h2" | "h3";
const TEXT_STYLES: { value: TextStyle; label: string }[] = [
  { value: "paragraph", label: "Texto normal" },
  { value: "h2", label: "Título de seção" },
  { value: "h3", label: "Subtítulo" },
];

const BLOCKS: SermonBlockKind[] = ["verse", "point", "illustration", "application", "privateNote"];

/** Barra de formatação e dos cinco blocos do sermão. */
export function SermonToolbar({ editor, className }: { editor: Editor; className?: string }) {
  const [verseOpen, setVerseOpen] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      editable: e.isEditable,
      textStyle: (e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "paragraph") as TextStyle,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bulletList: e.isActive("bulletList"),
      verse: e.isActive("verse"),
      point: e.isActive("point"),
      illustration: e.isActive("illustration"),
      application: e.isActive("application"),
      privateNote: e.isActive("privateNote"),
    }),
  });
  const disabled = !state.editable;

  function setTextStyle(value: string) {
    const chain = editor.chain().focus();
    if (value === "h2") chain.setHeading({ level: 2 }).run();
    else if (value === "h3") chain.setHeading({ level: 3 }).run();
    else chain.setParagraph().run();
  }

  function insertBlock(kind: SermonBlockKind) {
    if (kind === "verse") return setVerseOpen(true);
    if (kind === "point") return editor.chain().focus().insertPoint().run();
    editor
      .chain()
      .focus()
      .insertCallout(kind as CalloutKind)
      .run();
  }

  // Clicar num botão não tira o foco nem a seleção do editor.
  const keepSelection = (e: MouseEvent) => e.preventDefault();
  const iconButton = "h-10 w-10 text-base text-[#030712]";

  return (
    <div
      role="toolbar"
      aria-label="Formatação e blocos do sermão"
      className={cn("flex flex-wrap items-center justify-center gap-1", className)}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button type="button" variant="ghost" className="h-10 gap-1.5 px-3 font-semibold text-[#030712]">
            Texto
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={state.textStyle} onValueChange={setTextStyle}>
            {TEXT_STYLES.map((s) => (
              <DropdownMenuRadioItem key={s.value} value={s.value}>
                {s.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Negrito"
        onMouseDown={keepSelection}
        aria-pressed={state.bold}
        disabled={disabled}
        className={cn(iconButton, "font-bold", state.bold && "bg-accent")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        N
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Itálico"
        onMouseDown={keepSelection}
        aria-pressed={state.italic}
        disabled={disabled}
        className={cn(iconButton, "font-semibold italic", state.italic && "bg-accent")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        I
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Lista"
        onMouseDown={keepSelection}
        aria-pressed={state.bulletList}
        disabled={disabled}
        className={cn(iconButton, state.bulletList && "bg-accent")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List aria-hidden="true" />
      </Button>
      <span aria-hidden="true" className="mx-2 h-6 w-px bg-border" />
      {BLOCKS.map((kind) => (
        <Button
          key={kind}
          type="button"
          variant="ghost"
          aria-pressed={state[kind]}
          onMouseDown={keepSelection}
          disabled={disabled}
          className={cn("h-10 gap-2 px-3 font-semibold text-[#030712]", state[kind] && "bg-accent")}
          onClick={() => insertBlock(kind)}
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: BLOCK_COLORS[kind].dot }} />
          {BLOCK_LABELS[kind]}
        </Button>
      ))}
      <VerseDialog
        open={verseOpen}
        onOpenChange={setVerseOpen}
        onSubmit={(verse) => editor.chain().focus().insertVerse(verse).run()}
        restoreFocus={() => !editor.isDestroyed && editor.commands.focus()}
      />
    </div>
  );
}
