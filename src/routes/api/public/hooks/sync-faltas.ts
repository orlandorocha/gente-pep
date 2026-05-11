import { createFileRoute } from "@tanstack/react-router";
import { sincronizarFaltasDoDia } from "@/lib/sync.functions";

// Endpoint público chamado pelo pg_cron diariamente.
export const Route = createFileRoute("/api/public/hooks/sync-faltas")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await sincronizarFaltasDoDia();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () => {
        const result = await sincronizarFaltasDoDia();
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
