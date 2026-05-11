import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as XLSX from "xlsx";

const Schema = z.object({
  inicio: z.string().length(10),
  fim: z.string().length(10),
  grupos: z.array(z.object({
    gestorNome: z.string().min(1),
    gestorEmail: z.string().min(1),
    turno: z.string().min(1),
    rows: z.array(z.object({
      Colaborador: z.string(),
      Área: z.string(),
      Motivo: z.string(),
      Turno: z.string(),
      Data: z.string(),
      Período: z.string(),
    })),
  })),
});

type Row = {
  Colaborador: string; Área: string; Motivo: string;
  Turno: string; Data: string; Período: string;
};

function isPlaceholderEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith("@empresa.com") || normalized.endsWith("@empresa.local");
}

function rowsToXlsxBase64(rows: Row[], sheet = "Faltas"): string {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  return buf as string;
}

function rowsToHtml(rows: Row[]): string {
  if (!rows.length) return "<p>Nenhuma falta registrada no período.</p>";
  const cells = (k: keyof Row) => rows.map(r => `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${r[k] ?? ""}</td>`);
  const head = ["Data","Colaborador","Área","Turno","Motivo","Período"]
    .map(h => `<th style="text-align:left;padding:8px 10px;background:#f1f5f9;border-bottom:1px solid #cbd5e1">${h}</th>`).join("");
  const body = rows.map(r =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-family:monospace">${r.Data}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${r.Colaborador}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${r.Área}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${r.Turno}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${r.Motivo}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${r.Período}</td></tr>`
  ).join("");
  return `<table style="border-collapse:collapse;font-family:Inter,Arial,sans-serif;font-size:13px;width:100%">
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Para cada gestor + turno, agrupa as faltas (apenas motivo "Falta") e envia
 * email com corpo HTML + anexo .xlsx.
 */
export const enviarFaltasParaGestores = createServerFn({ method: "POST" })
  .inputValidator((d) => Schema.parse(d))
  .handler(async ({ data }) => {
    const { sendMail, isMailPreviewMode } = await import("./mailer.server");
    const previewMode = isMailPreviewMode();

    if (!data.grupos || data.grupos.length === 0) {
      return { ok: true, sent: 0, grupos: 0, erros: [], detalhes: [], message: "Nenhuma falta no período.", previewMode };
    }

    let sent = 0; const erros: string[] = []; const detalhes: any[] = [];
    for (const grupo of data.grupos) {
      const gestor = { nome: grupo.gestorNome, email: grupo.gestorEmail };
      const turno = grupo.turno;
      const rows = grupo.rows as Row[];
      if (!gestor.email) {
        erros.push(`${gestor.nome} (${turno}): gestor sem email cadastrado`);
        detalhes.push({ gestor: gestor.nome, turno, email: "", status: "sem_email" });
        continue;
      }
      if (isPlaceholderEmail(gestor.email)) {
        erros.push(`${gestor.nome} (${turno}): substitua o email provisório ${gestor.email}`);
        detalhes.push({ gestor: gestor.nome, turno, email: gestor.email, status: "email_provisorio" });
        continue;
      }
      const html = `
      <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;max-width:720px">
        <h2 style="margin:0 0 8px">Faltas — ${turno} (${data.inicio} a ${data.fim})</h2>
        <p style="color:#475569">Olá ${gestor.nome}, segue o resumo das faltas dos colaboradores do turno <b>${turno}</b>.</p>
        ${rowsToHtml(rows)}
        <p style="color:#94a3b8;font-size:12px;margin-top:16px">Anexo: planilha .xlsx com os mesmos dados.</p>
      </div>`;
      const attachment = rowsToXlsxBase64(rows);
      try {
        const info = await sendMail({
          to: gestor.email,
          subject: `Faltas ${turno} — ${data.inicio} a ${data.fim}`,
          html,
          attachments: [{
            filename: `faltas-${turno}-${data.inicio}_${data.fim}.xlsx`,
            content: attachment,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }],
        });
        const mailInfo = info as any;
        const rejected = Array.isArray(mailInfo?.rejected) ? mailInfo.rejected : [];
        const accepted = Array.isArray(mailInfo?.accepted) ? mailInfo.accepted : [];
        if (rejected.length > 0) throw new Error(`SMTP rejeitou: ${rejected.join(", ")}`);
        sent++;
        detalhes.push({
          gestor: gestor.nome,
          turno,
          email: gestor.email,
          status: previewMode ? "preview" : "enviado",
          messageId: mailInfo?.messageId ?? null,
          accepted,
          previewFile: mailInfo?.previewFile ?? null,
        });
      } catch (e) {
        const message = (e as Error).message;
        erros.push(`${gestor.email}: ${message}`);
        detalhes.push({ gestor: gestor.nome, turno, email: gestor.email, status: "erro_smtp", error: message });
      }
    }

    return { ok: erros.length === 0, sent, grupos: data.grupos.length, erros, detalhes, previewMode };
  });
