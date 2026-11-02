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
  document.getElementById('dispatch-todo').addEventListener('click', despacharTodoLoQueHay);

  document.getElementById('order-view-close').addEventListener('click', () => {
    document.getElementById('order-view-panel').classList.remove('show');
  });

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
  // Una orden despachada en parte sigue abierta para despachar lo que falta
  const botonDespacho = o.estado === 'Despachada'
    ? ''
    : `<button class="btn-classic" style="padding:3px 8px; font-size:11.5px;" data-action="preparar" data-numero="${o.numero}">📦 ${o.estado === 'Pendiente' ? 'Preparar' : 'Despachar lo que falta'}</button>`;
  // Las órdenes ya despachadas (en parte o completas) se pueden seguir consultando
  const botonVer = o.estado === 'Pendiente'
    ? ''
    : `<button class="btn-classic" style="padding:3px 8px; font-size:11.5px;" data-action="ver" data-numero="${o.numero}">👁 Ver</button>`;
  const botonHoja = `<button class="btn-classic" style="padding:3px 8px; font-size:11.5px;" data-action="hoja" data-numero="${o.numero}" title="Imprimir la hoja de la orden">🖨 Hoja</button>`;
  const accion = `<div class="row-actions" style="flex-wrap:wrap;">${botonDespacho}${botonVer}${botonHoja}</div>`;

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
  if (btn) { abrirDespacho(btn.dataset.numero); return; }
  const btnVer = e.target.closest('[data-action="ver"]');
  if (btnVer) { abrirVerOrden(btnVer.dataset.numero); return; }
  const btnHoja = e.target.closest('[data-action="hoja"]');
  if (btnHoja) imprimirHojaOrden(btnHoja.dataset.numero);
}

// ---------- Ver una orden ya despachada (solo consulta) ----------
let despachosVista = [];

function abrirVerOrden(numero) {
  const orden = ordenesData.find((o) => o.numero === numero);
  const panel = document.getElementById('order-view-panel');
  document.getElementById('order-view-numero').textContent = numero;
  document.getElementById('order-view-info').textContent =
    (orden ? orden.solicitante + ' · ' + orden.estado : '') + (orden && orden.observaciones ? ' · ' + orden.observaciones : '');
  document.getElementById('order-view-tbody').innerHTML = `<tr><td colspan="7">Cargando…</td></tr>`;
  document.getElementById('order-view-despachos').innerHTML = '';
  panel.classList.add('show');
  panel.dataset.numero = numero;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  fetch(`${API_URL}?action=orden_detalle&numero=${encodeURIComponent(numero)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then(renderVerOrdenDetalle)
    .catch((err) => {
      document.getElementById('order-view-tbody').innerHTML = `<tr><td colspan="7">Error: ${err.message}</td></tr>`;
    });

  fetch(`${API_URL}?action=despachos&numero=${encodeURIComponent(numero)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => renderVerOrdenDespachos(Array.isArray(data) ? data : []))
    .catch(() => renderVerOrdenDespachos([]));
}

function renderVerOrdenDetalle(detalle) {
  const badgeLinea = { Despachado: 'badge-ok', Parcial: 'badge-warn' };
  document.getElementById('order-view-tbody').innerHTML = detalle.length
    ? detalle.map((l) => {
        const solicitado = Number(l.cantidadSolicitada) || 0;
        const despachado = Number(l.cantidadDespachada) || 0;
        return `
          <tr>
            <td data-label="ID">${l.idArticulo}</td>
            <td data-label="Descripción">${l.descripcion}</td>
            <td data-label="Solicitado">${solicitado}</td>
            <td data-label="Despachado">${despachado || '—'}</td>
            <td data-label="Falta"><strong>${Math.max(solicitado - despachado, 0)}</strong></td>
            <td data-label="Ubicación">${l.idUbicacion || '—'}</td>
            <td data-label="Estado"><span class="badge ${badgeLinea[l.estadoLinea] || 'badge-neutral'}">${l.estadoLinea || 'Pendiente'}</span></td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="7">Esta orden no tiene productos registrados.</td></tr>`;
}

function renderVerOrdenDespachos(lineas) {
  despachosVista = lineas;
  const ids = [...new Set(lineas.map((l) => l.idDespacho))];
  const cont = document.getElementById('order-view-despachos');
  cont.innerHTML = ids.length
    ? `<div class="field-label" style="margin:12px 0 6px;">Despachos realizados</div>` +
      ids.map((id) => {
        const delDespacho = lineas.filter((l) => l.idDespacho === id);
        const resumen = delDespacho.map((l) => `${l.descripcion} (${l.cantidad})`).join(', ');
        return `
          <div class="flex items-center justify-between gap-2 mb-2" style="flex-wrap:wrap;">
            <span><strong>${id}</strong> · ${new Date(delDespacho[0].fecha).toLocaleString()} · ${resumen}</span>
            <button class="btn-classic" data-reimprimir="${id}">🖨️ Ver guía</button>
          </div>`;
      }).join('')
    : '';

  cont.querySelectorAll('[data-reimprimir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delDespacho = despachosVista.filter((l) => l.idDespacho === btn.dataset.reimprimir);
      const guia = delDespacho.map((l) => ({ id: l.idArticulo, descripcion: l.descripcion, cantidad: l.cantidad, ubicacion: l.idUbicacion }));
      mostrarGuia(delDespacho[0].numero, guia, btn.dataset.reimprimir);
      document.getElementById('guia-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
function abrirDespacho(numero) {
  document.getElementById('dispatch-panel-numero').textContent = numero;
  document.getElementById('dispatch-panel').classList.add('show');
  document.getElementById('dispatch-panel').dataset.numero = numero;
  document.getElementById('dispatch-tbody').innerHTML = `<tr><td colspan="8">Cargando…</td></tr>`;

  Promise.all([
    fetch(`${API_URL}?action=orden_detalle&numero=${encodeURIComponent(numero)}&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`${API_URL}?action=stock&_=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json())
  ]).then(([detalle, stock]) => renderDespachoTabla(detalle, stock));
}

// Igual que en la hoja de papel: por cada producto, "✓ Completo" o la cantidad que sale.
// La columna "Falta" se calcula sola mientras se escribe.
function renderDespachoTabla(detalle, stock) {
  const tbody = document.getElementById('dispatch-tbody');
  tbody.innerHTML = detalle.map((linea) => {
    const despachado = Number(linea.cantidadDespachada) || 0;
    const pendiente = Math.max((Number(linea.cantidadSolicitada) || 0) - despachado, 0);

    // Producto ya completo: se muestra, pero no se puede volver a despachar
    if (pendiente <= 0) {
      return `
      <tr style="color:#888;">
        <td>${linea.idArticulo}</td>
        <td>${linea.descripcion}</td>
        <td>${linea.cantidadSolicitada}</td>
        <td>${despachado}</td>
        <td class="col-disponible">—</td>
        <td>—</td>
        <td><span class="badge badge-ok">Ya salió todo</span></td>
        <td>0</td>
      </tr>`;
    }

    // IDs como texto: el stock puede venir como número (22) y el detalle como texto ("22")
    const ubicacionesDisponibles = stock.filter((s) => String(s.id) === String(linea.idArticulo) && s.ubicacion !== 'Sin ubicar' && s.disponible > 0);
    const totalDisponible = ubicacionesDisponibles.reduce((sum, u) => sum + u.disponible, 0);

    const opcionesUbicacion = ubicacionesDisponibles.length
      ? ubicacionesDisponibles.map((u) => `<option value="${u.ubicacion}" data-disp="${u.disponible}">${u.ubicacion} (${u.disponible} disp.)</option>`).join('')
      : `<option value="" data-disp="0">Sin stock ubicado</option>`;

    return `
      <tr data-id="${linea.idArticulo}" data-descripcion="${linea.descripcion}" data-pendiente="${pendiente}">
        <td>${linea.idArticulo}</td>
        <td>${linea.descripcion}</td>
        <td>${linea.cantidadSolicitada}</td>
        <td>${despachado || '—'}</td>
        <td class="col-disponible">${totalDisponible}${totalDisponible < pendiente ? ' ⚠️' : ''}</td>
        <td><select class="input-classic disp-ubicacion"${ubicacionesDisponibles.length ? '' : ' disabled'}>${opcionesUbicacion}</select></td>
        <td>
          <div class="disp-sale">
            <button type="button" class="btn-classic disp-completo"${ubicacionesDisponibles.length ? '' : ' disabled'}>✓ Completo</button>
            <input type="number" class="input-classic disp-cantidad" value="" placeholder="0" min="0" max="${pendiente}" inputmode="numeric"${ubicacionesDisponibles.length ? '' : ' disabled'} />
          </div>
        </td>
        <td class="disp-falta"><strong>${pendiente}</strong></td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach((fila) => {
    fila.querySelector('.disp-cantidad').addEventListener('input', () => actualizarFaltaFila(fila));
    fila.querySelector('.disp-ubicacion').addEventListener('change', () => actualizarFaltaFila(fila));
    fila.querySelector('.disp-completo').addEventListener('click', () => {
      fila.querySelector('.disp-cantidad').value = fila.dataset.pendiente;
      actualizarFaltaFila(fila);
    });
  });
}

function stockUbicacionFila(fila) {
  const sel = fila.querySelector('.disp-ubicacion');
  const opt = sel.options[sel.selectedIndex];
  return opt ? Number(opt.dataset.disp) || 0 : 0;
}

function actualizarFaltaFila(fila) {
  const pendiente = Number(fila.dataset.pendiente) || 0;
  const input = fila.querySelector('.disp-cantidad');
  let sale = parseInt(input.value, 10) || 0;
  if (sale > pendiente) { sale = pendiente; input.value = pendiente; }
  const falta = Math.max(pendiente - sale, 0);
  const celda = fila.querySelector('.disp-falta');
  celda.innerHTML = `<strong style="color:${falta > 0 ? 'var(--danger)' : 'var(--ok)'};">${falta}</strong>`;
  const sinStock = sale > stockUbicacionFila(fila);
  input.style.borderColor = sinStock ? 'var(--danger)' : '';
  input.title = sinStock ? 'En esa ubicación no hay suficiente stock' : '';
  fila.querySelector('.disp-completo').classList.toggle('btn-primary', sale > 0 && sale === pendiente);
}

// Llena cada producto con lo que hay: todo lo pedido si alcanza el stock, o lo disponible en su ubicación
function despacharTodoLoQueHay() {
  document.querySelectorAll('#dispatch-tbody tr[data-id]').forEach((fila) => {
    if (fila.querySelector('.disp-cantidad').disabled) return;
    fila.querySelector('.disp-cantidad').value = Math.min(Number(fila.dataset.pendiente) || 0, stockUbicacionFila(fila));
    actualizarFaltaFila(fila);
  });
}

function confirmarDespacho() {
  const numero = document.getElementById('dispatch-panel').dataset.numero;
  const lineas = [];
  const sinStock = [];

  document.querySelectorAll('#dispatch-tbody tr[data-id]').forEach((fila) => {
    const cantidad = parseInt(fila.querySelector('.disp-cantidad').value, 10) || 0;
    if (cantidad <= 0) return;
    if (cantidad > stockUbicacionFila(fila)) sinStock.push(fila.dataset.descripcion);
    lineas.push({
      idArticulo: fila.dataset.id,
      descripcion: fila.dataset.descripcion,
      idUbicacion: fila.querySelector('.disp-ubicacion').value,
      cantidadDespachar: cantidad
    });
  });

  if (!lineas.length) { alert('No hay cantidades a despachar. Toca "✓ Completo" o escribe cuánto sale.'); return; }
  if (sinStock.length) { alert('En la ubicación elegida no hay suficiente stock de:\n- ' + sinStock.join('\n- ') + '\n\nCambia la ubicación o pon una cantidad menor.'); return; }
  const resumen = lineas.map((l) => `${l.descripcion}: ${l.cantidadDespachar}`).join('\n');
  if (!confirm('¿Confirmas que sale esto en el camión?\n\n' + resumen)) return;

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
        mostrarGuia(numero, resultado.guia, resultado.idDespacho, resultado.estado);
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
      // Documento "vivo": Sale / ✓ / Falta se llenan con lo ya despachado;
      // si un producto aún no tiene despachos, quedan en blanco para escribir a mano
      let filas = detalle.map((l, i) => {
        const pedido = Number(l.cantidadSolicitada) || 0;
        const salio = Number(l.cantidadDespachada) || 0;
        const completo = salio > 0 && salio >= pedido;
        const sale = salio <= 0 ? '' : (completo ? 'COMPLETO' : fmt(salio));
        const falta = salio <= 0 ? '' : (completo ? '—' : fmt(pedido - salio));
        return `<tr><td class="hoja-centro">${i + 1}</td><td>${escHoja(l.idArticulo)}</td><td>${escHoja(l.descripcion)}</td>` +
          `<td class="hoja-num">${fmt(pedido)}</td>` +
          `<td class="${completo ? 'hoja-completo' : 'hoja-num'}">${sale}</td>` +
          `<td class="hoja-completo">${completo ? '✓' : ''}</td>` +
          `<td class="${falta && falta !== '—' ? 'hoja-faltante' : 'hoja-centro'}">${falta}</td></tr>`;
      }).join('');
      for (let i = detalle.length; i < HOJA_FILAS_MIN; i++) filas += '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';

      const despachosLineas = Array.isArray(despachosRaw) ? despachosRaw : [];
      const despachos = [...new Set(despachosLineas.map((x) => x.idDespacho))].map((id) => {
        const primera = despachosLineas.find((x) => x.idDespacho === id);
        return id + ' · ' + new Date(primera.fecha).toLocaleDateString('es-PE');
      });
      const estadoClase = { 'Pendiente': 'pendiente', 'Despachada parcial': 'parcial', 'Despachada': 'completado' }[orden.estado] || 'pendiente';
      const estadoTexto = { 'Pendiente': 'PENDIENTE', 'Despachada parcial': 'PARCIAL', 'Despachada': 'COMPLETADA' }[orden.estado] || String(orden.estado || '').toUpperCase();

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
              <th style="width:100px;">Sale (o Completo)</th><th style="width:30px;">✓</th><th style="width:80px;">Falta</th>
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

      // Imprime solo la hoja (el CSS de impresión oculta todo lo demás)
      document.body.classList.add('imprimiendo-hoja');
      const quitar = () => { document.body.classList.remove('imprimiendo-hoja'); window.removeEventListener('afterprint', quitar); };
      window.addEventListener('afterprint', quitar);
      const img = cont.querySelector('img');
      const imprimir = () => setTimeout(() => window.print(), 100);
      if (img && !img.complete) { img.onload = imprimir; img.onerror = imprimir; } else imprimir();
    })
    .catch((err) => alert('No se pudo cargar la orden: ' + err.message));
}

// ---------- Guía imprimible ----------
function mostrarGuia(numero, guia, idDespacho, estado) {
  const orden = ordenesData.find((o) => o.numero === numero);
  document.getElementById('guia-numero').textContent =
    (idDespacho ? idDespacho + ' · ' : '') + 'Orden ' + numero + (estado ? ' (' + estado + ')' : '');
  document.getElementById('guia-fecha').textContent = new Date().toLocaleString();
  document.getElementById('guia-solicitante').textContent = 'Solicitante: ' + (orden ? orden.solicitante : '');
  // Solo lo que sube al camión, con una casilla para marcar al cargar
  document.getElementById('guia-tbody').innerHTML = guia.map((g) => `
    <tr><td>${g.id}</td><td>${g.descripcion}</td><td><strong>${g.cantidad}</strong></td><td>${g.ubicacion}</td><td style="width:40px;"></td></tr>
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
