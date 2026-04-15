import { DollarSign, Users, CalendarDays, UserPlus } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { UpcomingEvents } from "@/components/dashboard/UpcomingEvents";
import { CashFlowChart } from "@/components/dashboard/CashFlowChart";

const Dashboard = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Bem-vindo ao painel administrativo da sua igreja.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total em Caixa"
            value="R$ 45.230"
            change="+12% em relação ao mês anterior"
            changeType="positive"
            icon={DollarSign}
            iconColor="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            title="Membros Ativos"
            value="342"
            change="+8 novos este mês"
            changeType="positive"
            icon={Users}
            iconColor="bg-primary/10 text-primary"
          />
          <StatCard
            title="Eventos do Mês"
            value="12"
            change="3 esta semana"
            changeType="neutral"
            icon={CalendarDays}
            iconColor="bg-blue-50 text-blue-600"
          />
          <StatCard
            title="Visitantes Recentes"
            value="28"
            change="+5 na última semana"
            changeType="positive"
            icon={UserPlus}
            iconColor="bg-amber-50 text-amber-600"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CashFlowChart />
          </div>
          <RecentActivity />
        </div>

        <UpcomingEvents />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
