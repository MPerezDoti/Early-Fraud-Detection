// ════════════════════════════════════════════════════════════════════════
// HERRAMIENTA DE UMBRAL — Detección de Fraude
// ════════════════════════════════════════════════════════════════════════

let DATA = null;          // contenido completo de umbral_export.json
let PUNTOS = null;        // array de 1001 puntos (umbral 0.000 a 1.000)
let currentUmbral = 0.7;

const COLORS = {
  precision: '#457B9D',
  sensibilidad: '#E63946',
  f1: '#B8860B',
  navy: '#1E2761'
};

// ── CARGA DE DATOS ──────────────────────────────────────────────────────
async function cargarDatos() {
  try {
    const resp = await fetch('umbral_export.json');
    if (!resp.ok) throw new Error('No se pudo cargar umbral_export.json');
    DATA = await resp.json();
    PUNTOS = DATA.puntos;
    inicializar();
  } catch (err) {
    console.error(err);
    document.querySelector('.page').innerHTML =
      '<p style="padding:60px;text-align:center;color:#E63946;font-family:Inter,sans-serif;">' +
      'No se pudo cargar <code>umbral_export.json</code>. Asegúrate de que el archivo esté ' +
      'en la misma carpeta que <code>index.html</code> y de abrir esta página a través de un ' +
      'servidor (no como archivo local file://).</p>';
  }
}

// ── BUSCAR PUNTO MÁS CERCANO AL UMBRAL DADO ────────────────────────────
function buscarPunto(umbral) {
  // Los puntos están en pasos de 0.001 empezando en 0 — índice directo
  let idx = Math.round(umbral * 1000);
  if (idx < 0) idx = 0;
  if (idx > 1000) idx = 1000;
  return PUNTOS[idx];
}

// ── FORMATEO ────────────────────────────────────────────────────────────
function fmtPct(x) {
  return (x * 100).toFixed(2) + '%';
}
function fmtInt(x) {
  return Math.round(x).toLocaleString('en-US');
}
function fmtPesos(x) {
  if (Math.abs(x) >= 1e9) return (x / 1e9).toFixed(2) + 'B';
  if (Math.abs(x) >= 1e6) return (x / 1e6).toFixed(1) + 'M';
  if (Math.abs(x) >= 1e3) return (x / 1e3).toFixed(0) + 'K';
  return fmtInt(x);
}

// ── DIBUJAR EL GRÁFICO (SVG) ─────────────────────────────────────────────
const CHART_W = 1000;
const CHART_H = 380;
const PAD_L = 46;
const PAD_R = 14;
const PAD_T = 18;
const PAD_B = 28;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function xFor(umbral) { return PAD_L + umbral * PLOT_W; }
function yFor(valor)  { return PAD_T + (1 - valor) * PLOT_H; }

function construirPath(campo) {
  let d = '';
  for (let i = 0; i <= 1000; i += 4) {  // muestreo cada 4 puntos = 250 segmentos, curva suave y liviana
    const p = PUNTOS[i];
    const x = xFor(p.umbral);
    const y = yFor(p[campo]);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
  }
  // asegurar que el último punto (umbral=1.0) esté incluido
  const last = PUNTOS[1000];
  d += 'L' + xFor(last.umbral).toFixed(2) + ',' + yFor(last[campo]).toFixed(2);
  return d;
}

function dibujarGraficoBase() {
  const svg = document.getElementById('chartSvg');
  svg.setAttribute('viewBox', `0 0 ${CHART_W} ${CHART_H}`);

  let html = '';

  // ── Grid horizontal (0%, 25%, 50%, 75%, 100%) ──
  [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
    const y = yFor(v);
    html += `<line x1="${PAD_L}" y1="${y}" x2="${CHART_W - PAD_R}" y2="${y}" stroke="#EEF0F5" stroke-width="1"/>`;
    html += `<text x="${PAD_L - 10}" y="${y + 4}" text-anchor="end" font-size="11" font-family="IBM Plex Mono, monospace" fill="#94A3B8">${Math.round(v * 100)}%</text>`;
  });

  // ── Eje X baseline ──
  html += `<line x1="${PAD_L}" y1="${PAD_T + PLOT_H}" x2="${CHART_W - PAD_R}" y2="${PAD_T + PLOT_H}" stroke="#D7DBE5" stroke-width="1.2"/>`;

  // ── Curvas ──
  html += `<path d="${construirPath('precision')}" fill="none" stroke="${COLORS.precision}" stroke-width="2.6" stroke-linejoin="round"/>`;
  html += `<path d="${construirPath('sensibilidad')}" fill="none" stroke="${COLORS.sensibilidad}" stroke-width="2.6" stroke-linejoin="round"/>`;
  html += `<path d="${construirPath('f1')}" fill="none" stroke="${COLORS.f1}" stroke-width="2.6" stroke-linejoin="round"/>`;

  // ── Marcadores de referencia (conservador, óptimo, agresivo) ──
  const refs = [
    { u: DATA.umbralConservador, color: COLORS.precision, label: 'Conserv.' },
    { u: DATA.umbralOptimo,      color: COLORS.f1,         label: 'Óptimo' },
    { u: DATA.umbralAgresivo,    color: COLORS.sensibilidad, label: 'Agres.' },
  ];
  refs.forEach(r => {
    const x = xFor(r.u);
    html += `<line x1="${x}" y1="${PAD_T}" x2="${x}" y2="${PAD_T + PLOT_H}" stroke="${r.color}" stroke-width="1.2" stroke-dasharray="3,3" opacity="0.55"/>`;
    html += `<text x="${x}" y="${PAD_T - 5}" text-anchor="middle" font-size="10" font-weight="700" font-family="Inter, sans-serif" fill="${r.color}">${r.label}</text>`;
  });

  // ── Línea vertical del umbral actual (se actualiza dinámicamente, id fijo) ──
  html += `<line id="umbralLine" x1="0" y1="${PAD_T}" x2="0" y2="${PAD_T + PLOT_H}" stroke="${COLORS.navy}" stroke-width="2.2"/>`;
  html += `<circle id="umbralDotPrecision" r="5.5" fill="${COLORS.precision}" stroke="white" stroke-width="1.6"/>`;
  html += `<circle id="umbralDotSensibilidad" r="5.5" fill="${COLORS.sensibilidad}" stroke="white" stroke-width="1.6"/>`;
  html += `<circle id="umbralDotF1" r="5.5" fill="${COLORS.f1}" stroke="white" stroke-width="1.6"/>`;

  svg.innerHTML = html;
}

function actualizarLineaUmbral(umbral, punto) {
  const x = xFor(umbral);
  const line = document.getElementById('umbralLine');
  line.setAttribute('x1', x);
  line.setAttribute('x2', x);

  const setDot = (id, campo) => {
    const dot = document.getElementById(id);
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', yFor(punto[campo]));
  };
  setDot('umbralDotPrecision', 'precision');
  setDot('umbralDotSensibilidad', 'sensibilidad');
  setDot('umbralDotF1', 'f1');
}

// ── DIBUJAR TICKS DE REFERENCIA SOBRE EL SLIDER ─────────────────────────
function dibujarRefTicks() {
  const cont = document.getElementById('refTicks');
  const refs = [DATA.umbralConservador, DATA.umbralOptimo, DATA.umbralAgresivo];
  cont.innerHTML = refs.map(u =>
    `<div class="ref-tick" style="left:${u * 100}%"></div>`
  ).join('');
}

// ── ACTUALIZAR PANEL LATERAL ─────────────────────────────────────────────
function actualizarPanel(umbral) {
  const punto = buscarPunto(umbral);
  let nTotal = parseFloat(document.getElementById('nInput').value);
  if (!nTotal || nTotal <= 0 || isNaN(nTotal)) nTotal = DATA.totalTransaccionesTest;
  const factorEscala = nTotal / DATA.totalTransaccionesTest;

  // Métricas (no escalan con N — son tasas)
  document.getElementById('precisionVal').textContent = fmtPct(punto.precision);
  document.getElementById('sensibilidadVal').textContent = fmtPct(punto.sensibilidad);
  document.getElementById('f1Val').textContent = fmtPct(punto.f1);

  // Conteos (escalan con N)
  const fraudesDetectados = punto.fraudesDetectados * factorEscala;
  const fraudesPerdidos = punto.fraudesPerdidos * factorEscala;
  const legitimasBloqueadas = punto.legitimasBloqueadas * factorEscala;
  const montoRecuperado = punto.montoRecuperado * factorEscala;
  const montoPerdido = punto.montoPerdido * factorEscala;

  document.getElementById('fraudesDetectadosVal').textContent = fmtInt(fraudesDetectados);
  document.getElementById('fraudesPerdidosVal').textContent = fmtInt(fraudesPerdidos);
  document.getElementById('legitimasBloqueadasVal').textContent = fmtInt(legitimasBloqueadas);
  document.getElementById('montoRecuperadoVal').textContent = fmtPesos(montoRecuperado) + ' Pesos';
  document.getElementById('montoPerdidoVal').textContent = fmtPesos(montoPerdido) + ' Pesos';

  // Ratio "X por cada Y" — siempre se muestra en la dirección que da un número >= 1,
  // para evitar mostrar fracciones poco intuitivas como "0.0"
  const ratioBox = document.getElementById('ratioText');
  if (legitimasBloqueadas < 0.5 && fraudesDetectados < 0.5) {
    ratioBox.innerHTML = 'Sin actividad detectada a este umbral';
  } else if (legitimasBloqueadas < 0.5) {
    ratioBox.innerHTML = `<b>${fmtInt(fraudesDetectados)}</b> fraudes detectados sin bloquear ninguna transacción legítima`;
  } else if (fraudesDetectados < 0.5) {
    ratioBox.innerHTML = `<b>${fmtInt(legitimasBloqueadas)}</b> legítimas bloqueadas sin detectar ningún fraude`;
  } else if (fraudesDetectados >= legitimasBloqueadas) {
    const ratio = fraudesDetectados / legitimasBloqueadas;
    ratioBox.innerHTML = `Se detectan <b>${ratio.toFixed(1)}</b> fraudes por cada transacción legítima bloqueada`;
  } else {
    const ratio = legitimasBloqueadas / fraudesDetectados;
    ratioBox.innerHTML = `Por cada fraude detectado, se bloquean <b>${ratio.toFixed(1)}</b> transacciones legítimas`;
  }

  // Nota de escala
  const scaleNote = document.getElementById('scaleNote');
  if (Math.abs(factorEscala - 1) > 0.001) {
    scaleNote.textContent = `Valores escalados ×${factorEscala.toFixed(2)} desde el conjunto de test (${fmtInt(DATA.totalTransaccionesTest)} transacciones reales).`;
  } else {
    scaleNote.textContent = 'Valores medidos directamente sobre el conjunto de test — sin escalado.';
  }

  // Resaltar botón activo
  document.querySelectorAll('.qbtn').forEach(b => b.classList.remove('active'));
  const tol = 0.0011;
  if (Math.abs(umbral - DATA.umbralConservador) < tol) document.getElementById('btnConservador').classList.add('active');
  if (Math.abs(umbral - DATA.umbralOptimo) < tol) document.getElementById('btnOptimo').classList.add('active');
  if (Math.abs(umbral - DATA.umbralAgresivo) < tol) document.getElementById('btnAgresivo').classList.add('active');

  actualizarLineaUmbral(umbral, punto);
}

// ── SINCRONIZAR TODOS LOS CONTROLES A UN NUEVO UMBRAL ───────────────────
function setUmbral(umbral) {
  umbral = Math.min(1, Math.max(0, umbral));
  umbral = Math.round(umbral * 1000) / 1000;
  currentUmbral = umbral;

  document.getElementById('umbralSlider').value = umbral;
  document.getElementById('umbralInput').value = umbral.toFixed(3);

  actualizarPanel(umbral);
}

// ── INICIALIZACIÓN ────────────────────────────────────────────────────────
function inicializar() {
  // Stats de rendimiento
  document.getElementById('rocAucVal').textContent = DATA.rocAuc.toFixed(4);
  document.getElementById('prAucVal').textContent = DATA.prAuc.toFixed(4);

  // Botones con valores reales
  document.getElementById('btnConservador').querySelector('.qbtn-val').textContent = DATA.umbralConservador.toFixed(3);
  document.getElementById('btnOptimo').querySelector('.qbtn-val').textContent = DATA.umbralOptimo.toFixed(3);
  document.getElementById('btnAgresivo').querySelector('.qbtn-val').textContent = DATA.umbralAgresivo.toFixed(3);
  document.getElementById('btnConservador').dataset.umbral = DATA.umbralConservador;
  document.getElementById('btnOptimo').dataset.umbral = DATA.umbralOptimo;
  document.getElementById('btnAgresivo').dataset.umbral = DATA.umbralAgresivo;

  dibujarGraficoBase();
  dibujarRefTicks();

  // ── Listeners ──
  const slider = document.getElementById('umbralSlider');
  const input = document.getElementById('umbralInput');
  const nInput = document.getElementById('nInput');

  slider.addEventListener('input', () => setUmbral(parseFloat(slider.value)));

  input.addEventListener('change', () => {
    let v = parseFloat(input.value);
    if (isNaN(v)) v = currentUmbral;
    setUmbral(v);
  });

  nInput.addEventListener('input', () => actualizarPanel(currentUmbral));

  document.querySelectorAll('.qbtn').forEach(btn => {
    btn.addEventListener('click', () => setUmbral(parseFloat(btn.dataset.umbral)));
  });

  // Estado inicial
  setUmbral(0.7);
}

// ── ARRANQUE ────────────────────────────────────────────────────────────
cargarDatos();
