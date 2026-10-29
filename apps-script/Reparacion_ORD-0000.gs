// @ts-nocheck
/**
 * REPARACIÓN ÚNICA — Despacho de ORD-0000 hecho el 29/10/2026 con el código anterior.
 * ---------------------------------------------------------------------------------
 * Ese despacho registró las salidas en MOVIMIENTOS pero, por el error de IDs numéricos,
 * NO descontó el stock, NO actualizó ORDENES_DETALLE y marcó la orden como "Despachada" completa.
 *
 * Esta función completa lo que faltó (sin repetir los movimientos, que ya están):
 *   - Descuenta el stock en F1-M1-A-N1: art. 22 −15000, art. 31 −6000
 *   - ORDENES_DETALLE: art. 22 → 15000 Despachado, art. 31 → 6000 Parcial
 *   - ORDENES: ORD-0000 → "Despachada parcial"
 *   - DESPACHOS: registra el despacho DES-0001 (así cobranzas genera su guía de salida)
 *
 * Cómo usarla (una sola vez, DESPUÉS de pegar el Código nuevo):
 *   1. En Apps Script: Archivos (+) > Secuencia de comandos > nómbrala "Reparacion".
 *   2. Pega este archivo y guarda.
 *   3. Arriba, en el selector de funciones, elige "repararDespachoORD0000" y pulsa Ejecutar.
 *   4. Revisa el "Registro de ejecución": debe decir "Reparación completada".
 *   5. Borra este archivo "Reparacion" (ya no se necesita).
 *
 * Antes de cambiar nada valida que todo siga como estaba; si algo no coincide, se detiene sin tocar nada.
 */
function repararDespachoORD0000() {
  const NUMERO = 'ORD-0000';
  const UBICACION = 'F1-M1-A-N1';
  const FECHA = new Date('2026-10-29T23:46:28.700Z');
  const LINEAS = [
    { id: '22', descripcion: 'BOLSA NEGRO 140 LTS', cantidad: 15000 },
    { id: '31', descripcion: 'BOLSA NEGRO 25 LTS', cantidad: 6000 }
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // ---- 1) Validar ----
    const despSheet = getHojaDespachos();
    if (sheetToObjects(despSheet).some(function (d) { return String(d.NUMERO_ORDEN) === NUMERO; })) {
      throw new Error('Ya hay despachos registrados para ' + NUMERO + '. La reparación ya se hizo; no se cambió nada.');
    }

    const detSheet = getSheet(SHEET_ORDENES_DETALLE);
    const dv = detSheet.getDataRange().getValues();
    const dh = dv[0].map(String);
    const cNum = dh.indexOf('NUMERO_ORDEN'), cId = dh.indexOf('ID_ARTICULO'), cSol = dh.indexOf('CANTIDAD_SOLICITADA'),
          cDesp = dh.indexOf('CANTIDAD_DESPACHADA'), cUbic = dh.indexOf('ID_UBICACION'), cEst = dh.indexOf('ESTADO_LINEA');

    const ubSheet = getSheet(SHEET_UBICACION);
    const uv = ubSheet.getDataRange().getValues();
    const uh = uv[0].map(String);
    const uUbic = uh.indexOf('ID_UBICACION'), uArt = uh.indexOf('ID'), uStock = uh.indexOf('STOCK_DISPONIBLE'), uFecha = uh.indexOf('ULTIMA_ACTUALIZACION');

    const plan = LINEAS.map(function (l) {
      let filaDet = -1, filaUb = -1;
      for (let i = 1; i < dv.length; i++) {
        if (String(dv[i][cNum]) === NUMERO && String(dv[i][cId]) === l.id) { filaDet = i; break; }
      }
      if (filaDet === -1) throw new Error('No se encontró el art. ' + l.id + ' en el detalle de ' + NUMERO + '. No se cambió nada.');
      if ((Number(dv[filaDet][cDesp]) || 0) !== 0) throw new Error('El art. ' + l.id + ' ya tiene cantidad despachada. No se cambió nada.');

      for (let i = 1; i < uv.length; i++) {
        if (String(uv[i][uUbic]) === UBICACION && String(uv[i][uArt]) === l.id) { filaUb = i; break; }
      }
      if (filaUb === -1) throw new Error('No se encontró el art. ' + l.id + ' en ' + UBICACION + '. No se cambió nada.');
      const stock = Number(uv[filaUb][uStock]) || 0;
      if (stock < l.cantidad) throw new Error('El art. ' + l.id + ' tiene ' + stock + ' en ' + UBICACION + ', menos que ' + l.cantidad + '. No se cambió nada.');

      return { l: l, filaDet: filaDet, filaUb: filaUb, stock: stock, solicitada: Number(dv[filaDet][cSol]) || 0 };
    });

    // ---- 2) Aplicar ----
    const ahora = new Date();
    plan.forEach(function (p) {
      ubSheet.getRange(p.filaUb + 1, uStock + 1).setValue(p.stock - p.l.cantidad);
      ubSheet.getRange(p.filaUb + 1, uFecha + 1).setValue(ahora);

      detSheet.getRange(p.filaDet + 1, cDesp + 1).setValue(p.l.cantidad);
      detSheet.getRange(p.filaDet + 1, cUbic + 1).setValue(UBICACION);
      detSheet.getRange(p.filaDet + 1, cEst + 1).setValue(p.l.cantidad >= p.solicitada ? 'Despachado' : 'Parcial');

      despSheet.appendRow(['DES-0001', NUMERO, FECHA, Number(p.l.id), p.l.descripcion, p.l.cantidad, UBICACION, 'almacenero']);
    });

    const ordSheet = getSheet(SHEET_ORDENES);
    const ov = ordSheet.getDataRange().getValues();
    const oh = ov[0].map(String);
    for (let i = 1; i < ov.length; i++) {
      if (String(ov[i][oh.indexOf('NUMERO')]) === NUMERO) {
        ordSheet.getRange(i + 1, oh.indexOf('ESTADO') + 1).setValue('Despachada parcial');
        break;
      }
    }

    invalidarCacheStock();
    Logger.log('Reparación completada: ' + plan.map(function (p) {
      return 'art. ' + p.l.id + ' stock ' + p.stock + ' → ' + (p.stock - p.l.cantidad);
    }).join(', ') + '. ' + NUMERO + ' quedó "Despachada parcial" con el despacho DES-0001.');
  } finally {
    lock.releaseLock();
  }
}
