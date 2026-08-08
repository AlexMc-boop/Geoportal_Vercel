/* ============================================================
   Función serverless (Vercel): proxy de capas geográficas
   Las credenciales se leen SOLO desde variables de entorno
   (NUNCA se exponen en el código del navegador).
   Endpoint: GET /api/layers?tabla=zona_urbana_a
   ============================================================ */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const TABLAS_PERMITIDAS = [
  'zona_urbana_a',
  'Proyecto_Mercado1',
  'edificio_p',
  'poblado_p',
  'reportes_ciudadanos',
  'Comunidades',
  'Edificios',
  'Mirador',
  'P_LaBoa',
  'ZonaUrbana',
  'ZonaUrbana2',
  'comunidad_p'
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'Faltan variables de entorno SUPABASE_URL / SUPABASE_ANON_KEY' });
    return;
  }

  const tabla = req.query.tabla;
  if (!tabla || !TABLAS_PERMITIDAS.includes(tabla)) {
    res.status(400).json({ error: 'Tabla no permitida' });
    return;
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?select=*`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const datos = await resp.json();
    res.status(resp.status).json(datos);
  } catch (err) {
    console.error(`Error consultando capa ${tabla}:`, err);
    res.status(502).json({ error: 'Error consultando la fuente de datos' });
  }
};
