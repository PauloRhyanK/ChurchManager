import { Badge } from "@/components/ui/badge";
import type { AdminUserStatus } from "@/lib/auth-storage";
import { ADMIN_USER_STATUS_LABELS } from "../permissions";

const VARIANTS: Record<AdminUserStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  PENDING_APPROVAL: "secondary",
  INVITED: "outline",
  SUSPENDED: "destructive",
};

export function UserStatusBadge({ status }: { status: AdminUserStatus }) {
  return (
    <Badge variant={VARIANTS[status]} className="font-normal">
      {ADMIN_USER_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
