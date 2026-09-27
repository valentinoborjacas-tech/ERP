let mpStockData = [];
let mpMateriales = [];
let mpMaterialEncontrado = null;

window.initMateriaprimaModule = function () {
  fetchMpStock();

  document.getElementById('mp-search-input').addEventListener('keyup', renderMpFiltered);
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
  const tbody = document.getElementById('mp-bovinas-tbody');
  tbody.innerHTML = `<tr><td colspan="6">Cargando…</td></tr>`;

  fetch(`${API_URL}?action=bovinas&id_material=${encodeURIComponent(idMaterial)}&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      tbody.innerHTML = data.length
        ? data.map((b) => `
            <tr>
              <td>${b.idBovina}</td><td>${b.proveedor}</td>
              <td>${b.pesoInicial}</td><td>${b.pesoActual}</td>
              <td>${b.nCorridas}</td>
              <td><span class="badge ${b.estado === 'Disponible' ? 'badge-ok' : 'badge-neutral'}">${b.estado}</span></td>
            </tr>`).join('')
        : `<tr><td colspan="6">Sin bovinas registradas.</td></tr>`;
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
  ['prod-operario', 'prod-id-manga', 'prod-proveedor', 'prod-litros', 'prod-ancho',
   'prod-largo', 'prod-espesor', 'prod-millares', 'prod-peso-inicio', 'prod-peso-tuco']
    .forEach((id) => document.getElementById(id).value = '');
  document.getElementById('prod-estado-final').value = 'Terminado';
  document.getElementById('prod-peso-utilizado').textContent = '0.00';
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
  const idManga = document.getElementById('prod-id-manga').value.trim();
  const proveedor = document.getElementById('prod-proveedor').value.trim();
  const pesoInicio = Number(document.getElementById('prod-peso-inicio').value) || 0;
  const pesoTuco = Number(document.getElementById('prod-peso-tuco').value) || 0;

  if (!operario) { alert('Escribe el nombre del operario.'); return; }
  if (!idManga) { alert('Ingresa el ID de manga (bovina).'); return; }
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
