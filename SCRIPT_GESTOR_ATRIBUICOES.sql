-- ============================================================================
-- SCRIPT PARA CRIAR TABELA gestor_atribuicoes COM RLS
-- ============================================================================
-- Cole este script no SQL Editor do Supabase (v0 → SQL Editor → New Query)
-- Depois execute clicando em "Execute" (ou Ctrl+Enter)
-- ============================================================================

-- 1) CRIAR TABELA
CREATE TABLE IF NOT EXISTS public.gestor_atribuicoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gestor_id UUID NOT NULL,
  setor TEXT NOT NULL,
  cargo TEXT NOT NULL,
  turno public.turno_enum NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('UTC', NOW()) NOT NULL,
  
  CONSTRAINT gestor_atribuicoes_gestor_id_fkey
    FOREIGN KEY (gestor_id) REFERENCES public.gestores(id) ON DELETE CASCADE,
  
  UNIQUE(gestor_id, setor, cargo, turno)
);

-- 2) CRIAR ÍNDICES
CREATE INDEX IF NOT EXISTS gestor_atribuicoes_gestor_id_idx
  ON public.gestor_atribuicoes(gestor_id);

CREATE INDEX IF NOT EXISTS gestor_atribuicoes_setor_cargo_turno_idx
  ON public.gestor_atribuicoes(setor, cargo, turno);

-- 3) MIGRAR DADOS EXISTENTES
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

-- 4) ENABLE RLS (Row Level Security)
ALTER TABLE public.gestor_atribuicoes ENABLE ROW LEVEL SECURITY;

-- 5) CREATE RLS POLICIES
CREATE POLICY "gestor_atribuicoes_select" ON public.gestor_atribuicoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "gestor_atribuicoes_insert" ON public.gestor_atribuicoes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "gestor_atribuicoes_update" ON public.gestor_atribuicoes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "gestor_atribuicoes_delete" ON public.gestor_atribuicoes
  FOR DELETE TO authenticated USING (true);

-- 6) ADICIONAR COMENTÁRIOS
COMMENT ON TABLE public.gestor_atribuicoes IS 'Vincula gestores a múltiplos processos (setor/cargo/turno)';
COMMENT ON COLUMN public.gestor_atribuicoes.id IS 'ID único da atribuição';
COMMENT ON COLUMN public.gestor_atribuicoes.gestor_id IS 'ID do gestor';
COMMENT ON COLUMN public.gestor_atribuicoes.setor IS 'Setor/Área';
COMMENT ON COLUMN public.gestor_atribuicoes.cargo IS 'Cargo';
COMMENT ON COLUMN public.gestor_atribuicoes.turno IS 'Turno (Manhã, Tarde, Noite)';
COMMENT ON COLUMN public.gestor_atribuicoes.created_at IS 'Data de criação';

-- ============================================================================
-- VERIFICAÇÃO (Execute separadamente se quiser testar)
-- ============================================================================
-- SELECT COUNT(*) as total_atribuicoes FROM public.gestor_atribuicoes;
-- SELECT * FROM public.gestor_atribuicoes LIMIT 10;
-- ============================================================================
