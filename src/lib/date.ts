export function formatDateBr(value: string | Date | null | undefined) {
  if (!value) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${day}/${month}/${year}`;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString("pt-BR");

    return trimmed;
  }

  return value.toLocaleDateString("pt-BR");
}

export function formatDateRangeBr(start: string | Date | null | undefined, end: string | Date | null | undefined) {
  return `${formatDateBr(start)} → ${formatDateBr(end)}`;
}