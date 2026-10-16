const MERMA_MAX_PCT = 5; // ← ajusta: % máximo de merma (tuco / peso manga) antes de marcar en rojo


let opNombre = '';
let opMateriales = [];
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
    document.getElementById('op-codigo').addEventListener('input', opSugerir);
  document.getElementById('op-codigo').addEventListener('blur', () => setTimeout(() => {
    const b = document.getElementById('op-sugerencias'); if (b) b.style.display = 'none';
  }, 250));
  document.getElementById('op-iniciar').addEventListener('click', iniciarTarea);
  document.getElementById('op-peso-inicio').addEventListener('input', calcularCierre);
  document.getElementById('op-peso-tuco').addEventListener('input', calcularCierre);
  document.getElementById('op-terminar').addEventListener('click', terminarTarea);
  document.getElementById('op-soltar').addEventListener('click', soltarTarea);
  document.getElementById('op-bovina').addEventListener('change', opActualizarBotonIniciar);
  opActualizarBotonIniciar();

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
      const panelIniciar = document.getElementById('op-panel-iniciar');
      const panelActiva = document.getElementById('op-panel-activa');
      if (!panelIniciar || !panelActiva) return; // el módulo ya no está en pantalla

      opTarea = data.find((p) =>
        p.estadoProceso === 'En proceso' && (p.operario || '').toUpperCase() === opNombre.toUpperCase()
      ) || null;
      panelIniciar.style.display = opTarea ? 'none' : 'block';
      panelActiva.style.display = opTarea ? 'block' : 'none';
      if (opTarea) renderTareaActiva(opTarea);
            else { cargarBovinasOp(); opCargarMateriales(); }
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
    if (!confirm(`¿Iniciar la manga ${idManga}?`)) return;

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
                opTarea = {
          idProduccion: res.idProduccion, idManga: idManga,
          idMaterial: document.getElementById('op-codigo').value.trim().toUpperCase(),
          fecha: new Date().toISOString(), estadoProceso: 'En proceso', operario: opNombre
        };
        document.getElementById('op-panel-iniciar').style.display = 'none';
        document.getElementById('op-panel-activa').style.display = 'block';
        renderTareaActiva(opTarea);
      } else {
        alert('Error: ' + res.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
        .finally(() => { btn.textContent = '▶ Iniciar'; opActualizarBotonIniciar(); });
}

function terminarTarea() {
  if (!opTarea) return;
  const bolsas = Math.round(Number(document.getElementById('op-millares').value) || 0);
  const millares = bolsas / 1000; // internamente se guarda en miles
  const inicio = Number(document.getElementById('op-peso-inicio').value) || 0;
  const tucoTxt = document.getElementById('op-peso-tuco').value;
  const tuco = Number(tucoTxt) || 0;

    if (bolsas <= 0) { alert('Ingresa la cantidad de bolsas selladas.'); return; }
  if (bolsas < 10 && !confirm(`Pusiste solo ${bolsas} bolsas.\n\n¿Es correcto?`)) return;
  if (bolsas >= 50000 && !confirm(`Pusiste ${bolsas.toLocaleString('es-PE')} bolsas.\n\n¿Es correcto?`)) return;
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
          millares,
      litros: Number(litros) || '',
      ancho: Number(ancho) || '',
      largo: Number(largo) || '',
      espesor: Number(espesor) || '',
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
                opTarea = null;
        document.getElementById('op-panel-activa').style.display = 'none';
        document.getElementById('op-panel-iniciar').style.display = 'block';
        document.getElementById('op-codigo').value = '';
        cargarBovinasOp();
        opCargarMateriales();
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
function actualizarPreviewBolsas() {
  const bolsas = Math.round(Number(document.getElementById('op-millares').value) || 0);
  const el = document.getElementById('op-bolsas-preview');
  if (el) el.textContent = bolsas > 0 ? `= ${bolsas.toLocaleString('es-PE')} bolsas (${(bolsas / 1000).toFixed(3).replace(/\.?0+$/, '')} millares)` : '\u00A0';
}
function soltarTarea() {
  if (!opTarea) return;
  if (!confirm(`¿Soltar la manga ${opTarea.idManga}?\n\nSe cancela esta tarea SIN registrar producción y la manga queda disponible para otro.\n\nSi ya sellaste algo, NO la sueltes: usa "Terminar y liberar" con estado "No terminado".`)) return;

  const btn = document.getElementById('op-soltar');
  btn.disabled = true; btn.textContent = 'Soltando…';

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'soltar_produccion',
      id_produccion: opTarea.idProduccion,
      operario: opNombre
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) {
        alert(`Manga ${res.idManga} liberada. Ya puedes elegir otra.`);
        refrescarTarea();
      } else {
        alert('Error: ' + res.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => { btn.disabled = false; btn.textContent = '↩ Soltar manga (cancelar sin producir)'; });
}
  function opActualizarBotonIniciar() {
    const btn = document.getElementById('op-iniciar');
    const sel = document.getElementById('op-bovina');
    if (!btn || !sel) return;
    const ok = !!sel.value;
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '.45';
  }
function opCargarMateriales() {
  return fetch(`${API_URL}?action=materia_prima_stock&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => { opMateriales = (Array.isArray(d) ? d : []).filter((m) => Number(m.nBovinas) > 0 && Number(m.stockActual) > 0); })
    .catch(() => { opMateriales = []; });
}

function opSugerir() {
  const input = document.getElementById('op-codigo');
  const box = document.getElementById('op-sugerencias');
  if (!input || !box) return;
  const q = input.value.trim().toUpperCase();
  box.style.display = 'none';
  box.innerHTML = '';
  if (!q) { cargarBovinasOp(); return; }

  const exacto = opMateriales.find((m) => String(m.id).toUpperCase() === q);
  if (exacto) { cargarBovinasOp(); return; }

  const lista = opMateriales
    .filter((m) => String(m.id).toUpperCase().includes(q) || String(m.descripcion || '').toUpperCase().includes(q))
    .sort((a, b) => (String(b.id).toUpperCase().startsWith(q) ? 1 : 0) - (String(a.id).toUpperCase().startsWith(q) ? 1 : 0))
    .slice(0, 8);

  if (!lista.length) {
    box.innerHTML = '<div style="padding:10px; color:#777;">Sin materiales con mangas disponibles</div>';
    box.style.display = 'block';
    return;
  }
  box.innerHTML = lista.map((m) =>
    `<div class="op-sug-item" data-id="${m.id}" style="padding:12px 10px; border-bottom:1px solid #ddd; cursor:pointer; font-size:15px;">
       <b>${m.id}</b> — ${m.descripcion || ''} <span style="color:#1a7f37;">· ${m.nBovinas} manga${m.nBovinas > 1 ? 's' : ''}</span>
     </div>`).join('');
  box.style.display = 'block';
  box.querySelectorAll('.op-sug-item').forEach((el) => {
    el.addEventListener('mousedown', (e) => { e.preventDefault(); opElegirMaterial(el.dataset.id); });
    el.addEventListener('touchend', (e) => { e.preventDefault(); opElegirMaterial(el.dataset.id); });
  });
}

function opElegirMaterial(id) {
  document.getElementById('op-codigo').value = id;
  document.getElementById('op-sugerencias').style.display = 'none';
  cargarBovinasOp();
}
