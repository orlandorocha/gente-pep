-- Cria tabela de logs de execução da rotina diária de sincronização de faltas
CREATE TABLE IF NOT EXISTS public.faltas_sync_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  target_date date NOT NULL,
  status text NOT NULL,
  summary jsonb NOT NULL,
  errors jsonb NOT NULL,
  attempts integer NOT NULL,
  duration_ms integer NOT NULL
);
