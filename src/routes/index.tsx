import { createFileRoute, redirect } from "@tanstack/react-router";
import { ensureAuthSessionReady, supabase } from "@/integrations/custom-supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    await ensureAuthSessionReady();
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/dashboard" : "/login" });
  },
  component: () => null,
});
