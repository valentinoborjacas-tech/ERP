let articulosData = [];

window.initArticulosModule = function () {
  fetchArticulos();

  document.getElementById('art-search-input').addEventListener('keyup', renderArticulosFiltered);
  document.getElementById('btn-nuevo-articulo').addEventListener('click', () => {
    document.getElementById('new-article-panel').classList.add('show');
  });
  document.getElementById('new-article-close').addEventListener('click', () => {
    document.getElementById('new-article-panel').classList.remove('show');
  });
  document.getElementById('new-article-confirm').addEventListener('click', crearArticuloNuevo);

  document.getElementById('articulos-tbody').addEventListener('click', handleArticulosClick);
  document.getElementById('movements-panel-close').addEventListener('click', () => {
    document.getElementById('movements-panel').classList.remove('show');
  });
  document.getElementById('btn-generar-reporte').addEventListener('click', abrirPanelReporte);
document.getElementById('report-panel-close').addEventListener('click', () => {
  document.getElementById('report-panel').classList.remove('show');
});
document.getElementById('report-select-all').addEventListener('change', toggleSeleccionarTodoReporte);
document.getElementById('report-tbody').addEventListener('change', actualizarContadorReporte);
document.getElementById('report-generar-pdf').addEventListener('click', generarPdfReporte);
  document.getElementById('btn-sugerido-compras').addEventListener('click', abrirPanelCompras);
document.getElementById('purchase-panel-close').addEventListener('click', () => {
  document.getElementById('purchase-panel').classList.remove('show');
});
document.getElementById('btn-descargar-plantilla').addEventListener('click', descargarPlantillaCompras);
document.getElementById('purchase-file-input').addEventListener('change', manejarArchivoCompras);
document.getElementById('purchase-buscar-producto').addEventListener('keyup', buscarProductoParaCompra);
document.getElementById('purchase-agregar-linea').addEventListener('click', agregarLineaManualCompra);
document.getElementById('btn-limpiar-lista-compras').addEventListener('click', limpiarListaCompras);
document.getElementById('purchase-generar-pdf').addEventListener('click', generarPdfCompras);
  
};

function fetchArticulos() {
  fetch(`${API_URL}?action=articulos&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      articulosData = data;
      renderArticulosFiltered();
    })
    .catch((err) => {
      document.getElementById('articulos-tbody').innerHTML = `<tr><td colspan="8">Error: ${err.message}</td></tr>`;
    });
}

function renderArticulosFiltered() {
  const term = (document.getElementById('art-search-input').value || '').toLowerCase();
  const filtrados = articulosData.filter((a) =>
    String(a.ID || '').toLowerCase().includes(term) ||
    String(a.DESCRIPCION || '').toLowerCase().includes(term)
  );

  document.getElementById('articulos-tbody').innerHTML = filtrados.length
    ? filtrados.map(articuloRowHtml).join('')
    : `<tr><td colspan="8">No se encontraron artículos.</td></tr>`;
}

function articuloRowHtml(a) {
  return `
    <tr data-id="${a.ID}">
      <td data-label="ID">${a.ID}</td>
      <td data-label="Descripción">${a.DESCRIPCION || ''}</td>
      <td data-label="Color">${a.COLOR || ''}</td>
      <td data-label="C/F">${a['C/F'] || ''}</td>
      <td data-label="Litraje">${a.LITRAJE || ''}</td>
      <td data-label="Stock mín.">${a.STOCK_MINIMO || 0}</td>
      <td data-label="Stock máx.">${a.STOCK_MAXIMO || 0}</td>
      <td data-label="Estado">${a.ESTADO || ''}</td>
      <td data-label="Acciones">
        <button class="btn-classic" style="padding:3px 8px; font-size:11.5px;" data-action="ver-movimientos">📜 Movimientos</button>
      </td>
    </tr>`;
}

function handleArticulosClick(e) {
  const btn = e.target.closest('[data-action="ver-movimientos"]');
  if (!btn) return;
  const row = e.target.closest('tr');
  abrirMovimientos(row.dataset.id);
}

function abrirMovimientos(id) {
  document.getElementById('movements-panel-item').textContent = id;
  document.getElementById('movements-panel').classList.add('show');
  const tbody = document.getElementById('movements-tbody');
  tbody.innerHTML = `<tr><td colspan="6">Cargando…</td></tr>`;

  fetch(`${API_URL}?action=movimientos&id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      tbody.innerHTML = data.length
        ? data.map((m) => `
            <tr>
              <td>${new Date(m.fecha).toLocaleString()}</td>
              <td>${m.tipo}</td>
              <td>${m.cantidad}</td>
              <td>${m.id_ubicacion}</td>
              <td>${m.motivo}</td>
              <td>${m.usuario}</td>
            </tr>`).join('')
        : `<tr><td colspan="6">Este producto todavía no tiene movimientos.</td></tr>`;
    })
    .catch((err) => {
      tbody.innerHTML = `<tr><td colspan="6">Error: ${err.message}</td></tr>`;
    });
}

function crearArticuloNuevo() {
  const nuevo = {
    ID: document.getElementById('na-id').value.trim(),
    DESCRIPCION: document.getElementById('na-descripcion').value.trim(),
    LITRAJE: document.getElementById('na-litraje').value,
    COLOR: document.getElementById('na-color').value,
    'C/F': document.getElementById('na-cf').value,
    ANCHO: document.getElementById('na-ancho').value,
    LARGO: document.getElementById('na-largo').value,
    ESPESOR: document.getElementById('na-espesor').value,
    PRESENTACION: document.getElementById('na-presentacion').value,
    STOCK_MINIMO: document.getElementById('na-stock-min').value,
    STOCK_MAXIMO: document.getElementById('na-stock-max').value,
    ESTADO: document.getElementById('na-estado').value,
    EMPRESA: document.getElementById('na-empresa').value,
    CLIENTE: document.getElementById('na-cliente').value
  };

  if (!nuevo.ID || !nuevo.DESCRIPCION) {
    alert('El ID y la Descripción son obligatorios.');
    return;
  }

  const confirmBtn = document.getElementById('new-article-confirm');
  confirmBtn.textContent = 'Guardando…';
  confirmBtn.disabled = true;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'crear_articulo', ...nuevo })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        document.getElementById('new-article-panel').classList.remove('show');
        // Limpia el formulario
        ['na-id','na-descripcion','na-litraje','na-color','na-cf','na-presentacion','na-ancho','na-largo','na-espesor','na-empresa','na-cliente']
          .forEach((id) => document.getElementById(id).value = '');
        fetchArticulos(); // recarga la lista con el nuevo producto ya incluido
      } else {
        alert('Error: ' + resultado.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
      .finally(() => {
      confirmBtn.textContent = '✔ Guardar artículo';
      confirmBtn.disabled = false;
    });
}

let reportStockData = [];

function abrirPanelReporte() {
  document.getElementById('report-panel').classList.add('show');
  document.getElementById('report-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('report-select-all').checked = false;

  const tbody = document.getElementById('report-tbody');
  tbody.innerHTML = `<tr><td colspan="7">Cargando…</td></tr>`;

  fetch(`${API_URL}?action=stock&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      reportStockData = data.filter((item) => item.disponible > 0);
      renderReporteTabla();
    })
    .catch((err) => {
      tbody.innerHTML = `<tr><td colspan="7">Error: ${err.message}</td></tr>`;
    });
}

function renderReporteTabla() {
  const tbody = document.getElementById('report-tbody');
  tbody.innerHTML = reportStockData.length
    ? reportStockData.map((item, i) => `
        <tr>
          <td><input type="checkbox" class="report-check" data-index="${i}" /></td>
          <td data-label="ID">${item.id}</td>
          <td data-label="Descripción">${item.descripcion}</td>
          <td data-label="Color">${item.color}</td>
          <td data-label="Stock">${item.disponible}</td>
          <td data-label="Ubicación">${item.ubicacion}</td>
          <td data-label="Almacén">${item.almacen}</td>
        </tr>`).join('')
    : `<tr><td colspan="7">No hay productos con stock disponible.</td></tr>`;
  actualizarContadorReporte();
}

function toggleSeleccionarTodoReporte(e) {
  document.querySelectorAll('.report-check').forEach((chk) => chk.checked = e.target.checked);
  actualizarContadorReporte();
}

function actualizarContadorReporte() {
  const total = document.querySelectorAll('.report-check:checked').length;
  document.getElementById('report-contador').textContent = `${total} seleccionados`;
}

function generarPdfReporte() {
  const seleccionados = [];
  document.querySelectorAll('.report-check:checked').forEach((chk) => {
    seleccionados.push(reportStockData[Number(chk.dataset.index)]);
  });

  if (!seleccionados.length) {
    alert('Selecciona al menos un producto.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(14);
  doc.text('Reporte de Stock Disponible', 14, 15);
  doc.setFontSize(10);
  doc.text('Generado: ' + new Date().toLocaleString(), 14, 21);

 doc.autoTable({
    startY: 26,
    head: [['ID', 'Descripción', 'Stock', 'Ubicación', 'Almacén']],
    body: seleccionados.map((item) => [
      item.id, item.descripcion, item.disponible, item.ubicacion, item.almacen
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [10, 61, 122] }
  });

  doc.save(`reporte-stock-${Date.now()}.pdf`);
}
let purchaseList = [];
let purchaseStockTotals = {};
let purchaseProductoSeleccionado = null;

function abrirPanelCompras() {
  document.getElementById('purchase-panel').classList.add('show');
  document.getElementById('purchase-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

  fetch(`${API_URL}?action=stock&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      purchaseStockTotals = {};
      data.forEach((item) => {
        purchaseStockTotals[item.id] = (purchaseStockTotals[item.id] || 0) + item.disponible;
      });
      renderTablaCompras();
    });
}

function descargarPlantillaCompras() {
  const filas = [['ID', 'DESCRIPCION', 'PEDIDO PASADO']];
  articulosData.forEach((a) => filas.push([a.ID, a.DESCRIPCION || '', '']));

  const ws = XLSX.utils.aoa_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
  XLSX.writeFile(wb, 'plantilla-sugerido-compras.xlsx');
}

function manejarArchivoCompras(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    const wb = XLSX.read(data, { type: 'array' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });

    filas.forEach((fila) => {
      const id = String(fila.ID || fila.Id || fila.id || '').trim();
      const descripcion = String(fila.DESCRIPCION || fila.Descripcion || fila.descripcion || '').trim();
      const pedido = Number(fila['PEDIDO PASADO'] || fila.PEDIDO_PASADO || fila.Pedido || 0) || 0;
      if (!id) return;
      agregarOActualizarLineaCompra(id, descripcion, pedido);
    });

    renderTablaCompras();
    e.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

function agregarOActualizarLineaCompra(id, descripcion, pedido) {
  const existente = purchaseList.find((l) => l.id === id);
  const desc = descripcion || (articulosData.find((a) => a.ID === id) || {}).DESCRIPCION || '';
  if (existente) {
    existente.pedido = pedido;
    existente.descripcion = desc || existente.descripcion;
  } else {
    purchaseList.push({ id, descripcion: desc, pedido });
  }
}

function buscarProductoParaCompra() {
  const term = document.getElementById('purchase-buscar-producto').value.toLowerCase();
  const resultadosDiv = document.getElementById('purchase-resultados-busqueda');
  if (!term) { resultadosDiv.innerHTML = ''; return; }

  const coincidencias = articulosData.filter((a) =>
    String(a.ID || '').toLowerCase().includes(term) || String(a.DESCRIPCION || '').toLowerCase().includes(term)
  ).slice(0, 6);

  resultadosDiv.innerHTML = coincidencias.length
    ? `<div style="position:absolute; z-index:10; background:#fff; border:1px solid var(--border-mid); width:100%; max-height:160px; overflow-y:auto;">` +
      coincidencias.map((a) => `<div class="nav-item" style="cursor:pointer;" data-id="${a.ID}" data-desc="${a.DESCRIPCION || ''}">${a.ID} — ${a.DESCRIPCION || ''}</div>`).join('') +
      `</div>`
    : '';

  resultadosDiv.querySelectorAll('[data-id]').forEach((el) => {
    el.addEventListener('click', () => {
      purchaseProductoSeleccionado = { id: el.dataset.id, descripcion: el.dataset.desc };
      document.getElementById('purchase-buscar-producto').value = `${el.dataset.id} — ${el.dataset.desc}`;
      resultadosDiv.innerHTML = '';
    });
  });
}

function agregarLineaManualCompra() {
  if (!purchaseProductoSeleccionado) { alert('Busca y selecciona un producto de la lista primero.'); return; }
  const pedido = parseInt(document.getElementById('purchase-cantidad').value, 10) || 0;
  agregarOActualizarLineaCompra(purchaseProductoSeleccionado.id, purchaseProductoSeleccionado.descripcion, pedido);
  renderTablaCompras();
  purchaseProductoSeleccionado = null;
  document.getElementById('purchase-buscar-producto').value = '';
  document.getElementById('purchase-cantidad').value = 0;
}

function renderTablaCompras() {
  const tbody = document.getElementById('purchase-tbody');
  tbody.innerHTML = purchaseList.length
    ? purchaseList.map((l, i) => {
        const stockActual = purchaseStockTotals[l.id] || 0;
        const aComprar = Math.max(0, l.pedido - stockActual);
        return `
          <tr>
            <td data-label="ID">${l.id}</td>
            <td data-label="Descripción">${l.descripcion}</td>
            <td data-label="Pedido deseado">${l.pedido}</td>
            <td data-label="Stock actual">${stockActual}</td>
            <td data-label="A comprar" style="font-weight:bold; color:${aComprar > 0 ? 'var(--danger)' : 'var(--ok)'};">${aComprar}</td>
            <td><span style="cursor:pointer; color:var(--danger);" data-quitar-compra="${i}">✕</span></td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="6" style="text-align:center; color:#888;">Sin productos agregados todavía</td></tr>`;

  tbody.querySelectorAll('[data-quitar-compra]').forEach((el) => {
    el.addEventListener('click', () => {
      purchaseList.splice(Number(el.dataset.quitarCompra), 1);
      renderTablaCompras();
    });
  });
}

function limpiarListaCompras() {
  purchaseList = [];
  renderTablaCompras();
}

function generarPdfCompras() {
  if (!purchaseList.length) { alert('Agrega al menos un producto a la lista.'); return; }

  const filasParaPdf = purchaseList.map((l) => {
    const stockActual = purchaseStockTotals[l.id] || 0;
    const aComprar = Math.max(0, l.pedido - stockActual);
    return [l.id, l.descripcion, l.pedido, stockActual, aComprar];
  });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(14);
  doc.text('Sugerido de Compras', 14, 15);
  doc.setFontSize(10);
  doc.text('Generado: ' + new Date().toLocaleString(), 14, 21);

  doc.autoTable({
    startY: 26,
    head: [['ID', 'Descripción', 'Pedido deseado', 'Stock actual', 'A comprar']],
    body: filasParaPdf,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [10, 61, 122] }
  });

  doc.save(`sugerido-compras-${Date.now()}.pdf`);
}

