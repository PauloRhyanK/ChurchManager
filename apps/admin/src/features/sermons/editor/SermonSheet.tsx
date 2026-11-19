import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { SermonDoc } from "../lib/document";
import { sermonExtensions } from "./extensions";

interface SermonSheetProps {
  title: string;
  /** Conteúdo inicial: depois de criado, o editor é a fonte do documento. */
  document: SermonDoc;
  editable: boolean;
  onTitleChange(title: string): void;
  onDocumentChange(doc: SermonDoc): void;
  onEditor(editor: Editor): void;
  className?: string;
}

const TITLE_MAX = 255;

// Tailwind zera os estilos de h2/h3/listas; aqui ficam os do texto do sermão (desenho "Palavra").
const contentStyles = [
  "[&_.ProseMirror]:min-h-[40vh] [&_.ProseMirror]:outline-none",
  "[&_.ProseMirror>*+*]:mt-4",
  "[&_.ProseMirror_p]:m-0",
  "[&_.ProseMirror_h2]:mt-6 [&_.ProseMirror_h2]:text-[24px] [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:leading-snug [&_.ProseMirror_h2]:text-[#030712]",
  "[&_.ProseMirror_h3]:mt-5 [&_.ProseMirror_h3]:text-[19px] [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:text-[#030712]",
  "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6",
  "[&_.ProseMirror_strong]:font-bold [&_.ProseMirror_em]:italic",
].join(" ");

/** A folha do sermão: título grande no topo e o documento. */
export function SermonSheet({
  title,
  document,
  editable,
  onTitleChange,
  onDocumentChange,
  onEditor,
  className,
}: SermonSheetProps) {
  // Os callbacks podem mudar a cada render; o editor é criado uma vez e lê sempre o mais recente.
  const onDocumentChangeRef = useRef(onDocumentChange);
  onDocumentChangeRef.current = onDocumentChange;

  const editor = useEditor({
    extensions: sermonExtensions,
    content: document,
    editable,
    editorProps: { attributes: { "aria-label": "Texto da palavra" } },
    onUpdate: ({ editor: e }) => onDocumentChangeRef.current(e.getJSON() as SermonDoc),
  });

  useEffect(() => {
    if (editor) onEditor(editor);
    // Avisa uma vez por editor criado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  return (
    <article
      aria-label="Sermão"
      className={cn(
        "mx-auto w-full max-w-[780px] rounded-md border border-[#E5E7EB] bg-white px-6 pb-16 pt-10 text-[17px] leading-[1.7] text-[#1F2937] shadow-[0_2px_10px_rgba(3,7,18,0.06)] sm:px-20 sm:pb-20 sm:pt-16",
        className,
      )}
    >
      <input
        type="text"
        aria-label="Título da palavra"
        placeholder="Título"
        value={title}
        maxLength={TITLE_MAX}
        readOnly={!editable}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            editor?.commands.focus("start");
          }
        }}
        className="mb-4 w-full bg-transparent text-[34px] font-bold leading-tight tracking-[-0.01em] text-[#030712] outline-none placeholder:text-[#9CA3AF]"
      />
      <EditorContent editor={editor} className={contentStyles} />
    </article>
  );
}
