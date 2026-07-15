-- Modulo 6x1: rode este script no SQL Editor do Supabase do projeto rpyejdtxsuodagbvakhw.
-- Enquanto as tabelas nao existirem, o app continua via cache local (seed).

create table if not exists public.escala_colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text not null unique,
  cargo text, setor text, supervisor text,
  admissao date not null,
  aceita_domingo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Migração para bases já criadas:
alter table public.escala_colaboradores
  add column if not exists aceita_domingo boolean not null default false;
grant select, insert, update, delete on public.escala_colaboradores to authenticated;
grant all on public.escala_colaboradores to service_role;
alter table public.escala_colaboradores enable row level security;
drop policy if exists "escala_colab_rw" on public.escala_colaboradores;
create policy "escala_colab_rw" on public.escala_colaboradores for all to authenticated using (true) with check (true);

create table if not exists public.escala_dias (
  colaborador_id uuid not null references public.escala_colaboradores(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('trabalho','folga','compensatoria','feriado','vazio')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (colaborador_id, data)
);
create index if not exists escala_dias_data_idx on public.escala_dias (data);
grant select, insert, update, delete on public.escala_dias to authenticated;
grant all on public.escala_dias to service_role;
alter table public.escala_dias enable row level security;
drop policy if exists "escala_dias_rw" on public.escala_dias;
create policy "escala_dias_rw" on public.escala_dias for all to authenticated using (true) with check (true);

create table if not exists public.escala_feriados (
  data date primary key,
  descricao text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.escala_feriados to authenticated;
grant all on public.escala_feriados to service_role;
alter table public.escala_feriados enable row level security;
drop policy if exists "escala_feriados_rw" on public.escala_feriados;
create policy "escala_feriados_rw" on public.escala_feriados for all to authenticated using (true) with check (true);
