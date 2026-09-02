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
const ESTADOS_VALIDOS = ['pendiente', 'en_revision', 'atendido', 'cerrado', 'trabajando', 'completado'];

function interpretarBody(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function numero(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Normaliza los campos (acepta el esquema moderno problema/comentario/lat/lon
// y el heredado titulo/descripcion/latitude/longitude/x/y) hacia el canónico.
function normalizarReporte(body) {
  const reporte = {
    problema: String(body.problema || body.titulo || '').trim(),
    comentario: String(body.comentario ?? body.descripcion ?? '').trim()
  };
  const lat = numero(body.lat ?? body.latitude);
  const lon = numero(body.lon ?? body.longitude);
  if (lat !== undefined && lon !== undefined) {
    reporte.lat = lat;
    reporte.lon = lon;
  }
  return reporte;
}

function extraerCodigoError(texto) {
  try {
    const obj = JSON.parse(texto);
    return obj && obj.code ? String(obj.code) : null;
  } catch (e) {
    return null;
  }
}

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
      const body = interpretarBody(req.body);
      const reporte = normalizarReporte(body);

      if (!reporte.problema) {
        res.status(400).json({ error: 'Debes indicar el problema.' });
        return;
      }
      if (!reporte.comentario || reporte.comentario.length < 10) {
        res.status(400).json({ error: 'La observación debe tener al menos 10 caracteres.' });
        return;
      }
      if (reporte.lat === undefined || reporte.lon === undefined) {
        res.status(400).json({ error: 'Haz clic en el mapa para ubicar el problema.' });
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
        body: JSON.stringify(reporte)
      });

      if (resp.ok) {
        res.status(201).json({ ok: true });
        return;
      }

      const texto = await resp.text();
      const codigo = extraerCodigoError(texto);

      if (codigo === 'PGRST204') {
        // La tabla aún no tiene alguna columna del esquema canónico:
        // se informa el error real para guiar la corrección (sql/fix_reportes_ciudadanos.sql).
        res.status(409).json({
          error: 'La tabla reportes_ciudadanos no tiene el esquema esperado. Ejecuta sql/fix_reportes_ciudadanos.sql en Supabase.',
          detalle: texto
        });
        return;
      }

      res.status(resp.status).json({ error: texto || 'Supabase rechazó el reporte.' });
    } catch (err) {
      console.error('Error guardando reporte:', err);
      res.status(502).json({
        error: 'Error al guardar el reporte',
        detalle: String((err && err.message) || err),
        stack: String((err && err.stack) || '')
      });
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
