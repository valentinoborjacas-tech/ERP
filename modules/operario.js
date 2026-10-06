const MERMA_MAX_PCT = 5; // ← ajusta: % máximo de merma (tuco / peso manga) antes de marcar en rojo

let opNombre = '';
let opTarea = null;

window.initOperarioModule = function () {
  document.getElementById('op-select').addEventListener('change', () => {
    const esOtro = document.getElementById('op-select').value === '__otro__';
    document.getElementById('op-otro').style.display = esOtro ? 'block' : 'none';
    if (esOtro) document.getElementById('op-otro').focus();
  });
  document.getElementById('op-confirmar').addEventListener('click', () => {
    const sel = document.getElementById('op-select').value;
    const nombre = sel === '__otro__' ? document.getElementById('op-otro').value.trim() : sel;
    if (!nombre) { alert('Selecciona o escribe tu nombre.'); return; }
    localStorage.setItem('mi_avance_operario', nombre);
    mostrarOperario(nombre);
  });
  document.getElementById('op-cambiar').addEventListener('click', () => {
    localStorage.removeItem('mi_avance_operario');
    document.getElementById('op-main').style.display = 'none';
    document.getElementById('op-selector').style.display = '';
  });
  document.getElementById('op-codigo').addEventListener('keyup', cargarBovinasOp);
  document.getElementById('op-iniciar').addEventListener('click', iniciarTarea);
  document.getElementById('op-peso-inicio').addEventListener('input', calcularCierre);
  document.getElementById('op-peso-tuco').addEventListener('input', calcularCierre);
  document.getElementById('op-terminar').addEventListener('click', terminarTarea);

  const guardado = localStorage.getItem('mi_avance_operario');
  if (guardado) mostrarOperario(guardado);
};

function mostrarOperario(nombre) {
  opNombre = nombre;
  document.getElementById('op-selector').style.display = 'none';
  document.getElementById('op-main').style.display = 'block';
  document.getElementById('op-nombre').textContent = nombre;
  document.getElementById('op-codigo').value = localStorage.getItem('prod_last_codigo') || '';
  refrescarTarea();
}

function refrescarTarea() {
  fetch(`${API_URL}?action=produccion&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      opTarea = data.find((p) =>
        p.estadoProceso === 'En proceso' && (p.operario || '').toUpperCase() === opNombre.toUpperCase()
      ) || null;
      document.getElementById('op-panel-iniciar').style.display = opTarea ? 'none' : 'block';
      document.getElementById('op-panel-activa').style.display = opTarea ? 'block' : 'none';
      if (opTarea) renderTareaActiva(opTarea);
      else cargarBovinasOp();
    })
    .catch((err) => alert('Error al cargar: ' + err.message));
}

function renderTareaActiva(t) {
  document.getElementById('op-act-manga').textContent = t.idManga;
  document.getElementById('op-act-material').textContent = t.idMaterial;
  document.getElementById('op-act-detalle').textContent = 'Iniciada: ' + formatFechaOp(t.fecha);

  document.getElementById('op-millares').value = '';
  document.getElementById('op-peso-inicio').value = '';
  document.getElementById('op-peso-tuco').value = '';
  document.getElementById('op-observaciones').value = '';
  document.getElementById('op-estado-final').value = 'Terminado';
  document.getElementById('op-litros').value = localStorage.getItem('prod_last_litros') || '';
  document.getElementById('op-ancho').value = localStorage.getItem('prod_last_ancho') || '';
  document.getElementById('op-largo').value = localStorage.getItem('prod_last_largo') || '';
  document.getElementById('op-espesor').value = localStorage.getItem('prod_last_espesor') || '';
  calcularCierre();

  // Peso de manga autocompletado con el peso actual de la bovina
  fetch(`${API_URL}?action=bovinas&id_material=${encodeURIComponent(t.idMaterial)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((bovs) => {
      const b = bovs.find((x) => x.idBovina === t.idManga);
      if (b) { document.getElementById('op-peso-inicio').value = b.pesoActual; calcularCierre(); }
    });
}

function calcularCierre() {
  const inicio = Number(document.getElementById('op-peso-inicio').value) || 0;
  const tuco = Number(document.getElementById('op-peso-tuco').value) || 0;
  const pct = inicio > 0 ? (tuco / inicio) * 100 : 0;

  document.getElementById('op-peso-utilizado').textContent = Math.max(inicio - tuco, 0).toFixed(2);
  document.getElementById('op-merma').textContent = tuco.toFixed(2);
  document.getElementById('op-merma-pct').textContent = pct.toFixed(1);

  const badge = document.getElementById('op-merma-badge');
  if (inicio <= 0 || !document.getElementById('op-peso-tuco').value) {
    badge.textContent = '—';
    badge.className = 'badge badge-neutral';
  } else if (pct <= MERMA_MAX_PCT) {
    badge.textContent = '✔ Merma OK';
    badge.className = 'badge badge-ok';
  } else {
    badge.textContent = '✖ Merma alta';
    badge.className = 'badge badge-danger';
  }
}

function cargarBovinasOp() {
  const codigo = document.getElementById('op-codigo').value.trim();
  const select = document.getElementById('op-bovina');
  if (!codigo) { select.innerHTML = '<option value="">— Escribe el código del material —</option>'; return; }
  fetch(`${API_URL}?action=bovinas&id_material=${encodeURIComponent(codigo)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      const disp = data.filter((b) => Number(b.pesoActual) > 0 && b.estado !== 'En proceso');
      select.innerHTML = disp.length
        ? '<option value="">Selecciona una manga...</option>' + disp.map((b) =>
            `<option value="${b.idBovina}" data-proveedor="${b.proveedor}">${b.idBovina} — ${Number(b.pesoActual).toFixed(1)} kg (${b.proveedor || 'sin proveedor'})</option>`
          ).join('')
        : '<option value="">Sin mangas disponibles para este material</option>';
    })
    .catch(() => { select.innerHTML = '<option value="">Error al buscar mangas</option>'; });
}

function iniciarTarea() {
  const idManga = document.getElementById('op-bovina').value;
  if (!idManga) { alert('Selecciona una manga.'); return; }
  const opcion = document.getElementById('op-bovina').selectedOptions[0];

  const btn = document.getElementById('op-iniciar');
  btn.disabled = true; btn.textContent = 'Iniciando…';

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'iniciar_produccion',
      operario: opNombre,
      id_manga: idManga,
      proveedor: opcion.dataset.proveedor || ''
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) {
        localStorage.setItem('prod_last_codigo', document.getElementById('op-codigo').value.trim());
        refrescarTarea();
      } else {
        alert('Error: ' + res.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => { btn.disabled = false; btn.textContent = '▶ Iniciar'; });
}

function terminarTarea() {
  if (!opTarea) return;
  const millares = Number(document.getElementById('op-millares').value) || 0;
  const inicio = Number(document.getElementById('op-peso-inicio').value) || 0;
  const tucoTxt = document.getElementById('op-peso-tuco').value;
  const tuco = Number(tucoTxt) || 0;

  if (millares <= 0) { alert('Ingresa los millares producidos.'); return; }
  if (inicio <= 0) { alert('Ingresa el peso de la manga.'); return; }
  if (tucoTxt === '' || tuco < 0 || tuco > inicio) { alert('El peso del tuco no es válido.'); return; }

  const pct = (tuco / inicio) * 100;
  if (pct > MERMA_MAX_PCT &&
      !confirm(`La merma es ${pct.toFixed(1)}% (límite ${MERMA_MAX_PCT}%). ¿Cerrar la tarea de todos modos?`)) {
    return;
  }

  const btn = document.getElementById('op-terminar');
  btn.disabled = true; btn.textContent = 'Cerrando…';

  const litros = document.getElementById('op-litros').value;
  const ancho = document.getElementById('op-ancho').value;
  const largo = document.getElementById('op-largo').value;
  const espesor = document.getElementById('op-espesor').value;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'terminar_produccion',
      id_produccion: opTarea.idProduccion,
      millares, litros, ancho, largo, espesor,
      peso_manga_inicio: inicio,
      peso_tuco: tuco,
      estado_final: document.getElementById('op-estado-final').value,
      observaciones: document.getElementById('op-observaciones').value.trim()
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) {
        localStorage.setItem('prod_last_litros', litros);
        localStorage.setItem('prod_last_ancho', ancho);
        localStorage.setItem('prod_last_largo', largo);
        localStorage.setItem('prod_last_espesor', espesor);
        alert(`Tarea cerrada y bobina liberada.\nPeso utilizado: ${res.pesoUtilizado.toFixed(2)} kg\nMerma: ${res.merma.toFixed(2)} kg (${res.mermaPct.toFixed(1)}%)`);
        refrescarTarea();
      } else {
        alert('Error: ' + res.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => { btn.disabled = false; btn.textContent = '■ Terminar y liberar'; });
}

function formatFechaOp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
