import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { api, getApiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";

interface ImageUploaderProps {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export function ImageUploader({ value, onChange, disabled }: ImageUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAspectRatio = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const ratio = img.width / img.height;
        // 16:9 is 1.777777...
        // Allow a small margin of tolerance (1.72 to 1.83)
        const is169 = Math.abs(ratio - 16 / 9) < 0.06;
        resolve(is169);
      };
      img.onerror = () => {
        resolve(false);
      };
    });
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("O ficheiro selecionado não é uma imagem.");
      return;
    }

    setIsUploading(true);
    const isValidRatio = await validateAspectRatio(file);

    if (!isValidRatio) {
      toast.error("A imagem deve ter a proporção de 16:9 (ex: 1920x1080, 1280x720).");
      setIsUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await api.post<{ url: string }>(
        "/admin/tenants/me/events/upload-cover",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      onChange(response.data.url);
      toast.success("Imagem de capa carregada com sucesso.");
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setIsUploading(false);
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
              alt="Capa do Evento"
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
            accept="image/*"
            className="hidden"
            disabled={disabled || isUploading}
          />
          
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground animate-pulse">
                A enviar imagem...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3 text-primary transition-transform duration-300 group-hover:scale-110">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">
                  Arraste ou clique para carregar a capa do evento
                </p>
                <p className="text-xs text-muted-foreground">
                  Proporção recomendada de 16:9 (ex: 1920x1080)
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
