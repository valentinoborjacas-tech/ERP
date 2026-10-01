let ordenesData = [];
let catalogoOrdenes = [];
let lineasNuevaOrden = [];
let productoSeleccionado = null;
let ocLineas = [];
let stockMapOc = {};

window.initOrdenesModule = function () {
  fetchOrdenes();

  document.getElementById('ord-search-input').addEventListener('keyup', renderOrdenesFiltered);
  document.getElementById('ord-filter-estado').addEventListener('change', renderOrdenesFiltered);

  document.getElementById('btn-nueva-orden').addEventListener('click', abrirNuevaOrden);
  document.getElementById('new-order-close').addEventListener('click', () => {
    document.getElementById('new-order-panel').classList.remove('show');
  });
  document.getElementById('no-buscar-producto').addEventListener('keyup', buscarProductoParaOrden);
  document.getElementById('no-agregar-linea').addEventListener('click', agregarLineaSeleccionada);
  document.getElementById('new-order-confirm').addEventListener('click', crearOrdenNueva);

  document.getElementById('ordenes-tbody').addEventListener('click', handleOrdenesClick);

  document.getElementById('dispatch-panel-close').addEventListener('click', () => {
  document.getElementById('dispatch-panel').classList.remove('show');
  });
  document.getElementById('dispatch-confirm').addEventListener('click', confirmarDespacho);

  document.getElementById('guia-panel-close').addEventListener('click', () => {
  document.getElementById('guia-panel').classList.remove('show');
  });
  document.getElementById('guia-imprimir').addEventListener('click', () => window.print());
  document.getElementById('btn-subir-oc').addEventListener('click', () => {
  document.getElementById('oc-panel').classList.add('show');
  });
  document.getElementById('oc-panel-close').addEventListener('click', () => {
    document.getElementById('oc-panel').classList.remove('show');
  });
  document.getElementById('oc-file-input').addEventListener('change', manejarArchivoOC);

  if (!catalogoOrdenes.length) {
    fetch(`${API_URL}?action=articulos&_=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { catalogoOrdenes = data; });
  }
};

function fetchOrdenes() {
  fetch(`${API_URL}?action=ordenes&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => { ordenesData = data; renderOrdenesFiltered(); })
    .catch((err) => {
      document.getElementById('ordenes-tbody').innerHTML = `<tr><td colspan="5">Error: ${err.message}</td></tr>`;
    });
}

function badgeEstadoOrden(estado) {
  if (estado === 'Pendiente') return 'badge-neutral';
  if (estado === 'Despachada parcial') return 'badge-warn';
  return 'badge-ok';
}

function renderOrdenesFiltered() {
  const term = (document.getElementById('ord-search-input').value || '').toLowerCase();
  const estadoFiltro = document.getElementById('ord-filter-estado').value;

  const filtradas = ordenesData.filter((o) => {
    const coincideTexto = !term || o.numero.toLowerCase().includes(term) || o.solicitante.toLowerCase().includes(term);
    const coincideEstado = !estadoFiltro || o.estado === estadoFiltro;
    return coincideTexto && coincideEstado;
  });

  document.getElementById('ordenes-tbody').innerHTML = filtradas.length
    ? filtradas.map(ordenRowHtml).join('')
    : `<tr><td colspan="5">No se encontraron órdenes.</td></tr>`;
}

function ordenRowHtml(o) {
  const accion = o.estado === 'Pendiente'
    ? `<button class="btn-classic" style="padding:3px 8px; font-size:11.5px;" data-action="preparar" data-numero="${o.numero}">📦 Preparar</button>`
    : `<span class="field-help" style="margin:0;">Procesada</span>`;

  return `
    <tr>
      <td data-label="N° Orden">${o.numero}</td>
      <td data-label="Fecha">${new Date(o.fecha).toLocaleString()}</td>
      <td data-label="Solicitante">${o.solicitante}</td>
      <td data-label="Estado"><span class="badge ${badgeEstadoOrden(o.estado)}">${o.estado}</span></td>
      <td data-label="Acciones">${accion}</td>
    </tr>`;
}

function handleOrdenesClick(e) {
  const btn = e.target.closest('[data-action="preparar"]');
  if (btn) abrirDespacho(btn.dataset.numero);
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
function abrirDespacho(numero) {
  document.getElementById('dispatch-panel-numero').textContent = numero;
  document.getElementById('dispatch-panel').classList.add('show');
  document.getElementById('dispatch-panel').dataset.numero = numero;
  document.getElementById('dispatch-tbody').innerHTML = `<tr><td colspan="6">Cargando…</td></tr>`;

  Promise.all([
    fetch(`${API_URL}?action=orden_detalle&numero=${encodeURIComponent(numero)}&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`${API_URL}?action=stock&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json())
  ]).then(([detalle, stock]) => renderDespachoTabla(detalle, stock));
}

function renderDespachoTabla(detalle, stock) {
  document.getElementById('dispatch-tbody').innerHTML = detalle.map((linea) => {
    const ubicacionesDisponibles = stock.filter((s) => s.id === linea.idArticulo && s.ubicacion !== 'Sin ubicar');
    const totalDisponible = ubicacionesDisponibles.reduce((sum, u) => sum + u.disponible, 0);

    const opcionesUbicacion = ubicacionesDisponibles.length
      ? ubicacionesDisponibles.map((u) => `<option value="${u.ubicacion}">${u.ubicacion} (${u.disponible} disp.)</option>`).join('')
      : `<option value="">Sin ubicación con stock</option>`;

    return `
      <tr data-id="${linea.idArticulo}" data-descripcion="${linea.descripcion}">
        <td>${linea.idArticulo}</td>
        <td>${linea.descripcion}</td>
        <td>${linea.cantidadSolicitada}</td>
        <td>${totalDisponible}${totalDisponible < linea.cantidadSolicitada ? ' ⚠️' : ''}</td>
        <td><select class="input-classic disp-ubicacion">${opcionesUbicacion}</select></td>
        <td><input type="number" class="input-classic disp-cantidad" value="${Math.min(linea.cantidadSolicitada, totalDisponible)}" min="0" style="width:80px;" /></td>
      </tr>`;
  }).join('');
}

function confirmarDespacho() {
  const numero = document.getElementById('dispatch-panel').dataset.numero;
  const lineas = [];

  document.querySelectorAll('#dispatch-tbody tr').forEach((fila) => {
    const cantidad = parseInt(fila.querySelector('.disp-cantidad').value, 10) || 0;
    if (cantidad <= 0) return;
    lineas.push({
      idArticulo: fila.dataset.id,
      descripcion: fila.dataset.descripcion,
      idUbicacion: fila.querySelector('.disp-ubicacion').value,
      cantidadDespachar: cantidad
    });
  });

  if (!lineas.length) { alert('No hay cantidades a despachar.'); return; }

  const confirmBtn = document.getElementById('dispatch-confirm');
  confirmBtn.textContent = 'Procesando…';
  confirmBtn.disabled = true;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'despachar_orden', numero, lineas, usuario: 'almacenero' })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        document.getElementById('dispatch-panel').classList.remove('show');
        mostrarGuia(numero, resultado.guia);
        fetchOrdenes();
      } else {
        alert('Error: ' + resultado.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => {
      confirmBtn.textContent = '✔ Confirmar despacho';
      confirmBtn.disabled = false;
    });
}

// ---------- Guía imprimible ----------
function mostrarGuia(numero, guia) {
  const orden = ordenesData.find((o) => o.numero === numero);
  document.getElementById('guia-numero').textContent = numero;
  document.getElementById('guia-fecha').textContent = new Date().toLocaleString();
  document.getElementById('guia-solicitante').textContent = 'Solicitante: ' + (orden ? orden.solicitante : '');
  document.getElementById('guia-tbody').innerHTML = guia.map((g) => `
    <tr><td>${g.id}</td><td>${g.descripcion}</td><td>${g.cantidad}</td><td>${g.ubicacion}</td></tr>
  `).join('');
  document.getElementById('guia-panel').classList.add('show');
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
