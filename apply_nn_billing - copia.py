# apply_nn_billing.py
import re
import shutil
import filecmp

# -----------------------------------------------------------------------------
# 1. Update app_full.js
# -----------------------------------------------------------------------------
with open("app_full.js", "r", encoding="utf-8") as f:
    code = f.read()

# A. Insert NN Facturación Total case into calcularLiquidacionSeguro()
target_liq_case = '  // =========================================================================\n  // CASO 3: ENTORNO PÚBLICO (MINSA / SIS / ESSALUD)\n  // ========================================================================='

nn_liq_block = '''  // =========================================================================
  // CASO ESPECIAL: PACIENTE NO IDENTIFICADO (NN / INDOCUMENTADO) AL ALTA
  // Al no haberse determinado su identidad ni seguro (SIS, EsSalud ni EPS),
  // cuando sale de alta o se liquida en caja, debe salir con su FACTURACIÓN TOTAL, NO EN 0.
  // =========================================================================
  const esNoIdentificado = Boolean(
    STATE.esNN ||
    (STATE.numDni && (String(STATE.numDni).toUpperCase() === "NN" || String(STATE.numDni).toUpperCase() === "S/D" || String(STATE.numDni).toUpperCase().startsWith("NN-"))) ||
    (padron && (padron.tipo_aseguramiento === "NN_EMERGENCIA" || (padron.publico && padron.publico.codigo === "EMERG-NN-27604"))) ||
    (STATE.identificador && String(STATE.identificador).toUpperCase().startsWith("NN-")) ||
    (STATE.identificador && String(STATE.identificador).toUpperCase().startsWith("CRITICO-ST")) ||
    (STATE.nombreReniec && String(STATE.nombreReniec).toUpperCase().includes("NN"))
  );

  const esAltaOEgreso = Boolean(
    STATE.altaClinicaConcluida ||
    (STATE.estadoSalida && STATE.estadoSalida !== "En atención activa") ||
    STATE.estadoFlujo === "CERRADO_FACTURADO" ||
    STATE.estadoFlujo === "ATENDIDO_ALTA" ||
    (typeof rolActivoVista !== "undefined" && rolActivoVista === "CAJA") ||
    (typeof faseActiva !== "undefined" && faseActiva === 4)
  );

  if (esNoIdentificado && esAltaOEgreso) {
    let totalCobroNN = totalBruto;
    if (totalCobroNN === 0) {
      const prioNN = STATE.prioridad || "I";
      totalCobroNN = prioNN === "I" ? 480.00 : (prioNN === "II" ? 320.00 : (prioNN === "III" ? 180.00 : 95.00));
      if (typeof registrarFacturaItem === "function" && STATE.items_factura.length === 0) {
        registrarFacturaItem(`Atención Médica de Emergencia (P-${prioNN}) · Paciente No Identificado`, totalCobroNN, "Emergencia");
      }
    }

    lugarAtencion = entorno === "privado"
      ? "Clínica Privada Especializada (Servicio de Emergencia)"
      : "Hospital Regional Docente UPP (Red Asistencial Pública)";
    etiquetaRegimen = "Paciente No Identificado (NN / Indocumentado) · Facturación Total al Alta";
    condicionSusalud = "Sin Identificación / Sin Seguro Acreditado (Facturación Total)";
    coberturaSector = `0% Cobertura Aseguradora (Facturación Total S/. ${totalCobroNN.toFixed(2)})`;
    copagoFijo = 0.00;
    pctCoaseguro = 100;
    coberturaSeguro = 0.00; // NINGUNA ASEGURADORA CUBRE POR FALTA DE IDENTIDAD Y SEGURO ACREDITADO
    totalPaciente = totalCobroNN; // SALE CON SU FACTURACIÓN TOTAL, NO EN 0
    alertaSector = `⚠️ Paciente no identificado que egresa de alta: Al no determinarse su identidad ni contar con seguro acreditado, sale con su FACTURACIÓN TOTAL de S/. ${totalCobroNN.toFixed(2)} (no en S/. 0.00).`;
    motivoLiquidacion = `FACTURACIÓN TOTAL AL ALTA — PACIENTE NO IDENTIFICADO (NN / INDOCUMENTADO). Al momento del egreso y alta médica, no fue posible confirmar la identidad biométrica del paciente ni acreditar afiliación a ningún seguro de salud (SIS, EsSalud ni IAFAS EPS). Por consiguiente, la cuenta asistencial no puede imputarse a ninguna aseguradora y se liquida al 100% con la FACTURACIÓN TOTAL acumulada de S/. ${totalCobroNN.toFixed(2)} (no en S/. 0.00) a cargo del paciente para gestión de cobro y recupero institucional.`;

    STATE.total_factura = totalCobroNN;

    return {
      lugarAtencion,
      totalBruto: totalCobroNN,
      subtotalServicios: Math.max(0, totalCobroNN - subtotalFarmacia),
      subtotalFarmacia,
      coberturaSeguro: 0.00,
      coaseguroFarmacia: 0,
      copagoUrgencia: 0,
      copagoFijo: 0,
      pctCoaseguro: 100,
      totalPaciente: totalCobroNN,
      motivoLiquidacion,
      etiquetaRegimen,
      condicionSusalud,
      coberturaSector,
      alertaSector,
      esEpsPrivado,
      esPublico
    };
  }

'''

if target_liq_case in code and "PACIENTE NO IDENTIFICADO (NN / INDOCUMENTADO) AL ALTA" not in code:
    code = code.replace(target_liq_case, nn_liq_block + target_liq_case)
    print("NN Facturación Total case inserted into calcularLiquidacionSeguro().")
else:
    print("WARNING: target_liq_case not found or already inserted.")

# B. Update cerrarAtencionPaciente to compute and set facturación total for NN
old_cerrar = '''  // Marcar como atendido / cerrado formalmente
  px.estadoFlujo = "CERRADO_FACTURADO";
  px.estadoAtencion = "Alta Médica / Cerrado";
  px.horaAlta = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  px.altaClinicaConcluida = true;'''

new_cerrar = '''  // Marcar como atendido / cerrado formalmente
  px.estadoFlujo = "CERRADO_FACTURADO";
  px.estadoAtencion = "Alta Médica / Cerrado";
  px.horaAlta = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  px.altaClinicaConcluida = true;

  // REGLA: Pacientes no identificados (NN) salen de alta con su FACTURACIÓN TOTAL, no en 0
  const esNNPx = Boolean(
    px.esNN ||
    (px.dni && (String(px.dni).toUpperCase() === "NN" || String(px.dni).toUpperCase() === "S/D" || String(px.dni).toUpperCase().startsWith("NN-"))) ||
    (px.nombre && String(px.nombre).toUpperCase().includes("NN")) ||
    (px.identificador && String(px.identificador).toUpperCase().startsWith("NN-")) ||
    (px.identificador && String(px.identificador).toUpperCase().startsWith("CRITICO-ST"))
  );

  let montoFinalNum = 0;
  if (typeof STATE !== "undefined" && STATE.id === id && STATE.items_factura && STATE.items_factura.length > 0) {
    montoFinalNum = STATE.items_factura.reduce((s, i) => s + (parseFloat(i.costo) || 0), 0);
  } else if (typeof expedientesStore !== "undefined" && expedientesStore[id] && expedientesStore[id].total_factura) {
    montoFinalNum = expedientesStore[id].total_factura;
  }
  if (!montoFinalNum || montoFinalNum === 0) {
    const prio = px.prioridad || "I";
    montoFinalNum = prio === "I" ? 480.00 : (prio === "II" ? 320.00 : (prio === "III" ? 180.00 : 95.00));
  }

  if (esNNPx) {
    px.montoTotal = `S/ ${montoFinalNum.toFixed(2)} (Facturación Total - Sin Seguro)`;
    if (typeof expedientesStore !== "undefined" && expedientesStore[id]) {
      expedientesStore[id].montoTotal = px.montoTotal;
      expedientesStore[id].total_factura = montoFinalNum;
      expedientesStore[id].estadoFlujo = "CERRADO_FACTURADO";
      expedientesStore[id].estadoSalida = "Alta Médica / Facturación Total";
    }
  } else if (!px.montoTotal) {
    px.montoTotal = (px.tipoSeguro && (px.tipoSeguro.includes("SIS") || px.tipoSeguro.includes("EsSalud")))
      ? `S/ 0.00 (Cobertura 100% ${px.tipoSeguro.includes("SIS") ? "SIS" : "EsSalud"})`
      : `S/ ${montoFinalNum.toFixed(2)}`;
  }'''

if old_cerrar in code:
    code = code.replace(old_cerrar, new_cerrar)
    print("cerrarAtencionPaciente updated with NN facturación total.")
else:
    print("WARNING: old_cerrar not found in code.")

# C. Update archivarDiaActualEnHistorico for NN montoTotal
old_archivar_monto = 'montoTotal: exp.montoTotal || p.montoTotal || "S/ 0.00",'

new_archivar_monto = '''montoTotal: (() => {
          const esNNItem = Boolean(
            p.esNN || exp.esNN ||
            (p.numDni && (p.numDni === "NN" || p.numDni === "S/D" || String(p.numDni).startsWith("NN-"))) ||
            (p.nombre && String(p.nombre).includes("NN"))
          );
          let m = exp.montoTotal || p.montoTotal;
          if (esNNItem && (!m || m === "S/ 0.00" || m.includes("0.00") || m === "S/ 0")) {
            const num = (exp.total_factura && exp.total_factura > 0)
              ? exp.total_factura
              : ((p.prioridad === "I" || exp.prioridad === "I") ? 480.00 : (p.prioridad === "II" ? 320.00 : 180.00));
            return `S/ ${num.toFixed(2)} (Facturación Total - Sin Seguro)`;
          }
          return m || "S/ 0.00";
        })(),'''

if old_archivar_monto in code:
    code = code.replace(old_archivar_monto, new_archivar_monto)
    print("archivarDiaActualEnHistorico updated with NN montoTotal.")
else:
    print("WARNING: old_archivar_monto not found in code.")

# D. Update obtenerListaTodosPacientesAuditoria for NN montoTotal
old_audit_monto = 'montoTotal: exp.montoTotal || p.montoTotal || (typeof STATE !== "undefined" && STATE.total_factura ? `S/ ${STATE.total_factura.toFixed(2)}` : "S/ 0.00"),'

new_audit_monto = '''montoTotal: (() => {
        const esNNPx = Boolean(
          p.esNN || exp.esNN ||
          (p.numDni && (p.numDni === "NN" || p.numDni === "S/D" || String(p.numDni).startsWith("NN-"))) ||
          (p.nombre && String(p.nombre).includes("NN"))
        );
        let m = exp.montoTotal || p.montoTotal;
        if (esNNPx && (!m || m === "S/ 0.00" || m.includes("0.00") || m === "S/ 0")) {
          const num = (typeof STATE !== "undefined" && STATE.id === idPx && STATE.total_factura && STATE.total_factura > 0)
            ? STATE.total_factura
            : (exp.total_factura || ((p.prioridad === "I" || exp.prioridad === "I") ? 480.00 : (p.prioridad === "II" ? 320.00 : 180.00)));
          return `S/ ${num.toFixed(2)} (Facturación Total - Sin Seguro)`;
        }
        return m || (typeof STATE !== "undefined" && STATE.total_factura ? `S/ ${STATE.total_factura.toFixed(2)}` : "S/ 0.00");
      })(),'''

if old_audit_monto in code:
    code = code.replace(old_audit_monto, new_audit_monto)
    print("obtenerListaTodosPacientesAuditoria updated with NN montoTotal.")
else:
    print("WARNING: old_audit_monto not found in code.")

# E. Update registrarSalida in Modulo 7 when Alta Medica is selected for NN
old_reg_salida = '  if (tipo === "Deceso — SINADEF") {'

new_reg_salida = '''  if (tipo === "Alta Médica") {
    const esNoId = Boolean(
      STATE.esNN ||
      (STATE.numDni && (String(STATE.numDni).toUpperCase() === "NN" || String(STATE.numDni).toUpperCase() === "S/D" || String(STATE.numDni).toUpperCase().startsWith("NN-"))) ||
      (STATE.nombreReniec && String(STATE.nombreReniec).toUpperCase().includes("NN"))
    );
    if (esNoId) {
      STATE.altaClinicaConcluida = true;
      if (typeof actualizarFactura === "function") actualizarFactura();
      display.innerHTML += `
        <div style="margin-top:10px;padding:10px;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;font-size:0.8rem;line-height:1.5;text-align:left;color:#9f1239;">
          <strong>⚠️ Liquidación al Alta de Paciente No Identificado (NN):</strong><br>
          Al no confirmarse la identidad del paciente antes del egreso, no fue posible acreditar cobertura en ningún seguro de salud (SIS, EsSalud ni EPS). Conforme a la normativa hospitalaria, la cuenta asistencial sale con su <strong>FACTURACIÓN TOTAL acumulada (no en S/ 0.00)</strong> para gestión institucional de cobro y recupero.
        </div>
      `;
    }
  }

  if (tipo === "Deceso — SINADEF") {'''

if old_reg_salida in code and "Liquidación al Alta de Paciente No Identificado" not in code:
    code = code.replace(old_reg_salida, new_reg_salida)
    print("registrarSalida in Modulo 7 updated for NN alta.")
else:
    print("WARNING: old_reg_salida not found in code.")

with open("app_full.js", "w", encoding="utf-8") as f:
    f.write(code)

shutil.copyfile("app_full.js", "app.js")
print("app_full.js and app.js written. Parity:", filecmp.cmp("app.js", "app_full.js", shallow=False))

# -----------------------------------------------------------------------------
# 2. Update redesign_cockpit.js in actualizarTarjetaResumenCaja
# -----------------------------------------------------------------------------
with open("redesign_cockpit.js", "r", encoding="utf-8") as f:
    cockpit_code = f.read()

old_caja_summary = '''    const seguro = state.tipoSeguro || "SIS Gratuito";
    if (elRegimen) elRegimen.textContent = seguro;
    if (elBadgeSeguro) elBadgeSeguro.textContent = `Seguro: ${seguro.split(" ")[0]}`;

    if (elCama) elCama.textContent = state.camaAsignada || "Sin cama";

    const firmaMed = px.firmas?.medico || state.firmas?.medico;
    if (elAlta) {
      elAlta.textContent = firmaMed ? `Firmada por ${firmaMed.usuario} (${firmaMed.colegiatura || "CMP"})` : "Pendiente de firma médica";
      elAlta.style.color = firmaMed ? "#059669" : "#d97706";
    }

    const totalFactura = document.getElementById("factura_total_monto")?.textContent || "S/ 0.00";
    if (elTotal) elTotal.textContent = totalFactura;'''

new_caja_summary = '''    const esNN = Boolean(
      px.esNN || state.esNN ||
      (state.numDni && (state.numDni === "NN" || state.numDni === "S/D" || String(state.numDni).startsWith("NN-"))) ||
      (state.nombreReniec && String(state.nombreReniec).includes("NN"))
    );

    const seguro = esNN
      ? "No Identificado · Sin Seguro (Cobro 100%)"
      : (state.tipoSeguro || "SIS Gratuito");

    if (elRegimen) elRegimen.textContent = seguro;
    if (elBadgeSeguro) elBadgeSeguro.textContent = esNN ? "Seguro: No Acreditado (NN)" : `Seguro: ${seguro.split(" ")[0]}`;

    if (elCama) elCama.textContent = state.camaAsignada || "Sin cama";

    const firmaMed = px.firmas?.medico || state.firmas?.medico;
    if (elAlta) {
      elAlta.textContent = firmaMed ? `Firmada por ${firmaMed.usuario} (${firmaMed.colegiatura || "CMP"})` : "Pendiente de firma médica";
      elAlta.style.color = firmaMed ? "#059669" : "#d97706";
    }

    const totalNumEl = document.getElementById("factura_total_num");
    const totalFactura = (totalNumEl && totalNumEl.textContent && parseFloat(totalNumEl.textContent) > 0)
      ? `S/ ${parseFloat(totalNumEl.textContent).toFixed(2)}`
      : (document.getElementById("factura_total_monto")?.textContent || (esNN ? "S/ 480.00" : "S/ 0.00"));
    if (elTotal) elTotal.textContent = totalFactura;'''

if old_caja_summary in cockpit_code:
    cockpit_code = cockpit_code.replace(old_caja_summary, new_caja_summary)
    with open("redesign_cockpit.js", "w", encoding="utf-8") as f:
        f.write(cockpit_code)
    print("redesign_cockpit.js updated for NN caja total.")
else:
    print("WARNING: old_caja_summary not found in redesign_cockpit.js")
