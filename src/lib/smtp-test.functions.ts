import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const testSmtp = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ to: z.string().email() }).parse(d))
  .handler(async ({ data }) => {
    const { sendMail, getTransporter, getFrom, isMailPreviewMode } = await import("./mailer.server");
    try {
      if (!isMailPreviewMode()) {
        const t = getTransporter();
        await t.verify();
      }
      const info = await sendMail({
        to: data.to,
        subject: "SIGP — Teste de SMTP",
        html: `<p>Teste de envio do SIGP via <b>${getFrom()}</b>. Se você recebeu, o SMTP está OK.</p>`,
        text: "Teste de envio do SIGP. Se você recebeu, o SMTP está OK.",
      });
      return {
        ok: true,
        messageId: (info as any)?.messageId ?? null,
        previewFile: (info as any)?.previewFile ?? null,
        previewMode: Boolean((info as any)?.previewMode),
      };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });
