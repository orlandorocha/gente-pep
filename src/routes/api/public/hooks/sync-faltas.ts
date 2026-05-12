import { createFileRoute } from "@tanstack/react-router";
import { sincronizarFaltasDiaAtual } from "@/lib/sync.functions";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === secret;
}

// Endpoint público chamado pelo pg_cron diariamente.
export const Route = createFileRoute("/api/public/hooks/sync-faltas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await sincronizarFaltasDiaAtual();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const result = await sincronizarFaltasDiaAtual();
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
