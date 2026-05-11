import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/custom-supabase/client";

const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T>(table: string, orderBy: string, asc = true) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table as any)
      .select("*")
      .order(orderBy, { ascending: asc })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data as T[] | null) ?? [];
    rows.push(...batch);

    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

export type ColaboradorRow = {
  id: string; nome: string; email: string; gpid: string;
  cargo: string; area: string; turno: "Manhã"|"Tarde"|"Noite";
  status: "Ativo"|"Inativo"|"Afastado"; gestor_id: string | null;
};
export type GestorRow = { id: string; nome: string; email: string; teams_user_id: string | null };

export function useColaboradores() {
  const [data, setData] = useState<ColaboradorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAllRows<ColaboradorRow>("colaboradores", "nome");
      setData(rows);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}

export function useGestores() {
  const [data, setData] = useState<GestorRow[]>([]);
  const reload = useCallback(async () => {
    const rows = await fetchAllRows<GestorRow>("gestores", "nome");
    setData(rows);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return Object.assign(data, { reload }) as GestorRow[] & { reload: () => Promise<void> };
}

export function useTable<T = any>(table: string, orderBy = "created_at", asc = false) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAllRows<T>(table, orderBy, asc);
      setData(rows);
    } finally {
      setLoading(false);
    }
  }, [table, orderBy, asc]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}
