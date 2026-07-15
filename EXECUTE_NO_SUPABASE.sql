-- ============================================================================
-- COPIE E COLE TODO ESTE SCRIPT NO SQL EDITOR DO SUPABASE
-- ============================================================================
-- Este script cria a tabela gestor_atribuicoes para permitir que gestores
-- gerenciem múltiplos processos (setor/cargo/turno) simultaneamente.
-- ============================================================================

-- 1) CRIAR TABELA gestor_atribuicoes
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

-- 2) CRIAR ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS gestor_atribuicoes_gestor_id_idx
  ON public.gestor_atribuicoes(gestor_id);

CREATE INDEX IF NOT EXISTS gestor_atribuicoes_setor_cargo_turno_idx
  ON public.gestor_atribuicoes(setor, cargo, turno);

-- 3) MIGRAR DADOS EXISTENTES (gestores que já têm setor/cargo/turno)
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

-- 5) CREATE RLS POLICIES (Políticas de segurança)
-- Permite que usuários autenticados façam select, insert, update, delete
CREATE POLICY "gestor_atribuicoes_select" ON public.gestor_atribuicoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "gestor_atribuicoes_insert" ON public.gestor_atribuicoes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "gestor_atribuicoes_update" ON public.gestor_atribuicoes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "gestor_atribuicoes_delete" ON public.gestor_atribuicoes
  FOR DELETE TO authenticated USING (true);

-- 6) ADICIONAR COMENTÁRIOS (DOCUMENTAÇÃO)
COMMENT ON TABLE public.gestor_atribuicoes IS 'Vincula um gestor a múltiplos processos (combinações de setor/cargo/turno)';
COMMENT ON COLUMN public.gestor_atribuicoes.gestor_id IS 'ID do gestor';
COMMENT ON COLUMN public.gestor_atribuicoes.setor IS 'Setor/Área onde o gestor atua';
COMMENT ON COLUMN public.gestor_atribuicoes.cargo IS 'Cargo dos colaboradores que o gestor gerencia';
COMMENT ON COLUMN public.gestor_atribuicoes.turno IS 'Turno dos colaboradores que o gestor gerencia';

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
-- Após executar, verifique se a tabela foi criada com sucesso:
-- SELECT * FROM public.gestor_atribuicoes LIMIT 5;
-- ============================================================================
