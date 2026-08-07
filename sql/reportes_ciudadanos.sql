-- ============================================================
-- Tabla de reportes ciudadanos con geometría de punto automática
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- Extensión PostGIS (si no está activa)
create extension if not exists postgis;

-- ------------------------------------------------------------------
-- Tabla: reportes_ciudadanos
-- La columna `geom` se genera SOLA a partir de lat/lon
-- (ST_MakePoint(lon, lat) + ST_SetSRID 4326) => capa de puntos GeoJSON
-- ------------------------------------------------------------------
create table if not exists public.reportes_ciudadanos (
    id          bigint generated always as identity primary key,
    created_at  timestamptz not null default now(),
    problema    text not null,
    comentario  text not null default '',
    lat         double precision not null,
    lon         double precision not null,
    -- Generación automática de la geometría de punto (EPSG:4326)
    geom        geometry(Point, 4326)
                generated always as (st_setsrid(st_makepoint(lon, lat), 4326)) stored,
    estado      text not null default 'pendiente'
                check (estado in ('pendiente', 'en_revision', 'atendido', 'cerrado')),
    -- Lista de problemas permitidos (debe coincidir con el formulario)
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

-- Índice espacial (búsquedas por zona y capa en el visor)
create index if not exists idx_reportes_ciudadanos_geom
    on public.reportes_ciudadanos using gist (geom);

-- Índice por estado (filtros de la administración)
create index if not exists idx_reportes_ciudadanos_estado
    on public.reportes_ciudadanos (estado);

-- ------------------------------------------------------------------
-- Seguridad (Row Level Security)
--   - Cualquier ciudadano (anon) puede INSERTAR y LEER
--   - Solo usuarios autenticados (administración) pueden actualizar
-- ------------------------------------------------------------------
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
