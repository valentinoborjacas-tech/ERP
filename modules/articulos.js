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
        ['na-id','na-descripcion','na-litraje','na-color','na-presentacion','na-ancho','na-largo','na-espesor','na-empresa','na-cliente']
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
