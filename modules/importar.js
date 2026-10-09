let impFilas = [];
let impMateriales = [];

window.initImportarModule = function () {
  const $ = (id) => document.getElementById(id);

  $('imp-almacenero').value = localStorage.getItem('mp_last_almacenero') || '';
  $('imp-proveedor').value = localStorage.getItem('mp_last_proveedor') || '';

  $('imp-plantilla').addEventListener('click', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['ID_BOVINA', 'PESO_KG'],
      ['Z3310CFB', 25.4],
      ['Z3310CFB', 26.1]
    ]);
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mangas');
    XLSX.writeFile(wb, 'Plantilla_Ingreso_Mangas.xlsx');
  });

  $('imp-file').addEventListener('change', manejarArchivoImp);
  $('imp-confirmar').addEventListener('click', confirmarImportacion);
  cargarMaterialesImp();
};

async function cargarMaterialesImp() {
  try {
    const r = await fetch(`${API_URL}?action=materiales&_=${Date.now()}`, { cache: 'no-store' });
    const d = await r.json();
    impMateriales = Array.isArray(d) ? d : (d.data || d.materiales || []);
  } catch (e) { console.error('materiales', e); }
}

const impId   = (m) => String(m.ID ?? m.id ?? '').trim().toUpperCase();
const impDesc = (m) => String(m.DESCRIPCION ?? m.descripcion ?? '').trim();

async function manejarArchivoImp(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  if (!impMateriales.length) await cargarMaterialesImp();

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Busca la fila de encabezado (ID + PESO)
    let hIdx = -1, cId = -1, cPeso = -1;
    for (let i = 0; i < Math.min(filas.length, 30); i++) {
      const fila = filas[i].map((c) => String(c).trim().toUpperCase());
      const a = fila.findIndex((c) => c.startsWith('ID'));
      const b = fila.findIndex((c) => c.startsWith('PESO'));
      if (a >= 0 && b >= 0) { hIdx = i; cId = a; cPeso = b; break; }
    }
    if (hIdx < 0) { alert('No encontré las columnas ID_BOVINA y PESO_KG. Usa la plantilla.'); return; }

    const mapa = {};
    impMateriales.forEach((m) => { mapa[impId(m)] = m; });

    impFilas = [];
    for (let i = hIdx + 1; i < filas.length; i++) {
      const codigo = String(filas[i][cId] ?? '').trim().toUpperCase();
      const peso = Number(String(filas[i][cPeso] ?? '').replace(',', '.'));
      if (!codigo && !filas[i][cPeso]) continue; // fila vacía
      const mat = mapa[codigo];
      let estado = 'ok';
      if (!codigo || !mat) estado = 'sin_codigo';
      else if (!(peso > 0)) estado = 'sin_peso';
      impFilas.push({ codigo, peso, desc: mat ? impDesc(mat) : '', idReal: mat ? String(mat.ID ?? mat.id) : '', estado });
    }
    renderPreviewImp();
  } catch (e) {
    alert('No se pudo leer el archivo: ' + e.message);
  }
}

function renderPreviewImp() {
  const tbody = document.getElementById('imp-tbody');
  const resumen = document.getElementById('imp-resumen');
  const btn = document.getElementById('imp-confirmar');
  if (!tbody) return;

  const validas = impFilas.filter((f) => f.estado === 'ok');
  const kg = validas.reduce((s, f) => s + f.peso, 0);

  tbody.innerHTML = impFilas.length ? impFilas.map((f, i) => {
    const badge = f.estado === 'ok' ? '<span class="badge-ok">✅ OK</span>'
      : f.estado === 'sin_codigo' ? '<span class="badge-danger">❌ Código no existe</span>'
      : '<span class="badge-danger">❌ Peso inválido</span>';
    return `<tr><td>${i + 1}</td><td>${f.codigo || '—'}</td><td>${f.desc}</td><td>${isNaN(f.peso) ? '—' : f.peso}</td><td>${badge}</td></tr>`;
  }).join('') : '<tr><td colspan="5">El archivo no tiene filas.</td></tr>';

  resumen.innerHTML = `<b>${validas.length}</b> mangas válidas (${kg.toFixed(1)} kg) · ` +
    `<b>${impFilas.length - validas.length}</b> con error (se omiten)`;
  btn.disabled = validas.length === 0;
}

async function confirmarImportacion() {
  const almacenero = document.getElementById('imp-almacenero').value.trim();
  const proveedor = document.getElementById('imp-proveedor').value.trim();
  if (!almacenero) { alert('Selecciona el almacenero.'); return; }

  const validas = impFilas.filter((f) => f.estado === 'ok');
  if (!validas.length) return;

  // Agrupa por material → una llamada por código con su lista de pesos
  const grupos = {};
  validas.forEach((f) => { (grupos[f.idReal] = grupos[f.idReal] || []).push(f.peso); });

  const btn = document.getElementById('imp-confirmar');
  btn.disabled = true;
  btn.textContent = 'Importando…';

  let okCount = 0; const errores = [];
  for (const [idMat, pesos] of Object.entries(grupos)) {
    try {
      const r = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'ingresar_bovinas', id_material: idMat, pesos, proveedor, almacenero })
      });
      const res = await r.json();
      if (res.ok) okCount += pesos.length;
      else errores.push(`${idMat}: ${res.error}`);
    } catch (e) { errores.push(`${idMat}: ${e.message}`); }
  }

  localStorage.setItem('mp_last_almacenero', almacenero);
  if (proveedor) localStorage.setItem('mp_last_proveedor', proveedor);

  alert(`Importadas ${okCount} mangas.` + (errores.length ? `\n\nErrores:\n${errores.join('\n')}` : ''));

  if (!document.getElementById('imp-confirmar')) return;
  btn.textContent = '✔ Importar mangas válidas';
  if (!errores.length) {
    impFilas = [];
    document.getElementById('imp-file').value = '';
    renderPreviewImp();
  } else {
    btn.disabled = false;
  }
}
