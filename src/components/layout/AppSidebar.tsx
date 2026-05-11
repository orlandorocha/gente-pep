import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, CalendarX, Plane, FileHeart,
  CalendarClock, BellRing, ListChecks, ShieldCheck,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Colaboradores", url: "/colaboradores", icon: Users },
  { title: "Faltas", url: "/faltas", icon: CalendarX },
  { title: "Férias", url: "/ferias", icon: Plane },
  { title: "Licenças", url: "/licencas", icon: FileHeart },
  { title: "Agendamentos", url: "/agendamentos", icon: CalendarClock },
  { title: "Alertas", url: "/alertas", icon: BellRing },
  { title: "Tarefas", url: "/tarefas", icon: ListChecks },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-md">
            <ShieldCheck className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-sidebar-foreground">Guardião</span>
              <span className="text-[11px] text-sidebar-foreground/60">de Gente</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Operação</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = path === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={item.url} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && (
          <div className="px-2 py-2 text-[11px] text-sidebar-foreground/60">
            v1.0 · Plataforma Interna
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
