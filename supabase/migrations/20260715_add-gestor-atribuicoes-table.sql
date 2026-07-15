-- Cria tabela de atribuições de gestores a múltiplos setores/cargos/turnos
-- Isto permite que um gestor gerencie múltiplos processos

-- 1) Criar tabela gestor_atribuicoes
CREATE TABLE IF NOT EXISTS public.gestor_atribuicoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gestor_id UUID NOT NULL,
  setor TEXT NOT NULL,
  cargo TEXT NOT NULL,
  turno public.turno_enum NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('UTC', NOW()) NOT NULL,
  
  -- Referência ao gestor
  CONSTRAINT gestor_atribuicoes_gestor_id_fkey
    FOREIGN KEY (gestor_id) REFERENCES public.gestores(id) ON DELETE CASCADE,
  
  -- Índice único: cada combinação (gestor, setor, cargo, turno) uma vez
  UNIQUE(gestor_id, setor, cargo, turno)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS gestor_atribuicoes_gestor_id_idx
  ON public.gestor_atribuicoes(gestor_id);

CREATE INDEX IF NOT EXISTS gestor_atribuicoes_setor_cargo_turno_idx
  ON public.gestor_atribuicoes(setor, cargo, turno);

-- 2) Migrar dados existentes: Se um gestor tem setor/turno/cargo, criar atribuição
INSERT INTO public.gestor_atribuicoes (gestor_id, setor, cargo, turno)
SELECT 
  g.id,
  g.setor,
  g.cargo,
  g.turno
FROM public.gestores g
WHERE g.setor IS NOT NULL 
  AND g.cargo IS NOT NULL 
  AND g.turno IS NOT NULL
ON CONFLICT (gestor_id, setor, cargo, turno) DO NOTHING;

-- 3) Comentar sobre as mudanças (opcional, para documentação)
COMMENT ON TABLE public.gestor_atribuicoes IS 'Vincula um gestor a múltiplos processos (combinações de setor/cargo/turno)';
COMMENT ON COLUMN public.gestor_atribuicoes.gestor_id IS 'ID do gestor';
COMMENT ON COLUMN public.gestor_atribuicoes.setor IS 'Setor/Área onde o gestor atua';
COMMENT ON COLUMN public.gestor_atribuicoes.cargo IS 'Cargo dos colaboradores que o gestor gerencia';
COMMENT ON COLUMN public.gestor_atribuicoes.turno IS 'Turno dos colaboradores que o gestor gerencia';

-- 4) RLS (Row Level Security) - opcional, se usando RLS no seu projeto
-- ALTER TABLE public.gestor_atribuicoes ENABLE ROW LEVEL SECURITY;
