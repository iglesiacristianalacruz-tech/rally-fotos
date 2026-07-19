create extension if not exists pgcrypto;

create table if not exists public.teams (
  name text primary key,
  pin text not null default '',
  created_at timestamptz not null default now()
);

alter table public.teams add column if not exists pin text not null default '';

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  position integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  team_name text not null references public.teams(name) on update cascade on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  item_version integer not null default 1,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  unique (team_name, item_id)
);

create index if not exists photos_team_name_idx on public.photos(team_name);
create index if not exists photos_item_id_idx on public.photos(item_id);

alter table public.photos drop constraint if exists photos_team_name_fkey;
alter table public.photos
  add constraint photos_team_name_fkey
  foreign key (team_name)
  references public.teams(name)
  on update cascade
  on delete cascade;

alter table public.teams enable row level security;
alter table public.items enable row level security;
alter table public.photos enable row level security;

drop policy if exists "event app can use teams" on public.teams;
drop policy if exists "event app can use items" on public.items;
drop policy if exists "event app can use photos" on public.photos;

-- ponytail: permissive policies keep the static MVP backend-free; move admin writes to Edge Functions before using this on a public/untrusted event.
create policy "event app can use teams"
on public.teams for all
to anon, authenticated
using (true)
with check (true);

create policy "event app can use items"
on public.items for all
to anon, authenticated
using (true)
with check (true);

create policy "event app can use photos"
on public.photos for all
to anon, authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('team-photos', 'team-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "event app can read team photos" on storage.objects;
drop policy if exists "event app can upload team photos" on storage.objects;
drop policy if exists "event app can delete team photos" on storage.objects;

create policy "event app can read team photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'team-photos');

create policy "event app can upload team photos"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'team-photos');

create policy "event app can delete team photos"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'team-photos');

insert into public.items (title, position)
select title, position
from (
  values
    ('Alguien leyendo la Biblia mientras todos los demás hacen una pose dramática.', 1),
    ('Todo el equipo haciendo la misma pose que el pastor.', 2),
    ('Todo el equipo sonriendo y nadie tenga los ojos cerrados.', 3),
    ('Con todo el equipo de cocina haciendo un corazón con las manos.', 4),
    ('Todo el equipo formando la palabra CAOS usando únicamente sus cuerpos.', 5),
    ('Foto formando una pirámide humana (segura).', 6),
    ('Foto de todos saltando exactamente al mismo tiempo, en el aire.', 7),
    ('Foto recreando un milagro de Jesús.', 8),
    ('Foto donde aparezca un letrero de C.A.O.S camp.', 9),
    ('Foto donde aparezcan al menos 2 personas de un equipo rival.', 10),
    ('Mayor cantidad de personas en una SELFIE.', 11),
    ('Foto en el lugar más bonito de todo el campamento.', 12),
    ('Foto en el lugar más alto de el campamento. (LA TORRE NO CUENTA)', 13)
) as seed(title, position)
where not exists (select 1 from public.items);
