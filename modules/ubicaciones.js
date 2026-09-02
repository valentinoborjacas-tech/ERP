let ubicacionesStockData = [];
let ubiHtml5QrCode = null;
let ubiScannerRunning = false;
let ubiPendingId = null;
let ubiCatalogo = [];
let ubiProductoSeleccionado = null;

window.initUbicacionesModule = function () {
  fetchStockParaUbicaciones();

  document.getElementById('btn-buscar-ubicacion').addEventListener('click', buscarUbicacion);
  document.getElementById('ubi-search-input').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') buscarUbicacion();
  });
  document.getElementById('btn-escanear-ubicacion').addEventListener('click', abrirScannerUbicacion);
  document.getElementById('ubi-scanner-close').addEventListener('click', cerrarScannerUbicacion);
  document.getElementById('ubicaciones-tbody').addEventListener('click', handleUbicacionesTablaClick);
  document.getElementById('ubi-resultado-tbody').addEventListener('click', handleUbiResultadoClick);
  document.getElementById('ubi-movements-close').addEventListener('click', () => {
  document.getElementById('ubi-movements-panel').classList.remove('show');
  });

  document.getElementById('ubi-qty-close').addEventListener('click', () => {
    document.getElementById('ubi-qty-panel').classList.remove('show');
  });
  document.getElementById('ubi-qty-confirm').addEventListener('click', confirmarSumaCantidad);

  document.getElementById('btn-agregar-producto-ubicacion').addEventListener('click', abrirPanelAgregarProducto);
  document.getElementById('ubi-add-close').addEventListener('click', () => {
    document.getElementById('ubi-add-panel').classList.remove('show');
  });
  document.getElementById('ubi-add-buscar').addEventListener('keyup', buscarProductoParaAgregar);
  document.getElementById('ubi-add-confirm').addEventListener('click', confirmarAgregarProducto);
};
function fetchStockParaUbicaciones() {
  fetch(`${API_URL}?action=stock&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      ubicacionesStockData = data;
      renderTablaUbicaciones();
    })
    .catch((err) => {
      document.getElementById('ubicaciones-tbody').innerHTML = `<tr><td colspan="3">Error: ${err.message}</td></tr>`;
    });
}
function abrirPanelCantidad(id) {
  ubiPendingId = id;
  document.getElementById('ubi-qty-item').textContent = id;
  document.getElementById('ubi-qty-panel').classList.add('show');
  document.getElementById('ubi-qty-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function confirmarSumaCantidad() {
  if (!ubiPendingId) return;
  const codigoUbicacion = document.getElementById('ubi-resultado-box').dataset.codigoActual;
  const cantidad = parseInt(document.getElementById('ubi-qty-input').value, 10) || 0;
  const motivo = document.getElementById('ubi-qty-motivo').value;
  const confirmBtn = document.getElementById('ubi-qty-confirm');

  confirmBtn.textContent = 'Guardando…';
  confirmBtn.disabled = true;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'movimiento',
      id_articulo: ubiPendingId,
      id_ubicacion: codigoUbicacion,
      tipo: 'Entrada',
      cantidad: cantidad,
      motivo: motivo,
      usuario: 'almacenero'
    })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        document.getElementById('ubi-qty-panel').classList.remove('show');
        fetchStockParaUbicaciones();
        setTimeout(() => mostrarProductosDeUbicacion(codigoUbicacion), 400);
      } else {
        alert('Error: ' + resultado.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => {
      confirmBtn.textContent = '✔ Confirmar';
      confirmBtn.disabled = false;
    });
}
function abrirPanelAgregarProducto() {
  const codigoUbicacion = document.getElementById('ubi-resultado-box').dataset.codigoActual;
  if (!codigoUbicacion) return;

  ubiProductoSeleccionado = null;
  document.getElementById('ubi-add-buscar').value = '';
  document.getElementById('ubi-add-resultados').innerHTML = '';
  document.getElementById('ubi-add-panel').classList.add('show');
  document.getElementById('ubi-add-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!ubiCatalogo.length) {
    fetch(`${API_URL}?action=articulos&_=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { ubiCatalogo = data; });
  }
}

function buscarProductoParaAgregar() {
  const term = document.getElementById('ubi-add-buscar').value.toLowerCase();
  const resultadosDiv = document.getElementById('ubi-add-resultados');
  if (!term) { resultadosDiv.innerHTML = ''; return; }

  const coincidencias = ubiCatalogo.filter((a) =>
    String(a.ID || '').toLowerCase().includes(term) || String(a.DESCRIPCION || '').toLowerCase().includes(term)
  ).slice(0, 6);

  resultadosDiv.innerHTML = coincidencias.length
    ? `<div style="position:absolute; z-index:10; background:#fff; border:1px solid var(--border-mid); width:100%; max-height:160px; overflow-y:auto;">` +
      coincidencias.map((a) => `<div class="nav-item" style="cursor:pointer;" data-id="${a.ID}" data-desc="${a.DESCRIPCION || ''}">${a.ID} — ${a.DESCRIPCION || ''}</div>`).join('') +
      `</div>`
    : '';

  resultadosDiv.querySelectorAll('[data-id]').forEach((el) => {
    el.addEventListener('click', () => {
      ubiProductoSeleccionado = el.dataset.id;
      document.getElementById('ubi-add-buscar').value = `${el.dataset.id} — ${el.dataset.desc}`;
      resultadosDiv.innerHTML = '';
    });
  });
}

function confirmarAgregarProducto() {
  if (!ubiProductoSeleccionado) { alert('Busca y selecciona un producto de la lista primero.'); return; }
  const codigoUbicacion = document.getElementById('ubi-resultado-box').dataset.codigoActual;
  const cantidad = parseInt(document.getElementById('ubi-add-cantidad').value, 10) || 0;
  const confirmBtn = document.getElementById('ubi-add-confirm');

  // El código de ubicación ya viene armado (ej. F1-M2-A-N2 o R1-N1);
  // lo separamos para reutilizar la misma función asignarUbicacion del backend.
  const partes = codigoUbicacion.split('-');
  const esAlmacen1 = partes.length === 2; // Mueble-Nivel
  const payload = esAlmacen1
    ? { almacen: 'Almacén 1', mueble: partes[0], nivel: partes[1] }
    : { almacen: 'Almacén 2', fila: partes[0], modulo: partes[1], lado: partes[2], nivel: partes[3] };

  confirmBtn.textContent = 'Guardando…';
  confirmBtn.disabled = true;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'asignar_ubicacion',
      id_articulo: ubiProductoSeleccionado,
      stock_inicial: cantidad,
      ...payload
    })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        document.getElementById('ubi-add-panel').classList.remove('show');
        fetchStockParaUbicaciones();
        setTimeout(() => mostrarProductosDeUbicacion(codigoUbicacion), 400);
      } else {
        alert('Error: ' + resultado.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => {
      confirmBtn.textContent = '✔ Agregar a esta ubicación';
      confirmBtn.disabled = false;
    });
}
function renderTablaUbicaciones() {
  const ubicacionesMap = {};
  ubicacionesStockData.forEach((item) => {
    if (item.ubicacion === 'Sin ubicar') return;
    if (!ubicacionesMap[item.ubicacion]) ubicacionesMap[item.ubicacion] = { productos: 0, total: 0 };
    ubicacionesMap[item.ubicacion].productos += 1;
    ubicacionesMap[item.ubicacion].total += item.disponible;
  });

  const codigos = Object.keys(ubicacionesMap).sort();
  document.getElementById('ubicaciones-tbody').innerHTML = codigos.length
    ? codigos.map((cod) => `
        <tr class="selectable" data-codigo="${cod}">
          <td data-label="Ubicación">${cod}</td>
          <td data-label="N° de productos">${ubicacionesMap[cod].productos}</td>
          <td data-label="Total disponible">${ubicacionesMap[cod].total}</td>
        </tr>`).join('')
    : `<tr><td colspan="3">Todavía no hay ubicaciones con productos asignados.</td></tr>`;
}

function handleUbicacionesTablaClick(e) {
  const row = e.target.closest('tr[data-codigo]');
  if (!row) return;
  document.getElementById('ubi-search-input').value = row.dataset.codigo;
  buscarUbicacion();
}

function buscarUbicacion() {
  const codigo = document.getElementById('ubi-search-input').value.trim();
  if (!codigo) return;
  mostrarProductosDeUbicacion(codigo);
}

function mostrarProductosDeUbicacion(codigo) {
  const productos = ubicacionesStockData.filter((item) => item.ubicacion === codigo);
  const box = document.getElementById('ubi-resultado-box');
  const tbody = document.getElementById('ubi-resultado-tbody');

  document.getElementById('ubi-resultado-codigo').textContent = codigo;
  document.getElementById('ubi-add-ubicacion').textContent = codigo;
  box.dataset.codigoActual = codigo;
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!productos.length) {
    tbody.innerHTML = `<tr><td colspan="5">No hay productos registrados en esta ubicación.</td></tr>`;
    return;
  }

  tbody.innerHTML = productos.map((p) => {
    const badgeClass = p.estado === 'Normal' ? 'badge-ok' : p.estado === 'Bajo mínimo' ? 'badge-warn' : 'badge-danger';
    return `
      <tr class="selectable" data-id="${p.id}">
        <td data-label="ID">${p.id}</td>
        <td data-label="Producto">${p.descripcion}</td>
        <td data-label="Cantidad">${p.disponible}</td>
        <td data-label="Estado"><span class="badge ${badgeClass}">${p.estado}</span></td>
        <td data-label="Acciones">
          <button class="btn-classic btn-icon-sm" style="width:auto; padding:0 8px;" data-action="sumar" data-id="${p.id}" title="Agregar cantidad">+ Cant.</button>
        </td>
      </tr>`;
  }).join('');
}
// ====== Escáner de código de barras (mismo motor que Stock, mismos ajustes de precisión) ======
function abrirScannerUbicacion() {
  document.getElementById('ubi-scanner-panel').classList.add('show');
  document.getElementById('ubi-scanner-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!ubiHtml5QrCode) {
    ubiHtml5QrCode = new Html5Qrcode('ubi-scanner-reader', {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.QR_CODE
      ],
      useBarCodeDetectorIfSupported: true
    });
  }

  const config = {
    fps: 20,
    qrbox: { width: 280, height: 110 },
    aspectRatio: 1.777,
    videoConstraints: {
      facingMode: 'environment',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' }]
    }
  };

  ubiHtml5QrCode.start(
    { facingMode: 'environment' },
    config,
    (decodedText) => {
      reproducirBeepUbicacion();
      document.getElementById('ubi-search-input').value = decodedText;
      cerrarScannerUbicacion();
      buscarUbicacion();
    },
    () => { /* frames sin detección, es normal */ }
  ).then(() => {
    ubiScannerRunning = true;
  }).catch((err) => {
    document.getElementById('ubi-scanner-panel').classList.remove('show');
    alert('No se pudo abrir la cámara: ' + err);
  });
}

function cerrarScannerUbicacion() {
  if (ubiHtml5QrCode && ubiScannerRunning) {
    ubiHtml5QrCode.stop().then(() => { ubiScannerRunning = false; }).catch(() => {});
  }
  document.getElementById('ubi-scanner-panel').classList.remove('show');
}

function reproducirBeepUbicacion() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscilador = ctx.createOscillator();
    const volumen = ctx.createGain();
    oscilador.connect(volumen);
    volumen.connect(ctx.destination);
    oscilador.type = 'sine';
    oscilador.frequency.value = 1000;
    volumen.gain.setValueAtTime(0.3, ctx.currentTime);
    volumen.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    oscilador.start();
    oscilador.stop(ctx.currentTime + 0.15);
  } catch (err) {
    console.warn('No se pudo reproducir el beep:', err);
  }
}
 function handleUbiResultadoClick(e) {
  const btnSumar = e.target.closest('[data-action="sumar"]');
  if (btnSumar) {
    abrirPanelCantidad(btnSumar.dataset.id);
    return;
  }
  const row = e.target.closest('tr[data-id]');
  if (row) abrirMovimientosUbicacion(row.dataset.id);
}

function abrirMovimientosUbicacion(id) {
  const panel = document.getElementById('ubi-movements-panel');
  document.getElementById('ubi-movements-item').textContent = id;
  panel.classList.add('show');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const tbody = document.getElementById('ubi-movements-tbody');
  tbody.innerHTML = `<tr><td colspan="6">Cargando…</td></tr>`;

  fetch(`${API_URL}?action=movimientos&id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      tbody.innerHTML = data.length
        ? data.map((m) => `
            <tr>
              <td data-label="Fecha">${new Date(m.fecha).toLocaleString()}</td>
              <td data-label="Tipo">${m.tipo}</td>
              <td data-label="Cantidad">${m.cantidad}</td>
              <td data-label="Ubicación">${m.id_ubicacion}</td>
              <td data-label="Motivo">${m.motivo}</td>
              <td data-label="Usuario">${m.usuario}</td>
            </tr>`).join('')
        : `<tr><td colspan="6">Este producto todavía no tiene movimientos.</td></tr>`;
    })
    .catch((err) => {
      tbody.innerHTML = `<tr><td colspan="6">Error: ${err.message}</td></tr>`;
    });
}
