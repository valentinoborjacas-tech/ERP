  let ticketsData = [];

window.initTicketsModule = function () {
  fetchTickets();

  document.getElementById('tk-search-input').addEventListener('keyup', renderTicketsFiltered);
  document.getElementById('tk-filter-estado').addEventListener('change', renderTicketsFiltered);
  document.getElementById('tk-filter-operario').addEventListener('keyup', renderTicketsFiltered);

  document.getElementById('btn-nuevo-ticket').addEventListener('click', () => {
    document.getElementById('new-ticket-panel').classList.add('show');
  });
  document.getElementById('new-ticket-close').addEventListener('click', () => {
    document.getElementById('new-ticket-panel').classList.remove('show');
  });
  document.getElementById('new-ticket-confirm').addEventListener('click', crearTicketNuevo);

  document.getElementById('tickets-tbody').addEventListener('click', handleTicketsClick);
};

function fetchTickets() {
  fetch(`${API_URL}?action=tickets&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      ticketsData = data;
      renderTicketsFiltered();
    })
    .catch((err) => {
      document.getElementById('tickets-tbody').innerHTML = `<tr><td colspan="8">Error: ${err.message}</td></tr>`;
    });
}

function calcularUrgencia(fechaLimiteStr) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fechaLimite = new Date(fechaLimiteStr);
  fechaLimite.setHours(0, 0, 0, 0);

  const diffDias = Math.round((fechaLimite - hoy) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return { texto: `Vencido (${Math.abs(diffDias)}d)`, clase: 'badge-danger' };
  if (diffDias === 0) return { texto: 'Hoy', clase: 'badge-danger' };
  if (diffDias === 1) return { texto: 'Mañana', clase: 'badge-warn' };
  return { texto: `${diffDias} días`, clase: 'badge-ok' };
}

function badgeEstado(estado) {
  const clases = {
    'PENDIENTE': 'badge-neutral',
    'EN PROCESO': 'badge-ok',
    'PAUSADO': 'badge-warn',
    'COMPLETADO': 'badge-ok'
  };
  return clases[estado] || 'badge-neutral';
}

function renderTicketsFiltered() {
  const term = (document.getElementById('tk-search-input').value || '').toLowerCase();
  const estadoFiltro = document.getElementById('tk-filter-estado').value;
  const operarioFiltro = (document.getElementById('tk-filter-operario').value || '').toLowerCase();

  const filtrados = ticketsData.filter((t) => {
    const coincideTexto = !term ||
      t.numero.toLowerCase().includes(term) ||
      String(t.codigoProducto || '').toLowerCase().includes(term) ||
      String(t.material || '').toLowerCase().includes(term);
    const coincideEstado = !estadoFiltro || t.estado === estadoFiltro;
    const coincideOperario = !operarioFiltro || t.operario.toLowerCase().includes(operarioFiltro);
    return coincideTexto && coincideEstado && coincideOperario;
  });

  document.getElementById('tickets-tbody').innerHTML = filtrados.length
    ? filtrados.map(ticketRowHtml).join('')
    : `<tr><td colspan="8">No se encontraron tickets.</td></tr>`;

  document.getElementById('tk-metric-total').textContent = ticketsData.length;
  document.getElementById('tk-metric-pendientes').textContent = ticketsData.filter((t) => t.estado === 'PENDIENTE').length;
  document.getElementById('tk-metric-proceso').textContent = ticketsData.filter((t) => t.estado === 'EN PROCESO').length;
  document.getElementById('tk-metric-completados').textContent = ticketsData.filter((t) => t.estado === 'COMPLETADO').length;
}

function ticketRowHtml(t) {
  const urgencia = calcularUrgencia(t.fechaLimite);
  const productoTexto = [t.codigoProducto, t.material].filter(Boolean).join(' — ');
  const puedeEliminar = t.estado === 'COMPLETADO';

  return `
    <tr data-numero="${t.numero}">
      <td data-label="N° Ticket">${t.numero}</td>
      <td data-label="Producto">${productoTexto}</td>
      <td data-label="Cantidad">${t.cantidad}</td>
      <td data-label="Operario">${t.operario}</td>
      <td data-label="Fecha límite">${new Date(t.fechaLimite).toLocaleDateString()}</td>
      <td data-label="Urgencia"><span class="badge ${urgencia.clase}">${urgencia.texto}</span></td>
      <td data-label="Estado"><span class="badge ${badgeEstado(t.estado)}">${t.estado}</span></td>
      <td data-label="Acciones">
        ${puedeEliminar ? `<button class="btn-classic btn-icon-sm btn-danger" data-action="eliminar" title="Eliminar">✕</button>` : ''}
      </td>
    </tr>`;
}

function handleTicketsClick(e) {
  const btn = e.target.closest('[data-action="eliminar"]');
  if (!btn) return;
  const numero = e.target.closest('tr').dataset.numero;

  if (!confirm(`¿Eliminar el ticket ${numero}? Esta acción no se puede deshacer.`)) return;

  fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'eliminar_ticket', numero }) })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) fetchTickets();
      else alert('Error: ' + resultado.error);
    });
}

function crearTicketNuevo() {
  const nuevo = {
    codigoProducto: document.getElementById('nt-codigo').value.trim(),
    material: document.getElementById('nt-material').value.trim(),
    cantidad: document.getElementById('nt-cantidad').value,
    ordenVinculada: document.getElementById('nt-orden').value.trim(),
    operario: document.getElementById('nt-operario').value.trim(),
    fechaLimite: document.getElementById('nt-fecha').value
  };

  if (!nuevo.codigoProducto && !nuevo.material) {
    alert('Indica al menos código de producto o material.');
    return;
  }
  if (!nuevo.cantidad || !nuevo.operario || !nuevo.fechaLimite) {
    alert('Cantidad, operario y fecha límite son obligatorios.');
    return;
  }

  const confirmBtn = document.getElementById('new-ticket-confirm');
  confirmBtn.textContent = 'Creando…';
  confirmBtn.disabled = true;

  fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'nuevo_ticket', ...nuevo }) })
    .then((r) => r.json())
    .then((resultado) => {
      if (resultado.ok) {
        document.getElementById('new-ticket-panel').classList.remove('show');
        ['nt-codigo','nt-material','nt-cantidad','nt-orden','nt-operario','nt-fecha']
          .forEach((id) => document.getElementById(id).value = '');
        fetchTickets();
      } else {
        alert('Error: ' + resultado.error);
      }
    })
    .catch((err) => alert('Error de conexión: ' + err.message))
    .finally(() => {
      confirmBtn.textContent = '✔ Crear ticket';
      confirmBtn.disabled = false;
    });
}
