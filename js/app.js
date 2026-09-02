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
    tabla: 'poblado_p',
    nombre: 'Poblados',
    tipo: 'punto',
    srid: 32717,
    color: '#0d6efd'
  },
  {
    tabla: 'reportes_ciudadanos',
    nombre: 'Reportes Ciudadanos',
    tipo: 'punto',
    srid: 4326,
    color: '#f39c12'
  },
  {
    tabla: 'Comunidades',
    nombre: 'Comunidades',
    tipo: 'poligono',
    srid: 4326,
    color: '#9b59b6',
    fillOpacity: 0.3
  },
  {
    tabla: 'Edificios',
    nombre: 'Edificios',
    tipo: 'poligono',
    srid: 4326,
    color: '#16a085',
    fillOpacity: 0.35
  },
  {
    tabla: 'Mirador',
    nombre: 'Mirador',
    tipo: 'poligono',
    srid: 4326,
    color: '#e67e22',
    fillOpacity: 0.35
  },
  {
    tabla: 'P_LaBoa',
    nombre: 'P. La Boa',
    tipo: 'poligono',
    srid: 4326,
    color: '#34495e',
    fillOpacity: 0.3
  },
  {
    tabla: 'ZonaUrbana',
    nombre: 'Zona Urbana 1',
    tipo: 'poligono',
    srid: 4326,
    color: '#27ae60',
    fillOpacity: 0.3
  },
  {
    tabla: 'ZonaUrbana2',
    nombre: 'Zona Urbana 2',
    tipo: 'poligono',
    srid: 4326,
    color: '#d35400',
    fillOpacity: 0.3
  },
  {
    tabla: 'comunidad_p',
    nombre: 'Comunidades (puntos)',
    tipo: 'punto',
    srid: 32717,
    color: '#8e44ad'
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
  configurarEstadosReportes();
  configurarBotonPDF();
  configurarBotonGrafico();
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
      if (capaConfig.tabla === 'reportes_ciudadanos') {
        layer.bindPopup(generarPopupReporte(feature));
      } else {
        let popup = `<b>${capaConfig.nombre}</b><hr style="margin: 4px 0;">`;
        Object.keys(feature.properties).forEach(k => {
          if (!k.startsWith('_') && k !== 'geom' && k !== 'geometry' && k !== 'geojson') {
            popup += `<br><b>${k}:</b> ${escapeHTML(feature.properties[k]) ?? 'N/A'}`;
          }
        });
        layer.bindPopup(popup);
      }
    }
  });

  if (capasLeaflet[capaConfig.tabla]) {
    map.removeLayer(capasLeaflet[capaConfig.tabla]);
  }
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
        let msg = 'Error al guardar el reporte.';
        try {
          const datos = await response.json();
          if (datos && datos.error) {
            msg = `Error al guardar el reporte: ${datos.error}`;
          }
        } catch (e) { /* sin body JSON */ }
        mostrarAviso(aviso, msg, 'error');
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

/* ==========================================================================
   GENERAR PDF DE REPORTES
   ========================================================================== */
function configurarBotonPDF() {
  const btn = document.getElementById('btnGenerarPDF');
  if (!btn) return;
  const etiqueta = btn.querySelector('span');

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    if (etiqueta) etiqueta.textContent = 'Generando…';

    try {
      await generarPDFReportes();
    } catch (err) {
      console.error('Error generando PDF:', err);
      alert('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      btn.disabled = false;
      if (etiqueta) etiqueta.textContent = 'Generar PDF';
    }
  });
}

async function generarPDFReportes() {
  const respuesta = await fetch('/api/reportes');
  if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
  const datos = await respuesta.json();
  const lista = Array.isArray(datos) ? datos : [];

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const margenX = 14;
  const anchoTexto = 182;
  const limiteY = 283;
  const camposOcultos = ['geom', 'geometry', 'geojson'];

  let y = 0;

  // Encabezado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(11, 31, 78);
  doc.text('Reportes Ciudadanos', margenX, 16);
  y = 23;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text('Geoportal del Barrio · UTPL 2026 · Especialidad SIG', margenX, y); y += 5;
  doc.text('Fecha de generación: ' + new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }), margenX, y); y += 5;
  doc.text('Total de reportes: ' + lista.length, margenX, y); y += 4;

  doc.setDrawColor(200, 205, 215);
  doc.setLineWidth(0.4);
  doc.line(margenX, y, 210 - margenX, y);
  y += 8;

  if (lista.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(120, 120, 120);
    doc.text('No hay reportes registrados.', margenX, y);
  } else {
    lista.forEach((reporte, idx) => {
      const bloques = [];

      bloques.push({ tipo: 'titulo', texto: 'Reporte #' + (idx + 1) });

      Object.keys(reporte).forEach(k => {
        if (camposOcultos.includes(k)) return;
        let v = reporte[k];
        if (v === null || v === undefined || v === '') v = '—';
        const etiqueta = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const lineas = doc.splitTextToSize(etiqueta + ': ' + v, anchoTexto);
        bloques.push({ tipo: 'campo', lineas });
      });

      const altoBloque = bloques.reduce((acc, b) => {
        if (b.tipo === 'titulo') return acc + 8;
        return acc + b.lineas.length * 5;
      }, 0);

      if (y + altoBloque > limiteY) {
        doc.addPage();
        y = 16;
      }

      bloques.forEach(b => {
        if (b.tipo === 'titulo') {
          if (y > limiteY - 4) { doc.addPage(); y = 16; }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(11, 31, 78);
          doc.text(b.texto, margenX, y);
          y += 8;
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(60, 60, 60);
          b.lineas.forEach(linea => {
            if (y > limiteY - 4) { doc.addPage(); y = 16; }
            doc.text(linea, margenX, y);
            y += 5;
          });
        }
      });

      y += 4;
    });
  }

  doc.save('reportes_ciudadanos_' + new Date().toISOString().slice(0, 10) + '.pdf');
}

/* ==========================================================================
   CAMBIO DE ESTADO DE REPORTES DESDE EL MAPA
   ========================================================================== */
function escapeHTML(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generarPopupReporte(feature) {
  const p = feature.properties || {};
  const id = escapeHTML(p.id);
  const estadoActual = p.estado || 'pendiente';
  const estados = ['pendiente', 'trabajando', 'completado'];

  let html = `<b>Reporte #${id}</b><hr style="margin: 4px 0;">`;
  html += `<b>Problema:</b> ${escapeHTML(p.problema)}<br>`;
  html += `<b>Comentario:</b> ${escapeHTML(p.comentario)}<br>`;
  if (p.lat !== undefined && p.lon !== undefined) {
    html += `<b>Lat:</b> ${escapeHTML(p.lat)} <b>Lon:</b> ${escapeHTML(p.lon)}<br>`;
  }
  html += `<b>Estado:</b> <span id="estadoActual">${escapeHTML(estadoActual)}</span><br>`;
  html += `<div class="popup-estados">`;
  estados.forEach(e => {
    const esActual = e === estadoActual;
    html += `<button type="button" class="btn-estado${esActual ? ' activo' : ''}" data-id="${id}" data-estado="${e}"${esActual ? ' disabled' : ''}>${e}</button>`;
  });
  html += `</div>`;
  html += `<div id="estadoMsj" class="estado-msj"></div>`;
  return html;
}

function configurarEstadosReportes() {
  map.on('popupopen', () => {
    const contenedor = document.querySelector('.leaflet-popup-content');
    if (!contenedor) return;

    contenedor.querySelectorAll('.btn-estado').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        L.DomEvent.stopPropagation(e);
        btn.disabled = true;

        const id = btn.dataset.id;
        const estado = btn.dataset.estado;
        const estadoEl = contenedor.querySelector('#estadoActual');
        const msj = contenedor.querySelector('#estadoMsj');

        try {
          await actualizarEstadoReporte(id, estado);

          if (estadoEl) estadoEl.textContent = estado;
          contenedor.querySelectorAll('.btn-estado').forEach(b => {
            b.classList.remove('activo');
            b.disabled = false;
          });
          btn.classList.add('activo');
          btn.disabled = true;
          if (msj) {
            msj.textContent = '✓ Estado actualizado';
            msj.className = 'estado-msj ok';
          }
          actualizarContadorReportes();
        } catch (err) {
          console.error('Error al actualizar estado:', err);
          btn.disabled = false;
          if (msj) {
            msj.textContent = '✗ No se pudo actualizar';
            msj.className = 'estado-msj error';
          }
        }
      });
    });
  });
}

async function actualizarEstadoReporte(id, estado) {
  const respuesta = await fetch(`${API_BASE}/reportes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id), estado })
  });
  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(texto || ('HTTP ' + respuesta.status));
  }
  return respuesta.json();
}

async function actualizarContadorReportes() {
  const cntEl = document.getElementById('cnt-reportes_ciudadanos');
  if (!cntEl) return;
  try {
    const capaConfig = CAPAS.find(c => c.tabla === 'reportes_ciudadanos');
    const response = await fetch(`${API_BASE}/layers?tabla=reportes_ciudadanos`);
    if (!response.ok) return;
    const datos = await response.json();
    const geojson = convertirAGeoJSON(datos, capaConfig);
    cntEl.textContent = geojson.features.length;
  } catch (err) {
    console.error('Error actualizando contador:', err);
  }
}

/* ==========================================================================
   GRÁFICO DE POBLADOS
   ========================================================================== */
function configurarBotonGrafico() {
  const btn = document.getElementById('btnGenerarGrafico');
  const cerrar = document.getElementById('btnCerrarGrafico');
  const descargar = document.getElementById('btnDescargarGrafico');
  const modal = document.getElementById('modalGrafico');
  if (!btn || !modal) return;

  const etiqueta = btn.querySelector('span');

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    if (etiqueta) etiqueta.textContent = 'Cargando…';

    try {
      await abrirGraficoPoblados();
    } catch (err) {
      console.error('Error generando gráfico:', err);
      alert('No se pudo generar el gráfico. Intenta de nuevo.');
    } finally {
      btn.disabled = false;
      if (etiqueta) etiqueta.textContent = 'Gráfico de Poblados';
    }
  });

  if (cerrar) cerrar.addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.hidden = true;
  });
  if (descargar) descargar.addEventListener('click', descargarGrafico);
}

async function abrirGraficoPoblados() {
  const modal = document.getElementById('modalGrafico');
  const canvas = document.getElementById('canvasGrafico');
  if (!modal || !canvas) return;

  modal.hidden = false;

  const respuesta = await fetch(`${API_BASE}/layers?tabla=poblado_p`);
  if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
  const datos = await respuesta.json();
  const lista = Array.isArray(datos) ? datos : [];

  const conteo = {};
  lista.forEach((p) => {
    const clave = (p.txt && String(p.txt).trim()) || 'Sin categoría';
    conteo[clave] = (conteo[clave] || 0) + 1;
  });

  const etiquetas = Object.keys(conteo).sort((a, b) => conteo[b] - conteo[a]);
  const valores = etiquetas.map((k) => conteo[k]);

  if (window.graficoPoblados) window.graficoPoblados.destroy();
  window.graficoPoblados = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: etiquetas,
      datasets: [{
        label: 'Número de poblados',
        data: valores,
        backgroundColor: 'rgba(13, 110, 253, 0.85)',
        borderColor: '#123a8f',
        borderWidth: 1.5,
        borderRadius: 6,
        maxBarThickness: 90
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y} poblado(s)`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: 'Cantidad' }
        },
        x: {
          ticks: { autoSkip: false },
          title: { display: true, text: 'Categoría' }
        }
      }
    }
  });
}

function descargarGrafico() {
  const canvas = document.getElementById('canvasGrafico');
  if (!canvas) return;
  const enlace = document.createElement('a');
  enlace.download = `grafico_poblados_${new Date().toISOString().slice(0, 10)}.png`;
  enlace.href = canvas.toDataURL('image/png');
  enlace.click();
}
