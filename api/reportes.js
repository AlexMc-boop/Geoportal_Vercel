/* ============================================================
   Función serverless (Vercel): reportes ciudadanos
   Las credenciales se leen SOLO desde variables de entorno.
   GET   /api/reportes        -> lista de reportes
   POST  /api/reportes        -> guarda un nuevo reporte
   PATCH /api/reportes        -> actualiza el estado de un reporte
   ============================================================ */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const TABLA = 'reportes_ciudadanos';
const CAMPOS_PERMITIDOS = [
  'problema',
  'comentario',
  'lat',
  'lon',
  'titulo',
  'descripcion',
  'x',
  'y',
  'latitude',
  'longitude'
];
const ESTADOS_VALIDOS = ['pendiente', 'trabajando', 'completado'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'Faltan variables de entorno SUPABASE_URL / SUPABASE_ANON_KEY' });
    return;
  }

  const restUrl = `${SUPABASE_URL}/rest/v1/${TABLA}`;

  if (req.method === 'GET') {
    try {
      const resp = await fetch(`${restUrl}?select=*&limit=500`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      res.status(resp.status).json(await resp.json());
    } catch (err) {
      console.error('Error consultando reportes:', err);
      res.status(502).json({ error: 'Error al consultar reportes' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = (typeof req.body === 'object' && req.body) ? req.body : {};
      const campos = {};
      for (const k of Object.keys(body)) {
        if (CAMPOS_PERMITIDOS.includes(k)) campos[k] = body[k];
      }

      if (Object.keys(campos).length === 0) {
        res.status(400).json({ error: 'Cuerpo de la solicitud vacío o inválido' });
        return;
      }

      const resp = await fetch(restUrl, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(campos)
      });

      if (resp.ok) {
        res.status(201).json({ ok: true });
      } else {
        const texto = await resp.text();
        console.error('Supabase rechazó el reporte:', texto);
        res.status(resp.status).json({ error: texto });
      }
    } catch (err) {
      console.error('Error guardando reporte:', err);
      res.status(502).json({ error: 'Error al guardar el reporte' });
    }
    return;
  }

  if (req.method === 'PATCH') {
    try {
      const body = (typeof req.body === 'object' && req.body) ? req.body : {};
      const id = Number(body.id);
      const estado = body.estado;

      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'id inválido' });
        return;
      }
      if (!estado || !ESTADOS_VALIDOS.includes(estado)) {
        res.status(400).json({ error: 'estado inválido' });
        return;
      }

      const resp = await fetch(`${restUrl}?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ estado })
      });

      if (resp.ok) {
        const actualizado = await resp.json();
        if (Array.isArray(actualizado) && actualizado.length > 0) {
          res.status(200).json({ ok: true, reporte: actualizado[0] });
        } else {
          res.status(404).json({ error: 'Reporte no encontrado' });
        }
      } else {
        const texto = await resp.text();
        console.error('Supabase rechazó la actualización:', texto);
        res.status(resp.status).json({ error: texto });
      }
    } catch (err) {
      console.error('Error actualizando reporte:', err);
      res.status(502).json({ error: 'Error al actualizar el reporte' });
    }
    return;
  }

  res.status(405).json({ error: 'Método no permitido' });
};
