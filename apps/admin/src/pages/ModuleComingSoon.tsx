import { Link } from "react-router-dom";
import { Construction } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface ModuleComingSoonProps {
  title: string;
  description: string;
}

export function ModuleComingSoon({ title, description }: ModuleComingSoonProps) {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-lg space-y-6 py-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Construction className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              {description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild variant="default">
              <Link to="/financeiro">Ir para Financeiro</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Visão geral</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
