let ordenesData = [];
let catalogoOrdenes = [];
let lineasNuevaOrden = [];
let productoSeleccionado = null;
let ocLineas = [];
let stockMapOc = {};

window.initOrdenesModule = function () {
  // Siempre se entra a "Activas" (la pestaña de la pantalla se dibuja así)
  vistaOrdenes = 'activas';
  // Si ya se habían cargado antes (en esta sesión o la última vez que se abrió la app),
  // se muestran al instante y luego se actualizan
  if (!ordenesData.length) ordenesData = leerOrdenesGuardadas() || [];
  if (ordenesData.length) renderOrdenesSeguro();
  fetchOrdenes();

  document.getElementById('ord-search-input').addEventListener('input', renderOrdenesFiltered);
  document.querySelectorAll('.ord-tab').forEach((tab) => tab.addEventListener('click', () => {
    vistaOrdenes = tab.dataset.vista;
    document.querySelectorAll('.ord-tab').forEach((t) => t.classList.toggle('active', t === tab));
    renderOrdenesFiltered();
  }));

  document.getElementById('ordenes-lista').addEventListener('click', handleOrdenesClick);
  document.getElementById('ordenes-lista').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('ord-info')) { e.preventDefault(); handleOrdenesClick(e); }
  });

  document.getElementById('dispatch-panel-close').addEventListener('click', () => {
  document.getElementById('dispatch-panel').classList.remove('show');
  });
  document.getElementById('dispatch-confirm').addEventListener('click', abrirEleccionSalida);
  document.getElementById('salida-close').addEventListener('click', cerrarEleccionSalida);
  document.getElementById('salida-volver').addEventListener('click', cerrarEleccionSalida);
  document.getElementById('salida-todos').addEventListener('click', alternarTodosSalida);
  document.getElementById('salida-confirmar').addEventListener('click', confirmarDespacho);
  document.getElementById('dispatch-todo').addEventListener('click', despacharTodoLoQueHay);
  document.getElementById('dispatch-avance').addEventListener('click', guardarAvance);

  document.getElementById('order-view-close').addEventListener('click', () => {
    document.getElementById('order-view-panel').classList.remove('show');
  });

  document.getElementById('guia-panel-close').addEventListener('click', () => {
  document.getElementById('guia-panel').classList.remove('show');
  });
  document.getElementById('guia-imprimir').addEventListener('click', () => imprimirDocumento(document.getElementById('guia-print').innerHTML));
  document.getElementById('guia-compartir').addEventListener('click', compartirGuiaPdf);
  document.getElementById('guia-descargar').addEventListener('click', descargarGuiaPdf);
  prepararModalesOrdenes();
  activarRefrescoOrdenes();
};

let vistaOrdenes = 'activas';

// Tolerancia de producción que manda el servidor con el detalle de la orden (0.10 = ±10 %)
let toleranciaActual = 0;
const pctTolerancia = () => `±${Math.round(toleranciaActual * 100)} %`;

// ---------- Refresco automático ----------
// En el celular la pestaña queda abierta días: al volver a la app (o cada minuto mientras
// se mira la lista) se vuelven a pedir las órdenes, así aparecen las nuevas de cobranzas.
let refrescoOrdenesTimer = null;
let refrescoOrdenesListo = false;

function ordenesEnPantalla() {
  return !!document.getElementById('ordenes-lista') && document.visibilityState === 'visible';
}

function refrescarOrdenesSiCorresponde() {
  if (!ordenesEnPantalla()) return;
  if (modalesAbiertos().length) return; // no interrumpir mientras se prepara/despacha
  fetchOrdenes();
}

function activarRefrescoOrdenes() {
  if (!refrescoOrdenesListo) {
    refrescoOrdenesListo = true;
    document.addEventListener('visibilitychange', refrescarOrdenesSiCorresponde);
    window.addEventListener('focus', refrescarOrdenesSiCorresponde);
    window.addEventListener('pageshow', (e) => { if (e.persisted) refrescarOrdenesSiCorresponde(); });
  }
  clearInterval(refrescoOrdenesTimer);
  refrescoOrdenesTimer = setInterval(() => {
    if (!document.getElementById('ordenes-lista')) { clearInterval(refrescoOrdenesTimer); return; }
    refrescarOrdenesSiCorresponde();
  }, 60000);
}

// ---------- Memoria para que todo abra más rápido ----------
// Cada consulta al servidor (Apps Script) tarda ~2 s aunque sea chica. Por eso:
// · la lista de órdenes se guarda en el equipo y aparece al instante al abrir la app;
// · los productos de las órdenes activas se piden por adelantado (Ver productos / Preparar
//   abren sin esperar) y siempre se confirman con el servidor al abrirlas.
const ORD_CACHE_KEY = 'erp_ordenes_cache_v1';
const DETALLE_FRESCO_MS = 90000;
const detalleCache = {}; // numero -> { data, t }

function leerOrdenesGuardadas() {
  try {
    const x = JSON.parse(localStorage.getItem(ORD_CACHE_KEY) || 'null');
    return x && Array.isArray(x.ordenes) ? x.ordenes : null;
  } catch (e) { return null; }
}
function guardarOrdenesLocal(ords) {
  try { localStorage.setItem(ORD_CACHE_KEY, JSON.stringify({ t: Date.now(), ordenes: ords })); } catch (e) { /* sin espacio: no pasa nada */ }
}

function pedirDetalle(numero) {
  return fetch(`${API_URL}?action=orden_detalle&numero=${encodeURIComponent(numero)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      if (!Array.isArray(data)) throw new Error('respuesta inesperada del servidor');
      detalleCache[numero] = { data, t: Date.now() };
      return data;
    });
}

// Trae por adelantado los productos de las órdenes activas (de a 3 a la vez)
function precargarDetalles() {
  const pendientes = ordenesData.filter(ordenActiva).map((o) => o.numero)
    .filter((n) => !detalleCache[n] || Date.now() - detalleCache[n].t > DETALLE_FRESCO_MS);
  let i = 0;
  const siguiente = () => {
    if (i >= pendientes.length) return;
    pedirDetalle(pendientes[i++]).catch(() => {}).finally(siguiente);
  };
  for (let k = 0; k < 3; k++) siguiente();
}

function fetchOrdenes() {
  // Si el servidor tarda demasiado (señal débil), se corta y se avisa en vez de quedar "Cargando…"
  const control = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const corte = control ? setTimeout(() => control.abort(), 25000) : null;
  return fetch(`${API_URL}?action=ordenes&_=${Date.now()}`, { cache: 'no-store', signal: control ? control.signal : undefined })
    .then((r) => r.json())
    .then((data) => {
      if (!Array.isArray(data)) throw new Error('respuesta inesperada del servidor');
      const cambio = JSON.stringify(ordenesData) !== JSON.stringify(data);
      ordenesData = data;
      guardarOrdenesLocal(data);
      if (typeof pintarContadorOrdenes === 'function') pintarContadorOrdenes(data);
      const lista = document.getElementById('ordenes-lista');
      if (lista && (cambio || lista.dataset.dibujada !== '1')) renderOrdenesSeguro();
      precargarDetalles();
    })
    .catch((err) => {
      const lista = document.getElementById('ordenes-lista');
      if (!lista) return;
      // Si ya se tenían órdenes, se muestran las últimas conocidas (nunca se queda en "Cargando…")
      if (ordenesData.length) { renderOrdenesSeguro(); return; }
      const motivo = err && err.name === 'AbortError' ? 'el servidor tardó demasiado en responder' : (navigator.onLine ? err.message : 'no hay conexión a internet');
      lista.innerHTML = `<div class="ord-vacio">No se pudieron cargar las órdenes (${escHtml(motivo)}).<br><button type="button" class="ord-btn" id="ord-reintentar" style="margin-top:10px;">↻ Reintentar</button></div>`;
      const btn = document.getElementById('ord-reintentar');
      if (btn) btn.addEventListener('click', () => { lista.innerHTML = '<div class="ord-vacio">Cargando órdenes…</div>'; fetchOrdenes(); });
    })
    .finally(() => { if (corte) clearTimeout(corte); });
}

// Dibuja la lista; si algo de una orden viene raro, lo avisa en pantalla en vez de dejarla en blanco
function renderOrdenesSeguro() {
  try {
    renderOrdenesFiltered();
    const lista = document.getElementById('ordenes-lista');
    if (lista) lista.dataset.dibujada = '1';
  } catch (err) {
    const lista = document.getElementById('ordenes-lista');
    if (lista) lista.innerHTML = `<div class="ord-vacio">No se pudo mostrar la lista: ${escHtml(err.message)}</div>`;
  }
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// "30/10/2026" o "2026-10-30" → Date (sin hora), o null
function fechaDeTexto(t) {
  const s = String(t || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}
const fechaCorta = (d) => d ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '') : '';

function badgeEstadoOrden(estado) {
  if (estado === 'Pendiente') return 'badge-neutral';
  if (estado === 'En preparación') return 'badge-preparacion';
  if (estado === 'Despachada parcial') return 'badge-warn';
  return 'badge-ok';
}

function renderOrdenesFiltered() {
  const term = (document.getElementById('ord-search-input').value || '').toLowerCase().trim();
  const esActiva = ordenActiva;
  document.getElementById('ord-n-activas').textContent = ordenesData.filter(esActiva).length;
  document.getElementById('ord-n-despachadas').textContent = ordenesData.filter((o) => !esActiva(o)).length;

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const lista = ordenesData
    .filter((o) => (vistaOrdenes === 'activas') === esActiva(o))
    .filter((o) => !term || [o.numero, o.solicitante, o.observaciones].join(' ').toLowerCase().includes(term))
    .map((o) => ({ o, d: datosHojaOrden(o), entrega: fechaDeTexto(datosHojaOrden(o).entrega) }));

  // Activas: la entrega más próxima primero. Despachadas: la más reciente primero.
  lista.sort((a, b) => vistaOrdenes === 'activas'
    ? (a.entrega || new Date(8.64e15)) - (b.entrega || new Date(8.64e15))
    : new Date(b.o.fecha) - new Date(a.o.fecha));

  const cont = document.getElementById('ordenes-lista');
  cont.innerHTML = lista.length
    ? lista.map((x) => ordenCardHtml(x, hoy)).join('')
    : `<div class="ord-vacio">${term ? 'Ninguna orden coincide con la búsqueda.' : vistaOrdenes === 'activas' ? '🎉 No hay órdenes pendientes.' : 'Todavía no hay órdenes terminadas.'}</div>`;
}

// Terminada = salió todo (o completa dentro de la tolerancia) o se cerró el saldo
const ORDEN_TERMINADA = ['Despachada', 'Cerrada'];
function ordenActiva(o) { return ORDEN_TERMINADA.indexOf(o.estado) === -1; }

function ordenCardHtml({ o, d, entrega }, hoy) {
  const cls = { 'Pendiente': 'pendiente', 'En preparación': 'preparacion', 'Despachada parcial': 'parcial', 'Despachada': 'despachada', 'Cerrada': 'cerrada' }[o.estado] || 'pendiente';
  const activa = ordenActiva(o);

  // Aviso de entrega: vencida / hoy / mañana
  let chipEntrega = '';
  if (entrega) {
    const dias = Math.round((entrega - hoy) / 86400000);
    const txt = !activa ? `Entrega ${fechaCorta(entrega)}`
      : dias < 0 ? `Atrasada · ${fechaCorta(entrega)}`
      : dias === 0 ? 'Entrega hoy'
      : dias === 1 ? 'Entrega mañana'
      : `Entrega ${fechaCorta(entrega)}`;
    const tono = !activa ? '' : dias < 0 ? 'rojo' : dias <= 1 ? 'ambar' : '';
    chipEntrega = `<span class="ord-chip ${tono}">📅 ${txt}</span>`;
  }

  const detalle = [d.sede && `Sede ${d.sede}`, d.oc && `OC ${d.oc.replace(/^[a-z]\s+/i, '')}`, o.estado === 'Cerrada' && o.cierreMotivo && `Cerrada: ${o.cierreMotivo}`].filter(Boolean).map(escHtml).join(' · ');
  const principal = activa
    ? `<button class="ord-btn primario" data-action="preparar" data-numero="${escHtml(o.numero)}">📦 ${{ 'Pendiente': 'Preparar', 'En preparación': 'Continuar preparando' }[o.estado] || 'Despachar lo que falta'}</button>`
    : '';
  const hoja = `<button class="ord-btn" data-action="hoja" data-numero="${escHtml(o.numero)}">🖨 Hoja</button>`;

  // Toda la parte de arriba de la tarjeta es tocable: abre los productos de la orden
  return `
    <article class="ord-card ${cls}">
      <div class="ord-info" data-action="ver" data-numero="${escHtml(o.numero)}" role="button" tabindex="0" title="Ver los productos de la orden">
        <div class="ord-card-top">
          <div class="ord-cliente">${escHtml(d.cliente || 'Sin cliente')}</div>
          <span class="ord-estado ${cls}">${escHtml(o.estado)}</span>
        </div>
        ${detalle ? `<div class="ord-detalle">${detalle}</div>` : ''}
        <div class="ord-meta">
          <span class="ord-num">${escHtml(o.numero)}</span>
          <span>Pedido ${fechaCorta(new Date(o.fecha))}</span>
          ${chipEntrega}
        </div>
        <div class="ord-ver">Ver productos <span aria-hidden="true">›</span></div>
      </div>
      <div class="ord-acciones">${principal}<div class="ord-sec">${hoja}</div></div>
    </article>`;
}

function handleOrdenesClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const numero = btn.dataset.numero;
  const panel = { preparar: 'dispatch-panel', ver: 'order-view-panel' }[btn.dataset.action];
  if (btn.dataset.action === 'preparar') abrirDespacho(numero);
  else if (btn.dataset.action === 'ver') abrirVerOrden(numero);
  else if (btn.dataset.action === 'hoja') { imprimirHojaOrden(numero); return; }
  // Se abre como ventana flotante: siempre empieza arriba
  if (panel) document.getElementById(panel).scrollTop = 0;
}

// ---------- Ventanas flotantes (ver orden, preparar/despachar, guía) ----------
// Mientras una está abierta, la lista de atrás no se mueve; se cierra con ✕, tocando fuera o con Esc.
const MODALES_ORDENES = ['order-view-panel', 'dispatch-panel', 'salida-panel', 'guia-panel'];

function modalesAbiertos() {
  return MODALES_ORDENES.map((id) => document.getElementById(id)).filter((p) => p && p.classList.contains('show'));
}

function sincronizarModales() {
  const abiertos = modalesAbiertos();
  document.body.classList.toggle('modal-abierto', abiertos.length > 0);
  document.documentElement.classList.toggle('modal-abierto', abiertos.length > 0);
  const fondo = document.getElementById('ord-backdrop');
  if (fondo) fondo.classList.toggle('show', abiertos.length > 0);
}

function cerrarModalSuperior() {
  // La guía va encima de las demás; si no, la última de la lista que esté abierta
  const abiertos = modalesAbiertos();
  const arriba = abiertos.find((p) => p.id === 'guia-panel') || abiertos[abiertos.length - 1];
  if (arriba) arriba.classList.remove('show');
}

function prepararModalesOrdenes() {
  if (!document.getElementById('ord-backdrop')) {
    const fondo = document.createElement('div');
    fondo.id = 'ord-backdrop';
    fondo.addEventListener('click', cerrarModalSuperior);
    document.body.appendChild(fondo);
  }
  const obs = new MutationObserver(sincronizarModales);
  MODALES_ORDENES.forEach((id) => {
    const p = document.getElementById(id);
    if (p) { p.classList.add('ord-modal'); obs.observe(p, { attributes: true, attributeFilter: ['class'] }); }
  });
  if (!window.__ordEscListo) {
    window.__ordEscListo = true;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalesAbiertos().length) cerrarModalSuperior(); });
  }
  sincronizarModales();
}

// ---------- Ver una orden ya despachada (solo consulta) ----------
let despachosVista = [];

function abrirVerOrden(numero) {
  const orden = ordenesData.find((o) => o.numero === numero);
  const panel = document.getElementById('order-view-panel');
  document.getElementById('order-view-numero').textContent = numero;
  // Encabezado igual que la tarjeta: cliente, estado y datos de la orden
  const d = orden ? datosHojaOrden(orden) : { cliente: '', notas: [] };
  const cls = { 'Pendiente': 'pendiente', 'En preparación': 'preparacion', 'Despachada parcial': 'parcial', 'Despachada': 'despachada', 'Cerrada': 'cerrada' }[orden && orden.estado] || 'pendiente';
  const datos = [d.sede && `Sede ${d.sede}`, d.oc && `OC ${d.oc.replace(/^[a-z]\s+/i, '')}`, d.entrega && `Entrega ${d.entrega}`, ...(d.notas || [])].filter(Boolean);
  document.getElementById('order-view-info').innerHTML = orden ? `
    <div class="ord-card-top">
      <div class="ord-cliente">${escHtml(d.cliente || orden.solicitante)}</div>
      <span class="ord-estado ${cls}">${escHtml(orden.estado)}</span>
    </div>
    ${datos.length ? `<div class="ord-detalle">${datos.map(escHtml).join(' · ')}</div>` : ''}` : '';
  document.getElementById('order-view-tbody').innerHTML = `<tr><td colspan="8">Cargando productos…</td></tr>`;
  document.getElementById('order-view-despachos').innerHTML = '';
  document.getElementById('order-view-cierre').innerHTML = '';
  panel.classList.add('show');
  panel.dataset.numero = numero;
  panel.scrollTop = 0;

  // Si los productos ya se trajeron antes, se muestran al instante y luego se actualizan
  const enMemoria = detalleCache[numero];
  const sigueAbierta = () => panel.dataset.numero === numero && panel.classList.contains('show');
  if (enMemoria) renderVerOrdenDetalle(enMemoria.data);
  pedirDetalle(numero)
    .then((data) => {
      if (!sigueAbierta()) return;
      if (!enMemoria || JSON.stringify(enMemoria.data) !== JSON.stringify(data)) renderVerOrdenDetalle(data);
    })
    .catch((err) => {
      if (!enMemoria && sigueAbierta()) document.getElementById('order-view-tbody').innerHTML = `<tr><td colspan="8">Error: ${escHtml(err.message)}</td></tr>`;
    });

  fetch(`${API_URL}?action=despachos&numero=${encodeURIComponent(numero)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => renderVerOrdenDespachos(Array.isArray(data) ? data : []))
    .catch(() => renderVerOrdenDespachos([]));
}

function renderVerOrdenDetalle(detalle) {
  const badgeLinea = { Despachado: 'badge-ok', Parcial: 'badge-warn', Cerrada: 'badge-neutral' };
  if (Array.isArray(detalle) && detalle.length && typeof detalle[0].tolerancia === 'number') toleranciaActual = detalle[0].tolerancia;
  document.getElementById('order-view-tbody').innerHTML = detalle.length
    ? detalle.map((l) => {
        const solicitado = Number(l.cantidadSolicitada) || 0;
        const despachado = Number(l.cantidadDespachada) || 0;
        const listo = Number(l.cantidadPreparada) || 0;
        const falta = l.cerrada ? 0 : Math.max(solicitado - despachado - listo, 0);
        return `
          <tr>
            <td data-label="ID">${escHtml(l.idArticulo)}</td>
            <td data-label="Descripción">${escHtml(l.descripcion)}</td>
            <td data-label="Pedido" class="oi-num">${solicitado}</td>
            <td data-label="Listo" class="oi-num">${listo || '—'}</td>
            <td data-label="Salió" class="oi-num">${despachado || '—'}</td>
            <td data-label="Falta" class="oi-num oi-falta${falta ? '' : ' oi-cero'}"><strong>${falta}</strong></td>
            <td data-label="Ubicación"${l.idUbicacion ? '' : ' class="oi-sin-ubic"'}>${escHtml(l.idUbicacion || '—')}</td>
            <td data-label="Estado">${(() => {
              // Producto separado pero aún sin despachar
              let est = l.estadoLinea || 'Pendiente';
              if (est === 'Pendiente' && listo > 0) est = listo >= solicitado - despachado ? 'Listo' : 'En preparación';
              else if (est !== 'Despachado' && est !== 'Cerrada' && l.enSelladora && !listo) est = '🏭 En selladora';
              // Completo dentro de la tolerancia (salió algo menos de lo pedido)
              if (est === 'Despachado' && l.cerrada && despachado < solicitado) est = 'Completo (tolerancia)';
              const cls = badgeLinea[est] || (est === 'Completo (tolerancia)' ? 'badge-ok' : est === 'Listo' || est === 'En preparación' || est === '🏭 En selladora' ? 'badge-preparacion' : 'badge-neutral');
              return `<span class="badge ${cls}">${escHtml(est)}</span>`;
            })()}</td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="8">Esta orden no tiene productos registrados.</td></tr>`;
  renderCierreSaldo(Array.isArray(detalle) ? detalle : []);
}

// ---------- Cerrar saldo ----------
// El cliente ya no quiere lo que falta (o se acordó entregar menos): la orden se da por
// terminada con lo entregado. Queda el motivo, la fecha y quién la cerró.
const MOTIVOS_CIERRE = [
  'El cliente ya no necesita el saldo',
  'Se acordó con el cliente entregar menos',
  'Producto cambiado por otro en una nueva orden',
  'Pedido duplicado o cargado por error'
];

function renderCierreSaldo(detalle) {
  const panel = document.getElementById('order-view-panel');
  const cont = document.getElementById('order-view-cierre');
  if (!cont) return;
  const numero = panel.dataset.numero;
  const orden = ordenesData.find((o) => o.numero === numero);

  if (orden && orden.estado === 'Cerrada') {
    const f = orden.fechaCierre ? new Date(orden.fechaCierre).toLocaleDateString('es-PE') : '';
    cont.innerHTML = `<div class="cierre-info">✂ <b>Saldo cerrado</b>${f ? ` el ${escHtml(f)}` : ''}${orden.cerradaPor ? ` por ${escHtml(orden.cerradaPor)}` : ''}${orden.cierreMotivo ? `<div>Motivo: ${escHtml(orden.cierreMotivo)}</div>` : ''}</div>`;
    return;
  }
  const conSaldo = detalle.filter((l) => !l.cerrada && (Number(l.cantidadDespachada) || 0) < (Number(l.cantidadSolicitada) || 0));
  if (!orden || !ordenActiva(orden) || !conSaldo.length) { cont.innerHTML = ''; return; }

  const resumen = conSaldo.map((l) => `${l.descripcion}: faltan ${fmtCant((Number(l.cantidadSolicitada) || 0) - (Number(l.cantidadDespachada) || 0))}`);
  cont.innerHTML = `
    <div class="cierre-caja">
      <button type="button" class="ord-btn cierre-abrir">✂ Cerrar saldo</button>
      <div class="cierre-form" hidden>
        <div class="cierre-titulo">Cerrar el saldo de la orden</div>
        <div class="cierre-txt">Lo que falta <b>ya no se va a despachar</b> y la orden pasa a <b>Terminadas</b>. Lo que ya salió y sus guías no cambian.</div>
        <ul class="cierre-lista">${resumen.map((t) => `<li>${escHtml(t)}</li>`).join('')}</ul>
        <label class="dsp-label" for="cierre-motivo">Motivo</label>
        <select id="cierre-motivo" class="cierre-input">
          <option value="">Elige el motivo…</option>
          ${MOTIVOS_CIERRE.map((m) => `<option>${escHtml(m)}</option>`).join('')}
          <option value="otro">Otro…</option>
        </select>
        <input type="text" id="cierre-detalle" class="cierre-input" maxlength="200" placeholder="Detalle (opcional; obligatorio si es «Otro»)" />
        <div class="dsp-pie-btns">
          <button type="button" class="ord-btn cierre-cancelar">Cancelar</button>
          <button type="button" class="ord-btn peligro cierre-confirmar">✂ Cerrar saldo</button>
        </div>
      </div>
    </div>`;

  const form = cont.querySelector('.cierre-form');
  const abrir = cont.querySelector('.cierre-abrir');
  abrir.addEventListener('click', () => { form.hidden = false; abrir.hidden = true; form.scrollIntoView({ block: 'nearest' }); });
  cont.querySelector('.cierre-cancelar').addEventListener('click', () => { form.hidden = true; abrir.hidden = false; });
  cont.querySelector('.cierre-confirmar').addEventListener('click', () => confirmarCierreSaldo(numero, cont));
}

function confirmarCierreSaldo(numero, cont) {
  const sel = cont.querySelector('#cierre-motivo').value;
  const det = cont.querySelector('#cierre-detalle').value.trim();
  if (!sel) { alert('Elige el motivo del cierre.'); return; }
  if (sel === 'otro' && !det) { alert('Escribe el motivo en el detalle.'); return; }
  const motivo = sel === 'otro' ? det : (det ? `${sel} — ${det}` : sel);
  if (!confirm(`¿Cerrar el saldo de la orden ${numero}?\n\nLo que falta ya no se despachará.\nMotivo: ${motivo}`)) return;

  const btn = cont.querySelector('.cierre-confirmar');
  btn.disabled = true;
  btn.textContent = 'Cerrando…';
  fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'cerrar_saldo', numero, motivo, usuario: 'almacenero' }) })
    .then((r) => r.json())
    .then((res) => {
      if (!res.ok) { alert('Error: ' + (res.error || 'no se pudo cerrar el saldo')); return; }
      document.getElementById('order-view-panel').classList.remove('show');
      alert(`Listo: la orden ${numero} quedó cerrada y pasó a Terminadas.`);
      delete detalleCache[numero];
      fetchOrdenes();
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => { btn.disabled = false; btn.textContent = '✂ Cerrar saldo'; });
}

function renderVerOrdenDespachos(lineas) {
  despachosVista = lineas;
  const ids = [...new Set(lineas.map((l) => l.idDespacho))];
  const cont = document.getElementById('order-view-despachos');
  cont.innerHTML = ids.length
    ? `<div class="modal-seccion">Despachos realizados</div>` +
      ids.map((id) => {
        const delDespacho = lineas.filter((l) => l.idDespacho === id);
        const resumen = delDespacho.map((l) => `${l.descripcion} (${l.cantidad})`).join(', ');
        return `
          <div class="desp-item">
            <div class="desp-txt"><strong>${escHtml(id)}</strong> · ${new Date(delDespacho[0].fecha).toLocaleDateString('es-PE')}<div class="desp-res">${escHtml(resumen)}</div></div>
            <button class="ord-btn" data-reimprimir="${escHtml(id)}">🖨 Ver guía</button>
          </div>`;
      }).join('')
    : '';

  cont.querySelectorAll('[data-reimprimir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delDespacho = despachosVista.filter((l) => l.idDespacho === btn.dataset.reimprimir);
      const guia = delDespacho.map((l) => ({ id: l.idArticulo, descripcion: l.descripcion, cantidad: l.cantidad, ubicacion: l.idUbicacion }));
      mostrarGuia(delDespacho[0].numero, guia, btn.dataset.reimprimir, null, delDespacho[0].fecha);
      document.getElementById('guia-panel').scrollTop = 0;
    });
  });
}

// ---------- Crear nueva orden ----------
function abrirNuevaOrden() {
  lineasNuevaOrden = [];
  productoSeleccionado = null;
  document.getElementById('no-solicitante').value = '';
  document.getElementById('no-observaciones').value = '';
  document.getElementById('no-buscar-producto').value = '';
  document.getElementById('no-resultados-busqueda').innerHTML = '';
  renderLineasNuevaOrden();
  document.getElementById('new-order-panel').classList.add('show');

  if (!catalogoOrdenes.length) {
    fetch(`${API_URL}?action=articulos&_=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { catalogoOrdenes = data; });
  }
}

function buscarProductoParaOrden() {
  const term = document.getElementById('no-buscar-producto').value.toLowerCase();
  const resultadosDiv = document.getElementById('no-resultados-busqueda');
  if (!term) { resultadosDiv.innerHTML = ''; return; }

  const coincidencias = catalogoOrdenes.filter((a) =>
    String(a.ID || '').toLowerCase().includes(term) || String(a.DESCRIPCION || '').toLowerCase().includes(term)
  ).slice(0, 6);

  resultadosDiv.innerHTML = coincidencias.length
    ? `<div style="position:absolute; z-index:10; background:#fff; border:1px solid var(--border-mid); width:100%; max-height:160px; overflow-y:auto;">` +
      coincidencias.map((a) => `<div class="nav-item" style="cursor:pointer;" data-id="${a.ID}" data-desc="${a.DESCRIPCION || ''}">${a.ID} — ${a.DESCRIPCION || ''}</div>`).join('') +
      `</div>`
    : '';

  resultadosDiv.querySelectorAll('[data-id]').forEach((el) => {
    el.addEventListener('click', () => {
      productoSeleccionado = { id: el.dataset.id, descripcion: el.dataset.desc };
      document.getElementById('no-buscar-producto').value = `${el.dataset.id} — ${el.dataset.desc}`;
      resultadosDiv.innerHTML = '';
    });
  });
}

function agregarLineaSeleccionada() {
  if (!productoSeleccionado) { alert('Busca y selecciona un producto de la lista primero.'); return; }
  const cantidad = parseInt(document.getElementById('no-cantidad').value, 10) || 1;
  lineasNuevaOrden.push({ idArticulo: productoSeleccionado.id, descripcion: productoSeleccionado.descripcion, cantidad });
  renderLineasNuevaOrden();
  productoSeleccionado = null;
  document.getElementById('no-buscar-producto').value = '';
  document.getElementById('no-cantidad').value = 1;
}

function renderLineasNuevaOrden() {
  const tbody = document.getElementById('no-lineas-tbody');
  tbody.innerHTML = lineasNuevaOrden.length
    ? lineasNuevaOrden.map((l, i) => `
        <tr>
          <td>${l.idArticulo}</td><td>${l.descripcion}</td><td>${l.cantidad}</td>
          <td><span style="cursor:pointer; color:var(--danger);" data-quitar="${i}">✕</span></td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center; color:#888;">Sin productos agregados todavía</td></tr>`;

  tbody.querySelectorAll('[data-quitar]').forEach((el) => {
    el.addEventListener('click', () => {
      lineasNuevaOrden.splice(Number(el.dataset.quitar), 1);
      renderLineasNuevaOrden();
    });
  });
}

function crearOrdenNueva() {
  const solicitante = document.getElementById('no-solicitante').value.trim();
  if (!solicitante) { alert('El solicitante es obligatorio.'); return; }
  if (!lineasNuevaOrden.length) { alert('Agrega al menos un producto.'); return; }

  const confirmBtn = document.getElementById('new-order-confirm');
  confirmBtn.textContent = 'Creando…';
  confirmBtn.disabled = true;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'crear_orden',
      solicitante,
      observaciones: document.getElementById('no-observaciones').value.trim(),
      lineas: lineasNuevaOrden
    })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        document.getElementById('new-order-panel').classList.remove('show');
        fetchOrdenes();
      } else {
        alert('Error: ' + resultado.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => {
      confirmBtn.textContent = '✔ Crear orden';
      confirmBtn.disabled = false;
    });
}

// ---------- Preparar y despachar ----------
// Mientras el stock de bolsas se sigue cargando, el despacho NO se amarra al stock:
// no pide ubicación, no valida existencias y no descuenta. Cuando el stock esté listo, cambiar a true.
const DESCONTAR_STOCK_EN_DESPACHO = false;

function abrirDespacho(numero) {
  const panel = document.getElementById('dispatch-panel');
  document.getElementById('dispatch-panel-numero').textContent = numero;
  panel.classList.add('show');
  panel.dataset.numero = numero;
  panel.scrollTop = 0;

  // Mismo resumen que la tarjeta de la orden
  const orden = ordenesData.find((o) => o.numero === numero);
  const d = orden ? datosHojaOrden(orden) : { cliente: '' };
  const cls = { 'Pendiente': 'pendiente', 'En preparación': 'preparacion', 'Despachada parcial': 'parcial', 'Despachada': 'despachada', 'Cerrada': 'cerrada' }[orden && orden.estado] || 'pendiente';
  const datos = [d.sede && `Sede ${d.sede}`, d.oc && `OC ${d.oc.replace(/^[a-z]\s+/i, '')}`, d.entrega && `Entrega ${d.entrega}`].filter(Boolean);
  document.getElementById('dispatch-info').innerHTML = orden ? `
    <div class="ord-card-top">
      <div class="ord-cliente">${escHtml(d.cliente || orden.solicitante)}</div>
      <span class="ord-estado ${cls}">${escHtml(orden.estado)}</span>
    </div>
    ${datos.length ? `<div class="ord-detalle">${datos.map(escHtml).join(' · ')}</div>` : ''}` : '';

  document.getElementById('dispatch-tbody').innerHTML = `<div class="ord-vacio">Cargando productos…</div>`;
  document.getElementById('dispatch-total').textContent = '';

  // Productos en memoria → al instante; luego se confirman con el servidor
  const enMemoria = detalleCache[numero];
  const sigueAbierta = () => panel.dataset.numero === numero && panel.classList.contains('show');
  if (enMemoria) renderDespachoTabla(enMemoria.data);
  pedirDetalle(numero)
    .then((data) => {
      if (!sigueAbierta()) return;
      if (!enMemoria) { renderDespachoTabla(data); return; }
      if (JSON.stringify(enMemoria.data) === JSON.stringify(data)) return;
      // Cambió algo en el servidor: se redibuja sin perder lo que ya se escribió
      const escrito = {};
      filasDespacho().forEach((f) => {
        const v = f.querySelector('.disp-cantidad').value;
        if (v !== String(Number(f.dataset.preparada) || '')) escrito[f.dataset.id] = v;
      });
      renderDespachoTabla(data);
      filasDespacho().forEach((f) => {
        if (escrito[f.dataset.id] === undefined) return;
        f.querySelector('.disp-cantidad').value = escrito[f.dataset.id];
        actualizarFaltaFila(f);
      });
    })
    .catch((err) => {
      if (!enMemoria && sigueAbierta()) document.getElementById('dispatch-tbody').innerHTML = `<div class="ord-vacio">Error: ${escHtml(err.message)}</div>`;
    });
}

const fmtCant = (n) => (Number(n) || 0).toLocaleString('es-PE');

// Una tarjeta por producto: cuánto se pidió, cuánto salió ya, y una casilla grande para "listo / sale".
// "Falta" se recalcula mientras se escribe.
function renderDespachoTabla(detalle) {
  const cont = document.getElementById('dispatch-tbody');
  if (!detalle.length) { cont.innerHTML = `<div class="ord-vacio">Esta orden no tiene productos.</div>`; return; }

  toleranciaActual = detalle.length && typeof detalle[0].tolerancia === 'number' ? detalle[0].tolerancia : 0;
  cont.innerHTML = detalle.map((linea) => {
    const pedido = Number(linea.cantidadSolicitada) || 0;
    const despachado = Number(linea.cantidadDespachada) || 0;
    const pendiente = linea.cerrada ? 0 : Math.max(pedido - despachado, 0);
    // Tope con la tolerancia de producción (ej. pedido 10,000 → pueden salir hasta 11,000)
    const maximo = typeof linea.cantidadMaxima === 'number' ? linea.cantidadMaxima : pendiente;
    const titulo = `<div class="dsp-head"><span class="dsp-id">${escHtml(linea.idArticulo)}</span><span class="dsp-desc">${escHtml(linea.descripcion)}</span></div>`;

    // Producto terminado (salió todo, completo dentro de la tolerancia o saldo cerrado): una línea, sin casilla
    if (pendiente <= 0) {
      const txt = linea.cerrada && despachado < pedido
        ? (despachado ? `✓ Cerrado · salió ${fmtCant(despachado)} de ${fmtCant(pedido)}` : '✕ Cerrado sin despachar')
        : `✓ Salió todo · ${fmtCant(despachado)}${despachado > pedido ? ` (pedido ${fmtCant(pedido)})` : ''}`;
      return `<div class="dsp-card hecho">${titulo}<span class="ord-estado ${linea.cerrada && despachado < pedido ? 'cerrada' : 'despachada'}">${txt}</span></div>`;
    }

    // Lo guardado como avance (listo, aún sin despachar) aparece ya cargado
    const preparada = Math.min(Number(linea.cantidadPreparada) || 0, maximo);
    const enSell = !!linea.enSelladora;
    return `
      <div class="dsp-card${enSell ? ' en-selladora' : ''}" data-id="${escHtml(linea.idArticulo)}" data-descripcion="${escHtml(linea.descripcion)}" data-pedido="${pedido}" data-despachado="${despachado}" data-pendiente="${pendiente}" data-maximo="${maximo}" data-preparada="${preparada}" data-selladora="${enSell ? '1' : ''}">
        ${titulo}
        <div class="dsp-sell-aviso">🏭 Se está haciendo en la selladora</div>
        <div class="dsp-nums">
          <div><span>Pedido</span><b>${fmtCant(pedido)}</b></div>
          <div><span>Ya salió</span><b>${despachado ? fmtCant(despachado) : '—'}</b></div>
          <div class="dsp-falta"><span>Falta</span><b class="disp-falta">${fmtCant(pendiente)}</b></div>
        </div>
        <div class="dsp-entrada">
          <label class="dsp-label">Listo / sale ahora</label>
          <div class="dsp-entrada-fila">
            <input type="number" class="disp-cantidad" value="${preparada || ''}" placeholder="0" min="0" max="${maximo}" inputmode="numeric" />
            <button type="button" class="ord-btn disp-completo">✓ Todo (${fmtCant(pendiente)})</button>
          </div>
          <button type="button" class="ord-btn dsp-btn-sell${enSell ? ' activo' : ''}">${enSell ? '🏭 En selladora · tocar para quitar' : '🏭 En selladora'}</button>
          <div class="dsp-extra"></div>
          ${preparada ? `<div class="dsp-nota">Avance guardado: ${fmtCant(preparada)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  cont.querySelectorAll('.dsp-card[data-id]').forEach((fila) => {
    actualizarFaltaFila(fila);
    fila.querySelector('.disp-cantidad').addEventListener('input', () => actualizarFaltaFila(fila));
    fila.querySelector('.disp-completo').addEventListener('click', () => {
      const input = fila.querySelector('.disp-cantidad');
      // Segundo toque en "Todo" lo deja en cero (por si se tocó sin querer)
      input.value = (parseInt(input.value, 10) || 0) === Number(fila.dataset.pendiente) ? '' : fila.dataset.pendiente;
      actualizarFaltaFila(fila);
    });
    fila.querySelector('.dsp-btn-sell').addEventListener('click', () => marcarEnSelladora(fila));
  });
  actualizarTotalDespacho();
}

// "En selladora": el material aún se está sellando en la máquina. Se guarda al instante
// (sin tocar la cantidad lista) para que se vea en la orden y en cobranzas.
function marcarEnSelladora(fila) {
  const numero = document.getElementById('dispatch-panel').dataset.numero;
  const nuevo = !fila.dataset.selladora;
  const btn = fila.querySelector('.dsp-btn-sell');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'guardar_avance', numero, usuario: 'almacenero',
      lineas: [{ idArticulo: fila.dataset.id, cantidadPreparada: Number(fila.dataset.preparada) || 0, enSelladora: nuevo }]
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (!res.ok) { alert('Error: ' + (res.error || 'no se pudo guardar')); return; }
      fila.dataset.selladora = nuevo ? '1' : '';
      fila.classList.toggle('en-selladora', nuevo);
      delete detalleCache[numero];
      fetchOrdenes(); // el estado de la orden puede pasar a "En preparación"
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => {
      btn.disabled = false;
      const on = !!fila.dataset.selladora;
      btn.classList.toggle('activo', on);
      btn.textContent = on ? '🏭 En selladora · tocar para quitar' : '🏭 En selladora';
    });
}

function filasDespacho() {
  return [...document.querySelectorAll('#dispatch-tbody .dsp-card[data-id]')];
}

function actualizarFaltaFila(fila) {
  const pendiente = Number(fila.dataset.pendiente) || 0;
  const maximo = Number(fila.dataset.maximo) || pendiente;
  const input = fila.querySelector('.disp-cantidad');
  let sale = parseInt(input.value, 10) || 0;
  if (sale < 0) { sale = 0; input.value = ''; }
  if (sale > maximo) { sale = maximo; input.value = maximo; }
  const falta = Math.max(pendiente - sale, 0);
  // Producción de más, dentro de la tolerancia
  const extra = fila.querySelector('.dsp-extra');
  if (extra) {
    extra.textContent = sale > pendiente
      ? `+${fmtCant(sale - pendiente)} sobre lo pedido (permitido hasta +${fmtCant(maximo - pendiente)}, ${pctTolerancia()})`
      : '';
  }
  const celda = fila.querySelector('.disp-falta');
  celda.textContent = fmtCant(falta);
  fila.querySelector('.dsp-falta').classList.toggle('cero', falta === 0);
  fila.classList.toggle('completo', sale > 0 && falta === 0);
  fila.classList.toggle('con-cantidad', sale > 0);
  fila.querySelector('.disp-completo').classList.toggle('activo', sale > 0 && sale >= pendiente);
  actualizarTotalDespacho();
}

function actualizarTotalDespacho() {
  const filas = filasDespacho();
  const conCantidad = filas.filter((f) => (parseInt(f.querySelector('.disp-cantidad').value, 10) || 0) > 0);
  const unidades = conCantidad.reduce((s, f) => s + (parseInt(f.querySelector('.disp-cantidad').value, 10) || 0), 0);
  const el = document.getElementById('dispatch-total');
  if (el) el.textContent = conCantidad.length
    ? `${conCantidad.length} de ${filas.length} productos · ${fmtCant(unidades)} unidades`
    : 'Escribe cuánto está listo de cada producto';
}

// "Marcar todo completo": llena cada producto con lo que falta
function despacharTodoLoQueHay() {
  filasDespacho().forEach((fila) => {
    fila.querySelector('.disp-cantidad').value = fila.dataset.pendiente;
    actualizarFaltaFila(fila);
  });
}

// Guarda lo que ya está listo sin despacharlo: no descuenta stock ni genera guía.
// El día del envío, esas cantidades aparecen cargadas y basta con confirmar el despacho.
function guardarAvance() {
  const numero = document.getElementById('dispatch-panel').dataset.numero;
  const lineas = [];
  filasDespacho().forEach((fila) => {
    const cantidad = parseInt(fila.querySelector('.disp-cantidad').value, 10) || 0;
    // Se envían también los ceros para poder borrar un avance guardado por error
    if (cantidad > 0 || Number(fila.dataset.preparada) > 0) {
      lineas.push({ idArticulo: fila.dataset.id, cantidadPreparada: cantidad });
    }
  });
  if (!lineas.length) { alert('No hay nada que guardar. Escribe cuánto está listo o toca "✓ Todo".'); return; }

  const btn = document.getElementById('dispatch-avance');
  btn.textContent = 'Guardando…';
  btn.disabled = true;
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'guardar_avance', numero, lineas, usuario: 'almacenero' })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        document.getElementById('dispatch-panel').classList.remove('show');
        alert('Avance guardado. Todavía no se despachó nada: cuando salga el camión, abre la orden y toca "Despachar".');
        delete detalleCache[numero];
        fetchOrdenes();
      } else {
        alert('Error: ' + (resultado.error || 'no se pudo guardar el avance'));
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => {
      btn.textContent = '💾 Guardar avance';
      btn.disabled = false;
    });
}

// ---------- Paso final: elegir qué sube al camión ----------
// "Despachar" ya no manda todo lo listo: abre esta lista para marcar solo lo que se carga.
// Lo que no se marca se queda guardado como "listo" para el próximo envío.
function abrirEleccionSalida() {
  const listos = filasDespacho()
    .map((fila) => ({ fila, cantidad: parseInt(fila.querySelector('.disp-cantidad').value, 10) || 0 }))
    .filter((x) => x.cantidad > 0);
  if (!listos.length) { alert('No hay nada listo. Escribe cuánto está listo de cada producto o toca "✓ Todo".'); return; }

  document.getElementById('salida-numero').textContent = document.getElementById('dispatch-panel').dataset.numero;
  document.getElementById('salida-lista').innerHTML = listos.map(({ fila, cantidad }, i) => {
    const maximo = Number(fila.dataset.maximo) || Number(fila.dataset.pendiente) || 0;
    return `
      <div class="sal-item marcado" data-id="${escHtml(fila.dataset.id)}" data-pedido="${fila.dataset.pedido}" data-despachado="${fila.dataset.despachado}" data-pendiente="${fila.dataset.pendiente}">
        <input type="checkbox" class="sal-check" id="sal-c-${i}" checked />
        <div class="sal-texto">
          <label class="dsp-head" for="sal-c-${i}"><span class="dsp-id">${escHtml(fila.dataset.id)}</span><span class="dsp-desc">${escHtml(fila.dataset.descripcion)}</span></label>
          <div class="sal-cant">Sube: <input type="number" class="sal-num" value="${cantidad}" min="1" max="${maximo}" inputmode="numeric" /> <span class="sal-estado"></span></div>
          <label class="sal-cerrar"><input type="checkbox" class="sal-cerrar-check" /> <span class="sal-cerrar-txt"></span></label>
        </div>
      </div>`;
  }).join('');

  document.querySelectorAll('#salida-lista .sal-item').forEach((item) => {
    const check = item.querySelector('.sal-check');
    const num = item.querySelector('.sal-num');
    check.addEventListener('change', actualizarSalida);
    item.querySelector('.sal-cerrar-check').addEventListener('change', actualizarSalida);
    num.addEventListener('input', () => {
      const max = Number(num.max) || 0;
      if ((parseInt(num.value, 10) || 0) > max) num.value = max;
      actualizarSalida();
    });
    // Tocar cualquier parte libre de la tarjeta marca o desmarca el producto
    item.addEventListener('click', (e) => {
      if (e.target.closest('input, label')) return;
      check.checked = !check.checked;
      actualizarSalida();
    });
  });
  actualizarSalida();
  const panel = document.getElementById('salida-panel');
  panel.classList.add('show');
  panel.scrollTop = 0;
}

function cerrarEleccionSalida() {
  document.getElementById('salida-panel').classList.remove('show');
}

function itemsSalida() {
  return [...document.querySelectorAll('#salida-lista .sal-item')];
}

function actualizarSalida() {
  const items = itemsSalida();
  let marcados = 0, unidades = 0;
  items.forEach((item) => {
    const on = item.querySelector('.sal-check').checked;
    item.classList.toggle('marcado', on);
    const sube = parseInt(item.querySelector('.sal-num').value, 10) || 0;
    if (on) { marcados++; unidades += sube; }
    estadoItemSalida(item, on ? sube : 0);
  });
  document.getElementById('salida-total').textContent = marcados
    ? `Suben ${marcados} de ${items.length} productos · ${fmtCant(unidades)} unidades`
    : 'Marca lo que sube al camión';
  const btn = document.getElementById('salida-confirmar');
  btn.disabled = marcados === 0;
  btn.textContent = marcados ? `🚚 Despachar ${marcados} producto${marcados === 1 ? '' : 's'}` : '🚚 Despachar';
  document.getElementById('salida-todos').textContent = marcados === items.length ? 'Quitar todos' : 'Marcar todos';
}

// Cómo queda el producto con lo que sube: completo, con producción de más, parcial,
// o parcial pero dentro de la tolerancia (ahí se pregunta si darlo por completo).
function estadoItemSalida(item, sube) {
  const pedido = Number(item.dataset.pedido) || 0;
  const despachado = Number(item.dataset.despachado) || 0;
  const pendiente = Number(item.dataset.pendiente) || 0;
  const minimo = Math.ceil(pedido * (1 - toleranciaActual) - 1e-9);
  const total = despachado + sube;
  const est = item.querySelector('.sal-estado');
  const cerrar = item.querySelector('.sal-cerrar');
  let puedeCerrar = false;

  if (sube >= pendiente) {
    est.className = 'sal-estado sal-ok';
    est.textContent = sube > pendiente ? `completo · +${fmtCant(sube - pendiente)} extra` : 'completo';
  } else {
    est.className = 'sal-estado sal-parcial';
    est.textContent = `de ${fmtCant(pendiente)} que faltan`;
    puedeCerrar = toleranciaActual > 0 && sube > 0 && total >= minimo;
  }
  cerrar.classList.toggle('ver', puedeCerrar);
  if (!puedeCerrar) cerrar.querySelector('.sal-cerrar-check').checked = false;
  else {
    cerrar.querySelector('.sal-cerrar-txt').innerHTML =
      `<b>Dar por completo</b> — salen ${fmtCant(total)} de ${fmtCant(pedido)} (${Math.round(total / pedido * 100)} %), dentro de la tolerancia ${pctTolerancia()}. Si no lo marcas, quedan ${fmtCant(pedido - total)} pendientes.`;
  }
}

function alternarTodosSalida() {
  const items = itemsSalida();
  const todos = items.every((i) => i.querySelector('.sal-check').checked);
  items.forEach((i) => { i.querySelector('.sal-check').checked = !todos; });
  actualizarSalida();
}

function confirmarDespacho() {
  const numero = document.getElementById('dispatch-panel').dataset.numero;
  const lineas = [];
  const seQuedan = []; // listos que no suben: se guardan como avance

  itemsSalida().forEach((item) => {
    const fila = filasDespacho().find((f) => f.dataset.id === item.dataset.id);
    if (!fila) return;
    const listo = parseInt(fila.querySelector('.disp-cantidad').value, 10) || 0;
    const sube = item.querySelector('.sal-check').checked ? (parseInt(item.querySelector('.sal-num').value, 10) || 0) : 0;
    if (sube > 0) {
      const cerrarLinea = item.querySelector('.sal-cerrar').classList.contains('ver') && item.querySelector('.sal-cerrar-check').checked;
      lineas.push({ idArticulo: fila.dataset.id, descripcion: fila.dataset.descripcion, idUbicacion: '', cantidadDespachar: sube, cerrarLinea });
    }
    // Lo listo que no sube (todo o una parte) queda anotado para el próximo camión
    const resto = Math.max(listo - sube, 0);
    if (resto > 0 || Number(fila.dataset.preparada) > 0) {
      seQuedan.push({ idArticulo: fila.dataset.id, cantidadPreparada: resto + sube });
    }
  });

  if (!lineas.length) { alert('Marca al menos un producto que suba al camión.'); return; }

  const confirmBtn = document.getElementById('salida-confirmar');
  confirmBtn.textContent = 'Procesando…';
  confirmBtn.disabled = true;

  // 1) Guardar como "listo" lo que se escribió (incluye lo que sube: el despacho luego lo descuenta)
  const guardarListos = seQuedan.length
    ? fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'guardar_avance', numero, lineas: seQuedan, usuario: 'almacenero' }) })
        .then((r) => r.json()).catch(() => ({ ok: false }))
    : Promise.resolve({ ok: true });

  guardarListos
    .then(() => fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'despachar_orden', numero, lineas, usuario: 'almacenero', descontarStock: DESCONTAR_STOCK_EN_DESPACHO })
    }))
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        document.getElementById('salida-panel').classList.remove('show');
        document.getElementById('dispatch-panel').classList.remove('show');
        mostrarGuia(numero, resultado.guia, resultado.idDespacho, resultado.estado);
        delete detalleCache[numero];
        fetchOrdenes();
      } else if (/ubicaci[oó]n/i.test(resultado.error || '')) {
        // El Apps Script publicado todavía es la versión que exige stock
        alert('El servidor del ERP aún pide ubicación y stock para despachar.\nHay que publicar la nueva versión del Apps Script (Codigo.gs).');
      } else {
        alert('Error: ' + resultado.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => {
      actualizarSalida(); // vuelve a poner el texto y el estado del botón
    });
}

// ---------- Hoja de la orden para imprimir desde la tablet ----------
// Es la misma hoja que se imprime en cobranzas (Pedido | Sale | ✓ | Falta), armada con los
// datos que ya tiene el ERP. Las órdenes que vienen de cobranzas traen la referencia
// "OP-CP-0001" / "OP-VS-0001" en el solicitante y sus datos en las observaciones.
const HOJA_EMPRESAS = {
  CP: { nombre: 'CASCONIPLAST S.R.L.', ruc: '20506789207', telefono: '+51 965 407 676', logo: 'assets/logo-casconiplast.png' },
  VS: { nombre: 'V&S POLI BAGS', ruc: '20547366817', telefono: '+51 965 407 676', logo: '' }
};
const HOJA_FILAS_MIN = 14;

function escHoja(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// "OP-CP-0001 · SSAYS · Sede Herrera" + "Cliente: SSAYS · Sede: Herrera · Entrega: 30/10/2026 · OC cliente: 123 · Creada por: x · notas"
function datosHojaOrden(orden) {
  const ref = (String(orden.solicitante || '').match(/^OP-(CP|VS)-\d+/) || [])[0] || '';
  const datos = { referencia: ref || '—', empresa: HOJA_EMPRESAS[ref.slice(3, 5)] || null, cliente: '', sede: '', entrega: '', oc: '', creadaPor: '', notas: [] };
  String(orden.observaciones || '').split(' · ').forEach((parte, i) => {
    const m = parte.match(/^(Cliente|Sede|Entrega|OC cliente|Creada por):\s*(.*)$/);
    if (m) datos[{ 'Cliente': 'cliente', 'Sede': 'sede', 'Entrega': 'entrega', 'OC cliente': 'oc', 'Creada por': 'creadaPor' }[m[1]]] = m[2];
    else if (!(ref && i === 0)) datos.notas.push(parte); // la 1.ª parte es "Orden de pedido 0001 (…)"
  });
  if (!datos.cliente) datos.cliente = orden.solicitante || '';
  return datos;
}

function imprimirHojaOrden(numero) {
  const orden = ordenesData.find((o) => o.numero === numero);
  if (!orden) return;
  const cont = document.getElementById('hoja-print');
  cont.innerHTML = '';

  Promise.all([
    fetch(`${API_URL}?action=orden_detalle&numero=${encodeURIComponent(numero)}&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`${API_URL}?action=despachos&numero=${encodeURIComponent(numero)}&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => [])
  ])
    .then(([detalle, despachosRaw]) => {
      const d = datosHojaOrden(orden);
      const fmt = (n) => (Number(n) || 0).toLocaleString('es-PE');
      // Documento "vivo": "Listo" = lo separado (avance guardado) + lo ya despachado.
      // Si un producto aún no tiene nada, las casillas quedan en blanco para escribir a mano.
      let filas = detalle.map((l, i) => {
        const pedido = Number(l.cantidadSolicitada) || 0;
        const salio = Number(l.cantidadDespachada) || 0;
        const avance = salio + (Number(l.cantidadPreparada) || 0);
        // Cerrado (por tolerancia o "Cerrar saldo"): ya no falta nada
        const cerradoCorto = l.cerrada && avance < pedido;
        const completo = (avance > 0 && avance >= pedido) || cerradoCorto;
        const listo = cerradoCorto ? (salio ? `CERRADO (${fmt(salio)})` : 'CERRADO') : avance <= 0 ? '' : (completo ? 'COMPLETO' : fmt(avance));
        const falta = cerradoCorto ? '—' : avance <= 0 ? '' : (completo ? '—' : fmt(pedido - avance));
        return `<tr><td class="hoja-centro">${i + 1}</td><td>${escHoja(l.idArticulo)}</td><td>${escHoja(l.descripcion)}</td>` +
          `<td class="hoja-num">${fmt(pedido)}</td>` +
          `<td class="${completo ? 'hoja-completo' : 'hoja-num'}">${listo}</td>` +
          `<td class="hoja-completo">${completo ? '✓' : ''}</td>` +
          `<td class="${falta && falta !== '—' ? 'hoja-faltante' : 'hoja-centro'}">${falta}</td>` +
          `<td class="hoja-num">${salio ? fmt(salio) : ''}</td></tr>`;
      }).join('');
      for (let i = detalle.length; i < HOJA_FILAS_MIN; i++) filas += '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';

      const despachosLineas = Array.isArray(despachosRaw) ? despachosRaw : [];
      const despachos = [...new Set(despachosLineas.map((x) => x.idDespacho))].map((id) => {
        const primera = despachosLineas.find((x) => x.idDespacho === id);
        return id + ' · ' + new Date(primera.fecha).toLocaleDateString('es-PE');
      });
      const estadoClase = { 'Pendiente': 'pendiente', 'En preparación': 'preparacion', 'Despachada parcial': 'parcial', 'Despachada': 'completado', 'Cerrada': 'completado' }[orden.estado] || 'pendiente';
      const estadoTexto = { 'Pendiente': 'PENDIENTE', 'En preparación': 'EN PREPARACIÓN', 'Despachada parcial': 'PARCIAL', 'Despachada': 'COMPLETADA' }[orden.estado] || String(orden.estado || '').toUpperCase();

      const fecha = orden.fecha ? new Date(orden.fecha).toLocaleDateString('es-PE') : '';
      cont.innerHTML = `
        <div class="hoja">
          <table class="hoja-head"><tbody>
            <tr>
              <td class="hoja-logo" rowspan="2">${d.empresa && d.empresa.logo ? `<img src="${d.empresa.logo}" alt="${escHoja(d.empresa.nombre)}">` : `<strong>${escHoja(d.empresa ? d.empresa.nombre : 'SGA-Almacén')}</strong>`}</td>
              <td class="hoja-titulo" colspan="3">ORDEN DE PEDIDO <span class="hoja-estado hoja-estado-${estadoClase}">${escHoja(estadoTexto)}</span></td>
            </tr>
            <tr>
              <td><span>N.º ERP</span>${escHoja(orden.numero)}</td>
              <td><span>Referencia</span>${escHoja(d.referencia)}</td>
              <td><span>Fecha</span>${fecha}</td>
            </tr>
          </tbody></table>
          <table class="hoja-datos"><tbody>
            <tr><th>Cliente</th><td>${escHoja(d.cliente)}</td><th>Orden de compra</th><td>${escHoja(d.oc || '—')}</td></tr>
            <tr><th>Sede / entrega</th><td>${escHoja(d.sede || '—')}</td><th>Fecha de entrega</th><td>${escHoja(d.entrega || '—')}</td></tr>
            <tr><th>Empresa</th><td>${d.empresa ? escHoja(d.empresa.nombre + ' · RUC ' + d.empresa.ruc) : '—'}</td><th>Estado</th><td>${escHoja(estadoTexto)}${despachos.length ? ' · ' + despachos.length + ' despacho(s)' : ''}</td></tr>
          </tbody></table>
          <table class="hoja-items">
            <thead><tr>
              <th style="width:30px;">Ítem</th><th style="width:50px;">Código</th><th>Producto</th><th style="width:66px;">Pedido</th>
              <th style="width:96px;">Listo (o Completo)</th><th style="width:30px;">✓</th><th style="width:72px;">Falta</th><th style="width:76px;">Despachado</th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
          <div class="hoja-obs"><strong>Observaciones</strong><div>${escHoja(d.notas.join(' · '))}</div>
            ${despachos.length ? `<div class="hoja-despachos">Despachos: ${escHoja(despachos.join('  ·  '))}</div>` : ''}
          </div>
          <div class="hoja-firmas">
            <div><strong>Solicitado por</strong><span>${escHoja(d.creadaPor)}</span></div>
            <div><strong>Autorizado por</strong><span></span></div>
            <div><strong>Recibido por (Almacén)</strong><span></span></div>
          </div>
          <div class="hoja-impreso">Actualizado al ${new Date().toLocaleString('es-PE')}</div>
        </div>`;

      imprimirDocumento(cont.innerHTML);
    })
    .catch((err) => alert('No se pudo cargar la orden: ' + err.message));
}

// Imprime solo un documento (hoja u guía). Se copia a un contenedor directo del <body> y,
// al imprimir, se oculta todo lo demás con display:none: así no sale una página en blanco
// extra ni se aplica el diseño de celular a las tablas.
function imprimirDocumento(html) {
  let raiz = document.getElementById('print-root');
  if (!raiz) {
    raiz = document.createElement('div');
    raiz.id = 'print-root';
    document.body.appendChild(raiz);
  }
  raiz.innerHTML = html;
  document.body.classList.add('imprimiendo');
  const quitar = () => { document.body.classList.remove('imprimiendo'); window.removeEventListener('afterprint', quitar); };
  window.addEventListener('afterprint', quitar);
  const img = raiz.querySelector('img');
  const imprimir = () => setTimeout(() => window.print(), 100);
  if (img && !img.complete) { img.onload = imprimir; img.onerror = imprimir; } else imprimir();
}

// ---------- Guía de salida: solo lo que sube al camión ----------
function mostrarGuia(numero, guia, idDespacho, estado, fechaDespacho) {
  const orden = ordenesData.find((o) => o.numero === numero) || { numero, solicitante: '', observaciones: '' };
  const d = datosHojaOrden(orden);
  const fmt = (n) => (Number(n) || 0).toLocaleString('es-PE');
  const fecha = new Date(fechaDespacho || Date.now()).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const total = guia.reduce((s, g) => s + (Number(g.cantidad) || 0), 0);
  // Mientras el despacho no se amarra al stock no hay ubicación: la columna no se muestra
  const conUbic = guia.some((g) => g.ubicacion);
  const filas = guia.map((g, i) => `
    <tr>
      <td class="hoja-centro">${i + 1}</td><td>${escHoja(g.id)}</td><td>${escHoja(g.descripcion)}</td>
      <td class="hoja-num">${fmt(g.cantidad)}</td>${conUbic ? `<td>${escHoja(g.ubicacion)}</td>` : ''}<td></td>
    </tr>`).join('');

  document.getElementById('guia-print').innerHTML = `
    <div class="hoja">
      <table class="hoja-head"><tbody>
        <tr>
          <td class="hoja-logo" rowspan="2">${d.empresa && d.empresa.logo ? `<img src="${d.empresa.logo}" alt="${escHoja(d.empresa.nombre)}">` : `<strong>${escHoja(d.empresa ? d.empresa.nombre : 'SGA-Almacén')}</strong>`}</td>
          <td class="hoja-titulo" colspan="3">GUÍA DE SALIDA</td>
        </tr>
        <tr>
          <td><span>N.º de despacho</span>${escHoja(idDespacho || '—')}</td>
          <td><span>Orden</span>${escHoja(numero)}${d.referencia !== '—' ? ' · ' + escHoja(d.referencia) : ''}</td>
          <td><span>Fecha y hora</span>${fecha}</td>
        </tr>
      </tbody></table>
      <table class="hoja-datos"><tbody>
        <tr><th>Cliente</th><td>${escHoja(d.cliente)}</td><th>Sede / entrega</th><td>${escHoja(d.sede || '—')}</td></tr>
        <tr><th>Orden de compra</th><td>${escHoja(d.oc || '—')}</td><th>Empresa</th><td>${d.empresa ? escHoja(d.empresa.nombre + ' · RUC ' + d.empresa.ruc) : '—'}</td></tr>
        ${estado ? `<tr><th>Estado de la orden</th><td colspan="3">${escHoja(estado)}</td></tr>` : ''}
      </tbody></table>
      <table class="hoja-items">
        <thead><tr>
          <th style="width:30px;">Ítem</th><th style="width:50px;">Código</th><th>Producto</th>
          <th style="width:80px;">Cantidad</th>${conUbic ? '<th style="width:96px;">Ubicación</th>' : ''}<th style="width:34px;">✓</th>
        </tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr><th colspan="3" style="text-align:right;">Total</th><th class="hoja-num">${fmt(total)}</th><th colspan="${conUbic ? 2 : 1}"></th></tr></tfoot>
      </table>
      <div class="hoja-obs"><strong>Observaciones</strong><div>${escHoja(d.notas.join(' · '))}</div></div>
      <div class="hoja-firmas">
        <div><strong>Despachado por (Almacén)</strong><span></span></div>
        <div><strong>Transportista / placa</strong><span></span></div>
        <div><strong>Recibido por (Cliente)</strong><span></span></div>
      </div>
    </div>`;
  // Para armar el PDF (compartir / descargar) con los mismos datos
  guiaActual = { numero, guia, idDespacho, estado, fecha, d, total, conUbic };
  document.getElementById('guia-panel').classList.add('show');
}

// ---------- Guía en PDF: compartir (WhatsApp, correo…) o descargar ----------
let guiaActual = null;
let logoGuiaDataUrl = null;

// El logo original pesa mucho: se achica a 500 px de ancho (JPEG sobre fondo blanco)
// para que el PDF quede liviano y se pueda mandar por WhatsApp.
function cargarLogoGuia(src) {
  if (!src) return Promise.resolve(null);
  if (logoGuiaDataUrl) return Promise.resolve(logoGuiaDataUrl);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const ancho = Math.min(500, img.naturalWidth || 500);
      const alto = Math.round(ancho * (img.naturalHeight / img.naturalWidth));
      const c = document.createElement('canvas');
      c.width = ancho; c.height = alto;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ancho, alto);
      ctx.drawImage(img, 0, 0, ancho, alto);
      logoGuiaDataUrl = { url: c.toDataURL('image/jpeg', 0.88), proporcion: alto / ancho };
      res(logoGuiaDataUrl);
    };
    img.onerror = () => res(null);
    img.src = src;
  });
}

async function generarPdfGuia() {
  const g = guiaActual;
  if (!g) throw new Error('No hay guía abierta');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const azul = [10, 61, 122];
  const fmt = (n) => (Number(n) || 0).toLocaleString('es-PE');

  // Encabezado: logo + título + datos del despacho
  const logo = await cargarLogoGuia(g.d.empresa && g.d.empresa.logo);
  if (logo) {
    // Máximo 45 mm de ancho y 20 mm de alto, sin deformar el logo
    const anchoLogo = Math.min(45, 20 / logo.proporcion);
    try { doc.addImage(logo.url, 'JPEG', 14, 8, anchoLogo, anchoLogo * logo.proporcion); } catch (e) { /* sin logo */ }
  }
  else { doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(g.d.empresa ? g.d.empresa.nombre : 'SGA-Almacén', 14, 20); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...azul);
  doc.text('GUÍA DE SALIDA', W - 14, 17, { align: 'right' });
  doc.setFontSize(10); doc.setTextColor(60);
  doc.setFont('helvetica', 'normal');
  doc.text(`N.º de despacho: ${g.idDespacho || '—'}`, W - 14, 23, { align: 'right' });
  doc.text(`Orden: ${g.numero}${g.d.referencia !== '—' ? ' · ' + g.d.referencia : ''}   ·   ${g.fecha}`, W - 14, 28, { align: 'right' });
  doc.setDrawColor(...azul); doc.setLineWidth(0.6); doc.line(14, 32, W - 14, 32);

  // Datos del cliente
  doc.autoTable({
    startY: 36, theme: 'grid', styles: { fontSize: 9.5, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [240, 243, 248], cellWidth: 34 }, 2: { fontStyle: 'bold', fillColor: [240, 243, 248], cellWidth: 30 } },
    body: [
      ['Cliente', g.d.cliente || '—', 'Sede / entrega', g.d.sede || '—'],
      ['Orden de compra', g.d.oc || '—', 'Empresa', g.d.empresa ? `${g.d.empresa.nombre} · RUC ${g.d.empresa.ruc}` : '—']
    ].concat(g.estado ? [['Estado de la orden', { content: g.estado, colSpan: 3 }]] : [])
  });

  // Productos
  // (la fuente del PDF no tiene el símbolo ✓: se usa "OK" para la casilla de revisión)
  const head = ['Ítem', 'Código', 'Producto', 'Cantidad'].concat(g.conUbic ? ['Ubicación'] : []).concat(['OK']);
  const body = g.guia.map((x, i) => [i + 1, x.id, x.descripcion, fmt(x.cantidad)].concat(g.conUbic ? [x.ubicacion || ''] : []).concat(['']));
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 5, head: [head], body,
    foot: [[{ content: 'Total', colSpan: 3, styles: { halign: 'right' } }, fmt(g.total)].concat(g.conUbic ? [''] : []).concat([''])],
    theme: 'grid', styles: { fontSize: 9.5, cellPadding: 2.2 },
    headStyles: { fillColor: azul, textColor: 255 }, footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'center', cellWidth: 12 }, 1: { cellWidth: 20 }, 3: { halign: 'right', cellWidth: 26 } }
  });

  // Observaciones y firmas
  let y = doc.lastAutoTable.finalY + 8;
  if (g.d.notas && g.d.notas.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Observaciones', 14, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const lineas = doc.splitTextToSize(g.d.notas.join(' · '), W - 28);
    doc.text(lineas, 14, y + 5); y += 8 + lineas.length * 4.5;
  }
  y = Math.max(y + 18, 240);
  const anchoFirma = (W - 28 - 20) / 3;
  ['Despachado por (Almacén)', 'Transportista / placa', 'Recibido por (Cliente)'].forEach((t, i) => {
    const x = 14 + i * (anchoFirma + 10);
    doc.setDrawColor(120); doc.setLineWidth(0.3); doc.line(x, y, x + anchoFirma, y);
    doc.setFontSize(9); doc.setTextColor(60); doc.text(t, x + anchoFirma / 2, y + 5, { align: 'center' });
  });

  const nombre = `Guia_${g.idDespacho || g.numero}_${String(g.d.cliente || '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30)}.pdf`;
  return { blob: doc.output('blob'), nombre };
}

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function compartirGuiaPdf() {
  const btn = document.getElementById('guia-compartir');
  const textoBtn = btn.textContent;
  btn.disabled = true; btn.textContent = 'Preparando PDF…';
  try {
    const { blob, nombre } = await generarPdfGuia();
    const archivo = new File([blob], nombre, { type: 'application/pdf' });
    // En el celular abre el menú para compartir (WhatsApp, correo, Drive…); si no se puede, lo descarga
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: 'Guía de salida ' + (guiaActual.idDespacho || ''), text: 'Guía de salida ' + (guiaActual.idDespacho || '') + ' · ' + (guiaActual.d.cliente || '') });
    } else {
      descargarBlob(blob, nombre);
      alert('Este dispositivo no permite compartir directo: el PDF se descargó y puedes enviarlo desde tus archivos.');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // el usuario cerró el menú de compartir
    alert('No se pudo generar el PDF: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = textoBtn;
  }
}

async function descargarGuiaPdf() {
  try {
    const { blob, nombre } = await generarPdfGuia();
    descargarBlob(blob, nombre);
  } catch (e) {
    alert('No se pudo generar el PDF: ' + e.message);
  }
}
// ---------- Subir OC desde Excel y verificar stock ----------
function manejarArchivoOC(e) {
  const file = e.target.files[0];
  if (!file) return;

  document.getElementById('oc-preview-tbody').innerHTML = `<tr><td colspan="5">Leyendo archivo…</td></tr>`;

  Promise.all([
    catalogoOrdenes.length ? Promise.resolve(catalogoOrdenes) : fetch(`${API_URL}?action=articulos&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`${API_URL}?action=stock&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json())
  ]).then(([catalogo, stock]) => {
    catalogoOrdenes = catalogo;
    stockMapOc = {};
    stock.forEach((s) => { stockMapOc[s.id] = (stockMapOc[s.id] || 0) + (Number(s.disponible) || 0); });

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });

      ocLineas = filas
        .map((fila) => ({
          ref: String(fila.Ref || fila.REF || fila.ref || '').trim(),
          descripcionDetectada: String(fila.Descripcion || fila.DESCRIPCION || fila['Descripción'] || fila.descripcion || '').trim(),
          cantidadDetectada: Number(fila.Cantidad || fila.CANTIDAD || fila.cantidad || 0) || 0
        }))
        .filter((l) => l.descripcionDetectada && l.cantidadDetectada > 0)
        .map((l) => {
          const mejor = buscarMejorCoincidencia(l.descripcionDetectada);
          return {
            ...l,
            articuloSugeridoId: mejor ? mejor.ID : '',
            articuloSugeridoDescripcion: mejor ? mejor.DESCRIPCION : ''
          };
        });

      renderPreviewOC();
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  });
}

function normalizarTexto(txt) {
  return (txt || '').toString().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buscarMejorCoincidencia(descripcion) {
  const palabrasBuscadas = normalizarTexto(descripcion).split(' ').filter(Boolean);
  let mejor = null, mejorPuntaje = 0;
  catalogoOrdenes.forEach((a) => {
    const palabrasArticulo = normalizarTexto(a.DESCRIPCION || '').split(' ').filter(Boolean);
    const coincidencias = palabrasBuscadas.filter((p) => palabrasArticulo.indexOf(p) !== -1).length;
    if (coincidencias > mejorPuntaje) { mejorPuntaje = coincidencias; mejor = a; }
  });
  return mejor;
}

function renderPreviewOC() {
  const tbody = document.getElementById('oc-preview-tbody');

  if (!ocLineas.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">No se detectaron líneas válidas en el archivo.</td></tr>`;
    return;
  }

  const opcionesCatalogo = (idSeleccionado) =>
    `<option value="">— No identificado —</option>` +
    catalogoOrdenes.map((a) =>
      `<option value="${a.ID}" ${a.ID === idSeleccionado ? 'selected' : ''}>${a.ID} — ${a.DESCRIPCION || ''}</option>`
    ).join('');

  tbody.innerHTML = ocLineas.map((l, i) => `
    <tr data-idx="${i}">
      <td>
        <div style="font-size:11px; color:#888;">${l.ref || ''}</div>
        <div>${l.descripcionDetectada || ''}</div>
      </td>
      <td><input type="number" class="input-classic oc-cantidad-input" data-idx="${i}" value="${l.cantidadDetectada}" min="0" style="width:90px;" /></td>
      <td><select class="input-classic oc-producto-select" data-idx="${i}">${opcionesCatalogo(l.articuloSugeridoId)}</select></td>
      <td><span class="oc-stock-disponible" data-idx="${i}">—</span></td>
      <td><span class="badge oc-estado-badge" data-idx="${i}">—</span></td>
    </tr>`).join('');

  tbody.querySelectorAll('.oc-producto-select').forEach((el) => {
    el.addEventListener('change', () => recalcularLineaOC(Number(el.dataset.idx)));
  });
  tbody.querySelectorAll('.oc-cantidad-input').forEach((el) => {
    el.addEventListener('keyup', () => recalcularLineaOC(Number(el.dataset.idx)));
  });

  ocLineas.forEach((_, i) => recalcularLineaOC(i));
}

function recalcularLineaOC(idx) {
  const fila = document.querySelector(`#oc-preview-tbody tr[data-idx="${idx}"]`);
  if (!fila) return;

  const idArticulo = fila.querySelector('.oc-producto-select').value;
  const cantidad = parseInt(fila.querySelector('.oc-cantidad-input').value, 10) || 0;
  const stockSpan = fila.querySelector('.oc-stock-disponible');
  const badge = fila.querySelector('.oc-estado-badge');

  if (!idArticulo) {
    stockSpan.textContent = '—';
    badge.textContent = '❓ No identificado';
    badge.className = 'badge oc-estado-badge badge-neutral';
    return;
  }

  const disponible = stockMapOc[idArticulo] || 0;
  stockSpan.textContent = disponible;

  if (disponible >= cantidad) {
    badge.textContent = '✅ Suficiente';
    badge.className = 'badge oc-estado-badge badge-ok';
  } else {
    badge.textContent = '⚠️ Insuficiente';
    badge.className = 'badge oc-estado-badge badge-danger';
  }
}
