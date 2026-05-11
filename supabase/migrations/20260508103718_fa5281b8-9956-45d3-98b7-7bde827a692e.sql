
-- ENUMs
CREATE TYPE public.turno_enum AS ENUM ('Manhã','Tarde','Noite');
CREATE TYPE public.colab_status AS ENUM ('Ativo','Inativo','Afastado');
CREATE TYPE public.falta_motivo AS ENUM ('Atestado médico','Falta injustificada','Falta justificada','Atraso');
CREATE TYPE public.falta_periodo AS ENUM ('Integral','Manhã','Tarde');
CREATE TYPE public.ferias_status AS ENUM ('Pendente','Aprovada','Recusada','Em gozo','Concluída');
CREATE TYPE public.licenca_tipo AS ENUM ('Maternidade','Paternidade','Saúde','Sem vencimentos','Estudo');
CREATE TYPE public.licenca_status AS ENUM ('Ativa','Encerrada','Pendente');
CREATE TYPE public.agendamento_tipo AS ENUM ('De bem com a vida','Aniversário','Hora Extra');
CREATE TYPE public.agendamento_status AS ENUM ('Agendado','Realizado','Cancelado');
CREATE TYPE public.prioridade AS ENUM ('Baixa','Média','Alta');
CREATE TYPE public.tarefa_status AS ENUM ('A fazer','Em andamento','Concluída');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Gestores
CREATE TABLE public.gestores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  teams_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER gestores_updated BEFORE UPDATE ON public.gestores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Colaboradores
CREATE TABLE public.colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL,
  gpid text NOT NULL UNIQUE,
  cargo text NOT NULL,
  area text NOT NULL,
  turno public.turno_enum NOT NULL DEFAULT 'Manhã',
  status public.colab_status NOT NULL DEFAULT 'Ativo',
  gestor_id uuid REFERENCES public.gestores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER colaboradores_updated BEFORE UPDATE ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Faltas
CREATE TABLE public.faltas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  data date NOT NULL,
  motivo public.falta_motivo NOT NULL,
  periodo public.falta_periodo NOT NULL DEFAULT 'Integral',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Férias
CREATE TABLE public.ferias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  gestor_id uuid REFERENCES public.gestores(id) ON DELETE SET NULL,
  inicio date NOT NULL,
  fim date NOT NULL,
  periodo_aquisitivo text NOT NULL,
  status public.ferias_status NOT NULL DEFAULT 'Pendente',
  token_aprovacao uuid NOT NULL DEFAULT gen_random_uuid(),
  decidido_em timestamptz,
  decidido_por text,
  motivo_recusa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ferias_token_idx ON public.ferias(token_aprovacao);
CREATE TRIGGER ferias_updated BEFORE UPDATE ON public.ferias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Licenças
CREATE TABLE public.licencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo public.licenca_tipo NOT NULL,
  inicio date NOT NULL,
  fim date NOT NULL,
  status public.licenca_status NOT NULL DEFAULT 'Ativa',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Agendamentos
CREATE TABLE public.agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo public.agendamento_tipo NOT NULL,
  titulo text NOT NULL,
  data date NOT NULL,
  hora time NOT NULL,
  prioridade public.prioridade NOT NULL DEFAULT 'Média',
  status public.agendamento_status NOT NULL DEFAULT 'Agendado',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tarefas
CREATE TABLE public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  responsavel_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  prazo date,
  prioridade public.prioridade NOT NULL DEFAULT 'Média',
  status public.tarefa_status NOT NULL DEFAULT 'A fazer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER tarefas_updated BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.gestores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faltas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ferias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas        ENABLE ROW LEVEL SECURITY;

-- Internal app: any authenticated user can read & write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gestores','colaboradores','faltas','ferias','licencas','agendamentos','tarefas']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true);', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true);', t||'_delete', t);
  END LOOP;
END$$;
