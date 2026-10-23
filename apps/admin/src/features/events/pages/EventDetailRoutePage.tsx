import { useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { EventDetailPage } from "@/features/events/pages/EventDetailPage";

/**
 * Wrapper de layout — a página de detalhe foca-se só na UI do evento.
 * A `key` pelo id remonta a página ao trocar de evento sem sair da rota.
 */
export default function EventDetailRoutePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <DashboardLayout>
      <EventDetailPage key={id} />
    </DashboardLayout>
  );
}
