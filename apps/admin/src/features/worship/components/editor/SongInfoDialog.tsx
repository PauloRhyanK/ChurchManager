import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Song, SongInfoBody } from "../../api/worship-api";

interface SongInfoDialogProps {
  song: Song;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (info: SongInfoBody) => void;
  saving: boolean;
}

/** Ficha técnica: nome, artista, tom, BPM e compasso. Só informação; o relógio é o áudio. */
export function SongInfoDialog({ song, open, onOpenChange, onSave, saving }: SongInfoDialogProps) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist ?? "");
  const [musicalKey, setMusicalKey] = useState(song.musicalKey ?? "");
  const [bpm, setBpm] = useState(song.bpm ? String(song.bpm) : "");
  const [timeSignature, setTimeSignature] = useState(song.timeSignature ?? "");

  useEffect(() => {
    if (!open) return;
    setTitle(song.title);
    setArtist(song.artist ?? "");
    setMusicalKey(song.musicalKey ?? "");
    setBpm(song.bpm ? String(song.bpm) : "");
    setTimeSignature(song.timeSignature ?? "");
  }, [open, song]);

  const bpmNumber = bpm.trim() === "" ? null : Number(bpm);
  const bpmInvalid = bpmNumber !== null && (!Number.isInteger(bpmNumber) || bpmNumber < 30 || bpmNumber > 300);
  const valid = title.trim().length > 0 && !bpmInvalid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ficha da música</DialogTitle>
          <DialogDescription>
            Tom, BPM e compasso são só anotação. Quem manda no tempo é o áudio.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSave({
              title: title.trim(),
              artist: artist.trim() || null,
              musicalKey: musicalKey.trim() || null,
              bpm: bpmNumber,
              timeSignature: timeSignature.trim() || null,
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ficha-nome">Nome</Label>
            <Input id="ficha-nome" value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ficha-artista">Artista ou ministério</Label>
            <Input id="ficha-artista" value={artist} maxLength={255} onChange={(e) => setArtist(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ficha-tom">Tom</Label>
              <Input id="ficha-tom" value={musicalKey} maxLength={16} placeholder="Sol" onChange={(e) => setMusicalKey(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ficha-bpm">BPM</Label>
              <Input id="ficha-bpm" inputMode="numeric" value={bpm} placeholder="72" aria-invalid={bpmInvalid} onChange={(e) => setBpm(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ficha-compasso">Compasso</Label>
              <Input id="ficha-compasso" value={timeSignature} maxLength={8} placeholder="4/4" onChange={(e) => setTimeSignature(e.target.value)} />
            </div>
          </div>
          {bpmInvalid && <p className="text-sm text-destructive">BPM deve ser um número inteiro entre 30 e 300.</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
