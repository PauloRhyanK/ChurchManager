import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DiscardChangesDialog } from "./DiscardChangesDialog";

interface Props {
  open: boolean;
  dirty: boolean;
  pending: boolean;
  onClose: () => void;
  title: string;
  description: string;
  className?: string;
  children: (requestClose: () => void) => ReactNode;
}

/**
 * Dialog de criação/edição: não fecha durante o salvamento e pede confirmação
 * ("Descartar alterações?") ao fechar com alterações pendentes.
 */
export function EditorDialog({ open, dirty, pending, onClose, title, description, className, children }: Props) {
  const [confirming, setConfirming] = useState(false);

  const requestClose = () => {
    if (pending) return;
    if (dirty) setConfirming(true);
    else onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
        <DialogContent className={className}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children(requestClose)}
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={confirming}
        onOpenChange={setConfirming}
        onDiscard={() => {
          setConfirming(false);
          onClose();
        }}
      />
    </>
  );
}
