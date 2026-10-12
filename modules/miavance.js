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
  document.getElementById('mi-avance-tbody').innerHTML = '<tr><td colspan="13">Cargando…</td></tr>';

  fetch(`${API_URL}?action=produccion&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      if (!document.getElementById('mi-avance-tbody')) return;
      const propios = data
        .filter((p) => (p.operario || '').toUpperCase() === nombre.toUpperCase())
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

      let difTotal = 0;
      propios.forEach((p) => { const c = calcDiferenciaCorrida(p); if (c) difTotal += c.dif; });

      document.getElementById('mi-avance-total-corridas').textContent = propios.length;
      document.getElementById('mi-avance-total-kg').textContent =
        propios.reduce((s, p) => s + (Number(p.pesoUtilizado) || 0), 0).toFixed(1);
      document.getElementById('mi-avance-ultima').textContent =
        propios.length ? formatFechaAvance(propios[0].fecha) : '—';
      document.getElementById('mi-avance-total-dif').innerHTML = formatDif(difTotal);
      document.getElementById('mi-avance-total-dif-txt').textContent = difTotal >= 0 ? 'A favor' : 'En contra';

      document.getElementById('mi-avance-tbody').innerHTML = propios.length
        ? propios.map((p) => {
            const c = calcDiferenciaCorrida(p);
            return `
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
              <td data-label="Fórmula (kg)">${c ? c.teorico.toFixed(2) : '—'}</td>
              <td data-label="Real (kg)">${c ? c.real.toFixed(2) : '—'}</td>
              <td data-label="Diferencia (kg)">${c ? formatDif(c.dif) : '—'}</td>
              <td data-label="Estado">${p.estadoProceso === 'En proceso' ? 'En proceso' : (p.estadoFinal || '')}</td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="13">Todavía no tienes producciones registradas.</td></tr>';
    })
    .catch((err) => {
      const tb = document.getElementById('mi-avance-tbody');
      if (tb) tb.innerHTML = `<tr><td colspan="13">Error: ${err.message}</td></tr>`;
    });
}

// ===== Fórmula de plástico a favor / en contra (global: la usa también En planta) =====
const FACTOR_FORMULA = 0.03;

function calcDiferenciaCorrida(p) {
  if (p.estadoProceso === 'En proceso') return null;
  const ancho = Number(p.ancho) || 0, largo = Number(p.largo) || 0;
  const esp = Number(p.espesor) || 0, mill = Number(p.millares) || 0;
  if (!(ancho > 0 && largo > 0 && esp > 0 && mill > 0)) return null;
  const ini = Number(p.pesoMangaInicio) || 0, tuco = Number(p.pesoTuco) || 0;
  const real = ini > 0 ? ini - tuco : (Number(p.pesoUtilizado) || 0);
  if (!(real > 0)) return null;
  const teorico = ancho * largo * esp * FACTOR_FORMULA * mill;
  return { teorico, real, dif: teorico - real };
}

function formatDif(v) {
  const color = v >= 0 ? '#1b7a2f' : '#b3261e';
  return `<span style="font-weight:bold;color:${color};">${v >= 0 ? '+' : ''}${v.toFixed(2)}</span>`;
}

function formatFechaAvance(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
