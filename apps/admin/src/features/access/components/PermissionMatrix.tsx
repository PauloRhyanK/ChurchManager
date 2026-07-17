import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PermissionLevel, PermissionModule } from "@/lib/auth-storage";
import { PERMISSION_MODULES } from "../permissions";
import type { PermissionEntry } from "../permissions";

interface PermissionMatrixProps {
  value: PermissionEntry[];
  onChange: (entries: PermissionEntry[]) => void;
  disabled?: boolean;
}

/** Grelha módulo x (Ver/Editar). EDIT implica VIEW; VIEW isolado é permitido. */
export function PermissionMatrix({
  value,
  onChange,
  disabled,
}: PermissionMatrixProps) {
  const byModule = new Map<PermissionModule, PermissionLevel>();
  for (const entry of value) byModule.set(entry.module, entry.level);

  function setLevel(module: PermissionModule, level: PermissionLevel | null) {
    const next = new Map(byModule);
    if (level === null) {
      next.delete(module);
    } else {
      next.set(module, level);
    }
    onChange(
      [...next.entries()].map(([m, l]) => ({ module: m, level: l })),
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Módulo</TableHead>
          <TableHead className="w-20 text-center">Ver</TableHead>
          <TableHead className="w-20 text-center">Editar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {PERMISSION_MODULES.map((meta) => {
          const level = byModule.get(meta.module);
          const canView = level === "VIEW" || level === "EDIT";
          const canEdit = level === "EDIT";
          return (
            <TableRow key={meta.module}>
              <TableCell>
                <div className="font-medium">{meta.label}</div>
                <div className="text-xs text-muted-foreground">
                  {meta.description}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Checkbox
                  checked={canView}
                  disabled={disabled || canEdit}
                  onCheckedChange={(checked) =>
                    setLevel(meta.module, checked ? "VIEW" : null)
                  }
                  aria-label={`Ver ${meta.label}`}
                />
              </TableCell>
              <TableCell className="text-center">
                <Checkbox
                  checked={canEdit}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    setLevel(meta.module, checked ? "EDIT" : canView ? "VIEW" : null)
                  }
                  aria-label={`Editar ${meta.label}`}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
