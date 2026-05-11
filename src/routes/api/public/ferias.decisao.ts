import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/custom-supabase/client.server";

function html(title: string, body: string, ok = true) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:48px 16px">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center">
  <div style="font-size:48px">${ok ? "✅" : "⚠️"}</div>
  <h1 style="margin:12px 0 4px;color:#0f172a">${title}</h1>
  <p style="color:#475569">${body}</p>
</div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/ferias/decisao")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const action = url.searchParams.get("action");
        if (!token || !["approve", "reject"].includes(action ?? "")) {
          return html("Link inválido", "Parâmetros ausentes ou incorretos.", false);
        }

        const { data: ferias, error } = await supabaseAdmin
          .from("ferias")
          .select("id, status, colaborador_id, colaboradores(nome)")
          .eq("token_aprovacao", token)
          .maybeSingle();
        if (error || !ferias) return html("Solicitação não encontrada", "O link pode ter expirado.", false);

        if (ferias.status !== "Pendente") {
          return html("Já decidido", `Esta solicitação está como <b>${ferias.status}</b>.`, false);
        }

        const novo = action === "approve" ? "Aprovada" : "Recusada";
        const { error: uErr } = await supabaseAdmin
          .from("ferias")
          .update({
            status: novo,
            decidido_em: new Date().toISOString(),
            decidido_por: "approval-link",
          })
          .eq("id", ferias.id);
        if (uErr) return html("Erro ao processar", uErr.message, false);

        const nome = (ferias as any).colaboradores?.nome ?? "colaborador";
        return html(
          novo === "Aprovada" ? "Férias aprovadas" : "Férias recusadas",
          `A solicitação de <b>${nome}</b> foi marcada como <b>${novo}</b>. Você pode fechar esta janela.`,
          true,
        );
      },
    },
  },
});
