import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Tipagem mínima da API nativa BarcodeDetector (ausente no lib.dom padrão). */
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

interface QrScannerProps {
  /** Chamado com o valor cru lido; o consumidor normaliza e trata duplicados. */
  onScan: (value: string) => void;
  /** Pausa a deteção (ex. enquanto um diálogo de confirmação está aberto). */
  paused?: boolean;
}

const SCAN_COOLDOWN_MS = 2500;

export function QrScanner({ onScan, paused = false }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  const supported = typeof Detector === "function";

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }

  async function start() {
    setError(null);
    if (!supported) {
      setError(
        "Este navegador não suporta leitura de QR pela câmara. Use a busca por nome/código.",
      );
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
      const detector = new Detector!({ formats: ["qr_code"] });

      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const found = codes[0]?.rawValue;
          if (found) {
            const now = Date.now();
            const last = lastScanRef.current;
            if (!last || last.value !== found || now - last.at > SCAN_COOLDOWN_MS) {
              lastScanRef.current = { value: found, at: now };
              onScan(found);
            }
          }
        } catch {
          // ignora falhas de frame isoladas
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError("Não foi possível aceder à câmara. Verifique as permissões.");
      stop();
    } finally {
      setStarting(false);
    }
  }

  // Pausa/retoma o loop sem desligar a câmara.
  useEffect(() => {
    if (!active) return;
    if (paused && rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [paused, active]);

  useEffect(() => () => stop(), []);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border bg-muted aspect-video">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <span className="text-sm">Câmara desligada</span>
          </div>
        )}
        {active && paused && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A processar…
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!active ? (
        <Button onClick={start} disabled={starting} className="gap-2">
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          Ligar câmara
        </Button>
      ) : (
        <Button onClick={stop} variant="outline" className="gap-2">
          <CameraOff className="h-4 w-4" />
          Desligar câmara
        </Button>
      )}
    </div>
  );
}
