import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { EventDetailPage } from "@/features/events/pages/EventDetailPage";

/** Wrapper de layout — a página de detalhe foca-se só na UI do evento. */
export default function EventDetailRoutePage() {
  return (
    <DashboardLayout>
      <EventDetailPage />
    </DashboardLayout>
  );
}
