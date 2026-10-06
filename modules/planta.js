let plantaTimer = null;

window.initPlantaModule = function () {
  document.getElementById('planta-refrescar').addEventListener('click', cargarPlanta);
  cargarPlanta();

  if (plantaTimer) clearInterval(plantaTimer);
  plantaTimer = setInterval(() => {
    if (!document.getElementById('planta-activas-tbody')) { // ya se salió del módulo
      clearInterval(plantaTimer);
      plantaTimer = null;
      return;
    }
    cargarPlanta();
  }, 30000);
};

function cargarPlanta() {
  fetch(`${API_URL}?action=produccion&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      const tbodyA = document.getElementById('planta-activas-tbody');
      const tbodyC = document.getElementById('planta-cerradas-tbody');
      if (!tbodyA || !tbodyC) return;

      const limite = typeof MERMA_MAX_PCT !== 'undefined' ? MERMA_MAX_PCT : 5;

      const activas = data
        .filter((p) => p.estadoProceso === 'En proceso')
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      const cerradas = data
        .filter((p) => p.estadoProceso !== 'En proceso')
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 30);

      document.getElementById('planta-resumen').textContent =
        `${activas.length} manga(s) en proceso · actualizado ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;

      tbodyA.innerHTML = activas.length
        ? activas.map((p) => `
            <tr>
              <td data-label="Operario"><b>${p.operario || ''}</b></td>
              <td data-label="Manga">${p.idManga || ''}</td>
              <td data-label="Material">${p.idMaterial || ''}</td>
              <td data-label="Iniciada">${formatFechaPlanta(p.fecha)}</td>
              <td data-label="Tiempo">${tiempoTranscurrido(p.fecha)}</td>
            </tr>`).join('')
        : '<tr><td colspan="5">Nadie tiene mangas en proceso en este momento.</td></tr>';

      tbodyC.innerHTML = cerradas.length
        ? cerradas.map((p) => {
            const inicio = Number(p.pesoMangaInicio) || 0;
            const tuco = Number(p.pesoTuco) || 0;
            const pct = inicio > 0 ? (tuco / inicio) * 100 : 0;
            const mermaTxt = inicio > 0 ? `${tuco.toFixed(2)} kg (${pct.toFixed(1)}%)` : '';
            const mermaBadge = inicio > 0
              ? `<span class="badge ${pct <= limite ? 'badge-ok' : 'badge-danger'}">${pct <= limite ? '✔' : '✖'}</span> `
              : '';
            return `
            <tr>
              <td data-label="Fecha">${formatFechaPlanta(p.fecha)}</td>
              <td data-label="Operario">${p.operario || ''}</td>
              <td data-label="Manga">${p.idManga || ''}</td>
              <td data-label="Material">${p.idMaterial || ''}</td>
              <td data-label="Millares">${p.millares || ''}</td>
              <td data-label="Peso utilizado" style="font-weight:bold;">${p.pesoUtilizado || ''}</td>
              <td data-label="Merma">${mermaBadge}${mermaTxt}</td>
              <td data-label="Estado">${p.estadoFinal || ''}</td>
              <td data-label="Observaciones">${p.observaciones || ''}</td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="9">Todavía no hay producciones cerradas.</td></tr>';
    })
    .catch((err) => {
      const tbodyA = document.getElementById('planta-activas-tbody');
      if (tbodyA) tbodyA.innerHTML = `<tr><td colspan="5">Error: ${err.message}</td></tr>`;
    });
}

function tiempoTranscurrido(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

function formatFechaPlanta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
