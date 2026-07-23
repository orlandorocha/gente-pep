import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ColaboradorImportSchema = z.object({
  rows: z.array(z.object({
    nome: z.string().min(1),
    email: z.string().min(1),
    gpid: z.string().min(1),
    cargo: z.string().min(1),
    area: z.string().min(1),
    turno: z.enum(["Manhã", "Tarde", "Noite"]),
    status: z.enum(["Ativo", "Inativo", "Afastado"]),
    gestor_id: z.string().uuid().nullable(),
  })).min(1).max(500),
});

export const importarColaboradores = createServerFn({ method: "POST" })
  .inputValidator((d) => ColaboradorImportSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/custom-supabase/client.server");
    const { processarComResiencia } = await import("@/lib/xlsx-utils");
    
    const rows = Array.from(new Map(data.rows.map((r) => [r.gpid.trim(), {
      ...r,
      nome: r.nome.trim(),
      email: r.email.trim(),
      gpid: r.gpid.trim(),
      cargo: r.cargo.trim(),
      area: r.area.trim(),
    }])).values());
    
    const gpids = rows.map((r) => r.gpid);
    const { data: existentes, error: readError } = await supabaseAdmin
      .from("colaboradores")
      .select("id, gpid")
      .in("gpid", gpids);
    if (readError) throw new Error(readError.message);

    const idByGpid = new Map((existentes ?? []).map((c) => [c.gpid, c.id]));
    let inserted = 0;
    let updated = 0;

    // Processa cada colaborador com tratamento resiliente de erros
    const resultado = await processarComResiencia(
      rows,
      async (row) => {
        const id = idByGpid.get(row.gpid);
        const query = id
          ? supabaseAdmin.from("colaboradores").update(row).eq("id", id)
          : supabaseAdmin.from("colaboradores").insert(row);
        
        const { error } = await query;
        if (!error) {
          if (id) updated += 1;
          else inserted += 1;
          return;
        }

        // Trata erro de duplicata
        if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
          const { data: existing, error: lookupError } = await supabaseAdmin
            .from("colaboradores")
            .select("id")
            .eq("gpid", row.gpid)
            .maybeSingle();
          if (lookupError || !existing) {
            throw new Error(`${row.gpid}: ${lookupError?.message ?? error.message}`);
          }
          const { error: updateError } = await supabaseAdmin
            .from("colaboradores")
            .update(row)
            .eq("id", existing.id);
          if (updateError) throw new Error(`${row.gpid}: ${updateError.message}`);
          else updated += 1;
        } else {
          throw new Error(`${row.gpid}: ${error.message}`);
        }
      }
    );

    return { attempted: rows.length, inserted, updated, errors: resultado.erros };
  });
