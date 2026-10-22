import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api, getApiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Mesma regra da API: tipo aceito e até 5 MB. Devolve a mensagem de erro, ou null se válido. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Formato não aceito. Envie uma imagem JPEG, PNG, WebP ou GIF.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "A imagem excede o limite de 5 MB.";
  }
  return null;
}

/** As mensagens de upload da API são em pt-BR e seguras; as demais seguem o padrão. */
function uploadErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const status = err.response?.status;
    const message = (err.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === "string" && (status === 400 || status === 413 || status === 500 || status === 503)) {
      return message;
    }
  }
  return getApiErrorMessage(err);
}

interface ImageUploaderProps {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  /** Endpoint de upload — cada módulo usa o seu, porque os guards diferem. */
  uploadPath?: string;
  /** Texto principal da zona de largada. */
  prompt?: string;
  /** Dica por contexto (proporção, uso). Obrigatória: cada tela diz o que serve para ela. */
  hint: string;
  successMessage?: string;
}

export function ImageUploader({
  value,
  onChange,
  disabled,
  uploadPath = "/admin/tenants/me/events/upload-cover",
  prompt = "Arraste ou clique para enviar a capa do evento",
  hint,
  successMessage = "Imagem enviada.",
}: ImageUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    const invalid = validateImageFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await api.post<{ url: string }>(uploadPath, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      onChange(response.data.url);
      toast.success(successMessage);
    } catch (err) {
      toast.error(uploadErrorMessage(err));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    if (disabled || isUploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleUpload(file);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleUpload(file);
    }
  };

  const triggerSelectFile = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleRemove = () => {
    onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {value ? (
        <div className="relative group overflow-hidden rounded-xl border bg-muted/30 shadow-sm transition-all duration-300 hover:shadow-md">
          <AspectRatio ratio={16 / 9} className="overflow-hidden">
            <img
              src={value}
              alt={prompt}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-102"
            />
          </AspectRatio>
          
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={disabled}
              className="flex items-center gap-2 shadow-lg"
            >
              <Trash2 className="h-4 w-4" />
              Remover Imagem
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerSelectFile}
          className={`
            relative flex aspect-video w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed 
            transition-all duration-300 p-6 text-center select-none
            ${isDragOver 
              ? "border-primary bg-primary/5 scale-[0.99] shadow-inner" 
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/10"
            }
            ${disabled || isUploading ? "pointer-events-none opacity-50" : ""}
          `}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="hidden"
            disabled={disabled || isUploading}
          />
          
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground animate-pulse">
                Enviando imagem...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3 text-primary transition-transform duration-300 group-hover:scale-110">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">{prompt}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
