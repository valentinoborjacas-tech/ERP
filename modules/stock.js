// modules/stock.js — Lógica del módulo Stock.
// Se conecta al Apps Script (API_URL, definido en assets/config.js).

let stockData = [];
let pendingItem = null;   // { id, ubicacion, row }
let pendingAction = null; // 'Entrada' | 'Salida'

// Punto de entrada: app.js llama a esta función luego de inyectar modules/stock.html
window.initStockModule = function () {
  fetchStock();

  document.getElementById('btn-buscar-stock').addEventListener('click', renderFiltered);
  document.getElementById('stock-search-input').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') renderFiltered();
  });
  document.getElementById('stock-filter-estado').addEventListener('change', renderFiltered);

  document.getElementById('stock-tbody').addEventListener('click', handleTableClick);
  document.getElementById('quick-panel-close').addEventListener('click', closeQuickPanel);
  document.getElementById('quick-panel-confirm').addEventListener('click', confirmMovimiento);
  document.getElementById('location-panel-close').addEventListener('click', closeLocationPanel);
  document.getElementById('location-panel-confirm').addEventListener('click', confirmLocation);
  
};

// ====== Traer datos desde el Apps Script ======
function fetchStock() {
  setStatus('Cargando stock…');
  const tbody = document.getElementById('stock-tbody');
  tbody.innerHTML = `<tr><td colspan="6">Cargando…</td></tr>`;

  fetch(`${API_URL}?action=stock`)
    .then((r) => r.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      stockData = data;
      renderFiltered();
      setStatus('Listo');
    })
    .catch((err) => {
      tbody.innerHTML = `<tr><td colspan="6">Error al cargar: ${err.message}. Revisa API_URL en assets/config.js.</td></tr>`;
      setStatus('Error al cargar stock');
    });
}

// ====== Filtrar y pintar la tabla ======
function renderFiltered() {
  const term = (document.getElementById('stock-search-input').value || '').toLowerCase();
  const estadoFiltro = document.getElementById('stock-filter-estado').value;

  const filtrados = stockData.filter((item) => {
    const campos = [item.id, item.descripcion, item.empresa, item.cliente, item.ancho, item.largo, item.espesor];
    const coincideTexto = campos.some((campo) => String(campo || '').toLowerCase().includes(term));
    const coincideEstado = !estadoFiltro || item.estado === estadoFiltro;
    return coincideTexto && coincideEstado;
  });

  const tbody = document.getElementById('stock-tbody');
  tbody.innerHTML = filtrados.length
    ? filtrados.map(rowHtml).join('')
    : `<tr><td colspan="11">No se encontraron artículos.</td></tr>`;

  updateMetrics();
}

function rowHtml(item) {
  const sinUbicar = item.ubicacion === 'Sin ubicar';
  const badgeClass = sinUbicar ? 'badge-neutral'
    : item.estado === 'Normal' ? 'badge-ok'
    : item.estado === 'Bajo mínimo' ? 'badge-warn'
    : 'badge-danger';

  const accionesHtml = sinUbicar
    ? `<button class="btn-classic btn-icon-sm" style="width:auto; padding:0 8px;" data-action="ubicar" title="Asignar ubicación">📍 Ubicar</button>`
    : `<div class="row-actions">
         <button class="btn-classic btn-icon-sm btn-ok" data-action="Entrada" title="Ingreso">↑</button>
         <button class="btn-classic btn-icon-sm btn-danger" data-action="Salida" title="Venta">↓</button>
       </div>`;

  return `
    <tr class="selectable" data-id="${item.id}" data-ubicacion="${item.ubicacion}">
      <td>${item.id}</td>
      <td>${item.descripcion}</td>
      <td>${item.ancho}</td>
      <td>${item.largo}</td>
      <td>${item.espesor}</td>
      <td>${item.empresa}</td>
      <td>${item.cliente}</td>
      <td>${item.ubicacion}</td>
      <td class="qty-cell">${item.disponible}</td>
      <td><span class="badge ${badgeClass}">${item.estado}</span></td>
      <td>${accionesHtml}</td>
    </tr>`;
}

function updateMetrics() {
  document.getElementById('metric-disponible').textContent =
    stockData.reduce((sum, i) => sum + i.disponible, 0);
  document.getElementById('metric-bajo-minimo').textContent =
    stockData.filter((i) => i.estado === 'Bajo mínimo').length;
  document.getElementById('metric-sin-stock').textContent =
    stockData.filter((i) => i.estado === 'Sin stock').length;
  document.getElementById('metric-sin-ubicar').textContent =
    stockData.filter((i) => i.estado === 'Sin ubicar').length;
}

// ====== Selección de fila y acciones rápidas ======
function handleTableClick(e) {
  const row = e.target.closest('tr');
  if (!row || !row.dataset.id) return;

  document.querySelectorAll('#stock-tbody tr').forEach((r) => r.classList.remove('row-selected'));
  row.classList.add('row-selected');

  const actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return;

  if (actionBtn.dataset.action === 'ubicar') {
    pendingItem = { id: row.dataset.id, ubicacion: row.dataset.ubicacion, row };
    openLocationPanel();
  } else {
    pendingItem = { id: row.dataset.id, ubicacion: row.dataset.ubicacion, row };
    pendingAction = actionBtn.dataset.action;
    openQuickPanel();
  }
}

function openQuickPanel() {
  const panel = document.getElementById('quick-panel');
  const motivoSelect = document.getElementById('quick-panel-motivo');

  document.getElementById('quick-panel-item').textContent =
    `${pendingItem.id} (${pendingAction === 'Entrada' ? 'Ingreso' : 'Venta'})`;

  motivoSelect.innerHTML = pendingAction === 'Entrada'
    ? '<option>Compra / Reposición</option><option>Devolución</option><option>Ajuste de inventario</option>'
    : '<option>Venta</option><option>Ajuste de inventario</option>';

  panel.classList.add('show');
  document.getElementById('quick-panel-qty').focus();
}

function closeQuickPanel() {
  document.getElementById('quick-panel').classList.remove('show');
  pendingItem = null;
  pendingAction = null;
}

// ====== Confirmar movimiento: POST al Apps Script ======
function confirmMovimiento() {
  if (!pendingItem) return;

  const cantidad = parseInt(document.getElementById('quick-panel-qty').value, 10) || 0;
  const motivo = document.getElementById('quick-panel-motivo').value;
  const confirmBtn = document.getElementById('quick-panel-confirm');

  confirmBtn.textContent = 'Guardando…';
  confirmBtn.disabled = true;
  setStatus('Guardando movimiento…');

  // Nota: se envía el body como string (sin header Content-Type manual) para
  // que sea una "solicitud simple" y Apps Script la reciba sin problemas de CORS.
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'movimiento',
      id_articulo: pendingItem.id,
      id_ubicacion: pendingItem.ubicacion,
      tipo: pendingAction,
      cantidad: cantidad,
      motivo: motivo,
      usuario: 'admin' // por ahora fijo; más adelante se conecta a un login real
    })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        pendingItem.row.querySelector('.qty-cell').textContent = resultado.nuevoStock;
        const item = stockData.find((i) => i.id === pendingItem.id && i.ubicacion === pendingItem.ubicacion);
        if (item) item.disponible = resultado.nuevoStock;
        setStatus('Movimiento guardado');
      } else {
        setStatus('Error: ' + (resultado.error || 'no se pudo guardar'));
      }
      closeQuickPanel();
    })
    .catch((err) => {
      setStatus('Error de conexión: ' + err.message);
    })
    .finally(() => {
      confirmBtn.textContent = '✔ Confirmar';
      confirmBtn.disabled = false;
    });
}
function openLocationPanel() {
  document.getElementById('location-panel-item').textContent = `${pendingItem.id}`;
  document.getElementById('location-panel').classList.add('show');
}

function closeLocationPanel() {
  document.getElementById('location-panel').classList.remove('show');
  pendingItem = null;
}

function confirmLocation() {
  if (!pendingItem) return;
  const fila = document.getElementById('loc-fila').value;
  const modulo = document.getElementById('loc-modulo').value;
  const lado = document.getElementById('loc-lado').value;
  const nivel = document.getElementById('loc-nivel').value;
  const stockInicial = parseInt(document.getElementById('loc-stock-inicial').value, 10) || 0;
  const confirmBtn = document.getElementById('location-panel-confirm');

  confirmBtn.textContent = 'Guardando…';
  confirmBtn.disabled = true;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'asignar_ubicacion',
      id_articulo: pendingItem.id,
      fila: fila, modulo: modulo, lado: lado, nivel: nivel,
      stock_inicial: stockInicial
    })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        setStatus('Ubicación asignada: ' + resultado.id_ubicacion);
        fetchStock(); // recarga la tabla completa para reflejar el cambio
      } else {
        setStatus('Error: ' + (resultado.error || 'no se pudo asignar'));
      }
      closeLocationPanel();
    })
    .catch((err) => setStatus('Error de conexión: ' + err.message))
    .finally(() => {
      confirmBtn.textContent = '✔ Confirmar';
      confirmBtn.disabled = false;
    });
}
function setStatus(msg) {
  const el = document.getElementById('status-message');
  if (el) el.textContent = msg;
}
