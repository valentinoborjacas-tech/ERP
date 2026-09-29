window.initMiavanceModule = function () {
  document.getElementById('mi-avance-select').addEventListener('change', () => {
    const esOtro = document.getElementById('mi-avance-select').value === '__otro__';
    document.getElementById('mi-avance-otro').style.display = esOtro ? 'block' : 'none';
    if (esOtro) document.getElementById('mi-avance-otro').focus();
  });

  document.getElementById('mi-avance-confirmar').addEventListener('click', confirmarSeleccionOperario);

  document.getElementById('mi-avance-cambiar').addEventListener('click', () => {
    localStorage.removeItem('mi_avance_operario');
    document.getElementById('mi-avance-panel').style.display = 'none';
    document.getElementById('mi-avance-selector').style.display = '';
  });

  const guardado = localStorage.getItem('mi_avance_operario');
  if (guardado) {
    mostrarAvanceDe(guardado);
  }
};

function confirmarSeleccionOperario() {
  const select = document.getElementById('mi-avance-select').value;
  const nombre = select === '__otro__'
    ? document.getElementById('mi-avance-otro').value.trim()
    : select;
  if (!nombre) { alert('Selecciona o escribe tu nombre.'); return; }
  localStorage.setItem('mi_avance_operario', nombre);
  mostrarAvanceDe(nombre);
}

function mostrarAvanceDe(nombre) {
  document.getElementById('mi-avance-selector').style.display = 'none';
  document.getElementById('mi-avance-nombre').textContent = nombre;
  document.getElementById('mi-avance-panel').style.display = 'block';
  document.getElementById('mi-avance-tbody').innerHTML = '<tr><td colspan="10">Cargando…</td></tr>';

  fetch(`${API_URL}?action=produccion&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      const propios = data
        .filter((p) => (p.operario || '').toUpperCase() === nombre.toUpperCase())
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

      document.getElementById('mi-avance-total-corridas').textContent = propios.length;
      document.getElementById('mi-avance-total-kg').textContent =
        propios.reduce((s, p) => s + (Number(p.pesoUtilizado) || 0), 0).toFixed(1);
      document.getElementById('mi-avance-ultima').textContent =
        propios.length ? formatFechaAvance(propios[0].fecha) : '—';

      document.getElementById('mi-avance-tbody').innerHTML = propios.length
        ? propios.map((p) => `
            <tr>
              <td data-label="Fecha">${formatFechaAvance(p.fecha)}</td>
              <td data-label="ID Manga">${p.idManga || ''}</td>
              <td data-label="Proveedor">${p.proveedor || ''}</td>
              <td data-label="Litros">${p.litros || ''}</td>
              <td data-label="Ancho">${p.ancho || ''}</td>
              <td data-label="Largo">${p.largo || ''}</td>
              <td data-label="Espesor">${p.espesor || ''}</td>
              <td data-label="Millares">${p.millares || ''}</td>
              <td data-label="Peso utilizado" style="font-weight:bold;">${p.pesoUtilizado || ''}</td>
              <td data-label="Estado">${p.estadoFinal || ''}</td>
            </tr>`).join('')
        : '<tr><td colspan="10">Todavía no tienes producciones registradas.</td></tr>';
    })
    .catch((err) => {
      document.getElementById('mi-avance-tbody').innerHTML = `<tr><td colspan="10">Error: ${err.message}</td></tr>`;
    });
}

function formatFechaAvance(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
