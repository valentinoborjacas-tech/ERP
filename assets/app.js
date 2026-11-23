// app.js — Marco de la aplicación: menú, barra inferior (celular), perfiles, carga de módulos,
// buscador global, indicador de conexión y contadores.
// Cada módulo vive en su propio archivo (modules/<nombre>.html + modules/<nombre>.js).

const moduleNames = {
  stock: 'Stock',
  articulos: 'Artículos',
  ubicaciones: 'Ubicaciones',
  historial: 'Historial',
  tickets: 'Tickets de fabricación',
  ordenes: 'Órdenes de despacho',
  materiaprima: 'Materia prima',
  operario: 'Producción',
  planta: 'En planta',
  miavance: 'Mi avance'
};
const moduleIcons = {
  stock: 'ti-chart-bar', articulos: 'ti-list-details', ubicaciones: 'ti-map-pin', historial: 'ti-history',
  tickets: 'ti-ticket', ordenes: 'ti-truck-delivery', materiaprima: 'ti-cylinder', operario: 'ti-tool',
  planta: 'ti-building-factory-2', miavance: 'ti-trending-up'
};
// Nombre corto para la barra inferior del celular
const moduleShort = { materiaprima: 'M. prima', planta: 'Planta', operario: 'Producción', miavance: 'Mi avance', ordenes: 'Órdenes', tickets: 'Tickets' };

// Módulos que ya tienen su archivo modules/<nombre>.html + .js construidos.
const builtModules = ['stock', 'articulos', 'tickets', 'ordenes', 'ubicaciones', 'materiaprima', 'miavance', 'operario', 'planta'];

let moduloActual = null;

function escApp(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ====== Navegación ======
function irAModulo(mod) {
  if (!moduleNames[mod]) return;
  moduloActual = mod;
  localStorage.setItem('modulo_activo', mod);
  document.querySelectorAll('.nav-item').forEach((i) => i.classList.toggle('active', i.dataset.module === mod));
  document.querySelectorAll('.bn-item').forEach((i) => i.classList.toggle('active', i.dataset.module === mod));
  document.getElementById('crumb-module').textContent = moduleNames[mod];
  document.title = `${moduleNames[mod]} · SGA-Almacén`;
  closeSidebar();
  return loadModule(mod);
}

document.querySelectorAll('.nav-item').forEach((item) => {
  item.setAttribute('role', 'button');
  item.setAttribute('tabindex', '0');
  item.addEventListener('click', () => irAModulo(item.dataset.module));
  item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irAModulo(item.dataset.module); } });
});

function loadModule(mod) {
  const container = document.getElementById('main-content');

  if (!builtModules.includes(mod)) {
    container.innerHTML = `
      <div class="vacio-modulo"><i class="ti ${moduleIcons[mod] || 'ti-hourglass'}"></i>
      <div class="module-title">${escApp(moduleNames[mod])}</div>
      <div class="module-subtitle">Este módulo todavía no está construido. Próximamente.</div></div>`;
    return Promise.resolve();
  }

  container.innerHTML = `<div class="cargando-modulo"><span class="spinner"></span>Cargando ${escApp(moduleNames[mod])}…</div>`;
  container.scrollTop = 0;
  window.scrollTo(0, 0);

  return fetch(`modules/${mod}.html?_=${Date.now()}`)
    .then((r) => r.text())
    .then((html) => {
      container.innerHTML = html;
      // Cada módulo expone una función global initXxxModule() que arranca su lógica
      const initFn = window['init' + capitalize(mod) + 'Module'];
      if (typeof initFn === 'function') initFn();
    })
    .catch((err) => {
      container.innerHTML = `<div class="module-title">Error al cargar el módulo</div><div class="module-subtitle">${escApp(err.message)}</div>`;
    });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ====== Menú lateral (celular y tablet vertical) ======
const sidebarEl = document.getElementById('sidebar');
const overlayEl = document.getElementById('sidebar-overlay');
const hamburgerBtn = document.getElementById('hamburger-btn');

function openSidebar() {
  sidebarEl.classList.add('open');
  overlayEl.classList.add('open');
}
function closeSidebar() {
  sidebarEl.classList.remove('open');
  overlayEl.classList.remove('open');
}
hamburgerBtn.addEventListener('click', () => {
  sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
});
overlayEl.addEventListener('click', closeSidebar);

// ====== Perfiles (Almacenero / Operario) ======
const profiles = {
  almacenero: {
    label: 'Almacenero',
    icon: 'ti-package',
    modules: ['stock', 'articulos', 'ubicaciones', 'historial', 'tickets', 'ordenes', 'materiaprima', 'planta', 'importar'],
    rapidos: ['stock', 'ordenes', 'materiaprima', 'planta'] // barra inferior del celular
  },
  operario: {
    label: 'Operario',
    icon: 'ti-tool',
    modules: ['operario', 'miavance'],
    rapidos: ['operario', 'miavance']
  }
};
let perfilActual = null;

function applyProfile(key) {
  const p = profiles[key];
  if (!p) return;
  perfilActual = key;
  localStorage.setItem('perfil_activo', key);
  document.body.dataset.perfil = key;

  document.querySelectorAll('.nav-item').forEach((i) => {
    i.style.display = p.modules.includes(i.dataset.module) ? '' : 'none';
    i.classList.remove('active');
  });
  // Títulos de grupo sin módulos visibles se ocultan
  document.querySelectorAll('.nav-grupo').forEach((g) => {
    let el = g.nextElementSibling, visible = false;
    while (el && !el.classList.contains('nav-grupo')) { if (el.style.display !== 'none') visible = true; el = el.nextElementSibling; }
    g.style.display = visible ? '' : 'none';
  });

  document.getElementById('perfil-chip-txt').textContent = p.label;
  document.querySelector('#perfil-chip .ti').className = `ti ${p.icon}`;
  construirBarraInferior(p);

  const moduloGuardado = localStorage.getItem('modulo_activo');
  const destino = (moduloGuardado && p.modules.includes(moduloGuardado)) ? moduloGuardado : p.modules[0];
  if (document.querySelector(`.nav-item[data-module="${destino}"]`)) {
    irAModulo(destino);
  } else {
    document.getElementById('main-content').innerHTML =
      '<div class="module-title">Sin módulos disponibles para este perfil</div>';
  }
  actualizarContadores();
}

function construirBarraInferior(p) {
  const nav = document.getElementById('bottom-nav');
  const items = p.rapidos.map((m) => `
    <button type="button" class="bn-item" data-module="${m}">
      <i class="ti ${moduleIcons[m]}"></i><span>${escApp(moduleShort[m] || moduleNames[m])}</span>
      ${m === 'ordenes' ? '<b class="bn-cnt" id="bn-cnt-ordenes"></b>' : ''}
    </button>`).join('');
  const mas = p.modules.filter((m) => moduleNames[m]).length > p.rapidos.length
    ? '<button type="button" class="bn-item" id="bn-mas"><i class="ti ti-dots"></i><span>Más</span></button>' : '';
  nav.innerHTML = items + mas;
  nav.style.setProperty('--bn-cols', p.rapidos.length + (mas ? 1 : 0));
  nav.querySelectorAll('.bn-item[data-module]').forEach((b) => b.addEventListener('click', () => irAModulo(b.dataset.module)));
  const btnMas = document.getElementById('bn-mas');
  if (btnMas) btnMas.addEventListener('click', openSidebar);
}

function mostrarSelectorPerfil() {
  if (document.getElementById('perfil-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'perfil-overlay';
  overlay.innerHTML = `
    <div class="po-caja">
      <div class="po-logo"><i class="ti ti-box"></i></div>
      <div class="po-titulo">SGA-Almacén</div>
      <div class="po-sub">¿Con qué perfil vas a trabajar?</div>
      <div class="po-opciones">
        <button data-perfil="almacenero" class="po-op po-almacen"><i class="ti ti-package"></i><b>Almacenero</b><span>Stock, órdenes, materia prima</span></button>
        <button data-perfil="operario" class="po-op po-operario"><i class="ti ti-tool"></i><b>Operario</b><span>Producción y mi avance</span></button>
      </div>
    </div>`;

  overlay.querySelectorAll('[data-perfil]').forEach((btn) => {
    btn.addEventListener('click', () => {
      overlay.remove();
      applyProfile(btn.dataset.perfil);
    });
  });

  document.body.appendChild(overlay);
}

document.getElementById('perfil-chip').addEventListener('click', () => {
  if (!confirm('¿Cambiar de perfil?')) return;
  localStorage.removeItem('perfil_activo');
  localStorage.removeItem('modulo_activo');
  mostrarSelectorPerfil();
});

// ====== Actualizar la pantalla actual ======
document.getElementById('btn-actualizar').addEventListener('click', () => {
  const btn = document.getElementById('btn-actualizar');
  btn.classList.add('girando');
  Promise.resolve(moduloActual ? loadModule(moduloActual) : null)
    .finally(() => setTimeout(() => btn.classList.remove('girando'), 400));
  actualizarContadores();
});

// ====== Indicador de conexión ======
// Mira todas las llamadas al servidor (API_URL): "Guardando…" mientras se envía algo,
// "Al día · hace X" cuando todo respondió bien, y aviso si algo falló o no hay internet.
const sync = { pendientesEnvio: 0, ultimoOk: null, error: false };

function pintarSync() {
  const el = document.getElementById('sync');
  const txt = document.getElementById('sync-txt');
  if (!el) return;
  let estado = 'ok', texto = 'Al día';
  if (!navigator.onLine) { estado = 'error'; texto = 'Sin internet'; }
  else if (sync.pendientesEnvio > 0) { estado = 'guardando'; texto = 'Guardando…'; }
  else if (sync.error) { estado = 'error'; texto = 'Sin conexión con el servidor'; }
  else if (!sync.ultimoOk) { estado = 'guardando'; texto = 'Conectando…'; }
  else {
    const seg = Math.round((Date.now() - sync.ultimoOk) / 1000);
    texto = seg < 45 ? 'Al día' : `Al día · hace ${seg < 3600 ? Math.round(seg / 60) + ' min' : Math.round(seg / 3600) + ' h'}`;
  }
  el.dataset.estado = estado;
  txt.textContent = texto;
  el.title = estado === 'error' ? 'Revisa tu conexión. Lo que no se guardó, vuelve a intentarlo.' : 'Todo se guarda automáticamente';
}

(function vigilarServidor() {
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = function (url, opciones) {
    const esApi = typeof API_URL !== 'undefined' && String(url && url.url || url).indexOf(API_URL) === 0;
    if (!esApi) return fetchOriginal(url, opciones);
    const esEnvio = opciones && String(opciones.method || '').toUpperCase() === 'POST';
    if (esEnvio) { sync.pendientesEnvio++; pintarSync(); }
    return fetchOriginal(url, opciones)
      .then((r) => { sync.ultimoOk = Date.now(); sync.error = !r.ok; return r; })
      .catch((err) => { sync.error = true; throw err; })
      .finally(() => { if (esEnvio) sync.pendientesEnvio--; pintarSync(); });
  };
})();
window.addEventListener('online', pintarSync);
window.addEventListener('offline', pintarSync);
setInterval(pintarSync, 30000);
pintarSync();

// ====== Avisos cortos (setStatus de los módulos) ======
(function avisosFlotantes() {
  const el = document.getElementById('status-message');
  let t = null;
  new MutationObserver(() => {
    const msg = el.textContent.trim();
    if (!msg || msg === 'Listo') { el.classList.remove('ver'); return; }
    el.classList.add('ver');
    clearTimeout(t);
    t = setTimeout(() => el.classList.remove('ver'), 3500);
  }).observe(el, { childList: true, characterData: true, subtree: true });
})();

// ====== Contadores del menú (órdenes activas) ======
// La usa también el módulo Órdenes cada vez que trae la lista (así no se pide dos veces)
function pintarContadorOrdenes(ords) {
  if (!Array.isArray(ords)) return;
  gsCache.ordenes = ords;
  const n = ords.filter((o) => ['Despachada', 'Cerrada'].indexOf(o.estado) === -1).length;
  ['cnt-ordenes', 'bn-cnt-ordenes'].forEach((id) => {
    const c = document.getElementById(id);
    if (c) { c.textContent = n || ''; c.title = n ? `${n} órdenes activas` : ''; }
  });
}

function actualizarContadores() {
  if (perfilActual !== 'almacenero') return;
  // Mientras llega la respuesta, el último número conocido (guardado por el módulo Órdenes)
  const cntVacio = !document.getElementById('cnt-ordenes').textContent;
  if (cntVacio) { try { const x = JSON.parse(localStorage.getItem('erp_ordenes_cache_v1') || 'null'); if (x && x.ordenes) pintarContadorOrdenes(x.ordenes); } catch (e) { /* nada */ } }
  // En Órdenes, el propio módulo trae la lista y actualiza el contador
  if (moduloActual === 'ordenes') return;
  fetch(`${API_URL}?action=ordenes&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then(pintarContadorOrdenes)
    .catch(() => {});
}
setInterval(() => { if (document.visibilityState === 'visible') actualizarContadores(); }, 120000);

// ====== Buscador global ======
// Busca a la vez en módulos, órdenes (cliente, sede, OC), materia prima y artículos.
// Los datos se piden una sola vez al abrir el buscador y se guardan unos minutos.
const gsCache = { ordenes: null, materiales: null, articulos: null, cargadoEn: 0, cargando: null };
let gsSeleccion = -1;
let gsResultadosActuales = [];

function gsNormalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function gsCargarDatos() {
  if (gsCache.cargando) return gsCache.cargando;
  if (gsCache.articulos && Date.now() - gsCache.cargadoEn < 5 * 60000) return Promise.resolve();
  const pedir = (accion) => fetch(`${API_URL}?action=${accion}&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  const acciones = perfilActual === 'almacenero' ? ['ordenes', 'materia_prima_stock', 'articulos'] : [];
  gsCache.cargando = Promise.all(acciones.map(pedir)).then(([ords, mats, arts]) => {
    if (Array.isArray(ords)) gsCache.ordenes = ords;
    if (Array.isArray(mats)) gsCache.materiales = mats;
    if (Array.isArray(arts)) gsCache.articulos = arts;
    gsCache.cargadoEn = Date.now();
  }).finally(() => { gsCache.cargando = null; gsBuscar(); });
  return gsCache.cargando;
}

// Datos de la orden que vienen de cobranzas: "Cliente: X · Sede: Y · OC cliente: Z"
function gsDatosOrden(o) {
  const d = { cliente: '', sede: '', oc: '' };
  String(o.observaciones || '').split(' · ').forEach((p) => {
    const m = p.match(/^(Cliente|Sede|OC cliente):\s*(.*)$/);
    if (m) d[{ 'Cliente': 'cliente', 'Sede': 'sede', 'OC cliente': 'oc' }[m[1]]] = m[2];
  });
  if (!d.cliente) d.cliente = String(o.solicitante || '').split(' · ')[1] || o.solicitante || '';
  return d;
}

function gsBuscar() {
  const input = document.getElementById('gs-input');
  const cont = document.getElementById('gs-resultados');
  const q = gsNormalizar(input.value.trim());
  const palabras = q.split(/\s+/).filter(Boolean);
  const coincide = (texto) => { const t = gsNormalizar(texto); return palabras.every((w) => t.includes(w)); };
  const perfil = profiles[perfilActual] || { modules: [] };

  if (!palabras.length) { cont.innerHTML = ''; cont.classList.remove('ver'); gsResultadosActuales = []; return; }

  const grupos = [];
  const mods = perfil.modules.filter((m) => moduleNames[m] && coincide(moduleNames[m]))
    .map((m) => ({ tipo: 'modulo', mod: m, icono: moduleIcons[m], titulo: moduleNames[m], sub: 'Ir al módulo' }));
  if (mods.length) grupos.push({ nombre: 'Módulos', items: mods });

  if (perfilActual === 'almacenero') {
    const ords = (gsCache.ordenes || []).filter((o) => {
      const d = gsDatosOrden(o);
      return coincide([o.numero, o.solicitante, d.cliente, d.sede, d.oc].join(' '));
    }).slice(-6).reverse().map((o) => {
      const d = gsDatosOrden(o);
      return { tipo: 'orden', numero: o.numero, icono: 'ti-truck-delivery', titulo: `${d.cliente || 'Orden'}${d.sede ? ' · ' + d.sede : ''}`, sub: `${o.numero} · ${o.estado}${d.oc ? ' · OC ' + d.oc : ''}` };
    });
    if (ords.length) grupos.push({ nombre: 'Órdenes', items: ords });

    const mats = (gsCache.materiales || []).filter((m) => coincide(`${m.id} ${m.descripcion}`)).slice(0, 5)
      .map((m) => ({ tipo: 'material', id: m.id, icono: 'ti-cylinder', titulo: m.descripcion, sub: `${m.id} · ${Number(m.stockActual || 0).toLocaleString('es-PE', { maximumFractionDigits: 1 })} kg · ${m.nBovinas} bovinas` }));
    if (mats.length) grupos.push({ nombre: 'Materia prima', items: mats });

    const arts = (gsCache.articulos || []).filter((a) => coincide(`${a.ID} ${a.DESCRIPCION} ${a.CLIENTE || ''}`)).slice(0, 6)
      .map((a) => ({ tipo: 'articulo', id: String(a.ID), icono: 'ti-list-details', titulo: a.DESCRIPCION || a.ID, sub: `ID ${a.ID}${a.CLIENTE ? ' · ' + a.CLIENTE : ''}` }));
    if (arts.length) grupos.push({ nombre: 'Artículos', items: arts });
  }

  gsResultadosActuales = [];
  let html = '';
  grupos.forEach((g) => {
    html += `<div class="gs-grupo">${escApp(g.nombre)}</div>`;
    g.items.forEach((it) => {
      const i = gsResultadosActuales.push(it) - 1;
      html += `<div class="gs-item" role="option" data-i="${i}"><i class="ti ${it.icono}"></i><div><b>${escApp(it.titulo)}</b><span>${escApp(it.sub)}</span></div></div>`;
    });
  });
  if (!html) {
    html = gsCache.cargando
      ? '<div class="gs-vacio"><span class="spinner"></span>Buscando…</div>'
      : `<div class="gs-vacio">Nada coincide con «${escApp(input.value.trim())}».</div>`;
  }
  cont.innerHTML = html;
  cont.classList.add('ver');
  gsSeleccion = gsResultadosActuales.length ? 0 : -1;
  gsMarcarSeleccion();
}

function gsMarcarSeleccion() {
  document.querySelectorAll('#gs-resultados .gs-item').forEach((el) => {
    const on = Number(el.dataset.i) === gsSeleccion;
    el.classList.toggle('sel', on);
    if (on) el.scrollIntoView({ block: 'nearest' });
  });
}

// Espera a que el módulo termine de cargar sus datos (para abrir una orden o un material)
function esperarQue(condicion, msMax = 8000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    (function revisar() {
      let ok = false;
      try { ok = condicion(); } catch (e) { ok = false; }
      if (ok || Date.now() - t0 > msMax) return resolve(ok);
      setTimeout(revisar, 150);
    })();
  });
}

function gsEscribirEn(idInput, texto) {
  const inp = document.getElementById(idInput);
  if (!inp) return;
  inp.value = texto;
  ['input', 'keyup'].forEach((ev) => inp.dispatchEvent(new Event(ev, { bubbles: true })));
}

function gsAbrir(it) {
  gsCerrar();
  if (!it) return;
  if (it.tipo === 'modulo') { irAModulo(it.mod); return; }
  if (it.tipo === 'orden') {
    irAModulo('ordenes').then(() => esperarQue(() => typeof ordenesData !== 'undefined' && ordenesData.length))
      .then(() => { if (typeof abrirVerOrden === 'function') abrirVerOrden(it.numero); });
    return;
  }
  if (it.tipo === 'material') {
    irAModulo('materiaprima').then(() => esperarQue(() => typeof mpStockData !== 'undefined' && mpStockData.length))
      .then(() => { gsEscribirEn('mp-search-input', it.id); if (typeof abrirDetalleBovinas === 'function') abrirDetalleBovinas(it.id); });
    return;
  }
  if (it.tipo === 'articulo') {
    irAModulo('articulos').then(() => esperarQue(() => typeof articulosData !== 'undefined' && articulosData.length))
      .then(() => gsEscribirEn('art-search-input', it.id));
  }
}

function gsCerrar() {
  const gs = document.getElementById('gs');
  const input = document.getElementById('gs-input');
  input.value = '';
  input.blur();
  document.getElementById('gs-resultados').classList.remove('ver');
  gs.classList.remove('abierto');
  document.body.classList.remove('gs-activo');
}

(function iniciarBuscador() {
  const gs = document.getElementById('gs');
  const input = document.getElementById('gs-input');
  const cont = document.getElementById('gs-resultados');
  const abrir = () => {
    gs.classList.add('abierto');
    document.body.classList.add('gs-activo');
    input.focus();
    gsCargarDatos();
  };

  input.addEventListener('focus', () => { gs.classList.add('abierto'); gsCargarDatos(); });
  input.addEventListener('input', gsBuscar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); gsSeleccion = Math.min(gsSeleccion + 1, gsResultadosActuales.length - 1); gsMarcarSeleccion(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); gsSeleccion = Math.max(gsSeleccion - 1, 0); gsMarcarSeleccion(); }
    else if (e.key === 'Enter') { e.preventDefault(); gsAbrir(gsResultadosActuales[gsSeleccion]); }
    else if (e.key === 'Escape') { gsCerrar(); }
  });
  cont.addEventListener('mousedown', (e) => e.preventDefault()); // que el clic no cierre antes de elegir
  cont.addEventListener('click', (e) => {
    const el = e.target.closest('.gs-item');
    if (el) gsAbrir(gsResultadosActuales[Number(el.dataset.i)]);
  });
  input.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement !== input) { cont.classList.remove('ver'); gs.classList.remove('abierto'); document.body.classList.remove('gs-activo'); }
  }, 150));

  document.getElementById('gs-abrir').addEventListener('click', abrir);
  document.getElementById('gs-cerrar').addEventListener('click', gsCerrar);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrir(); }
  });
})();

// ====== Arranque ======
const perfilGuardado = localStorage.getItem('perfil_activo');
if (perfilGuardado && profiles[perfilGuardado]) {
  applyProfile(perfilGuardado);
} else {
  mostrarSelectorPerfil();
}
