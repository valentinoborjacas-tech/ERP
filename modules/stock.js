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
  document.getElementById('btn-escanear').addEventListener('click', openScanner);
  document.getElementById('scanner-panel-close').addEventListener('click', closeScanner);
  document.getElementById('stock-filter-almacen').addEventListener('change', renderFiltered);
  document.getElementById('loc-almacen').addEventListener('change', toggleCamposAlmacen);
  document.getElementById('loc-referencia').addEventListener('input', actualizarPreviewPiso);
  document.getElementById('btn-ingreso-mercaderia').addEventListener('click', abrirIngresoMercaderia);
  document.getElementById('ingreso-panel-close').addEventListener('click', () => document.getElementById('ingreso-panel').classList.remove('show'));
  document.getElementById('ing-agregar-linea').addEventListener('click', () => agregarLineaIngreso(true));
  document.getElementById('ing-confirmar').addEventListener('click', confirmarIngresoMercaderia);
    ['filter-cliente','filter-medida','filter-ubicacion','filter-color','filter-ancho','filter-largo','filter-espesor']
  .forEach((id) => document.getElementById(id).addEventListener('keyup', renderFiltered));

document.getElementById('btn-limpiar-filtros').addEventListener('click', () => {
  document.getElementById('stock-search-input').value = '';
  document.getElementById('stock-filter-estado').value = '';
  ['filter-cliente','filter-medida','filter-ubicacion','filter-color','filter-ancho','filter-largo','filter-espesor']
    .forEach((id) => document.getElementById(id).value = '');
  renderFiltered();
});
  
};

// ====== Traer datos desde el Apps Script ======
function fetchStock() {
  setStatus('Cargando stock…');
  const tbody = document.getElementById('stock-tbody');
  tbody.innerHTML = `<tr><td colspan="6">Cargando…</td></tr>`;

  fetch(`${API_URL}?action=stock&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      stockData = data.map(normalizarMedidasItem);
      renderFiltered();
      setStatus('Listo');
    })
    .catch((err) => {
      tbody.innerHTML = `<tr><td colspan="6">Error al cargar: ${err.message}. Revisa API_URL en assets/config.js.</td></tr>`;
      setStatus('Error al cargar stock');
    });
}

// Google Sheets (configuración en español) convierte medidas como "1.8" en la fecha 1 de agosto,
// y llegan como "2026-08-01T05:00:00.000Z". Se recupera el número: día.mes → 1.8
function normalizarMedida(valor) {
  const s = String(valor == null ? '' : valor);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return valor;
  const d = new Date(s);
  if (isNaN(d.getTime())) return valor;
  return d.getDate() + '.' + (d.getMonth() + 1);
}

function normalizarMedidasItem(item) {
  ['espesor', 'ancho', 'largo', 'litraje'].forEach((k) => { item[k] = normalizarMedida(item[k]); });
  return item;
}

// ====== Filtrar y pintar la tabla ======
function renderFiltered() {
  const term = (document.getElementById('stock-search-input').value || '').toLowerCase();
  const estadoFiltro = document.getElementById('stock-filter-estado').value;
  const clienteFiltro = (document.getElementById('filter-cliente').value || '').toLowerCase();
  const medidaFiltro = (document.getElementById('filter-medida').value || '').toLowerCase();
  const ubicacionFiltro = (document.getElementById('filter-ubicacion').value || '').toLowerCase();
  const colorFiltro = (document.getElementById('filter-color').value || '').toLowerCase();
  const anchoFiltro = (document.getElementById('filter-ancho').value || '').toLowerCase();
  const largoFiltro = (document.getElementById('filter-largo').value || '').toLowerCase();
  const espesorFiltro = (document.getElementById('filter-espesor').value || '').toLowerCase();
  const almacenFiltro = document.getElementById('stock-filter-almacen').value;

  const filtrados = stockData.filter((item) => {
    const campos = [item.id, item.descripcion, item.empresa, item.cliente];
    const coincideTexto = !term || campos.some((c) => String(c || '').toLowerCase().includes(term));

    const coincide = (valor, filtro) => !filtro || String(valor || '').toLowerCase().includes(filtro);

    return coincideTexto
      && (!estadoFiltro || item.estado === estadoFiltro)
      && coincide(item.cliente, clienteFiltro)
      && coincide(item.litraje, medidaFiltro)
      && coincide(item.ubicacion, ubicacionFiltro)
      && coincide(item.color, colorFiltro)
      && coincide(item.ancho, anchoFiltro)
      && coincide(item.largo, largoFiltro)
      && coincide(item.espesor, espesorFiltro)
      && (!almacenFiltro || item.almacen === almacenFiltro);
  });

  const tbody = document.getElementById('stock-tbody');
  tbody.innerHTML = filtrados.length
    ? filtrados.map(rowHtml).join('')
    : `<tr><td colspan="13">No se encontraron artículos.</td></tr>`;

  updateMetrics();
}

function rowHtml(item) {
  const sinUbicar = item.ubicacion === 'Sin ubicar';
  const badgeClass = sinUbicar ? 'badge-neutral'
    : item.estado === 'Normal' ? 'badge-ok'
    : item.estado === 'Bajo mínimo' ? 'badge-warn'
    : 'badge-danger';

  // Sin ubicar: ingresar en rack o en palets en el piso. Con ubicación: ingreso/venta ahí,
  // o "📍+" para registrar el producto en otra ubicación (por ejemplo, un palet extra en el piso).
  const accionesHtml = sinUbicar
    ? `<button class="btn-classic btn-icon-sm" style="width:auto; padding:0 8px;" data-action="ubicar" title="Ingresar en rack o en palets en el piso">📍 Ingresar</button>`
    : `<div class="row-actions">
         <button class="btn-classic btn-icon-sm btn-ok" data-action="Entrada" title="Ingreso">↑</button>
         <button class="btn-classic btn-icon-sm btn-danger" data-action="Salida" title="Venta">↓</button>
         <button class="btn-classic btn-icon-sm" style="width:auto; padding:0 6px;" data-action="ubicar" title="Ingresar en otra ubicación (otro rack o palet en piso)">📍+</button>
       </div>`;

  return `
    <tr class="selectable" data-id="${item.id}" data-ubicacion="${item.ubicacion}">
      <td data-label="ID">${item.id}</td>
      <td data-label="Descripción">${item.descripcion}</td>
      <td data-label="Litraje">${item.litraje}</td>
      <td data-label="Color">${item.color}</td>
      <td data-label="C/F">${item.cf}</td>
      <td data-label="Ancho">${item.ancho}</td>
      <td data-label="Largo">${item.largo}</td>
      <td data-label="Espesor">${item.espesor}</td>
      <td data-label="Empresa">${item.empresa}</td>
      <td data-label="Cliente">${item.cliente}</td>
      <td data-label="Almacén">${item.almacen}</td>
      <td data-label="Ubicación">${item.ubicacion}</td>
      <td class="qty-cell" data-label="Disponible">${item.disponible}</td>
      <td data-label="Estado"><span class="badge ${badgeClass}">${item.estado}</span></td>
      <td data-label="Acciones">${accionesHtml}</td>
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

// ====== Origen de un ingreso de bolsas ======
// Todo ingreso debe decir de dónde viene y con qué documento, para la trazabilidad.
const ORIGENES_INGRESO = {
  'Producción propia':     { campo: 'N.º de ticket / parte de producción', ejemplo: 'Ej. TK-0153' },
  'Guía de proveedor':     { campo: 'N.º de guía', ejemplo: 'Ej. 001-4587', proveedor: true },
  'Devolución de cliente': { campo: 'Cliente y N.º de guía de devolución', ejemplo: 'Ej. SSAYS · 002-118' },
  'Ajuste de inventario':  { campo: 'Motivo del ajuste', ejemplo: 'Ej. Encontrado en conteo, palet junto a F2' }
};

function renderOrigenIngreso(contenedorId, prefijo) {
  const ultimo = localStorage.getItem('stock_ultimo_origen') || 'Producción propia';
  document.getElementById(contenedorId).innerHTML = `
    <div class="flex items-end gap-3 quick-panel-row" style="flex-wrap:wrap; margin-top:8px;">
      <div class="quick-panel-field" style="width:200px;">
        <label class="field-label">Origen del ingreso <span class="required-mark">*</span></label>
        <select class="input-classic" id="${prefijo}-origen">
          ${Object.keys(ORIGENES_INGRESO).map((o) => `<option${o === ultimo ? ' selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>
      <div class="quick-panel-field" style="flex:1; min-width:200px;">
        <label class="field-label" id="${prefijo}-doc-label"></label>
        <input class="input-classic" id="${prefijo}-doc" maxlength="80" />
      </div>
      <div class="quick-panel-field" style="width:180px;" id="${prefijo}-prov-box">
        <label class="field-label">Proveedor <span class="required-mark">*</span></label>
        <input class="input-classic" id="${prefijo}-prov" maxlength="40" />
      </div>
    </div>`;
  const actualizar = () => {
    const o = ORIGENES_INGRESO[document.getElementById(`${prefijo}-origen`).value];
    document.getElementById(`${prefijo}-doc-label`).innerHTML = `${o.campo} <span class="required-mark">*</span>`;
    document.getElementById(`${prefijo}-doc`).placeholder = o.ejemplo;
    document.getElementById(`${prefijo}-prov-box`).style.display = o.proveedor ? '' : 'none';
  };
  document.getElementById(`${prefijo}-origen`).addEventListener('change', actualizar);
  actualizar();
}

// Devuelve { motivo } para guardar en el historial, o { error } si falta un dato
function leerOrigenIngreso(prefijo) {
  const origen = document.getElementById(`${prefijo}-origen`).value;
  const o = ORIGENES_INGRESO[origen];
  const doc = document.getElementById(`${prefijo}-doc`).value.trim();
  const prov = document.getElementById(`${prefijo}-prov`).value.trim();
  if (!doc) return { error: 'Completa: ' + o.campo };
  if (o.proveedor && !prov) return { error: 'Escribe el proveedor de la guía.' };
  localStorage.setItem('stock_ultimo_origen', origen);
  const partes = [origen, (origen === 'Guía de proveedor' ? 'Guía ' : '') + doc];
  if (o.proveedor) partes.push(prov.toUpperCase());
  return { motivo: partes.join(' · ') };
}

// ====== Ingreso de mercadería: un documento con varias líneas ======
// El encabezado (origen, documento, proveedor, fecha) se llena una vez y abajo se agregan
// todos los productos. Se registra todo junto con un número de ingreso (ING-0001).
function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function fechaHoyLocal() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Código de rack → datos que pide el Apps Script. F1-M2-A-N1 = Almacén 2; R1-N2 = Almacén 1
function partesRack(codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  let m = c.match(/^(F\d+)-(M\d+)-([AB])-(N\d+)$/);
  if (m) return { almacen: 'Almacén 2', fila: m[1], modulo: m[2], lado: m[3], nivel: m[4] };
  m = c.match(/^([A-Z]\d+)-(N\d+)$/);
  if (m) return { almacen: 'Almacén 1', mueble: m[1], nivel: m[2] };
  return null;
}

function productoDeTexto(texto) {
  const id = String(texto || '').split(' — ')[0].trim();
  return stockData.find((i) => String(i.id) === id) ? id : null;
}

function abrirIngresoMercaderia() {
  renderOrigenIngreso('ing-origen-box', 'ing');
  document.getElementById('ing-fecha').value = fechaHoyLocal();
  document.getElementById('ing-observacion').value = '';
  const vistos = {};
  document.getElementById('ing-productos').innerHTML = stockData
    .filter((i) => !vistos[i.id] && (vistos[i.id] = true))
    .map((i) => `<option value="${escAttr(i.id + ' — ' + i.descripcion)}">`).join('');
  document.getElementById('ing-lineas').innerHTML = '';
  agregarLineaIngreso();
  const panel = document.getElementById('ingreso-panel');
  panel.classList.add('show');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function agregarLineaIngreso(enfocar) {
  const cont = document.getElementById('ing-lineas');
  const div = document.createElement('div');
  div.className = 'ing-linea';
  div.innerHTML = `
    <span class="ing-num"></span>
    <div class="ing-prod"><label class="field-label">Producto</label>
      <input class="input-classic ing-producto" list="ing-productos" placeholder="Escribe el ID o la descripción" /></div>
    <div class="ing-cant"><label class="field-label">Cantidad</label>
      <input type="number" class="input-classic ing-cantidad" min="1" inputmode="numeric" /></div>
    <div class="ing-ubic"><label class="field-label">¿Dónde queda?</label>
      <select class="input-classic ing-ubicacion"><option value="PISO">Palets en piso (sin rack)</option><option value="__rack__">Otro rack…</option></select></div>
    <div class="ing-extra"><label class="field-label ing-extra-label">Referencia (opcional)</label>
      <input class="input-classic ing-extra-input" placeholder="Ej. junto a rack F1" maxlength="30" /></div>
    <button type="button" class="btn-classic ing-quitar" title="Quitar línea">✕</button>`;
  cont.appendChild(div);

  const prod = div.querySelector('.ing-producto');
  prod.addEventListener('change', () => actualizarUbicacionesLinea(div));
  prod.addEventListener('input', () => { if (productoDeTexto(prod.value)) actualizarUbicacionesLinea(div); });
  div.querySelector('.ing-ubicacion').addEventListener('change', () => actualizarExtraLinea(div));
  div.querySelector('.ing-cantidad').addEventListener('input', actualizarResumenIngreso);
  div.querySelector('.ing-quitar').addEventListener('click', () => {
    div.remove();
    if (!document.querySelector('#ing-lineas .ing-linea')) agregarLineaIngreso();
    actualizarResumenIngreso();
  });
  actualizarExtraLinea(div);
  actualizarResumenIngreso();
  if (enfocar) prod.focus();
}

// Ubicaciones posibles: las que ya tiene el producto, palets en piso u otro rack
function actualizarUbicacionesLinea(div) {
  const id = productoDeTexto(div.querySelector('.ing-producto').value);
  const sel = div.querySelector('.ing-ubicacion');
  const existentes = id ? stockData.filter((i) => String(i.id) === id && i.ubicacion !== 'Sin ubicar') : [];
  sel.innerHTML = existentes.map((i) => `<option value="${escAttr(i.ubicacion)}">${escAttr(i.ubicacion)} (hay ${i.disponible})</option>`).join('') +
    '<option value="PISO">Palets en piso (sin rack)</option><option value="__rack__">Otro rack…</option>';
  sel.value = existentes.length === 1 ? existentes[0].ubicacion : 'PISO';
  actualizarExtraLinea(div);
}

function actualizarExtraLinea(div) {
  const v = div.querySelector('.ing-ubicacion').value;
  const box = div.querySelector('.ing-extra');
  const input = div.querySelector('.ing-extra-input');
  box.style.display = v === 'PISO' || v === '__rack__' ? '' : 'none';
  div.querySelector('.ing-extra-label').textContent = v === '__rack__' ? 'Código de rack *' : 'Referencia (opcional)';
  input.placeholder = v === '__rack__' ? 'Ej. F1-M2-A-N1 o R1-N2' : 'Ej. junto a rack F1';
}

function actualizarResumenIngreso() {
  const lineas = [...document.querySelectorAll('#ing-lineas .ing-linea')];
  lineas.forEach((d, i) => { d.querySelector('.ing-num').textContent = (i + 1) + '.'; });
  const total = lineas.reduce((s, d) => s + (parseInt(d.querySelector('.ing-cantidad').value, 10) || 0), 0);
  const conCantidad = lineas.filter((d) => (parseInt(d.querySelector('.ing-cantidad').value, 10) || 0) > 0).length;
  document.getElementById('ing-resumen').textContent = `${conCantidad} producto(s) · ${total.toLocaleString('es-PE')} unidades`;
}

// Arma una línea para el Apps Script, o devuelve { error }
function datosLineaIngreso(div, n) {
  const texto = div.querySelector('.ing-producto').value.trim();
  const cantidad = parseInt(div.querySelector('.ing-cantidad').value, 10) || 0;
  if (!texto && !cantidad) return null; // línea vacía: se ignora
  const id = productoDeTexto(texto);
  if (!id) return { error: `Línea ${n}: elige un producto de la lista.` };
  if (cantidad <= 0) return { error: `Línea ${n}: escribe la cantidad.` };
  const v = div.querySelector('.ing-ubicacion').value;
  const extra = div.querySelector('.ing-extra-input').value.trim();
  let ubic;
  if (v === 'PISO') ubic = { almacen: 'Palets en piso', referencia: extra };
  else if (v === '__rack__') {
    ubic = partesRack(extra);
    if (!ubic) return { error: `Línea ${n}: el código de rack debe ser como F1-M2-A-N1 o R1-N2.` };
  } else if (/^PISO/.test(v)) ubic = { almacen: 'Palets en piso', referencia: v.replace(/^PISO-?/, '') };
  else {
    ubic = partesRack(v);
    if (!ubic) return { error: `Línea ${n}: no se reconoce la ubicación ${v}.` };
  }
  return { linea: Object.assign({ id_articulo: id, cantidad }, ubic), texto: `${id} × ${cantidad} → ${v === '__rack__' ? extra.toUpperCase() : v === 'PISO' ? codigoUbicacionPiso(extra) : v}` };
}

function confirmarIngresoMercaderia() {
  const origen = document.getElementById('ing-origen').value;
  const o = ORIGENES_INGRESO[origen];
  const documento = document.getElementById('ing-doc').value.trim();
  const proveedor = document.getElementById('ing-prov').value.trim();
  const fecha = document.getElementById('ing-fecha').value;
  if (!documento) { alert('Completa: ' + o.campo); return; }
  if (o.proveedor && !proveedor) { alert('Escribe el proveedor de la guía.'); return; }
  if (!fecha) { alert('Indica la fecha del documento.'); return; }

  const lineas = [], textos = [];
  const divs = [...document.querySelectorAll('#ing-lineas .ing-linea')];
  for (let i = 0; i < divs.length; i++) {
    const r = datosLineaIngreso(divs[i], i + 1);
    if (!r) continue;
    if (r.error) { alert(r.error); return; }
    lineas.push(r.linea); textos.push(r.texto);
  }
  if (!lineas.length) { alert('Agrega al menos un producto con su cantidad.'); return; }
  if (!confirm(`¿Registrar este ingreso?\n\n${origen} · ${documento}${proveedor ? ' · ' + proveedor.toUpperCase() : ''}\n\n${textos.join('\n')}`)) return;

  const btn = document.getElementById('ing-confirmar');
  btn.textContent = 'Guardando…';
  btn.disabled = true;
  setStatus('Registrando ingreso…');
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'ingreso_mercaderia', origen, documento, proveedor, fecha,
      observacion: document.getElementById('ing-observacion').value.trim(),
      lineas, usuario: 'almacenero'
    })
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) {
        localStorage.setItem('stock_ultimo_origen', origen);
        alert(`✔ Ingreso ${res.idIngreso} registrado: ${res.lineas.length} producto(s), ${Number(res.total).toLocaleString('es-PE')} unidades.`);
        document.getElementById('ingreso-panel').classList.remove('show');
        setStatus('Ingreso ' + res.idIngreso + ' registrado');
        fetchStock();
      } else {
        alert('Error: ' + (res.error || 'no se pudo registrar el ingreso'));
        setStatus('Error al registrar el ingreso');
      }
    })
    .catch((err) => { alert('Error de conexión: ' + err.message); setStatus('Error de conexión'); })
    .finally(() => { btn.textContent = '✔ Registrar ingreso'; btn.disabled = false; });
}

function openQuickPanel() {
  const panel = document.getElementById('quick-panel');
  const motivoSelect = document.getElementById('quick-panel-motivo');

  document.getElementById('quick-panel-item').textContent =
    `${pendingItem.id} (${pendingAction === 'Entrada' ? 'Ingreso' : 'Venta'})`;

  // Ingreso: el motivo sale del origen y su documento. Venta: motivo de siempre.
  const esIngreso = pendingAction === 'Entrada';
  document.getElementById('quick-panel-motivo-box').style.display = esIngreso ? 'none' : '';
  motivoSelect.innerHTML = '<option>Venta</option><option>Ajuste de inventario</option>';
  if (esIngreso) renderOrigenIngreso('qp-origen-box', 'qp');
  else document.getElementById('qp-origen-box').innerHTML = '';

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
  if (cantidad <= 0) { alert('Escribe la cantidad.'); return; }
  let motivo = document.getElementById('quick-panel-motivo').value;
  if (pendingAction === 'Entrada') {
    const origen = leerOrigenIngreso('qp');
    if (origen.error) { alert(origen.error); return; }
    motivo = origen.motivo;
  }
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

  const ultima = JSON.parse(localStorage.getItem('ultimaUbicacion') || 'null');
  if (ultima) {
    document.getElementById('loc-almacen').value = ultima.almacen || 'Almacén 2';
    if (ultima.almacen === 'Palets en piso') {
      document.getElementById('loc-referencia').value = ultima.referencia || '';
    } else if (ultima.almacen === 'Almacén 1') {
      document.getElementById('loc-mueble').value = ultima.mueble;
      document.getElementById('loc-nivel-a1').value = ultima.nivel;
    } else {
      document.getElementById('loc-fila').value = ultima.fila;
      document.getElementById('loc-modulo').value = ultima.modulo;
      document.getElementById('loc-lado').value = ultima.lado;
      document.getElementById('loc-nivel').value = ultima.nivel;
    }
  }
  toggleCamposAlmacen();
  renderOrigenIngreso('loc-origen-box', 'loc');

  document.getElementById('location-panel').classList.add('show');
}

function toggleCamposAlmacen() {
  const almacen = document.getElementById('loc-almacen').value;
  document.getElementById('loc-fields-almacen1').style.display = almacen === 'Almacén 1' ? 'flex' : 'none';
  document.getElementById('loc-fields-almacen2').style.display = almacen === 'Almacén 2' ? 'flex' : 'none';
  document.getElementById('loc-fields-piso').style.display = almacen === 'Palets en piso' ? 'flex' : 'none';
  actualizarPreviewPiso();
}

// Muestra cómo quedará el código de la ubicación en piso (igual que lo arma el Apps Script)
function codigoUbicacionPiso(referencia) {
  const ref = String(referencia || '').trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return 'PISO' + (ref ? '-' + ref : '');
}

function actualizarPreviewPiso() {
  const preview = document.getElementById('loc-piso-preview');
  if (preview) preview.textContent = codigoUbicacionPiso(document.getElementById('loc-referencia').value);
}

function closeLocationPanel() {
  document.getElementById('location-panel').classList.remove('show');
  pendingItem = null;
}

function confirmLocation() {
  if (!pendingItem) return;

  const almacen = document.getElementById('loc-almacen').value;
  let fila = '', modulo = '', lado = '', mueble = '', nivel = '', referencia = '';

  if (almacen === 'Palets en piso') {
    referencia = document.getElementById('loc-referencia').value.trim();
  } else if (almacen === 'Almacén 1') {
    mueble = document.getElementById('loc-mueble').value;
    nivel = document.getElementById('loc-nivel-a1').value;
  } else {
    fila = document.getElementById('loc-fila').value;
    modulo = document.getElementById('loc-modulo').value;
    lado = document.getElementById('loc-lado').value;
    nivel = document.getElementById('loc-nivel').value;
  }

  const stockInicial = parseInt(document.getElementById('loc-stock-inicial').value, 10) || 0;
  const confirmBtn = document.getElementById('location-panel-confirm');

  if (stockInicial <= 0 && !confirm('No pusiste cantidad. ¿Registrar la ubicación con 0 unidades?')) return;
  let motivo = '';
  if (stockInicial > 0) {
    const origen = leerOrigenIngreso('loc');
    if (origen.error) { alert(origen.error); return; }
    motivo = origen.motivo + ' · en ' + (almacen === 'Palets en piso' ? codigoUbicacionPiso(referencia) : almacen);
  }
  localStorage.setItem('ultimaUbicacion', JSON.stringify({ almacen, fila, modulo, lado, mueble, nivel, referencia }));

  confirmBtn.textContent = 'Guardando…';
  confirmBtn.disabled = true;
  setStatus('Guardando ubicación…');

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'asignar_ubicacion',
      id_articulo: pendingItem.id,
      almacen, fila, modulo, lado, mueble, nivel, referencia,
      stock_inicial: stockInicial,
      motivo,
      usuario: 'almacenero'
    })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        setStatus((resultado.sumado ? 'Ingreso sumado en ' : 'Ingresado en ') + resultado.id_ubicacion + ' · disponible: ' + resultado.disponible);
        fetchStock();
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
let html5QrCode = null;
let scannerRunning = false;

function openScanner() {
  document.getElementById('scanner-panel').classList.add('show');
  document.getElementById('scanner-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode('scanner-reader', {
      // Limita los formatos a los típicos de códigos de barras de productos
      // (menos formatos a probar = detección más rápida)
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.ITF
      ],
      // Usa el lector nativo del navegador cuando esté disponible (mucho más
      // rápido y preciso que el decodificador JS genérico)
      useBarCodeDetectorIfSupported: true
    });
  }

  const config = {
    fps: 20,
    // Rectángulo ancho y bajo, como la forma real de un código de barras
    // (en vez de un cuadrado, que es mejor para QR)
    qrbox: { width: 280, height: 110 },
    aspectRatio: 1.777,
    videoConstraints: {
      facingMode: 'environment',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      // Pide enfoque continuo si el celular lo soporta (más nitidez en movimiento)
      advanced: [{ focusMode: 'continuous' }]
    }
  };

  html5QrCode.start(
    { facingMode: 'environment' },
    config,
    (decodedText) => {
        reproducirBeep();
      document.getElementById('stock-search-input').value = decodedText;
      renderFiltered();
      closeScanner();
      setStatus('Código escaneado: ' + decodedText);
    },
    () => { /* ignoramos los frames donde no detecta nada, es normal */ }
  ).then(() => {
    scannerRunning = true;
  }).catch((err) => {
    setStatus('No se pudo abrir la cámara: ' + err);
    document.getElementById('scanner-panel').classList.remove('show');
  });
}
function reproducirBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscilador = ctx.createOscillator();
    const volumen = ctx.createGain();

    oscilador.connect(volumen);
    volumen.connect(ctx.destination);

    oscilador.type = 'sine';
    oscilador.frequency.value = 1000; // tono agudo, tipo beep de scanner
    volumen.gain.setValueAtTime(0.3, ctx.currentTime);
    volumen.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    oscilador.start();
    oscilador.stop(ctx.currentTime + 0.15); // dura 150ms, cortito
  } catch (err) {
    // Si el navegador bloquea el audio (por no haber interacción previa), no rompe nada
    console.warn('No se pudo reproducir el beep:', err);
  }
}

function closeScanner() {
  if (html5QrCode && scannerRunning) {
    html5QrCode.stop().then(() => { scannerRunning = false; }).catch(() => {});
  }
  document.getElementById('scanner-panel').classList.remove('show');
}

