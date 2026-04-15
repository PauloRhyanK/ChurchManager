import { Image, FileText, Video, Pencil, Eye } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const banners = [
  { title: "Banner Principal", status: "Ativo", lastUpdate: "Há 2 dias", type: "imagem" },
  { title: "Banner Retiro de Jovens", status: "Agendado", lastUpdate: "Há 5 dias", type: "imagem" },
  { title: "Banner Conferência", status: "Rascunho", lastUpdate: "Há 1 semana", type: "imagem" },
];

const announcements = [
  { title: "Horário especial de Páscoa", status: "Publicado", date: "12/04/2026" },
  { title: "Inscrições para o retiro", status: "Publicado", date: "10/04/2026" },
  { title: "Novo endereço da célula centro", status: "Rascunho", date: "08/04/2026" },
];

const videos = [
  { title: "Culto Dominical - 13/04", views: 234, duration: "1:32:00" },
  { title: "Pregação Especial - Páscoa", views: 512, duration: "45:20" },
  { title: "Louvor ao vivo - Março", views: 189, duration: "58:10" },
];

const statusColors: Record<string, string> = {
  Ativo: "bg-emerald-100 text-emerald-700",
  Publicado: "bg-emerald-100 text-emerald-700",
  Agendado: "bg-blue-100 text-blue-700",
  Rascunho: "bg-muted text-muted-foreground",
};

const SiteManagement = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestão do Site</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie o conteúdo da página oficial da igreja.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Image className="h-4 w-4 text-primary" /> Banners
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {banners.map((b, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                  <div>
                    <p className="text-sm font-medium">{b.title}</p>
                    <p className="text-xs text-muted-foreground">{b.lastUpdate}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={`text-[10px] ${statusColors[b.status]}`}>{b.status}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Avisos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {announcements.map((a, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                  <div>
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={`text-[10px] ${statusColors[a.status]}`}>{a.status}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" /> Vídeos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {videos.map((v, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                  <div>
                    <p className="text-sm font-medium">{v.title}</p>
                    <p className="text-xs text-muted-foreground">{v.duration}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {v.views}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SiteManagement;
