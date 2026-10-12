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
  if (v === null || v === undefined || isNaN(v)) return '—';
  const color = v >= 0 ? '#1a7f37' : '#c62828';
  return `<span style="color:${color}; font-weight:bold;">${v >= 0 ? '+' : ''}${v.toFixed(2)}</span>`;
}

// ---- Dashboard mensual ----
let _maProduccionesPropias = [];
let _maMes = null; // { y, m }  (m = 0..11)

function _maMesActual() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; }

function _maEnMes(p) {
  const d = new Date(p.fecha);
  return !isNaN(d.getTime()) && d.getFullYear() === _maMes.y && d.getMonth() === _maMes.m;
}

function _maMoverMes(delta) {
  const d = new Date(_maMes.y, _maMes.m + delta, 1);
  _maMes = { y: d.getFullYear(), m: d.getMonth() };
  renderDashboardMes();
}

window.initMiavanceModule = function () {
  _maMes = _maMesActual();

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
  document.getElementById('mi-avance-mes-prev').addEventListener('click', () => _maMoverMes(-1));
  document.getElementById('mi-avance-mes-next').addEventListener('click', () => _maMoverMes(1));
  document.getElementById('mi-avance-mes-hoy').addEventListener('click', () => { _maMes = _maMesActual(); renderDashboardMes(); });
    const _wrap = document.getElementById('mi-avance-tabla-wrap');
  const _setFull = (on) => {
    _wrap.classList.toggle('ma-full', on);
    document.body.style.overflow = on ? 'hidden' : '';
    document.getElementById('mi-avance-full-mes').textContent = document.getElementById('mi-avance-mes-label').textContent;
  };
  document.getElementById('mi-avance-full-abrir').addEventListener('click', () => _setFull(true));
  document.getElementById('mi-avance-full-cerrar').addEventListener('click', () => _setFull(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') _setFull(false); });

  const guardado = localStorage.getItem('mi_avance_operario');
  if (guardado) mostrarAvanceDe(guardado);
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
  if (!_maMes) _maMes = _maMesActual();

  fetch(`${API_URL}?action=produccion&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      _maProduccionesPropias = data
        .filter((p) => (p.operario || '').toUpperCase() === nombre.toUpperCase())
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      renderDashboardMes();
    })
    .catch((err) => {
      document.getElementById('mi-avance-tbody').innerHTML = `<tr><td colspan="13">Error: ${err.message}</td></tr>`;
    });
}

function _maRealKg(p) {
  const c = calcDiferenciaCorrida(p);
  if (c) return c.real;
  const ini = Number(p.pesoMangaInicio) || 0, tuco = Number(p.pesoTuco) || 0;
  if (p.estadoProceso !== 'En proceso' && ini > 0) return ini - tuco;
  return Number(p.pesoUtilizado) || 0;
}

function renderDashboardMes() {
  const $ = (id) => document.getElementById(id);
  const mesNombre = new Date(_maMes.y, _maMes.m, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  $('mi-avance-mes-label').textContent = mesNombre;

  const lista = _maProduccionesPropias.filter(_maEnMes);
  const terminadas = lista.filter((p) => p.estadoProceso !== 'En proceso');

  // KPIs
  const bolsas = terminadas.reduce((s, p) => s + (Number(p.millares) || 0) * 1000, 0);
  const kg = terminadas.reduce((s, p) => s + _maRealKg(p), 0);
  $('mi-avance-total-bolsas').textContent = Math.round(bolsas).toLocaleString('es-PE');
  $('mi-avance-total-kg').textContent = kg.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  $('mi-avance-total-corridas').textContent = lista.length;
  $('mi-avance-prom').textContent = terminadas.length
    ? `${(kg / terminadas.length).toFixed(1)} kg por corrida`
    : 'sin corridas terminadas';

  // Diferencia (a favor / en contra)
  let difTotal = 0, conDif = 0;
  terminadas.forEach((p) => { const c = calcDiferenciaCorrida(p); if (c) { difTotal += c.dif; conDif++; } });
  const elDif = $('mi-avance-total-dif'), elDifTxt = $('mi-avance-total-dif-txt');
  if (conDif) {
    elDif.innerHTML = formatDif(difTotal);
    elDifTxt.textContent = difTotal >= 0 ? 'A favor (kg)' : 'En contra (kg)';
  } else {
    elDif.textContent = '—'; elDifTxt.textContent = 'sin datos';
  }

  // Merma (tuco) = tuco / peso inicio
  let tucoTot = 0, iniTot = 0;
  terminadas.forEach((p) => {
    const ini = Number(p.pesoMangaInicio) || 0, tuco = Number(p.pesoTuco) || 0;
    if (ini > 0) { iniTot += ini; tucoTot += tuco; }
  });
  if (iniTot > 0) {
    $('mi-avance-merma').textContent = ((tucoTot / iniTot) * 100).toFixed(1) + '%';
    $('mi-avance-merma-sub').textContent = tucoTot.toFixed(1) + ' kg de tuco';
  } else {
    $('mi-avance-merma').textContent = '—'; $('mi-avance-merma-sub').textContent = 'sin datos';
  }

  // Última corrida del mes
  if (lista.length) {
    $('mi-avance-ultima').textContent = formatFechaAvance(lista[0].fecha);
    $('mi-avance-ultima-sub').textContent = (lista[0].idManga || '') + (lista[0].estadoProceso === 'En proceso' ? ' · en proceso' : '');
  } else {
    $('mi-avance-ultima').textContent = '—'; $('mi-avance-ultima-sub').innerHTML = '&nbsp;';
  }

  // Gráfico por día
  const diasMes = new Date(_maMes.y, _maMes.m + 1, 0).getDate();
  const porDia = new Array(diasMes).fill(0);
  terminadas.forEach((p) => { porDia[new Date(p.fecha).getDate() - 1] += (Number(p.millares) || 0) * 1000; });
  const max = Math.max(...porDia, 1);
  $('mi-avance-chart').innerHTML = porDia.map((v, i) =>
    `<div class="ma-bar ${v ? '' : 'vacio'}" title="Día ${i + 1}: ${Math.round(v).toLocaleString('es-PE')} bolsas" style="height:${v ? Math.max(4, (v / max) * 100) : 2}%"></div>`
  ).join('');
  $('mi-avance-chart-fin').textContent = diasMes;

  // Tabla del mes
  $('mi-avance-tbody').innerHTML = lista.length
    ? lista.map((p) => {
        const c = calcDiferenciaCorrida(p);
        const estado = p.estadoProceso === 'En proceso' ? 'En proceso' : (p.estadoFinal || '');
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
            <td data-label="Estado">${estado}</td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="13">No hay producciones en este mes.</td></tr>';
}

function formatFechaAvance(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
