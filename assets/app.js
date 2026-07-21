// app.js — Shell de la aplicación: navegación del sidebar y carga de módulos.
// Cada módulo vive en su propio archivo (modules/<nombre>.html + modules/<nombre>.js).
// Mientras un módulo no tenga archivo propio, se muestra un aviso de "próximamente".

const moduleNames = {
  stock: 'Stock',
  articulos: 'Artículos / Catálogo',
  ubicaciones: 'Ubicaciones',
  historial: 'Historial'
};

// Módulos que ya tienen su archivo modules/<nombre>.html + .js construidos.
// Cuando termines otro módulo, agrégalo aquí (ej. 'articulos').
const builtModules = ['stock'];

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

  fetch(`modules/${mod}.html`)
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

// ====== Arranque: cargar el módulo inicial (Stock) ======
loadModule('stock');
