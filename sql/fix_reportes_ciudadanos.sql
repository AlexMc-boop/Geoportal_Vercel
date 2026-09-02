-- ============================================================
-- CORRECCIÓN DE LA TABLA reportes_ciudadanos
-- Ejecutar en: Supabase > SQL Editor
--
--  ¿Qué pasó?: la tabla quedó con columnas de DOS esquemas
--  (problema/titulo/descripcion/x/y/latitude/longitude) y le
--  faltan las que el visor envía (comentario, lat, lon).
--  El INSERT falla y el reporte no se guarda.
--
--  Solución: se elimina y se vuelve a crear con el esquema
--  correcto. ANTES de ejecutar, revisa si tienes reportes:
--     select count(*) from public.reportes_ciudadanos;
--  Si hay datos y los necesitas, contacta antes de borrar.
-- ============================================================

create extension if not exists postgis;

-- Elimina la tabla actual (incluye columnas inconsistentes y datos)
drop table if exists public.reportes_ciudadanos;

-- Recrea con el esquema canónico del visor
create table public.reportes_ciudadanos (
    id          bigint generated always as identity primary key,
    created_at  timestamptz not null default now(),
    problema    text not null,
    comentario  text not null default '',
    lat         double precision not null,
    lon         double precision not null,
    geom        geometry(Point, 4326)
                generated always as (st_setsrid(st_makepoint(lon, lat), 4326)) stored,
    estado      text not null default 'pendiente'
                check (estado in ('pendiente', 'en_revision', 'atendido', 'cerrado')),
    constraint chk_reportes_problema check (
        problema in (
            'Baches',
            'Alumbrado público',
            'Recolección de basura',
            'Agua potable',
            'Alcantarillado',
            'Señalización vial',
            'Semáforos',
            'Parques y espacios públicos',
            'Inseguridad',
            'Otro'
        )
    )
);

create index if not exists idx_reportes_ciudadanos_geom
    on public.reportes_ciudadanos using gist (geom);

create index if not exists idx_reportes_ciudadanos_estado
    on public.reportes_ciudadanos (estado);

alter table public.reportes_ciudadanos enable row level security;

drop policy if exists "Ciudadanos pueden insertar reportes" on public.reportes_ciudadanos;
create policy "Ciudadanos pueden insertar reportes"
    on public.reportes_ciudadanos
    for insert
    to anon, authenticated
    with check (true);

drop policy if exists "Cualquiera puede ver reportes" on public.reportes_ciudadanos;
create policy "Cualquiera puede ver reportes"
    on public.reportes_ciudadanos
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Administración gestiona reportes" on public.reportes_ciudadanos;
create policy "Administración gestiona reportes"
    on public.reportes_ciudadanos
    for update
    to authenticated
    using (true);