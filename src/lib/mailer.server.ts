// Server-only SMTP mailer (nodemailer). Reads SMTP_* env vars.
import nodemailer, { type Transporter } from "nodemailer";
import { promises as fs } from "node:fs";
import path from "node:path";

let cached: Transporter | null = null;

export function isMailPreviewMode(): boolean {
  const mode = String(process.env.EMAIL_TRANSPORT || "").toLowerCase();
  return mode === "preview"
    || String(process.env.SMTP_DEV_MODE || "false").toLowerCase() === "true";
}

export function getTransporter(): Transporter {
  if (cached) return cached;
  if (isMailPreviewMode()) {
    cached = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "unix",
    });
    return cached;
  }
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  if (!host || !user || !pass) {
    throw new Error("SMTP não configurado (SMTP_HOST/SMTP_USER/SMTP_PASS)");
  }
  cached = nodemailer.createTransport({
    host,
    port,
    secure, // true para 465, false para 587 (STARTTLS)
    auth: { user, pass },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 10000),
    tls: host ? { servername: host, minVersion: "TLSv1.2" } : undefined,
  });
  return cached;
}

export function getFrom(): string {
  return process.env.EMAIL_FROM || `SIGP <${process.env.SMTP_USER}>`;
}

export type MailAttachment = {
  filename: string;
  content: string; // base64
  contentType?: string;
};

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}) {
  const t = getTransporter();
  const info = await t.sendMail({
    from: getFrom(),
    to: Array.isArray(opts.to) ? opts.to.join(",") : opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, "base64"),
      contentType: a.contentType,
    })),
  });

  if (!isMailPreviewMode()) return info;

  const previewDir = path.resolve(process.cwd(), process.env.SMTP_PREVIEW_DIR || ".mail-preview");
  await fs.mkdir(previewDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(previewDir, `${stamp}.eml`);
  const rawMessage = (info as any)?.message;
  const content = Buffer.isBuffer(rawMessage)
    ? rawMessage
    : Buffer.from(String(rawMessage ?? ""));
  await fs.writeFile(filePath, content);

  return Object.assign(info, { previewFile: filePath, previewMode: true });
}
