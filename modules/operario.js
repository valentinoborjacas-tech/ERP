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
  document.getElementById('op-litros').value = localStorage.getItem('prod_last_litros') || '';
  document.getElementById('op-largo').value = localStorage.getItem('prod_last_largo') || '';
  document.getElementById('op-espesor').value = localStorage.getItem('prod_last_espesor') || '';
  document.getElementById('op-ancho').value = '';
  document.getElementById('op-millares').value = '';
  if (document.getElementById('op-codigo').value) cargarBovinasOp();

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
      else cargarBovinasOp(); // refresca la lista (ya no incluye la que se acaba de usar)
    })
    .catch((err) => alert('Error al cargar: ' + err.message));
}

function renderTareaActiva(t) {
  document.getElementById('op-act-manga').textContent = t.idManga;
  document.getElementById('op-act-material').textContent = t.idMaterial;
  document.getElementById('op-act-detalle').textContent =
    `Litros ${t.litros || '-'} · Ancho ${t.ancho || '-'} · Largo ${t.largo || '-'} · Espesor ${t.espesor || '-'} · Millares ${t.millares || '-'}`;
  document.getElementById('op-peso-inicio').value = '';
  document.getElementById('op-peso-tuco').value = '';
  document.getElementById('op-estado-final').value = 'Terminado';
  calcularCierre();

  // Peso inicio autocompletado con el peso actual de la manga
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
  document.getElementById('op-peso-utilizado').textContent = Math.max(inicio - tuco, 0).toFixed(2);
  document.getElementById('op-merma').textContent = tuco.toFixed(2);
  document.getElementById('op-merma-pct').textContent = inicio > 0 ? ((tuco / inicio) * 100).toFixed(1) : '0.0';
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
      proveedor: opcion.dataset.proveedor || '',
      litros: document.getElementById('op-litros').value,
      ancho: document.getElementById('op-ancho').value,
      largo: document.getElementById('op-largo').value,
      espesor: document.getElementById('op-espesor').value,
      millares: document.getElementById('op-millares').value
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) {
        localStorage.setItem('prod_last_codigo', document.getElementById('op-codigo').value.trim());
        localStorage.setItem('prod_last_litros', document.getElementById('op-litros').value);
        localStorage.setItem('prod_last_largo', document.getElementById('op-largo').value);
        localStorage.setItem('prod_last_espesor', document.getElementById('op-espesor').value);
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
  const inicio = Number(document.getElementById('op-peso-inicio').value) || 0;
  const tuco = Number(document.getElementById('op-peso-tuco').value) || 0;
  if (inicio <= 0) { alert('Ingresa el peso de la manga al inicio.'); return; }
  if (tuco < 0 || tuco > inicio) { alert('El peso del tuco no es válido.'); return; }

  const btn = document.getElementById('op-terminar');
  btn.disabled = true; btn.textContent = 'Cerrando…';

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'terminar_produccion',
      id_produccion: opTarea.idProduccion,
      peso_manga_inicio: inicio,
      peso_tuco: tuco,
      estado_final: document.getElementById('op-estado-final').value
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) {
        alert(`Tarea cerrada.\nPeso utilizado: ${res.pesoUtilizado.toFixed(2)} kg\nMerma (tuco): ${res.merma.toFixed(2)} kg`);
        refrescarTarea();
      } else {
        alert('Error: ' + res.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => { btn.disabled = false; btn.textContent = '■ Terminar'; });
}
