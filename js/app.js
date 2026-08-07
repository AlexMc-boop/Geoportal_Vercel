/* ==========================================================================
   Manejo de Errores Globales (Extensiones y Promesas)
   ========================================================================== */
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && event.reason.message.includes('Tabs cannot be edited')) {
    event.preventDefault();
    return;
  }
});

/* ==========================================================================
   CONFIGURACIÓN Y PROYECCIONES
   ========================================================================== */
proj4.defs('EPSG:32717', '+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs');

// Las credenciales viven en las variables de entorno del servidor (Vercel).
// El navegador solo habla con las funciones serverless /api/*
const API_BASE = '/api';

const CAPAS = [
  {
    tabla: 'zona_urbana_a',
    nombre: 'Zona Urbana',
    tipo: 'poligono',
    srid: 32717,
    color: '#e74c3c',
    fillOpacity: 0.25
  },
  {
    tabla: 'Proyecto_Mercado1',
    nombre: 'Proyecto Mercado',
    tipo: 'poligono',
    srid: 4326,
    color: '#3498db',
    fillOpacity: 0.5
  },
  {
    tabla: 'edificio_p',
    nombre: 'Edificaciones',
    tipo: 'punto',
    srid: 32717,
    color: '#2ecc71'
  },
  {
    tabla: 'reportes_ciudadanos',
    nombre: 'Reportes Ciudadanos',
    tipo: 'punto',
    srid: 4326,
    color: '#f39c12'
  }
];

/* ==========================================================================
   VARIABLES GLOBALES
   ========================================================================== */
let map;
let baseLayers = {};
const capasLeaflet = {};
let markerReporte = null;
let coordsSeleccionadas = null;

/* ==========================================================================
   INICIALIZACIÓN
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  inicializarMapa();
  configurarBasemapSwitch();
  construirPanelLeyenda();
  cargarCapas();
  configurarEventosReporte();
});

function inicializarMapa() {
  map = L.map('map').setView([-3.626, -78.583], 15);

  const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  });

  const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles © Esri'
  });

  calles.addTo(map);

  baseLayers = {
    calles: calles,
    satelite: satelite
  };
}

/* ==========================================================================
   CAMBIO DE MAPA BASE
   ========================================================================== */
function configurarBasemapSwitch() {
  const contenedor = document.getElementById('basemapSwitch');
  if (!contenedor) return;

  const botones = contenedor.querySelectorAll('button');
  botones.forEach(btn => {
    btn.addEventListener('click', () => {
      const basemapKey = btn.getAttribute('data-basemap');
      if (!baseLayers[basemapKey]) return;

      botones.forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');

      Object.values(baseLayers).forEach(layer => map.removeLayer(layer));
      baseLayers[basemapKey].addTo(map);
    });
  });
}

/* ==========================================================================
   CONSTRUCCIÓN DINÁMICA DE LEYENDA Y SWITCHES
   ========================================================================== */
function construirPanelLeyenda() {
  const contenedorLeyenda = document.getElementById('leyenda');
  if (!contenedorLeyenda) return;

  contenedorLeyenda.innerHTML = '';

  CAPAS.forEach(capaConfig => {
    const item = document.createElement('div');
    item.className = 'leyenda-item';

    const esPunto = capaConfig.tipo === 'punto' ? ' punto' : '';

    item.innerHTML = `
      <span class="muestra${esPunto}" style="background-color: ${capaConfig.color};"></span>
      <span class="capa-nombre">${capaConfig.nombre}</span>
      <span class="capa-contador" id="cnt-${capaConfig.tabla}">0</span>
      <button type="button" class="toggle activo" id="btn-toggle-${capaConfig.tabla}" aria-label="Conmutar ${capaConfig.nombre}"></button>
    `;

    contenedorLeyenda.appendChild(item);

    const btnToggle = item.querySelector('.toggle');
    btnToggle.addEventListener('click', () => {
      const capa = capasLeaflet[capaConfig.tabla];
      const estaActivo = btnToggle.classList.contains('activo');

      if (estaActivo) {
        btnToggle.classList.remove('activo');
        if (capa && map.hasLayer(capa)) map.removeLayer(capa);
      } else {
        btnToggle.classList.add('activo');
        if (capa && !map.hasLayer(capa)) map.addLayer(capa);
      }
    });
  });
}

/* ==========================================================================
   CARGA Y REPROYECCIÓN DE CAPAS (SUPABASE)
   ========================================================================== */
async function cargarCapas() {
  const estadoGlobal = document.getElementById('estadoGlobal');

  for (const capaConfig of CAPAS) {
    try {
      const response = await fetch(`${API_BASE}/layers?tabla=${encodeURIComponent(capaConfig.tabla)}`);

      if (!response.ok) continue;

      const datos = await response.json();
      const geojson = convertirAGeoJSON(datos, capaConfig);

      const cntEl = document.getElementById(`cnt-${capaConfig.tabla}`);
      if (cntEl) {
        cntEl.textContent = geojson.features.length;
      }

      if (geojson.features.length > 0) {
        renderizarCapa(capaConfig, geojson);
      }
    } catch (err) {
      console.error(`Error cargando ${capaConfig.tabla}:`, err);
    }
  }

  if (estadoGlobal) {
    estadoGlobal.classList.add('bien');
    const textoEstado = estadoGlobal.querySelector('span:last-child');
    if (textoEstado) textoEstado.textContent = 'Capas cargadas';
  }
}

function convertirAGeoJSON(datos, capaConfig) {
  const features = [];
  datos.forEach(row => {
    let geometry = null;
    
    const rawGeom = row.geojson || row.geom || row.geometry;
    if (rawGeom) {
      try {
        const parsed = typeof rawGeom === 'string' ? JSON.parse(rawGeom) : rawGeom;
        if (parsed && parsed.coordinates) {
          geometry = reproyectarGeometria(parsed, capaConfig.srid);
        }
      } catch (e) {
        console.error("Error al parsear geometría:", e);
      }
    }

    if (!geometry) {
      const posX = row.x ?? row.coord_x ?? row.lon ?? row.longitude;
      const posY = row.y ?? row.coord_y ?? row.lat ?? row.latitude;

      if (posX !== undefined && posY !== undefined && posX !== null && posY !== null) {
        const x = parseFloat(posX);
        const y = parseFloat(posY);
        if (!isNaN(x) && !isNaN(y)) {
          if (capaConfig.srid === 32717 && typeof proj4 !== 'undefined') {
            const conv = proj4("EPSG:32717", "EPSG:4326", [x, y]);
            geometry = { type: "Point", coordinates: [conv[0], conv[1]] };
          } else {
            geometry = { type: "Point", coordinates: [x, y] };
          }
        }
      }
    }

    if (geometry) {
      features.push({ type: "Feature", geometry, properties: row });
    }
  });
  return { type: "FeatureCollection", features };
}

function reproyectarGeometria(geom, srid) {
  if (srid !== 32717 || typeof proj4 === 'undefined') return geom;
  const transform = (c) => proj4("EPSG:32717", "EPSG:4326", [c[0], c[1]]);

  if (geom.type === "Point") return { ...geom, coordinates: transform(geom.coordinates) };
  if (geom.type === "Polygon") {
    return { ...geom, coordinates: geom.coordinates.map(ring => ring.map(transform)) };
  }
  if (geom.type === "MultiPolygon") {
    return { ...geom, coordinates: geom.coordinates.map(polygon => polygon.map(ring => ring.map(transform))) };
  }
  return geom;
}

function renderizarCapa(capaConfig, geojson) {
  const estilo = {
    color: capaConfig.color,
    fillColor: capaConfig.color,
    fillOpacity: capaConfig.fillOpacity || 0.4,
    weight: 2
  };

  const capa = L.geoJSON(geojson, {
    style: () => capaConfig.tipo !== 'punto' ? estilo : null,
    pointToLayer: (feature, latlng) => {
      if (capaConfig.tipo === 'punto') {
        return L.circleMarker(latlng, { radius: 6, ...estilo, fillOpacity: 0.9 });
      }
      return L.marker(latlng);
    },
    onEachFeature: (feature, layer) => {
      let popup = `<b>${capaConfig.nombre}</b><hr style="margin: 4px 0;">`;
      Object.keys(feature.properties).forEach(k => {
        if (!k.startsWith('_') && k !== 'geom' && k !== 'geometry' && k !== 'geojson') {
          popup += `<br><b>${k}:</b> ${feature.properties[k] ?? 'N/A'}`;
        }
      });
      layer.bindPopup(popup);
    }
  });

  capa.addTo(map);
  capasLeaflet[capaConfig.tabla] = capa;
}

/* ==========================================================================
   FORMULARIO Y ENVÍO DE REPORTES
   ========================================================================== */
function configurarEventosReporte() {
  const tarjetaReporte = document.getElementById('tarjetaReporte');
  const btnAbrir = document.getElementById('btnAbrirReporte');
  const btnCerrar = document.getElementById('btnCerrarReporte');
  const btnEnviar = document.getElementById('btnEnviarReporte');
  const reporteCoords = document.getElementById('reporteCoords');
  const aviso = document.getElementById('reporteAviso');

  btnAbrir?.addEventListener('click', () => { tarjetaReporte.hidden = false; });
  btnCerrar?.addEventListener('click', () => { tarjetaReporte.hidden = true; });

  map.on('click', (e) => {
    if (tarjetaReporte && tarjetaReporte.hidden === false) {
      coordsSeleccionadas = e.latlng;

      if (markerReporte) {
        markerReporte.setLatLng(coordsSeleccionadas);
      } else {
        markerReporte = L.marker(coordsSeleccionadas).addTo(map);
      }

      if (reporteCoords) {
        reporteCoords.textContent = `${coordsSeleccionadas.lat.toFixed(5)}, ${coordsSeleccionadas.lng.toFixed(5)}`;
        reporteCoords.classList.add('ok');
      }
    }
  });

  btnEnviar?.addEventListener('click', async () => {
    const problemaSelect = document.getElementById('reporteProblema');
    const comentarioText = document.getElementById('reporteComentario');

    const problema = problemaSelect?.value;
    const comentario = comentarioText?.value;

    if (!coordsSeleccionadas) {
      mostrarAviso(aviso, 'Por favor, haz clic en el mapa para ubicar el problema.', 'error');
      return;
    }

    if (!problema) {
      mostrarAviso(aviso, 'Selecciona un tipo de problema.', 'error');
      return;
    }

    if (!comentario || comentario.length < 10) {
      mostrarAviso(aviso, 'La observación debe tener al menos 10 caracteres.', 'error');
      return;
    }

    const payload = {
      problema,
      comentario,
      lat: coordsSeleccionadas.lat,
      lon: coordsSeleccionadas.lng
    };

    try {
      btnEnviar.disabled = true;
      btnEnviar.textContent = 'Enviando…';

      const response = await fetch(`${API_BASE}/reportes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        mostrarAviso(aviso, '¡Reporte enviado exitosamente!', 'exito');
        problemaSelect.value = '';
        comentarioText.value = '';
        if (markerReporte) map.removeLayer(markerReporte);
        markerReporte = null;
        coordsSeleccionadas = null;
        reporteCoords.textContent = 'Sin ubicación seleccionada';
        reporteCoords.classList.remove('ok');

        cargarCapas();
      } else {
        mostrarAviso(aviso, 'Error al guardar el reporte.', 'error');
      }
    } catch (err) {
      console.error(err);
      mostrarAviso(aviso, 'Error de conexión.', 'error');
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar reporte';
    }
  });
}

function mostrarAviso(el, mensaje, tipo) {
  if (!el) return;
  el.textContent = mensaje;
  el.className = `aviso ${tipo}`;
}
