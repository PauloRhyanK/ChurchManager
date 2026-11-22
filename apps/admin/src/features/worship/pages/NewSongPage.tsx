import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api";
import { NewSongForm, type NewSongDraft } from "../components/NewSongForm";
import { OrganizingScreen } from "../components/OrganizingScreen";
import { createOrganizedSong, organizeSteps } from "../lib/create-song";

export default function NewSongPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<NewSongDraft>({ title: "", rawLyrics: "", file: null, audio: null });
  const [step, setStep] = useState<number | null>(null);

  async function organize() {
    setStep(0);
    try {
      const { song, audioError } = await createOrganizedSong(
        { title: draft.title.trim(), rawLyrics: draft.rawLyrics, file: draft.file, audio: draft.audio },
        setStep,
      );
      void queryClient.invalidateQueries({ queryKey: ["worship", "songs"] });
      if (audioError) {
        toast.error(`A música foi criada, mas o áudio não foi enviado. ${getApiErrorMessage(audioError)}`);
      }
      navigate(`/cultos/musicas/${song.id}`, { replace: true });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
      setStep(null);
    }
  }

  return (
    <DashboardLayout>
      {step !== null ? (
        <OrganizingScreen steps={organizeSteps(!!draft.file || !!draft.audio)} current={step} />
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <h1 className="text-2xl font-bold tracking-tight">Nova música</h1>
          <NewSongForm
            idPrefix="nova"
            draft={draft}
            onChange={setDraft}
            onOrganize={() => void organize()}
            secondary={
              <Button asChild variant="ghost">
                <Link to="/cultos/musicas">Cancelar</Link>
              </Button>
            }
          />
        </div>
      )}
    </DashboardLayout>
  );
}
