const MERMA_MAX_PCT = 5; // ← ajusta: % máximo de merma (tuco / peso manga) antes de marcar en rojo


let opNombre = '';
let opMateriales = [];
let opTarea = null;
let opMisMangas = [];
let opSeleccion = new Set();   // mangas marcadas para llevar al espacio
let opRelojTimer = null;

// Pesos siempre con 2 decimales (evita 57.900000000000006)
const opKg = (x) => Math.round((Number(x) || 0) * 100) / 100;
const opEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 75 → "1 h 15 min", 9 → "9 min"
function opDuracionTexto(min) {
  if (min === '' || min == null || isNaN(min)) return '—';
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

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
    detenerReloj();
    document.getElementById('op-main').style.display = 'none';
    document.getElementById('op-selector').style.display = '';
  });
  document.getElementById('op-codigo').addEventListener('input', opSugerir);
  document.getElementById('op-codigo').addEventListener('blur', () => setTimeout(() => {
    const b = document.getElementById('op-sugerencias'); if (b) b.style.display = 'none';
  }, 250));
  document.getElementById('op-reservar').addEventListener('click', reservarSeleccion);
  document.getElementById('op-peso-inicio').addEventListener('input', calcularCierre);
  document.getElementById('op-peso-tuco').addEventListener('input', calcularCierre);
  document.getElementById('op-terminar').addEventListener('click', terminarTarea);
  document.getElementById('op-soltar').addEventListener('click', soltarTarea);

  // Botones dentro de las listas (empezar, devolver, marcar)
  document.getElementById('op-mis-mangas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-op]');
    if (!b) return;
    if (b.dataset.op === 'empezar') iniciarTarea(b.dataset.id);
    if (b.dataset.op === 'devolver') devolverManga(b.dataset.id);
  });
  document.getElementById('op-bovinas-lista').addEventListener('change', (e) => {
    const chk = e.target.closest('input[type="checkbox"][data-id]');
    if (!chk) return;
    if (chk.checked) opSeleccion.add(chk.dataset.id); else opSeleccion.delete(chk.dataset.id);
    chk.closest('.op-item').classList.toggle('marcada', chk.checked);
    actualizarBotonReservar();
  });

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

// Carga a la vez: la tarea en proceso, lo terminado hoy y las mangas reservadas del operario
function refrescarTarea() {
  Promise.all([
    fetch(`${API_URL}?action=produccion&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`${API_URL}?action=mis_mangas&operario=${encodeURIComponent(opNombre)}&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => [])
  ])
    .then(([data, mis]) => {
      const panelIniciar = document.getElementById('op-panel-iniciar');
      const panelActiva = document.getElementById('op-panel-activa');
      if (!panelIniciar || !panelActiva) return; // el módulo ya no está en pantalla

      const mio = (p) => (p.operario || '').toUpperCase() === opNombre.toUpperCase();
      opTarea = data.find((p) => p.estadoProceso === 'En proceso' && mio(p)) || null;
      opMisMangas = Array.isArray(mis) ? mis : [];
      renderHoy(data.filter((p) => mio(p) && p.estadoProceso === 'Terminado'));

      panelIniciar.style.display = opTarea ? 'none' : 'block';
      panelActiva.style.display = opTarea ? 'block' : 'none';
      if (opTarea) renderTareaActiva(opTarea);
      else { detenerReloj(); renderMisMangas(); cargarBovinasOp(); opCargarMateriales(); }
    })
    .catch((err) => alert('Error al cargar: ' + err.message));
}

// ---------- Mis mangas (reservadas) ----------
function renderMisMangas() {
  const cont = document.getElementById('op-mis-mangas');
  if (!opMisMangas.length) {
    cont.innerHTML = '<div class="op-vacio">No tienes mangas en tu espacio. Llévalas abajo 👇</div>';
    return;
  }
  cont.innerHTML = opMisMangas.map((b, i) => `
    <div class="op-item">
      <div class="op-item-info">
        <div class="op-item-titulo">${opEsc(b.idBovina)} <span class="op-item-mat">${opEsc(b.idMaterial)}</span></div>
        <div class="op-item-sub">${opKg(b.pesoActual).toFixed(2)} kg · ${opEsc(b.proveedor || 'sin proveedor')}</div>
      </div>
      <div class="op-item-btns">
        <button class="btn-classic" data-op="devolver" data-id="${opEsc(b.idBovina)}" title="Devolver al almacén">Devolver</button>
        <button class="btn-classic btn-ingreso" data-op="empezar" data-id="${opEsc(b.idBovina)}">${i === 0 ? '▶ Empezar' : '▶ Empezar'}</button>
      </div>
    </div>`).join('');
}

// ---------- Mangas disponibles para llevar ----------
function cargarBovinasOp() {
  const codigo = document.getElementById('op-codigo').value.trim();
  const cont = document.getElementById('op-bovinas-lista');
  opSeleccion = new Set();
  actualizarBotonReservar();
  if (!codigo) { cont.innerHTML = '<div class="op-vacio">Escribe el código del material para ver sus mangas.</div>'; return; }
  cont.innerHTML = '<div class="op-vacio">Buscando mangas…</div>';
  fetch(`${API_URL}?action=bovinas&id_material=${encodeURIComponent(codigo)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      // Solo las que nadie está usando ni tiene reservadas
      const disp = data.filter((b) => Number(b.pesoActual) > 0 && b.estado === 'Disponible');
      // Las más antiguas primero, con sus días en almacén, para usarlas antes
      const dias = (b) => (typeof diasDesdeIngreso === 'function' ? diasDesdeIngreso(b.fecha) : null);
      disp.sort((a, b) => (dias(b) ?? -1) - (dias(a) ?? -1));
      cont.innerHTML = disp.length
        ? disp.map((b) => {
            const d = dias(b);
            const textoDias = d === null ? '' : ' · ' + (d === 0 ? 'ingresó hoy' : d === 1 ? '1 día' : d + ' días');
            return `<label class="op-item op-item-check">
                <input type="checkbox" data-id="${opEsc(b.idBovina)}" />
                <div class="op-item-info">
                  <div class="op-item-titulo">${opEsc(b.idBovina)} <span class="op-item-peso">${opKg(b.pesoActual).toFixed(2)} kg</span></div>
                  <div class="op-item-sub">${opEsc(b.zona || 'sin zona')}${textoDias} · ${opEsc(b.proveedor || 'sin proveedor')}</div>
                </div>
              </label>`;
          }).join('')
        : '<div class="op-vacio">Sin mangas disponibles para este material.</div>';
    })
    .catch(() => { cont.innerHTML = '<div class="op-vacio">Error al buscar mangas.</div>'; });
}

function actualizarBotonReservar() {
  const btn = document.getElementById('op-reservar');
  if (!btn) return;
  const n = opSeleccion.size;
  btn.disabled = n === 0;
  btn.style.opacity = n ? '1' : '.45';
  btn.textContent = n ? `Llevar ${n} manga${n > 1 ? 's' : ''} a mi espacio` : 'Llevar a mi espacio';
}

function reservarSeleccion() {
  const ids = [...opSeleccion];
  if (!ids.length) return;
  const btn = document.getElementById('op-reservar');
  btn.disabled = true; btn.textContent = 'Reservando…';
  fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'reservar_mangas', operario: opNombre, ids }) })
    .then((r) => r.json())
    .then((res) => {
      if (!res.ok) { alert('No se pudo reservar:\n' + res.error); return; }
      localStorage.setItem('prod_last_codigo', document.getElementById('op-codigo').value.trim());
      refrescarTarea();
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => actualizarBotonReservar());
}

function devolverManga(idManga) {
  if (!confirm(`¿Devolver la manga ${idManga} al almacén?\n\nQuedará disponible para los demás.`)) return;
  fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'liberar_manga', operario: opNombre, id_bovina: idManga }) })
    .then((r) => r.json())
    .then((res) => { if (!res.ok) alert('Error: ' + res.error); refrescarTarea(); })
    .catch((err) => alert('Error de conexión: ' + err.message));
}

// ---------- Tarea en proceso ----------
function renderTareaActiva(t) {
  document.getElementById('op-act-manga').textContent = t.idManga;
  document.getElementById('op-act-material').textContent = t.idMaterial;
  document.getElementById('op-act-detalle').textContent = 'Iniciada: ' + formatFechaOp(t.fecha);
  iniciarReloj(t.fecha);

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
      if (b) { document.getElementById('op-peso-inicio').value = opKg(b.pesoActual); calcularCierre(); }
    });
}

// Reloj en vivo: cuánto tiempo lleva la manga en proceso
function iniciarReloj(inicioIso) {
  detenerReloj();
  const el = document.getElementById('op-act-tiempo');
  const inicio = new Date(inicioIso).getTime();
  const pintar = () => {
    if (!document.getElementById('op-act-tiempo')) { detenerReloj(); return; }
    el.textContent = isNaN(inicio) ? '—' : opDuracionTexto((Date.now() - inicio) / 60000);
  };
  pintar();
  opRelojTimer = setInterval(pintar, 30000);
}
function detenerReloj() { if (opRelojTimer) { clearInterval(opRelojTimer); opRelojTimer = null; } }

function calcularCierre() {
  const inicio = opKg(document.getElementById('op-peso-inicio').value);
  const tuco = opKg(document.getElementById('op-peso-tuco').value);
  const pct = inicio > 0 ? (tuco / inicio) * 100 : 0;

  document.getElementById('op-peso-utilizado').textContent = opKg(Math.max(inicio - tuco, 0)).toFixed(2);
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

function iniciarTarea(idManga) {
  const manga = opMisMangas.find((b) => b.idBovina === idManga);
  if (!manga) return;
  if (!confirm(`¿Empezar a sellar la manga ${idManga}?`)) return;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'iniciar_produccion', operario: opNombre, id_manga: idManga, proveedor: manga.proveedor || '' })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) {
        opTarea = {
          idProduccion: res.idProduccion, idManga: idManga, idMaterial: manga.idMaterial,
          fecha: new Date().toISOString(), estadoProceso: 'En proceso', operario: opNombre
        };
        document.getElementById('op-panel-iniciar').style.display = 'none';
        document.getElementById('op-panel-activa').style.display = 'block';
        renderTareaActiva(opTarea);
      } else {
        alert('Error: ' + res.error);
        refrescarTarea();
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message));
}

function terminarTarea() {
  if (!opTarea) return;
  const bolsas = Math.round(Number(document.getElementById('op-millares').value) || 0);
  const millares = Math.round(bolsas) / 1000; // internamente se guarda en miles
  const inicio = opKg(document.getElementById('op-peso-inicio').value);
  const tucoTxt = document.getElementById('op-peso-tuco').value;
  const tuco = opKg(tucoTxt);

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
        alert(`Tarea cerrada.\nPeso utilizado: ${opKg(res.pesoUtilizado).toFixed(2)} kg\nMerma: ${opKg(res.merma).toFixed(2)} kg (${Number(res.mermaPct).toFixed(1)}%)` +
          (res.duracionMin !== '' && res.duracionMin != null ? `\nTiempo: ${opDuracionTexto(res.duracionMin)}` : ''));
        opTarea = null;
        detenerReloj();
        refrescarTarea(); // muestra la siguiente manga de su espacio
      } else {
        alert('Error: ' + res.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => { btn.disabled = false; btn.textContent = '■ Terminar y liberar'; });
}

// ---------- Lo terminado hoy ----------
function renderHoy(lista) {
  const cont = document.getElementById('op-hoy');
  if (!cont) return;
  const hoy = new Date().toDateString();
  const deHoy = lista
    .filter((p) => new Date(p.fechaFin || p.fecha).toDateString() === hoy)
    .sort((a, b) => new Date(b.fechaFin || b.fecha) - new Date(a.fechaFin || a.fecha));
  if (!deHoy.length) { cont.innerHTML = '<div class="op-vacio">Todavía no terminas mangas hoy.</div>'; return; }
  const totalKg = deHoy.reduce((s, p) => s + (Number(p.pesoUtilizado) || 0), 0);
  const totalBolsas = deHoy.reduce((s, p) => s + Math.round((Number(p.millares) || 0) * 1000), 0);
  const conTiempo = deHoy.filter((p) => p.duracionMin !== '' && p.duracionMin != null);
  const promedio = conTiempo.length ? conTiempo.reduce((s, p) => s + Number(p.duracionMin), 0) / conTiempo.length : null;
  cont.innerHTML =
    `<div class="op-hoy-resumen">
       <div><span>Mangas</span><b>${deHoy.length}</b></div>
       <div><span>Bolsas</span><b>${totalBolsas.toLocaleString('es-PE')}</b></div>
       <div><span>Kg usados</span><b>${opKg(totalKg).toFixed(2)}</b></div>
       <div><span>Tiempo promedio</span><b>${promedio === null ? '—' : opDuracionTexto(promedio)}</b></div>
     </div>` +
    deHoy.map((p) => `
      <div class="op-item">
        <div class="op-item-info">
          <div class="op-item-titulo">${opEsc(p.idManga)} <span class="op-item-mat">${opEsc(p.idMaterial)}</span></div>
          <div class="op-item-sub">${Math.round((Number(p.millares) || 0) * 1000).toLocaleString('es-PE')} bolsas · ${opKg(p.pesoUtilizado).toFixed(2)} kg · ${opEsc(p.estadoFinal || '')}</div>
        </div>
        <div class="op-item-tiempo">⏱ ${opDuracionTexto(p.duracionMin)}</div>
      </div>`).join('');
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
  if (el) el.textContent = bolsas > 0 ? `= ${bolsas.toLocaleString('es-PE')} bolsas (${(bolsas / 1000).toFixed(3).replace(/\.?0+$/, '')} millares)` : ' ';
}
function soltarTarea() {
  if (!opTarea) return;
  if (!confirm(`¿Soltar la manga ${opTarea.idManga}?\n\nSe cancela esta tarea SIN registrar producción. La manga vuelve a tu espacio (o al almacén si no la habías reservado).\n\nSi ya sellaste algo, NO la sueltes: usa "Terminar y liberar" con estado "No terminado".`)) return;

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
        alert(`Manga ${res.idManga} soltada.`);
        detenerReloj();
        refrescarTarea();
      } else {
        alert('Error: ' + res.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => { btn.disabled = false; btn.textContent = '↩ Soltar manga (cancelar sin producir)'; });
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
    `<div class="op-sug-item" data-id="${opEsc(m.id)}" style="padding:12px 10px; border-bottom:1px solid #ddd; cursor:pointer; font-size:15px;">
       <b>${opEsc(m.id)}</b> — ${opEsc(m.descripcion || '')} <span style="color:#1a7f37;">· ${m.nBovinas} manga${m.nBovinas > 1 ? 's' : ''}</span>
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
