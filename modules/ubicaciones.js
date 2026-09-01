let ubicacionesStockData = [];
let ubiHtml5QrCode = null;
let ubiScannerRunning = false;

window.initUbicacionesModule = function () {
  fetchStockParaUbicaciones();

  document.getElementById('btn-buscar-ubicacion').addEventListener('click', buscarUbicacion);
  document.getElementById('ubi-search-input').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') buscarUbicacion();
  });
  document.getElementById('btn-escanear-ubicacion').addEventListener('click', abrirScannerUbicacion);
  document.getElementById('ubi-scanner-close').addEventListener('click', cerrarScannerUbicacion);
  document.getElementById('ubicaciones-tbody').addEventListener('click', handleUbicacionesTablaClick);
};

function fetchStockParaUbicaciones() {
  fetch(`${API_URL}?action=stock&_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      ubicacionesStockData = data;
      renderTablaUbicaciones();
    })
    .catch((err) => {
      document.getElementById('ubicaciones-tbody').innerHTML = `<tr><td colspan="3">Error: ${err.message}</td></tr>`;
    });
}

function renderTablaUbicaciones() {
  const ubicacionesMap = {};
  ubicacionesStockData.forEach((item) => {
    if (item.ubicacion === 'Sin ubicar') return;
    if (!ubicacionesMap[item.ubicacion]) ubicacionesMap[item.ubicacion] = { productos: 0, total: 0 };
    ubicacionesMap[item.ubicacion].productos += 1;
    ubicacionesMap[item.ubicacion].total += item.disponible;
  });

  const codigos = Object.keys(ubicacionesMap).sort();
  document.getElementById('ubicaciones-tbody').innerHTML = codigos.length
    ? codigos.map((cod) => `
        <tr class="selectable" data-codigo="${cod}">
          <td data-label="Ubicación">${cod}</td>
          <td data-label="N° de productos">${ubicacionesMap[cod].productos}</td>
          <td data-label="Total disponible">${ubicacionesMap[cod].total}</td>
        </tr>`).join('')
    : `<tr><td colspan="3">Todavía no hay ubicaciones con productos asignados.</td></tr>`;
}

function handleUbicacionesTablaClick(e) {
  const row = e.target.closest('tr[data-codigo]');
  if (!row) return;
  document.getElementById('ubi-search-input').value = row.dataset.codigo;
  buscarUbicacion();
}

function buscarUbicacion() {
  const codigo = document.getElementById('ubi-search-input').value.trim();
  if (!codigo) return;
  mostrarProductosDeUbicacion(codigo);
}

function mostrarProductosDeUbicacion(codigo) {
  const productos = ubicacionesStockData.filter((item) => item.ubicacion === codigo);
  const box = document.getElementById('ubi-resultado-box');
  const tbody = document.getElementById('ubi-resultado-tbody');

  document.getElementById('ubi-resultado-codigo').textContent = codigo;
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!productos.length) {
    tbody.innerHTML = `<tr><td colspan="4">No hay productos registrados en esta ubicación.</td></tr>`;
    return;
  }

  tbody.innerHTML = productos.map((p) => {
    const badgeClass = p.estado === 'Normal' ? 'badge-ok' : p.estado === 'Bajo mínimo' ? 'badge-warn' : 'badge-danger';
    return `
      <tr>
        <td>${p.id}</td>
        <td>${p.descripcion}</td>
        <td>${p.disponible}</td>
        <td><span class="badge ${badgeClass}">${p.estado}</span></td>
      </tr>`;
  }).join('');
}

// ====== Escáner de código de barras (mismo motor que Stock, mismos ajustes de precisión) ======
function abrirScannerUbicacion() {
  document.getElementById('ubi-scanner-panel').classList.add('show');
  document.getElementById('ubi-scanner-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!ubiHtml5QrCode) {
    ubiHtml5QrCode = new Html5Qrcode('ubi-scanner-reader', {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.QR_CODE
      ],
      useBarCodeDetectorIfSupported: true
    });
  }

  const config = {
    fps: 20,
    qrbox: { width: 280, height: 110 },
    aspectRatio: 1.777,
    videoConstraints: {
      facingMode: 'environment',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' }]
    }
  };

  ubiHtml5QrCode.start(
    { facingMode: 'environment' },
    config,
    (decodedText) => {
      reproducirBeepUbicacion();
      document.getElementById('ubi-search-input').value = decodedText;
      cerrarScannerUbicacion();
      buscarUbicacion();
    },
    () => { /* frames sin detección, es normal */ }
  ).then(() => {
    ubiScannerRunning = true;
  }).catch((err) => {
    document.getElementById('ubi-scanner-panel').classList.remove('show');
    alert('No se pudo abrir la cámara: ' + err);
  });
}

function cerrarScannerUbicacion() {
  if (ubiHtml5QrCode && ubiScannerRunning) {
    ubiHtml5QrCode.stop().then(() => { ubiScannerRunning = false; }).catch(() => {});
  }
  document.getElementById('ubi-scanner-panel').classList.remove('show');
}

function reproducirBeepUbicacion() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscilador = ctx.createOscillator();
    const volumen = ctx.createGain();
    oscilador.connect(volumen);
    volumen.connect(ctx.destination);
    oscilador.type = 'sine';
    oscilador.frequency.value = 1000;
    volumen.gain.setValueAtTime(0.3, ctx.currentTime);
    volumen.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    oscilador.start();
    oscilador.stop(ctx.currentTime + 0.15);
  } catch (err) {
    console.warn('No se pudo reproducir el beep:', err);
  }
}
