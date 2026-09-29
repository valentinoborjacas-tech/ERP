let mpStockData = [];
let prodLogData = [];
let mpMateriales = [];
let mpMaterialEncontrado = null;


window.initMateriaprimaModule = function () {
  fetchMpStock();
  fetchProduccionLog();

  document.getElementById('mp-search-input').addEventListener('keyup', renderMpFiltered);
  document.getElementById('prod-log-search').addEventListener('keyup', renderProduccionLogFiltrado);
  document.getElementById('btn-ingresar-bovinas').addEventListener('click', abrirIngresoPanel);
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

  document.getElementById('btn-registrar-produccion').addEventListener('click', abrirPanelProduccion);
  document.getElementById('mp-produccion-close').addEventListener('click', () => {
    document.getElementById('mp-produccion-panel').classList.remove('show');
  });
  document.getElementById('prod-peso-inicio').addEventListener('input', calcularPesoUtilizadoProduccion);
  document.getElementById('prod-peso-tuco').addEventListener('input', calcularPesoUtilizadoProduccion);
  document.getElementById('prod-codigo-material').addEventListener('keyup', cargarBovinasDisponibles);
  document.getElementById('prod-bovina-select').addEventListener('change', autocompletarProveedorBovina);
  document.getElementById('mp-produccion-confirm').addEventListener('click', confirmarRegistrarProduccion);
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
  document.getElementById('mp-bovinas-material').textContent = idMaterial;
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
  document.getElementById('mp-cantidad-bovinas').value = 1;
  document.getElementById('mp-proveedor').value = '';
  document.getElementById('mp-almacenero').value = '';
  mpMaterialEncontrado = null;
  document.getElementById('mp-ingreso-panel').classList.add('show');
  renderCamposPeso();

  if (!mpMateriales.length) {
    fetch(`${API_URL}?action=materiales&_=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { mpMateriales = data; });
  }
}

function buscarMaterialPorCodigo() {
  const codigo = document.getElementById('mp-codigo').value.trim();
  const encontrado = mpMateriales.find((m) => m.ID === codigo);
  mpMaterialEncontrado = encontrado || null;
  document.getElementById('mp-descripcion').value = encontrado ? encontrado.DESCRIPCION : '';
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

  const proveedor = document.getElementById('mp-proveedor').value.trim();
  const almacenero = document.getElementById('mp-almacenero').value.trim();
  if (!proveedor || !almacenero) { alert('Proveedor y Almacenero son obligatorios.'); return; }

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
        document.getElementById('mp-ingreso-panel').classList.remove('show');
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
  ['prod-operario', 'prod-codigo-material', 'prod-proveedor', 'prod-litros', 'prod-ancho',
   'prod-largo', 'prod-espesor', 'prod-millares', 'prod-peso-inicio', 'prod-peso-tuco']
    .forEach((id) => document.getElementById(id).value = '');
  document.getElementById('prod-estado-final').value = 'Terminado';
  document.getElementById('prod-peso-utilizado').textContent = '0.00';
  document.getElementById('prod-bovina-select').innerHTML = '<option value="">— Escribe el código del material —</option>';
  document.getElementById('mp-produccion-panel').classList.add('show');
  document.getElementById('mp-produccion-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function calcularPesoUtilizadoProduccion() {
  const inicio = Number(document.getElementById('prod-peso-inicio').value) || 0;
  const tuco = Number(document.getElementById('prod-peso-tuco').value) || 0;
  const utilizado = Math.max(inicio - tuco, 0);
  document.getElementById('prod-peso-utilizado').textContent = utilizado.toFixed(2);
}

function confirmarRegistrarProduccion() {
  const operario = document.getElementById('prod-operario').value.trim();
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
            `<option value="${b.idBovina}" data-proveedor="${b.proveedor}">${b.idBovina} — ${Number(b.pesoActual).toFixed(1)} kg disponibles (${b.proveedor})</option>`
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
}
function fetchProduccionLog() {
  fetch(`${API_URL}?action=produccion&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => { prodLogData = data; renderProduccionLogFiltrado(); })
    .catch((err) => {
      document.getElementById('prod-log-tbody').innerHTML = `<tr><td colspan="13">Error: ${err.message}</td></tr>`;
    });
}

function renderProduccionLogFiltrado() {
  const term = (document.getElementById('prod-log-search').value || '').toLowerCase();
  const filtrados = prodLogData.filter((p) =>
    String(p.operario || '').toLowerCase().includes(term) ||
    String(p.idManga || '').toLowerCase().includes(term)
  );
  document.getElementById('prod-log-tbody').innerHTML = filtrados.length
    ? filtrados.slice().reverse().map((p) => `
        <tr>
          <td data-label="Fecha">${formatFecha(p.fecha)}</td>
          <td data-label="Operario">${p.operario || ''}</td>
          <td data-label="ID Manga">${p.idManga || ''}</td>
          <td data-label="Proveedor">${p.proveedor || ''}</td>
          <td data-label="Litros">${p.litros || ''}</td>
          <td data-label="Ancho">${p.ancho || ''}</td>
          <td data-label="Largo">${p.largo || ''}</td>
          <td data-label="Espesor">${p.espesor || ''}</td>
          <td data-label="Millares">${p.millares || ''}</td>
          <td data-label="Peso inicio">${p.pesoMangaInicio || ''}</td>
          <td data-label="Peso tuco">${p.pesoTuco || ''}</td>
          <td data-label="Peso utilizado" style="font-weight:bold;">${p.pesoUtilizado || ''}</td>
          <td data-label="Estado"><span class="badge ${p.estadoFinal === 'Terminado' ? 'badge-ok' : 'badge-neutral'}">${p.estadoFinal || ''}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="13">No se encontraron registros.</td></tr>`;
}
function formatFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

