// app.js — Shell de la aplicación: navegación del sidebar y carga de módulos.
// Cada módulo vive en su propio archivo (modules/<nombre>.html + modules/<nombre>.js).
// Mientras un módulo no tenga archivo propio, se muestra un aviso de "próximamente".

const moduleNames = {
  stock: 'Stock',
  articulos: 'Artículos / Catálogo',
  ubicaciones: 'Ubicaciones',
  historial: 'Historial',
  tickets: 'Tickets de Fabricación',
  ordenes: 'Órdenes de Despacho',
  materiaprima: 'Materia Prima',
  operario: 'Producción — Operario',
  miavance: 'Mi Avance Sellador'
};

// Módulos que ya tienen su archivo modules/<nombre>.html + .js construidos.
// Cuando termines otro módulo, agrégalo aquí (ej. 'articulos').
const builtModules = ['stock', 'articulos','tickets', 'ordenes','ubicaciones','materiaprima','miavance','operario'];

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');

    const mod = item.dataset.module;
    document.getElementById('crumb-module').textContent = moduleNames[mod];
    loadModule(mod);
    closeSidebar(); // en móvil, se cierra el menú al elegir un módulo
  });
});

function loadModule(mod) {
  const container = document.getElementById('main-content');

  if (!builtModules.includes(mod)) {
    container.innerHTML = `
      <div class="module-title">${moduleNames[mod]}</div>
      <div class="module-subtitle">Este módulo todavía no está construido. Próximamente.</div>`;
    return;
  }

  container.innerHTML = `<div class="module-title">Cargando ${moduleNames[mod]}…</div>`;

     fetch(`modules/${mod}.html?_=${Date.now()}`)
    .then((r) => r.text())
    .then((html) => {
      container.innerHTML = html;
      // Cada módulo expone una función global initXxxModule() que arranca su lógica
      const initFn = window['init' + capitalize(mod) + 'Module'];
      if (typeof initFn === 'function') initFn();
    })
    .catch((err) => {
      container.innerHTML = `<div class="module-title">Error al cargar el módulo</div><div class="module-subtitle">${err.message}</div>`;
    });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ====== Sidebar móvil (menú hamburguesa) ======
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
    icon: '📦',
    modules: ['stock', 'articulos', 'ubicaciones', 'historial', 'tickets', 'ordenes', 'materiaprima']
  },
  operario: {
    label: 'Operario',
    icon: '🏭',
    modules: ['operario','miavance'] // en la Fase 3 aquí se agrega el módulo nuevo 'operario'
  }
};

function applyProfile(key) {
  const p = profiles[key];
  if (!p) return;
  localStorage.setItem('perfil_activo', key);

  document.querySelectorAll('.nav-item').forEach((i) => {
    i.style.display = p.modules.includes(i.dataset.module) ? '' : 'none';
    i.classList.remove('active');
  });

  const etiqueta = document.getElementById('perfil-actual-label');
  if (etiqueta) etiqueta.textContent = `${p.icon} Perfil: ${p.label}`;

  const primero = document.querySelector(`.nav-item[data-module="${p.modules[0]}"]`);
  if (primero) primero.click();
}

function mostrarSelectorPerfil() {
  if (document.getElementById('perfil-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'perfil-overlay';
  overlay.style.cssText =
    'position:fixed; inset:0; z-index:9999; background:#e9e6da; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; padding:20px;';

  overlay.innerHTML = `
    <div style="font-size:24px; font-weight:bold; color:#0a3d7a;">SGA-Almacén</div>
    <div style="font-size:16px;">¿Con qué perfil vas a trabajar?</div>
    <div style="display:flex; gap:24px; flex-wrap:wrap; justify-content:center;">
      <button data-perfil="almacenero" style="min-width:240px; min-height:140px; font-size:22px; font-weight:bold; color:#fff; background:#2E7D32; border:2px solid #1B5E20; cursor:pointer;">📦<br>Almacenero</button>
      <button data-perfil="operario" style="min-width:240px; min-height:140px; font-size:22px; font-weight:bold; color:#fff; background:#1565C0; border:2px solid #0D47A1; cursor:pointer;">🏭<br>Operario</button>
    </div>`;

  overlay.querySelectorAll('[data-perfil]').forEach((btn) => {
    btn.addEventListener('click', () => {
      overlay.remove();
      applyProfile(btn.dataset.perfil);
    });
  });

  document.body.appendChild(overlay);
}

// Etiqueta del perfil + botón "Cambiar perfil" al pie del sidebar
const perfilBox = document.createElement('div');
perfilBox.style.cssText = 'margin-top:auto; padding:12px; border-top:1px solid #c9c5b5; font-size:12px;';
perfilBox.innerHTML = `
  <div id="perfil-actual-label" style="font-weight:bold; margin-bottom:6px;"></div>
  <a id="perfil-cambiar" style="cursor:pointer; color:#2a5db0; text-decoration:underline;">Cambiar perfil</a>`;
sidebarEl.appendChild(perfilBox);
document.getElementById('perfil-cambiar').addEventListener('click', () => {
  localStorage.removeItem('perfil_activo');
  mostrarSelectorPerfil();
});

// ====== Arranque ======
const perfilGuardado = localStorage.getItem('perfil_activo');
if (perfilGuardado && profiles[perfilGuardado]) {
  applyProfile(perfilGuardado);
} else {
  mostrarSelectorPerfil();
}
