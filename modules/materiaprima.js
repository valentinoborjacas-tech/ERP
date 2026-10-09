let mpStockData = [];
let prodLogData = [];
let mpMateriales = [];
let mpMaterialEncontrado = null;


window.initMateriaprimaModule = function () {
  fetchMpStock();
  fetchProduccionLog();

  document.getElementById('mp-search-input').addEventListener('keyup', renderMpFiltered);
 
  document.getElementById('btn-ingresar-bovinas').addEventListener('click', abrirIngresoPanel);
  document.getElementById('btn-importar-mangas').addEventListener('click', abrirImportarPanel);
  document.getElementById('mp-imp-cerrar').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('mp-importar-panel').classList.remove('show'); });
  document.getElementById('mp-imp-file').addEventListener('change', mpImpManejarArchivo);
  document.getElementById('mp-imp-confirmar').addEventListener('click', mpImpConfirmar);
  document.getElementById('mp-imp-plantilla').addEventListener('click', mpImpPlantilla);
  document.getElementById('mp-ingreso-close').addEventListener('click', () => {
    document.getElementById('mp-ingreso-panel').classList.remove('show');
  });
  document.getElementById('mp-codigo').addEventListener('keyup', buscarMaterialPorCodigo);
  document.getElementById('mp-cantidad-bovinas').addEventListener('input', renderCamposPeso);
  document.getElementById('mp-ingreso-confirm').addEventListener('click', confirmarIngresoBovinas);

  document.getElementById('mp-tbody').addEventListener('click', handleMpTablaClick);
  document.getElementById('mp-bovinas-close').addEventListener('click', () => {
    document.getElementById('mp-bovinas-panel').classList.remove('show');
  });

  
  document.getElementById('mp-produccion-close').addEventListener('click', () => {
    document.getElementById('mp-produccion-panel').classList.remove('show');
  });
  document.getElementById('prod-peso-inicio').addEventListener('input', calcularPesoUtilizadoProduccion);
  document.getElementById('prod-peso-tuco').addEventListener('input', calcularPesoUtilizadoProduccion);
  document.getElementById('prod-codigo-material').addEventListener('keyup', cargarBovinasDisponibles);
  document.getElementById('prod-operario-select').addEventListener('change', () => {
  const esOtro = document.getElementById('prod-operario-select').value === '__otro__';
  document.getElementById('prod-operario-otro').style.display = esOtro ? 'block' : 'none';
  if (esOtro) document.getElementById('prod-operario-otro').focus();
});
  document.getElementById('prod-bovina-select').addEventListener('change', autocompletarProveedorBovina);
  document.getElementById('mp-produccion-confirm').addEventListener('click', confirmarRegistrarProduccion);
    document.getElementById('mp-almacenero-select').addEventListener('change', () => {
    const esOtro = document.getElementById('mp-almacenero-select').value === '__otro__';
    document.getElementById('mp-almacenero-otro').style.display = esOtro ? 'block' : 'none';
    if (esOtro) document.getElementById('mp-almacenero-otro').focus();
  });
  document.getElementById('mp-proveedor-select').addEventListener('change', () => {
    const esOtro = document.getElementById('mp-proveedor-select').value === '__otro__';
    document.getElementById('mp-proveedor-otro').style.display = esOtro ? 'block' : 'none';
    if (esOtro) document.getElementById('mp-proveedor-otro').focus();
  });
};


function fetchMpStock() {
  fetch(`${API_URL}?action=materia_prima_stock&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => { mpStockData = data; renderMpFiltered(); })
    .catch((err) => {
      document.getElementById('mp-tbody').innerHTML = `<tr><td colspan="6">Error: ${err.message}</td></tr>`;
    });
}

function renderMpFiltered() {
  const term = (document.getElementById('mp-search-input').value || '').toLowerCase();
  const filtrados = mpStockData.filter((m) =>
    m.id.toLowerCase().includes(term) || m.descripcion.toLowerCase().includes(term)
  );
  document.getElementById('mp-tbody').innerHTML = filtrados.length
    ? filtrados.map((m) => `
        <tr class="selectable" data-id="${m.id}">
          <td data-label="ID">${m.id}</td>
          <td data-label="Descripción">${m.descripcion}</td>
          <td data-label="N° Bovinas">${m.nBovinas}</td>
          <td data-label="Kg ingresados">${m.kgIngresados.toFixed(1)}</td>
          <td data-label="Kg consumidos">${m.kgConsumidos.toFixed(1)}</td>
          <td data-label="Stock actual (kg)" style="font-weight:bold;">${m.stockActual.toFixed(1)}</td>
        </tr>`).join('')
    : `<tr><td colspan="6">No se encontraron materiales.</td></tr>`;
}

function handleMpTablaClick(e) {
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  abrirDetalleBovinas(row.dataset.id);
}

function abrirDetalleBovinas(idMaterial) {
  const material = mpStockData.find((m) => m.id === idMaterial);

  document.getElementById('mp-bovinas-material').textContent = idMaterial;
  document.getElementById('mp-bovinas-descripcion').textContent = material ? material.descripcion : '';
  document.getElementById('mp-resumen-salidas').textContent = material ? material.nSalidas : 0;
  document.getElementById('mp-resumen-stock-mangas').textContent = material ? material.nBovinas : 0;
  document.getElementById('mp-resumen-kg-ingresados').textContent = material ? material.kgIngresados.toFixed(1) : '0.0';
  document.getElementById('mp-resumen-kg-salientes').textContent = material ? material.kgConsumidos.toFixed(1) : '0.0';
  document.getElementById('mp-resumen-stock-kilos').textContent = material ? material.stockActual.toFixed(1) : '0.0';

  document.getElementById('mp-bovinas-panel').classList.add('show');
  document.getElementById('mp-bovinas-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

  const tbodyIngresos = document.getElementById('mp-bovinas-tbody');
  const tbodyProduccion = document.getElementById('mp-bovinas-produccion-tbody');
  tbodyIngresos.innerHTML = '<tr><td colspan="7">Cargando…</td></tr>';
  tbodyProduccion.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';

  fetch(`${API_URL}?action=bovinas&id_material=${encodeURIComponent(idMaterial)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      document.getElementById('mp-ingresos-count').textContent = data.length;

     tbodyIngresos.innerHTML = data.length
  ? data.map((b) => {
      const producida = b.nCorridas > 0;
      const etiqueta = producida ? 'Producido' : (b.pesoActual > 0 ? 'Disponible' : 'Agotada');
      const clase = producida || b.pesoActual <= 0 ? 'badge-danger' : 'badge-ok';
      return `
      <tr>
        <td data-label="Fecha">${formatFecha(b.fecha)}</td>
        <td data-label="ID Bovina">${b.idBovina}</td>
        <td data-label="Almacenero">${b.almacenero || ''}</td>
        <td data-label="Proveedor">${b.proveedor}</td>
        <td data-label="Peso ingresado">${b.pesoInicial}</td>
        <td data-label="Peso actual">${b.pesoActual}</td>
        <td data-label="Estado"><span class="badge ${clase}">${etiqueta}</span></td>
      </tr>`;
    }).join('')
  : '<tr><td colspan="7">Sin ingresos registrados.</td></tr>';

      const produccionesDelMaterial = prodLogData.filter((p) => p.idMaterial === idMaterial);

tbodyProduccion.innerHTML = produccionesDelMaterial.length
  ? produccionesDelMaterial.map((p) => `
      <tr>
        <td data-label="Fecha">${formatFecha(p.fecha)}</td>
        <td data-label="Operario">${p.operario || ''}</td>
        <td data-label="ID Manga">${p.idManga || ''}</td>
        <td data-label="Peso utilizado">${p.pesoUtilizado || ''}</td>
        <td data-label="Estado">${p.estadoFinal || ''}</td>
      </tr>`).join('')
  : '<tr><td colspan="5">Sin producciones registradas.</td></tr>';
    });
}

// ---------- Ingreso de bovinas ----------
function abrirIngresoPanel() {
  document.getElementById('mp-codigo').value = '';
  document.getElementById('mp-descripcion').value = '';
  document.getElementById('mp-codigo-resultados').innerHTML = '';
  document.getElementById('mp-cantidad-bovinas').value = 1;
  mpMaterialEncontrado = null;

  document.getElementById('mp-almacenero-select').value = localStorage.getItem('mp_last_almacenero') || '';
  document.getElementById('mp-almacenero-otro').value = localStorage.getItem('mp_last_almacenero_otro') || '';
  document.getElementById('mp-almacenero-otro').style.display =
    document.getElementById('mp-almacenero-select').value === '__otro__' ? 'block' : 'none';

  document.getElementById('mp-proveedor-select').value = localStorage.getItem('mp_last_proveedor') || '';
  document.getElementById('mp-proveedor-otro').value = localStorage.getItem('mp_last_proveedor_otro') || '';
  document.getElementById('mp-proveedor-otro').style.display =
    document.getElementById('mp-proveedor-select').value === '__otro__' ? 'block' : 'none';

  document.getElementById('mp-ingreso-panel').classList.add('show');
  renderCamposPeso();

  if (!mpMateriales.length) {
    fetch(`${API_URL}?action=materiales&_=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { mpMateriales = data; });
  }
}

async function buscarMaterialPorCodigo() {
  const input = document.getElementById('mp-codigo');
  const lista = document.getElementById('mp-codigo-resultados');
  const desc  = document.getElementById('mp-descripcion');
  if (!input || !lista || !desc) return;

  const q = input.value.trim().toUpperCase();
  mpMaterialEncontrado = null;
  desc.value = '';
  lista.innerHTML = '';
  lista.style.display = 'none';
  if (!q) return;

  if (!Array.isArray(mpMateriales) || mpMateriales.length === 0) {
    try {
      const r = await fetch(`${API_URL}?action=materiales`);
      const d = await r.json();
      mpMateriales = Array.isArray(d) ? d : (d.data || d.materiales || []);
    } catch (e) { console.error('materiales', e); return; }
  }
  if (!document.getElementById('mp-codigo')) return;

  const getId   = m => String(m.id ?? m.ID ?? m.codigo ?? '').trim();
  const getDesc = m => String(m.descripcion ?? m.DESCRIPCION ?? '').trim();

  const exacto = mpMateriales.find(m => getId(m).toUpperCase() === q);
  if (exacto) {
    mpMaterialEncontrado = exacto;
    desc.value = getDesc(exacto);
    return;
  }

  const parciales = mpMateriales
    .filter(m => getId(m).toUpperCase().includes(q) || getDesc(m).toUpperCase().includes(q))
    .slice(0, 6);
  if (!parciales.length) return;

  lista.innerHTML = parciales.map(m =>
    `<div data-id="${getId(m)}" style="padding:4px 8px;cursor:pointer;border-bottom:1px solid #ddd;">
       <b>${getId(m)}</b> — ${getDesc(m)}</div>`).join('');
  lista.style.display = 'block';
  lista.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      input.value = el.dataset.id;
      buscarMaterialPorCodigo();
    });
  });
}

function renderCamposPeso() {
  const cantidad = parseInt(document.getElementById('mp-cantidad-bovinas').value, 10) || 0;
  const contenedor = document.getElementById('mp-pesos-container');
  let html = '<label class="field-label">Peso de cada bovina (kg)</label><div class="flex gap-2 flex-wrap">';
  for (let i = 0; i < cantidad; i++) {
    html += `<input type="number" class="input-classic mp-peso-input" placeholder="Bovina ${i + 1}" style="width:110px;" min="0" step="0.1" />`;
  }
  html += '</div>';
  contenedor.innerHTML = html;
}

function confirmarIngresoBovinas() {
  if (!mpMaterialEncontrado) { alert('Escribe un código de material válido (debe existir en el catálogo).'); return; }

  const pesos = Array.from(document.querySelectorAll('.mp-peso-input')).map((inp) => Number(inp.value) || 0);
  if (pesos.some((p) => p <= 0)) { alert('Completa el peso de todas las bovinas.'); return; }

  const almaceneroSelect = document.getElementById('mp-almacenero-select').value;
  const almacenero = almaceneroSelect === '__otro__'
    ? document.getElementById('mp-almacenero-otro').value.trim()
    : almaceneroSelect;
  if (!almacenero) { alert('Selecciona o escribe el almacenero.'); return; }

  const proveedorSelect = document.getElementById('mp-proveedor-select').value;
  const proveedor = proveedorSelect === '__otro__'
    ? document.getElementById('mp-proveedor-otro').value.trim()
    : proveedorSelect;

  const confirmBtn = document.getElementById('mp-ingreso-confirm');
  confirmBtn.textContent = 'Guardando…';
  confirmBtn.disabled = true;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'ingresar_bovinas',
      id_material: mpMaterialEncontrado.ID,
      pesos, proveedor, almacenero
    })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        localStorage.setItem('mp_last_almacenero', almaceneroSelect);
        localStorage.setItem('mp_last_almacenero_otro', almaceneroSelect === '__otro__' ? almacenero : '');
        localStorage.setItem('mp_last_proveedor', proveedorSelect);
        localStorage.setItem('mp_last_proveedor_otro', proveedorSelect === '__otro__' ? proveedor : '');

        document.getElementById('mp-cantidad-bovinas').value = 1;
        renderCamposPeso();
        fetchMpStock();
      } else {
        alert('Error: ' + resultado.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => {
      confirmBtn.textContent = '✔ Registrar ingreso';
      confirmBtn.disabled = false;
    });
}
function abrirPanelProduccion() {
  document.getElementById('prod-operario-select').value = localStorage.getItem('prod_last_operario') || '';
  document.getElementById('prod-operario-otro').value = localStorage.getItem('prod_last_operario_otro') || '';
  document.getElementById('prod-operario-otro').style.display =
    document.getElementById('prod-operario-select').value === '__otro__' ? 'block' : 'none';

  document.getElementById('prod-codigo-material').value = localStorage.getItem('prod_last_codigo') || '';
  document.getElementById('prod-litros').value = localStorage.getItem('prod_last_litros') || '';
  document.getElementById('prod-largo').value = localStorage.getItem('prod_last_largo') || '';
  document.getElementById('prod-espesor').value = localStorage.getItem('prod_last_espesor') || '';

  ['prod-proveedor', 'prod-ancho', 'prod-millares', 'prod-peso-inicio', 'prod-peso-tuco']
    .forEach((id) => document.getElementById(id).value = '');
  document.getElementById('prod-estado-final').value = 'Terminado';
  document.getElementById('prod-peso-utilizado').textContent = '0.00';
  document.getElementById('prod-bovina-select').innerHTML = '<option value="">— Escribe el código del material —</option>';
  document.getElementById('mp-produccion-panel').classList.add('show');
  document.getElementById('mp-produccion-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (document.getElementById('prod-codigo-material').value) {
    cargarBovinasDisponibles();
  }
}


function calcularPesoUtilizadoProduccion() {
  const inicio = Number(document.getElementById('prod-peso-inicio').value) || 0;
  const tuco = Number(document.getElementById('prod-peso-tuco').value) || 0;
  const utilizado = Math.max(inicio - tuco, 0);
  document.getElementById('prod-peso-utilizado').textContent = utilizado.toFixed(2);
}

function confirmarRegistrarProduccion() {
  const operarioSelect = document.getElementById('prod-operario-select').value;
const operario = operarioSelect === '__otro__'
  ? document.getElementById('prod-operario-otro').value.trim()
  : operarioSelect;
  const idManga = document.getElementById('prod-bovina-select').value;
  const proveedor = document.getElementById('prod-proveedor').value.trim();
  const pesoInicio = Number(document.getElementById('prod-peso-inicio').value) || 0;
  const pesoTuco = Number(document.getElementById('prod-peso-tuco').value) || 0;

  if (!operario) { alert('Escribe el nombre del operario.'); return; }
  if (!idManga) { alert('Selecciona una bovina disponible.'); return; }
  if (!proveedor) { alert('Ingresa el proveedor.'); return; }
  if (pesoInicio <= 0) { alert('Ingresa el peso de manga al inicio.'); return; }
  if (pesoTuco < 0 || pesoTuco > pesoInicio) { alert('El peso del tuco no es válido.'); return; }

  const confirmBtn = document.getElementById('mp-produccion-confirm');
  confirmBtn.textContent = 'Guardando…';
  confirmBtn.disabled = true;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'registrar_produccion',
      operario, id_manga: idManga, proveedor,
      litros: document.getElementById('prod-litros').value,
      ancho: document.getElementById('prod-ancho').value,
      largo: document.getElementById('prod-largo').value,
      espesor: document.getElementById('prod-espesor').value,
      millares: document.getElementById('prod-millares').value,
      peso_manga_inicio: pesoInicio,
      peso_tuco: pesoTuco,
      estado_final: document.getElementById('prod-estado-final').value
    })
  })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
  localStorage.setItem('prod_last_operario', operarioSelect);
  localStorage.setItem('prod_last_operario_otro', operarioSelect === '__otro__' ? operario : '');
  localStorage.setItem('prod_last_codigo', document.getElementById('prod-codigo-material').value.trim());
  localStorage.setItem('prod_last_litros', document.getElementById('prod-litros').value);
  localStorage.setItem('prod_last_largo', document.getElementById('prod-largo').value);
  localStorage.setItem('prod_last_espesor', document.getElementById('prod-espesor').value);

  document.getElementById('mp-produccion-panel').classList.remove('show');
  fetchMpStock();
  fetchProduccionLog();
} else {
        alert('Error: ' + resultado.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => {
      confirmBtn.textContent = '✔ Registrar producción';
      confirmBtn.disabled = false;
    });
}
  
  function cargarBovinasDisponibles() {
  const codigo = document.getElementById('prod-codigo-material').value.trim();
  const select = document.getElementById('prod-bovina-select');
  if (!codigo) {
    select.innerHTML = '<option value="">— Escribe el código del material —</option>';
    return;
  }
  fetch(`${API_URL}?action=bovinas&id_material=${encodeURIComponent(codigo)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      const disponibles = data.filter((b) => Number(b.pesoActual) > 0);
      select.innerHTML = disponibles.length
        ? '<option value="">Selecciona una bovina...</option>' +
          disponibles.map((b) =>
                       `<option value="${b.idBovina}" data-proveedor="${b.proveedor}" data-peso="${Number(b.pesoActual)}">${b.idBovina} — ${Number(b.pesoActual).toFixed(1)} kg disponibles (${b.proveedor})</option>`
          ).join('')
        : '<option value="">Sin bovinas disponibles para este material</option>';
    })
    .catch(() => {
      select.innerHTML = '<option value="">Error al buscar bovinas</option>';
    });
}  

function autocompletarProveedorBovina() {
  const opcion = document.getElementById('prod-bovina-select').selectedOptions[0];
  if (opcion && opcion.dataset.proveedor) {
    document.getElementById('prod-proveedor').value = opcion.dataset.proveedor;
  }
  if (opcion && opcion.dataset.peso) {
    document.getElementById('prod-peso-inicio').value = opcion.dataset.peso;
    calcularPesoUtilizadoProduccion();
  }
}
function fetchProduccionLog() {
  fetch(`${API_URL}?action=produccion&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => { prodLogData = data; renderProduccionLogFiltrado(); })
    .catch((err) => {
      document.getElementById('prod-log-tbody').innerHTML = `<tr><td colspan="13">Error: ${err.message}</td></tr>`;
    });
}

function fetchProduccionLog() {
  fetch(`${API_URL}?action=produccion&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => { prodLogData = data; })
    .catch(() => { prodLogData = []; });
}
function formatFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// ===== Importar mangas desde Excel =====
let mpImpFilas = [];

async function mpImpAsegurarMateriales() {
  if (Array.isArray(mpMateriales) && mpMateriales.length) return;
  try {
    const r = await fetch(`${API_URL}?action=materiales&_=${Date.now()}`, { cache: 'no-store' });
    const d = await r.json();
    mpMateriales = Array.isArray(d) ? d : (d.data || d.materiales || []);
  } catch (e) { console.error('materiales', e); }
}
const mpImpId   = (m) => String(m.ID ?? m.id ?? '').trim().toUpperCase();
const mpImpDesc = (m) => String(m.DESCRIPCION ?? m.descripcion ?? '').trim();

function abrirImportarPanel() {
  document.getElementById('mp-ingreso-panel').classList.remove('show');
  document.getElementById('mp-imp-almacenero').value = localStorage.getItem('mp_last_almacenero') || '';
  document.getElementById('mp-imp-proveedor').value = localStorage.getItem('mp_last_proveedor') || '';
  document.getElementById('mp-importar-panel').classList.add('show');
  document.getElementById('mp-importar-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  mpImpAsegurarMateriales();
}

function mpImpPlantilla() {
  const ws = XLSX.utils.aoa_to_sheet([['ID_BOVINA', 'PESO_KG'], ['Z3310CFB', 25.4], ['Z3310CFB', 26.1]]);
  ws['!cols'] = [{ wch: 20 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mangas');
  XLSX.writeFile(wb, 'Plantilla_Ingreso_Mangas.xlsx');
}

async function mpImpManejarArchivo(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  await mpImpAsegurarMateriales();
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

    let hIdx = -1, cId = -1, cPeso = -1;
    for (let i = 0; i < Math.min(filas.length, 30); i++) {
      const f = filas[i].map((c) => String(c).trim().toUpperCase());
      const a = f.findIndex((c) => c.startsWith('ID'));
      const b = f.findIndex((c) => c.startsWith('PESO'));
      if (a >= 0 && b >= 0) { hIdx = i; cId = a; cPeso = b; break; }
    }
    if (hIdx < 0) { alert('No encontré las columnas ID_BOVINA y PESO_KG. Usa la plantilla.'); return; }

    const mapa = {};
    mpMateriales.forEach((m) => { mapa[mpImpId(m)] = m; });

    mpImpFilas = [];
    for (let i = hIdx + 1; i < filas.length; i++) {
      const codigo = String(filas[i][cId] ?? '').trim().toUpperCase();
      const raw = filas[i][cPeso];
      if (!codigo && raw === '') continue;
      const peso = Number(String(raw).replace(',', '.'));
      const mat = mapa[codigo];
      const estado = (!codigo || !mat) ? 'sin_codigo' : (!(peso > 0) ? 'sin_peso' : 'ok');
      mpImpFilas.push({ codigo, peso, desc: mat ? mpImpDesc(mat) : '', idReal: mat ? String(mat.ID ?? mat.id) : '', estado });
    }
    mpImpRender();
  } catch (e) { alert('No se pudo leer el archivo: ' + e.message); }
}

function mpImpRender() {
  const tbody = document.getElementById('mp-imp-tbody');
  if (!tbody) return;
  const validas = mpImpFilas.filter((f) => f.estado === 'ok');
  const kg = validas.reduce((s, f) => s + f.peso, 0);

  tbody.innerHTML = mpImpFilas.length ? mpImpFilas.map((f, i) => {
    const badge = f.estado === 'ok' ? '<span class="badge-ok">✅ OK</span>'
      : f.estado === 'sin_codigo' ? '<span class="badge-danger">❌ Código no existe</span>'
      : '<span class="badge-danger">❌ Peso inválido</span>';
    return `<tr><td>${i + 1}</td><td>${f.codigo || '—'}</td><td>${f.desc}</td><td>${isNaN(f.peso) ? '—' : f.peso}</td><td>${badge}</td></tr>`;
  }).join('') : '<tr><td colspan="5">El archivo no tiene filas.</td></tr>';

  document.getElementById('mp-imp-resumen').innerHTML =
    `<b>${validas.length}</b> mangas válidas (${kg.toFixed(1)} kg) · <b>${mpImpFilas.length - validas.length}</b> con error (se omiten)`;
  document.getElementById('mp-imp-confirmar').disabled = validas.length === 0;
}

async function mpImpConfirmar() {
  const almacenero = document.getElementById('mp-imp-almacenero').value.trim();
  const proveedor = document.getElementById('mp-imp-proveedor').value.trim();
  if (!almacenero) { alert('Selecciona el almacenero.'); return; }

  const validas = mpImpFilas.filter((f) => f.estado === 'ok');
  if (!validas.length) return;

  const grupos = {};
  validas.forEach((f) => { (grupos[f.idReal] = grupos[f.idReal] || []).push(f.peso); });

  const btn = document.getElementById('mp-imp-confirmar');
  btn.disabled = true; btn.textContent = 'Importando…';

  let okCount = 0; const errores = [];
  for (const [idMat, pesos] of Object.entries(grupos)) {
    try {
      const r = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'ingresar_bovinas', id_material: idMat, pesos, proveedor, almacenero })
      });
      const res = await r.json();
      if (res.ok) okCount += pesos.length; else errores.push(`${idMat}: ${res.error}`);
    } catch (e) { errores.push(`${idMat}: ${e.message}`); }
  }

  localStorage.setItem('mp_last_almacenero', almacenero);
  if (proveedor) localStorage.setItem('mp_last_proveedor', proveedor);
  alert(`Importadas ${okCount} mangas.` + (errores.length ? `\n\nErrores:\n${errores.join('\n')}` : ''));

  if (!document.getElementById('mp-imp-confirmar')) return;
  btn.textContent = '✔ Importar mangas válidas';
  if (!errores.length) {
    mpImpFilas = [];
    document.getElementById('mp-imp-file').value = '';
    mpImpRender();
  } else btn.disabled = false;
  fetchMpStock();
}
