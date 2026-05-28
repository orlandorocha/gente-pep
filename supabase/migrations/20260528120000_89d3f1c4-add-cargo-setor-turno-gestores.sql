-- 1) Adiciona setor, turno e cargo em gestores
alter table public.gestores
  add column if not exists setor text,
  add column if not exists turno public.turno_enum,
  add column if not exists cargo text;

-- 2) Remove constraints/índices únicos antigos em nome/email isolados
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.gestores'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('alter table public.gestores drop constraint %I', r.conname);
  END LOOP;
END $$;

drop index if exists public.gestores_nome_key;
drop index if exists public.gestores_email_key;
drop index if exists public.gestores_nome_idx;
drop index if exists public.gestores_email_idx;

drop index if exists public.gestores_nome_setor_turno_uniq;
drop index if exists public.gestores_email_setor_turno_uniq;

-- 3) Unique composto: mesmo nome/email pode existir em setor+cargo+turno diferentes
create unique index if not exists gestores_nome_setor_cargo_turno_uniq
  on public.gestores (lower(nome), coalesce(setor,''), coalesce(cargo,''), coalesce(turno,''));

create unique index if not exists gestores_email_setor_cargo_turno_uniq
  on public.gestores (lower(email), coalesce(setor,''), coalesce(cargo,''), coalesce(turno,''))
  where email is not null and email <> '';

-- 4) Backfill: para gestores existentes que já têm colaboradores vinculados,
--    preenche setor/cargo/turno com o setor+cargo+turno mais frequente entre eles
update public.gestores g
set
  setor = sub.area,
  cargo = sub.cargo,
  turno = sub.turno
from (
  select distinct on (gestor_id)
    gestor_id,
    area,
    cargo,
    turno,
    count(*) as qtd
  from public.colaboradores
  where gestor_id is not null
  group by gestor_id, area, cargo, turno
  order by gestor_id, count(*) desc
) sub
where g.id = sub.gestor_id
  and (g.setor is null or g.turno is null or g.cargo is null);
