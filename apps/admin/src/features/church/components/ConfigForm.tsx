import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Heart, Loader2, Phone } from "lucide-react";
import { useEffect } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api";
import {
  updateChurchConfig,
  type ChurchConfigBody,
  type ChurchConfigDto,
} from "../api/church-api";

const FIELDS = [
  "phone",
  "email",
  "address",
  "pixKey",
  "bankName",
  "bankCode",
  "agency",
  "account",
  "holderName",
  "holderDocument",
  "youtubeUrl",
  "instagramUrl",
  "facebookUrl",
] as const;

type ConfigValues = Record<(typeof FIELDS)[number], string>;

function toValues(config: ChurchConfigDto): ConfigValues {
  return Object.fromEntries(FIELDS.map((f) => [f, config[f] ?? ""])) as ConfigValues;
}

function toBody(values: ConfigValues): ChurchConfigBody {
  return Object.fromEntries(FIELDS.map((f) => [f, values[f] || null])) as ChurchConfigBody;
}

interface FieldProps {
  id: keyof ConfigValues;
  label: string;
  placeholder: string;
  reg: UseFormRegisterReturn;
  error?: string;
  maxLength?: number;
  type?: string;
  className?: string;
}

function Field({ id, label, placeholder, reg, error, maxLength, type, className }: FieldProps) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        {...reg}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

interface ConfigFormProps {
  /** Só é renderizado depois de a configuração ter sido carregada com sucesso. */
  config: ChurchConfigDto;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
}

export function ConfigForm({ config, canEdit, onDirtyChange }: ConfigFormProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { isDirty, errors },
  } = useForm<ConfigValues>({ defaultValues: toValues(config) });

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const mutation = useMutation({
    mutationFn: updateChurchConfig,
    onSuccess: (saved) => {
      toast.success("Configurações atualizadas.");
      reset(toValues(saved));
      void queryClient.invalidateQueries({ queryKey: ["church-config"] });
    },
    onError: (err) => {
      const fieldErrors = getApiFieldErrors(err);
      for (const [field, message] of Object.entries(fieldErrors)) {
        if ((FIELDS as readonly string[]).includes(field)) {
          setError(field as keyof ConfigValues, { message });
        }
      }
      toast.error(getApiErrorMessage(err));
    },
  });

  const f = (id: keyof ConfigValues) => ({
    id,
    reg: register(id),
    error: errors[id]?.message,
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(toBody(values)))} className="space-y-6">
      <fieldset disabled={!canEdit} className="space-y-6 min-w-0">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4 rounded-lg border p-4 bg-muted/10">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Phone className="h-4 w-4" /> Informações de Contato
            </h3>
            <Field {...f("phone")} label="Telefone" placeholder="(27) 99875-7008" maxLength={40} />
            <Field
              {...f("email")}
              label="E-mail"
              type="email"
              placeholder="contato@igreja.com.br"
              maxLength={160}
            />
            <div className="space-y-2">
              <Label htmlFor="address">Endereço Sede</Label>
              <Textarea
                id="address"
                rows={3}
                placeholder="Rua Helmut Gums, 438 - Virada, Santa Maria de Jetibá - ES"
                {...register("address")}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-lg border p-4 bg-muted/10">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Globe className="h-4 w-4" /> Redes Sociais
            </h3>
            <Field
              {...f("youtubeUrl")}
              label="Canal do YouTube (URL)"
              type="url"
              placeholder="https://www.youtube.com/@paraisoigreja"
              maxLength={512}
            />
            <Field
              {...f("instagramUrl")}
              label="Perfil do Instagram (URL)"
              type="url"
              placeholder="https://www.instagram.com/paraisoigreja/"
              maxLength={512}
            />
            <Field
              {...f("facebookUrl")}
              label="Página do Facebook (URL)"
              type="url"
              placeholder="https://www.facebook.com/paraisoigreja/"
              maxLength={512}
            />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border p-4 bg-muted/10">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Heart className="h-4 w-4" /> Dados de Dízimos & Ofertas
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <Field
              {...f("pixKey")}
              label="Chave PIX"
              placeholder="projeto@visaodofuturo.com.br"
              maxLength={160}
              className="sm:col-span-2"
            />
            <Field {...f("bankName")} label="Nome do Banco" placeholder="Sicoob" maxLength={80} />
            <Field {...f("bankCode")} label="Cód. Banco" placeholder="756" maxLength={10} />
            <Field {...f("agency")} label="Agência" placeholder="3007" maxLength={20} />
            <Field {...f("account")} label="Conta Corrente" placeholder="12345-6" maxLength={30} />
            <Field
              {...f("holderName")}
              label="Nome do Favorecido (Razão Social)"
              placeholder="Igreja Paraíso"
              maxLength={160}
              className="sm:col-span-2"
            />
            <Field
              {...f("holderDocument")}
              label="CNPJ do Favorecido"
              placeholder="00.000.000/0001-00"
              maxLength={30}
            />
          </div>
        </div>
      </fieldset>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Alterações
          </Button>
        </div>
      )}
    </form>
  );
}
