import {
  LayoutDashboard,
  DollarSign,
  CalendarDays,
  Globe,
  Users,
  Grid3X3,
  Settings,
  Lock,
  Church,
  LogOut,
  Building2,
  UserCog,
  ShieldCheck,
  Link2,
  QrCode,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { clearStoredSession, getStoredSession } from "@/lib/auth-storage";
import type { PermissionModule } from "@/lib/auth-storage";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

const mainNav: {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  module?: PermissionModule;
}[] = [
  { title: "Visão Geral", url: "/", icon: LayoutDashboard, module: "DASHBOARD" },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign, module: "FINANCIAL" },
  { title: "Eventos", url: "/eventos", icon: CalendarDays, module: "EVENTS" },
  { title: "Site", url: "/site", icon: Globe, module: "SITE" },
];

const internoNav: {
  title: string;
  url: string;
  icon: typeof QrCode;
  /** Exact match — evita marcar o item em rotas irmãs sob o mesmo prefixo. */
  end?: boolean;
}[] = [
  { title: "Check-in", url: "/checkin", icon: QrCode, end: true },
];

const equipeNav = [
  { title: "Utilizadores", url: "/equipe/usuarios", icon: UserCog },
  { title: "Grupos", url: "/equipe/grupos", icon: ShieldCheck },
  { title: "Links de cadastro", url: "/equipe/links-cadastro", icon: Link2 },
];

/** Módulos ainda sem backend no painel — mesmo padrão visual (desactivado + Breve). */
const managementNav = [
  { title: "Escalas", icon: Users, soon: true },
  { title: "Células / Grupos", icon: Grid3X3, soon: true },
];

const platformNavItem = {
  title: "Igrejas (plataforma)",
  url: "/plataforma/igrejas",
  icon: Building2,
} as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const session = getStoredSession();
  const { can } = usePermissions();

  const visibleMainNav = mainNav.filter(
    (item) => !item.module || can(item.module, "VIEW"),
  );
  const canSeeInterno = can("CHECKIN", "VIEW");
  const canSeeEquipe = can("USERS", "VIEW");

  const isActive = (path: string, end = false) => {
    if (path === "/" || end) return location.pathname === path;
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  function logout() {
    clearStoredSession();
    window.location.assign("/login");
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Church className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-foreground">
                Igreja Admin
              </span>
              <span className="text-xs text-muted-foreground">
                Painel de Gestão
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {canSeeInterno && (
          <>
            <Separator className="my-2 mx-3" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
                Funcionamento interno
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {internoNav.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.url, item.end)}
                        tooltip={item.title}
                      >
                        <NavLink
                          to={item.url}
                          end={item.end}
                          className="rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {canSeeEquipe && (
          <>
            <Separator className="my-2 mx-3" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
                Equipe
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {equipeNav.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.url)}
                        tooltip={item.title}
                      >
                        <NavLink
                          to={item.url}
                          className="rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        <Separator className="my-2 mx-3" />

        {session?.user?.role === "PLATFORM_ADMIN" && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
              Plataforma
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(platformNavItem.url)}
                    tooltip={platformNavItem.title}
                  >
                    <NavLink
                      to={platformNavItem.url}
                      className="rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <platformNavItem.icon className="h-4 w-4" />
                      {!collapsed && <span>{platformNavItem.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
            Em breve
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {managementNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={`${item.title} — Em breve`}
                    className="rounded-lg px-3 py-2 text-sm text-muted-foreground/60 cursor-not-allowed"
                    disabled
                  >
                    <item.icon className="h-4 w-4" />
                    {!collapsed && (
                      <span className="flex items-center gap-2">
                        {item.title}
                        {item.soon && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 font-normal"
                          >
                            <Lock className="h-2.5 w-2.5 mr-0.5" />
                            Breve
                          </Badge>
                        )}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Separator className="mb-3" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive("/configuracoes")}
              tooltip="Configurações"
            >
              <NavLink
                to="/configuracoes"
                className="rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              >
                <Settings className="h-4 w-4" />
                {!collapsed && <span>Configurações</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {!collapsed && (
          <div className="mt-2 flex items-center gap-3 rounded-lg bg-secondary/50 p-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src="" />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                PA
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session?.user.tenantSlug ?? "Administrador"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {session?.user.email ?? "admin@igreja.com"}
              </p>
            </div>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              type="button"
              onClick={logout}
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
