// Server-only helpers for sending vacation approval requests via Email + Teams.
// Both channels are best-effort: missing config is logged and skipped.

const APP_URL =
  process.env.APP_URL ||
  process.env.SITE_URL ||
  "https://id-preview--81117fc9-c668-4576-9f4e-cd1fa0309dd9.lovable.app";

type FeriasPayload = {
  colaboradorNome: string;
  gestorNome: string;
  gestorEmail: string;
  gestorTeamsUserId?: string | null;
  inicio: string;
  fim: string;
  periodoAquisitivo: string;
  token: string;
};

function approvalUrl(token: string, action: "approve" | "reject") {
  return `${APP_URL}/api/public/ferias/decisao?token=${token}&action=${action}`;
}

export async function sendVacationEmail(p: FeriasPayload): Promise<{ ok: boolean; reason?: string }> {
  const approve = approvalUrl(p.token, "approve");
  const reject = approvalUrl(p.token, "reject");

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 8px">Solicitação de Férias — Guardião de Gente</h2>
    <p style="color:#475569;margin:0 0 16px">${p.colaboradorNome} solicitou férias e aguarda sua aprovação.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#64748b">Período</td><td><b>${p.inicio} → ${p.fim}</b></td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Período aquisitivo</td><td>${p.periodoAquisitivo}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Gestor</td><td>${p.gestorNome}</td></tr>
    </table>
    <div style="margin-top:24px">
      <a href="${approve}" style="background:#0d9488;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px">Aprovar</a>
      <a href="${reject}" style="background:#dc2626;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Recusar</a>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">Esta é uma notificação automática do Guardião de Gente.</p>
  </div>`;

  try {
    const { sendMail } = await import("./mailer.server");
    await sendMail({
      to: p.gestorEmail,
      subject: `Aprovação de férias — ${p.colaboradorNome}`,
      html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `Falha SMTP: ${(e as Error).message}` };
  }
}

export async function sendVacationTeams(p: FeriasPayload): Promise<{ ok: boolean; reason?: string }> {
  const lovKey = process.env.LOVABLE_API_KEY;
  const teamsKey = process.env.MICROSOFT_TEAMS_API_KEY;
  if (!lovKey || !teamsKey) return { ok: false, reason: "Conector Teams não configurado" };
  if (!p.gestorTeamsUserId) return { ok: false, reason: "Gestor sem teams_user_id" };

  const approve = approvalUrl(p.token, "approve");
  const reject = approvalUrl(p.token, "reject");
  const text =
    `**Solicitação de férias** — ${p.colaboradorNome}\n\n` +
    `Período: **${p.inicio} → ${p.fim}** (${p.periodoAquisitivo})\n\n` +
    `[✅ Aprovar](${approve}) &nbsp;&nbsp; [❌ Recusar](${reject})`;

  try {
    // Cria/abre chat 1:1 e envia mensagem
    const chatRes = await fetch("https://connector-gateway.lovable.dev/microsoft_teams/chats", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovKey}`,
        "X-Connection-Api-Key": teamsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatType: "oneOnOne",
        members: [
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${p.gestorTeamsUserId}')`,
          },
        ],
      }),
    });
    if (!chatRes.ok) return { ok: false, reason: `Teams chat ${chatRes.status}` };
    const chat = await chatRes.json();
    const msgRes = await fetch(
      `https://connector-gateway.lovable.dev/microsoft_teams/chats/${chat.id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovKey}`,
          "X-Connection-Api-Key": teamsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: { contentType: "html", content: text.replace(/\n/g, "<br/>") } }),
      },
    );
    if (!msgRes.ok) return { ok: false, reason: `Teams msg ${msgRes.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `Falha Teams: ${(e as Error).message}` };
  }
}

export async function notifyVacationRequest(p: FeriasPayload) {
  const [email, teams] = await Promise.all([sendVacationEmail(p), sendVacationTeams(p)]);
  console.log("[ferias] notify", { email, teams, gestor: p.gestorEmail });
  return { email, teams };
}
