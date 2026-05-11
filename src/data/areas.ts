export const AREAS = [
  "EMBALAGEM TORCIDA",
  "EMBALAGEM EXTRUSADOS",
  "PROCESSO MASSA FRITA TORCIDA",
  "PROCESSO EXTRUSADOS",
] as const;

export type Area = (typeof AREAS)[number];
