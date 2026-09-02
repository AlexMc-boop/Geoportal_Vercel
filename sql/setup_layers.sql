-- ============================================================
-- Setup completo de capas del Geoportal del Barrio (Vercel)
-- Ejecutar en: Supabase > SQL Editor
--
-- Este script crea TODAS las tablas que usa el visor:
--   * Columna geom  : geometría PostGIS (SRID original de cada capa)
--   * Columna geojson: se genera SOLA (a partir de geom) en el MISMO SRID
--     de la capa; el front-end aplica su reproyección existente
--     (reproyectarGeometria en js/app.js).
--
-- Después de crear las tablas, inserta tus datos
-- (QGIS, pgAdmin, importador de Supabase o INSERT/UPDATE).
-- ============================================================

-- Extensión PostGIS (si no está activa)
create extension if not exists postgis;

-- ------------------------------------------------------------------
-- Helper: crea una capa de tipo geométrico con columna geojson (mismo SRID)
-- ------------------------------------------------------------------
create or replace function public.fn_crear_capa_capas_geo(
    nombre_tabla text,
    tipo_geom text,      -- 'Point' | 'Polygon' | 'MultiPolygon' | ...
    srid_orig integer
) returns void language plpgsql as $$
begin
    execute format(
        'create table if not exists public.%I (' ||
        '    id bigint generated always as identity primary key,' ||
        '    nombre text,' ||
        '    txt text,' ||
'    geom geometry(%s, %s),' ||
    '    geojson text generated always as ' ||
    '        (st_asgeojson(geom)) stored,' ||
        '    created_at timestamptz not null default now()' ||
        ')', nombre_tabla, tipo_geom, srid_orig);

    execute format(
        'create index if not exists idx_%I_geom on public.%I using gist (geom)',
        nombre_tabla, nombre_tabla);

    execute format(
        'alter table public.%I enable row level security', nombre_tabla);
    execute format(
        'drop policy if exists "Publico puede leer %I" on public.%I',
        nombre_tabla, nombre_tabla);
    execute format(
        'create policy "Publico puede leer %I" on public.%I for select to anon, authenticated using (true)',
        nombre_tabla, nombre_tabla);
    execute format(
        'drop policy if exists "Publico puede insertar %I" on public.%I',
        nombre_tabla, nombre_tabla);
    execute format(
        'create policy "Publico puede insertar %I" on public.%I for insert to anon, authenticated with check (true)',
        nombre_tabla, nombre_tabla);
exception when duplicate_table then
    null;
end; $$;

-- ------------------------------------------------------------------
-- CAPAS DEL VISOR (sincronizadas con CAPAS[] en js/app.js)
-- ------------------------------------------------------------------

-- 1) Zona Urbana (polígono, UTM 17 Sur)
select public.fn_crear_capa_capas_geo('zona_urbana_a', 'MultiPolygon', 32717);

-- 2) Proyecto Mercado (polígono, WGS84)
select public.fn_crear_capa_capas_geo('Proyecto_Mercado1', 'MultiPolygon', 4326);

-- 3) Edificaciones (puntos, UTM 17 Sur)
select public.fn_crear_capa_capas_geo('edificio_p', 'Point', 32717);

-- 4) Poblados (puntos, UTM 17 Sur) — usa columna txt para el gráfico
select public.fn_crear_capa_capas_geo('poblado_p', 'Point', 32717);

-- 5) Comunidades (polígonos, WGS84)
select public.fn_crear_capa_capas_geo('Comunidades', 'MultiPolygon', 4326);

-- 6) Edificios (polígonos, WGS84)
select public.fn_crear_capa_capas_geo('Edificios', 'MultiPolygon', 4326);

-- 7) Mirador (polígono, WGS84)
select public.fn_crear_capa_capas_geo('Mirador', 'MultiPolygon', 4326);

-- 8) P. La Boa (polígono, WGS84)
select public.fn_crear_capa_capas_geo('P_LaBoa', 'MultiPolygon', 4326);

-- 9) Zona Urbana 1 (polígono, WGS84)
select public.fn_crear_capa_capas_geo('ZonaUrbana', 'MultiPolygon', 4326);

-- 10) Zona Urbana 2 (polígono, WGS84)
select public.fn_crear_capa_capas_geo('ZonaUrbana2', 'MultiPolygon', 4326);

-- 11) Comunidades (puntos, UTM 17 Sur)
select public.fn_crear_capa_capas_geo('comunidad_p', 'Point', 32717);

-- Opcional: elimina la función helper tras crear las tablas
-- drop function public.fn_crear_capa_capas_geo(text, text, integer);

-- ============================================================
-- El front-end (js/app.js -> convertirAGeoJSON) usa la columna
-- geojson cuando existe. El geojson generado conserva el SRID
-- de la capa; si ese SRID es 32717, app.js lo reproyecta a 4326.
-- ============================================================

-- ------------------------------------------------------------------
-- Nota: la tabla de reportes_ciudadanos se crea con su propio script:
--   sql/reportes_ciudadanos.sql
-- ------------------------------------------------------------------