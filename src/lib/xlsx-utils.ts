import * as XLSX from "xlsx";

export function readXlsxRows(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function downloadXlsx(rows: Record<string, any>[], sheetName: string, fileName: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}

/** Match colaborador by name (case-insensitive, trimmed) or by GPID. */
export function findColaborador(
  colabs: { id: string; nome: string; gpid: string; turno?: string }[],
  needle: string,
): { id: string; nome: string; turno?: string } | null {
  const n = String(needle ?? "").trim().toLowerCase();
  if (!n) return null;
  return (
    colabs.find((c) => c.nome.trim().toLowerCase() === n) ||
    colabs.find((c) => c.gpid?.toLowerCase() === n) ||
    null
  );
}

/** Excel serial date or string -> ISO YYYY-MM-DD */
export function toISODate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const m = String(d.m).padStart(2, "0");
    const day = String(d.d).padStart(2, "0");
    return `${d.y}-${m}-${day}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
