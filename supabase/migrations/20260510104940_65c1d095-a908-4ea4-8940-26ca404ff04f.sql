-- Evita duplicidade de faltas auto-geradas (mesmo colaborador, mesmo dia, mesmo motivo)
CREATE UNIQUE INDEX IF NOT EXISTS faltas_colab_data_motivo_uidx
  ON public.faltas (colaborador_id, data, motivo);