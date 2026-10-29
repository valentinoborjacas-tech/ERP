// @ts-nocheck
/**Code
 * SGA-Almacén — Backend Apps Script (Módulo 1: Stock)
 * ----------------------------------------------------
 * Copia de respaldo del código que corre en Google Apps Script.
 * Si cambias el código en Google, actualiza también este archivo (y al revés).
 *
 * Cómo desplegarlo:
 * 1. Abre tu Google Sheet (con las hojas ARTICULOS, UBICACION, MOVIMIENTOS).
 * 2. Extensiones > Apps Script.
 * 3. Borra el contenido de Code.gs y pega este archivo completo.
 * 4. Reemplaza SHEET_ID por el ID de tu Sheet (está en la URL, entre /d/ y /edit).
 * 5. Implementar > Gestionar implementaciones > (lápiz) Editar > Versión: Nueva versión > Implementar.
 *    (Así se mantiene la misma URL ".../exec". Una "Nueva implementación" crearía otra URL.)
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier usuario
 * 6. Si la URL cambia, pégala en assets/config.js del proyecto.
 *
 * Nombres de columnas esperados (sin tilde, deben coincidir EXACTO con la fila 1 del Sheet):
 *   ARTICULOS:   ID, DESCRIPCION, LITRAJE, COLOR, ANCHO, LARGO, ESPESOR, PRESENTACION,
 *                STOCK_MINIMO, STOCK_MAXIMO, ESTADO
 *   UBICACION:   ID_UBICACION, ID_FILA, MODULO, LADO, NIVEL, ID_ARTICULO,
 *                STOCK_DISPONIBLE, ULTIMA_ACTUALIZACION
 *   MOVIMIENTOS: FECHA/HORA, ID, ID_UBICACION, TIPO, CANTIDAD, MOTIVO, USUARIO
 *   ORDENES:         NUMERO, FECHA, SOLICITANTE, ESTADO, OBSERVACIONES
 *   ORDENES_DETALLE: NUMERO_ORDEN, ID_ARTICULO, DESCRIPCION, CANTIDAD_SOLICITADA,
 *                    CANTIDAD_DESPACHADA, ID_UBICACION, ESTADO_LINEA
 *   DESPACHOS (se crea sola): ID_DESPACHO, NUMERO_ORDEN, FECHA, ID_ARTICULO, DESCRIPCION,
 *                    CANTIDAD, ID_UBICACION, USUARIO
 */

// ====== CONFIGURACIÓN ======
const SHEET_ID = '14wbZFXccShrswRWJeyZyQSQC5icHJocmXIO1-Sykvt4';
const SHEET_ARTICULOS   = 'ARTICULOS';
const SHEET_UBICACION   = 'UBICACION';
const SHEET_MOVIMIENTOS = 'MOVIMIENTOS';
const SHEET_ORDENES = 'ORDENES';
const SHEET_ORDENES_DETALLE = 'ORDENES_DETALLE';
const SHEET_DESPACHOS = 'DESPACHOS';
const SHEET_MATERIALES = 'MATERIALES';
const SHEET_BOVINAS = 'BOVINAS';
const SHEET_PRODUCCION = 'PRODUCCION';

// ====== RUTAS ======
function doGet(e) {
  const action = e.parameter.action;
  if (action === 'stock') return jsonResponse(getStockDataCached());
  if (action === 'articulos') return jsonResponse(sheetToObjects(getSheet(SHEET_ARTICULOS)));
  if (action === 'movimientos') return jsonResponse(getMovimientosData(e.parameter.id));
  if (action === 'tickets') return jsonResponse(getTicketsData(e.parameter.operario));
  if (action === 'ordenes') return jsonResponse(getOrdenesData());
  if (action === 'orden_detalle') return jsonResponse(getOrdenDetalle(e.parameter.numero));
  if (action === 'despachos') return jsonResponse(getDespachos(e.parameter.numero));
  if (action === 'materiales') return jsonResponse(sheetToObjects(getSheet(SHEET_MATERIALES)));
  if (action === 'materia_prima_stock') return jsonResponse(getMateriaPrimaStock());
  if (action === 'bovinas') return jsonResponse(getBovinas(e.parameter.id_material));
  if (action === 'produccion') return jsonResponse(getProduccion(e.parameter.id_manga));
  return jsonResponse({ error: 'Acción GET no reconocida: ' + action });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'movimiento') return jsonResponse(registrarMovimiento(data));
    if (data.action === 'asignar_ubicacion') return jsonResponse(asignarUbicacion(data));
    if (data.action === 'crear_articulo') return jsonResponse(crearArticulo(data));
    if (data.action === 'nuevo_ticket') return jsonResponse(nuevoTicket(data));
    if (data.action === 'eliminar_ticket') return jsonResponse(eliminarTicket(data.numero));
    if (data.action === 'actualizar_ticket') return jsonResponse(actualizarTicket(data));
    if (data.action === 'crear_orden') return jsonResponse(crearOrden(data));
    if (data.action === 'despachar_orden') return jsonResponse(despacharOrden(data));
    if (data.action === 'ingresar_bovinas') return jsonResponse(ingresarBovinas(data));
    if (data.action === 'registrar_produccion') return jsonResponse(registrarProduccion(data));
    if (data.action === 'iniciar_produccion') return jsonResponse(iniciarProduccion(data));
    if (data.action === 'terminar_produccion') return jsonResponse(terminarProduccion(data));
    if (data.action === 'soltar_produccion') return jsonResponse(soltarProduccion(data));
    if (data.action === 'leer_orden_imagen') return jsonResponse(leerOrdenImagen(data.imagen_base64, data.mime_type));
    if (data.action === 'conciliar_stock') return jsonResponse(conciliarStock(data));
    if (data.action === 'editar_bovina') return jsonResponse(editarBovina(data));
    if (data.action === 'eliminar_bovina') return jsonResponse(eliminarBovina(data));
    if (data.action === 'asignar_zona') return jsonResponse(asignarZona(data));
    return jsonResponse({ error: 'Acción POST no reconocida: ' + data.action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ====== LÓGICA: STOCK (parte de ARTICULOS; UBICACION es opcional por producto) ======
function getStockData() {
  const articulos   = sheetToObjects(getSheet(SHEET_ARTICULOS));
  const ubicaciones = sheetToObjects(getSheet(SHEET_UBICACION));

  // Agrupamos las ubicaciones por ID de artículo UNA sola vez
  // (en vez de recorrer todas las ubicaciones por cada artículo, una y otra vez)
  const ubicacionesPorArticulo = {};
  ubicaciones.forEach(function (u) {
    if (!u.ID) return;
    if (!ubicacionesPorArticulo[u.ID]) ubicacionesPorArticulo[u.ID] = [];
    ubicacionesPorArticulo[u.ID].push(u);
  });

  const resultado = [];

  articulos.forEach(function (art) {
    const ubicacionesDelArticulo = ubicacionesPorArticulo[art.ID] || [];

    if (ubicacionesDelArticulo.length === 0) {
      resultado.push({
        id: art.ID, descripcion: art.DESCRIPCION || '',
        litraje: art.LITRAJE || '', color: art.COLOR || '', cf: art['C/F'] || '',
        ancho: art.ANCHO || '', largo: art.LARGO || '', espesor: art.ESPESOR || '',
        empresa: art.EMPRESA || '', cliente: art.CLIENTE || '',
        almacen: '', ubicacion: 'Sin ubicar', disponible: 0, estado: 'Sin ubicar'
      });
      return;
    }

    ubicacionesDelArticulo.forEach(function (u) {
      const disponible = Number(u.STOCK_DISPONIBLE) || 0;
      const minimo = Number(art.STOCK_MINIMO) || 0;
      let estado = 'Normal';
      if (disponible === 0) estado = 'Sin stock';
      else if (disponible < minimo) estado = 'Bajo mínimo';

      resultado.push({
        id: art.ID, descripcion: art.DESCRIPCION || '',
        litraje: art.LITRAJE || '', color: art.COLOR || '', cf: art['C/F'] || '',
        ancho: art.ANCHO || '', largo: art.LARGO || '', espesor: art.ESPESOR || '',
        empresa: art.EMPRESA || '', cliente: art.CLIENTE || '',
        almacen: u.ALMACEN || '', ubicacion: u.ID_UBICACION,
        disponible: disponible, estado: estado
      });
    });
  });

  return resultado;
}
function getStockDataCached() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('stock_data');
  if (cached) return JSON.parse(cached);

  const data = getStockData();
  try {
    cache.put('stock_data', JSON.stringify(data), 30); // se guarda 30 segundos
  } catch (err) {
    // Si el inventario es muy grande y no cabe en el caché, simplemente no lo guarda (no rompe nada)
  }
  return data;
}

function invalidarCacheStock() {
  CacheService.getScriptCache().removeAll(['stock_data', 'mp_stock']);
}

// ====== LÓGICA: REGISTRAR MOVIMIENTO (ingreso o venta) ======
function registrarMovimiento(data) {
  // data esperado: { id_articulo, id_ubicacion, tipo, cantidad, motivo, usuario }
  const movSheet  = getSheet(SHEET_MOVIMIENTOS);
  const ubicSheet = getSheet(SHEET_UBICACION);

  const cantidad = Number(data.cantidad) || 0;
  const ahora = new Date();

  const values  = ubicSheet.getDataRange().getValues();
  const headers = values[0];
  const colUbic     = headers.indexOf('ID_UBICACION');
  const colArticulo = headers.indexOf('ID');
  const colStock    = headers.indexOf('STOCK_DISPONIBLE');
  const colFecha    = headers.indexOf('ULTIMA_ACTUALIZACION');

  // Se compara como texto: el Sheet guarda IDs como número (22) y la página los envía como texto ("22")
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][colUbic]) === String(data.id_ubicacion) && String(values[i][colArticulo]) === String(data.id_articulo)) {
      const actual = Number(values[i][colStock]) || 0;
      const nuevo = data.tipo === 'Salida'
        ? Math.max(0, actual - cantidad)
        : actual + cantidad;

      ubicSheet.getRange(i + 1, colStock + 1).setValue(nuevo);
      ubicSheet.getRange(i + 1, colFecha + 1).setValue(ahora);

      // El movimiento se registra solo si de verdad se movió stock
      movSheet.appendRow([
        ahora,
        data.id_articulo,
        data.id_ubicacion,
        data.tipo,
        data.tipo === 'Salida' ? -cantidad : cantidad,
        data.motivo,
        data.usuario
      ]);
      invalidarCacheStock();

      return { ok: true, nuevoStock: nuevo };
    }
  }
  return { ok: false, error: 'No se encontró ese producto en esa ubicación' };
}
function asignarUbicacion(data) {
  // data esperado: { id_articulo, almacen, fila, modulo, lado, mueble, nivel, stock_inicial }
  const ubicSheet = getSheet(SHEET_UBICACION);
  const idUbicacion = data.almacen === 'Almacén 1'
    ? data.mueble + '-' + data.nivel
    : data.fila + '-' + data.modulo + '-' + data.lado + '-' + data.nivel;
  const stockInicial = Number(data.stock_inicial) || 0;
  const ahora = new Date();

  const values  = ubicSheet.getDataRange().getValues();
  const headers = values[0];
  const colUbic     = headers.indexOf('ID_UBICACION');
  const colAlmacen  = headers.indexOf('ALMACEN');
  const colFila     = headers.indexOf('FILA');
  const colModulo   = headers.indexOf('MODULO');
  const colLado     = headers.indexOf('LADO');
  const colMueble   = headers.indexOf('MUEBLE');
  const colNivel    = headers.indexOf('NIVEL');
  const colArticulo = headers.indexOf('ID');
  const colStock    = headers.indexOf('STOCK_DISPONIBLE');
  const colFecha    = headers.indexOf('ULTIMA_ACTUALIZACION');

  for (let i = 1; i < values.length; i++) {
    if (values[i][colUbic] === idUbicacion && values[i][colArticulo] === data.id_articulo) {
      ubicSheet.getRange(i + 1, colStock + 1).setValue(stockInicial);
      ubicSheet.getRange(i + 1, colFecha + 1).setValue(ahora);
       invalidarCacheStock();
      return { ok: true, id_ubicacion: idUbicacion, disponible: stockInicial };
    }
  }

  const nuevaFila = [];
  nuevaFila[colUbic] = idUbicacion;
  nuevaFila[colAlmacen] = data.almacen;
  nuevaFila[colFila] = data.fila || '';
  nuevaFila[colModulo] = data.modulo || '';
  nuevaFila[colLado] = data.lado || '';
  nuevaFila[colMueble] = data.mueble || '';
  nuevaFila[colNivel] = data.nivel;
  nuevaFila[colArticulo] = data.id_articulo;
  nuevaFila[colStock] = stockInicial;
  nuevaFila[colFecha] = ahora;
  ubicSheet.appendRow(nuevaFila);
  invalidarCacheStock();

  return { ok: true, id_ubicacion: idUbicacion, disponible: stockInicial };
}
// ====== LÓGICA: MOVIMIENTOS (historial, opcionalmente filtrado por producto) ======
function getMovimientosData(id) {
  const movimientos = sheetToObjects(getSheet(SHEET_MOVIMIENTOS));

  const resultado = movimientos.map(function (m) {
    const fechaRaw = m['FECHA/HORA'];
    return {
      fecha: fechaRaw instanceof Date ? fechaRaw.toISOString() : fechaRaw,
      id: m.ID,
      id_ubicacion: m.ID_UBICACION,
      tipo: m.TIPO,
      cantidad: m.CANTIDAD,
      motivo: m.MOTIVO,
      usuario: m.USUARIO
    };
  });

  if (id) {
    return resultado.filter(function (m) { return m.id === id; });
  }
  return resultado;
}

// ====== LÓGICA: CREAR ARTÍCULO NUEVO (catálogo) ======
function crearArticulo(data) {
  // data esperado: objeto con las mismas keys que los encabezados de ARTICULOS
  // (ID, DESCRIPCION, LITRAJE, COLOR, ANCHO, LARGO, ESPESOR, PRESENTACION,
  //  STOCK_MINIMO, STOCK_MAXIMO, ESTADO, EMPRESA, CLIENTE)
  const artSheet = getSheet(SHEET_ARTICULOS);
  const values = artSheet.getDataRange().getValues();
  const headers = values[0];

  const colId = headers.indexOf('ID');
  const yaExiste = values.slice(1).some(function (row) { return row[colId] === data.ID; });
  if (yaExiste) {
    return { ok: false, error: 'Ya existe un artículo con el ID "' + data.ID + '"' };
  }
  if (!data.ID) {
    return { ok: false, error: 'El ID es obligatorio' };
  }

  const nuevaFila = headers.map(function (h) { return data[h] !== undefined ? data[h] : ''; });
  artSheet.appendRow(nuevaFila);
    invalidarCacheStock();
  return { ok: true, id: data.ID };
}
// ====== LÓGICA: ÓRDENES DE DESPACHO ======
// Una orden puede despacharse en varias veces (despachos parciales). Cada despacho queda
// registrado en la hoja DESPACHOS con su propio número (DES-0001...), y las cantidades
// despachadas de ORDENES_DETALLE se van SUMANDO hasta completar lo solicitado.
function getOrdenesData() {
  const ordenes = sheetToObjects(getSheet(SHEET_ORDENES));
  return ordenes
    .filter(function (o) { return o.NUMERO !== '' && o.NUMERO !== null; })
    .map(function (o) {
      const fecha = o.FECHA instanceof Date ? o.FECHA.toISOString() : o.FECHA;
      return {
        numero: String(o.NUMERO),
        fecha: fecha,
        solicitante: o.SOLICITANTE || '',
        estado: o.ESTADO || 'Pendiente',
        observaciones: o.OBSERVACIONES || ''
      };
    });
}

function getOrdenDetalle(numero) {
  const detalle = sheetToObjects(getSheet(SHEET_ORDENES_DETALLE));
  return detalle
    .filter(function (d) { return String(d.NUMERO_ORDEN) === String(numero); })
    .map(function (d) {
      const solicitada = Number(d.CANTIDAD_SOLICITADA) || 0;
      const despachada = Number(d.CANTIDAD_DESPACHADA) || 0;
      return {
        idArticulo: d.ID_ARTICULO,
        descripcion: d.DESCRIPCION || '',
        cantidadSolicitada: solicitada,
        cantidadDespachada: despachada,
        cantidadPendiente: Math.max(solicitada - despachada, 0),
        idUbicacion: d.ID_UBICACION || '',
        estadoLinea: d.ESTADO_LINEA || 'Pendiente'
      };
    });
}

// Siguiente número correlativo (ORD-0001, DES-0001...) a partir del mayor que ya existe.
// No usa la cantidad de filas, para no repetir números si alguien borra una fila.
function siguienteNumero(sheet, columna, prefijo) {
  const values = sheet.getDataRange().getValues();
  const col = values[0].map(String).indexOf(columna);
  let max = 0;
  for (let i = 1; i < values.length; i++) {
    const n = parseInt(String(values[i][col] || '').replace(prefijo, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return prefijo + String(max + 1).padStart(4, '0');
}

function crearOrden(data) {
  // data esperado: { solicitante, observaciones, lineas: [{idArticulo, descripcion, cantidad}] }
  if (!data.solicitante) return { ok: false, error: 'El solicitante es obligatorio' };
  if (!data.lineas || !data.lineas.length) return { ok: false, error: 'Agrega al menos un producto' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ordenSheet = getSheet(SHEET_ORDENES);
    const detalleSheet = getSheet(SHEET_ORDENES_DETALLE);
    const numero = siguienteNumero(ordenSheet, 'NUMERO', 'ORD-');
    const ahora = new Date();

    ordenSheet.appendRow([numero, ahora, data.solicitante, 'Pendiente', data.observaciones || '']);

    data.lineas.forEach(function (l) {
      detalleSheet.appendRow([numero, l.idArticulo, l.descripcion || '', l.cantidad, 0, '', 'Pendiente']);
    });

    return { ok: true, numero: numero };
  } finally {
    lock.releaseLock();
  }
}

function getHojaDespachos() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_DESPACHOS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_DESPACHOS);
    sh.appendRow(['ID_DESPACHO', 'NUMERO_ORDEN', 'FECHA', 'ID_ARTICULO', 'DESCRIPCION', 'CANTIDAD', 'ID_UBICACION', 'USUARIO']);
  }
  return sh;
}

// Despachos registrados (todos, o solo los de una orden). Los usa también la app de cobranzas
// para generar automáticamente sus guías de salida.
function getDespachos(numero) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_DESPACHOS);
  if (!sh) return [];
  return sheetToObjects(sh)
    .filter(function (d) { return d.ID_DESPACHO && (!numero || String(d.NUMERO_ORDEN) === String(numero)); })
    .map(function (d) {
      return {
        idDespacho: String(d.ID_DESPACHO),
        numero: String(d.NUMERO_ORDEN),
        fecha: d.FECHA instanceof Date ? d.FECHA.toISOString() : d.FECHA,
        idArticulo: d.ID_ARTICULO,
        descripcion: d.DESCRIPCION || '',
        cantidad: Number(d.CANTIDAD) || 0,
        idUbicacion: d.ID_UBICACION || '',
        usuario: d.USUARIO || ''
      };
    });
}

function despacharOrden(data) {
  // data esperado: { numero, lineas: [{idArticulo, descripcion, idUbicacion, cantidadDespachar}], usuario }
  const numero = String(data.numero || '');
  if (!numero) return { ok: false, error: 'Falta el número de orden' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const detalleSheet = getSheet(SHEET_ORDENES_DETALLE);
    const values = detalleSheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const colNumero = headers.indexOf('NUMERO_ORDEN');
    const colId = headers.indexOf('ID_ARTICULO');
    const colCantSol = headers.indexOf('CANTIDAD_SOLICITADA');
    const colCantDesp = headers.indexOf('CANTIDAD_DESPACHADA');
    const colUbic = headers.indexOf('ID_UBICACION');
    const colEstadoLinea = headers.indexOf('ESTADO_LINEA');

    const filasOrden = [];
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][colNumero]) === numero) filasOrden.push(i);
    }
    if (!filasOrden.length) return { ok: false, error: 'No se encontró la orden ' + numero };

    // Stock por artículo y ubicación, para validar antes de mover nada
    const ubicValues = getSheet(SHEET_UBICACION).getDataRange().getValues();
    const uh = ubicValues[0].map(String);
    const uUbic = uh.indexOf('ID_UBICACION'), uArt = uh.indexOf('ID'), uStock = uh.indexOf('STOCK_DISPONIBLE');
    const stock = {};
    for (let i = 1; i < ubicValues.length; i++) {
      stock[String(ubicValues[i][uArt]) + '|' + String(ubicValues[i][uUbic])] = Number(ubicValues[i][uStock]) || 0;
    }

    // 1) Validar todo. Si algo falla no se despacha nada (todo o nada).
    const errores = [];
    const aplicar = [];
    const pendientePorFila = {};
    data.lineas.forEach(function (l) {
      const cantidad = Number(l.cantidadDespachar) || 0;
      if (cantidad <= 0) return;
      const idArt = String(l.idArticulo);
      const fila = filasOrden.find(function (i) { return String(values[i][colId]) === idArt; });
      if (fila === undefined) { errores.push(idArt + ': no pertenece a esta orden'); return; }
      if (!l.idUbicacion) { errores.push(idArt + ': elige de qué ubicación sale'); return; }

      if (pendientePorFila[fila] === undefined) {
        pendientePorFila[fila] = Math.max((Number(values[fila][colCantSol]) || 0) - (Number(values[fila][colCantDesp]) || 0), 0);
      }
      if (cantidad > pendientePorFila[fila]) {
        errores.push(idArt + ': solo quedan ' + pendientePorFila[fila] + ' por despachar'); return;
      }
      const clave = idArt + '|' + String(l.idUbicacion);
      if (stock[clave] === undefined) { errores.push(idArt + ': no está en la ubicación ' + l.idUbicacion); return; }
      if (cantidad > stock[clave]) { errores.push(idArt + ': en ' + l.idUbicacion + ' solo hay ' + stock[clave]); return; }

      pendientePorFila[fila] -= cantidad;
      stock[clave] -= cantidad;
      aplicar.push({ fila: fila, idArticulo: l.idArticulo, descripcion: l.descripcion || '', idUbicacion: l.idUbicacion, cantidad: cantidad });
    });
    if (errores.length) return { ok: false, error: errores.join('\n') };
    if (!aplicar.length) return { ok: false, error: 'No hay cantidades a despachar.' };

    // 2) Aplicar: descontar stock, sumar lo despachado y registrar el despacho
    const despSheet = getHojaDespachos();
    const idDespacho = siguienteNumero(despSheet, 'ID_DESPACHO', 'DES-');
    const usuario = data.usuario || 'almacenero';
    const ahora = new Date();
    const guia = [];

    aplicar.forEach(function (a) {
      const mov = registrarMovimiento({
        id_articulo: a.idArticulo,
        id_ubicacion: a.idUbicacion,
        tipo: 'Salida',
        cantidad: a.cantidad,
        motivo: 'Despacho ' + idDespacho + ' de orden ' + numero,
        usuario: usuario
      });
      if (!mov.ok) throw new Error(a.idArticulo + ': ' + mov.error);

      const solicitada = Number(values[a.fila][colCantSol]) || 0;
      const despachada = (Number(values[a.fila][colCantDesp]) || 0) + a.cantidad;
      values[a.fila][colCantDesp] = despachada;
      const ubicPrevias = String(values[a.fila][colUbic] || '').split(', ').filter(Boolean);
      if (ubicPrevias.indexOf(String(a.idUbicacion)) === -1) ubicPrevias.push(String(a.idUbicacion));
      detalleSheet.getRange(a.fila + 1, colCantDesp + 1).setValue(despachada);
      detalleSheet.getRange(a.fila + 1, colUbic + 1).setValue(ubicPrevias.join(', '));
      detalleSheet.getRange(a.fila + 1, colEstadoLinea + 1).setValue(despachada >= solicitada ? 'Despachado' : 'Parcial');

      despSheet.appendRow([idDespacho, numero, ahora, a.idArticulo, a.descripcion, a.cantidad, a.idUbicacion, usuario]);
      guia.push({ id: a.idArticulo, descripcion: a.descripcion, cantidad: a.cantidad, ubicacion: a.idUbicacion });
    });

    // 3) Estado de la orden mirando TODAS sus líneas (no solo las de este despacho)
    const completa = filasOrden.every(function (i) {
      return (Number(values[i][colCantDesp]) || 0) >= (Number(values[i][colCantSol]) || 0);
    });
    const estado = completa ? 'Despachada' : 'Despachada parcial';

    const ordenSheet = getSheet(SHEET_ORDENES);
    const ordenValues = ordenSheet.getDataRange().getValues();
    const ordenHeaders = ordenValues[0].map(String);
    const colOrdenNumero = ordenHeaders.indexOf('NUMERO');
    const colOrdenEstado = ordenHeaders.indexOf('ESTADO');
    for (let i = 1; i < ordenValues.length; i++) {
      if (String(ordenValues[i][colOrdenNumero]) === numero) {
        ordenSheet.getRange(i + 1, colOrdenEstado + 1).setValue(estado);
        break;
      }
    }

    return { ok: true, idDespacho: idDespacho, estado: estado, guia: guia };
  } finally {
    lock.releaseLock();
  }
}

const ZONAS_VALIDAS = ['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4'];
function asegurarColumna(sheet, nombre) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const i = headers.indexOf(nombre);
  if (i === -1) { sheet.getRange(1, lastCol + 1).setValue(nombre); return lastCol + 1; }
  return i + 1;
}

function ingresarBovinas(data) {
  // data: { id_material, pesos:[...], proveedor, almacenero, zona }
  if (!data.id_material || !data.pesos || !data.pesos.length) {
    return { ok: false, error: 'Faltan datos (material o pesos)' };
  }
  const zona = String(data.zona || '').trim();
  if (zona && ZONAS_VALIDAS.indexOf(zona) === -1) return { ok: false, error: 'Zona inválida' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const bovSheet = getSheet(SHEET_BOVINAS);
    asegurarColumna(bovSheet, 'ZONA');
    const nCols = bovSheet.getLastColumn();
    const headers = bovSheet.getRange(1, 1, 1, nCols).getValues()[0].map(String);
    const lastRow = bovSheet.getLastRow();
    const ahora = new Date();
    const creadas = [];

    const filas = data.pesos.map(function (peso, i) {
      const id = 'BOV-' + String(lastRow + i).padStart(4, '0');
      creadas.push(id);
      const fila = new Array(nCols).fill('');
      const put = function (h, v) { const c = headers.indexOf(h); if (c !== -1) fila[c] = v; };
      put('ID_BOVINA', id); put('ID_MATERIAL', data.id_material);
      put('PESO_INICIAL', peso); put('PESO_ACTUAL', peso);
      put('PROVEEDOR', data.proveedor || ''); put('ALMACENERO', data.almacenero || '');
      put('FECHA Y HORA', ahora); put('ESTADO', 'Disponible'); put('ZONA', zona);
      return fila;
    });
    bovSheet.getRange(lastRow + 1, 1, filas.length, nCols).setValues(filas);

    invalidarCacheStock();
    return { ok: true, bovinasCreadas: creadas };
  } finally {
    lock.releaseLock();
  }
}

function getBovinas(idMaterial) {
  const bovinas = sheetToObjects(getSheet(SHEET_BOVINAS));
  const corridas = {};
  sheetToObjects(getSheet(SHEET_PRODUCCION)).forEach(function (p) {
    if (p.ID_MANGA) corridas[p.ID_MANGA] = (corridas[p.ID_MANGA] || 0) + 1;
  });
  return bovinas
    .filter(function (b) {
      return (!idMaterial || b.ID_MATERIAL === idMaterial) && b.ESTADO !== 'Eliminado' && b.ESTADO !== 'Faltante';
    })
    .map(function (b) {
      const estado = b.ESTADO === 'En proceso'
        ? 'En proceso'
        : ((Number(b.PESO_ACTUAL) || 0) > 0 ? 'Disponible' : 'Agotada');
      return {
        idBovina: b.ID_BOVINA, proveedor: b.PROVEEDOR || '', almacenero: b.ALMACENERO || '',
        zona: b.ZONA || '',
        fecha: b['FECHA Y HORA'] || '', pesoInicial: Number(b.PESO_INICIAL) || 0,
        pesoActual: Number(b.PESO_ACTUAL) || 0, nCorridas: corridas[b.ID_BOVINA] || 0, estado: estado
      };
    });
}

function getMateriaPrimaStock() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('mp_stock');
  if (hit) return JSON.parse(hit);

  const materiales = sheetToObjects(getSheet(SHEET_MATERIALES));
  const bovinas = sheetToObjects(getSheet(SHEET_BOVINAS));
  const produccion = sheetToObjects(getSheet(SHEET_PRODUCCION));

  const corridasPorManga = {}, kgPorManga = {};
  produccion.forEach(function (p) {
    const id = p.ID_MANGA; if (!id) return;
    corridasPorManga[id] = (corridasPorManga[id] || 0) + 1;
    kgPorManga[id] = (kgPorManga[id] || 0) + (Number(p.PESO_UTILIZADO) || 0);
  });

  const agg = {};
  bovinas.forEach(function (b) {
    if (b.ESTADO === 'Faltante' || b.ESTADO === 'Eliminado' || !b.ID_MATERIAL) return;
    const a = agg[b.ID_MATERIAL] || (agg[b.ID_MATERIAL] = { n: 0, ing: 0, stock: 0, corr: 0, cons: 0, zonas: [], sinZona: 0 });
    a.n++;
    a.ing += Number(b.PESO_INICIAL) || 0;
    a.stock += Number(b.PESO_ACTUAL) || 0;
    a.corr += corridasPorManga[b.ID_BOVINA] || 0;
    a.cons += kgPorManga[b.ID_BOVINA] || 0;
    if ((Number(b.PESO_ACTUAL) || 0) > 0) {
      const z = String(b.ZONA || '').trim();
      if (z) { if (a.zonas.indexOf(z) === -1) a.zonas.push(z); } else { a.sinZona++; }
    }
  });

  const res = materiales.map(function (m) {
    const a = agg[m.ID] || { n: 0, ing: 0, stock: 0, corr: 0, cons: 0, zonas: [], sinZona: 0 };
    return {
      id: m.ID, descripcion: m.DESCRIPCION || '', unidad: m.UNIDAD || 'kg',
      nBovinas: Math.max(a.n - a.corr, 0), kgIngresados: a.ing,
      kgConsumidos: a.cons, stockActual: a.stock, nSalidas: a.corr,
      zonas: a.zonas.sort(), sinZona: a.sinZona
    };
  });
  try { cache.put('mp_stock', JSON.stringify(res), 60); } catch (e) {}
  return res;
}



function getProduccion(idManga) {
  const resultado = sheetToObjects(getSheet(SHEET_PRODUCCION)).map(function (p) {
    return {
      fecha: p['FECHA/HORA'] instanceof Date ? p['FECHA/HORA'].toISOString() : p['FECHA/HORA'],
      operario: p.OPERARIO, idManga: p.ID_MANGA, idMaterial: p.ID_MATERIAL || '', proveedor: p.PROVEEDOR,
      litros: p.LITROS, ancho: p.ANCHO, largo: p.LARGO, espesor: p.ESPESOR,
      millares: p.MILLARES, pesoMangaInicio: p.PESO_MANGA_INICIO, pesoTuco: p.PESO_TUCO,
      pesoUtilizado: p.PESO_UTILIZADO, estadoFinal: p.ESTADO_FINAL,
      idProduccion: p.ID_PRODUCCION || '', estadoProceso: p.ESTADO_PROCESO || '', observaciones: p.OBSERVACIONES || ''
    };
  });
  return idManga ? resultado.filter(function (p) { return p.idManga === idManga; }) : resultado;
}



function registrarProduccion(data) {
  const bovSheet = getSheet(SHEET_BOVINAS);
  const prodSheet = getSheet(SHEET_PRODUCCION);
  const pesoUtilizado = Number(data.peso_manga_inicio || 0) - Number(data.peso_tuco || 0);
  const ahora = new Date();

  const values = bovSheet.getDataRange().getValues();
  const headers = values[0];
  const colId = headers.indexOf('ID_BOVINA');
  const colMaterial = headers.indexOf('ID_MATERIAL');
  const colPeso = headers.indexOf('PESO_ACTUAL');
  const colEstado = headers.indexOf('ESTADO');
  let encontrada = false;
  let idMaterial = '';

  for (let i = 1; i < values.length; i++) {
    if (values[i][colId] === data.id_manga) {
      idMaterial = values[i][colMaterial];
      const nuevo = Math.max(0, (Number(values[i][colPeso]) || 0) - pesoUtilizado);
      bovSheet.getRange(i + 1, colPeso + 1).setValue(nuevo);
      if (nuevo <= 0) bovSheet.getRange(i + 1, colEstado + 1).setValue('Agotada');
      encontrada = true;
      break;
    }
  }
  if (!encontrada) return { ok: false, error: 'No se encontró la manga ' + data.id_manga };

  prodSheet.appendRow([
    ahora, data.operario, data.id_manga, data.proveedor || '', data.litros || '',
    data.ancho || '', data.largo || '', data.espesor || '', data.millares || '',
    data.peso_manga_inicio, data.peso_tuco, pesoUtilizado, data.estado_final || 'No terminado',
    idMaterial
  ]);

  invalidarCacheStock();
  return { ok: true, pesoUtilizado: pesoUtilizado };
}
// ====== CONCILIACIÓN DE STOCK POR MEDIDA ======
// data: { id_material, operario, cambios:[
//   {tipo:'corregir', id_bovina, peso_nuevo},
//   {tipo:'alta', peso},
//   {tipo:'faltante', id_bovina} ] }
function getHojaAjustes() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName('AJUSTES');
  if (!sh) {
    sh = ss.insertSheet('AJUSTES');
    sh.appendRow(['FECHA/HORA', 'TIPO', 'ID_MATERIAL', 'ID_BOVINA', 'PESO_ANTERIOR', 'PESO_NUEVO', 'OPERARIO', 'NOTA']);
  }
  return sh;
}

function conciliarStock(data) {
  if (!data.id_material || !data.cambios || !data.cambios.length) {
    return { ok: false, error: 'Faltan datos (material o cambios)' };
  }
  const operario = String(data.operario || '').trim();
  if (!operario) return { ok: false, error: 'Falta el nombre del operario' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const bovSheet = getSheet(SHEET_BOVINAS);
    const ajustes = getHojaAjustes();
    const ahora = new Date();
    const res = { corregidas: 0, altas: 0, faltantes: 0 };
    const errores = [];

    const values = bovSheet.getDataRange().getValues();
    const h = values[0];
    const cId = h.indexOf('ID_BOVINA'), cMat = h.indexOf('ID_MATERIAL');
    const cIni = h.indexOf('PESO_INICIAL'), cAct = h.indexOf('PESO_ACTUAL');
    const cEst = h.indexOf('ESTADO');
    if ([cId, cMat, cIni, cAct, cEst].some(function (c) { return c < 0; })) {
      return { ok: false, error: 'Faltan columnas en BOVINAS' };
    }

    function buscarFila(idBovina) {
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][cId]) === String(idBovina)) return i;
      }
      return -1;
    }

    data.cambios.forEach(function (c) {
      if (c.tipo === 'alta') {
        const peso = Number(c.peso);
        if (!(peso > 0)) { errores.push('Alta con peso inválido'); return; }
        const idBovina = 'BOV-' + String(bovSheet.getLastRow()).padStart(4, '0');
        bovSheet.appendRow([idBovina, data.id_material, peso, peso, '', operario + ' (conteo)', ahora, 'Disponible']);
        ajustes.appendRow([ahora, 'ALTA', data.id_material, idBovina, '', peso, operario, data.nota || '']);
        res.altas++;
        return;
      }

      const i = buscarFila(c.id_bovina);
      if (i < 0) { errores.push('No existe ' + c.id_bovina); return; }
      if (String(values[i][cMat]) !== String(data.id_material)) { errores.push(c.id_bovina + ' no es de este material'); return; }
      if (String(values[i][cEst]) === 'En proceso') { errores.push(c.id_bovina + ' está en proceso, no se puede modificar'); return; }

      const pesoAnt = Number(values[i][cAct]) || 0;

      if (c.tipo === 'corregir') {
        const nuevo = Number(c.peso_nuevo);
        if (!(nuevo > 0)) { errores.push(c.id_bovina + ': peso inválido'); return; }
        const delta = nuevo - pesoAnt;
        const ini = (Number(values[i][cIni]) || 0) + delta;
        bovSheet.getRange(i + 1, cAct + 1).setValue(nuevo);
        bovSheet.getRange(i + 1, cIni + 1).setValue(ini);
        values[i][cAct] = nuevo; values[i][cIni] = ini;
        ajustes.appendRow([ahora, 'CORRECCION', data.id_material, c.id_bovina, pesoAnt, nuevo, operario, data.nota || '']);
        res.corregidas++;
      } else if (c.tipo === 'faltante') {
        const ini = (Number(values[i][cIni]) || 0) - pesoAnt;
        bovSheet.getRange(i + 1, cAct + 1).setValue(0);
        bovSheet.getRange(i + 1, cIni + 1).setValue(ini);
        bovSheet.getRange(i + 1, cEst + 1).setValue('Faltante');
        values[i][cAct] = 0; values[i][cIni] = ini; values[i][cEst] = 'Faltante';
        ajustes.appendRow([ahora, 'FALTANTE', data.id_material, c.id_bovina, pesoAnt, 0, operario, data.nota || '']);
        res.faltantes++;
      } else {
        errores.push('Tipo de cambio desconocido: ' + c.tipo);
      }
    });

    invalidarCacheStock();
    return { ok: true, aplicados: res, errores: errores };
  } finally {
    lock.releaseLock();
  }
}
// ====== EDITAR / ELIMINAR MANGA (solo mangas Disponibles y sin corridas) ======
function _validarBovinaEditable(values, i, h, idBovina) {
  const estado = String(values[i][h.indexOf('ESTADO')]);
  if (estado !== 'Disponible') {
    return 'Solo se pueden modificar mangas Disponibles (estado actual: ' + estado + ').';
  }
  const tieneCorridas = sheetToObjects(getSheet(SHEET_PRODUCCION)).some(function (p) {
    return String(p.ID_MANGA) === String(idBovina);
  });
  if (tieneCorridas) return 'Esta manga ya fue usada en producción, no se puede modificar.';
  return '';
}

function editarBovina(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet(SHEET_BOVINAS);
    const values = sheet.getDataRange().getValues();
    const h = values[0].map(String);
    const cId = h.indexOf('ID_BOVINA'), cIni = h.indexOf('PESO_INICIAL'),
          cAct = h.indexOf('PESO_ACTUAL'), cMat = h.indexOf('ID_MATERIAL');
    if ([cId, cIni, cAct, cMat, h.indexOf('ESTADO')].some(function (c) { return c < 0; })) {
      return { ok: false, error: 'Faltan columnas en BOVINAS' };
    }
    const nuevo = Number(data.peso_nuevo);
    if (!(nuevo > 0)) return { ok: false, error: 'Peso inválido' };

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][cId]) !== String(data.id_bovina)) continue;
      const err = _validarBovinaEditable(values, i, h, data.id_bovina);
      if (err) return { ok: false, error: err };
      const anterior = Number(values[i][cAct]) || 0;
      sheet.getRange(i + 1, cAct + 1).setValue(nuevo);
      sheet.getRange(i + 1, cIni + 1).setValue(nuevo);
      getHojaAjustes().appendRow([new Date(), 'EDICION', values[i][cMat], data.id_bovina,
        anterior, nuevo, data.usuario || '', data.nota || '']);
      invalidarCacheStock();
      return { ok: true, pesoAnterior: anterior, pesoNuevo: nuevo };
    }
    return { ok: false, error: 'No se encontró la manga ' + data.id_bovina };
  } finally {
    lock.releaseLock();
  }
}

function eliminarBovina(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet(SHEET_BOVINAS);
    const values = sheet.getDataRange().getValues();
    const h = values[0].map(String);
    const cId = h.indexOf('ID_BOVINA'), cIni = h.indexOf('PESO_INICIAL'),
          cAct = h.indexOf('PESO_ACTUAL'), cEst = h.indexOf('ESTADO'), cMat = h.indexOf('ID_MATERIAL');
    if ([cId, cIni, cAct, cEst, cMat].some(function (c) { return c < 0; })) {
      return { ok: false, error: 'Faltan columnas en BOVINAS' };
    }
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][cId]) !== String(data.id_bovina)) continue;
      const err = _validarBovinaEditable(values, i, h, data.id_bovina);
      if (err) return { ok: false, error: err };
      const anterior = Number(values[i][cAct]) || 0;
      sheet.getRange(i + 1, cAct + 1).setValue(0);
      sheet.getRange(i + 1, cIni + 1).setValue(0);
      sheet.getRange(i + 1, cEst + 1).setValue('Eliminado');
      getHojaAjustes().appendRow([new Date(), 'ELIMINACION', values[i][cMat], data.id_bovina,
        anterior, 0, data.usuario || '', data.nota || '']);
      invalidarCacheStock();
      return { ok: true };
    }
    return { ok: false, error: 'No se encontró la manga ' + data.id_bovina };
  } finally {
    lock.releaseLock();
  }
}
// ====== UTILIDADES ======
function getSheet(name) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  if (!sheet) {
    throw new Error('No se encontró la pestaña "' + name + '". Revisa que el nombre coincida exacto (mayúsculas, espacios, tildes).');
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function leerOrdenImagen(base64, mimeType) {
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, 'orden_temp');
  const resource = { title: 'orden_temp_ocr', mimeType: MimeType.GOOGLE_DOCS };
  const archivoOCR = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: 'es' });

  const doc = DocumentApp.openById(archivoOCR.id);
  const texto = doc.getBody().getText();

  DriveApp.getFileById(archivoOCR.id).setTrashed(true);

  return matchearConCatalogo(parsearLineasOrden(texto));
}

function parsearLineasOrden(texto) {
  const lineas = texto.split('\n');
  const resultado = [];

  lineas.forEach(function (linea) {
    const limpio = linea.trim();
    if (!limpio) return;

    const match = limpio.match(/^(.*?)\s+([\d,]+)\s*$/);
    if (!match) return;

    const descripcion = match[1].trim();
    const cantidad = Number(match[2].replace(/,/g, ''));
    if (!descripcion || isNaN(cantidad) || cantidad <= 0) return;

    resultado.push({ lineaOriginal: limpio, descripcionDetectada: descripcion, cantidadDetectada: cantidad });
  });

  return resultado;
}

function matchearConCatalogo(lineas) {
  const articulos = sheetToObjects(getSheet(SHEET_ARTICULOS));
  const stockPorArticulo = {};
  getStockData().forEach(function (s) {
    stockPorArticulo[s.id] = (stockPorArticulo[s.id] || 0) + (Number(s.disponible) || 0);
  });

  return lineas.map(function (l) {
    const palabrasBuscadas = normalizarTexto(l.descripcionDetectada).split(' ').filter(Boolean);
    let mejor = null, mejorPuntaje = 0;

    articulos.forEach(function (a) {
      const palabrasArticulo = normalizarTexto(a.DESCRIPCION || '').split(' ').filter(Boolean);
      const coincidencias = palabrasBuscadas.filter(function (p) { return palabrasArticulo.indexOf(p) !== -1; }).length;
      if (coincidencias > mejorPuntaje) { mejorPuntaje = coincidencias; mejor = a; }
    });

    const stockDisponible = mejor ? (stockPorArticulo[mejor.ID] || 0) : 0;

    return {
      lineaOriginal: l.lineaOriginal,
      descripcionDetectada: l.descripcionDetectada,
      cantidadDetectada: l.cantidadDetectada,
      articuloSugeridoId: mejor ? mejor.ID : '',
      articuloSugeridoDescripcion: mejor ? mejor.DESCRIPCION : '',
      stockDisponible: stockDisponible,
      suficiente: mejor ? stockDisponible >= l.cantidadDetectada : null
    };
  });
}

function normalizarTexto(txt) {
  return (txt || '').toString().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function iniciarProduccion(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const bovSheet = getSheet(SHEET_BOVINAS);
    const prodSheet = getSheet(SHEET_PRODUCCION);
    const hit = bovSheet.createTextFinder(String(data.id_manga)).matchEntireCell(true).findNext();
    if (!hit) return { ok: false, error: 'No se encontró la manga ' + data.id_manga };

    const fila = hit.getRow();
    const lastCol = bovSheet.getLastColumn();
    const headers = bovSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    const row = bovSheet.getRange(fila, 1, 1, lastCol).getValues()[0];
    const colMaterial = headers.indexOf('ID_MATERIAL'), colEstado = headers.indexOf('ESTADO');
    const estado = String(row[colEstado]);
    if (estado === 'En proceso') return { ok: false, error: 'Esa manga ya está siendo usada por otro operario.' };
    if (estado === 'Eliminado' || estado === 'Faltante') return { ok: false, error: 'Esa manga no está disponible.' };

    bovSheet.getRange(fila, colEstado + 1).setValue('En proceso');

    const idProduccion = 'PROD-' + Date.now();
    prodSheet.appendRow([
      new Date(), data.operario, data.id_manga, data.proveedor || '',
      data.litros || '', data.ancho || '', data.largo || '', data.espesor || '', data.millares || '',
      '', '', '', '', row[colMaterial], idProduccion, 'En proceso'
    ]);

    invalidarCacheStock();
    return { ok: true, idProduccion: idProduccion };
  } finally {
    lock.releaseLock();
  }
}

function terminarProduccion(data) {
  const prodSheet = getSheet(SHEET_PRODUCCION);
  const bovSheet = getSheet(SHEET_BOVINAS);

  const hit = prodSheet.createTextFinder(String(data.id_produccion)).matchEntireCell(true).findNext();
  if (!hit) return { ok: false, error: 'No se encontró la tarea de producción.' };

  const filaProd = hit.getRow();
  const nCols = prodSheet.getLastColumn();
  const headers = prodSheet.getRange(1, 1, 1, nCols).getValues()[0].map(String);
  const rowRange = prodSheet.getRange(filaProd, 1, 1, nCols);
  const row = rowRange.getValues()[0];
  const idManga = row[headers.indexOf('ID_MANGA')];

  const pesoInicio = Number(data.peso_manga_inicio || 0);
  const pesoTuco = Number(data.peso_tuco || 0);
  const pesoUtilizado = Math.max(pesoInicio - pesoTuco, 0);

  const set = function (nombre, valor) {
    const c = headers.indexOf(nombre);
    if (c !== -1) row[c] = valor;
  };
  set('LITROS', data.litros || '');
  set('ANCHO', data.ancho || '');
  set('LARGO', data.largo || '');
  set('ESPESOR', data.espesor || '');
  set('MILLARES', data.millares || '');
  set('PESO_MANGA_INICIO', pesoInicio);
  set('PESO_TUCO', pesoTuco);
  set('PESO_UTILIZADO', pesoUtilizado);
  set('ESTADO_FINAL', data.estado_final || 'Terminado');
  set('OBSERVACIONES', data.observaciones || '');
  set('ESTADO_PROCESO', 'Terminado');
  rowRange.setValues([row]);

  const bhit = bovSheet.createTextFinder(String(idManga)).matchEntireCell(true).findNext();
  if (bhit) {
    const bLast = bovSheet.getLastColumn();
    const bh = bovSheet.getRange(1, 1, 1, bLast).getValues()[0].map(String);
    const bRow = bovSheet.getRange(bhit.getRow(), 1, 1, bLast).getValues()[0];
    const cPeso = bh.indexOf('PESO_ACTUAL'), cEst = bh.indexOf('ESTADO');
    const terminada = (data.estado_final || 'Terminado') === 'Terminado';
    const nuevo = terminada ? 0 : Math.max(0, (Number(bRow[cPeso]) || 0) - pesoUtilizado);
    bRow[cPeso] = nuevo;
    bRow[cEst] = nuevo <= 0 ? 'Agotada' : 'Disponible';
    bovSheet.getRange(bhit.getRow(), 1, 1, bLast).setValues([bRow]);
  }

  invalidarCacheStock();
  return {
    ok: true,
    pesoUtilizado: pesoUtilizado,
    merma: pesoTuco,
    mermaPct: pesoInicio > 0 ? (pesoTuco / pesoInicio) * 100 : 0
  };
}
function limpiarTucosTerminados() {
  const bovSheet = getSheet(SHEET_BOVINAS);
  const bov = bovSheet.getDataRange().getValues();
  const bh = bov[0].map(String);
  const cId = bh.indexOf('ID_BOVINA'), cAct = bh.indexOf('PESO_ACTUAL'), cEst = bh.indexOf('ESTADO');
  const ultima = {};
  sheetToObjects(getSheet(SHEET_PRODUCCION)).forEach(function (p) { if (p.ID_MANGA) ultima[p.ID_MANGA] = p; });

  const cambios = [];
  for (let i = 1; i < bov.length; i++) {
    const id = bov[i][cId], est = String(bov[i][cEst]), act = Number(bov[i][cAct]) || 0;
    const p = ultima[id];
    if (!p || act <= 0 || ['En proceso', 'Eliminado', 'Faltante'].indexOf(est) !== -1) continue;
    if (String(p.ESTADO_PROCESO) === 'Terminado' && String(p.ESTADO_FINAL) === 'Terminado') {
      bovSheet.getRange(i + 1, cAct + 1).setValue(0);
      bovSheet.getRange(i + 1, cEst + 1).setValue('Agotada');
      cambios.push(id + ' (' + act + ' kg)');
    }
  }
  invalidarCacheStock();
  Logger.log(cambios.length + ' mangas limpiadas: ' + cambios.join(', '));
}
function soltarProduccion(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const prodSheet = getSheet(SHEET_PRODUCCION);
    const bovSheet = getSheet(SHEET_BOVINAS);
    const pv = prodSheet.getDataRange().getValues();
    const ph = pv[0].map(String);
    const cIdProd = ph.indexOf('ID_PRODUCCION'), cManga = ph.indexOf('ID_MANGA'),
          cProc = ph.indexOf('ESTADO_PROCESO'), cOper = ph.indexOf('OPERARIO'),
          cMat = ph.indexOf('ID_MATERIAL');
    if (cIdProd < 0 || cManga < 0 || cProc < 0) return { ok: false, error: 'Faltan columnas en PRODUCCION' };

    let fila = -1;
    for (let i = 1; i < pv.length; i++) {
      if (String(pv[i][cIdProd]) === String(data.id_produccion)) { fila = i; break; }
    }
    if (fila === -1) return { ok: false, error: 'No se encontró la tarea.' };
    if (String(pv[fila][cProc]) !== 'En proceso') return { ok: false, error: 'Esa tarea ya no está en proceso.' };

    const idManga = pv[fila][cManga];
    const operario = cOper >= 0 ? pv[fila][cOper] : '';
    const idMaterial = cMat >= 0 ? pv[fila][cMat] : '';

    // La manga vuelve a Disponible
    const bv = bovSheet.getDataRange().getValues();
    const bh = bv[0].map(String);
    const bId = bh.indexOf('ID_BOVINA'), bEst = bh.indexOf('ESTADO'), bAct = bh.indexOf('PESO_ACTUAL');
    let pesoManga = '';
    for (let i = 1; i < bv.length; i++) {
      if (String(bv[i][bId]) === String(idManga)) {
        if (String(bv[i][bEst]) === 'En proceso') bovSheet.getRange(i + 1, bEst + 1).setValue('Disponible');
        pesoManga = bv[i][bAct];
        break;
      }
    }

    // Se elimina la fila "En proceso" (no hubo producción)
    prodSheet.deleteRow(fila + 1);

    getHojaAjustes().appendRow([new Date(), 'SOLTAR', idMaterial, idManga, pesoManga, pesoManga,
      data.operario || operario || '', data.nota || 'Manga soltada sin producir']);

    invalidarCacheStock();
    return { ok: true, idManga: idManga };
  } finally {
    lock.releaseLock();
  }
}
function asignarZona(data) {
  // data: { id_material, zona, usuario, solo_sin_zona (por defecto true) }
  const zona = String(data.zona || '').trim();
  if (ZONAS_VALIDAS.indexOf(zona) === -1) return { ok: false, error: 'Zona inválida' };
  if (!data.id_material) return { ok: false, error: 'Falta el material' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet(SHEET_BOVINAS);
    const zonaCol = asegurarColumna(sheet, 'ZONA');
    const last = sheet.getLastRow();
    if (last < 2) return { ok: true, actualizadas: 0 };
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    const cMat = headers.indexOf('ID_MATERIAL'), cEst = headers.indexOf('ESTADO'), cAct = headers.indexOf('PESO_ACTUAL');
    const values = sheet.getRange(2, 1, last - 1, lastCol).getValues();
    const soloSin = data.solo_sin_zona !== false;

    let n = 0;
    const nuevaCol = values.map(function (r) {
      const actual = String(r[zonaCol - 1] || '').trim();
      const aplica = String(r[cMat]) === String(data.id_material)
        && ['Eliminado', 'Faltante'].indexOf(String(r[cEst])) === -1
        && (Number(r[cAct]) || 0) > 0
        && (!soloSin || actual === '');
      if (aplica) { n++; return [zona]; }
      return [r[zonaCol - 1]];
    });
    sheet.getRange(2, zonaCol, nuevaCol.length, 1).setValues(nuevaCol);

    if (n > 0) {
      getHojaAjustes().appendRow([new Date(), 'ZONA', data.id_material, '', '', '', data.usuario || '', n + ' mangas → ' + zona]);
    }
    invalidarCacheStock();
    return { ok: true, actualizadas: n };
  } finally {
    lock.releaseLock();
  }
}
