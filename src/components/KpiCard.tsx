import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "destructive" | "info";

const toneClasses: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export function KpiCard({
  label, value, hint, icon: Icon, tone = "primary", trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
  trend?: { value: string; positive?: boolean };
}) {
  return (
    <Card className="overflow-hidden border shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
            {trend && (
              <p className={cn(
                "mt-2 inline-flex items-center text-xs font-medium",
                trend.positive ? "text-success" : "text-destructive",
              )}>
                {trend.positive ? "▲" : "▼"} {trend.value}
              </p>
            )}
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
