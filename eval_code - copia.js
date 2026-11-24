function evaluarTriajeEstandar(datos = {}) {
  const fr = datos.fr ?? null;
  const spo2 = datos.spo2 ?? null;
  const pas = datos.pas ?? null;
  const pad = datos.pad ?? null;
  const fc = datos.fc ?? null;
  const glasgow = datos.glasgow ?? null;
  const temp = datos.temp ?? null;
  const glucosa = datos.glucosa ?? null;
  const eva = datos.eva ?? null;
  const esPediatrico = Boolean(datos.esPediatrico);
  const edad = typeof datos.edad === "number" ? datos.edad : 30;

  const esIngresoCritico = Boolean(datos.ingresoDirectoCritico || datos.panicoShockTrauma || (typeof STATE !== "undefined" && STATE.ingresoDirectoCritico));
  const motivoCritico = datos.motivoIngresoCritico || (typeof STATE !== "undefined" && STATE.motivoIngresoCritico) || "Activación directa de Trauma Shock / Riesgo Vital Inmediato — Ley N° 27604";
  const todosVitalesVacios = (fr === null && spo2 === null && pas === null && pad === null && fc === null && glasgow === null && temp === null);

  const news2 = calcularNEWS2({ fr, spo2, pas, fc, glasgow, temp, esPediatrico, edad });

  // REGLA CLÍNICA DE INGRESO DIRECTO CRÍTICO (Ley N° 27604 / NTS N° 042-MINSA):
  // Si el paciente ingresó por pase crítico directo, se garantiza Prioridad I obligatoria en auditoría.
  if (esIngresoCritico) {
    if (todosVitalesVacios) {
      news2.esPendienteMonitorizacion = true;
      news2.scoreTotal = 0;
      news2.maxParametroUnico = 0;
      news2.desglose = ["Pendiente de monitorización (Ingreso Directo P-I)"];
      return {
        prioridad: "I",
        esiNivel: 1,
        compuerta: "COMPUERTA A (Intervención Vital Inmediata)",
        slaNormativo: "Inmediato — 0 min (NTS N° 042-MINSA)",
        news2,
        motivos: [motivoCritico],
        resumenClinico: "Riesgo vital inminente. Destino: Unidad de Shock Trauma / Reanimación."
      };
    } else {
      // El usuario ingresó signos vitales posteriormente: calcular puntaje NEWS2 real sin degradar Prioridad I
      const motivosConSignos = [motivoCritico];
      if (news2.scoreTotal > 0) {
        motivosConSignos.push(`Monitoreo hemodinámico en curso: NEWS2 ${news2.scoreTotal} pts (Máx. indiv. ${news2.maxParametroUnico} pts)`);
      }
      return {
        prioridad: "I",
        esiNivel: 1,
        compuerta: "COMPUERTA A (Intervención Vital Inmediata)",
        slaNormativo: "Inmediato — 0 min (NTS N° 042-MINSA)",
        news2,
        motivos: motivosConSignos,
        resumenClinico: "Riesgo vital inminente. Destino: Unidad de Shock Trauma / Reanimación."
      };
    }
  }

  const indiceShock = (fc !== null && pas !== null && pas > 0) ? (fc / pas) : null;
  const tieneCodTiempo = Boolean(datos.codigoInfarto || datos.codigoIctus || datos.codigoSepsis);
  const claveObst = datos.claveObstetrica || null;
  const esGestante = Boolean(datos.esGestante);

  // =========================================================================
  // 1. COMPUERTA A (MTS ROJO / ESI 1 -> PRIORIDAD I - Rojo, SLA: Inmediato 0 min)
  // Amenaza vital inmediata real / Discriminadores MTS Nivel 1
  // =========================================================================
  const amenazasA = [];

  // Discriminadores MTS - Nivel 1 (Rojo - P-I Inmediato 0 min)
  if (datos.mts_vital) {
    amenazasA.push("Compromiso Vital Inmediato MTS (Vía aérea / Shock profundo)");
  }
  if (datos.mts_hemorragia === "exanguinante") {
    amenazasA.push("Hemorragia Exanguinante Incontrolable MTS");
  }
  if (datos.mts_conciencia === "no_responde") {
    amenazasA.push("No Responde / Pérdida Total de Conciencia MTS");
  }
  if (typeof datos.tep_lados_alterados === "number" && datos.tep_lados_alterados >= 2) {
    amenazasA.push(`TEP Pediátrico Crítico (≥ 2 lados alterados: ${datos.tep_lados_alterados})`);
  }
  if (datos.ped_no_reactivo) {
    amenazasA.push("Niño no reactivo / Convulsión activa / Estridor en reposo MTS");
  }
  if (datos.obst_clave_roja) {
    amenazasA.push("Emergencia Obstétrica Extrema MTS (Clave Roja / Eclampsia / Shock)");
  }
  if (datos.alerta_anafilaxia) {
    amenazasA.push("Anafilaxia Severa / Edema de Glotis / Estridor");
  }
  if (temp !== null && (temp >= 41.0 || temp < 35.0)) {
    amenazasA.push(`Temperatura Extrema MTS (${temp} °C - Hipertermia Maligna / Hipotermia Severa)`);
  }

  if (datos.panicoShockTrauma || datos.esParoOAgonia) {
    amenazasA.push("Paro Cardiorrespiratorio Inminente / Botón de Pánico Shock Trauma");
  }
  if (news2.scoreTotal >= 7) {
    amenazasA.push(`NEWS2 Crítico ≥ 7 pts (${news2.scoreTotal} pts - Alto Riesgo Fisiológico)`);
  }
  if (glasgow !== null && glasgow <= 8) {
    amenazasA.push(`Glasgow Coma Scale ≤ 8 (${glasgow}/15 - Coma / Vía Aérea en Riesgo Inminente)`);
  }
  if (spo2 !== null && spo2 < 90) {
    amenazasA.push(`Insuficiencia Respiratoria Severa SpO2 < 90% (${spo2}%)`);
  }
  if (pas !== null && pas < 90) {
    amenazasA.push(`Colapso Hemodinámico / Shock PAS < 90 mmHg (${pas} mmHg)`);
  }
  if (indiceShock !== null && indiceShock >= 1.3) {
    amenazasA.push(`Índice de Shock Severo ≥ 1.3 (${indiceShock.toFixed(2)})`);
  }
  if (glucosa !== null && glucosa < 54) {
    amenazasA.push(`Hipoglucemia Severa Grado 3 ADA < 54 mg/dL (${glucosa} mg/dL - Neuroglucopenia)`);
  }
  if (glucosa !== null && glucosa > 600) {
    amenazasA.push(`Estado Hiperosmolar Hiperglucémico Extremo ADA > 600 mg/dL (${glucosa} mg/dL)`);
  }
  if (glucosa !== null && glucosa > 250) {
    const descompensado = (glasgow !== null && glasgow <= 13) ||
                          (fr !== null && fr >= 24) ||
                          (pas !== null && pas < 90) ||
                          (news2.scoreTotal >= 5);
    if (descompensado) {
      amenazasA.push(`Crisis Hiperglucémica Descompensada ADA (Glucosa ${glucosa} mg/dL con Inestabilidad Sistémica)`);
    }
  }
  if (claveObst === "roja" || claveObst === "azul") {
    amenazasA.push(`Clave Obstétrica Crítica MINSA: Clave ${claveObst.toUpperCase()} (Hemorragia / Eclampsia)`);
  } else if (esGestante && ((pas !== null && pas >= 160) || (pad !== null && pad >= 110))) {
    amenazasA.push(`Gestante con Emergencia Hipertensiva Severa PA ${pas || "--"}/${pad || "--"} mmHg (Riesgo Preeclampsia Severa)`);
  }
  if (tieneCodTiempo) {
    const inestabilidad = (news2.scoreTotal >= 5) ||
                          (pas !== null && pas < 95) ||
                          (spo2 !== null && spo2 < 92) ||
                          (glasgow !== null && glasgow <= 13);
    if (inestabilidad) {
      amenazasA.push("Código Tiempo-Dependiente (Infarto/Ictus/Sepsis) con Inestabilidad Fisiológica");
    }
  }

  if (amenazasA.length > 0) {
    return {
      prioridad: "I",
      esiNivel: 1,
      compuerta: "COMPUERTA A (Amenaza Vital Inmediata)",
      slaNormativo: "Inmediato (0 min)",
      news2,
      motivos: amenazasA,
      resumenClinico: "Riesgo vital inminente. Destino: Unidad de Shock Trauma / Reanimación."
    };
  }

  // =========================================================================
  // GUARDA DE INVARIANTE 1:
  // Si NEWS2 === 0, glucosa normal, EVA 0 y sin códigos/claves -> JAMÁS P-I ni P-II
  // =========================================================================
  const glucosaNormal = (glucosa === null) || (glucosa >= 70 && glucosa < 180);
  const evaCero = (eva === null || eva === 0);
  const esFisiologicamenteIntacto = (
    news2.scoreTotal === 0 &&
    glucosaNormal &&
    evaCero &&
    !tieneCodTiempo &&
    !claveObst &&
    !(esGestante && ((pas !== null && pas >= 160) || (pad !== null && pad >= 110))) &&
    !(pas !== null && pas >= 180) &&
    !(pad !== null && pad >= 120)
  );

  // =========================================================================
  // 2. COMPUERTA B (MTS NARANJA / ESI 2 -> PRIORIDAD II - Naranja, SLA: Máx. 10 min)
  // Alto riesgo o dolor severo / Discriminadores MTS Nivel 2
  // =========================================================================
  const criteriosB = [];

  // Discriminadores MTS - Nivel 2 (Naranja - P-II Muy Urgente ≤ 10 min)
  if (datos.mts_hemorragia === "mayor") {
    criteriosB.push("Hemorragia Mayor Incontrolable MTS");
  }
  if (datos.mts_conciencia === "alteracion_subita") {
    criteriosB.push("Alteración Súbita de Conciencia MTS (GCS 9-13)");
  }
  if (datos.mts_agudeza === "subito_agudo") {
    criteriosB.push("Inicio Súbito Agudo de Alta Urgencia MTS");
  }
  if (typeof datos.tep_lados_alterados === "number" && datos.tep_lados_alterados === 1) {
    criteriosB.push("TEP Pediátrico con 1 Lado Alterado (Dificultad Respiratoria / Disfunción)");
  }
  if (datos.ped_lactante_fiebre) {
    criteriosB.push("Lactante < 3 meses con Fiebre ≥ 38.0 °C MTS");
  }
  if (datos.ped_purpura) {
    criteriosB.push("Exantema Petequial / Púrpura no blanqueable MTS");
  }
  if (datos.ped_tiraje_severo) {
    criteriosB.push("Tiraje Severo / Dificultad Respiratoria Pediátrica MTS");
  }
  if (datos.obst_alto_riesgo) {
    criteriosB.push("Alto Riesgo Obstétrico MINSA (PA severa / Sepsis / Sangrado)");
  }
  if (datos.alerta_infarto) {
    criteriosB.push("Dolor Torácico Cardíaco Típico (Código Infarto MTS)");
  }
  if (datos.alerta_ictus) {
    criteriosB.push("Déficit Neurológico Focal Agudo < 4.5 h (Código Ictus MTS)");
  }
  if (datos.alerta_sepsis) {
    criteriosB.push("Criterios de Sepsis qSOFA MTS");
  }
  if (datos.alerta_trauma_mayor) {
    criteriosB.push("Mecanismo de Trauma Mayor / Penetrante MTS");
  }
  if (datos.alerta_neutropenia) {
    criteriosB.push("Neutropenia Febril / Inmunosupresión Crítica MTS");
  }
  if (temp !== null && temp >= 38.5 && temp < 41.0) {
    criteriosB.push(`Temperatura Muy Caliente MTS (${temp} °C)`);
  }

  if (!esFisiologicamenteIntacto) {
    if (news2.scoreTotal >= 5 && news2.scoreTotal <= 6) {
      criteriosB.push(`NEWS2 Nivel Medio (5-6 pts: ${news2.scoreTotal} pts - Monitoreo Continuo Obligatorio)`);
    }
    if (news2.maxParametroUnico === 3) {
      criteriosB.push("Parámetro Fisiológico Individual Extremo (NEWS2 = 3 pts en al menos 1 constante vital)");
    }
    if (glucosa !== null && (glucosa > 400 || (glucosa >= 54 && glucosa <= 69))) {
      criteriosB.push(`Desbalance Glucémico Crítico ADA (Glucosa ${glucosa} mg/dL - Requiere Estabilización Urgente)`);
    }
    if ((pas !== null && pas >= 180) || (pad !== null && pad >= 120)) {
      criteriosB.push(`Crisis Hipertensiva Sintomática / Alto Riesgo PA ${pas || "--"}/${pad || "--"} mmHg`);
    }
    if (eva !== null && eva >= 8) {
      criteriosB.push(`Dolor Severo Agudo EVA ${eva}/10 (ESI Punto B)`);
    }
    if (tieneCodTiempo) {
      criteriosB.push("Código Tiempo-Dependiente (Infarto / Ictus / Sepsis) en Ventana Terapéutica sin Shock");
    }
    if (claveObst === "amarilla") {
      criteriosB.push("Clave Obstétrica Amarilla MINSA (Sepsis Obstétrica Inicial)");
    }
  }

  if (criteriosB.length > 0) {
    return {
      prioridad: "II",
      esiNivel: 2,
      compuerta: "COMPUERTA B (Alto Riesgo / Dolor Severo)",
      slaNormativo: "Máx. 10 min",
      news2,
      motivos: criteriosB,
      resumenClinico: "Urgencia Mayor. Alto potencial de deterioro hemodinámico o neurológico."
    };
  }

  // =========================================================================
  // 3. COMPUERTA C y D (ESI 3, 4 y 5 -> PRIORIDADES III, IV y V)
  // =========================================================================
  
  // Prioridad III (Amarillo, SLA: ≤ 30 min / NTS: hasta 60 min)
  const esPrioridad3 = (
    datos.mts_hemorragia === "menor" ||
    datos.mts_conciencia === "historia_inconsciencia" ||
    Boolean(datos.ped_llanto_irritable) ||
    Boolean(datos.ped_sospecha_maltrato) ||
    Boolean(datos.obst_estable) ||
    (temp !== null && temp >= 38.0 && temp < 38.5) ||
    news2.scoreTotal >= 2 ||
    (eva !== null && eva >= 4 && eva <= 7) ||
    (glucosa !== null && glucosa >= 250 && glucosa <= 400) ||
    (pas !== null && pas >= 140 && pas <= 179) ||
    (pad !== null && pad >= 90 && pad <= 119) ||
    (pas !== null && pas >= 180) || (pad !== null && pad >= 120) // Hipertensión aislada asintomática con NEWS2=0
  );

  if (esPrioridad3) {
    const motivosC = [];
    if (datos.mts_hemorragia === "menor") motivosC.push("Hemorragia Menor Incontrolable MTS");
    if (datos.mts_conciencia === "historia_inconsciencia") motivosC.push("Historia de Inconsciencia Recuperada MTS");
    if (datos.ped_llanto_irritable) motivosC.push("Llanto Inconsolable / Irritable Caliente MTS");
    if (datos.ped_sospecha_maltrato) motivosC.push("Historia Discordante / Sospecha de Maltrato MTS");
    if (datos.obst_estable) motivosC.push("Condición Obstétrica Estable MTS");
    if (temp !== null && temp >= 38.0 && temp < 38.5) motivosC.push(`Fiebre ≥ 38.0 °C (${temp} °C)`);
    if (news2.scoreTotal >= 2) motivosC.push(`NEWS2 Leve/Moderado (${news2.scoreTotal} pts)`);
    if (eva !== null && eva >= 4 && eva <= 7) motivosC.push(`Dolor Moderado EVA ${eva}/10`);
    if (glucosa !== null && glucosa >= 250 && glucosa <= 400) motivosC.push(`Hiperglucemia Moderada (${glucosa} mg/dL)`);
    if ((pas !== null && pas >= 140) || (pad !== null && pad >= 90)) motivosC.push(`Presión Arterial Elevada (${pas || "--"}/${pad || "--"} mmHg)`);
    if (motivosC.length === 0) motivosC.push("Requiere ≥ 2 recursos diagnósticos o terapéuticos en tópico");

    return {
      prioridad: "III",
      esiNivel: 3,
      compuerta: "COMPUERTA C (Estabilidad Relativa / Múltiples Recursos)",
      slaNormativo: "Máx. 30 min (SLA Perú NTS N° 042)",
      news2,
      motivos: motivosC,
      resumenClinico: "Urgencia Menor. Requiere laboratorio, imágenes o medicación en tópico."
    };
  }

  // Prioridad IV (Verde, SLA: ≤ 60 min / NTS: hasta 120 min)
  const esPrioridad4 = (
    datos.mts_agudeza === "reciente" ||
    (temp !== null && temp >= 37.5 && temp < 38.0) ||
    news2.scoreTotal === 1 ||
    (eva !== null && eva >= 1 && eva <= 3) ||
    (glucosa !== null && glucosa >= 180 && glucosa < 250)
  );

  if (esPrioridad4) {
    const motivosD1 = [];
    if (datos.mts_agudeza === "reciente") motivosD1.push("Problema Reciente < 7 Días MTS");
    if (temp !== null && temp >= 37.5 && temp < 38.0) motivosD1.push(`Febrícula (${temp} °C)`);
    if (news2.scoreTotal === 1) motivosD1.push(`NEWS2 Mínimo (${news2.scoreTotal} pt)`);
    if (eva !== null && eva >= 1 && eva <= 3) motivosD1.push(`Dolor Leve EVA ${eva}/10`);
    if (glucosa !== null && glucosa >= 180 && glucosa < 250) motivosD1.push(`Hiperglucemia Leve (${glucosa} mg/dL)`);
    if (motivosD1.length === 0) motivosD1.push("Requiere 1 solo recurso simple o evaluación médica general");

    return {
      prioridad: "IV",
      esiNivel: 4,
      compuerta: "COMPUERTA D1 (Urgencia Leve / 1 Recurso)",
      slaNormativo: "Máx. 60 min (NTS: ≤ 120 min)",
      news2,
      motivos: motivosD1,
      resumenClinico: "Urgencia Leve. Sin compromiso fisiológico. Manejo ambulatorio o tópico rápido."
    };
  }

  // Prioridad V (Azul, SLA: ≤ 120 min / NTS: hasta 240 min)
  return {
    prioridad: "V",
    esiNivel: 5,
    compuerta: "COMPUERTA D2 (No Urgente / 0 Recursos)",
    slaNormativo: "Máx. 120 min (NTS: ≤ 240 min)",
    news2,
    motivos: (datos.mts_agudeza === "cronico") ? ["Crónico Estable sin Deterioro Agudo MTS"] : ["Constantes vitales normales (NEWS2 = 0 pts)", "Sin dolor o dolor EVA 0", "Sin requerimiento de recursos inmediatos de emergencia"],
    resumenClinico: "No Urgencia. Consulta administrativa, reevaluación o retiro de puntos."
  };
}
window.evaluarTriajeEstandar = evaluarTriajeEstandar;

/**
 * PARTE 4: FUZZING TEST SUITE (500 COMBINACIONES)
 * Valida automáticamente las 4 leyes matemáticas inquebrantables.
 */
function ejecutarFuzzingTriaje500() {
  let pasados = 0;
  for (let i = 0; i < 500; i++) {
    const d = {
      fr: Math.random() < 0.2 ? null : Math.floor(Math.random() * 45) + 5,
      spo2: Math.random() < 0.2 ? null : Math.floor(Math.random() * 21) + 80,
      pas: Math.random() < 0.2 ? null : Math.floor(Math.random() * 190) + 60,
      pad: Math.random() < 0.2 ? null : Math.floor(Math.random() * 95) + 35,
      fc: Math.random() < 0.2 ? null : Math.floor(Math.random() * 160) + 30,
      glasgow: Math.random() < 0.2 ? null : Math.floor(Math.random() * 13) + 3,
      temp: Math.random() < 0.2 ? null : parseFloat((Math.random() * 7 + 34).toFixed(1)),
      glucosa: Math.random() < 0.2 ? null : Math.floor(Math.random() * 680) + 30,
      eva: Math.random() < 0.2 ? null : Math.floor(Math.random() * 11),
      esPediatrico: Math.random() < 0.2,
      edad: Math.floor(Math.random() * 85) + 1,
      codigoInfarto: Math.random() < 0.08,
      codigoIctus: Math.random() < 0.08,
      codigoSepsis: Math.random() < 0.08,
      esGestante: Math.random() < 0.08,
      claveObstetrica: ["ninguna", null, "roja", "azul", "amarilla"][Math.floor(Math.random() * 5)],
      panicoShockTrauma: Math.random() < 0.04
    };

    const res = evaluarTriajeEstandar(d);
    const prio = res.prioridad;
    const scoreNews2 = res.news2.scoreTotal;

    // Invariante 1: Si NEWS2 === 0, glucosa normal, EVA 0 y sin códigos/claves -> JAMÁS puede devolver Prioridad I ni II.
    const glucosaNorm = (d.glucosa === null) || (d.glucosa >= 70 && d.glucosa < 180);
    const evaCero = (d.eva === null || d.eva === 0);
    const sinCodigos = !(d.codigoInfarto || d.codigoIctus || d.codigoSepsis || ["roja", "azul", "amarilla"].includes(d.claveObstetrica) || d.panicoShockTrauma);
    const gestanteHipertensa = d.esGestante && ((d.pas !== null && d.pas >= 160) || (d.pad !== null && d.pad >= 110));

    if (scoreNews2 === 0 && glucosaNorm && evaCero && sinCodigos && !gestanteHipertensa) {
      if (prio === "I" || prio === "II") {
        throw new Error(`Violación Invariante 1 en iter ${i}: NEWS2=0 dio P-${prio}`);
      }
    }

    // Invariante 2: Si glucosa > 400 -> JAMÁS puede devolver Prioridad III, IV ni V.
    if (d.glucosa !== null && d.glucosa > 400) {
      if (prio !== "I" && prio !== "II") {
        throw new Error(`Violación Invariante 2 en iter ${i}: Glucosa ${d.glucosa} dio P-${prio}`);
      }
    }

    // Invariante 3: Si glucosa < 54 o glasgow <= 8 o spo2 < 90 -> SIEMPRE debe devolver Prioridad I.
    if ((d.glucosa !== null && d.glucosa < 54) ||
        (d.glasgow !== null && d.glasgow <= 8) ||
        (d.spo2 !== null && d.spo2 < 90)) {
      if (prio !== "I") {
        throw new Error(`Violación Invariante 3 en iter ${i}: glucosa=${d.glucosa}, glasgow=${d.glasgow}, spo2=${d.spo2} dio P-${prio}`);
      }
    }

    // Invariante 4: Ningún campo vacío (null) puede alterar el puntaje NEWS2 ni disparar Prioridad I.
    const dVacio = { fr: null, spo2: null, pas: null, pad: null, fc: null, glasgow: null, temp: null, glucosa: null, eva: null };
    const resVacio = evaluarTriajeEstandar(dVacio);
    if (resVacio.news2.scoreTotal !== 0) throw new Error("Invariante 4: NEWS2 vacío no fue 0");
    if (resVacio.prioridad !== "V") throw new Error("Invariante 4: Triage vacío no fue V");

    pasados++;
  }
  return { ok: true, total: pasados };
}
window.ejecutarFuzzingTriaje500 = ejecutarFuzzingTriaje500;

// ===========================================================================
// RECALCULAR PRIORIDAD CLÍNICA MEDIANTE MOTOR ESTANDARIZADO NTS-042 / ESI / NEWS2
// ===========================================================================
function recalcularPrioridad() {
  const validacion = validarSignosVitalesEnVivo();
  if (!validacion.esValido) {
    mostrarErrorBiologicoEnPrioridad(validacion.errores);
    return;
  }

  // PARTE 1: Lectura segura de datos con parseVital (cero falsos positivos, null si vacío)
  const spo2 = parseVital("spo2_full");
  const fc = parseVital("fc_full");
  const pas = parseVital("pas_full");
  const pad = parseVital("pad_full");
  const fr = parseVital("fr_full");
  const temp = parseVital("temp_full");
  const glucosa = parseVital("glucosa_full");
  const glasgow = parseVital("glasgow_full");
  
  // EVA: 0 es válido (sin dolor), vacío es null
  let eva = null;
  const elEva = document.getElementById("eva_full");
  if (elEva && elEva.value !== "") {
    const valEva = parseInt(elEva.value, 10);
    if (!isNaN(valEva)) eva = valEva;
  }

  const motivo = (document.getElementById("motivo_full")?.value || "").toLowerCase();
  const motivoMts = document.getElementById("motivo_mts_select")?.value || "";
  const esGestante = Boolean(STATE.esGestante || document.getElementById("check_gestante")?.checked);
  const claveObstetrica = STATE.claveObstetrica || document.getElementById("clave_obstetrica_sel")?.value || null;

  // Lectura de Discriminadores Generales MTS
  const mtsVital = Boolean(document.getElementById("mts_disc_vital")?.checked);
  const mtsHemorragia = document.getElementById("mts_disc_hemorragia")?.value || "ninguna";
  const mtsConciencia = document.getElementById("mts_disc_conciencia")?.value || "alerta";
  const mtsAgudeza = document.getElementById("mts_disc_agudeza")?.value || "habitual";

  // Lectura TEP Pediátrico
  const tepApariencia = Boolean(document.getElementById("tep_apariencia")?.checked);
  const tepRespiracion = Boolean(document.getElementById("tep_respiracion")?.checked);
  const tepCirculacion = Boolean(document.getElementById("tep_circulacion")?.checked);
  const tepLadosAlterados = (tepApariencia ? 1 : 0) + (tepRespiracion ? 1 : 0) + (tepCirculacion ? 1 : 0);

  // Discriminadores Pediátricos MTS
  const pedNoReactivo = Boolean(document.getElementById("ped_no_reactivo")?.checked);
  const pedLactanteFiebre = Boolean(document.getElementById("ped_lactante_fiebre")?.checked);
  const pedPurpura = Boolean(document.getElementById("ped_purpura")?.checked);
  const pedTirajeSevero = Boolean(document.getElementById("ped_tiraje_severo")?.checked);
  const pedLlantoIrritable = Boolean(document.getElementById("ped_llanto_irritable")?.checked);
  const pedSospechaMaltrato = Boolean(document.getElementById("ped_sospecha_maltrato")?.checked);

  // Discriminadores Gestante / Obstétricos MINSA
  const obstClaveRoja = Boolean(document.getElementById("obst_clave_roja")?.checked);
  const obstAltoRiesgo = Boolean(document.getElementById("obst_alto_riesgo")?.checked);
  const obstEstable = Boolean(document.getElementById("obst_estable")?.checked);

  // Alertas Específicas MTS
  const alertaAnafilaxia = Boolean(document.getElementById("alerta_anafilaxia")?.checked);
  const alertaTraumaMayor = Boolean(document.getElementById("alerta_trauma_mayor")?.checked);
  const alertaNeutropenia = Boolean(document.getElementById("alerta_neutropenia")?.checked);
  const alertaInfarto = Boolean(STATE.codigoInfarto || document.getElementById("check_cod_infarto")?.checked);
  const alertaIctus = Boolean(STATE.codigoIctus || document.getElementById("check_cod_ictus")?.checked);
  const alertaSepsis = Boolean(STATE.codigoSepsis || document.getElementById("check_cod_sepsis")?.checked);

  const tieneDiscriminadorMTS = (
    Boolean(motivoMts) ||
    mtsVital ||
    (mtsHemorragia !== "ninguna") ||
    (mtsConciencia !== "alerta") ||
    (mtsAgudeza !== "habitual") ||
    tepLadosAlterados > 0 ||
    pedNoReactivo || pedLactanteFiebre || pedPurpura || pedTirajeSevero || pedLlantoIrritable || pedSospechaMaltrato ||
    obstClaveRoja || obstAltoRiesgo || obstEstable ||
    alertaAnafilaxia || alertaTraumaMayor || alertaNeutropenia
  );

  const antCardio = document.getElementById("ant_cardio")?.checked || false;
  const antResp = document.getElementById("ant_resp")?.checked || false;
  const antDiab = document.getElementById("ant_diab")?.checked || false;
  const antNeuro = document.getElementById("ant_neuro")?.checked || false;
  const antecedentes = antCardio || antResp || antDiab || antNeuro;

  // Actualizar STATE con valores limpios
  STATE.spo2 = spo2; STATE.fc = fc; STATE.pasSistolica = pas;
  STATE.paDiastolica = pad; STATE.fr = fr; STATE.temperatura = temp;
  STATE.glucosa = glucosa; STATE.glasgow = glasgow; STATE.eva = eva !== null ? eva : 0;
  STATE.antecedentes = antecedentes;
  STATE.motivoConsulta = document.getElementById("motivo_full")?.value || "";

  // Si el paciente no tiene constantes biológicas ni motivo clínico ingresado aún, permanece SIN PRIORIDAD (NTS N° 042-MINSA)
  const tieneDatosClinicos = (
    spo2 !== null || fc !== null || pas !== null || pad !== null ||
    fr !== null || temp !== null || glucosa !== null || glasgow !== null ||
    (eva !== null && eva > 0) || (motivo && motivo.trim() !== "") ||
    tieneDiscriminadorMTS ||
    alertaInfarto || alertaIctus || alertaSepsis ||
    Boolean(claveObstetrica) || Boolean(STATE.ingresoDirectoCritico) || Boolean(STATE.panicoShockTrauma)
  );

  if (!tieneDatosClinicos) {
    STATE.prioridad = null;
    STATE.colorPrioridad = null;
    STATE.camaAsignadaId = "SIN-CAMA";
    STATE.camaAsignada = "Sin cama — Sala de Espera / Triaje";
    limpiarPrioridadUI();
    if (pacienteActivoId && Array.isArray(PACIENTES_COLA)) {
      const px = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
      if (px) {
        px.prioridad = null;
        px.estadoAtencion = "En Espera";
      }
    }
    return;
  }

  // PARTE 2 y 3: Evaluar con Motor Manchester MTS + NTS N° 042-MINSA
  const datosTriaje = {
    spo2, fc, pas, pad, fr, temp, glucosa, glasgow, eva,
    esPediatrico: Boolean(STATE.edad !== null && STATE.edad !== undefined && STATE.edad < 14) || tepLadosAlterados > 0 || pedNoReactivo || pedLactanteFiebre || pedPurpura || pedTirajeSevero || pedLlantoIrritable || pedSospechaMaltrato,
    edad: (typeof STATE.edad === "number") ? STATE.edad : 30,
    motivo,
    esGestante: esGestante || obstClaveRoja || obstAltoRiesgo || obstEstable,
    claveObstetrica: claveObstetrica || (obstClaveRoja ? "roja" : obstAltoRiesgo ? "azul" : obstEstable ? "amarilla" : null),
    codigoInfarto: alertaInfarto,
    codigoIctus: alertaIctus,
    codigoSepsis: alertaSepsis,
    panicoShockTrauma: Boolean(STATE.panicoShockTrauma),
    esParoOAgonia: Boolean(validacion.esParoOAgonia),
    ingresoDirectoCritico: Boolean(STATE.ingresoDirectoCritico),
    motivoIngresoCritico: STATE.motivoIngresoCritico || "Activación directa de Trauma Shock / Riesgo Vital Inmediato — Ley N° 27604",
    // MTS Discriminadores
    mts_vital: mtsVital,
    mts_hemorragia: mtsHemorragia,
    mts_conciencia: mtsConciencia,
    mts_agudeza: mtsAgudeza,
    tep_lados_alterados: tepLadosAlterados,
    ped_no_reactivo: pedNoReactivo,
    ped_lactante_fiebre: pedLactanteFiebre,
    ped_purpura: pedPurpura,
    ped_tiraje_severo: pedTirajeSevero,
    ped_llanto_irritable: pedLlantoIrritable,
    ped_sospecha_maltrato: pedSospechaMaltrato,
    obst_clave_roja: obstClaveRoja,
    obst_alto_riesgo: obstAltoRiesgo,
    obst_estable: obstEstable,
    alerta_anafilaxia: alertaAnafilaxia,
    alerta_infarto: alertaInfarto,
    alerta_ictus: alertaIctus,
    alerta_sepsis: alertaSepsis,
    alerta_trauma_mayor: alertaTraumaMayor,
    alerta_neutropenia: alertaNeutropenia
  };

  const resultado = evaluarTriajeEstandar(datosTriaje);
  const prio = resultado.prioridad;

  STATE.prioridad = prio;
  STATE.resultadoTriajeEstandar = resultado;
  STATE.colorPrioridad = PRIORIDADES[prio]?.nombre || "Desconocido";

  mostrarPrioridad(prio, resultado);
  renderizarRutaClinica(prio);
  registrarTimestamp("M3_triage");

  // Actualizar Live Chip en Top Steps Navbar
  const chipLive = document.getElementById("chipPrioLive");
  if (chipLive) {
    const nombres = { "I": "P-I ROJO", "II": "P-II NARANJA", "III": "P-III AMARILLO", "IV": "P-IV VERDE", "V": "P-V AZUL" };
    chipLive.textContent = nombres[prio] || `P-${prio}`;
    chipLive.className = `top-prio-chip prio-${prio}`;
  }

  // Actualizar puntaje ABCDE de Módulo 6
  calcularPuntajePrelacionABCDE();
  // Actualizar liquidación financiera de Módulo 8
  actualizarFactura();

  // NORMAS NTS N° 042-MINSA & LEY N° 26842: Triaje categoriza la prioridad clínica (I-V).
  // Las camas son asignadas ÚNICAMENTE por el protocolo del Médico (en Módulo 5/6/Atención Médica), NO ANTES.
  if (!STATE.camaAsignadaId || STATE.camaAsignadaId === "SIN-CAMA" || STATE.camaAsignadaId === "ST-01") {
    STATE.camaAsignadaId = "SIN-CAMA";
    STATE.camaAsignada = (prio === "I") ? "Derivación a Shock Trauma (Pendiente de Protocolo Médico)" :
                         (prio === "II" || prio === "III") ? "Derivación a Tópico / Observación (Pendiente de Protocolo Médico)" :
                         "Sin cama — Atención Ambulatoria";
  }

  // Sincronizar prioridad evaluada con el registro en cola
  if (pacienteActivoId && Array.isArray(PACIENTES_COLA)) {
    const px = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
    if (px) {
      px.prioridad = prio;
      px.estadoAtencion = (prio === 'I' ? "Shock Trauma Inmediato" : (prio === 'II' ? "Tópico de Emergencia" : "En Espera de Atención"));
    }
  }

  // Guardado síncrono en expediente activo y almacenamiento local (cero estados congelados)
  guardarEstadoPacienteActivo();
  if (typeof sincronizarExpedienteActivoEnStore === "function") {
    try { sincronizarExpedienteActivoEnStore(); } catch(e){}
  }

  // Refrescar monitor fisiológico derecho y Track Board
  if (window.COCKPIT && typeof window.COCKPIT.refrescarValoresMonitor === "function") {
    window.COCKPIT.refrescarValoresMonitor();
  }
  if (typeof renderizarTrackBoardLista === "function") {
    renderizarTrackBoardLista();
  }
  if (typeof renderizarTableroColaPacientes === "function") {
    renderizarTableroColaPacientes();
  }
}


// ---------------------------------------------------------------------------
// ACTUALIZACIÓN DEL PIPELINE ASISTENCIAL DE 8 PASOS Y MONITOR DINÁMICO
// ---------------------------------------------------------------------------
function actualizarPipelineFull(prio) {
  // 1. Actualizar insignias de los 8 pasos
  const elB1 = document.getElementById("full_badge_1");
  const elS1 = document.getElementById("full_step_1");
  if (elB1 && elS1) {
    if (STATE.identificador) {
      elB1.textContent = "✓ Completado";
      elS1.className = "pipeline-step completed";
    } else {
      elB1.textContent = "En curso";
      elS1.className = "pipeline-step active";
    }
  }

  const elB2 = document.getElementById("full_badge_2");
  const elS2 = document.getElementById("full_step_2");
  if (elB2 && elS2) {
    if (STATE.tipoSeguro) {
      elB2.textContent = `✓ ${STATE.tipoSeguro.split(" ")[0]}`;
      elS2.className = "pipeline-step completed";
    } else {
      elB2.textContent = "Pendiente";
      elS2.className = "pipeline-step";
    }
  }

  const elB3 = document.getElementById("full_badge_3");
  const elS3 = document.getElementById("full_step_3");
  if (elB3 && elS3) {
    elB3.textContent = `✓ P-${prio}`;
    elS3.className = "pipeline-step completed";
  }

  const elB4 = document.getElementById("full_badge_4");
  const elS4 = document.getElementById("full_step_4");
  if (elB4 && elS4) {
    elB4.textContent = (prio === "I" || prio === "II") ? "Trauma Shock" : "Observación";
    elS4.className = "pipeline-step active";
  }

  const elB5 = document.getElementById("full_badge_5");
  const elS5 = document.getElementById("full_step_5");
  if (elB5 && elS5) {
    const stockTs = (typeof STOCK_CAMAS !== "undefined" && STOCK_CAMAS["Trauma Shock"]) ? STOCK_CAMAS["Trauma Shock"].disponible : 1;
    elB5.textContent = stockTs > 0 ? "1 Libre" : "Saturado";
    elS5.className = "pipeline-step active";
  }

  // 2. Actualizar monitor dinámico de áreas y ramificación
  const tituloRamif = document.getElementById("full_ramificacion_titulo");
  const badgeLegal = document.getElementById("full_regla_financiera_badge");
  const chipsContainer = document.getElementById("full_areas_chips");

  if (!tituloRamif || !badgeLegal || !chipsContainer) return;

  const esCritico = (prio === "I" || prio === "II");

  if (esCritico) {
    tituloRamif.textContent = `🚨 RUTA CRÍTICA ACTIVA (Prioridad ${prio} — Emergencia Vital)`;
    tituloRamif.style.color = "#dc2626";

    badgeLegal.textContent = "⚖️ Ley N° 27604: Gratuidad y Atención Inmediata sin Pago Previo";
    badgeLegal.style.background = "#fee2e2";
    badgeLegal.style.color = "#991b1b";

    chipsContainer.innerHTML = `
      <span class="hospital-area-chip" style="background:#fff1f2; border:1.5px solid #f43f5e; color:#9f1239; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        🚨 Trauma Shock / Reanimación (Monitoreo Invasivo & Desfibrilador)
      </span>
      <span class="hospital-area-chip" style="background:#fff1f2; border:1.5px solid #f43f5e; color:#9f1239; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        🩸 Banco de Sangre STAT (Gasometría & Troponinas Urgentes)
      </span>
      <span class="hospital-area-chip" style="background:#fff1f2; border:1.5px solid #f43f5e; color:#9f1239; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        🏥 Quirófano de Emergencia (Intervención Cardiovascular / Cirugía)
      </span>
      <span class="hospital-area-chip" style="background:#fffbeb; border:1.5px solid #f59e0b; color:#b45309; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        🧠 Psicología Hospitalaria (Consentimiento Informado & Apoyo en Duelo)
      </span>
      <span class="hospital-area-chip" style="background:#f1f5f9; border:1.5px solid #64748b; color:#334155; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        ⚖️ Auditoría Médica & SINADEF (Acta de Defunción / Sepelio EsSalud)
      </span>
    `;
  } else {
    tituloRamif.textContent = `🟡 RUTA MODERADA ACTIVA (Prioridad ${prio} — Observación y Ambulatoria)`;
    tituloRamif.style.color = "#d97706";

    badgeLegal.textContent = "💳 Cobertura SIS/EsSalud o Verificación de Copago en Caja";
    badgeLegal.style.background = "#fef3c7";
    badgeLegal.style.color = "#b45309";

    chipsContainer.innerHTML = `
      <span class="hospital-area-chip" style="background:#fffbeb; border:1.5px solid #f59e0b; color:#b45309; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        🪑 Tópico de Medicina (Vigilancia de Signos Vitales c/ 30 min)
      </span>
      <span class="hospital-area-chip" style="background:#fffbeb; border:1.5px solid #f59e0b; color:#b45309; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        🛏️ Sala de Observación de Corta Estancia (2 a 24 horas)
      </span>
      <span class="hospital-area-chip" style="background:#f1f5f9; border:1.5px solid #64748b; color:#334155; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        🧪 Laboratorio Clínico de Rutina & Hemograma
      </span>
      <span class="hospital-area-chip" style="background:#f1f5f9; border:1.5px solid #64748b; color:#334155; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        🩺 Consultorios de Descarte / REFCON (Gastroenterología)
      </span>
    `;
  }
}
window.actualizarPipelineFull = actualizarPipelineFull;


function registrarFacturacionTriage(prio) {
  if (typeof registrarFacturaItem === "function") {
    registrarFacturaItem("Atención de Triaje Clínico", 30, "Triaje");
  }
}
window.registrarFacturacionTriage = registrarFacturacionTriage;

function mostrarPrioridad(prio, detalle) {
  const pd = document.getElementById("prioridad_display");
  const def = PRIORIDADES[prio];
  if (!def) return;

  pd.className = `prioridad-display visible prioridad-${prio}`;
  pd.style.background = "";
  pd.style.borderColor = "";
  pd.style.borderWidth = "";

  const esEmergencia = (prio === "I" || prio === "II");
  const categoriaTexto = esEmergencia ? "EMERGENCIA" : "URGENCIA";
  const clasificacionTexto = `Prioridad ${prio} (${def.nombre})`;

  const elPrioNum = document.getElementById("prio_numero");
  if (elPrioNum) {
    elPrioNum.textContent = prio;
    elPrioNum.className = `prioridad-numero ${def.clase}`;
  }
  const elColorName = document.getElementById("prio_color_name");
  if (elColorName) {
    elColorName.textContent = `● ${["Rojo","Naranja","Amarillo","Verde","Azul"][["I","II","III","IV","V"].indexOf(prio)]}`;
    elColorName.style.color = def.hex;
  }

  const elPrioTipo = document.getElementById("prio_tipo");
  if (elPrioTipo) {
    elPrioTipo.textContent = `${categoriaTexto} — ${clasificacionTexto}`;
    elPrioTipo.style.color = def.hex;
  }

  const elPrioDesc = document.getElementById("prio_desc");
  if (elPrioDesc) {
    elPrioDesc.textContent = obtenerDescripcionPrioridad(prio);
  }

  const elPrioDestino = document.getElementById("prio_destino");
  if (elPrioDestino) {
    elPrioDestino.textContent = `Destino Clínico: ${def.destino}`;
    elPrioDestino.style.color = def.hex;
  }

  // Actualización SLA Display
  const slaEl = document.getElementById("prio_sla_display");
  if (slaEl) {
    const slaMap = {
      'I': '⏱️ SLA Normativo NTS N° 042: Inmediato — 0 min',
      'II': '⏱️ SLA Normativo NTS N° 042: Máx. 10 min',
      'III': '⏱️ SLA Normativo NTS N° 042: Máx. 30 min (NTS: hasta 60 min)',
      'IV': '⏱️ SLA Normativo NTS N° 042: Máx. 60 min (NTS: hasta 120 min)',
      'V': '⏱️ SLA Normativo NTS N° 042: Máx. 120 min (NTS: hasta 240 min)'
    };
    slaEl.textContent = (detalle && detalle.slaNormativo) ? `⏱️ SLA: ${detalle.slaNormativo}` : (slaMap[prio] || '⏱️ SLA: --');
  }

  // Trazabilidad Estándar NTS N° 042 / ESI v5 / NEWS2 / ADA
  const trazaEl = document.getElementById("prio_trazabilidad_estandar");
  if (trazaEl) {
    trazaEl.style.display = "block";
    let res = (detalle && detalle.news2) ? detalle : null;
    if (!res || STATE.ingresoDirectoCritico || STATE.panicoShockTrauma) {
      if (typeof evaluarTriajeEstandar === "function") {
        res = evaluarTriajeEstandar({
          fr: STATE.fr,
          spo2: STATE.spo2,
          pas: STATE.pasSistolica,
          pad: STATE.paDiastolica,
          fc: STATE.fc,
          glasgow: STATE.glasgow,
          temp: STATE.temperatura,
          glucosa: STATE.glucosa,
          eva: STATE.eva,
          esPediatrico: Boolean(STATE.edad !== null && STATE.edad !== undefined && STATE.edad < 14),
          edad: (typeof STATE.edad === "number") ? STATE.edad : 30,
          ingresoDirectoCritico: Boolean(STATE.ingresoDirectoCritico || STATE.panicoShockTrauma),
          motivoIngresoCritico: STATE.motivoIngresoCritico || "Activación directa de Trauma Shock / Riesgo Vital Inmediato — Ley N° 27604",
          panicoShockTrauma: Boolean(STATE.panicoShockTrauma)
        });
        STATE.resultadoTriajeEstandar = res;
      } else {
        res = STATE.resultadoTriajeEstandar || null;
      }
    }
    if (res && res.news2) {
      const scoreNews2 = res.news2.scoreTotal;
      const maxIndiv = res.news2.maxParametroUnico;
      const compuerta = res.compuerta || "--";
      const esiNivel = res.esiNivel || (prio === "I" ? 1 : (prio === "II" ? 2 : (prio === "III" ? 3 : (prio === "IV" ? 4 : 5))));
      const slaTxt = res.slaNormativo || "Por definir";
      
      const esPendiente = Boolean(res.news2 && res.news2.esPendienteMonitorizacion);
      let badgesHtml = "";
      if (esPendiente) {
        badgesHtml = `<span style="background:rgba(239,68,68,0.35); border:1px solid rgba(239,68,68,0.5); padding:3px 10px; border-radius:5px; font-size:0.75rem; font-weight:800; color:#fee2e2;">⚠️ Monitorización de cabecera en curso — Parámetros pendientes de toma</span>`;
      } else if (Array.isArray(res.news2.desglose)) {
        badgesHtml = res.news2.desglose.map(b => {
          let bg = "rgba(255,255,255,0.18)";
          if (b.includes("+3")) bg = "rgba(239,68,68,0.45)";
          else if (b.includes("+2")) bg = "rgba(249,115,22,0.45)";
          else if (b.includes("+1")) bg = "rgba(234,179,8,0.35)";
          return `<span style="background:${bg}; padding:2px 8px; border-radius:4px; font-size:0.73rem; font-weight:700;">${b}</span>`;
        }).join(" ");
      }

      let motivosHtml = "";
      if (Array.isArray(res.motivos) && res.motivos.length > 0) {
        motivosHtml = res.motivos.map(m => `<li><strong>${m}</strong></li>`).join("");
      } else {
        motivosHtml = `<li>${res.resumenClinico || "Evaluación fisiológica estándar completada."}</li>`;
      }

      trazaEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.25); padding-bottom:6px; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
          <div style="font-weight:800; font-size:0.8rem; letter-spacing:0.5px;">📋 AUDITORÍA CLÍNICA: NTS N° 042-MINSA · ALGORITMO ESI v5 · NEWS2 (RCP LONDON) · UMBRALES ADA</div>
          <span style="background:rgba(255,255,255,0.22); padding:3px 8px; border-radius:5px; font-weight:800; font-size:0.75rem;">SLA: ${slaTxt}</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:8px; margin-bottom:8px;">
          <div style="background:rgba(0,0,0,0.22); padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.15);">
            <div style="font-size:0.7rem; opacity:0.85; text-transform:uppercase; font-weight:700;">Árbol ESI v5 (AHRQ / ENA)</div>
            <div style="font-weight:900; font-size:0.95rem; margin-top:2px;">ESI Nivel ${esiNivel} · ${compuerta}</div>
          </div>
          <div style="background:rgba(0,0,0,0.22); padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.15);">
            <div style="font-size:0.7rem; opacity:0.85; text-transform:uppercase; font-weight:700;">Score Fisiológico NEWS2 (RCP)</div>
            <div style="font-weight:900; font-size:0.95rem; margin-top:2px;">${esPendiente ? `<span style="color:#fde047; font-size:0.8rem; font-weight:800;">Pendiente de monitorización (Ingreso Directo P-I)</span>` : `${scoreNews2} pts <span style="font-size:0.75rem; font-weight:600; opacity:0.9;">(Máx. individual: ${maxIndiv} pts)</span>`}</div>
          </div>
        </div>
        <div style="margin-bottom:8px;">
          <div style="font-size:0.72rem; opacity:0.9; margin-bottom:4px; font-weight:800; text-transform:uppercase;">Constantes Vitales en Escala NEWS2:</div>
          <div style="display:flex; flex-wrap:wrap; gap:5px;">
            ${badgesHtml}
          </div>
        </div>
        <div>
          <div style="font-size:0.72rem; opacity:0.9; margin-bottom:4px; font-weight:800; text-transform:uppercase;">Criterios Clínicos Determinantes:</div>
          <ul style="margin:0; padding-left:18px; font-size:0.76rem; line-height:1.45;">
            ${motivosHtml}
          </ul>
        </div>
      `;
    }
  }

  // Configuración de tránsito asistencial y salto de módulos según NTS N° 042-MINSA
  if (prio === "IV" || prio === "V") {
    const radioAlta = document.getElementById("btn_destino_alta");
    if (radioAlta) radioAlta.checked = true;
    STATE.destinoPostTopico = "alta";
  } else if (prio === "III") {
    const radioObs = document.getElementById("btn_destino_observacion");
    if (radioObs) radioObs.checked = true;
    STATE.destinoPostTopico = "observacion";
  } else if (prio === "I" || prio === "II") {
    if (STATE.destinoPostTopico !== "quirofano_uci" && !STATE.esEmergenciaDirecta) {
      const radioObs = document.getElementById("btn_destino_observacion");
      if (radioObs) radioObs.checked = true;
    }
  }

  const topicoLbl = document.getElementById("topico_asignado_lbl");
  if (topicoLbl) topicoLbl.textContent = def.destino;

  const chipLive = document.getElementById("chipPrioLive");
  if (chipLive) {
    chipLive.textContent = `${categoriaTexto} (P-${prio} ${def.nombre})`;
    chipLive.className = `top-prio-chip prio-${prio}`;
  }

  // Ley 27604
  const ley = document.getElementById("ley27604_banner");
  if (ley) ley.classList.toggle("visible", esEmergencia);

  // Actualizar pipeline asistencial de 8 módulos y monitor dinámico de áreas
  if (typeof actualizarPipelineFull === "function") { try { actualizarPipelineFull(prio); } catch(e){} }

  // Cargar costos de triage
  if (typeof registrarFacturacionTriage === "function") {
    try { registrarFacturacionTriage(prio); } catch(e){}
  } else if (typeof registrarFacturaItem === "function") {
    try { registrarFacturaItem("Atención de Triaje Clínico", 30, "Triaje"); } catch(e){}
  }

  // Actualizar liquidación contable en Módulo 8
  actualizarFactura();
}

function obtenerDescripcionPrioridad(prio) {
  const desc = {
    "I": "Riesgo inmediato de vida. Atención inmediata sin demora. SpO2 crítica, colapso hemodinámico, Glasgow alterado o arritmia fatal.",
    "II": "Urgencia mayor. Puede deteriorarse en 15-30 min. Dolor severo (EVA ≥8), dificultad respiratoria moderada o alteración hemodinámica.",
    "III": "Urgencia menor. Estabilidad relativa. Puede esperar hasta 60 min. Dolor moderado, signos vitales en rango.",
    "IV": "Urgencia leve. SpO2 normal, EVA bajo, sin factores críticos. Puede esperar hasta 120 min.",
    "V": "No urgente. Consulta administrativa o control. No requiere atención de emergencia.",
  };
  return desc[prio] || "";
}


// ---------------------------------------------------------------------------
// 11. MÓDULO 4 — CAMAS
// ---------------------------------------------------------------------------
function renderizarStockCamas() {
  const grid = document.getElementById("stockCamasGrid");
  const mini = document.getElementById("stockMini");
  if (!grid && !mini) return;


  let htmlGrid = "";
  let htmlMini = "<div style='display:flex;flex-direction:column;gap:6px;'>";


  for (const [nombre, s] of Object.entries(STOCK_CAMAS)) {
    const dispo = s.disponible;
    const total = s.total;
    const pct = (dispo / total) * 100;
    const cls = dispo === 0 ? "cama-ocupada" : "cama-disponible";


    htmlGrid += `
      <div class="cama-slot ${cls}">
        <div class="cama-slot-num" style="color:${s.color};">${dispo}/${total}</div>
        <div class="cama-slot-label">${nombre}</div>
        <div style="font-size:0.68rem;color:#94a3b8;margin-top:2px;">${dispo === 0 ? "⚠️ Sin camas" : "✅ Disponible"}</div>
      </div>
    `;


    htmlMini += `
      <div style="display:flex;justify-content:space-between;font-size:0.78rem;padding:4px 0;border-bottom:1px solid #f1f5f9;">
        <span style="color:#374151;">${nombre}</span>
        <span style="font-weight:700;color:${dispo===0?"#ef4444":"#15803d"};">${dispo}/${total}</span>
      </div>
    `;
  }


  htmlMini += "</div>";
  if (grid) grid.innerHTML = htmlGrid;
  if (mini) mini.innerHTML = htmlMini;
}


function asignarCama() {
  const validacion = validarSignosVitalesEnVivo();
  if (!validacion.esValido) {
    alert("⛔ Asignación de cama bloqueada: Corrija primero los signos vitales fuera del rango biológico.");
    return;
  }
  if (!STATE.prioridad) {
    alert("Complete primero el Triaje Clínico (Módulo 3).");
    return;
  }


  const mapPrioACama = { "I": "Trauma Shock", "II": "Tópico Crítico", "III": "Observación", "IV": "Observación", "V": "Observación" };
  const tipoCama = mapPrioACama[STATE.prioridad];
  const stock = STOCK_CAMAS[tipoCama];


  if (stock.disponible === 0) {
    activarREFCON(tipoCama);
    return;
  }


  stock.disponible--;
  const num = stock.total - stock.disponible;
  STATE.camaAsignada = `${stock.codigo}-${String(num).padStart(2, "0")}`;


  const display = document.getElementById("camaAsignadaDisplay");
  document.getElementById("camaAsignadaCodigo").textContent = `${STATE.camaAsignada} (${tipoCama})`;
  display.style.display = "block";


  registrarFacturaItem(`Cama: ${tipoCama}`, tipoCama === "UCI" ? 500 : (tipoCama === "Trauma Shock" ? 300 : 150), "Hospitalización");
  renderizarStockCamas();
  if (typeof actualizarWidgetFlotanteCamas === "function") {
    actualizarWidgetFlotanteCamas();
  }
  registrarTimestamp("M4_cama");
  avanzarRuta(1);
}


function liberarCama() {
  if (!STATE.camaAsignada) { alert("No hay cama asignada actualmente."); return; }
  const mapPrioACama = { "I": "Trauma Shock", "II": "Tópico Crítico", "III": "Observación", "IV": "Observación", "V": "Observación" };
  const tipoCama = mapPrioACama[STATE.prioridad] || "Observación";
  STOCK_CAMAS[tipoCama].disponible = Math.min(STOCK_CAMAS[tipoCama].disponible + 1, STOCK_CAMAS[tipoCama].total);
  STATE.camaAsignada = null;
  const elDisp = document.getElementById("camaAsignadaDisplay");
  if (elDisp) elDisp.style.display = "none";
  renderizarStockCamas();
  if (typeof actualizarWidgetFlotanteCamas === "function") {
    actualizarWidgetFlotanteCamas();
  }
}


function activarREFCON(tipoCama = "desconocido") {
  const datos = `
    <strong>Paciente:</strong> ${STATE.identificador || "—"}<br>
    <strong>Historia Clínica:</strong> ${STATE.historiaClinica || "—"}<br>
    <strong>Prioridad:</strong> ${STATE.prioridad ? `P-${STATE.prioridad} (${PRIORIDADES[STATE.prioridad].nombre})` : "—"}<br>
    <strong>Cama solicitada:</strong> ${tipoCama}<br>
    <strong>Motivo derivación:</strong> Sin disponibilidad de camas en ${tipoCama}<br>
    <strong>Establecimiento origen:</strong> Hospital Regional UPP<br>
    <strong>Fecha/Hora:</strong> ${new Date().toLocaleString()}<br>
    <strong>Instrucción:</strong> Registrar en sistema REFCON-MINSA inmediatamente.
  `;
  document.getElementById("refcon_datos").innerHTML = datos;
  document.getElementById("refconModal").classList.add("open");
  registrarTimestamp("M4_refcon");
}


function imprimirHojaREFCON() {
  const contenido = document.getElementById("refcon_datos").innerHTML;
  const w = window.open("", "_blank");
  w.document.write(`
    <html><head><title>Hoja REFCON</title></head>
    <body style="font-family:Arial;padding:40px;max-width:600px;margin:auto;">
    <h2 style="color:#991b1b;">🚨 HOJA DE DERIVACIÓN — SISTEMA REFCON (MINSA)</h2>
    <hr>
    <div style="font-size:1rem;line-height:2;">${contenido}</div>
    <br><hr>
    <p style="font-size:0.9rem;color:#666;">Universidad Politécnica del Perú (UPP) — Facultad de Ciencias de la Salud — Enfermería</p>
    </body></html>
  `);
  w.document.close();
  w.print();
}


// ---------------------------------------------------------------------------
// 12. MÓDULO 5 — LABORATORIO
// ---------------------------------------------------------------------------
function renderizarLaboratorio() {
  renderCatalogo("labGrid", LABORATORIO);
  renderCatalogo("imagenGrid", IMAGENES);
  renderCatalogo("sangreGrid", SANGRE);
}


function renderCatalogo(gridId, items) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = items.map((item, i) => `
    <label class="lab-item" for="lab_${gridId}_${i}">
      <input type="checkbox" id="lab_${gridId}_${i}" data-nombre="${item.nombre}" data-costo="${item.costo}" data-cat="${item.cat}">
      <span class="lab-item-name">${item.nombre}</span>
      <span class="lab-item-costo">S/. ${item.costo.toFixed(2)}</span>
    </label>
  `).join("");
}




// ---------------------------------------------------------------------------
// BUSCADORES EN VIVO DE EXÁMENES (MÓDULO 5) Y MEDICAMENTOS (MÓDULO 6)
// ---------------------------------------------------------------------------
function filtrarCatalogoApoyoDx(query) {
  const q = String(query || "").trim().toLowerCase();
  const labels = document.querySelectorAll("#labGrid label, #imagenGrid label, #sangreGrid label");
  labels.forEach(label => {
    const text = (label.textContent || "").toLowerCase();
    label.style.display = (!q || text.includes(q)) ? "flex" : "none";
  });
  ajustarVisibilidadEncabezadosApoyoDx();
}


function filtrarCategoriaApoyoDx(cat, btn) {
  document.querySelectorAll("#busqueda_apoyo_dx_chips button").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");


  const input = document.getElementById("busqueda_apoyo_dx");
  if (input) input.value = "";


  const secLab = document.getElementById("seccion_lab_title");
  const gridLab = document.getElementById("labGrid");
  const secImg = document.getElementById("seccion_img_title");
  const gridImg = document.getElementById("imagenGrid");
  const secSang = document.getElementById("seccion_sangre_title");
  const gridSang = document.getElementById("sangreGrid");


  document.querySelectorAll("#labGrid label, #imagenGrid label, #sangreGrid label").forEach(l => l.style.display = "flex");


  if (cat === "lab") {
    if (secLab) secLab.style.display = "block";
    if (gridLab) gridLab.style.display = "grid";
    if (secImg) secImg.style.display = "none";
    if (gridImg) gridImg.style.display = "none";
    if (secSang) secSang.style.display = "none";
    if (gridSang) gridSang.style.display = "none";
  } else if (cat === "imagen") {
    if (secLab) secLab.style.display = "none";
    if (gridLab) gridLab.style.display = "none";
    if (secImg) secImg.style.display = "block";
    if (gridImg) gridImg.style.display = "grid";
    if (secSang) secSang.style.display = "none";
    if (gridSang) gridSang.style.display = "none";
  } else if (cat === "sangre") {
    if (secLab) secLab.style.display = "none";
    if (gridLab) gridLab.style.display = "none";
    if (secImg) secImg.style.display = "none";
    if (gridImg) gridImg.style.display = "none";
    if (secSang) secSang.style.display = "block";
    if (gridSang) gridSang.style.display = "grid";
  } else {
    if (secLab) secLab.style.display = "block";
    if (gridLab) gridLab.style.display = "grid";
    if (secImg) secImg.style.display = "block";
    if (gridImg) gridImg.style.display = "grid";
    if (secSang) secSang.style.display = "block";
    if (gridSang) gridSang.style.display = "grid";
  }
}


function filtrarTextoApoyoDx(texto, btn) {
  document.querySelectorAll("#busqueda_apoyo_dx_chips button").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  const input = document.getElementById("busqueda_apoyo_dx");
  if (input) input.value = texto;
  filtrarCategoriaApoyoDx("todos", null);
  filtrarCatalogoApoyoDx(texto);
}


function limpiarFiltroApoyoDx() {
  const input = document.getElementById("busqueda_apoyo_dx");
  if (input) input.value = "";
  filtrarCategoriaApoyoDx("todos", document.querySelector("#busqueda_apoyo_dx_chips button"));
  filtrarCatalogoApoyoDx("");
}


function ajustarVisibilidadEncabezadosApoyoDx() {
  ["lab", "imagen", "sangre"].forEach(id => {
    const grid = document.getElementById(`${id === "imagen" ? "imagen" : (id === "sangre" ? "sangre" : "lab")}Grid`);
    const title = document.getElementById(`seccion_${id === "imagen" ? "img" : id}_title`);
    if (grid && title) {
      const visibles = Array.from(grid.querySelectorAll("label")).filter(l => l.style.display !== "none");
      grid.style.display = visibles.length > 0 ? "grid" : "none";
      title.style.display = visibles.length > 0 ? "block" : "none";
    }
  });
}


function filtrarCatalogoFarmacia(query) {
  const q = String(query || "").trim().toLowerCase();
  const select = document.getElementById("select_farmacia_catalogo");
  if (select) {
    Array.from(select.options).forEach(opt => {
      if (!opt.value) return;
      const texto = opt.textContent.toLowerCase();
      opt.hidden = (!q || texto.includes(q)) ? false : true;
    });
  }
  const labels = document.querySelectorAll("#farmaciaGrid label");
  labels.forEach(label => {
    const text = (label.textContent || "").toLowerCase();
    label.style.display = (!q || text.includes(q)) ? "flex" : "none";
  });
}

function filtrarCatalogoLaboratorio(query) {
  const q = String(query || "").trim().toLowerCase();
  const select = document.getElementById("select_laboratorio_catalogo");
  if (select) {
    Array.from(select.options).forEach(opt => {
      if (!opt.value) return;
      const texto = opt.textContent.toLowerCase();
      opt.hidden = (!q || texto.includes(q)) ? false : true;
    });
  }
}

function filtrarCatalogoImagenes(query) {
  const q = String(query || "").trim().toLowerCase();
  const select = document.getElementById("select_imagenes_catalogo");
  if (select) {
    Array.from(select.options).forEach(opt => {
      if (!opt.value) return;
      const texto = opt.textContent.toLowerCase();
      opt.hidden = (!q || texto.includes(q)) ? false : true;
    });
  }
}

window.filtrarCatalogoLaboratorio = filtrarCatalogoLaboratorio;
window.filtrarCatalogoImagenes = filtrarCatalogoImagenes;


function filtrarTextoFarmacia(texto, btn) {
  document.querySelectorAll("#busqueda_farmacia_chips button").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  const input = document.getElementById("busqueda_farmacia");
  if (input) input.value = texto;
  filtrarCatalogoFarmacia(texto);
}


function limpiarFiltroFarmacia() {
  const input = document.getElementById("busqueda_farmacia");
  if (input) input.value = "";
  filtrarTextoFarmacia("", document.querySelector("#busqueda_farmacia_chips button"));
}


function confirmarLaboratorio() {
  const checks = document.querySelectorAll("#labGrid input:checked, #imagenGrid input:checked, #sangreGrid input:checked");
  if (checks.length === 0) { alert("Seleccione al menos un examen."); return; }
  checks.forEach(ch => {
    registrarFacturaItem(ch.getAttribute("data-nombre"), parseFloat(ch.getAttribute("data-costo")), ch.getAttribute("data-cat"));
  });
  alert(`✅ ${checks.length} examen(es) confirmado(s) y cargado(s) a factura.`);
  registrarTimestamp("M5_lab");
  avanzarRuta(2);
}


// ---------------------------------------------------------------------------
// 13. MÓDULO 6 — FARMACIA
// ---------------------------------------------------------------------------
function renderizarFarmacia() {
  renderCatalogo("farmaciaGrid", FARMACIA);
}


function agregarMedAdicional() {
  const nombre = document.getElementById("med_adicional").value.trim();
  const costo = parseFloat(document.getElementById("med_costo").value) || 0;
  if (!nombre) { alert("Ingrese el nombre del medicamento."); return; }
  registrarFacturaItem(nombre, costo, "Farmacia");
  document.getElementById("med_adicional").value = "";
  document.getElementById("med_costo").value = "";
}


// ---------------------------------------------------------------------------
// 14. MÓDULO 7 — RUTA CLÍNICA Y SALIDA
// ---------------------------------------------------------------------------
function renderizarRutaClinica(prio) {
  const container = document.getElementById("rutaSteps");
  if (!container) return;
  const ruta = RUTAS[prio] || RUTAS["III"];


  let html = "";
  ruta.forEach((step, i) => {
    const activo = i <= STATE.rutaActual;
    html += `
      <div class="ruta-step">
        <div class="ruta-step-circle ${activo ? "done" : ""}">
          ${step.split(" ")[0]}
        </div>
        <div class="ruta-step-label">${step.substring(step.indexOf(" ") + 1)}</div>
      </div>
    `;
    if (i < ruta.length - 1) {
      html += `<div class="ruta-connector ${activo ? "done" : ""}"></div>`;
    }
  });


  container.innerHTML = html;
}


function avanzarRuta(pasos = 1) {
  STATE.rutaActual += pasos;
  if (STATE.prioridad) renderizarRutaClinica(STATE.prioridad);
}


function registrarFirma() {
  const firma = document.getElementById("firma_consentimiento").value.trim();
  if (!firma) { alert("Por favor, ingrese la firma antes de registrar."); return; }
  STATE.firmante = firma;
  STATE.firmaTiempo = new Date().toLocaleString();
  document.getElementById("firma_timestamp").textContent =
    `✅ Firma registrada: ${STATE.firmaTiempo} | Responsable: ${firma}`;
  registrarTimestamp("M7_consentimiento");
}


function registrarSalida(tipo) {
  STATE.estadoSalida = tipo;
  const esNoId = Boolean(
    STATE.esNN ||
    (STATE.numDni && (String(STATE.numDni).toUpperCase() === "NN" || String(STATE.numDni).toUpperCase() === "S/D" || String(STATE.numDni).toUpperCase().startsWith("NN-"))) ||
    (STATE.nombreReniec && String(STATE.nombreReniec).toUpperCase().includes("NN"))
  );

  if (tipo === "Alta Médica" && esNoId) {
    STATE.altaClinicaConcluida = true;
    if (typeof actualizarFactura === "function") actualizarFactura();
  }

  const display = document.getElementById("salida_display");
  if (display) {
    display.style.display = "block";

    const colores = {
      "Alta Médica": { bg: "#f0fdf4", border: "#22c55e", color: "#15803d" },
      "Referencia a otro Centro": { bg: "#fffbeb", border: "#f59e0b", color: "#b45309" },
      "Hospitalizado": { bg: "#eff6ff", border: "#3b82f6", color: "#1e40af" },
      "Deceso — SINADEF": { bg: "#f9fafb", border: "#6b7280", color: "#374151" },
    };
    const c = colores[tipo] || { bg: "#f8fafc", border: "#e2e8f0", color: "#374151" };
    display.style.background = c.bg;
    display.style.border = `2px solid ${c.border}`;
    display.style.color = c.color;
    display.style.borderRadius = "10px";

    display.innerHTML = `
      <strong>Estado de salida registrado:</strong> ${tipo}<br>
      <span style="font-size:0.78rem;">${new Date().toLocaleString()}</span>
    `;

    if (tipo === "Alta Médica" && esNoId) {
      display.innerHTML += `
        <div style="margin-top:10px;padding:10px;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;font-size:0.8rem;line-height:1.5;text-align:left;color:#9f1239;">
          <strong>⚠️ Liquidación al Alta de Paciente No Identificado (NN):</strong><br>
          Al no confirmarse la identidad del paciente antes del egreso, no fue posible acreditar cobertura en ningún seguro de salud (SIS, EsSalud ni EPS). Conforme a la normativa hospitalaria, la cuenta asistencial sale con su <strong>FACTURACIÓN TOTAL acumulada (no en S/ 0.00)</strong> para gestión institucional de cobro y recupero.
        </div>
      `;
    }

    if (tipo === "Deceso — SINADEF") {
      display.innerHTML += `
        <div style="margin-top:10px;padding:10px;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;font-size:0.8rem;line-height:1.5;text-align:left;">
          <strong style="color:#0f172a;">⚖️ Protocolo Post-Mortem y Cobertura de Sepelio (Ley N° 26842 / Art. 114):</strong><br>
          • <strong>Si deudos reclaman el cuerpo:</strong> Acreditación con DNI original + Certificado SINADEF. Se activa póliza de sepelio según seguro acreditado (${STATE.tipoSeguro || "Registrado"}): EsSalud hasta S/. 2,070 (Formulario 1010), SIS PES hasta S/. 1,000, SOAT hasta 5 UIT (4 UIT muerte + 1 UIT entierro), o Particular con Servicio Social.<br>
          • <strong>Si NO reclaman el cuerpo (48-72h):</strong> Custodia en cámara frigorífica, notificación inmediata a PNP y Fiscalía de Turno, necropsia por IML y destino legal a Beneficencia (fosa común) o donación para docencia e investigación a Facultades de Medicina Humana.
        </div>
      `;
    }
  }


  registrarTimestamp("M7_salida");
  avanzarRuta(1);
}


// ---------------------------------------------------------------------------
// 15. FACTURA ACUMULATIVA
// ---------------------------------------------------------------------------
function registrarFacturaItem(servicio, costo, categoria = "General") {
  // Evitar duplicados exactos
  const ya = STATE.items_factura.find(i => i.servicio === servicio);
  if (ya) return;


  STATE.items_factura.push({
    servicio,
    costo,
    categoria,
    timestamp: new Date().toLocaleTimeString(),
    ley27604: (STATE.prioridad === "I" || STATE.prioridad === "II"),
  });
  actualizarFactura();
}


// ---------------------------------------------------------------------------
// 15. LIQUIDACIÓN Y FACTURACIÓN HOSPITALARIA CON REGLAS DE COBERTURA (SUSALUD / SITEDS)
// ---------------------------------------------------------------------------
function calcularLiquidacionSeguro() {
  const entorno = STATE.entornoOperativo || "publico"; // "publico" | "privado"
  const padron = STATE.padronSusalud;
  const esAccidente = STATE.esAccidenteTransito || STATE.tipoOrigenEvento === "soat";
  const esFuga = STATE.soatVehiculoFuga || STATE.eventoFugaTransversal || (padron && padron.condicion_evento === "ACCIDENTE_TRANSITO_FUGA");
  const totalBruto = STATE.items_factura.reduce((s, i) => s + (parseFloat(i.costo) || 0), 0);
  const subtotalFarmacia = STATE.items_factura
    .filter(i => (i.categoria || "").toLowerCase().includes("farmacia"))
    .reduce((s, i) => s + (parseFloat(i.costo) || 0), 0);
  const subtotalServicios = Math.max(0, totalBruto - subtotalFarmacia);
  const esEmergencia = (STATE.prioridad === "I" || STATE.prioridad === "II");
  const esUrgencia = !esEmergencia;

  let lugarAtencion = "";
  let coberturaSeguro = 0;
  let coaseguroFarmacia = 0;
  let copagoFijo = 0;
  let pctCoaseguro = 0;
  let totalPaciente = 0;
  let motivoLiquidacion = "";
  let etiquetaRegimen = "";
  let condicionSusalud = "";
  let coberturaSector = "";
  let alertaSector = "";
  let coberturaSoatAplicada = 0;
  let saldoSoatRestante = 0;
  let esEpsPrivado = (entorno === "privado");
  let esPublico = (entorno === "publico");

  // =========================================================================
  // CASO 1: ACCIDENTE DE TRÁNSITO CON VEHÍCULO EN FUGA (SIN PLACA / SIN SOAT)
  // NORMA VIAL SUSALUD: Si el vehículo se dio a la fuga, NO SE ACTIVA SOAT.
  // Por mandato de ley, NINGÚN SEGURO (ni SIS, ni EsSalud, ni Privado) lo cubre.
  // Se cobra el 100% al paciente con cargo a recupero posterior ante FONSAT.
  // =========================================================================
  if (esFuga) {
    lugarAtencion = "Emergencia Hospitalaria (Accidente de Tránsito con Chofer en Fuga)";
    etiquetaRegimen = "🚨 Chofer en Fuga (Sin SOAT Identificado · Cobro 100% Particular)";
    condicionSusalud = "🚨 Accidente de Tránsito con Fuga (Sin SOAT Identificado)";
    coberturaSector = "0% (Sin Cobertura: Chofer en Fuga)";
    copagoFijo = 0.00;
    pctCoaseguro = 100;
    coberturaSeguro = 0.00;
    totalPaciente = totalBruto;
    alertaSector = "🚨 Sin SOAT identificable por fuga vehicular: Ningún seguro (SIS, EsSalud, Privado) cubre este evento. El paciente asume el 100% de la liquidación.";
    motivoLiquidacion = "ACCIDENTE DE TRÁNSITO CON VEHÍCULO EN FUGA (Art. 31° D.S. N° 024-2002-MTC). Al no existir vehículo ni placa identificada, NO SE ACTIVA EL SOAT. Conforme a la normativa nacional de SUSALUD, ningún seguro público ni privado (SIS, EsSalud o IAFAS EPS) cubre la atención de siniestros viales. Se liquida y cobra el 100% al paciente con derecho a trámite de recupero ante el Fondo de Compensación del SOAT (FONSAT).";

    STATE.soatConsumido = 0;
    STATE.soatDisponible = 0;

    return {
      lugarAtencion,
      totalBruto,
      subtotalServicios,
      subtotalFarmacia,
      coberturaSeguro: 0,
      coaseguroFarmacia: 0,
      copagoUrgencia: 0,
      copagoFijo: 0,
      pctCoaseguro: 100,
      totalPaciente,
      motivoLiquidacion,
      etiquetaRegimen,
      condicionSusalud,
      coberturaSector,
      alertaSector,
      esEpsPrivado,
      esPublico
    };
  }

  // =========================================================================
  // CASO 2: ACCIDENTE DE TRÁNSITO CON VEHÍCULO IDENTIFICADO (SOAT ACTIVO)
  // Siempre para accidente de tránsito se aplica el monto máximo de cobertura
  // de 5 UIT (S/. 27,500.00) cuando se identifica al vehículo.
  // =========================================================================
  if (esAccidente && !esFuga) {
    lugarAtencion = "Servicio de Emergencia Especializado SOAT — D.S. N° 024-2002-MTC";
    etiquetaRegimen = "🚗 SOAT Ley D.S. N° 024-2002-MTC (Tope 5 UIT = S/. 27,500)";
    condicionSusalud = "🚗 Siniestro Vial SOAT Activo (Placa Identificada)";
    coberturaSector = "100% Cobertura SOAT (Hasta 5 UIT = S/. 27,500)";
    copagoFijo = 0.00;
    pctCoaseguro = 0;
    const topeSoat = STATE.soatTopeLegal || 27500;
    if (totalBruto <= topeSoat) {
      coberturaSeguro = totalBruto;
      totalPaciente = 0.00;
      coberturaSoatAplicada = totalBruto;
      saldoSoatRestante = topeSoat - totalBruto;
      alertaSector = "✅ Cobertura SOAT al 100% dentro del tope legal de 5 UIT (S/. 27,500.00). Paciente paga S/. 0.00.";
      motivoLiquidacion = `COBERTURA TOTAL POR SOAT ACTIVO (D.S. N° 024-2002-MTC). Total facturado S/. ${totalBruto.toFixed(2)} cubierto al 100% dentro del tope legal de 5 UIT (S/. 27,500.00). Saldo SOAT remanente disponible: S/. ${saldoSoatRestante.toFixed(2)}. Paciente paga: S/. 0.00.`;
    } else {
      coberturaSeguro = topeSoat;
      totalPaciente = totalBruto - topeSoat;
      coberturaSoatAplicada = topeSoat;
      saldoSoatRestante = 0.00;
      alertaSector = `⚠️ Tope máximo legal de SOAT (5 UIT = S/. 27,500.00) agotado. Excedente de S/. ${totalPaciente.toFixed(2)} a cargo del paciente.`;
      motivoLiquidacion = `TOPE SOAT AGOTADO (5 UIT = S/. 27,500.00). El SOAT cubrió el límite legal máximo de S/. 27,500.00. El excedente de S/. ${totalPaciente.toFixed(2)} pasa a responsabilidad del paciente o seguro complementario.`;
    }

    STATE.soatConsumido = coberturaSoatAplicada;
    STATE.soatDisponible = saldoSoatRestante;

    return {
      lugarAtencion,
      totalBruto,
      subtotalServicios,
      subtotalFarmacia,
      coberturaSeguro,
      coaseguroFarmacia: 0,
      copagoUrgencia: 0,
      copagoFijo: 0,
      pctCoaseguro: 0,
      totalPaciente,
      motivoLiquidacion,
      etiquetaRegimen,
      condicionSusalud,
      coberturaSector,
      alertaSector,
      esEpsPrivado,
      esPublico
    };
  }

  // =========================================================================
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

  // =========================================================================
  // CASO 3: ENTORNO PÚBLICO (MINSA / SIS / ESSALUD)
  // =========================================================================
  if (entorno === "publico") {
    lugarAtencion = "Hospital Regional Docente UPP (Red Asistencial Pública / MINSA / EsSalud)";
    const pub = padron ? padron.publico : null;

    // REGLA 1: Sin Seguro Público o con Seguro Privado Puro
    if (!pub || pub.estado !== "ACTIVO") {
      etiquetaRegimen = "Hospital Público · Paciente Particular (Sin Seguro Estatal)";
      condicionSusalud = pub?.regimen || "PARTICULAR NO ASEGURADO EN ESTADO";
      coberturaSector = "0% (Sin Cobertura Estatal en Red Pública)";
      copagoFijo = 0.00;
      pctCoaseguro = 100;
      coberturaSeguro = 0.00;
      totalPaciente = totalBruto;
      alertaSector = "⚠️ Paciente no registra afiliación pública activa (SIS/EsSalud): Tarifa particular 100%.";
      motivoLiquidacion = "PACIENTE PARTICULAR EN RED PÚBLICA. No registra afiliación en SIS ni en EsSalud en el Padrón Nacional SUSALUD (registra seguro privado o es particular). En el establecimiento público asume el 100% de la totalidad de lo facturado.";
    }

    // REGLA 3: Cobertura Estatal Plena (SIS o EsSalud ACTIVO)
    else {
      etiquetaRegimen = `${pub.entidad} Gratuito Integral (${pub.regimen} · Ley N° 27604)`;
      condicionSusalud = `${pub.entidad} - ${pub.regimen} (${pub.codigo || 'ACTIVO'})`;
      coberturaSector = "100% Cobertura Integral Pública (Pago S/ 0.00)";
      copagoFijo = 0.00;
      pctCoaseguro = 0;
      coberturaSeguro = totalBruto;
      totalPaciente = 0.00; // PAGO CERO TOTAL
      alertaSector = "✅ Cobertura Integral Estatal al 100% (Pago Cero en cualquier prioridad I a V).";
      motivoLiquidacion = `COBERTURA TOTAL ESTATAL (PAGO CERO). Paciente acreditado en ${pub.entidad} bajo el régimen '${pub.regimen}' (${pub.codigo || 'FUA'}). Conforme a la Ley N° 27604 y Ley N° 29344, todos los conceptos asistenciales están cubiertos al 100% por el Estado peruano. Total a pagar por paciente: S/. 0.00.`;
    }
  }

  // =========================================================================
  // CASO 4: ENTORNO PRIVADO (CLÍNICA / EPS / SITEDS)
  // =========================================================================
  else {
    lugarAtencion = "Clínica Privada Especializada (Red Prestacional Privada EPS / SITEDS)";
    const priv = padron ? padron.privado : null;

    // REGLA A: Paciente con SIS, Solo EsSalud o Sin Seguro (Póliza Inactiva)
    if (!priv || priv.estado_poliza !== "ACTIVA") {
      etiquetaRegimen = "Clínica Privada · Tarifa Particular (Sin Póliza EPS)";
      condicionSusalud = `Sin Cobertura Privada (${padron ? padron.tipo_aseguramiento : 'PARTICULAR'})`;
      coberturaSector = "0% (No aplica cobertura pública en Clínica Privada)";
      copagoFijo = 0.00;
      pctCoaseguro = 100;
      coberturaSeguro = 0.00;
      totalPaciente = totalBruto;
      alertaSector = `Paciente registra [${padron?.publico?.entidad || 'Sin Seguro'}] -> No aplica cobertura en Clínica Privada (Cobro 100% Particular).`;
      motivoLiquidacion = `ATENCIÓN PARTICULAR EN CLÍNICA PRIVADA. El paciente registra [${padron?.publico?.entidad || 'Sin Seguro'} / ${padron?.publico?.regimen || 'Particular'}]. En la clínica privada NO aplica cobertura estatal de SIS ni de EsSalud. Todo concepto se liquida como Paciente Particular al 100%.`;
    }

    // REGLA B: Quiebre por Exclusiones Contractuales
    else if (priv.exclusiones && priv.exclusiones.some(e => {
      const mot = (STATE.motivoConsulta || "").toLowerCase();
      if (e.includes("Etílica") && (mot.includes("alcohol") || mot.includes("etílic") || mot.includes("ebrio"))) return true;
      if (e.includes("Autoinfligidas") && (mot.includes("suicid") || mot.includes("autoinfligid") || mot.includes("cortes"))) return true;
      if (e.includes("Deportes") && (mot.includes("extremo") || mot.includes("parapente") || mot.includes("escalada"))) return true;
      return false;
    })) {
      const causal = priv.exclusiones.join(", ");
      etiquetaRegimen = "Clínica Privada EPS · Siniestro Rechazado por Exclusión";
      condicionSusalud = `Rechazo SITEDS (${causal})`;
      coberturaSector = "0% (Siniestro Rechazado por Aseguradora)";
      copagoFijo = 0.00;
      pctCoaseguro = 100;
      coberturaSeguro = 0.00;
      totalPaciente = totalBruto;
      alertaSector = `🚨 Siniestro Rechazado por Causal Contractual: ${causal}. Paciente asume el 100%.`;
      motivoLiquidacion = `SINIESTRO RECHAZADO POR IAFAS EPS (SITEDS). Causal de exclusión contractual: ${causal}. Conforme al contrato de seguro privado, se anula la cobertura asistencial y la totalidad de la cuenta hospitalaria es asumida al 100% por el paciente.`;
    }

    // REGLA C: Ley de Emergencia - Prioridad I y II (Vital)
    else if (esEmergencia) {
      etiquetaRegimen = `${priv.iafas_eps} · Emergencia Médica Vital (P-${STATE.prioridad} · Ley N° 27604)`;
      condicionSusalud = `${priv.iafas_eps} · ${priv.plan_salud} (Emergencia Vital P-${STATE.prioridad})`;
      coberturaSector = "100% Cobertura Ley de Emergencia N° 27604 (Pago S/ 0.00)";
      copagoFijo = 0.00;
      pctCoaseguro = 0;
      coberturaSeguro = totalBruto;
      totalPaciente = 0.00; // PAGO CERO EN EMERGENCIA VITAL
      alertaSector = "✅ Ley N° 27604: Emergencia con riesgo de muerte o daño orgánico cubierta al 100% por IAFAS EPS (Pago S/ 0.00).";
      motivoLiquidacion = `EMERGENCIA VITAL CUBIERTA AL 100% POR LEY N° 27604 (P-${STATE.prioridad} ${STATE.prioridad === 'I' ? 'ROJO' : 'NARANJA'}). Paciente en riesgo inminente de vida con póliza ${priv.iafas_eps} activa (SITEDS: ${priv.siteds_codigo || 'AUTORIZADO'}). Procedimientos críticos, shock trauma, exámenes, estancia y farmacia cubiertos al 100% por la aseguradora. Pago del paciente: S/. 0.00.`;
    }

    // REGLA D: Urgencia / Observación - Prioridades III, IV y V
    else {
      const planSel = STATE.planPrivado || (document.getElementById("select_plan_privado")?.value) || "base_80_20";
      if (planSel === "integral_90_10") {
        copagoFijo = 50.00;
        pctCoaseguro = 0.10;
      } else if (planSel === "vip_100") {
        copagoFijo = 0.00;
        pctCoaseguro = 0.00;
      } else {
        copagoFijo = 80.00;
        pctCoaseguro = 0.20;
      }
      const gastoProcYFar = subtotalFarmacia + subtotalServicios;
      const coaseguroMonto = gastoProcYFar * pctCoaseguro;
      if (totalBruto === 0) {
        totalPaciente = 0.00;
        coberturaSeguro = 0.00;
      } else {
        totalPaciente = copagoFijo + coaseguroMonto;
        coberturaSeguro = Math.max(0, totalBruto - totalPaciente);
      }

      etiquetaRegimen = `${priv.iafas_eps} · Atención de Urgencia (P-${STATE.prioridad || 'III'})`;
      condicionSusalud = `${priv.iafas_eps} · ${priv.plan_salud} (SITEDS: ${priv.siteds_codigo || 'AUTORIZADO'})`;
      coberturaSector = `Copago Fijo S/. ${copagoFijo.toFixed(2)} + ${(pctCoaseguro * 100).toFixed(0)}% Coaseguro`;
      alertaSector = `Atención de Urgencia/Ambulatoria EPS: Paciente abona copago fijo S/. ${copagoFijo.toFixed(2)} + ${(pctCoaseguro * 100).toFixed(0)}% coaseguro (S/. ${coaseguroMonto.toFixed(2)}). Saldo facturado a la EPS.`;
      motivoLiquidacion = `ATENCIÓN DE URGENCIA / CONSULTORIO EPS (P-${STATE.prioridad || 'III'}). Póliza ${priv.iafas_eps} activa (${priv.plan_salud}). Se liquida copago fijo de S/. ${copagoFijo.toFixed(2)} más coaseguro del ${(pctCoaseguro * 100).toFixed(0)}% sobre farmacia y procedimientos (S/. ${coaseguroMonto.toFixed(2)}). Total a cargo del paciente: S/. ${totalPaciente.toFixed(2)}. Saldo de S/. ${coberturaSeguro.toFixed(2)} derivado electrónicamente a la IAFAS EPS vía SITEDS.`;
    }
  }

  STATE.soatConsumido = coberturaSoatAplicada;
  STATE.soatDisponible = saldoSoatRestante;

  return {
    lugarAtencion,
    totalBruto,
    subtotalServicios,
    subtotalFarmacia,
    coberturaSeguro,
    coaseguroFarmacia,
    copagoUrgencia: copagoFijo,
    copagoFijo,
    pctCoaseguro: (pctCoaseguro * 100),
    totalPaciente,
    motivoLiquidacion,
    etiquetaRegimen,
    condicionSusalud,
    coberturaSector,
    alertaSector,
    esEpsPrivado,
    esPublico
  };
}
function actualizarFactura() {
  const container = document.getElementById("factura_items");
  const totalEl = document.getElementById("factura_total_num");
  const miniEl = document.getElementById("factura_total_mini");
  const leyBanner = document.getElementById("factura_ley27604");

  const liq = calcularLiquidacionSeguro();

  // Actualizar acumulador en Top Steps Navbar
  const navMontoEl = document.getElementById("navFacturaMonto");
  if (navMontoEl) {
    navMontoEl.textContent = `S/. ${liq.totalPaciente.toFixed(2)}`;
  }

  // Actualizar medidor SOAT
  actualizarMedidorSoat(liq);

  // Actualizar Tabla de Resumen Contable Auditada SUSALUD / SITEDS Perú
  const condEl = document.getElementById("liq_condicion_susalud");
  if (condEl) condEl.textContent = liq.condicionSusalud || "—";

  const cobEl = document.getElementById("liq_cobertura_sector");
  if (cobEl) cobEl.textContent = liq.coberturaSector || "—";

  const copEl = document.getElementById("liq_copago_fijo");
  if (copEl) copEl.textContent = `S/. ${(liq.copagoFijo || 0).toFixed(2)}`;

  const coasEl = document.getElementById("liq_pct_coaseguro");
  if (coasEl) coasEl.textContent = `${(liq.pctCoaseguro || 0).toFixed(0)}%`;

  const cubEl = document.getElementById("liq_monto_cubierto");
  if (cubEl) cubEl.textContent = `S/. ${liq.coberturaSeguro.toFixed(2)}`;

  const pacEl = document.getElementById("liq_monto_paciente");
  if (pacEl) pacEl.textContent = `S/. ${liq.totalPaciente.toFixed(2)}`;

  const pacSubEl = document.getElementById("liq_monto_paciente_sub");
  if (pacSubEl) {
    pacSubEl.textContent = liq.totalPaciente === 0
      ? "Gratuidad Total de Emergencia (Ley N° 27604)"
      : (liq.esEpsPrivado ? "Copago Fijo + Coaseguro EPS" : "Tarifa Particular a Cargo de Paciente");
  }

  const alertaEl = document.getElementById("liq_alerta_sectorial");
  if (alertaEl) {
    if (liq.alertaSector) {
      alertaEl.style.display = "block";
      alertaEl.textContent = liq.alertaSector;
      if (liq.alertaSector.includes("🚨") || liq.alertaSector.includes("Rechazado") || liq.alertaSector.includes("⚠️")) {
        alertaEl.style.background = "#fff1f2";
        alertaEl.style.color = "#9f1239";
        alertaEl.style.border = "1px solid #fecdd3";
      } else {
        alertaEl.style.background = "#f0fdf4";
        alertaEl.style.color = "#166534";
        alertaEl.style.border = "1px solid #bbf7d0";
      }
    } else {
      alertaEl.style.display = "none";
    }
  }


  if (!container) return;

  if (STATE.items_factura.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:32px 16px;color:#94a3b8;">
        <span style="font-size:36px;display:block;margin-bottom:8px;">🧾</span>
        <strong>Sin cargos clínicos activos en la cuenta.</strong>
        <p style="font-size:12px;margin-top:4px;">Los medicamentos administrados en Kardex y procedimientos se liquidarán acumulativamente aquí.</p>
      </div>
    `;
    if (totalEl) totalEl.textContent = "0.00";
    if (miniEl) miniEl.textContent = "S/. 0.00";
    return;
  }

  // Renderizar items facturados
  let html = `<table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left;">
    <thead>
      <tr style="background:#f1f5f9;color:#475569;border-bottom:2px solid #cbd5e1;">
        <th style="padding:10px 12px;">Concepto Asistencial</th>
        <th style="padding:10px 12px;width:120px;">Servicio</th>
        <th style="padding:10px 12px;width:90px;text-align:right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>`;

  STATE.items_factura.forEach(item => {
    html += `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 12px;font-weight:600;color:#1e293b;">${item.nombre}</td>
        <td style="padding:8px 12px;color:#64748b;font-size:12px;"><span style="background:#f8fafc;padding:2px 6px;border-radius:4px;border:1px solid #e2e8f0;">${item.categoria || 'Clínica'}</span></td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:#0f172a;">S/. ${(parseFloat(item.costo)||0).toFixed(2)}</td>
      </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // Actualizar números de liquidación
  if (totalEl) totalEl.textContent = liq.totalPaciente.toFixed(2);
  if (miniEl) miniEl.textContent = `S/. ${liq.totalPaciente.toFixed(2)}`;

  // Actualizar desglose detallado en Módulo 8
  const detalleEl = document.getElementById("liquidacion_detalle_box");
  if (detalleEl) {
    detalleEl.innerHTML = `
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:14px;margin-top:14px;font-size:13px;">
        <div style="font-weight:800;color:#0f172a;margin-bottom:8px;font-size:14px;">📊 Desglose de Auditoría Financiera — Ley N° 29414 (SUSALUD)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:10px;">
          <div><span style="color:#64748b;">Régimen:</span> <strong>${liq.etiquetaRegimen}</strong></div>
          <div><span style="color:#64748b;">Total Bruto Generado:</span> <strong>S/. ${liq.totalBruto.toFixed(2)}</strong></div>
          <div><span style="color:#64748b;">Cobertura Aseguradora:</span> <strong style="color:#15803d;">S/. ${liq.coberturaSeguro.toFixed(2)}</strong></div>
          <div><span style="color:#64748b;">Total a Pagar Paciente:</span> <strong style="color:#0284c7;font-size:15px;">S/. ${liq.totalPaciente.toFixed(2)}</strong></div>
        </div>
        <div style="background:#ffffff;border-left:4px solid #0284c7;padding:8px 12px;border-radius:4px;color:#334155;font-size:12px;line-height:1.4;">
          <strong>Dictamen de Auditoría:</strong> ${liq.motivoLiquidacion}
        </div>
      </div>
    `;
  }
}

function actualizarMedidorSoat(liq) {
  if (!liq) liq = calcularLiquidacionSeguro();
  const container = document.getElementById("soatMeterContainer");
  const badgeNav = document.getElementById("navSoatBadge");
  const saldoNav = document.getElementById("navSoatSaldo");
  const miniBadge = document.getElementById("mini_soat_badge");
  const cardMod3 = document.getElementById("soat_meter_card");
  const saldoMod3 = document.getElementById("soat_saldo_display");
  const fillMod3 = document.getElementById("soat_progress_fill");
  const factMod3 = document.getElementById("soat_facturado_lbl");

  if (!STATE.esAccidenteTransito) {
    if (container) container.style.display = "none";
    if (badgeNav) badgeNav.style.display = "none";
    if (miniBadge) miniBadge.style.display = "none";
    if (cardMod3) cardMod3.style.display = "none";
    return;
  }

  // Si es Accidente de Tránsito SIN PLACA / EN FUGA:
  if (STATE.soatVehiculoFuga) {
    if (container) container.style.display = "none";
    if (badgeNav) badgeNav.style.display = "none";
    if (cardMod3) cardMod3.style.display = "none";
    if (miniBadge) {
      miniBadge.style.display = "inline-flex";
      miniBadge.style.background = "#fee2e2";
      miniBadge.style.color = "#991b1b";
      miniBadge.style.borderColor = "#fca5a5";
      miniBadge.textContent = "🚨 SOAT: Sin Placa (Sin Seguro / Cargo Completo)";
    }
    return;
  }

  // Si es Accidente con PLACA IDENTIFICADA:
  if (badgeNav) badgeNav.style.display = "inline-flex";
  if (container) container.style.display = "block";
  if (cardMod3) cardMod3.style.display = "block";

  const consumido = liq.coberturaSoatAplicada || 0;
  const saldo = liq.saldoSoatRestante !== undefined ? liq.saldoSoatRestante : Math.max(0, 27500 - consumido);
  const pct = Math.min(100, (consumido / 27500) * 100);

  if (saldoNav) saldoNav.textContent = `S/. ${saldo.toFixed(2)}`;
  if (miniBadge) {
    miniBadge.style.display = "inline-flex";
    miniBadge.style.background = "#fff7ed";
    miniBadge.style.color = "#c2410c";
    miniBadge.style.borderColor = "#fb923c";
    miniBadge.textContent = `🚗 SOAT Saldo: S/. ${saldo.toFixed(2)}`;
  }

  if (saldoMod3) saldoMod3.textContent = `Saldo Disponible: S/. ${saldo.toFixed(2)}`;
  if (fillMod3) {
    fillMod3.style.width = `${pct}%`;
    fillMod3.style.background = pct > 85 ? "#dc2626" : (pct > 50 ? "#ea580c" : "#16a34a");
  }
  if (factMod3) factMod3.textContent = `S/. ${consumido.toFixed(2)}`;

  const consEl = document.getElementById("soatMeterConsumido");
  const salEl = document.getElementById("soatMeterSaldo");
  const barEl = document.getElementById("soatMeterBar");

  if (consEl) consEl.textContent = `S/. ${consumido.toFixed(2)}`;
  if (salEl) salEl.textContent = `S/. ${saldo.toFixed(2)}`;
  if (barEl) {
    barEl.style.width = `${pct}%`;
    barEl.style.background = pct > 85 ? "#dc2626" : (pct > 50 ? "#ea580c" : "#0284c7");
  }
}

function generarFacturaPDF() {
  const validacion = validarSignosVitalesEnVivo();
  if (!validacion.esValido) {
    alert("⛔ Facturación retenida: Se detectaron parámetros de signos vitales fuera de rango biológico en el triaje.");
    return;
  }
  const fecha = new Date().toLocaleString();
  const liq = calcularLiquidacionSeguro();
  const filas = STATE.items_factura.map(i => `
    <tr>
      <td>${i.servicio}</td>
      <td>${i.categoria}</td>
      <td style="text-align:right;">${i.costo === 0 ? "—" : `S/. ${i.costo.toFixed(2)}`}</td>
    </tr>
  `).join("");


  const html = `
    <html><head><title>Factura Oficial — ${STATE.historiaClinica || "HIS"}</title><style>
      body { font-family: Arial, sans-serif; padding: 30px; max-width: 680px; margin: auto; color: #0f172a; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #e2e8f0; padding: 8px 12px; font-size: 0.88rem; }
      th { background: #f8fafc; font-weight: 700; text-align: left; }
      .liq-box { margin-top: 20px; padding: 14px; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.88rem; }
      .liq-row { display: flex; justify-content: space-between; padding: 4px 0; }
      .total-final { font-size: 1.15rem; font-weight: 900; color: #0284c7; border-top: 2px solid #0284c7; padding-top: 8px; margin-top: 8px; }
    </style></head>
    <body>
      <h2>${liq.lugarAtencion}</h2>
      <p style="font-size:0.82rem;color:#64748b;">Universidad Politécnica del Perú (UPP) — Facultad de Ciencias de la Salud</p>
      <hr>
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:12px;">
        <div>
          <p><strong>Paciente:</strong> ${STATE.nombreReniec || STATE.identificador || "—"}</p>
          <p><strong>Historia Clínica:</strong> ${STATE.historiaClinica || "—"}</p>
          <p><strong>Régimen:</strong> ${liq.etiquetaRegimen}</p>
        </div>
        <div style="text-align:right;">
          <p><strong>Fecha/Hora:</strong> ${fecha}</p>
          <p><strong>Prioridad Triaje:</strong> P-${STATE.prioridad || "—"} (${STATE.prioridad ? PRIORIDADES[STATE.prioridad].nombre : "Sin evaluar"})</p>
          <p><strong>Seguro:</strong> ${STATE.tipoSeguro || "Particular"}</p>
        </div>
      </div>
      <table>
        <thead><tr><th>Servicio / Procedimiento</th><th>Categoría</th><th style="text-align:right;">Costo</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="3" style="text-align:center;">Sin servicios cargados</td></tr>'}</tbody>
      </table>
      

      <div class="liq-box">
        <div class="liq-row"><span>Subtotal Facturado (Bruto):</span><strong>S/. ${liq.totalBruto.toFixed(2)}</strong></div>
        ${liq.esPublico ? `<div class="liq-row" style="color:#16a34a;"><span>Cobertura Seguro Estatal (100% de todo):</span><strong>- S/. ${liq.coberturaSeguro.toFixed(2)}</strong></div>` : ''}
        ${liq.esEpsPrivado ? `<div class="liq-row" style="color:#0284c7;"><span>Cobertura Plan EPS / Privado:</span><strong>- S/. ${liq.coberturaSeguro.toFixed(2)}</strong></div>` : ''}
        ${liq.copagoUrgencia > 0 ? `<div class="liq-row" style="color:#b45309;"><span>Cobro Consulta de Urgencia (P-III/IV/V):</span><strong>+ S/. ${liq.copagoUrgencia.toFixed(2)}</strong></div>` : ''}
        ${liq.subtotalFarmacia > 0 && liq.esEpsPrivado ? `<div class="liq-row" style="color:#b45309;"><span>Coaseguro Farmacia EPS (10% de S/. ${liq.subtotalFarmacia.toFixed(2)}):</span><strong>+ S/. ${liq.coaseguroFarmacia.toFixed(2)}</strong></div>` : ''}
        <div class="liq-row total-final">
          <span>TOTAL A PAGAR POR EL PACIENTE:</span>
          <span>${liq.totalPaciente === 0 ? "S/. 0.00 (PAGO CERO)" : `S/. ${liq.totalPaciente.toFixed(2)}`}</span>
        </div>
        <div style="margin-top:10px;font-size:0.75rem;color:#475569;line-height:1.45;">
          ℹ️ ${liq.motivoLiquidacion}
        </div>
      </div>


      <br><br>
      <div style="display:flex;justify-content:space-between;margin-top:30px;">
        <div style="text-align:center;">_______________________<br><small>Firma del Paciente / Responsable</small></div>
        <div style="text-align:center;">_______________________<br><small>Jefe de Caja y Facturación HIS</small></div>
      </div>
    </body></html>
  `;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}


function generarReporteAuditoria() {
  const validacion = validarSignosVitalesEnVivo();
  if (!validacion.esValido) {
    alert("⛔ Reporte de auditoría bloqueado: Existen signos vitales fuera del rango biológico compatible con la vida. Corrija los valores en rojo.");
    return;
  }
  const fecha = new Date().toLocaleString();
  const total = STATE.items_factura.reduce((s, i) => s + i.costo, 0);
  const liq = calcularLiquidacionSeguro();


  const html = `
    <div style="font-family:Arial;font-size:0.88rem;line-height:1.6;">
      <h3 style="color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-bottom:16px;">
        INFORME DE AUDITORÍA — EPISODIO DE EMERGENCIA
      </h3>
      <p style="font-size:0.78rem;color:#64748b;">Universidad Politécnica del Perú (UPP) — Facultad de Ciencias de la Salud — Enfermería<br>
      Emisión: ${fecha}</p>


      <div style="margin:16px 0;">
        <h4 style="font-size:0.85rem;font-weight:800;border-bottom:1px solid #f1f5f9;padding-bottom:4px;margin-bottom:8px;">
          1. MÓDULO 1 — Admisión e Identidad
        </h4>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f8fafc;"><span style="color:#64748b;">Identificador</span><span style="font-weight:600;">${STATE.identificador || "—"}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f8fafc;"><span style="color:#64748b;">Historia Clínica</span><span style="font-weight:600;">${STATE.historiaClinica || "—"}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f8fafc;"><span style="color:#64748b;">Estado BD</span><span style="font-weight:600;">${STATE.estadoRegistrado}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f8fafc;"><span style="color:#64748b;">Modalidad de ingreso</span><span style="font-weight:600;">${STATE.modalidadIngreso}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f8fafc;"><span style="color:#64748b;">Hora de llegada</span><span style="font-weight:600;">${STATE.horaLlegada || "—"}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f8fafc;"><span style="color:#64748b;">Sexo / Edad</span><span style="font-weight:600;">${STATE.sexo ? (STATE.sexo === 'F' ? 'Femenino' : 'Masculino') : '—'} / ${STATE.edad ? STATE.edad + ' años' : '—'}</span></div>
        ${STATE.fechaNacimiento ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f8fafc;"><span style="color:#64748b;">Fecha de Nacimiento</span><span style="font-weight:600;">${STATE.fechaNacimiento}</span></div>` : ""}
        ${STATE.nombreReniec ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#64748b;">Nombre RENIEC</span><span style="font-weight:600;">${STATE.nombreReniec}</span></div>` : ""}
        ${STATE.alertaPnpSs ? `<div style="color:#c2410c;font-weight:700;margin-top:6px;">⚠️ Alerta NN emitida a PNP / Servicio Social</div>` : ""}
      </div>


      <div style="margin:16px 0;">
        <h4 style="font-size:0.85rem;font-weight:800;border-bottom:1px solid #f1f5f9;padding-bottom:4px;margin-bottom:8px;">
          2. MÓDULO 2 — Cobertura y Seguro
        </h4>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#64748b;">Tipo de seguro</span><span style="font-weight:600;">${STATE.tipoSeguro || "Sin registrar"}</span></div>
        ${STATE.numerFua ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#64748b;">N° FUA (SIS)</span><span style="font-weight:600;">${STATE.numerFua}</span></div>` : ""}
      </div>


      <div style="margin:16px 0;">
        <h4 style="font-size:0.85rem;font-weight:800;border-bottom:1px solid #f1f5f9;padding-bottom:4px;margin-bottom:8px;">
          3. MÓDULO 3 — Triaje Clínico
        </h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
          <div><span style="color:#64748b;">SpO2</span> <strong>${STATE.spo2 !== null ? STATE.spo2 + "%" : "—"}</strong></div>
          <div><span style="color:#64748b;">FC</span> <strong>${STATE.fc !== null ? STATE.fc + " bpm" : "—"}</strong></div>
          <div><span style="color:#64748b;">PA Sistólica</span> <strong>${STATE.pasSistolica !== null ? STATE.pasSistolica + " mmHg" : "—"}</strong></div>
          <div><span style="color:#64748b;">PA Diastólica</span> <strong>${STATE.paDiastolica !== null ? STATE.paDiastolica + " mmHg" : "—"}</strong></div>
          <div><span style="color:#64748b;">FR</span> <strong>${STATE.fr !== null ? STATE.fr + " rpm" : "—"}</strong></div>
          <div><span style="color:#64748b;">Temperatura</span> <strong>${STATE.temperatura !== null ? STATE.temperatura + " °C" : "—"}</strong></div>
          <div><span style="color:#64748b;">Glucosa</span> <strong>${STATE.glucosa !== null ? STATE.glucosa + " mg/dL" : "—"}</strong></div>
          <div><span style="color:#64748b;">Glasgow</span> <strong>${STATE.glasgow !== null ? STATE.glasgow + "/15" : "—"}</strong></div>
          <div><span style="color:#64748b;">EVA Dolor</span> <strong>${STATE.eva}/10</strong></div>
          <div><span style="color:#64748b;">Antecedentes</span> <strong>${STATE.antecedentes ? "Sí" : "No"}</strong></div>
        </div>
        <div style="margin-top:8px;padding:10px;background:${STATE.prioridad ? ({"I":"#fff1f2","II":"#fff7ed","III":"#fefce8","IV":"#f0fdf4","V":"#eff6ff"}[STATE.prioridad]) : "#f8fafc"};border-radius:8px;">
          <strong>PRIORIDAD ${STATE.prioridad || "—"}</strong> — ${STATE.prioridad ? PRIORIDADES[STATE.prioridad].nombre : "Sin evaluar"}
          ${(STATE.prioridad === "I" || STATE.prioridad === "II") ? "<br><em style='font-size:0.78rem;'>⚖️ Aplica Ley 27604</em>" : ""}
        </div>
        <div style="margin-top:6px;"><span style="color:#64748b;">Motivo:</span> <strong>${STATE.motivoConsulta || "—"}</strong></div>
      </div>


      <div style="margin:16px 0;">
        <h4 style="font-size:0.85rem;font-weight:800;border-bottom:1px solid #f1f5f9;padding-bottom:4px;margin-bottom:8px;">
          4. MÓDULOS 4–7 — Hospitalización y Salida
        </h4>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f8fafc;"><span style="color:#64748b;">Cama asignada</span><span style="font-weight:600;">${STATE.camaAsignada || "—"}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f8fafc;"><span style="color:#64748b;">Firmante consentimiento</span><span style="font-weight:600;">${STATE.firmante || "—"}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#64748b;">Estado de salida</span><span style="font-weight:600;">${STATE.estadoSalida || "Sin registrar"}</span></div>
      </div>


      <div style="margin:16px 0;">
        <h4 style="font-size:0.85rem;font-weight:800;border-bottom:1px solid #f1f5f9;padding-bottom:4px;margin-bottom:8px;">
          5. FACTURACIÓN Y LIQUIDACIÓN HOSPITALARIA
        </h4>
        ${STATE.items_factura.length === 0 ? "<p style='color:#94a3b8;'>Sin servicios registrados</p>" :
          STATE.items_factura.map(i => `
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f8fafc;font-size:0.82rem;">
              <span>${i.servicio} <small style="color:#94a3b8;">(${i.categoria})</small></span>
              <span style="font-weight:600;">S/. ${i.costo.toFixed(2)}</span>
            </div>
          `).join("") + `
            <div style="margin-top:10px;padding-top:8px;border-top:1.5px solid #cbd5e1;font-size:0.82rem;">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;color:#475569;">
                <span>Subtotal Facturado (Bruto):</span>
                <strong>S/. ${liq.totalBruto.toFixed(2)}</strong>
              </div>
              ${liq.esPublico ? `
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;color:#16a34a;font-weight:700;">
                <span>Cobertura Seguro Estatal (100%):</span>
                <span>- S/. ${liq.coberturaSeguro.toFixed(2)}</span>
              </div>` : ''}
              ${liq.esEpsPrivado ? `
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;color:#0284c7;font-weight:700;">
                <span>Cobertura Plan EPS / Privado:</span>
                <span>- S/. ${liq.coberturaSeguro.toFixed(2)}</span>
              </div>` : ''}
              ${liq.copagoUrgencia > 0 ? `
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;color:#b45309;font-weight:700;">
                <span>Consulta Urgencia (P-III/IV/V):</span>
                <span>+ S/. ${liq.copagoUrgencia.toFixed(2)}</span>
              </div>` : ''}
              ${liq.subtotalFarmacia > 0 && liq.esEpsPrivado ? `
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;color:#b45309;font-weight:700;">
                <span>Coaseguro Farmacia EPS (10%):</span>
                <span>+ S/. ${liq.coaseguroFarmacia.toFixed(2)}</span>
              </div>` : ''}
              <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:1.05rem;font-weight:900;border-top:2px solid #0284c7;margin-top:6px;color:#0284c7;">
                <span>TOTAL A CARGO DEL PACIENTE:</span>
                <span style="color:${liq.totalPaciente === 0 ? '#16a34a' : '#0284c7'};">${liq.totalPaciente === 0 ? "S/. 0.00 (PAGO CERO)" : `S/. ${liq.totalPaciente.toFixed(2)}`}</span>
              </div>
              <div style="margin-top:6px;font-size:0.75rem;color:#475569;line-height:1.4;">
                ℹ️ ${liq.motivoLiquidacion}
              </div>
            </div>
          `
        }
      </div>


      <div style="margin-top:24px;display:flex;justify-content:space-between;border-top:2px solid #e2e8f0;padding-top:16px;">
        <div style="text-align:center;">
          <p style="margin-bottom:30px;border-bottom:1px solid #374151;padding-bottom:4px;"></p>
          <p><strong>Luis Guillermo Vásquez Valdivieso</strong></p>
          <p style="font-size:0.78rem;color:#64748b;">Desarrollador — UPP</p>
        </div>
        <div style="text-align:center;">
          <p style="margin-bottom:30px;border-bottom:1px solid #374151;padding-bottom:4px;"></p>
          <p><strong>Rodrigo Alonso Añazgo Farro</strong></p>
          <p style="font-size:0.78rem;color:#64748b;">Desarrollador — UPP</p>
        </div>
      </div>
    </div>
  `;


  document.getElementById("modalAuditoriaBody").innerHTML = html;
  document.getElementById("modalAuditoria").classList.add("open");
  document.getElementById("auditReportContent").innerHTML = `<p style="color:#15803d;font-size:0.85rem;">✅ Reporte generado. Presiona "Reporte de Auditoría" para verlo nuevamente.</p>`;
}


// ---------------------------------------------------------------------------
// 17. EVALUACIÓN COMPLETA
// ---------------------------------------------------------------------------
function evaluarPacienteCompleto() {
  // Sincronizar datos demograficos ingresados o editados por el usuario
  const elEdad = document.getElementById("edad_full");
  if (elEdad && elEdad.value) STATE.edad = parseInt(elEdad.value, 10);
  const elSexo = document.getElementById("sexo_full");
  if (elSexo && elSexo.value) STATE.sexo = elSexo.value;
  const elFechaNac = document.getElementById("fecha_nac_full");
  if (elFechaNac && elFechaNac.value) STATE.fechaNacimiento = elFechaNac.value;


  // Validación estricta de rangos biológicos
  const validacion = validarSignosVitalesEnVivo();
  if (!validacion.esValido) {
    mostrarErrorBiologicoEnPrioridad(validacion.errores);
    alert(
      "⛔ ATENCIÓN: FLUJO BLOQUEADO POR RANGOS BIOLÓGICOS INVÁLIDOS\n\n" +
      "No es posible continuar con la atención ni calcular la prioridad clínica.\n" +
      "Se detectaron los siguientes errores fisiológicos o de medición:\n\n" +
      validacion.errores.map(e => "  • " + e).join("\n") +
      "\n\nPor favor verifique el instrumento clínico (oxímetro, tensiómetro, termómetro, etc.) y corrija los valores marcados en rojo."
    );
    if (validacion.primerCampoInvalido) {
      validacion.primerCampoInvalido.scrollIntoView({ behavior: "smooth", block: "center" });
      validacion.primerCampoInvalido.focus();
    }
    return; // BLOQUEO TOTAL DEL FLUJO HOSPITALARIO
  }


  // Forzar recálculo
  recalcularPrioridad();


  if (!STATE.prioridad) {
    alert("⚠️ No se pudo determinar la prioridad. Ingrese al menos un signo vital o motivo de consulta válido.");
    return;
  }


  // Timestamps
  registrarTimestamp("evaluacion_completa");


  // Scroll al resultado
  const pd = document.getElementById("prioridad_display");
  if (pd) pd.scrollIntoView({ behavior: "smooth", block: "center" });


  // Abrir módulos relevantes
  ["mod3", "mod4"].forEach(id => {
    const body = document.getElementById(`body_${id}`);
    const arrow = document.getElementById(`arrow_${id}`);
    if (body && !body.classList.contains("open")) {
      body.classList.add("open");
      if (arrow) arrow.classList.add("open");
    }
  });


  // Sincronizar prioridad evaluada con Supabase y SQLite
  if (STATE.identificador) {
    try {
      sincronizarConSupabase(STATE.identificador, STATE.historiaClinica, STATE.nombreReniec, STATE.tipoSeguro, STATE.turno, `P-${STATE.prioridad}`);
    } catch (e) {}
  }
  // Recalcular liquidación de seguro según prioridad (Emergencia P1/P2 vs Urgencia P3/P4/P5)
  actualizarFactura();
  alert(`✅ Evaluación de Triaje completada con éxito.\n\n• Prioridad Asignada: P-${STATE.prioridad} (${STATE.prioridad ? PRIORIDADES[STATE.prioridad].nombre : "—"})\n\n🏷️ La Pulsera / Brazalete de Identificación y Prioridad con código de color y alergias ya está lista para imprimir.`);
  setTimeout(() => {
    if (confirm(`🏷️ ¿Desea imprimir ahora la Pulsera / Brazalete Hospitalario con código de color MINSA y advertencia de alergias?`)) {
      imprimirBrazalete();
    }
  }, 150);
}


// ---------------------------------------------------------------------------
// 18. IMPRIMIR BRAZALETE
// ---------------------------------------------------------------------------
/**
 * Impresión de Brazalete Térmico Hospitalario de Identificación del Paciente
 * Basado en Metas Internacionales de Seguridad del Paciente, NTS N° 042-MINSA y NTS N° 139-MINSA
 * Colores normativos:
 *   - Blanco/Estándar: Identificación unívoca.
 *   - Rojo: ALERGIA CONOCIDA (Alerta crítica obligatoria).
 *   - Amarillo: RIESGO DE CAÍDAS (Adulto mayor >=65a, pediátrico o sensorio alterado).
 *   - Banda de Triaje: Color de categorización I (Rojo), II (Naranja), III (Amarillo), IV (Verde), V (Azul).
 */
function imprimirBrazalete() {
  if (typeof imprimirBrazaleteDirecto === 'function') {
    imprimirBrazaleteDirecto();
    return;
  }
  const prio = STATE.prioridad || "III";
  const coloresPrio = { "I": "#dc2626", "II": "#ea580c", "III": "#ca8a04", "IV": "#16a34a", "V": "#2563eb" };
  const nombresPrio = { 
    "I": "P-I ROJO (SHOCK TRAUMA / VITAL)", 
    "II": "P-II NARANJA (URGENCIA MAYOR)", 
    "III": "P-III AMARILLO (URGENCIA)", 
    "IV": "P-IV VERDE (URGENCIA MENOR)", 
    "V": "P-V AZUL (NO URGENTE)" 
  };
  const colorBanda = coloresPrio[prio] || "#0284c7";
  const nombrePrio = nombresPrio[prio] || `PRIORIDAD ${prio}`;

  const alergiasInput = document.getElementById("alergias_full")?.value?.trim() || STATE.alergias || "";
  const tieneAlergias = alergiasInput && !alergiasInput.toLowerCase().includes("niega") && !alergiasInput.toLowerCase().includes("ninguna");

  const edadNum = parseInt(STATE.edad || document.getElementById("edad_full")?.value) || 30;
  const glasgowNum = parseFloat(STATE.glasgow || document.getElementById("glasgow_full")?.value) || 15;
  const esRiesgoCaidas = (edadNum >= 65 || edadNum <= 10 || glasgowNum < 15 || STATE.esPediatrico);

  const esNN = (STATE.identificador && STATE.identificador.startsWith("NN-")) || STATE.alertaPnpSs;

  const fechaActual = new Date().toLocaleDateString();
  const horaActual = STATE.horaLlegada || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const nombrePaciente = (STATE.nombreReniec || STATE.identificador || "PACIENTE POR IDENTIFICAR").toUpperCase();
  const hcPaciente = STATE.historiaClinica || "HC-PROVISIONAL";
  const docPaciente = STATE.identificador || "S/D";
  const sexoPaciente = STATE.sexo || document.getElementById("sexo_full")?.value || "M";

  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir la pulsera."); return; }

  w.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Brazalete Hospitalario — ${hcPaciente}</title>
      <style>
        @page { size: landscape; margin: 0; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          margin: 0;
          padding: 24px;
          background: #e2e8f0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .instruction-box {
          margin-bottom: 16px;
          font-size: 13px;
          color: #475569;
          text-align: center;
        }
        /* FORMATO DE PULSERA TÉRMICA ESTÁNDAR (28 cm x 2.8 cm simulado) */
        .wristband-strip {
          width: 820px;
          height: 135px;
          background: #ffffff;
          border: 2px solid #94a3b8;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          display: flex;
          position: relative;
          overflow: hidden;
        }
        /* BANDA LATERAL DE TRIAJE */
        .band-triage {
          width: 65px;
          background: ${colorBanda};
          color: #ffffff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          text-align: center;
          padding: 4px;
          box-sizing: border-box;
          border-right: 2px solid rgba(0,0,0,0.15);
        }
        .band-triage .prio-code {
          font-size: 26px;
          line-height: 1;
        }
        .band-triage .prio-desc {
          font-size: 9px;
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          letter-spacing: 1px;
          margin-top: 6px;
          text-transform: uppercase;
        }
        /* CUERPO CENTRAL DE IDENTIFICACIÓN */
        .wristband-body {
          flex: 1;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border-right: 2px dashed #cbd5e1;
        }
        .inst-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #cbd5e1;
          padding-bottom: 4px;
        }
        .inst-name {
          font-size: 11px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: 0.5px;
        }
        .service-name {
          font-size: 10px;
          font-weight: 700;
          color: #0284c7;
        }
        .patient-main {
          margin: 4px 0;
        }
        .patient-name {
          font-size: 17px;
          font-weight: 900;
          color: #0f172a;
          line-height: 1.1;
          letter-spacing: 0.2px;
        }
        .patient-details {
          display: flex;
          gap: 16px;
          font-size: 11px;
          color: #334155;
          margin-top: 4px;
          font-weight: 600;
        }
        .hc-badge {
          background: #0f172a;
          color: #ffffff;
          padding: 1px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 11px;
          font-weight: 800;
        }
        /* BANDAS DE RIESGO SANITARIO */
        .risk-bars {
          display: flex;
          gap: 8px;
          margin-top: 4px;
        }
        .bar-allergy {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .bar-allergy.danger {
          background: #dc2626;
          color: #ffffff;
          animation: pulse 1.5s infinite;
        }
        .bar-allergy.ok {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
        }
        .bar-falls {
          background: #eab308;
          color: #713f12;
          font-size: 10px;
          font-weight: 900;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .bar-nn {
          background: #7f1d1d;
          color: #fecaca;
          font-size: 10px;
          font-weight: 900;
          padding: 2px 8px;
          border-radius: 4px;
        }
        /* CÓDIGOS DE BARRAS Y QR */
        .wristband-barcode-area {
          width: 145px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #fafafa;
        }
        .barcode-lines {
          width: 120px;
          height: 48px;
          background: repeating-linear-gradient(90deg, #000 0, #000 2px, #fff 2px, #fff 4px, #000 4px, #000 7px, #fff 7px, #fff 9px, #000 9px, #000 13px, #fff 13px, #fff 15px);
          border-radius: 2px;
        }
        .barcode-text {
          font-family: monospace;
          font-size: 9px;
          color: #334155;
          margin-top: 3px;
          font-weight: 700;
        }
        .seal-minsa {
          font-size: 8px;
          color: #64748b;
          text-align: center;
          margin-top: 4px;
        }
        @media print {
          body { background: #ffffff; padding: 0; }
          .instruction-box { display: none; }
          .wristband-strip { box-shadow: none; border: 1px solid #000; }
        }
      </style>
    </head>
    <body>
      <div class="instruction-box">
        <strong>PULSERA TÉRMICA OFICIAL DE IDENTIFICACIÓN DE PACIENTE — NTS N° 042 / NTS N° 139-MINSA</strong><br>
        Imprima y coloque inmediatamente en la muñeca dominante del paciente. No retirar durante su estancia hospitalaria.
      </div>

      <div class="wristband-strip">
        <!-- BANDA LATERAL CON COLOR DE TRIAJE -->
        <div class="band-triage">
          <div class="prio-code">P-${prio}</div>
          <div class="prio-desc">${nombrePrio}</div>
        </div>

        <!-- DATOS DEL PACIENTE -->
        <div class="wristband-body">
          <div class="inst-header">
            <span class="inst-name">HOSPITAL REGIONAL DOCENTE UPP</span>
            <span class="service-name">SERVICIO DE EMERGENCIA · NIVEL III-1</span>
          </div>

          <div class="patient-main">
            <div class="patient-name">${nombrePaciente}</div>
            <div class="patient-details">
              <span><strong>HC:</strong> <span class="hc-badge">${hcPaciente}</span></span>
              <span><strong>DOC / DNI:</strong> ${docPaciente}</span>
              <span><strong>EDAD:</strong> ${edadNum} años</span>
              <span><strong>SEXO:</strong> ${sexoPaciente}</span>
              <span><strong>INGRESO:</strong> ${fechaActual} ${horaActual}</span>
            </div>
          </div>

          <!-- SISTEMA DE ALERTAS POR COLOR (METAS DE SEGURIDAD MINSA) -->
          <div class="risk-bars">
            <div class="bar-allergy ${tieneAlergias ? 'danger' : 'ok'}">
              ${tieneAlergias ? `🔴 ALERGIA CRÍTICA: ${alergiasInput.toUpperCase()}` : `⚪ ALERGIAS: NIEGA`}
            </div>

            ${esRiesgoCaidas ? `<div class="bar-falls">🟡 RIESGO DE CAÍDAS (ALTO)</div>` : ''}
            ${esNN ? `<div class="bar-nn">🚨 PACIENTE NN (ALERTA POLICIAL D.S. 016-2002-SA)</div>` : ''}
            ${STATE.esAccidenteTransito ? `<div style="background:#ea580c;color:#fff;font-size:10px;font-weight:900;padding:2px 8px;border-radius:4px;">🚗 SOAT ACTIVO</div>` : ''}
          </div>
        </div>

        <!-- CÓDIGO DE BARRAS DE TRAZABILIDAD -->
        <div class="wristband-barcode-area">
          <div class="barcode-lines"></div>
          <div class="barcode-text">*${hcPaciente}*</div>
          <div class="seal-minsa">MINSA · METAS SEGURIDAD</div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 350);
        };
      </script>
    </body>
    </html>
  `);
  w.document.close();
}
async function grabarAtencionCompleta() {
  const val = (typeof window.validarPacienteYDatosParaFlujo === "function")
    ? window.validarPacienteYDatosParaFlujo("CAJA")
    : null;

  if (val && !val.valido) {
    return;
  }

  const nombreValido = (STATE.nombreReniec || STATE.identificador || "").trim();
  const esGenerico = !nombreValido || nombreValido.startsWith("Ticket T-") || nombreValido.startsWith("Paciente #") || nombreValido === "PACIENTE POR IDENTIFICAR";
  const tienePrioridad = Boolean(STATE.prioridad);

  if ((esGenerico && !STATE.esNN) || !tienePrioridad) {
    alert("⚠️ ATENCIÓN INCOMPLETA:\n\nNo hay paciente asignado o no se han ingresado datos clínicos en la atención (DNI/RENIEC y Prioridad I-V requeridos por NTS N° 042-MINSA).\nNo se puede finalizar el flujo ni facturar.");
    irAModulo(1);
    return;
  }
  const fechaActual = new Date();
  const folioAtencion = `FOLIO-${fechaActual.getFullYear()}${(fechaActual.getMonth()+1).toString().padStart(2,"0")}${fechaActual.getDate().toString().padStart(2,"0")}-${Math.floor(1000 + Math.random()*9000)}`;
  const liq = calcularLiquidacionSeguro();
  const alergiasActuales = document.getElementById("alergias_full")?.value?.trim() || STATE.alergias || "Niega alergias medicamentosas conocidas";
  const episodioCompleto = {
    folio: folioAtencion,
    fecha: fechaActual.toLocaleDateString(),
    hora: fechaActual.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    fecha_hora: fechaActual.toLocaleString(),
    identificador: STATE.identificador,
    historia_clinica: STATE.historiaClinica,
    nombre_completo: STATE.nombreReniec || STATE.identificador,
    edad: STATE.edad || document.getElementById("edad_full")?.value || null,
    sexo: STATE.sexo || document.getElementById("sexo_full")?.value || "M",
    alergias: alergiasActuales,
    tipo_seguro: STATE.tipoSeguro || "Particular",
    lugar_atencion: liq.lugarAtencion,
    modalidad_ingreso: STATE.modalidadIngreso || "A pie",
    ticket: STATE.turno || "T-01",
    hora_llegada: STATE.horaLlegada || fechaActual.toLocaleTimeString(),
    motivo_consulta: document.getElementById("motivo_full")?.value?.trim() || STATE.motivoConsulta || "Evaluación clínica de emergencia",
    prioridad: STATE.prioridad ? `P-${STATE.prioridad} (${PRIORIDADES[STATE.prioridad]?.nombre})` : "Por evaluar",
    color_prioridad: STATE.prioridad ? ({"I":"#dc2626","II":"#ea580c","III":"#ca8a04","IV":"#16a34a","V":"#2563eb"}[STATE.prioridad] || "#0284c7") : "#0284c7",
    destino_clinico: STATE.prioridad ? PRIORIDADES[STATE.prioridad]?.destino : "Por asignar",
    signos_vitales: {
      spo2: document.getElementById("spo2_full")?.value || "—",
      fc: document.getElementById("fc_full")?.value || "—",
      fr: document.getElementById("fr_full")?.value || "—",
      pas: document.getElementById("pas_full")?.value || "—",
      pad: document.getElementById("pad_full")?.value || "—",
      pa: (document.getElementById("pas_full") && document.getElementById("pad_full")) ? `${document.getElementById("pas_full").value}/${document.getElementById("pad_full").value}` : "—",
      temp: document.getElementById("temp_full")?.value || "—",
      glucosa: document.getElementById("glucosa_full")?.value || "—",
      glasgow: document.getElementById("glasgow_full")?.value || "—",
      dolor: document.getElementById("eva_full")?.value || "0"
    },
    cama_asignada: STATE.camaAsignada || "Observación Adultos",
    examenes_realizados: STATE.items_factura.filter(i => i.categoria !== "Farmacia"),
    medicamentos_despachados: STATE.items_factura.filter(i => i.categoria === "Farmacia"),
    total_facturado: liq.totalPaciente,
    cobertura_info: liq.totalPaciente === 0 ? `Cubierto 100% por ${STATE.tipoSeguro || "Seguro"} (Pago Cero)` : `Copago paciente: S/. ${liq.totalPaciente.toFixed(2)}`,
    estado_salida: STATE.estadoSalida || "En observación hospitalaria",
    firmante: STATE.firmante || "Lic. Enfermería de Turno — UPP",
    liquidacion: liq,
    origen_evento: STATE.tipoOrigenEvento,
    es_accidente_transito: STATE.esAccidenteTransito,
    soat_placa: STATE.soatPlaca,
    soat_aseguradora: STATE.soatAseguradora,
    soat_poliza: STATE.soatPoliza,
    soat_fuga: STATE.soatVehiculoFuga,
    cie10_codigo: STATE.cie10Codigo,
    cie10_descripcion: STATE.cie10Descripcion,
    destino_post_topico: STATE.destinoPostTopico,
    horas_observacion: STATE.horasObservacion,
    balance_hidrico_neto: STATE.balanceNetoMl,
    prioridad_uci: STATE.prioridadUci,
    puntaje_abcde: STATE.desempateScore,
    modalidad_egreso: STATE.modalidadEgreso,
    bloqueo_sinadef: STATE.bloqueoSinadef,
    auditoria_normativa: "Cumple NTS N° 042-MINSA, Ley N° 27604, Ley N° 29414, D.S. 024-2002-MTC y CPP Art. 195"
  };
  // 1. Guardar en memoria local global (Historial de Episodios UPP)
  try {
    const rawH = localStorage.getItem(STORAGE_KEY_HISTORIAL_EPISODIOS) || localStorage.getItem("UPP_HISTORIAL_EPISODIOS") || "[]";
    const historial = JSON.parse(rawH);
    historial.unshift(episodioCompleto);
    localStorage.setItem(STORAGE_KEY_HISTORIAL_EPISODIOS, JSON.stringify(historial));
    localStorage.setItem("UPP_HISTORIAL_EPISODIOS", JSON.stringify(historial));
  } catch (e) {}
  // 2. Guardar en el expediente maestro del paciente (vinculando permanentemente alergias y este episodio)
  try {
    const master = cargarPacientesMaster();
    const cleanId = normalizarClavePaciente(STATE.identificador);
    const cleanHc = normalizarClavePaciente(STATE.historiaClinica);
    let matchKey = null;
    for (const [k, p] of Object.entries(master)) {
      if ((cleanId && normalizarClavePaciente(p.identificador) === cleanId) || (cleanHc && normalizarClavePaciente(p.historia_clinica) === cleanHc)) {
        matchKey = k;
        break;
      }
    }
    if (!matchKey) {
      matchKey = STATE.identificador;
      master[matchKey] = {
        identificador: STATE.identificador,
        historia_clinica: STATE.historiaClinica,
        nombre_completo: STATE.nombreReniec || STATE.identificador,
        fecha_nacimiento: document.getElementById("fecha_nac_full")?.value || "",
        edad: STATE.edad,
        sexo: STATE.sexo,
        tipo_seguro: STATE.tipoSeguro || "Particular",
        alergias: alergiasActuales,
        antecedentes: "Registrado en servicio de emergencia",
        episodios: []
      };
    }
    // Actualizar alergias permanentes en el expediente maestro
    master[matchKey].alergias = alergiasActuales;
    if (document.getElementById("fecha_nac_full")?.value) master[matchKey].fecha_nacimiento = document.getElementById("fecha_nac_full").value;
    if (STATE.edad) master[matchKey].edad = STATE.edad;
    if (STATE.sexo) master[matchKey].sexo = STATE.sexo;
    if (STATE.tipoSeguro) master[matchKey].tipo_seguro = STATE.tipoSeguro;
    if (!Array.isArray(master[matchKey].episodios)) master[matchKey].episodios = [];
    master[matchKey].episodios.unshift(episodioCompleto);
    guardarPacientesMaster(master);
  } catch (e) {}
  // 3. Sincronizar en la nube de Supabase
  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
    try {
      await sincronizarConSupabase(
        STATE.identificador,
        STATE.historiaClinica,
        STATE.nombreReniec || STATE.identificador,
        STATE.tipoSeguro,
        STATE.turno,
        `P-${STATE.prioridad || "X"}`
      );
    } catch (e) {}
  }
  // 4. Sincronizar en base de datos SQLite local
  try {
    fetch(`/api/hc?identificador=${encodeURIComponent(STATE.identificador)}&nombre=${encodeURIComponent(STATE.nombreReniec || STATE.identificador)}`).catch(() => {});
  } catch (e) {}
  // Liberar cama asignada al concluir la atención médica completa y actualizar todos los indicadores
  liberarCamaTotalPaciente(pacienteActivoId, "Atención Médica Grabada y Concluida");

  // 5. Desplegar comprobante visual de atención guardada
  mostrarModalRegistroExitoso(episodioCompleto);
}
function mostrarModalRegistroExitoso(ep) {
  const modal = document.getElementById("modal_registro_guardado");
  const body = document.getElementById("modal_registro_guardado_body");
  if (!modal || !body) return;
  const liq = ep.liquidacion;
  body.innerHTML = `
    <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed #86efac;padding-bottom:8px;margin-bottom:10px;">
        <div>
          <span style="font-size:0.75rem;font-weight:700;color:#166534;text-transform:uppercase;">N° de Folio Hospitalario</span>
          <div style="font-size:1.15rem;font-weight:900;color:#14532d;font-family:monospace;">${ep.folio}</div>
        </div>
        <div style="text-align:right;">
          <span class="hc-pill-tag" style="font-size:1rem;padding:4px 12px;">${ep.historia_clinica}</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;font-size:0.82rem;">
        <div><strong>Paciente:</strong> ${ep.nombre_completo}</div>
        <div><strong>DNI/ID:</strong> ${ep.identificador}</div>
        <div><strong>Fecha y Hora:</strong> ${ep.fecha_hora}</div>
        <div><strong>Ticket de Turno:</strong> ${ep.ticket}</div>
        <div><strong>Prioridad de Triaje:</strong> <span style="font-weight:800;color:#0284c7;">${ep.prioridad}</span></div>
        <div><strong>Destino Clínico:</strong> ${ep.destino_clinico}</div>
        <div><strong>Establecimiento:</strong> ${ep.lugar_atencion}</div>
        <div><strong>Alergias en HC:</strong> <span style="color:#b91c1c;font-weight:800;">${ep.alergias}</span></div>
      </div>
    </div>
    <!-- Resumen Financiero -->
    <div style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:16px;">
      <h4 style="margin:0 0 10px;font-size:0.88rem;color:#0f172a;">💰 Liquidación Económica del Episodio</h4>
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;">
        <span>Cuentas Facturadas (Servicios + Medicamentos):</span>
        <span style="font-weight:700;">S/. ${liq.totalBruto.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;color:#16a34a;font-weight:700;">
        <span>Cobertura Asumida por Aseguradora / EPS:</span>
        <span>- S/. ${liq.coberturaSeguro.toFixed(2)}</span>
      </div>
      ${liq.copagoUrgencia > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;color:#b45309;">
        <span>Deducible Consulta Urgencia EPS:</span>
        <span>S/. ${liq.copagoUrgencia.toFixed(2)}</span>
      </div>` : ""}
      ${liq.coaseguroFarmacia > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;color:#b45309;">
        <span>Coaseguro Farmacéutico EPS (10%):</span>
        <span>S/. ${liq.coaseguroFarmacia.toFixed(2)}</span>
      </div>` : ""}
      <div style="border-top:1.5px solid #cbd5e1;padding-top:8px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:0.95rem;">TOTAL A PAGAR POR EL PACIENTE:</strong>
        <span style="font-size:1.2rem;font-weight:900;color:${liq.totalPaciente === 0 ? "#16a34a" : "#0284c7"};">
          ${liq.totalPaciente === 0 ? "S/. 0.00 (PAGO CERO — CUBIERTO AL 100%)" : `S/. ${liq.totalPaciente.toFixed(2)}`}
        </span>
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px;flex-wrap:wrap;">
      <button type="button" class="btn-full-secondary" style="padding:8px 14px;font-size:0.82rem;"
        onclick="document.getElementById('modal_registro_guardado').classList.remove('open','show');visualizarHistoriaClinica('${encodeURIComponent(JSON.stringify({identificador: ep.identificador, historia_clinica: ep.historia_clinica, nombre_completo: ep.nombre_completo}))}')">
        👁️ Ver Expediente Completo (con Histórico)
      </button>
      <button type="button" class="btn-full-secondary" style="padding:8px 14px;font-size:0.82rem;"
        onclick="imprimirFichaHistoriaClinica('${encodeURIComponent(JSON.stringify({identificador: ep.identificador, historia_clinica: ep.historia_clinica, nombre_completo: ep.nombre_completo}))}')">
        🖨️ Imprimir Ficha Oficial
      </button>
      <button type="button" class="btn-full-primary" style="background:#16a34a;padding:8px 16px;font-size:0.82rem;font-weight:700;border:none;border-radius:8px;color:#ffffff;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 6px rgba(22,163,74,0.25);"
        onclick="cerrarModalRegistroGuardado()">
        🔄 Finalizar Flujo y Empezar Nuevamente
      </button>
    </div>
    <div style="text-align:center;font-size:0.75rem;color:#64748b;">
      ✓ Atención registrada y acumulada con éxito en la Historia Clínica <strong>${ep.historia_clinica}</strong>. Al terminar el flujo se reiniciará la página para el siguiente paciente.
    </div>
  `;
  modal.classList.add("open"); modal.classList.add("show"); modal.style.setProperty("display", "flex", "important");
}

function cerrarModalRegistroGuardado() {
  const modal = document.getElementById("modal_registro_guardado");
  if (modal) {
    modal.classList.remove("open", "show");
    modal.style.setProperty("display", "none", "important");
  }
  if (typeof mostrarToastCola === "function") {
    mostrarToastCola("🔄 Flujo finalizado con éxito. Reiniciando página para nuevo paciente...");
  }
  setTimeout(() => {
    window.location.reload();
  }, 400);
}
window.cerrarModalRegistroGuardado = cerrarModalRegistroGuardado;
function resetSimulador() {
  if (!confirm("¿Iniciar nuevo paciente? Se perderán los datos actuales.")) return;


  liberarCamaTotalPaciente(pacienteActivoId, "Reinicio de Atención / Nuevo Paciente");

  // Reset STATE
  Object.assign(STATE, {
    modalidadIngreso: "A pie", identificador: "", estadoRegistrado: "Por confirmar",
    historiaClinica: "—", accionHc: "", nombreReniec: null, alertaPnpSs: false,
    edad: null, sexo: null, grupoSanguineo: null, alergias: null,
    horaLlegada: null, turno: null, tipoSeguro: null, validacionManual: null,
    numerFua: null, acreditadoEsSalud: null, porcentajeCopago: null,
    spo2: null, fc: null, pasSistolica: null, paDiastolica: null,
    fr: null, temperatura: null, glucosa: null, glasgow: null, eva: 0,
    antecedentes: false, motivoConsulta: "", prioridad: null, colorPrioridad: null,
    camaAsignada: null, items_factura: [], rutaActual: 0, estadoSalida: null,
    firmante: null, firmaTiempo: null, ts: {},
  });


  // Reset DOM
  document.getElementById("ident_full").value = "";
  document.getElementById("hora_full").value = "";
  document.getElementById("motivo_full").value = "";
  ["spo2_full","fc_full","pas_full","pad_full","fr_full","temp_full","glucosa_full","glasgow_full"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("eva_full").value = "0";
  document.getElementById("eva_range").value = "0";
  document.getElementById("eva_label").textContent = "Sin dolor";


  ["ant_cardio","ant_resp","ant_diab","ant_neuro"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });


  document.getElementById("hc_badge_estado").textContent = "Por confirmar";
  document.getElementById("hc_badge_estado").className = "badge-estado badge-conf";
  document.getElementById("hc_code_display").textContent = "—";
  document.getElementById("hc_accion_display").textContent = "Ingrese un identificador...";
  document.getElementById("alerta_nn")?.classList.remove("visible");
  document.getElementById("apisperu_panel").classList.remove("visible");
  document.getElementById("prioridad_display").classList.remove("visible");
  document.getElementById("ley27604_banner").classList.remove("visible");
  document.getElementById("ticket_display").textContent = "🎫 Ticket: —";
  document.getElementById("camaAsignadaDisplay").style.display = "none";
  document.getElementById("salida_display").style.display = "none";
  document.getElementById("firma_timestamp").textContent = "";
  document.getElementById("firma_consentimiento").value = "";
  document.getElementById("seguro_consolidado").textContent = "Sin registrar (Pendiente de Acreditación)";
  const boxPideReset = document.getElementById("pide_acreditacion_box");
  if (boxPideReset) boxPideReset.style.display = "none";
  refrescarCaptchaSeguro();


  // Reset modalidad
  document.querySelectorAll(".modalidad-btn").forEach((b, i) => b.classList.toggle("selected", i === 0));


  // Reset stocks visuales (sin resetear el stock real entre pacientes en la misma sesión)
  actualizarFactura();
  renderizarRutaClinica("III");
  renderizarStockCamas();


  window.scrollTo({ top: 0, behavior: "smooth" });
}


// ---------------------------------------------------------------------------
// 20. UTILIDADES
// ---------------------------------------------------------------------------
function registrarTimestamp(evento) {
  STATE.ts[evento] = new Date().toLocaleTimeString();
}


// ---------------------------------------------------------------------------
// 21. SERVIDOR PYTHON (retrocompatibilidad)
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const badge = document.getElementById("serverStatusBadge");
  const text = document.getElementById("serverStatusText");
  if (!badge || !text) return;


  if (window.location.protocol === "file:") {
    badge.className = "server-badge offline";
    text.textContent = "Modo Local Autónomo (Navegador)";
    return;
  }


  fetch("/api/health")
    .then(r => r.json())
    .then(d => {
      if (d.status === "ok") {
        badge.classList.remove("offline");
        text.textContent = "Servidor Python Activo (API REST)";
      }
    })
    .catch(() => {
      badge.classList.add("offline");
      text.textContent = "Modo Local Autónomo (Navegador)";
    });
});




// ---------------------------------------------------------------------------
// NAVEGACIÓN Y SINCRONIZACIÓN DE PANTALLA DIVIDIDA (HIS 8 MÓDULOS)
// ---------------------------------------------------------------------------
let moduloActivoActual = 1;


function irAModulo(num) {
  moduloActivoActual = num;

  // Sincronizar automáticamente con fases de Cabina Cockpit
  if (window.COCKPIT && typeof window.COCKPIT.irAFase === "function") {
    if (num === 1 || num === 2) window.COCKPIT.irAFase(1);
    else if (num === 3) window.COCKPIT.irAFase(2);
    else if (num >= 4 && num <= 7) window.COCKPIT.irAFase(3);
    else if (num === 8) window.COCKPIT.irAFase(4);
  }

  // 1. Actualizar estados de botones en Navbar Superior, Stepper y Canvas
  for (let i = 1; i <= 8; i++) {
    const btnDrawer = document.getElementById(`btnStepDrawer_${i}`);
    if (btnDrawer) btnDrawer.classList.toggle("active", i === num);

    const btnTop = document.getElementById(`btnStepTop_${i}`);
    if (btnTop) btnTop.classList.toggle("active", i === num);

    const canvasNode = document.getElementById(`full_step_${i}`);
    if (canvasNode) {
      canvasNode.classList.toggle("node-active", i === num);
      canvasNode.classList.toggle("active", i === num);
    }
  }

  // 2. Ejecutar ganchos específicos por módulo
  if (num === 5) {
    try { renderizarMonitorObservacionModulo5(); } catch(e){}
    try { actualizarEstanciaObservacion(STATE.horasObservacion || 6); } catch(e){}
    try { calcularBalanceHidrico(); } catch(e){}
  }
  if (num === 6) {
    try { renderizarTableroCamasYQuirofanos(); } catch(e){}
    try { calcularPuntajePrelacionABCDE(); } catch(e){}
    try { renderizarStockCamas(); } catch(e){}
  }
  if (num === 7) {
    try { verificarCandadoLegalSinadef(); } catch(e){}
  }
  if (num === 8) {
    try { actualizarFactura(); } catch(e){}
  }

  // 3. Abrir y desplazar hacia el módulo objetivo
  const targetSec = document.getElementById(`sec_mod${num}`);
  const targetBody = document.getElementById(`body_mod${num}`);
  const targetArrow = document.getElementById(`arrow_mod${num}`);

  if (targetBody) {
    targetBody.style.setProperty("display", "block", "important");
    targetBody.classList.add("open");
    if (targetArrow) targetArrow.classList.add("open");
  }

  if (typeof actualizarVistaModoTabs === "function") {
    actualizarVistaModoTabs(num);
  }

  if (targetSec) {
    try {
      targetSec.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {}
  } else if (targetBody && targetBody.previousElementSibling) {
    try {
      targetBody.previousElementSibling.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {}
  }
}


function moduloAnterior() {
  if (moduloActivoActual > 1) {
    irAModulo(moduloActivoActual - 1);
  }
}



// ---------------------------------------------------------------------------
// SALTO INTELIGENTE Y TRÁNSITO ASISTENCIAL DESDE MÓDULO 4 (NTS N° 042-MINSA)
// ---------------------------------------------------------------------------
function avanzarDesdeModulo4() {
  const prio = STATE.prioridad;
  const dest = STATE.destinoPostTopico;

  if (prio === "IV" || prio === "V" || dest === "alta") {
    alert(`🩺 Prioridad ${prio || 'IV/V'} (No Crítica) o Alta Directa:\n\nConforme a la Norma Técnica de Salud NTS N° 042-MINSA, esta condición no requiere hospitalización ni camas de observación.\nEl paciente salta los Módulos 5 y 6 directo al Módulo 7 (Egreso y Epicrisis).`);
    irAModulo(7);
  } else if (dest === "quirofano_uci" || prio === "I") {
    alert("🩺 Prioridad I o Criterio Quirúrgico:\nPase directo a Quirófano SOP o Cama Crítica (Módulo 6).");
    irAModulo(6);
  } else {
    irAModulo(5);
  }
}
window.avanzarDesdeModulo4 = avanzarDesdeModulo4;

function moduloSiguiente() {
  if (moduloActivoActual < 8) {
    irAModulo(moduloActivoActual + 1);
  }
}


// Inicializar todos los módulos colapsados por defecto en el primer render
document.addEventListener("DOMContentLoaded", () => {
  if (typeof cerrarTodosLosModulos === "function") {
    cerrarTodosLosModulos();
  }
  moduloActivoActual = 1;
  const b1 = document.getElementById("body_mod1");
  const a1 = document.getElementById("arrow_mod1");
  if (b1) {
    b1.classList.add("open");
    b1.style.display = "block";
  }
  if (a1) a1.classList.add("open");
  const btnTop = document.getElementById("btnStepTop_1");
  if (btnTop) btnTop.classList.add("active");
});


// ---------------------------------------------------------------------------
// 22. OBSERVER SCROLL SPY PARA MENÚ SUPERIOR ANCLADO (1.ID ... 8.FACTURA)
// ---------------------------------------------------------------------------
function initScrollSpySteps() {
  window.addEventListener("scroll", () => {
    const navBar = document.getElementById("topStepsNavbar");
    if (!navBar) return;
    const scrollPos = window.scrollY + 160;
    for (let i = 8; i >= 1; i--) {
      const sec = document.getElementById(`body_mod${i}`)?.closest(".module-section");
      if (sec && sec.offsetTop <= scrollPos) {
        for (let j = 1; j <= 8; j++) {
          const btn = document.getElementById(`btnStepTop_${j}`);
          if (btn) btn.classList.toggle("active", j === i);
        }
        break;
      }
    }
  }, { passive: true });
}


if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initScrollSpySteps);
} else {
  initScrollSpySteps();
}


// ==============================================================================
// 23. SUITE DE FUNCIONES DE AUDITORÍA Y NORMATIVA PERUANA (MÓDULOS 1 AL 8)
// Sustentos: Ley 26842, Ley 27604, Ley 29414, NTS 042-MINSA, D.S. 024-2002-MTC
// Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
// ==============================================================================

// --- MÓDULO 1: ENFERMERÍA DE TRIAJE ---

// ---------------------------------------------------------------------------
// SELECTORES DINÁMICOS DE ENTORNO ASISTENCIAL Y PERSISTENCIA EN BASE DE DATOS (SUPABASE)
// ---------------------------------------------------------------------------
async function buscarSeguroPacienteEnBd(identificador) {
  if (!identificador) return null;
  const cleanId = String(identificador).trim().toLowerCase();
  const dniMatch = cleanId.match(/\d{8}/);
  const numDni = dniMatch ? dniMatch[0] : cleanId;

  // 1. Consultar primero en localStorage (caché local del cliente, ultrarrápida y consistente)
  try {
    const loc = localStorage.getItem("seguro_asignado_" + numDni);
    if (loc && loc !== "null" && loc !== "undefined" && loc !== "None" && loc !== "Seguro por confirmar") {
      console.log(`💾 localStorage: Seguro recordado para DNI ${numDni}:`, loc);
      return loc;
    }
  } catch (e) {}

  // 2. Consultar en Supabase historias_clinicas priorizando el registro MÁS RECIENTE (order=id.desc&limit=1)
  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.eq.${encodeURIComponent(numDni)},identificador.ilike.*${encodeURIComponent(numDni)}*)&select=tipo_seguro,id&order=id.desc&limit=1`, {
        headers: {
          "apikey": SUPABASE_CONFIG.key,
          "Authorization": `Bearer ${SUPABASE_CONFIG.key}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0 && rows[0].tipo_seguro && rows[0].tipo_seguro !== "None" && rows[0].tipo_seguro !== "Seguro por confirmar") {
          console.log(`☁️ Supabase: Seguro recordado para DNI ${numDni} (fila id ${rows[0].id}):`, rows[0].tipo_seguro);
          try { localStorage.setItem("seguro_asignado_" + numDni, rows[0].tipo_seguro); } catch(e){}
          return rows[0].tipo_seguro;
        }
      }
    } catch (e) {
      console.warn("Aviso: Supabase consulta seguro:", e);
    }
  }

  // 3. Consultar en pacientes_master
  try {
    const master = cargarPacientesMaster();
    if (master[numDni]?.tipo_seguro) return master[numDni].tipo_seguro;
    for (const [k, p] of Object.entries(master)) {
      if ((k.includes(numDni) || p.identificador?.includes(numDni)) && p.tipo_seguro) {
        return p.tipo_seguro;
      }
    }
  } catch (e) {}

  return null;
}

async function guardarSeguroPacienteEnBd(identificador, nroHc, nombre, tipoSeguro) {
  if (!identificador || !tipoSeguro) return;
  const cleanId = String(identificador).trim().toLowerCase();
  const dniMatch = cleanId.match(/\d{8}/);
  const numDni = dniMatch ? dniMatch[0] : cleanId;

  // 1. Guardar en localStorage para persistencia inmediata y consistente en el cliente
  try {
    localStorage.setItem("seguro_asignado_" + numDni, tipoSeguro);
  } catch (e) {}

  // 2. Actualizar en pacientes_master
  try {
    const master = cargarPacientesMaster();
    if (!master[numDni]) {
      master[numDni] = {
        identificador: numDni,
        historia_clinica: nroHc || `HC-2026-${numDni.slice(-3)}`,
        nombre_completo: nombre || numDni,
        tipo_seguro: tipoSeguro,
        episodios: []
      };
    } else {
      master[numDni].tipo_seguro = tipoSeguro;
      if (nombre) master[numDni].nombre_completo = nombre;
      if (nroHc) master[numDni].historia_clinica = nroHc;
    }
    guardarPacientesMaster(master);
  } catch (e) {}

  // 3. Sincronizar en Supabase actualizando TODAS las filas que coincidan con este DNI
  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
    try {
      const resPatch = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.eq.${encodeURIComponent(numDni)},identificador.ilike.*${encodeURIComponent(numDni)}*)`, {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_CONFIG.key,
          "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({ tipo_seguro: tipoSeguro })
      });
      const patched = await resPatch.json();
      if (!patched || patched.length === 0) {
        await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_CONFIG.key,
            "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            identificador: numDni,
            historia_clinica: nroHc || `HC-2026-${numDni.slice(-3)}`,
            nombre_completo: nombre || numDni,
            tipo_seguro: tipoSeguro
          })
        });
      }
      console.log(`☁️ Seguro '${tipoSeguro}' persistido con éxito en Supabase para DNI ${numDni}`);
    } catch (e) {
      console.warn("Aviso al persistir en Supabase:", e);
    }
  }
}

function aplicarSeleccionSeguroYEntorno(seguro, sincronizarBd = false, bloquearOtros = false) {
  if (!seguro) return;
  const s = String(seguro).trim().toLowerCase();

  if (s.includes("sis") || s.includes("minsa")) {
    seleccionarEntornoEstablecimiento("minsa_sis", sincronizarBd, bloquearOtros);
  } else if (s.includes("essalud")) {
    seleccionarEntornoEstablecimiento("essalud", sincronizarBd, bloquearOtros);
  } else if (s.includes("eps") || s.includes("privad") || s.includes("rimac") || s.includes("pacifico") || s.includes("mapfre") || s.includes("sanitas") || s.includes("positiva")) {
    seleccionarEntornoEstablecimiento("clinica_eps", sincronizarBd, bloquearOtros);
  } else if (s.includes("soat")) {
    cambiarOrigenEvento("soat");
  } else if (s.includes("particular") || s.includes("sin seguro") || s.includes("ningun")) {
    seleccionarEntornoEstablecimiento("particular", sincronizarBd, bloquearOtros);
  }
}

function seleccionarEntornoEstablecimiento(entorno, sincronizarConBd = true, bloquearOtros = false) {
  // Si ya fue bloqueado oficialmente por Módulo 3 y se intenta modificar manualmente desde Módulo 1
  if (STATE.entornoBloqueado && !bloquearOtros) {
    alert("🔒 El entorno asistencial está bloqueado e inalterable por la Acreditación Oficial PIDE-SUSALUD validada en el Módulo 3.");
    return;
  }

  if (bloquearOtros) {
    STATE.entornoBloqueado = true;
  }

  STATE.entornoEstablecimiento = entorno;
  STATE.esClinicaPrivada = (entorno === "clinica_eps");

  const btnMinsa = document.getElementById("btn_entorno_minsa");
  const btnEssalud = document.getElementById("btn_entorno_essalud");
  const btnCli = document.getElementById("btn_entorno_clinica_eps");
  const btnPart = document.getElementById("btn_entorno_particular");
  const badge = document.getElementById("badge_entorno_actual");
  const bannerMinsa = document.getElementById("banner_condicion_minsa");
  const bannerEssalud = document.getElementById("banner_condicion_essalud");
  const bannerEps = document.getElementById("banner_condicion_eps");
  const bannerPart = document.getElementById("banner_condicion_particular");

  const todosBotones = [btnMinsa, btnEssalud, btnCli, btnPart];

  // Reset base styles
  todosBotones.forEach(b => {
    if (b) {
      b.style.background = "#ffffff";
      b.style.borderColor = "#cbd5e1";
      b.style.color = "#334155";
      b.style.opacity = "1";
      b.style.filter = "none";
      b.style.pointerEvents = "auto";
      b.style.cursor = "pointer";
      b.disabled = false;
    }
  });

  if (bannerMinsa) bannerMinsa.style.display = "none";
  if (bannerEssalud) bannerEssalud.style.display = "none";
  if (bannerEps) bannerEps.style.display = "none";
  if (bannerPart) bannerPart.style.display = "none";

  let botonActivo = null;

  if (entorno === "minsa_sis") {
    botonActivo = btnMinsa;
    if (btnMinsa) {
      btnMinsa.style.background = "#f0f9ff";
      btnMinsa.style.borderColor = "#0284c7";
      btnMinsa.style.color = "#0369a1";
    }
    if (badge) {
      badge.textContent = bloquearOtros ? "🔒 🏛️ Hospital MINSA (SIS) — Acreditado PIDE (Bloqueado)" : "🏛️ Hospital MINSA (SIS)";
      badge.style.background = "#e0f2fe";
      badge.style.color = "#0369a1";
      badge.style.borderColor = "#bae6fd";
    }
    if (bannerMinsa) bannerMinsa.style.display = "block";

    if (!STATE.esAccidenteTransito) {
      STATE.tipoSeguro = "SIS";
      actualizarSeguroConsolidado("SIS Gratuito Integral (MINSA / Formato FUA)");
    }
  } else if (entorno === "essalud") {
    botonActivo = btnEssalud;
    if (btnEssalud) {
      btnEssalud.style.background = "#eff6ff";
      btnEssalud.style.borderColor = "#3b82f6";
      btnEssalud.style.color = "#1d4ed8";
    }
    if (badge) {
      badge.textContent = bloquearOtros ? "🔒 🏥 Hospital EsSalud — Acreditado PIDE (Bloqueado)" : "🏥 Hospital EsSalud";
      badge.style.background = "#dbeafe";
      badge.style.color = "#1d4ed8";
      badge.style.borderColor = "#bfdbfe";
    }
    if (bannerEssalud) bannerEssalud.style.display = "block";

    if (!STATE.esAccidenteTransito) {
      STATE.tipoSeguro = "EsSalud";
      actualizarSeguroConsolidado("EsSalud (Asegurado Regular ESSI / D.L. 728)");
    }
  } else if (entorno === "clinica_eps") {
    botonActivo = btnCli;
    if (btnCli) {
      btnCli.style.background = "#f0fdf4";
      btnCli.style.borderColor = "#10b981";
      btnCli.style.color = "#065f46";
    }
    if (badge) {
      badge.textContent = bloquearOtros ? "🔒 🏢 Clínica Privada (Red EPS) — Acreditado PIDE (Bloqueado)" : "🏢 Clínica Privada (Red EPS)";
      badge.style.background = "#dcfce7";
      badge.style.color = "#15803d";
      badge.style.borderColor = "#86efac";
    }
    if (bannerEps) bannerEps.style.display = "block";

    if (!STATE.esAccidenteTransito) {
      STATE.tipoSeguro = "EPS";
      actualizarSeguroConsolidado("Clínica Privada — EPS Activa (Pacífico Salud / Rímac / Mapfre)");
    }
  } else if (entorno === "particular") {
    botonActivo = btnPart;
    if (btnPart) {
      btnPart.style.background = "#fef2f2";
      btnPart.style.borderColor = "#f87171";
      btnPart.style.color = "#991b1b";
    }
    if (badge) {
      badge.textContent = bloquearOtros ? "🔒 👤 Sin Seguro (Particular) — Auditado PIDE (Bloqueado)" : "👤 Atención Particular (Sin Seguro)";
      badge.style.background = "#fee2e2";
      badge.style.color = "#991b1b";
      badge.style.borderColor = "#fca5a5";
    }
    if (bannerPart) bannerPart.style.display = "block";

    if (!STATE.esAccidenteTransito) {
      STATE.tipoSeguro = "Particular";
      actualizarSeguroConsolidado("Particular (Sin Seguro Activo — Cobro al 100%)");
    }
  }

  // SI SE INDICA BLOQUEO POR MÓDULO 3: BLOQUEAR TODOS LOS DEMÁS BOTONES PARA EVITAR MODIFICACIÓN POR ERROR
  if (STATE.entornoBloqueado) {
    todosBotones.forEach(b => {
      if (b) {
        if (b === botonActivo) {
          b.disabled = false;
          b.style.pointerEvents = "none"; // Evitar clics redundantes
          b.style.cursor = "default";
          b.style.boxShadow = "0 0 0 2px rgba(16,185,129,0.3)";
        } else {
          b.disabled = true;
          b.style.pointerEvents = "none";
          b.style.opacity = "0.38";
          b.style.cursor = "not-allowed";
          b.style.filter = "grayscale(100%)";
          b.style.borderColor = "#e2e8f0";
          b.style.background = "#f1f5f9";
          b.style.color = "#94a3b8";
        }
      }
    });
  }

  // Si se solicita sincronizar con BD y tenemos un identificador activo
  if (sincronizarConBd && STATE.identificador && STATE.tipoSeguro) {
    guardarSeguroPacienteEnBd(STATE.identificador, STATE.historiaClinica, STATE.nombreReniec, STATE.tipoSeguro);
  }

  if (typeof recalcularPrioridad === "function") {
    try { recalcularPrioridad(); } catch(e){}
  }
  if (typeof actualizarFactura === "function") {
    try { actualizarFactura(); } catch(e){}
  }
}

function seleccionarRegimenSeguroDirecto(tipo) {
  if (tipo === "SIS") {
    seleccionarEntornoEstablecimiento("minsa_sis", true);
  } else if (tipo === "EsSalud") {
    seleccionarEntornoEstablecimiento("essalud", true);
  } else if (tipo === "EPS") {
    seleccionarEntornoEstablecimiento("clinica_eps", true);
  } else if (tipo === "Particular") {
    STATE.esClinicaPrivada = false;
    STATE.tipoSeguro = "Particular";
    actualizarSeguroConsolidado("Particular (Sin Cobertura Activa)");
    if (STATE.identificador) {
      guardarSeguroPacienteEnBd(STATE.identificador, STATE.historiaClinica, STATE.nombreReniec, "Particular");
    }
    recalcularPrioridad();
    actualizarFactura();
  }
}

function cambiarOrigenEvento(tipo) {
  // Aceptar tanto 'soat' como 'transito' indistintamente
  const esTransito = (tipo === "soat" || tipo === "transito");
  STATE.tipoOrigenEvento = esTransito ? "soat" : "comun";
  STATE.esAccidenteTransito = esTransito;

  const optComun = document.getElementById("opt_origen_comun");
  const optSoat = document.getElementById("opt_origen_soat");
  const rbComun = document.getElementById("rb_origen_comun");
  const rbSoat = document.getElementById("rb_origen_soat");
  const bannerTransito = document.getElementById("banner_origen_transito");
  const navSoatBadge = document.getElementById("navSoatBadge");
  const miniSoatBadge = document.getElementById("mini_soat_badge");
  const soatWrapper = document.getElementById("seccion_soat_wrapper");
  const pideWrapper = document.getElementById("seccion_pide_wrapper");

  if (esTransito) {
    // 1. Estilos visuales del selector en Módulo 1
    if (optSoat) {
      optSoat.classList.add("selected");
      optSoat.style.borderColor = "#dc2626";
      optSoat.style.background = "#fef2f2";
    }
    if (optComun) {
      optComun.classList.remove("selected");
      optComun.style.borderColor = "#cbd5e1";
      optComun.style.background = "#ffffff";
    }
    if (rbSoat) rbSoat.checked = true;
    if (rbComun) rbComun.checked = false;

    // 2. Mostrar banner de protocolo de accidente de tránsito
    if (bannerTransito) {
      bannerTransito.style.display = "block";
    }

    // 3. Activar chip de SOAT en la barra de telemetría superior
    if (navSoatBadge) navSoatBadge.style.display = "inline-flex";
    if (miniSoatBadge) miniSoatBadge.style.display = "inline-flex";

    // 4. Mostrar sección SOAT en Módulo 3 y ocultar consulta PIDE común
    if (soatWrapper) soatWrapper.style.display = "block";
    if (pideWrapper) pideWrapper.style.display = "none";

    // 5. Configurar estado y candado médico legal (Art. 195 CPP)
    STATE.tipoSeguro = "SOAT";
    STATE.bloqueoSinadef = true;

    // Inicializar con opción identificado por defecto si no estaba configurado
    if (typeof cambiarOpcionSoat === "function") {
      cambiarOpcionSoat(STATE.soatVehiculoFuga ? "fuga" : "identificado");
    }

    console.log("🚗 Modo Accidente de Tránsito SOAT activado correctamente.");
  } else {
    // 1. Estilos visuales de Emergencia Común
    if (optComun) {
      optComun.classList.add("selected");
      optComun.style.borderColor = "#0284c7";
      optComun.style.background = "#f0f9ff";
    }
    if (optSoat) {
      optSoat.classList.remove("selected");
      optSoat.style.borderColor = "#cbd5e1";
      optSoat.style.background = "#ffffff";
    }
    if (rbComun) rbComun.checked = true;
    if (rbSoat) rbSoat.checked = false;

    // 2. Ocultar banner de accidente de tránsito
    if (bannerTransito) bannerTransito.style.display = "none";

    // 3. Ocultar badges SOAT
    if (navSoatBadge) navSoatBadge.style.display = "none";
    if (miniSoatBadge) miniSoatBadge.style.display = "none";

    // 4. Mostrar consulta PIDE en Módulo 3 y ocultar SOAT
    if (soatWrapper) soatWrapper.style.display = "none";
    if (pideWrapper) pideWrapper.style.display = "block";

    // 5. Desactivar candado de accidente
    STATE.bloqueoSinadef = false;
    STATE.soatVehiculoFuga = false;
    STATE.tipoSeguro = "Particular";

    console.log("🩺 Modo Emergencia Común activado.");
  }

  // Actualizar candado en Módulo 7 y recálculo en Módulo 8
  if (typeof verificarCandadoLegalSinadef === "function") {
    try { verificarCandadoLegalSinadef(); } catch(e){}
  }
  if (typeof actualizarFactura === "function") {
    try { actualizarFactura(); } catch(e){}
  }
}

function activarPanicoShockTrauma() {
  if (typeof bloquearIdentificacionEnMod2 === "function") bloquearIdentificacionEnMod2(false);
  window._identificacionOrigen = null;
  const ahora = new Date();
  const horaStr = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '');
  const idEmergencia = `CRITICO-ST-${horaStr}`;
  const hcEmergencia = `HC-ST-${Math.floor(1000 + Math.random() * 9000)}`;
  const nombreCritico = "PACIENTE CRÍTICO (SHOCK TRAUMA P-I)";

  guardarEstadoPacienteActivo();

  // 1. Asignar atención en el Tablero de Atención Simultánea (omitiendo cómo llegó o quién lo trajo)
  const pxST = crearRegistroPaciente({
    identificador: idEmergencia,
    nombre: nombreCritico,
    dni: "NN",
    prioridad: "I",
    motivo: "Paro Cardiorrespiratorio / Falla Vital Inminente (P-I Rojo)",
    estadoAtencion: "En Atención — Shock Trauma ST-01",
    camaNombre: "Shock Trauma ST-01",
    camaId: "ST-01",
    esEmergenciaDirecta: true,
    esNN: true
  });

  esLlegadaSimultanea = false;
  if (!Array.isArray(PACIENTES_COLA)) PACIENTES_COLA = [];
  const idxExistenteST = PACIENTES_COLA.findIndex(x => x.id === pxST.id);
  if (idxExistenteST >= 0) PACIENTES_COLA[idxExistenteST] = pxST; else PACIENTES_COLA.push(pxST);
  window.PACIENTES_COLA = PACIENTES_COLA;
  pacienteActivoId = pxST.id;
  window.pacienteActivoId = pxST.id;

  // 2. Configurar STATE
  limpiarFormularioCompletoState();
  STATE.panicoShockTrauma = true;
  STATE.ingresoDirectoCritico = true;
  STATE.motivoIngresoCritico = "Activación directa de Trauma Shock / Riesgo Vital Inmediato — Ley N° 27604";
  STATE.prioridad = "I";
  STATE.colorPrioridad = "ROJO";
  STATE.identificador = idEmergencia;
  STATE.nombreReniec = nombreCritico;
  STATE.historiaClinica = hcEmergencia;
  STATE.camaAsignada = "Shock Trauma ST-01";
  STATE.camaAsignadaId = "ST-01";
  STATE.tipoSeguro = "Regularización Diferida (Ley N° 27604)";
  STATE.grupoSanguineo = "Desconocido";
  STATE.alergias = "Desconocido";
  STATE.alergiasConocidas = "Desconocido";
  STATE.destinoPostTopico = "shock_trauma";

  // Asignar recurso hospitalario ST-01
  if (typeof RECURSOS_HOSPITALARIOS !== "undefined" && RECURSOS_HOSPITALARIOS["ST-01"]) {
    RECURSOS_HOSPITALARIOS["ST-01"].estado = "ocupada";
    RECURSOS_HOSPITALARIOS["ST-01"].paciente = {
      nombre: nombreCritico,
      identificador: idEmergencia,
      historiaClinica: hcEmergencia,
      prioridad: "I"
    };
    if (typeof renderizarTableroCamasYQuirofanos === "function") {
      renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "camas_stock_grid");
      renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
    }
    if (typeof actualizarWidgetFlotanteCamas === "function") {
      actualizarWidgetFlotanteCamas();
    }
  }

  // 3. Sincronizar DOM
  const elIdent = document.getElementById("ident_full");
  if (elIdent) elIdent.value = idEmergencia;
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = "Paro Cardiorrespiratorio / Shock Circulatorio Extremo (P-I)";
  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = "Desconocido";
  const elAlergiasFull = document.getElementById("alergias_full");
  if (elAlergiasFull) elAlergiasFull.value = "Desconocido";
  const elAlergiasM1 = document.getElementById("alergias_mod1");
  if (elAlergiasM1) elAlergiasM1.value = "Desconocido";
  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = hcEmergencia;
  const badgeEstado = document.getElementById("hc_badge_estado");
  if (badgeEstado) {
    badgeEstado.textContent = "🚨 Shock Trauma (Ley 27604)";
    badgeEstado.className = "badge-estado badge-danger";
  }

  // Banner Paro / Agonía
  const bannerParo = document.getElementById("banner_paro_agonia");
  if (bannerParo) bannerParo.style.display = "block";

  if (typeof recalcularPrioridad === "function") {
    recalcularPrioridad();
  } else {
    mostrarPrioridad("I", {
      tipo: "Prioridad I — ROJO (Resucitación / Shock Trauma)",
      desc: "Ingreso directo a Shock Trauma ST-01 activado. Trámites y origen omitidos por premura asistencial.",
      destino: "Shock Trauma ST-01"
    });
  }

  // Sincronizar paciente crítico NN en todos los módulos (incluido Módulo 4)
  if (typeof sincronizarDatosPacienteEnTodosLosModulos === "function") {
    sincronizarDatosPacienteEnTodosLosModulos({
      esNN: true,
      dni: "NN",
      nombre: nombreCritico,
      hc: hcEmergencia,
      sexo: "Desconocido"
    });
  }

  renderizarTableroColaPacientes();
  mostrarToastCola(`🚨 <strong>Admitir Emergencia Shock Trauma (P-I):</strong> Asignado en atención inmediata en el Tablero.`);

  irAModulo(4);
}

function actualizarEVA(val) {
  const v = parseInt(val) || 0;
  STATE.eva = v;
  const inputEl = document.getElementById("eva_full");
  if (inputEl) inputEl.value = v;

  const labels = [
    "0 - Sin Dolor",
    "1 - Dolor Mínimo",
    "2 - Dolor Leve",
    "3 - Dolor Leve Moderado",
    "4 - Dolor Moderado",
    "5 - Dolor Moderado Molesto",
    "6 - Dolor Intenso",
    "7 - Dolor Muy Intenso",
    "8 - Dolor Severo (Urgente)",
    "9 - Dolor Desesperante",
    "10 - Dolor Máximo Insupportable"
  ];
  const lblEl = document.getElementById("eva_full_val") || document.getElementById("eva_label");
  if (lblEl) lblEl.textContent = labels[v] || `${v}/10`;

  recalcularPrioridad();
  calcularPuntajePrelacionABCDE();
}

function toggleCodigoTiempo(tipo, chk) {
  if (tipo === "infarto") STATE.codigoInfarto = chk;
  if (tipo === "ictus") STATE.codigoIctus = chk;
  if (tipo === "sepsis") STATE.codigoSepsis = chk;

  if (chk) {
    alert(`🚨 ACTIVACIÓN PROTOCOLO CÓDIGO TIEMPO-DEPENDIENTE: ${tipo.toUpperCase()}\nPrioridad clínica elevada automáticamente y activación de orden prioritaria.`);
  }
  recalcularPrioridad();
}

function toggleGestante(chk) {
  STATE.esGestante = chk;
  const card = document.getElementById("campos_gestante");
  if (card) card.style.display = chk ? "block" : "none";
  calcularPuntajePrelacionABCDE();
  recalcularPrioridad();
}

function togglePediatrico(chk) {
  STATE.esPediatrico = chk;
  const card = document.getElementById("campos_pediatrico");
  if (card) card.style.display = chk ? "block" : "none";
  calcularPuntajePrelacionABCDE();
  recalcularPrioridad();
}


// --- MÓDULO 3: SOAT Y ACREDITACIÓN PIDE ---
function consultarSoatApeseg() {
  const placaEl = document.getElementById("soat_placa") || document.getElementById("soat_placa_input");
  const placa = (placaEl?.value || "").trim().toUpperCase();

  if (!placa || placa.length < 5) {
    alert("⚠️ Por favor ingrese un número de placa vehicular válido (ej. ABC-123 o A1B-234).");
    return;
  }

  STATE.soatPlaca = placa;
  STATE.soatVehiculoFuga = false;
  STATE.tipoSeguro = "SOAT";
  STATE.soatAseguradora = "Pacífico Compañía de Seguros y Reaseguros";
  STATE.soatPoliza = `SOAT-2026-${Math.floor(100000 + Math.random() * 900000)}`;
  STATE.soatEstado = "ACTIVO / VIGENTE (APESEG)";

  const polizaInput = document.getElementById("soat_poliza");
  if (polizaInput) polizaInput.value = STATE.soatPoliza;

  const aseguSelect = document.getElementById("soat_aseguradora");
  if (aseguSelect) aseguSelect.value = "Pacífico Seguros";

  const estadoSelect = document.getElementById("soat_estado");
  if (estadoSelect) estadoSelect.value = "ACTIVO";

  alert(`✅ SOAT verificado exitosamente ante APESEG para la placa ${placa}. Cobertura legal activada hasta 5 UIT (S/. 27,500.00).`);
  actualizarFactura();
}

function cambiarOpcionSoat(opcion) {
  STATE.soatOpcion = opcion;
  const esFuga = (opcion === "fuga" || opcion === "sin_placa");
  STATE.soatVehiculoFuga = esFuga;
  STATE.eventoFugaTransversal = esFuga;
  STATE.esAccidenteTransito = true;
  STATE.tipoOrigenEvento = "soat";

  const chkTopFuga = document.getElementById("chk_evento_fuga");
  if (chkTopFuga) chkTopFuga.checked = esFuga;

  if (STATE.padronSusalud) {
    STATE.padronSusalud.condicion_evento = esFuga ? "ACCIDENTE_TRANSITO_FUGA" : "NORMAL";
  }

  const rbIdent = document.getElementById("rb_soat_identificado");
  const rbFuga = document.getElementById("rb_soat_fuga");
  const boxCampos = document.getElementById("box_soat_campos");
  const meterCard = document.getElementById("soat_meter_card");
  const boxFugaAlert = document.getElementById("box_soat_fuga_alert");
  const navSoatBadge = document.getElementById("navSoatBadge");
  const miniSoatBadge = document.getElementById("mini_soat_badge");

  if (esFuga) {
    if (rbFuga) rbFuga.checked = true;
    if (rbIdent) rbIdent.checked = false;
    if (boxCampos) boxCampos.style.display = "none";
    if (meterCard) meterCard.style.display = "none";
    if (boxFugaAlert) boxFugaAlert.style.display = "block";
    if (navSoatBadge) navSoatBadge.style.display = "none";
    if (miniSoatBadge) {
      miniSoatBadge.style.display = "inline-flex";
      miniSoatBadge.style.background = "#fee2e2";
      miniSoatBadge.style.color = "#991b1b";
      miniSoatBadge.style.borderColor = "#fca5a5";
      miniSoatBadge.textContent = "🚨 Chofer en Fuga: Sin SOAT (Cobro 100%)";
    }

    STATE.soatPlaca = "NO IDENTIFICADO (SIN PLACA)";
  } else {
    if (rbIdent) rbIdent.checked = true;
    if (rbFuga) rbFuga.checked = false;
    if (boxCampos) boxCampos.style.display = "grid";
    if (meterCard) meterCard.style.display = "block";
    if (boxFugaAlert) boxFugaAlert.style.display = "none";
    if (navSoatBadge) navSoatBadge.style.display = "inline-flex";
    if (miniSoatBadge) {
      miniSoatBadge.style.display = "inline-flex";
      miniSoatBadge.style.background = "#eff6ff";
      miniSoatBadge.style.color = "#1d4ed8";
      miniSoatBadge.style.borderColor = "#bfdbfe";
      miniSoatBadge.textContent = "🚗 SOAT Activo (Tope 5 UIT)";
    }
  }

  actualizarFactura();
}


// ==============================================================================
// GESTIÓN DE INGRESO DIRECTO A QUIRÓFANO Y CIRUGÍA DE CONTROL DE DAÑOS (SOP)
// ==============================================================================

function activarIngresoDirectoQuirofano() {
  if (typeof bloquearIdentificacionEnMod2 === "function") bloquearIdentificacionEnMod2(false);
  window._identificacionOrigen = null;
  const now = new Date();
  const horaStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '');
  const idEmergencia = `CRITICO-SOP-${horaStr}`;
  const hcEmergencia = `HC-SOP-${Math.floor(1000 + Math.random() * 9000)}`;
  const nombreCritico = "PACIENTE CRÍTICO (QUIRÓFANO SOP P-I)";

  guardarEstadoPacienteActivo();

  // 1. Asignar atención en el Tablero de Atención Simultánea
  const pxSOP = crearRegistroPaciente({
    identificador: idEmergencia,
    nombre: nombreCritico,
    dni: "NN",
    prioridad: "I",
    motivo: "Cirugía de Control de Daños / Hemorragia Masiva / SOP Urgente (P-I)",
    estadoAtencion: "En Operación — Quirófano SOP 1",
    camaNombre: "Quirófano 1 (SOP 1 - Control de Daños)",
    camaId: "SOP-1",
    esEmergenciaDirecta: true,
    esNN: true
  });

  esLlegadaSimultanea = false;
  if (!Array.isArray(PACIENTES_COLA)) PACIENTES_COLA = [];
  const idxExistenteSOP = PACIENTES_COLA.findIndex(x => x.id === pxSOP.id);
  if (idxExistenteSOP >= 0) PACIENTES_COLA[idxExistenteSOP] = pxSOP; else PACIENTES_COLA.push(pxSOP);
  window.PACIENTES_COLA = PACIENTES_COLA;
  pacienteActivoId = pxSOP.id;
  window.pacienteActivoId = pxSOP.id;

  // 2. Configurar STATE
  limpiarFormularioCompletoState();
  STATE.esNN = true;
  STATE.ingresoDirectoCritico = true;
  STATE.motivoIngresoCritico = "Pase Directo a Quirófano SOP / Cirugía de Control de Daños — Ley N° 27604";
  STATE.prioridad = "I";
  STATE.colorPrioridad = "ROJO";
  STATE.regularizacionDiferida = true;
  STATE.destinoPostTopico = "quirofano_uci";
  STATE.identificador = idEmergencia;
  STATE.nombreReniec = nombreCritico;
  STATE.historiaClinica = hcEmergencia;
  STATE.alertaPnpSs = true;
  STATE.grupoSanguineo = "Desconocido";
  STATE.alergias = "Desconocido";
  STATE.alergiasConocidas = "Desconocido";
  STATE.tipoSeguro = "Regularización Diferida (Ley N° 27604)";
  STATE.camaAsignada = "Quirófano 1 (SOP 1 - Cirugía de Control de Daños)";
  STATE.camaAsignadaId = "SOP-01";

  // Asignar recurso hospitalario SOP-01
  const recSopAdm = (typeof RECURSOS_HOSPITALARIOS !== "undefined") ? (RECURSOS_HOSPITALARIOS["SOP-01"] || RECURSOS_HOSPITALARIOS["SOP-1"]) : null;
  if (recSopAdm) {
    recSopAdm.estado = "ocupada";
    recSopAdm.paciente = {
      nombre: nombreCritico,
      identificador: idEmergencia,
      historiaClinica: hcEmergencia,
      prioridad: "I"
    };
    if (typeof renderizarTableroCamasYQuirofanos === "function") {
      renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "camas_stock_grid");
      renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
    }
    if (typeof actualizarWidgetFlotanteCamas === "function") {
      actualizarWidgetFlotanteCamas();
    }
  }

  // 3. Sincronizar DOM
  const elIdent = document.getElementById("ident_full");
  if (elIdent) elIdent.value = idEmergencia;
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = "Laparotomía Exploratoria de Emergencia / Control de Daños (P-I)";
  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = "Desconocido";
  const elAlergiasFull = document.getElementById("alergias_full");
  if (elAlergiasFull) elAlergiasFull.value = "Desconocido";
  const elAlergiasM1 = document.getElementById("alergias_mod1");
  if (elAlergiasM1) elAlergiasM1.value = "Desconocido";
  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = hcEmergencia;
  const badgeEstado = document.getElementById("hc_badge_estado");
  if (badgeEstado) {
    badgeEstado.textContent = "🚨 Quirófano SOP (Ley 27604)";
    badgeEstado.className = "badge-estado badge-danger";
  }

  // Cargar paquete quirúrgico inicial
  registrarFacturaItem("Derecho de Sala de Operaciones de Emergencia (SOP 1)", 450, "Procedimientos");
  registrarFacturaItem("Cirugía de Control de Daños / Laparotomía de Urgencia", 850, "Procedimientos");
  registrarFacturaItem("Monitoreo Anestésico y Sedación Integral", 320, "Procedimientos");
  registrarFacturaItem("Paquete Globular O- Transfusión de Urgencia (Banco Sangre)", 240, "Procedimientos");

  const chipLive = document.getElementById("chipPrioLive");
  if (chipLive) {
    chipLive.textContent = "EMERGENCIA (P-I Quirófano SOP 1)";
    chipLive.className = "top-prio-chip prio-I";
  }

  const badgeSop1 = document.getElementById("badge_sop1");
  if (badgeSop1) {
    badgeSop1.textContent = "🔴 EN OPERACIÓN";
    badgeSop1.style.background = "#fee2e2";
    badgeSop1.style.color = "#991b1b";
  }

  if (typeof recalcularPrioridad === "function") {
    recalcularPrioridad();
  } else {
    mostrarPrioridad("I", {
      tipo: "Prioridad I — ROJO (Cirugía de Emergencia SOP)",
      desc: "Ingreso inmediato a Quirófano SOP 1 activado. Sin condicionamiento de pago ni seguro previo (Ley N° 27604).",
      destino: "Quirófano 1 (SOP 1)"
    });
  }

  // Sincronizar paciente NN en todos los módulos (incluido Módulo 4)
  if (typeof sincronizarDatosPacienteEnTodosLosModulos === "function") {
    sincronizarDatosPacienteEnTodosLosModulos({
      esNN: true,
      dni: "NN",
      nombre: nombreCritico,
      hc: hcEmergencia,
      sexo: "Desconocido"
    });
  }

  renderizarTableroColaPacientes();
  actualizarFactura();
  mostrarToastCola(`🏥 <strong>Admitir Emergencia Quirófano (P-I):</strong> Paciente ingresado directamente a SOP 1.`);

  irAModulo(6);
}

function asignarQuirofanoEspecifico(num) {
  const nombreSop = `Quirófano ${num} (SOP ${num} - Emergencia)`;
  STATE.camaAsignada = nombreSop;

  const badge = document.getElementById(`badge_sop${num}`);
  if (badge) {
    badge.textContent = "🔴 EN OPERACIÓN";
    badge.style.background = "#fee2e2";
    badge.style.color = "#991b1b";
  }

  registrarFacturaItem(`Derecho de Sala de Operaciones (SOP ${num})`, 400, "Procedimientos");
  alert(`🏥 Paciente ingresado a ${nombreSop}. Procedimiento quirúrgico activo.`);
  actualizarFactura();
}

function asignarCamaURPA() {
  STATE.camaAsignada = "Cama 1 — Sala URPA (Recuperación Post-Anestésica)";
  const badge = document.getElementById("badge_urpa");
  if (badge) {
    badge.textContent = "🟡 1 Cama Ocupada";
    badge.style.background = "#fef9c3";
    badge.style.color = "#854d0e";
  }
  registrarFacturaItem("Estancia en Sala de Recuperación Post-Anestésica (URPA)", 120, "Clínica");
  alert("🛌 Paciente trasladado exitosamente a Sala URPA para monitoreo post-quirúrgico.");
  actualizarFactura();
}

function ejecutarOrdenQuirurgicaEmergencia() {
  const selCirugia = document.getElementById("select_cirugia_catalogo");
  const selSop = document.getElementById("select_sala_destino_sop");
  const val = selCirugia?.value || "Laparotomía Exploratoria|850";
  const parts = val.split("|");
  const nombreCirugia = parts[0];
  const costo = parseFloat(parts[1]) || 650;
  const sala = selSop?.value || "Quirófano 1 (SOP 1 - Trauma Shock)";

  STATE.camaAsignada = sala;
  registrarFacturaItem(`Intervención Quirúrgica: ${nombreCirugia}`, costo, "Procedimientos");
  registrarFacturaItem("Monitoreo Anestésico y Sedación de Urgencia", 280, "Procedimientos");

  const disp = document.getElementById("status_cirugia_display");
  if (disp) {
    disp.innerHTML = `<span style="color:#15803d;font-weight:700;">✅ Cirugía programada en ${sala}: ${nombreCirugia} (S/. ${costo.toFixed(2)}). Procedimiento cargado formalmente.</span>`;
  }

  alert(`🔪 Orden Quirúrgica Emitida:\n${nombreCirugia}\nAsignado a: ${sala}\nCirujano: ${STATE.medicoTratante}`);
  actualizarFactura();
}

// GESTIÓN DEL MODAL DE REGULARIZACIÓN DIFERIDA (LEY N° 27604)
function abrirModalRegularizacionDiferida() {
  const modal = document.getElementById("modal_regularizacion_diferida");
  if (!modal) return;
  modal.classList.add("open");
  modal.style.display = "flex";

  const dniInput = document.getElementById("reg_dni_input");
  const nomInput = document.getElementById("reg_nombre_input");
  if (dniInput && STATE.identificador && !STATE.identificador.startsWith("NN-")) {
    dniInput.value = STATE.identificador;
  }
  if (nomInput && STATE.nombreReniec && !STATE.nombreReniec.includes("PACIENTE NN")) {
    nomInput.value = STATE.nombreReniec;
  }
}

function cerrarModalRegularizacionDiferida() {
  const modal = document.getElementById("modal_regularizacion_diferida");
  if (modal) {
    modal.classList.remove("open");
    modal.style.display = "none";
  }
}


function seleccionarCIE10(codigo, desc) {
  if (!desc && typeof codigo === "string" && (codigo.includes("—") || codigo.includes(" - "))) {
    const partes = codigo.split(/\s*[—\-]\s*/);
    codigo = partes[0].trim();
    desc = partes.slice(1).join(" — ").trim();
  } else if (!desc) {
    desc = codigo || "";
  }
  const textoCompleto = desc ? `${codigo} — ${desc}` : codigo;
  STATE.cie10Codigo = codigo;
  STATE.cie10Descripcion = desc;
  STATE.cie10 = textoCompleto;
  const input = document.getElementById("cie10_input");
  if (input) input.value = textoCompleto;

  const selCie = document.getElementById("cie10_select");
  if (selCie && selCie.value !== textoCompleto) {
    const optMatch = Array.from(selCie.options).find(o => o.value === textoCompleto || (codigo && o.value.startsWith(codigo)));
    if (optMatch) selCie.value = optMatch.value;
  }

  // Sincronización destacada de CIE-10 en todos los módulos (Módulo 4, 7, 8, Cockpit)
  const elM4Cie = document.getElementById("m4_cie10_texto_destacado");
  if (elM4Cie) elM4Cie.textContent = textoCompleto;
  const elCockpitCie = document.getElementById("c_triage_cie10");
  if (elCockpitCie) elCockpitCie.textContent = textoCompleto;
  const elM7Cie = document.getElementById("m7_cie10_display");
  if (elM7Cie) elM7Cie.textContent = textoCompleto;
  const elM8DispCie = document.getElementById("m8_disp_cie10");
  if (elM8DispCie) elM8DispCie.textContent = textoCompleto;
  const elM8Cie = document.getElementById("m8_cie10_display");
  if (elM8Cie) elM8Cie.textContent = textoCompleto;

  // Bloque 5: Ciclo de vida IPRESS - Sustento Médico con CIE-10 y hora de indicación médica
  const horaIndicacion = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  STATE.estadoFua = "CON_SUSTENTO_MEDICO";
  STATE.estadoEssi = "CON_SUSTENTO_MEDICO";
  STATE.horaSustentoMedico = horaIndicacion;

  if (window.pacienteActivoId && Array.isArray(window.PACIENTES_COLA)) {
    const px = window.PACIENTES_COLA.find(x => x.id === window.pacienteActivoId);
    if (px) {
      px.cie10 = textoCompleto;
      px.cie10Codigo = codigo;
      px.cie10Descripcion = desc;
      px.estadoFua = "CON_SUSTENTO_MEDICO";
      px.estadoEssi = "CON_SUSTENTO_MEDICO";
      px.horaSustentoMedico = horaIndicacion;
    }
  }

  if (typeof window.expedientesStore !== "undefined" && window.pacienteActivoId && window.expedientesStore[window.pacienteActivoId]) {
    window.expedientesStore[window.pacienteActivoId].cie10 = textoCompleto;
    window.expedientesStore[window.pacienteActivoId].cie10Codigo = codigo;
    window.expedientesStore[window.pacienteActivoId].cie10Descripcion = desc;
  }

  if (window.COCKPIT && typeof window.COCKPIT.actualizarTarjetaResumenTriaje === "function") {
    window.COCKPIT.actualizarTarjetaResumenTriaje();
  }
}

function abrirCatalogoRapidoKardex(cat) {
  alert(`📋 Abriendo subcatálogo de ${cat}. Puede seleccionar las indicaciones para el Kardex de Enfermería.`);
}

function administrarKardexItem(idx, nombre, costo, cat, btnEl) {
  if (!btnEl) return;
  const yaAdm = btnEl.getAttribute("data-administrado") === "true";
  const now = new Date();
  const horaStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!yaAdm) {
    btnEl.setAttribute("data-administrado", "true");
    btnEl.innerHTML = `✅ Administrado (${horaStr})`;
    btnEl.style.background = "#15803d";
    btnEl.style.color = "#ffffff";
    registrarFacturaItem(nombre, costo, cat);
    if (!STATE.kardexAdministrados.includes(nombre)) {
      STATE.kardexAdministrados.push(nombre);
    }
  } else {
    btnEl.setAttribute("data-administrado", "false");
    btnEl.innerHTML = `[ ✓ Administrado por Enf. ]`;
    btnEl.style.background = "#e0f2fe";
    btnEl.style.color = "#0369a1";
    const itemIdx = STATE.items_factura.findIndex(i => i.nombre === nombre);
    if (itemIdx !== -1) {
      STATE.items_factura.splice(itemIdx, 1);
    }
    STATE.kardexAdministrados = STATE.kardexAdministrados.filter(n => n !== nombre);
    actualizarFactura();
  }
}


// ===========================================================================
// SISTEMA DE FIRMAS ELECTRÓNICAS DIGITALES (LEY N° 27269) & PROTOCOLOS MÉDICOS
// ===========================================================================

function generarSelloFirmaDigitalHTML(tipoFirmante, datosExtra = {}) {
  const ahora = new Date();
  const fechaHoraStr = datosExtra.fechaHora || ahora.toLocaleString("es-PE", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const hashSimulado = datosExtra.hash || "SHA256:" + Array.from({length: 16}, () => Math.floor(Math.random()*16).toString(16)).join("") + "..." + Array.from({length: 8}, () => Math.floor(Math.random()*16).toString(16)).join("");

  const perfiles = {
    "MEDICO": {
      nombre: "Dr. Carlos Vega Alva",
      cargo: "Médico Especialista en Emergencias y Desastres",
      colegiatura: "CMP 58321 · RNE 23901",
      color: "#1e3a8a",
      borde: "#3b82f6",
      bg: "#eff6ff",
      svg: `<svg viewBox="0 0 180 50" width="135" height="36" style="overflow:visible; display:inline-block;"><path d="M 15,35 C 25,12 40,8 48,25 C 56,42 70,10 85,32 Q 100,48 120,20 T 150,28 M 10,42 Q 80,38 160,36" fill="none" stroke="#1e3a8a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
    "JUNTA_1": {
      nombre: "Dr. Carlos Vega Alva",
      cargo: "Emergenciólogo Tratante · Sala de Emergencia",
      colegiatura: "CMP 58321 · RNE 23901",
      color: "#1e3a8a",
      borde: "#3b82f6",
      bg: "#ffffff",
      svg: `<svg viewBox="0 0 180 50" width="130" height="34" style="overflow:visible; display:inline-block;"><path d="M 15,35 C 25,12 40,8 48,25 C 56,42 70,10 85,32 Q 100,48 120,20 T 150,28 M 10,42 Q 80,38 160,36" fill="none" stroke="#1e3a8a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
    "JUNTA_2": {
      nombre: "Dr. Juan Manuel Paredes",
      cargo: "Especialista Quirúrgico / Cuidados Intensivos (UCI)",
      colegiatura: "CMP 51892 · RNE 27415",
      color: "#1e3a8a",
      borde: "#6366f1",
      bg: "#ffffff",
      svg: `<svg viewBox="0 0 180 50" width="130" height="34" style="overflow:visible; display:inline-block;"><path d="M 15,32 Q 32,5 45,38 L 60,15 L 75,42 Q 95,5 115,35 L 148,22 M 20,46 L 155,42" fill="none" stroke="#1e3a8a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
    "JUNTA_3": {
      nombre: "Dra. Elena Ríos Salazar",
      cargo: "Jefa de Guardia / Auditoría Médica y Calidad",
      colegiatura: "CMP 41209 · RNE 18452",
      color: "#1e3a8a",
      borde: "#0284c7",
      bg: "#ffffff",
      svg: `<svg viewBox="0 0 180 50" width="130" height="34" style="overflow:visible; display:inline-block;"><path d="M 18,36 C 22,8 38,6 45,30 C 52,48 70,15 85,30 Q 110,8 128,34 T 160,22 M 16,46 Q 90,42 155,40" fill="none" stroke="#1e3a8a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
    "TRIAJE": {
      nombre: "Lic. Ana Torres Morales",
      cargo: "Licenciada Especialista en Triaje y Emergencias",
      colegiatura: "CEP 92410",
      color: "#0369a1",
      borde: "#38bdf8",
      bg: "#f0f9ff",
      svg: `<svg viewBox="0 0 180 50" width="135" height="36" style="overflow:visible; display:inline-block;"><path d="M 18,38 Q 32,10 44,28 T 70,22 Q 90,40 115,16 T 150,32 M 16,44 L 155,41" fill="none" stroke="#0369a1" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
    "ADMISION": {
      nombre: "Srta. Sofía Quispe Méndez",
      cargo: "Acreditadora de Admisión, Seguros y PIDE-SUSALUD",
      colegiatura: "Reg. SUSALUD 08412 · ADM-042",
      color: "#047857",
      borde: "#34d399",
      bg: "#ecfdf5",
      svg: `<svg viewBox="0 0 180 50" width="135" height="36" style="overflow:visible; display:inline-block;"><path d="M 16,32 Q 38,12 55,35 T 95,18 Q 118,38 138,20 L 158,28 M 14,42 Q 80,40 155,38" fill="none" stroke="#047857" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
    "CAJA": {
      nombre: "Sr. Luis Paredes Chumpitaz",
      cargo: "Cajero Liquidador Hospitalario · Ley N° 29414",
      colegiatura: "Matrícula Fin. FACT-882 · CAJ-9912",
      color: "#b45309",
      borde: "#fbbf24",
      bg: "#fffbeb",
      svg: `<svg viewBox="0 0 180 50" width="135" height="36" style="overflow:visible; display:inline-block;"><path d="M 18,38 Q 40,6 60,32 T 98,22 Q 120,42 145,18 L 160,30 M 14,45 L 165,42" fill="none" stroke="#b45309" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
    "AUDITOR": {
      nombre: "Dra. Elena Ríos Salazar",
      cargo: "Auditora Médica SUSALUD · Supervisión TEDEF",
      colegiatura: "CMP 41209 · RNE 18452",
      color: "#4338ca",
      borde: "#818cf8",
      bg: "#f5f3ff",
      svg: `<svg viewBox="0 0 180 50" width="135" height="36" style="overflow:visible; display:inline-block;"><path d="M 18,36 C 22,8 38,6 45,30 C 52,48 70,15 85,30 Q 110,8 128,34 T 160,22 M 16,46 Q 90,42 155,40" fill="none" stroke="#4338ca" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    }
  };

  const p = perfiles[tipoFirmante] || perfiles["MEDICO"];
  const nombreFinal = datosExtra.nombre || p.nombre;
  const cargoFinal = datosExtra.cargo || p.cargo;
  const colFinal = datosExtra.colegiatura || p.colegiatura;

  return `
    <div class="sello-digital-box" style="border:1.5px solid ${p.borde}; background:${p.bg}; border-radius:8px; padding:10px 14px; display:inline-block; min-width:230px; font-family:sans-serif; text-align:left; box-shadow:0 1px 4px rgba(0,0,0,0.06); margin:4px 0;">
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.08); padding-bottom:4px; margin-bottom:6px;">
        <span style="font-size:0.68rem; font-weight:800; color:#15803d; display:flex; align-items:center; gap:4px;">
          <span>🔏</span> <span>Firma Digital Ley N° 27269</span>
        </span>
        <span style="font-size:0.62rem; background:#dcfce7; color:#166534; padding:1px 6px; border-radius:4px; border:1px solid #86efac; font-weight:800;">
          ✓ Certificado PKI Válido
        </span>
      </div>
      <div style="margin:4px 0; text-align:center;">
        ${p.svg}
      </div>
      <div style="border-top:1px dashed rgba(0,0,0,0.12); padding-top:5px;">
        <strong style="font-size:0.78rem; color:#0f172a; display:block; line-height:1.2;">${nombreFinal}</strong>
        <span style="font-size:0.70rem; color:#475569; display:block; line-height:1.2; margin-top:1px;">${cargoFinal}</span>
        <span style="font-size:0.72rem; font-weight:800; color:${p.color}; display:block; margin-top:2px;">${colFinal}</span>
        <div style="font-size:0.62rem; color:#64748b; margin-top:4px; font-family:monospace; line-height:1.2; background:rgba(255,255,255,0.7); padding:2px 4px; border-radius:4px;">
          TSA: ${fechaHoraStr}<br>
          ${hashSimulado}
        </div>
      </div>
    </div>
  `;
}
window.generarSelloFirmaDigitalHTML = generarSelloFirmaDigitalHTML;

function ejecutarEvaluacionMedicaProtocolizada() {
  const boxActa = document.getElementById("box_acta_junta_medica");

  if (!STATE.identificador && (!window.PACIENTES_COLA || window.PACIENTES_COLA.length === 0)) {
    alert("⚠️ Por favor ingrese o seleccione un paciente antes de iniciar la Evaluación Médica.");
    if (typeof irAModulo === "function") irAModulo(1);
    return;
  }

  if (!pacienteActivoId && window.PACIENTES_COLA && window.PACIENTES_COLA.length > 0) {
    if (typeof cambiarPacienteActivo === "function") {
      cambiarPacienteActivo(window.PACIENTES_COLA[0].id);
    }
  }

  const prio = STATE.prioridad || "III";
  const motivo = ((document.getElementById("motivo_mts_select")?.value || "") + " " + (document.getElementById("motivo_full")?.value || "")).toLowerCase();
  const fc = parseFloat(document.getElementById("fc_full")?.value) || 75;
  const spo2 = parseFloat(document.getElementById("spo2_full")?.value) || 98;
  const pas = parseFloat(document.getElementById("pas_full")?.value) || 120;

  let cie10 = "";
  let destinoSugerido = "observacion";
  let medicamentoSugerido = "";
  let estudioImgSugerido = "";
  let panelLab = [];

  // Determinación diagnóstica CIE-10 cruzada con motivo y constantes
  if (motivo.includes("torac") || motivo.includes("infarto") || motivo.includes("corazon") || fc > 120 || pas > 180) {
    cie10 = "I21.9 — Infarto agudo del miocardio, sin otra especificación";
    destinoSugerido = (prio === "I") ? "quirofano_uci" : "observacion";
    medicamentoSugerido = "Cloruro de Sodio 0.9% 1000ml EV + Ácido Acetilsalicílico 300mg VO";
    estudioImgSugerido = "Rx Tórax Portátil + EKG STAT (< 10 min)";
    panelLab = ["Hemograma Completo STAT", "Troponina I Cuantitativa Ultrasensible STAT"];
  } else if (motivo.includes("respir") || motivo.includes("disnea") || motivo.includes("asma") || spo2 < 93) {
    cie10 = "J45.9 — Asma, no especificada (Crisis asmática severa)";
    destinoSugerido = (prio === "I" || prio === "II") ? "observacion" : "alta";
    medicamentoSugerido = "Salbutamol 0.5% Solución para Nebulización + Dexametasona 4mg EV";
    estudioImgSugerido = "Rx Tórax AP y Lateral";
    panelLab = ["Gases Arteriales (AGA) + Electrolitos Séricos (Na, K, Cl)"];
  } else if (motivo.includes("trauma") || motivo.includes("herida") || motivo.includes("accidente") || STATE.esAccidenteTransito) {
    cie10 = "T14.9 — Traumatismo no especificado por accidente / agresión";
    destinoSugerido = (prio === "I") ? "quirofano_uci" : "observacion";
    medicamentoSugerido = "Lactato de Ringer 1000ml EV + Analgesia mayor";
    estudioImgSugerido = "Ecografía FAST de Trauma Abdominal + Rx Foco Traumático";
    panelLab = ["Hemograma Completo + Plaquetas", "Grupo Sanguíneo y Factor Rh STAT"];
  } else if (motivo.includes("abdom") || motivo.includes("apendic") || motivo.includes("dolor abdominal")) {
    cie10 = "K35.8 — Apendicitis aguda con peritonitis localizada";
    destinoSugerido = "quirofano_uci";
    medicamentoSugerido = "Cloruro de Sodio 0.9% 1000ml EV + Ceftriaxona 1g EV";
    estudioImgSugerido = "Ecografía Abdominal Completa y Vías Biliares";
    panelLab = ["Hemograma Completo + Plaquetas + Leucocitosis", "Proteína C Reactiva (PCR)"];
  } else if (motivo.includes("neuro") || motivo.includes("ictus") || motivo.includes("cefalea") || (STATE.glasgow && STATE.glasgow < 14)) {
    cie10 = "I64.X — Accidente vascular encefálico agudo (Ictus / ACV)";
    destinoSugerido = (prio === "I") ? "quirofano_uci" : "observacion";
    medicamentoSugerido = "Cloruro de Sodio 0.9% EV a goteo de mantenimiento";
    estudioImgSugerido = "TAC Cerebral Sin Contraste STAT (Protocolo Stroke)";
    panelLab = ["Glucosa, Urea y Creatinina Sérica", "Tiempo de Protrombina (TP/INR) + TTPA"];
  } else if (motivo.includes("embarazo") || motivo.includes("obstet") || STATE.esGestante) {
    cie10 = "O14.1 — Preeclampsia severa / Emergencia obstétrica";
    destinoSugerido = "observacion";
    medicamentoSugerido = "Sulfato de Magnesio 20% (Protocolo Pritchard/Zuspan)";
    estudioImgSugerido = "Ecografía Obstétrica con Perfil Biofísico Fetal";
    panelLab = ["Hemograma Completo", "Perfil Renal y Pruebas Hepáticas (TGO/TGP)"];
  } else if (prio === "IV" || prio === "V") {
    cie10 = "R10.4 — Otros dolores abdominales y los no especificados (Manejo Ambulatorio)";
    destinoSugerido = "alta";
    medicamentoSugerido = "Paracetamol 500mg VO cada 8 horas por 3 días";
    estudioImgSugerido = "Sin indicación de imágenes urgentes";
    panelLab = ["Examen Completo de Orina (Sedimento)"];
  } else {
    cie10 = "A41.9 — Sepsis, no especificada / Síndrome infeccioso febril agudo";
    destinoSugerido = (prio === "I") ? "quirofano_uci" : "observacion";
    medicamentoSugerido = "Cloruro de Sodio 0.9% 1000ml EV STAT";
    estudioImgSugerido = "Rx Tórax Portátil AP";
    panelLab = ["Hemograma Completo", "Lactato Sérico STAT + Hemocultivos"];
  }

  // 1. Establecer diagnóstico CIE-10 oficial en todo el sistema
  if (typeof seleccionarCIE10 === "function") {
    seleccionarCIE10(cie10);
  }

  // 2. Ejecutar asignación de destino y cama en el gestor hospitalario
  if (typeof seleccionarDestinoPostTopico === "function") {
    seleccionarDestinoPostTopico(destinoSugerido);
  }

  // 3. Renderizar tarjeta de Evaluación Médica con Firma Digital
  if (boxActa) {
    boxActa.style.display = "block";
    const firmaHtml = generarSelloFirmaDigitalHTML("MEDICO");
    const destinoNombre = (destinoSugerido === "quirofano_uci") ? "Quirófano SOP / UCI (Cama Crítica)" : (destinoSugerido === "observacion") ? "Sala de Observación de Emergencia (Cama Hospitalaria)" : "Alta Médica Directa con Receta Domiciliaria";

    boxActa.innerHTML = `
      <div style="background:#ffffff; border:2px solid #0284c7; border-radius:10px; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-bottom:1.5px solid #e2e8f0; padding-bottom:10px; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.3rem;">📋</span>
            <div>
              <div style="font-size:0.92rem; font-weight:900; color:#0f172a;">EVALUACIÓN MÉDICA PROTOCOLIZADA Y CONDUCTA TERAPÉUTICA (NTS N° 042-MINSA)</div>
              <div style="font-size:0.72rem; color:#64748b;">Hospital Regional Docente UPP · Servicio de Emergencia · Decisión Clínica del Médico Tratante</div>
            </div>
          </div>
          <span style="background:#e0f2fe; color:#0369a1; font-weight:800; font-size:0.75rem; padding:4px 10px; border-radius:9999px; border:1px solid #bae6fd;">
            ✓ Protocolo Concluido
          </span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; margin-bottom:14px; font-size:0.80rem;">
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px;">
            <span style="color:#64748b; font-weight:800; font-size:0.70rem; text-transform:uppercase;">🏷️ Diagnóstico Principal (CIE-10):</span>
            <div style="font-weight:900; color:#0284c7; font-size:0.88rem; margin-top:2px;">${cie10}</div>
          </div>
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px;">
            <span style="color:#64748b; font-weight:800; font-size:0.70rem; text-transform:uppercase;">🛏️ Destino y Conducta Médica Asignada:</span>
            <div style="font-weight:900; color:#15803d; font-size:0.88rem; margin-top:2px;">${destinoNombre}</div>
          </div>
        </div>

        <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:0.78rem;">
          <strong style="color:#166534; display:block; margin-bottom:4px;">📦 Órdenes Asistenciales Prescritas en Kardex e Imágenes:</strong>
          <div>• <strong>Fármaco / Fluidos:</strong> ${medicamentoSugerido}</div>
          <div>• <strong>Diagnóstico por Imágenes:</strong> ${estudioImgSugerido}</div>
          <div>• <strong>Analítica Laboratorio STAT:</strong> ${panelLab.join(" | ")}</div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:12px; border-top:1px dashed #cbd5e1; padding-top:10px;">
          <div>
            <span style="font-size:0.70rem; font-weight:700; color:#64748b; display:block; margin-bottom:4px;">Suscripción Digital del Acto Médico (Ley N° 27269):</span>
            ${firmaHtml}
          </div>
          <div>
            <button type="button" class="btn-full-primary" style="padding:10px 20px; font-weight:800; font-size:0.82rem;" onclick="if(typeof avanzarDesdeModulo4==='function') avanzarDesdeModulo4()">
              Avanzar con el Paciente al Destino Asignado →
            </button>
          </div>
        </div>
      </div>
    `;
    boxActa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (typeof window.registrarLogAuditoria === "function") {
    window.registrarLogAuditoria("Módulo 4", "EVALUACION_MEDICA_PROTOCOLIZADA", `Evaluación protocolizada por Dr. Carlos Vega. CIE-10: ${cie10}. Destino: ${destinoSugerido}`);
  }

  if (typeof window.mostrarToast === "function") {
    window.mostrarToast("success", `🩺 Protocolo Médico ejecutado. CIE-10: ${cie10.split("—")[0].trim()} · Destino asignado.`);
  }
}
window.ejecutarEvaluacionMedicaProtocolizada = ejecutarEvaluacionMedicaProtocolizada;

function ejecutarJuntaMedicaNTS139() {
  const boxActa = document.getElementById("box_acta_junta_medica");

  if (!STATE.identificador && (!window.PACIENTES_COLA || window.PACIENTES_COLA.length === 0)) {
    alert("⚠️ Por favor ingrese o seleccione un paciente antes de convocar a la Junta Médica.");
    if (typeof irAModulo === "function") irAModulo(1);
    return;
  }

  if (!pacienteActivoId && window.PACIENTES_COLA && window.PACIENTES_COLA.length > 0) {
    if (typeof cambiarPacienteActivo === "function") {
      cambiarPacienteActivo(window.PACIENTES_COLA[0].id);
    }
  }

  const motivo = ((document.getElementById("motivo_mts_select")?.value || "") + " " + (document.getElementById("motivo_full")?.value || "")).toLowerCase();
  let cie10Junta = "A41.9 — Sepsis severa con disfunción multiorgánica (qSOFA ≥ 2)";
  let conductaJunta = "Ingreso urgente a Cuidados Intensivos (UCI) para soporte hemodinámico y ventilatorio invasivo.";
  let camaJunta = "UCI-01";

  if (motivo.includes("trauma") || motivo.includes("accidente") || STATE.esAccidenteTransito) {
    cie10Junta = "T14.9 — Politraumatismo de alta energía con shock hemorrágico y lesión vascular mayor";
    conductaJunta = "Laparotomía exploradora de control de daños y empaquetamiento urgente en Quirófano de Emergencia (SOP-01).";
    camaJunta = "SOP-01";
  } else if (motivo.includes("abdom") || motivo.includes("apendic")) {
    cie10Junta = "K35.8 — Abdomen agudo quirúrgico / Apendicitis perforada con peritonitis fecal difusa";
    conductaJunta = "Cirugía laparoscópica/abierta urgente de control de foco séptico en Quirófano de Emergencia (SOP-01).";
    camaJunta = "SOP-01";
  } else if (motivo.includes("torac") || motivo.includes("infarto") || motivo.includes("corazon")) {
    cie10Junta = "I21.9 — Síndrome coronario agudo con elevación del ST (SCACEST) complicado con shock cardiogénico";
    conductaJunta = "Angioplastia primaria de emergencia / Trombolisis y monitoreo hemodinámico invasivo en UCI.";
    camaJunta = "UCI-01";
  }

  if (typeof seleccionarCIE10 === "function") {
    seleccionarCIE10(cie10Junta);
  }
  if (typeof seleccionarDestinoPostTopico === "function") {
    seleccionarDestinoPostTopico("quirofano_uci");
  }

  if (boxActa) {
    boxActa.style.display = "block";
    const firma1 = generarSelloFirmaDigitalHTML("JUNTA_1");
    const firma2 = generarSelloFirmaDigitalHTML("JUNTA_2");
    const firma3 = generarSelloFirmaDigitalHTML("JUNTA_3");

    boxActa.innerHTML = `
      <div style="background:#ffffff; border:2.5px solid #6366f1; border-radius:12px; padding:18px; box-shadow:0 4px 14px rgba(99,102,241,0.12);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-bottom:1.5px solid #e0e7ff; padding-bottom:10px; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.4rem;">👥</span>
            <div>
              <div style="font-size:0.95rem; font-weight:900; color:#312e81;">ACTA OFICIAL DE JUNTA MÉDICA MULTIDISCIPLINARIA DE EMERGENCIA</div>
              <div style="font-size:0.72rem; color:#6366f1; font-weight:700;">NTS N° 139-MINSA/2018/DGAIN (Art. 6.4) · Decisión Colegiada de Alta Complejidad</div>
            </div>
          </div>
          <span style="background:#ede9fe; color:#5b21b6; font-weight:900; font-size:0.75rem; padding:4px 12px; border-radius:9999px; border:1px solid #c4b5fd;">
            ✓ UNANIMIDAD COLEGIAL (3/3)
          </span>
        </div>

        <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:0.80rem;">
          <div style="margin-bottom:4px;"><strong style="color:#4338ca;">🏷️ Diagnóstico Consensuado (CIE-10):</strong> <span style="font-weight:900; color:#1e1b4b;">${cie10Junta}</span></div>
          <div><strong style="color:#4338ca;">🚀 Dictamen y Conducta Colegiada:</strong> <span style="color:#1e1b4b;">${conductaJunta}</span></div>
          <div style="margin-top:4px;"><strong style="color:#4338ca;">🛏️ Recurso Inmediato Asignado:</strong> <span style="background:#4338ca; color:#ffffff; font-weight:800; padding:2px 8px; border-radius:4px; font-size:0.72rem;">${camaJunta}</span></div>
        </div>

        <div style="margin-bottom:12px;">
          <div style="font-size:0.74rem; font-weight:800; color:#312e81; text-transform:uppercase; margin-bottom:8px; display:flex; justify-content:space-between;">
            <span>Miembros Colegiados Firmantes (Ley N° 27269 de Firmas y Certificados Digitales):</span>
            <span style="color:#16a34a; font-weight:800;">✓ 3 Firmas Digitales PKI Validadas</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:10px;">
            ${firma1}
            ${firma2}
            ${firma3}
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:8px 12px;">
          <span style="font-size:0.72rem; color:#166534; font-weight:700;">
            ⚖️ Acta inmutable registrada en bitácora audit_logs de SUSALUD y archivada en la Historia Clínica digital.
          </span>
          <button type="button" class="btn-full-primary" style="background:#4338ca; padding:8px 16px; font-size:0.80rem; font-weight:800;" onclick="if(typeof avanzarDesdeModulo4==='function') avanzarDesdeModulo4()">
            🚀 Ejecutar Traslado Colegiado a ${camaJunta} →
          </button>
        </div>
      </div>
    `;
    boxActa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (typeof window.registrarLogAuditoria === "function") {
    window.registrarLogAuditoria("Módulo 4", "JUNTA_MEDICA_NTS139", `Acta de Junta Médica aprobada por unanimidad (3/3). Diagnóstico: ${cie10Junta}. Recurso asignado: ${camaJunta}`);
  }

  if (typeof window.mostrarToast === "function") {
    window.mostrarToast("success", `👥 Junta Médica Concluida. CIE-10: ${cie10Junta.split("—")[0].trim()} · Asignado a ${camaJunta}.`);
  }
}
window.ejecutarJuntaMedicaNTS139 = ejecutarJuntaMedicaNTS139;


function seleccionarDestinoPostTopico(ruta) {
  STATE.destinoPostTopico = ruta;
  document.querySelectorAll(".btn-destino-topico").forEach(b => b.classList.remove("active"));
  const btn = document.getElementById(`btn_destino_${ruta}`);
  if (btn) btn.classList.add("active");

  if (ruta === "alta") {
    alert("🩺 Destino Post-Tópico: Alta Médica Directa con Receta y Epicrisis. Derivando al Módulo 7.");
    irAModulo(7);
  } else if (ruta === "observacion") {
    alert("🩺 Destino Post-Tópico: Pase a Sala de Observación de Emergencia (2 a 24 horas). Derivando al Módulo 5.");
    irAModulo(5);
  } else if (ruta === "quirofano_uci") {
    alert("🩺 Destino Post-Tópico: Requiere Quirófano (SOP) o Cama Crítica UCI/UCIN. Derivando al Módulo 6.");
    irAModulo(6);
  }
}


// ===========================================================================
// GESTOR MAESTRO DE RECURSOS, CAMAS Y QUIRÓFANOS EN TIEMPO REAL
// Sustento: NTS N° 042-MINSA/DGSP-V.01 (Servicios de Emergencia) &
//           NTS N° 031-MINSA/DGSP-V.01 (Servicios de Cuidados Intensivos)
// ===========================================================================

let filtroRecursoActivo = "todos";
let cronometroRecursosInterval = null;

const RECURSOS_HOSPITALARIOS = {
  // --- CENTRO QUIRÚRGICO DE EMERGENCIA (QUIRÓFANOS SOP) ---
  "SOP-01": {
    id: "SOP-01",
    tipo: "quirofano",
    nombre: "Quirófano 1 (SOP 1 - Trauma Shock / Cirugía Crítica)",
    area: "Centro Quirúrgico",
    categoria: "Cirugía de Emergencia Vital",
    icono: "🔪",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 2,
    horasAmpliadas: 0,
    motivo: "Laparotomía de Control de Daños / Toracotomía de Urgencia",
    norma: "NTS N° 042-MINSA (Tiempo quirúrgico crítico)",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "SOP-02": {
    id: "SOP-02",
    tipo: "quirofano",
    nombre: "Quirófano 2 (SOP 2 - Cirugía General de Urgencia)",
    area: "Centro Quirúrgico",
    categoria: "Cirugía de Urgencia",
    icono: "🔪",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 2,
    horasAmpliadas: 0,
    motivo: "Apendicectomía de Emergencia (En acto quirúrgico)",
    norma: "NTS N° 042-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "SOP-03": {
    id: "SOP-03",
    tipo: "quirofano",
    nombre: "Quirófano 3 (SOP 3 - Gineco-Obstétrica / Cesáreas)",
    area: "Centro Quirúrgico",
    categoria: "Emergencia Gineco-Obstétrica",
    icono: "👶",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 1.5,
    horasAmpliadas: 0,
    motivo: "Cesárea de Emergencia / Clave Roja Obstétrica",
    norma: "NTS N° 042-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },

  // --- SALA DE OBSERVACIÓN DE EMERGENCIA (ESTANCIA MÁX 12H - NTS N° 042-MINSA) ---
  "OBS-01": {
    id: "OBS-01",
    tipo: "observacion",
    nombre: "Cama OBS-01 (Observación Adultos Varones)",
    area: "Sala de Observación",
    categoria: "Corta Estancia Adultos",
    icono: "🛏️",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 6,
    horasAmpliadas: 0,
    motivo: "Dolor Abdominal Agudo en estudio (Evaluación seriada NTS 042)",
    norma: "NTS N° 042-MINSA (Estancia estándar máx 12h)",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "OBS-02": {
    id: "OBS-02",
    tipo: "observacion",
    nombre: "Cama OBS-02 (Observación Adultos Mujeres)",
    area: "Sala de Observación",
    categoria: "Corta Estancia Adultos",
    icono: "🛏️",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 6,
    horasAmpliadas: 0,
    motivo: "Monitoreo Clínico Seriado y Reevaluación",
    norma: "NTS N° 042-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "OBS-03": {
    id: "OBS-03",
    tipo: "observacion",
    nombre: "Cama OBS-03 (Observación Quirúrgica / Abdomen Agudo)",
    area: "Sala de Observación",
    categoria: "Evaluación Quirúrgica",
    icono: "🛏️",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 6,
    horasAmpliadas: 0,
    motivo: "Descarte de Abdomen Agudo Quirúrgico / Ecografía de control",
    norma: "NTS N° 042-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "OBS-04": {
    id: "OBS-04",
    tipo: "observacion",
    nombre: "Cama OBS-04 (Observación Neuro-Trauma / TEC)",
    area: "Sala de Observación",
    categoria: "Neurología / Monitoreo",
    icono: "🧠",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 8,
    horasAmpliadas: 0,
    motivo: "Monitoreo Horario Escala Glasgow / TEC Leve-Moderado",
    norma: "NTS N° 042-MINSA (Monitoreo neurológico 8 a 12h)",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "OBS-05": {
    id: "OBS-05",
    tipo: "observacion",
    nombre: "Cama OBS-05 (Observación Aislados / Infeccioso)",
    area: "Sala de Observación",
    categoria: "Aislamiento Infeccioso",
    icono: "🦠",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 6,
    horasAmpliadas: 0,
    motivo: "Deshidratación Severa / Aislamiento Entérico o Respiratorio",
    norma: "NTS N° 042-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "OBS-06": {
    id: "OBS-06",
    tipo: "observacion",
    nombre: "Cama OBS-06 (Observación Pediátrica)",
    area: "Sala de Observación",
    categoria: "Pediatría de Emergencia",
    icono: "🧸",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 6,
    horasAmpliadas: 0,
    motivo: "Crisis Asmática / Terapia Inhalatoria y Saturometría horaria",
    norma: "NTS N° 042-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },

  // --- SHOCK TRAUMA / REANIMACIÓN VITAL ---
  "ST-01": {
    id: "ST-01",
    tipo: "shock_trauma",
    nombre: "Cama ST-01 (Shock Trauma Reanimación 1)",
    area: "Shock Trauma",
    categoria: "Prioridad I Vital",
    icono: "⚡",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 2,
    horasAmpliadas: 0,
    motivo: "Soporte Hemodinámico Avanzado / Politrauma Shock",
    norma: "NTS N° 042-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "ST-02": {
    id: "ST-02",
    tipo: "shock_trauma",
    nombre: "Cama ST-02 (Shock Trauma Reanimación 2)",
    area: "Shock Trauma",
    categoria: "Prioridad I Vital",
    icono: "⚡",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 2,
    horasAmpliadas: 0,
    motivo: "Paro Cardiorrespiratorio Revertido / Monitoreo Invasivo",
    norma: "NTS N° 042-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },

  // --- SALA URPA (RECUPERACIÓN POST-ANESTÉSICA) ---
  "URPA-01": {
    id: "URPA-01",
    tipo: "urpa",
    nombre: "Cama URPA-01 (Recuperación Post-Anestésica)",
    area: "URPA",
    categoria: "Post-Quirúrgico Inmediato",
    icono: "🛌",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 3,
    horasAmpliadas: 0,
    motivo: "Monitoreo Escala Aldrete post-operatorio",
    norma: "NTS N° 042-MINSA (Recuperación 2 a 4h)",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "URPA-02": {
    id: "URPA-02",
    tipo: "urpa",
    nombre: "Cama URPA-02 (Recuperación Post-Anestésica)",
    area: "URPA",
    categoria: "Post-Quirúrgico Inmediato",
    icono: "🛌",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 3,
    horasAmpliadas: 0,
    motivo: "Monitoreo Escala Aldrete post-operatorio",
    norma: "NTS N° 042-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },

  // --- UNIDAD DE CUIDADOS INTENSIVOS (UCI / UCIN) ---
  "UCI-01": {
    id: "UCI-01",
    tipo: "uci",
    nombre: "Cama UCI-01 (Cuidados Intensivos Adultos - Ventilador)",
    area: "UCI Adultos",
    categoria: "Prioridad 1 UCI",
    icono: "🏥",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 24,
    horasAmpliadas: 0,
    motivo: "Ventilación Mecánica Invasiva y Soporte Vasopresor",
    norma: "NTS N° 031-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "UCI-02": {
    id: "UCI-02",
    tipo: "uci",
    nombre: "Cama UCI-02 (Cuidados Intermedios - UCIN)",
    area: "UCIN",
    categoria: "Prioridad 2 UCI",
    icono: "🏥",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 18,
    horasAmpliadas: 0,
    motivo: "Monitoreo Invasivo Continuo y Hemodiálisis de Urgencia",
    norma: "NTS N° 031-MINSA",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "SILLON-01": {
    id: "SILLON-01",
    tipo: "sillon",
    nombre: "Sillón de Hidratación / Nebulización",
    area: "Tópico de Urgencias",
    categoria: "Terapia Rápida Ambulatoria",
    icono: "🪑",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 2,
    horasAmpliadas: 0,
    motivo: "Hidratación EV rápida / Nebulizaciones seriadas",
    norma: "NTS N° 042-MINSA (Procedimiento ambulatorio)",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  },
  "SIN-CAMA": {
    id: "SIN-CAMA",
    tipo: "ambulatorio",
    nombre: "Sin cama — Atención Ambulatoria / Tópico",
    area: "Atención Ambulatoria",
    categoria: "Atención Ambulatoria / P-IV y P-V",
    icono: "🚶",
    estado: "disponible",
    paciente: null,
    inicioMs: null,
    finMs: null,
    duracionHoras: 1,
    horasAmpliadas: 0,
    motivo: "Consulta médica ambulatoria / Sin requerimiento de cama hospitalaria",
    norma: "NTS N° 042-MINSA (No urgente)",
    tiempoFormateado: "--:--:--",
    progresoPct: 0
  }
};

window.RECURSOS_HOSPITALARIOS = RECURSOS_HOSPITALARIOS;

// INICIALIZADOR DEL SISTEMA DE CRONÓMETROS
function iniciarCronometrosRecursos() {
  if (cronometroRecursosInterval) clearInterval(cronometroRecursosInterval);
  cronometroRecursosInterval = setInterval(tickCronometrosCamas, 1000);
  tickCronometrosCamas();
}

function tickCronometrosCamas() {
  const ahora = Date.now();
  let camasOcupadas = 0;
  let camasDisponibles = 0;

  for (const id in RECURSOS_HOSPITALARIOS) {
    const rec = RECURSOS_HOSPITALARIOS[id];

    if (rec.estado === "ocupada" && rec.finMs) {
      camasOcupadas++;
      const restanteMs = rec.finMs - ahora;

      if (restanteMs <= 0) {
        // ¡TIEMPO COMPLETADO!
        liberarRecursoPorExpiracion(id);
      } else {
        const totalSeg = Math.floor(restanteMs / 1000);
        const h = Math.floor(totalSeg / 3600);
        const m = Math.floor((totalSeg % 3600) / 60);
        const s = totalSeg % 60;
        rec.tiempoFormateado = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

        const transcurrido = ahora - rec.inicioMs;
        const totalDur = rec.finMs - rec.inicioMs;
        rec.progresoPct = totalDur > 0 ? Math.min(100, Math.max(0, (transcurrido / totalDur) * 100)) : 0;
      }
    } else {
      camasDisponibles++;
      rec.tiempoFormateado = "--:--:--";
      rec.progresoPct = 0;
    }
  }

  // Actualizar elementos DOM dinámicamente
  actualizarTelemetriaDomCronometros(camasDisponibles, camasOcupadas);
}

function actualizarTelemetriaDomCronometros(disponibles, ocupadas) {
  const total = disponibles + ocupadas;
  const textoResumen = `${disponibles}/${total} Libres`;

  const elNavbar = document.getElementById("lbl_navbar_dispo_resumen");
  if (elNavbar) elNavbar.textContent = textoResumen;

  const elBadgeTotal = document.getElementById("badge_resumen_recursos_total");
  if (elBadgeTotal) {
    elBadgeTotal.textContent = `🟢 ${disponibles} de ${total} Disponibles`;
    elBadgeTotal.style.background = disponibles > 3 ? "#dcfce7" : "#fee2e2";
    elBadgeTotal.style.color = disponibles > 3 ? "#15803d" : "#991b1b";
  }

  const elBadgeModal = document.getElementById("badge_modal_dispo_resumen");
  if (elBadgeModal) elBadgeModal.textContent = `${disponibles} / ${total} Libres`;

  // Actualizar Monitor de Módulo 5 (Cama Activa de Observación)
  const idObsActiva = (STATE.camaAsignadaId && STATE.camaAsignadaId !== "SIN-CAMA" && RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId]) ? STATE.camaAsignadaId : null;
  const recObs = idObsActiva ? RECURSOS_HOSPITALARIOS[idObsActiva] : null;

  if (recObs) {
    const elTiempoM5 = document.getElementById("lbl_m5_tiempo_restante");
    if (elTiempoM5) {
      elTiempoM5.textContent = recObs.estado === "ocupada" ? recObs.tiempoFormateado : "00:00:00 (LIBRE)";
      elTiempoM5.style.color = recObs.estado === "ocupada" ? "#dc2626" : "#16a34a";
    }

    const elBarM5 = document.getElementById("bar_m5_progreso_estancia");
    if (elBarM5) {
      elBarM5.style.width = recObs.estado === "ocupada" ? `${recObs.progresoPct.toFixed(1)}%` : "0%";
    }

    const elBadgeEstancia = document.getElementById("estancia_estado_badge");
    const elAlertaInfraccion = document.getElementById("alerta_infraccion_estancia");

    if (recObs.duracionHoras > 24) {
      if (elBadgeEstancia) {
        elBadgeEstancia.textContent = `🚨 ${recObs.duracionHoras}h: Supera 24h (Infracción NTS 042)`;
        elBadgeEstancia.className = "estancia-badge estancia-rojo";
      }
      if (elAlertaInfraccion) elAlertaInfraccion.style.display = "block";
    } else if (recObs.duracionHoras > 12) {
      if (elBadgeEstancia) {
        elBadgeEstancia.textContent = `⚠️ ${recObs.duracionHoras}h: Estancia Límite (Reevaluar)`;
        elBadgeEstancia.className = "estancia-badge estancia-ambar";
      }
      if (elAlertaInfraccion) elAlertaInfraccion.style.display = "none";
    } else {
      if (elBadgeEstancia) {
        elBadgeEstancia.textContent = `⏱️ ${recObs.duracionHoras}h: Monitoreo Normal (NTS 042)`;
        elBadgeEstancia.className = "estancia-badge estancia-verde";
      }
      if (elAlertaInfraccion) elAlertaInfraccion.style.display = "none";
    }
  }

  // Actualizar cronómetros en el grid de Módulo 6 y modal sin redibujar tarjetas enteras
  for (const id in RECURSOS_HOSPITALARIOS) {
    const rec = RECURSOS_HOSPITALARIOS[id];
    document.querySelectorAll(`.recurso-timer-val-${id}`).forEach(el => {
      el.textContent = rec.tiempoFormateado;
    });
    document.querySelectorAll(`.recurso-progress-val-${id}`).forEach(el => {
      el.style.width = `${rec.progresoPct.toFixed(1)}%`;
    });
  }

  if (typeof actualizarWidgetFlotanteCamas === "function") {
    actualizarWidgetFlotanteCamas();
  }
}

// RENDERIZADO DEL TABLERO EN MÓDULO 6 Y EN EL MODAL FLOTANTE
function renderizarTableroCamasYQuirofanos(filtro = null, targetContainerId = "camas_stock_grid") {
  if (filtro) filtroRecursoActivo = filtro;
  const f = filtroRecursoActivo || "todos";

  const container = document.getElementById(targetContainerId);
  if (!container) return;

  let html = "";

  for (const id in RECURSOS_HOSPITALARIOS) {
    const rec = RECURSOS_HOSPITALARIOS[id];

    // Aplicar filtro
    if (f !== "todos" && rec.tipo !== f) continue;

    const esOcupada = rec.estado === "ocupada";
    let claseCard = esOcupada ? "recurso-card ocupada" : "recurso-card disponible";

    if (esOcupada && rec.duracionHoras > 24) claseCard = "recurso-card alerta-roja";
    else if (esOcupada && rec.duracionHoras > 12) claseCard = "recurso-card alerta-ambar";

    let badgeTipoCls = `recurso-tipo-${rec.tipo}`;

    html += `
      <div class="${claseCard}" id="card_recurso_${id}">
        <!-- ENCABEZADO -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div>
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:1.2rem;">${rec.icono || "🛏️"}</span>
              <strong style="font-size:0.86rem; color:#0f172a;">${rec.id}</strong>
              <span class="recurso-tipo-badge ${badgeTipoCls}">${rec.tipo.replace("_", " ")}</span>
            </div>
            <div style="font-size:0.75rem; font-weight:700; color:#334155; margin-top:2px;">
              ${rec.nombre}
            </div>
          </div>
          <div>
            ${esOcupada 
              ? `<span style="background:#fee2e2; color:#991b1b; font-size:0.7rem; padding:2px 7px; border-radius:9999px; font-weight:800; border:1px solid #fca5a5;">🔴 OCUPADA</span>`
              : `<span style="background:#dcfce7; color:#15803d; font-size:0.7rem; padding:2px 7px; border-radius:9999px; font-weight:800; border:1px solid #86efac;">🟢 DISPONIBLE</span>`
            }
          </div>
        </div>

        <!-- CUERPO DE ESTADO -->
        <div style="font-size:0.74rem; color:#475569; margin-bottom:10px; background:#f8fafc; padding:8px; border-radius:8px; border:1px solid #f1f5f9;">
          ${esOcupada ? `
            <div><strong>Paciente:</strong> <span style="color:#0f172a; font-weight:700;">${rec.paciente?.nombre || "Paciente"}</span> (DNI: ${rec.paciente?.dni || "—"})</div>
            <div style="margin-top:2px;"><strong>Diagnóstico:</strong> ${rec.paciente?.diagnostico || rec.motivo}</div>
            <div style="margin-top:2px;"><strong>Médico:</strong> ${rec.paciente?.medico || STATE.medicoTratante}</div>
            
            <div class="timer-display-box" style="margin-top:6px; background:#ffffff;">
              <span class="timer-pulsing-dot"></span>
              <span class="recurso-timer-val-${id}" style="color:#dc2626;">${rec.tiempoFormateado}</span>
              <span style="font-size:0.68rem; color:#64748b; font-family:sans-serif;">(${rec.duracionHoras}h prog.)</span>
            </div>
            
            <div class="recurso-progress-track">
              <div class="recurso-progress-bar recurso-progress-val-${id}" style="width:${rec.progresoPct.toFixed(1)}%;"></div>
            </div>

            <div style="font-size:0.68rem; color:${rec.duracionHoras>12?'#b45309':'#166534'}; font-weight:700;">
              ${rec.horasAmpliadas > 0 ? `➕ Horas ampliadas: +${rec.horasAmpliadas}h | Total: ${rec.duracionHoras}h` : `⏱️ Estancia estándar reglamentaria: ${rec.duracionHoras}h`}
            </div>
          ` : `
            <div style="color:#166534; font-weight:700;">✅ Cama libre y desinfectada lista para admisión.</div>
            <div style="margin-top:3px; color:#64748b;"><strong>Estancia reglamentaria:</strong> ${rec.duracionHoras} horas (${rec.norma})</div>
            <div style="margin-top:2px; color:#64748b;"><strong>Destino habitual:</strong> ${rec.motivo}</div>
          `}
        </div>

        <!-- ACCIONES -->
        <div style="display:flex; flex-direction:column; gap:5px;">
          ${esOcupada ? `
            <div style="display:flex; gap:4px; flex-wrap:wrap;">
              <button type="button" class="btn-full-secondary" style="flex:1; font-size:0.68rem; padding:3px 4px; font-weight:700;" onclick="ampliarHorasObservacion('${id}', 2, 'Reevaluación clínica de síntomas')" title="Amplía 2 horas">
                +2h Obs
              </button>
              <button type="button" class="btn-full-secondary" style="flex:1; font-size:0.68rem; padding:3px 4px; font-weight:700;" onclick="ampliarHorasObservacion('${id}', 4, 'Espera de exámenes auxiliares')" title="Amplía 4 horas">
                +4h Obs
              </button>
              <button type="button" class="btn-full-secondary" style="flex:1; font-size:0.68rem; padding:3px 4px; font-weight:700;" onclick="acelerarTiempoDemo('${id}')" title="Acelera 1 hora para probar el contador">
                ⚡ +1h Demo
              </button>
              <button type="button" class="btn-full-secondary" style="flex:1; font-size:0.68rem; padding:3px 4px; font-weight:700; color:#dc2626; border-color:#fca5a5;" onclick="finalizarTiempoAhora('${id}')" title="Fuerza al contador a terminar para ver la liberación">
                ⏩ Fin Demo
              </button>
            </div>
            <button type="button" class="btn-full-secondary" style="width:100%; font-size:0.72rem; padding:4px 6px; font-weight:700; background:#f0fdf4; color:#15803d; border-color:#86efac; margin-top:2px;" onclick="liberarCamaRecurso('${id}', 'Alta Médica')">
              🔓 Dar de Alta y Liberar Cama
            </button>
          ` : `
            <button type="button" class="btn-full-primary" style="width:100%; font-size:0.75rem; padding:5px 8px; font-weight:700; background:#0f172a;" onclick="asignarPacienteActualARecurso('${id}')">
              🛏️ Asignar Paciente Actual
            </button>
          `}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// FILTRADO DEL TABLERO
function filtrarTableroRecursos(tipo, btn = null) {
  filtroRecursoActivo = tipo;
  if (btn) {
    document.querySelectorAll("#filtros_recursos_container .chip-filtro-recurso").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }
  renderizarTableroCamasYQuirofanos(tipo, "camas_stock_grid");
}

function filtrarTableroModal(tipo, btn = null) {
  if (btn) {
    document.querySelectorAll("#filtros_modal_container .chip-filtro-recurso").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }
  renderizarTableroCamasYQuirofanos(tipo, "modal_camas_stock_grid");
}

// ASIGNACIÓN DE RECURSO A PACIENTE
function asignarPacienteActualARecurso(idRecurso, duracionManual = null, motivoManual = null, silencioso = false) {
  const rec = RECURSOS_HOSPITALARIOS[idRecurso];
  if (!rec) return;

  if (rec.estado === "ocupada") {
    alert(`⛔ El recurso ${rec.nombre} ya se encuentra ocupado. Seleccione otra cama o libérela.`);
    return;
  }

  const horas = parseFloat(duracionManual) || rec.duracionHoras || 6;
  const motivo = motivoManual || STATE.cie10Descripcion || rec.motivo;

  rec.estado = "ocupada";
  rec.duracionHoras = horas;
  rec.horasAmpliadas = 0;
  rec.inicioMs = Date.now();
  rec.finMs = rec.inicioMs + (horas * 3600 * 1000);
  rec.motivo = motivo;

  rec.paciente = {
    nombre: STATE.identificador || "Paciente en Atención",
    dni: STATE.numDni || "—",
    prioridad: STATE.prioridad || "III",
    diagnostico: motivo,
    medico: STATE.medicoTratante || "Médico de Guardia"
  };

  STATE.camaAsignada = rec.nombre;
  STATE.camaAsignadaId = rec.id;

  // Facturar estancia/derecho de sala
  if (rec.tipo === "quirofano") {
    registrarFacturaItem(`Derecho de Quirófano (${rec.id})`, 400, "Procedimientos");
  } else if (rec.tipo === "uci") {
    registrarFacturaItem(`Cama UCI / Soporte Crítico (${rec.id})`, 500, "Hospitalización");
  } else if (rec.tipo === "urpa") {
    registrarFacturaItem(`Cama URPA (${rec.id})`, 120, "Hospitalización");
  } else {
    registrarFacturaItem(`Cama de Observación (${rec.id})`, 150, "Hospitalización");
  }

  // Sincronizar badges y displays
  renderizarTableroCamasYQuirofanos();
  if (document.getElementById("modalTableroCamasOverlay")?.classList.contains("open")) {
    renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
  }
  renderizarMonitorObservacionModulo5();
  actualizarFactura();
  if (typeof actualizarWidgetFlotanteCamas === "function") {
    actualizarWidgetFlotanteCamas();
  }

  if (!silencioso) alert(`✅ ASIGNACIÓN CONFIRMADA:\n\n${rec.nombre}\nPaciente: ${rec.paciente.nombre}\nEstancia programada: ${horas} horas (${rec.norma})\n\nEl contador en tiempo real ha iniciado.`);
}

// AMPLIACIÓN DE HORAS DE OBSERVACIÓN (REQUERIMIENTO CLAVE)
function ampliarHorasObservacion(idRecurso, horasExtra, motivoClinico = "Reevaluación de síntomas") {
  const rec = RECURSOS_HOSPITALARIOS[idRecurso];
  if (!rec || rec.estado !== "ocupada") return;

  const h = parseFloat(horasExtra) || 2;
  rec.finMs += (h * 3600 * 1000);
  rec.duracionHoras += h;
  rec.horasAmpliadas = (rec.horasAmpliadas || 0) + h;
  rec.motivoAmpliacion = motivoClinico;

  // Registrar en bitácora de auditoría
  const logMsg = `⏱️ Ampliación +${h}h concedida para ${rec.id}: ${motivoClinico}. Total acumulado: ${rec.duracionHoras}h.`;
  console.log(logMsg);

  const elLogM5 = document.getElementById("lbl_m5_ampliaciones_log");
  if (elLogM5) {
    elLogM5.textContent = `✅ ${logMsg}`;
    elLogM5.style.display = "block";
  }

  // Evaluar alertas normativas NTS N° 042-MINSA
  if (rec.duracionHoras > 24) {
    alert(`🚨 ALERTA CRÍTICA DE AUDITORÍA (NTS N° 042-MINSA):\n\nLa cama ${rec.nombre} ha acumulado ${rec.duracionHoras} horas en observación.\nSupera el límite legal de 24 horas. Es obligatorio tramitar internamiento en hospitalización o activar derivación REFCON.`);
  } else if (rec.duracionHoras > 12) {
    alert(`⚠️ ADVERTENCIA NORMATIVA (NTS N° 042-MINSA):\n\nLa estancia acumulada de ${rec.nombre} ha alcanzado ${rec.duracionHoras} horas (supera las 12 horas estándar).\nSe requiere consignar la nota médica de evolución en la historia clínica.`);
  } else {
    alert(`⏱️ Ampliación de Observación Confirmada:\n\nSe añadieron +${h} horas a la cama ${rec.nombre}.\nNuevo tiempo total de permanencia: ${rec.duracionHoras} horas.\nMotivo: ${motivoClinico}.`);
  }

  // Refrescar cronómetro al instante
  tickCronometrosCamas();
  renderizarTableroCamasYQuirofanos();
  if (document.getElementById("modalTableroCamasOverlay")?.classList.contains("open")) {
    renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
  }
}

// LIBERACIÓN MANUAL O POR ALTA
// ------------------------------------------------------------------------------
// SINCRONIZACIÓN AUTOMÁTICA DE STOCK_CAMAS CON RECURSOS_HOSPITALARIOS
// ------------------------------------------------------------------------------
function sincronizarStockCamasConRecursos() {
  if (typeof RECURSOS_HOSPITALARIOS === "undefined" || typeof STOCK_CAMAS === "undefined") return;
  let tsLibres = 0, tsTotal = 0;
  let obsLibres = 0, obsTotal = 0;

  for (const id in RECURSOS_HOSPITALARIOS) {
    const rec = RECURSOS_HOSPITALARIOS[id];
    if (rec.tipo === "shock_trauma") {
      tsTotal++;
      if (rec.estado === "disponible") tsLibres++;
    } else if (rec.tipo === "observacion") {
      obsTotal++;
      if (rec.estado === "disponible") obsLibres++;
    }
  }

  if (STOCK_CAMAS["Trauma Shock"]) {
    STOCK_CAMAS["Trauma Shock"].total = tsTotal || 2;
    STOCK_CAMAS["Trauma Shock"].disponible = tsLibres;
  }
  if (STOCK_CAMAS["Observación"]) {
    STOCK_CAMAS["Observación"].total = obsTotal || 4;
    STOCK_CAMAS["Observación"].disponible = obsLibres;
  }
}

// ------------------------------------------------------------------------------
// LIBERACIÓN CENTRALIZADA DE CAMAS AL CONCLUIR ATENCIÓN (DESCUENTO EN TODOS LOS CONTADORES)
// NTS N° 042-MINSA: Las camas son asignadas por el Médico y liberadas al alta/cierre
// ------------------------------------------------------------------------------
function liberarCamaTotalPaciente(idExpediente = null, motivo = "Conclusión de Atención / Alta Médica") {
  const idBuscar = idExpediente || pacienteActivoId || STATE.id;
  let camaLiberada = false;

  // 1. Liberar en RECURSOS_HOSPITALARIOS cualquier recurso ocupado por este paciente
  if (typeof RECURSOS_HOSPITALARIOS !== "undefined") {
    for (const idCama in RECURSOS_HOSPITALARIOS) {
      const rec = RECURSOS_HOSPITALARIOS[idCama];
      const esEstePaciente = rec.paciente && (
        rec.paciente.id === idBuscar ||
        (idBuscar && rec.paciente.id && rec.paciente.id.includes(idBuscar)) ||
        (STATE.identificador && rec.paciente.nombre === STATE.identificador) ||
        (STATE.numDni && rec.paciente.dni === STATE.numDni)
      );
      const esCamaActiva = Boolean(STATE.camaAsignadaId && STATE.camaAsignadaId === idCama);

      if (rec.estado === "ocupada" && (esEstePaciente || esCamaActiva)) {
        rec.estado = "disponible";
        rec.paciente = null;
        rec.inicioMs = null;
        rec.finMs = null;
        rec.horasAmpliadas = 0;
        rec.tiempoFormateado = "--:--:--";
        rec.progresoPct = 0;
        camaLiberada = true;
        console.log(`🔓 Cama ${idCama} liberada para paciente ${idBuscar} (${motivo}).`);
      }
    }
  }

  // 2. Liberar en STOCK_CAMAS
  sincronizarStockCamasConRecursos();

  // 3. Resetear variables de cama en STATE
  STATE.camaAsignada = null;
  STATE.camaAsignadaId = null;

  // 4. Limpiar en PACIENTES_COLA si aplica
  if (Array.isArray(PACIENTES_COLA)) {
    const px = PACIENTES_COLA.find(x => x.id === idBuscar);
    if (px) {
      px.camaId = null;
      px.camaNombre = "Sin Cama";
    }
  }

  // 5. Ocultar y actualizar displays en el DOM
  const elCamaDisp = document.getElementById("camaAsignadaDisplay");
  if (elCamaDisp) elCamaDisp.style.display = "none";

  const dispCamaM5 = document.getElementById("cama_asignada_display");
  if (dispCamaM5) dispCamaM5.textContent = "Sin cama asignada";

  const lblM5Nombre = document.getElementById("lbl_m5_cama_nombre");
  if (lblM5Nombre) lblM5Nombre.textContent = "🛏️ Ninguna cama asignada";

  const lblM5Estado = document.getElementById("lbl_m5_cama_estado");
  if (lblM5Estado) {
    lblM5Estado.textContent = "DISPONIBLE";
    lblM5Estado.style.background = "#f1f5f9";
    lblM5Estado.style.color = "#475569";
  }

  const lblM5Tiempo = document.getElementById("lbl_m5_tiempo_restante");
  if (lblM5Tiempo) {
    lblM5Tiempo.textContent = "--:--:--";
    lblM5Tiempo.style.color = "#64748b";
  }

  const lblM5TotalInfo = document.getElementById("lbl_m5_tiempo_total_info");
  if (lblM5TotalInfo) lblM5TotalInfo.textContent = "(Sin cama asignada)";

  const barM5 = document.getElementById("bar_m5_progreso_estancia");
  if (barM5) barM5.style.width = "0%";

  const badgeEstancia = document.getElementById("estancia_estado_badge");
  if (badgeEstancia) {
    badgeEstancia.textContent = "En espera de indicación médica";
    badgeEstancia.className = "estancia-badge estancia-verde";
  }

  // 6. ACTUALIZAR TODOS LOS INDICADORES Y CONTADORES DE CAMAS DEL SISTEMA
  try {
    if (typeof tickCronometrosCamas === "function") tickCronometrosCamas();
    if (typeof renderizarTableroCamasYQuirofanos === "function") renderizarTableroCamasYQuirofanos();
    if (typeof renderizarStockCamas === "function") renderizarStockCamas();
    if (typeof actualizarWidgetFlotanteCamas === "function") actualizarWidgetFlotanteCamas();
    if (typeof renderizarMonitorObservacionModulo5 === "function") renderizarMonitorObservacionModulo5();
    if (typeof window.actualizarCamasMonitorEnTiempoReal === "function") window.actualizarCamasMonitorEnTiempoReal();
    if (document.getElementById("modalTableroCamasOverlay")?.classList.contains("open")) {
      renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
    }
    if (window.COCKPIT && typeof window.COCKPIT.actualizarContextoCockpit === "function") {
      window.COCKPIT.actualizarContextoCockpit();
    }
    if (window.COCKPIT && typeof window.COCKPIT.actualizarTarjetaResumenTriaje === "function") {
      window.COCKPIT.actualizarTarjetaResumenTriaje();
    }
    if (typeof renderizarTableroColaPacientes === "function") renderizarTableroColaPacientes();
    if (typeof renderizarTrackBoardLista === "function") renderizarTrackBoardLista();
    if (typeof renderizarBandejaPosta === "function") renderizarBandejaPosta();
  } catch(eRefCamas) {
    console.warn("Aviso al refrescar contadores de camas:", eRefCamas);
  }

  return camaLiberada;
}
window.liberarCamaTotalPaciente = liberarCamaTotalPaciente;

function liberarCamaRecurso(idRecurso, motivoSalida = "Alta Médica") {
  const rec = RECURSOS_HOSPITALARIOS[idRecurso];
  if (!rec || rec.estado !== "ocupada") return;

  const pacienteNombre = rec.paciente?.nombre || "Paciente";
  rec.estado = "disponible";
  rec.paciente = null;
  rec.inicioMs = null;
  rec.finMs = null;
  rec.horasAmpliadas = 0;
  rec.tiempoFormateado = "--:--:--";
  rec.progresoPct = 0;

  if (STATE.camaAsignadaId === idRecurso) {
    STATE.camaAsignada = null;
    STATE.camaAsignadaId = null;
  }

  tickCronometrosCamas();
  renderizarTableroCamasYQuirofanos();
  if (document.getElementById("modalTableroCamasOverlay")?.classList.contains("open")) {
    renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
  }
  renderizarMonitorObservacionModulo5();
  if (typeof window.actualizarCamasMonitorEnTiempoReal === "function") {
    window.actualizarCamasMonitorEnTiempoReal();
  }
  if (window.COCKPIT && typeof window.COCKPIT.actualizarContextoCockpit === "function") {
    window.COCKPIT.actualizarContextoCockpit();
  }
  if (typeof actualizarWidgetFlotanteCamas === "function") {
    actualizarWidgetFlotanteCamas();
  }

  alert(`🔓 RECURSO LIBERADO:\n\n${rec.nombre} ha quedado libre.\nMotivo: ${motivoSalida} de ${pacienteNombre}.\nLa cama se encuentra disponible para nueva asignación.`);
}

// LIBERACIÓN AUTOMÁTICA POR CUMPLIMIENTO DE CONTADOR
function liberarRecursoPorExpiracion(idRecurso) {
  const rec = RECURSOS_HOSPITALARIOS[idRecurso];
  if (!rec || rec.estado !== "ocupada") return;

  const nombrePac = rec.paciente?.nombre || "Paciente";
  const horasTot = rec.duracionHoras;

  rec.estado = "disponible";
  rec.paciente = null;
  rec.inicioMs = null;
  rec.finMs = null;
  rec.horasAmpliadas = 0;
  rec.tiempoFormateado = "--:--:--";
  rec.progresoPct = 0;

  if (STATE.camaAsignadaId === idRecurso) {
    STATE.camaAsignada = null;
    STATE.camaAsignadaId = null;
  }

  tickCronometrosCamas();
  renderizarTableroCamasYQuirofanos();
  if (document.getElementById("modalTableroCamasOverlay")?.classList.contains("open")) {
    renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
  }
  renderizarMonitorObservacionModulo5();
  if (typeof actualizarWidgetFlotanteCamas === "function") {
    actualizarWidgetFlotanteCamas();
  }

  alert(`⏰ TIEMPO DE OBSERVACIÓN COMPLETADO:\n\nLa cama ${rec.nombre} ha cumplido sus ${horasTot} horas de estancia programada para el paciente ${nombrePac}.\n\n✅ La cama ha sido liberada automáticamente conforme a la NTS N° 042-MINSA y se encuentra disponible para admisión.`);
}

// CONTROLES DE DEMO / SIMULACIÓN ACELERADA
function acelerarTiempoDemo(idRecurso) {
  const rec = RECURSOS_HOSPITALARIOS[idRecurso];
  if (!rec || rec.estado !== "ocupada" || !rec.finMs) return;

  rec.finMs -= (3600 * 1000); // Adelanta 1 hora
  tickCronometrosCamas();
}

function finalizarTiempoAhora(idRecurso) {
  const rec = RECURSOS_HOSPITALARIOS[idRecurso];
  if (!rec || rec.estado !== "ocupada" || !rec.finMs) return;

  rec.finMs = Date.now() + 1000; // Queda 1 segundo
  tickCronometrosCamas();
}

// CONTROLADORES ESPECÍFICOS DE MÓDULO 5
function renderizarMonitorObservacionModulo5() {
  const idObs = STATE.camaAsignadaId && RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId] ? STATE.camaAsignadaId : "OBS-01";
  const rec = RECURSOS_HOSPITALARIOS[idObs];
  if (!rec) return;

  const elNom = document.getElementById("lbl_m5_cama_nombre");
  if (elNom) elNom.textContent = `🛏️ ${rec.nombre}`;

  const elEstado = document.getElementById("lbl_m5_cama_estado");
  if (elEstado) {
    elEstado.textContent = rec.estado === "ocupada" ? "OCUPADA" : "DISPONIBLE";
    elEstado.style.background = rec.estado === "ocupada" ? "#fee2e2" : "#dcfce7";
    elEstado.style.color = rec.estado === "ocupada" ? "#991b1b" : "#15803d";
  }

  const elPac = document.getElementById("lbl_m5_paciente_info");
  if (elPac) {
    if (rec.estado === "ocupada" && rec.paciente) {
      elPac.textContent = `Paciente: ${rec.paciente.nombre} (DNI ${rec.paciente.dni}) | Diagnóstico: ${rec.paciente.diagnostico}`;
    } else {
      elPac.textContent = "Sin paciente actualmente. Cama libre para asignación.";
    }
  }

  const elTotalInfo = document.getElementById("lbl_m5_tiempo_total_info");
  if (elTotalInfo) {
    elTotalInfo.textContent = `(De ${rec.duracionHoras} horas programadas)`;
  }
}

function aplicarNormaHorasObservacion(valor) {
  const parts = String(valor).split("|");
  const horas = parseFloat(parts[0]) || 6;
  const motivo = parts[1] || "Observación clínica";

  const idObs = STATE.camaAsignadaId && RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId] ? STATE.camaAsignadaId : "OBS-01";
  const rec = RECURSOS_HOSPITALARIOS[idObs];

  if (rec && rec.estado === "ocupada") {
    rec.duracionHoras = horas;
    rec.inicioMs = Date.now();
    rec.finMs = rec.inicioMs + (horas * 3600 * 1000);
    rec.motivo = motivo;
    tickCronometrosCamas();
    renderizarMonitorObservacionModulo5();
    renderizarTableroCamasYQuirofanos();
    alert(`⏱️ Norma clínica aplicada a ${rec.nombre}:\n${motivo}\nEstancia fijada en ${horas} horas.`);
  }
}

function ampliarHorasCamaActual(horas, motivo) {
  const idObs = STATE.camaAsignadaId && RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId] ? STATE.camaAsignadaId : "OBS-01";
  ampliarHorasObservacion(idObs, horas, motivo);
}

function acelerarTiempoDemoObservacion() {
  const idObs = STATE.camaAsignadaId && RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId] ? STATE.camaAsignadaId : "OBS-01";
  acelerarTiempoDemo(idObs);
}

function finalizarTiempoDemoObservacion() {
  const idObs = STATE.camaAsignadaId && RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId] ? STATE.camaAsignadaId : "OBS-01";
  finalizarTiempoAhora(idObs);
}

function liberarCamaActualManual() {
  const idObs = STATE.camaAsignadaId && RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId] ? STATE.camaAsignadaId : "OBS-01";
  liberarCamaRecurso(idObs, "Alta Médica desde Tópico / Observación");
}

// MODAL FLOTANTE
function abrirModalTableroCamas() {
  const modal = document.getElementById("modalTableroCamasOverlay");
  if (!modal) return;
  modal.classList.add("open");
  renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
}

function cerrarModalTableroCamas() {
  const modal = document.getElementById("modalTableroCamasOverlay");
  if (modal) modal.classList.remove("open");
}


function resetearEntornoEstablecimientoAPendiente() {
  STATE.entornoEstablecimiento = null;
  STATE.entornoBloqueado = false;

  const btnMinsa = document.getElementById("btn_entorno_minsa");
  const btnEssalud = document.getElementById("btn_entorno_essalud");
  const btnCli = document.getElementById("btn_entorno_clinica_eps");
  const btnPart = document.getElementById("btn_entorno_particular");
  const badge = document.getElementById("badge_entorno_actual");
  const bannerMinsa = document.getElementById("banner_condicion_minsa");
  const bannerEssalud = document.getElementById("banner_condicion_essalud");
  const bannerEps = document.getElementById("banner_condicion_eps");
  const bannerPart = document.getElementById("banner_condicion_particular");
  const bannerPend = document.getElementById("banner_entorno_pendiente");

  [btnMinsa, btnEssalud, btnCli, btnPart].forEach(b => {
    if (b) {
      b.style.background = "#f8fafc";
      b.style.borderColor = "#e2e8f0";
      b.style.color = "#94a3b8";
      b.style.opacity = "0.75";
      b.style.filter = "none";
      b.style.cursor = "pointer";
      b.disabled = false;
    }
  });

  if (badge) {
    badge.textContent = "Pendiente de Selección";
    badge.style.background = "#f1f5f9";
    badge.style.color = "#64748b";
    badge.style.borderColor = "#cbd5e1";
  }

  if (bannerMinsa) bannerMinsa.style.display = "none";
  if (bannerEssalud) bannerEssalud.style.display = "none";
  if (bannerEps) bannerEps.style.display = "none";
  if (bannerPart) bannerPart.style.display = "none";
  if (bannerPend) bannerPend.style.display = "none";
}


// --- MÓDULO 5: SALA DE OBSERVACIÓN ---
function setEstanciaHoras(horas) {
  const input = document.getElementById("horas_observacion_input");
  if (input) input.value = horas;
  actualizarEstanciaObservacion(horas);
}

function actualizarEstanciaObservacion(horas) {
  const h = parseFloat(horas) || 0;
  STATE.horasObservacion = h;
  const badge = document.getElementById("obs_cronometro_badge");
  const alertBox = document.getElementById("obs_cronometro_alerta");
  if (!badge) return;

  if (h <= 12) {
    badge.textContent = `⏱️ ${h} Horas (Estancia Normal — NTS N° 042-MINSA)`;
    badge.style.background = "#dcfce7";
    badge.style.color = "#15803d";
    badge.style.borderColor = "#86efac";
    if (alertBox) alertBox.innerHTML = `✅ <strong>Estancia dentro del periodo estándar (0 a 12 horas):</strong> Paciente en monitorización de respuesta terapéutica.`;
  } else if (h <= 24) {
    badge.textContent = `⚠️ ${h} Horas (Límite Máximo de Estancia — NTS N° 042-MINSA)`;
    badge.style.background = "#fef9c3";
    badge.style.color = "#854d0e";
    badge.style.borderColor = "#fde047";
    if (alertBox) alertBox.innerHTML = `⚠️ <strong>Estancia límite (12 a 24 horas):</strong> Requiere reevaluación médica inmediata para definir Alta o Hospitalización.`;
  } else {
    badge.textContent = `🚨 ${h} Horas (DESBORDE NORMATIVO — SUPERA 24 HORAS)`;
    badge.style.background = "#fee2e2";
    badge.style.color = "#991b1b";
    badge.style.borderColor = "#fca5a5";
    if (alertBox) alertBox.innerHTML = `🚨 <strong>ALERTA CRÍTICA DE AUDITORÍA (NTS N° 042-MINSA):</strong> El paciente ha superado las 24 horas en Observación. Es mandatorio gestionar cama en Hospitalización o activar REFCON.`;
  }
}

function calcularBalanceHidrico() {
  const ingEl = document.getElementById("balance_ingresos");
  const egEl = document.getElementById("balance_egresos");
  const dispEl = document.getElementById("balance_neto_display");
  const interpEl = document.getElementById("balance_interpretacion");

  const ing = parseFloat(ingEl?.value) || 0;
  const eg = parseFloat(egEl?.value) || 0;
  const neto = ing - eg;

  STATE.balanceIngresosMl = ing;
  STATE.balanceEgresosMl = eg;
  STATE.balanceNetoMl = neto;

  if (dispEl) {
    dispEl.textContent = `${neto >= 0 ? '+' : ''}${neto} ml`;
    dispEl.style.color = neto > 0 ? '#0284c7' : (neto < 0 ? '#ea580c' : '#15803d');
  }
  if (interpEl) {
    if (neto > 500) {
      interpEl.innerHTML = `<span style="color:#0284c7;font-weight:700;">Balance Positivo Significativo (+${neto} ml):</span> Vigilar sobrecarga de volumen cardiovascular.`;
    } else if (neto < -300) {
      interpEl.innerHTML = `<span style="color:#ea580c;font-weight:700;">Balance Negativo (-${Math.abs(neto)} ml):</span> Evaluar reposición hídrica parenteral endovenosa.`;
    } else {
      interpEl.innerHTML = `<span style="color:#15803d;font-weight:700;">Balance Hídrico Equilibrado (${neto >= 0 ? '+' : ''}${neto} ml):</span> Homeostasis estable según NTS N° 139-MINSA.`;
    }
  }
}

function decisionObservacion(tipo) {
  STATE.decisionPostObs = tipo;
  if (tipo === "alta") {
    liberarCamaTotalPaciente(pacienteActivoId, "Alta desde Sala de Observación");
    alert("🩺 Paciente estabilizado favorablemente. Cama liberada y pasando al Módulo 7 para generar Epicrisis y Alta Médica Definitiva.");
    irAModulo(7);
  } else if (tipo === "cama_sop") {
    alert("🏥 Paciente requiere pase a Cama Hospitalaria / UCI o Quirófano SOP. Pasando al Módulo 6.");
    irAModulo(6);
  }
}


// --- MÓDULO 6: GESTIÓN DE CAMAS & DESEMPATE ABCDE ---
function actualizarPrioridadUCI(val) {
  const p = parseInt(val) || 2;
  STATE.prioridadUci = p;
  const descEl = document.getElementById("uci_prioridad_desc");
  const descripciones = {
    1: "Prioridad 1 (NTS N° 031-MINSA): Paciente crítico inestable que requiere soporte vital avanzado y monitoreo invasivo intensivo con alta probabilidad de recuperación.",
    2: "Prioridad 2 (NTS N° 031-MINSA): Paciente que requiere monitoreo intensivo continuo y potencialmente puede requerir intervención inmediata.",
    3: "Prioridad 3 (NTS N° 031-MINSA): Paciente crítico inestable pero con reducida probabilidad de recuperación por enfermedad subyacente severa.",
    4: "Prioridad 4 (NTS N° 031-MINSA): Paciente no apropiado para UCI (enfermedad terminal o beneficio mínimo comprobado)."
  };
  if (descEl) descEl.textContent = descripciones[p] || "";
  calcularPuntajePrelacionABCDE();
}

function calcularPuntajePrelacionABCDE() {
  const spo2 = STATE.spo2 || parseFloat(document.getElementById("spo2_full")?.value) || 98;
  const glasgow = STATE.glasgow || parseFloat(document.getElementById("glasgow_full")?.value) || 15;
  const fc = STATE.fc || parseFloat(document.getElementById("fc_full")?.value) || 80;
  const pas = STATE.pasSistolica || parseFloat(document.getElementById("pas_full")?.value) || 120;
  const eva = STATE.eva || parseInt(document.getElementById("eva_full")?.value) || 0;

  // Fórmula ABCDE:
  // [(100 - SpO2) * 1.5] + [(15 - Glasgow) * 3] + [(FC / PAS) * 15] + EVA
  const relFcPas = pas > 0 ? (fc / pas) : 1;
  let score = ((100 - spo2) * 1.5) + ((15 - glasgow) * 3) + (relFcPas * 15) + eva;

  let bonificaciones = [];
  if (STATE.esGestante) {
    score += 10;
    bonificaciones.push("+10 pts Gestante (Ley N° 27408)");
  }
  if (STATE.codigoInfarto || STATE.codigoIctus || STATE.codigoSepsis || STATE.claveObstetrica !== "ninguna") {
    score += 6;
    bonificaciones.push("+6 pts Código Tiempo-Dependiente");
  }
  const edad = parseInt(STATE.edad || document.getElementById("edad_full")?.value) || 30;
  if (edad < 14 || edad >= 65 || STATE.esPediatrico) {
    score += 3;
    bonificaciones.push("+3 pts Atención Preferente Poblacional");
  }

  STATE.desempateScore = Math.round(score * 10) / 10;

  const scoreEl = document.getElementById("abcde_score_display");
  const detalleEl = document.getElementById("desempate_detalle");

  if (scoreEl) scoreEl.textContent = `${STATE.desempateScore} Puntos`;
  if (detalleEl) {
    detalleEl.innerHTML = `<strong>Desglose Algorítmico ABCDE:</strong> SpO2: ${spo2}% | Glasgow: ${glasgow}/15 | FC/PAS: ${relFcPas.toFixed(2)} | EVA: ${eva}/10` +
      (bonificaciones.length > 0 ? `<br><span style="color:#0369a1;font-weight:700;">Bonificaciones Ley 27408: ${bonificaciones.join(", ")}</span>` : '');
  }
}

function activarBoardingCritico() {
  STATE.boardingActivo = true;
  alert("⚠️ PROTOCOLO DE CONTINGENCIA ACTIVADO: BOARDING CRÍTICO EN SALA DE OBSERVACIÓN (NTS N° 042-MINSA).\\n\\n" +
        "Al no existir disponibilidad inmediata en Cama Hospitalaria/UCI, el paciente permanece en cama de observación bajo monitorización invasiva continua con activación paralela de solicitud REFCON / SUSALUD.");
}


// --- MÓDULO 7: EGRESO CLÍNICO & AUDITORÍA LEGAL ---
function seleccionarModalidadEgreso(modalidad) {
  STATE.modalidadEgreso = modalidad;
  document.querySelectorAll(".card-egreso-sub").forEach(c => c.style.display = "none");
  document.querySelectorAll(".btn-modalidad-egreso").forEach(b => b.classList.remove("active"));
  const btn = document.getElementById(`btn_egreso_${modalidad}`);
  if (btn) btn.classList.add("active");

  const targetCard = document.getElementById(`card_sub_${modalidad}`);
  if (targetCard) targetCard.style.display = "block";

  if (modalidad === "defuncion") {
    verificarCandadoLegalSinadef();
  }
}

function verificarCandadoLegalSinadef() {
  const esTransito = STATE.esAccidenteTransito;
  const horas = STATE.horasObservacion || 6;
  const motivo = (document.getElementById("motivo_full")?.value || "").toLowerCase();
  const esCausaViolenta = motivo.includes("arma") || motivo.includes("bala") || motivo.includes("asfixia") || motivo.includes("trauma") || motivo.includes("violenc");
  const menosDe24h = horas < 24;

  const candadoActivo = esTransito || esCausaViolenta || menosDe24h;
  STATE.bloqueoSinadef = candadoActivo;

  const bannerBloqueo = document.getElementById("banner_sinadef_bloqueado");
  const btnSinadef = document.getElementById("btn_imprimir_sinadef");
  const btnFiscalia = document.getElementById("btn_imprimir_oficio_fiscalia");

  if (candadoActivo) {
    if (bannerBloqueo) {
      bannerBloqueo.style.display = "block";
      bannerBloqueo.innerHTML = `⛔ <strong>CANDADO LEGAL BLOQUEANTE (Art. 195° y 196° Código Procesal Penal):</strong><br>` +
        `Prohibido emitir Certificado de Defunción General (SINADEF) por tratarse de ${esTransito ? 'un 🚗 Accidente de Tránsito' : (esCausaViolenta ? 'presunta causa violenta/trauma' : 'fallecimiento en menos de 24h de ingreso sin diagnóstico previo consolidado')}.<br>` +
        `<strong>Disposición Legal Obligatoria:</strong> Remisión formal e inmediata a la <strong>Fiscalía Provincial Penal de Turno</strong> y a la <strong>División de Medicina Legal (Morgue)</strong> para Necropsia de Ley.`;
    }
    if (btnSinadef) {
      btnSinadef.disabled = true;
      btnSinadef.style.opacity = "0.4";
      btnSinadef.style.cursor = "not-allowed";
      btnSinadef.title = "Bloqueado por mandato del Código Procesal Penal Arts. 195 y 196";
    }
    if (btnFiscalia) {
      btnFiscalia.style.display = "inline-flex";
    }
  } else {
    if (bannerBloqueo) bannerBloqueo.style.display = "none";
    if (btnSinadef) {
      btnSinadef.disabled = false;
      btnSinadef.style.opacity = "1";
      btnSinadef.style.cursor = "pointer";
    }
    if (btnFiscalia) {
      btnFiscalia.style.display = "none";
    }
  }
}

function imprimirEpicrisisReceta() {
  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir."); return; }
  const fecha = new Date().toLocaleString();
  const nombre = STATE.nombreReniec || STATE.identificador || "PACIENTE NO IDENTIFICADO";
  const cie = `${STATE.cie10Codigo} - ${STATE.cie10Descripcion}`;
  w.document.write(`
    <html><head><title>Epicrisis y Receta Médica - Hospital Regional UPP</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;font-size:13px;line-height:1.5;}h2,h3{color:#0f172a;margin:0 0 8px 0;}.box{border:1px solid #cbd5e1;padding:12px;border-radius:6px;margin-bottom:14px;}</style>
    </head><body>
      <h2>HOSPITAL REGIONAL DOCENTE UPP — SERVICIO DE EMERGENCIA</h2>
      <h3>EPICRISIS MÉDICA DE ALTA (NTS N° 139-MINSA/2018/DGAIN)</h3>
      <div class="box">
        <strong>Paciente:</strong> ${nombre} | <strong>HC:</strong> ${STATE.historiaClinica} | <strong>DNI:</strong> ${STATE.identificador}<br>
        <strong>Fecha/Hora de Egreso:</strong> ${fecha} | <strong>Médico:</strong> ${STATE.medicoTratante}<br>
        <strong>Diagnóstico de Egreso (CIE-10):</strong> ${cie}
      </div>
      <div class="box">
        <strong>RESUMEN DE ESTANCIA Y EVOLUCIÓN:</strong><br>
        Paciente ingresó por triaje de emergencia, evaluado clínicamente. Estancia en sala de observación por ${STATE.horasObservacion} horas. Balance hídrico neto: ${STATE.balanceNetoMl} ml. Presenta mejoría sintomática, signos vitales estables, tolerancia oral adecuada y deambulación conservada.
      </div>
      <div class="box">
        <strong>RECETA MÉDICA Y PLAN TERAPÉUTICO DOMICILIARIO:</strong><br>
        1. Reposo relativo por 48 horas.<br>
        2. Hidratación oral adecuada y dieta blanda fraccionada.<br>
        3. Tratamiento farmacológico prescrito en Kardex.<br>
        4. Signos de Alarma: Reconsultar de inmediato ante fiebre persistente, disnea o dolor intratable.
      </div>
      <div style="margin-top:30px;display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <span style="font-size:11px;font-weight:bold;color:#475569;display:block;margin-bottom:4px;">Firma Digital del Médico Tratante (Ley N° 27269):</span>
          ${typeof generarSelloFirmaDigitalHTML === "function" ? generarSelloFirmaDigitalHTML("MEDICO", { fechaHora: fecha }) : ""}
        </div>
        <div style="border-top:1px solid #000;width:220px;padding-top:4px;text-align:center;">
          Firma del Paciente / Familiar<br>Conformidad de Alta
        </div>
      </div>
    </body></html>
  `);
  w.document.close();
  w.print();
}

function imprimirFormatoRefcon() {
  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir."); return; }
  const fecha = new Date().toLocaleString();
  const nombre = STATE.nombreReniec || STATE.identificador || "PACIENTE";
  w.document.write(`
    <html><head><title>Formato Oficial REFCON - MINSA</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;font-size:12px;line-height:1.4;}table{width:100%;border-collapse:collapse;margin-top:10px;}th,td{border:1px solid #333;padding:6px;text-align:left;}</style>
    </head><body>
      <h2 style="margin:0;">SISTEMA NACIONAL DE REFERENCIA Y CONTRAREFERENCIA (REFCON)</h2>
      <h3 style="margin:0 0 10px 0;">HOJA DE REFERENCIA DE EMERGENCIA — MINSA / SUSALUD</h3>
      <table>
        <tr><th>Establecimiento Origen:</th><td>Hospital Regional Docente UPP (Nivel III-1)</td><th>Fecha/Hora:</th><td>${fecha}</td></tr>
        <tr><th>Paciente:</th><td>${nombre}</td><th>DNI / HC:</th><td>${STATE.identificador} / ${STATE.historiaClinica}</td></tr>
        <tr><th>Prioridad Clínica:</th><td>Prioridad ${STATE.prioridad}</td><th>Tipo Ambulancia:</th><td>Tipo II / III (Soporte Vital Avanzado)</td></tr>
        <tr><th>Diagnóstico CIE-10:</th><td colspan="3">${STATE.cie10Codigo} - ${STATE.cie10Descripcion}</td></tr>
        <tr><th>Motivo de Referencia:</th><td colspan="3">Falta de capacidad resolutiva quirúrgica / cupo en UCI especializada.</td></tr>
      </table>
      <div style="margin-top:40px;display:flex;justify-content:space-between;text-align:center;">
        <div style="border-top:1px solid #000;width:200px;padding-top:4px;">Médico que Refiere</div>
        <div style="border-top:1px solid #000;width:200px;padding-top:4px;">Médico SAMU / Traslado</div>
      </div>
    </body></html>
  `);
  w.document.close();
  w.print();
}

function imprimirActaAltaVoluntaria() {
  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir."); return; }
  const fecha = new Date().toLocaleString();
  const nombre = STATE.nombreReniec || STATE.identificador || "PACIENTE";
  w.document.write(`
    <html><head><title>Acta de Alta Voluntaria - Ley N° 26842</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;font-size:13px;line-height:1.6;}</style>
    </head><body>
      <h2>ACTA DE RETIRO VOLUNTARIO / ALTA VOLUNTARIA</h2>
      <h3>Amparo Legal: Artículo 4° de la Ley N° 26842 (Ley General de Salud)</h3>
      <p>En la ciudad de Lima, con fecha y hora <strong>${fecha}</strong>, en el Servicio de Emergencia del Hospital Regional Docente UPP, el/la paciente <strong>${nombre}</strong> identificado con DNI/Documento <strong>${STATE.identificador}</strong>, (o su representante legal debidamente acreditado), manifiesta de forma libre, consciente y voluntaria su decisión irrevocable de <strong>RETIRARSE DEL ESTABLECIMIENTO DE SALUD</strong> en contra de la indicación médica expresa.</p>
      <p><strong>Constancia Médica:</strong> Se deja constancia de que el médico tratante ha informado detalladamente al paciente y sus familiares respecto a su estado clínico, el diagnóstico presuntivo (${STATE.cie10Codigo} - ${STATE.cie10Descripcion}) y los riesgos graves de complicaciones, secuelas permanentes o riesgo vital derivados de la interrupción del tratamiento hospitalario.</p>
      <p>El firmante exonera de toda responsabilidad penal, civil o administrativa al cuerpo médico, asistencial y directivo del establecimiento de salud.</p>
      <div style="margin-top:50px;display:flex;justify-content:space-between;text-align:center;">
        <div style="border-top:1px solid #000;width:240px;padding-top:4px;">Firma / Huella del Paciente o Familiar<br>DNI N°:</div>
        <div style="border-top:1px solid #000;width:240px;padding-top:4px;">Firma y Sello del Médico Tratante<br>CMP / RNE:</div>
      </div>
    </body></html>
  `);
  w.document.close();
  w.print();
}

function imprimirCertificadoSinadef() {
  if (STATE.bloqueoSinadef) {
    alert("⛔ CANDADO LEGAL BLOQUEANTE (Art. 195/196 CPP): No se puede emitir SINADEF en este caso. Debe emitir el Oficio Fiscal para Necropsia de Ley.");
    return;
  }
  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir."); return; }
  w.document.write(`
    <html><head><title>Certificado de Defunción - SINADEF</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;font-size:13px;}</style>
    </head><body>
      <h2>SISTEMA INFORMÁTICO NACIONAL DE DEFUNCIONES (SINADEF)</h2>
      <h3>CERTIFICADO DE DEFUNCIÓN GENERAL — DIRECTIVA N° 216-MINSA</h3>
      <p>Fallecido: ${STATE.nombreReniec || STATE.identificador} | DNI: ${STATE.identificador}</p>
      <p>Diagnóstico de Causa Básica: ${STATE.cie10Codigo} - ${STATE.cie10Descripcion}</p>
      <p>Fallecimiento en sala hospitalaria tras más de 24 horas de internamiento continuo por causa médica natural debidamente documentada.</p>
      <div style="margin-top:40px;border-top:1px solid #000;width:250px;padding-top:4px;">Médico Certificante (CMP / RNE)</div>
    </body></html>
  `);
  w.document.close();
  w.print();
}

function imprimirOficioFiscaliaLevantamiento() {
  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir."); return; }
  const fecha = new Date().toLocaleString();
  const nombre = STATE.nombreReniec || STATE.identificador || "CADÁVER NO IDENTIFICADO (NN)";
  w.document.write(`
    <html><head><title>Oficio Fiscal - Art. 195 Código Procesal Penal</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;font-size:13px;line-height:1.6;}</style>
    </head><body>
      <h3 style="margin:0;">HOSPITAL REGIONAL DOCENTE UPP — DIRECCIÓN MÉDICA</h3>
      <h4 style="margin:0 0 16px 0;">SERVICIO DE EMERGENCIA Y ASUNTOS JURÍDICOS</h4>
      <p><strong>OFICIO N° ${Math.floor(100 + Math.random()*900)}-2026-HR-UPP/EMERGENCIA</strong></p>
      <p><strong>A:</strong> SEÑOR(A) FISCAL PROVINCIAL PENAL DE TURNO DE LIMA<br>
         <strong>ASUNTO:</strong> Notificación de Fallecimiento por Causa Violenta / Accidente de Tránsito / Muerte Sospechosa de Criminalidad (Art. 195° y 196° del Código Procesal Penal).<br>
         <strong>FECHA Y HORA:</strong> ${fecha}</p>
      <p>Tengo el deber legal de poner en su conocimiento el fallecimiento ocurrido en las instalaciones de este Servicio de Emergencia del paciente <strong>${nombre}</strong>, documento <strong>${STATE.identificador}</strong>, historia clínica <strong>${STATE.historiaClinica}</strong>.</p>
      <p><strong>Circunstancia del Evento:</strong> ${STATE.esAccidenteTransito ? '🚗 Accidente de Tránsito con implicancia vial (D.S. N° 024-2002-MTC / Ley SOAT).' : 'Causa externa violenta o fallecimiento en menos de 24 horas sin diagnóstico consolidado.'}</p>
      <p>En estricto cumplimiento del Artículo 195° del Código Procesal Penal y la Directiva N° 216-MINSA, este establecimiento médico <strong>NO HA EMITIDO CERTIFICADO DE DEFUNCIÓN GENERAL (SINADEF)</strong>, quedando el cuerpo en custodia física en el Tópico de Cadáveres de Emergencia, a disposición del Ministerio Público y de los Peritos de la División de Medicina Legal para la diligencia de <strong>Levantamiento de Cadáver y Necropsia de Ley</strong>.</p>
      <div style="margin-top:60px;display:flex;justify-content:space-between;text-align:center;">
        <div style="border-top:1px solid #000;width:240px;padding-top:4px;">Médico Emergenciólogo de Guardia<br>CMP / RNE</div>
        <div style="border-top:1px solid #000;width:240px;padding-top:4px;">Comisaría PNP de la Jurisdicción<br>Recepción y Notificación</div>
      </div>
    </body></html>
  `);
  w.document.close();
  w.print();
}

function imprimirFacturaOficial() {
  const liq = calcularLiquidacionSeguro();
  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir."); return; }
  const fecha = new Date().toLocaleString();
  const nombre = STATE.nombreReniec || STATE.identificador || "PACIENTE";

  let itemsHtml = "";
  STATE.items_factura.forEach((item, idx) => {
    itemsHtml += `
      <tr>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;">${idx + 1}</td>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;font-weight:600;">${item.nombre}</td>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;">${item.categoria || 'Clínica'}</td>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;">S/. ${(parseFloat(item.costo)||0).toFixed(2)}</td>
      </tr>
    `;
  });

  w.document.write(`
    <html><head><title>Liquidación Hospitalaria Oficial - Ley N° 29414</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;font-size:12px;line-height:1.4;}table{width:100%;border-collapse:collapse;margin-top:12px;}th{background:#f1f5f9;border:1px solid #cbd5e1;padding:8px 10px;text-align:left;}</style>
    </head><body>
      <h2 style="margin:0;color:#0f172a;">HOSPITAL REGIONAL DOCENTE UPP — COMPROBANTE DE LIQUIDACIÓN DE ATENCIÓN</h2>
      <h4 style="margin:0 0 10px 0;color:#475569;">AUDITORÍA FINANCIERA Y TRANSPARENCIA ASISTENCIAL (LEY N° 29414 - SUSALUD)</h4>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px;border-radius:6px;">
        <strong>Paciente:</strong> ${nombre} | <strong>Identificador:</strong> ${STATE.identificador} | <strong>HC:</strong> ${STATE.historiaClinica}<br>
        <strong>Régimen Prestacional:</strong> ${liq.etiquetaRegimen} | <strong>Fecha de Liquidación:</strong> ${fecha}<br>
        <strong>Lugar de Prestación:</strong> ${liq.lugarAtencion}
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:40px;">#</th>
            <th>Concepto / Procedimiento / Medicamento</th>
            <th style="width:140px;">Servicio</th>
            <th style="width:100px;text-align:right;">Monto</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml || '<tr><td colspan="4" style="text-align:center;padding:12px;">Sin items facturados</td></tr>'}
        </tbody>
      </table>
      <div style="margin-top:14px;background:#f8fafc;border:1px solid #cbd5e1;padding:12px;border-radius:6px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Total Bruto Facturado:</span><strong>S/. ${liq.totalBruto.toFixed(2)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#15803d;"><span>Cobertura Asumida por Aseguradora:</span><strong>- S/. ${liq.coberturaSeguro.toFixed(2)}</strong></div>
        <div style="display:flex;justify-content:space-between;border-top:2px solid #0f172a;padding-top:6px;font-size:15px;color:#0f172a;"><span>TOTAL NETO A PAGAR PACIENTE:</span><strong>S/. ${liq.totalPaciente.toFixed(2)}</strong></div>
        <div style="font-size:11px;color:#475569;margin-top:8px;"><strong>Fundamento Auditoría:</strong> ${liq.motivoLiquidacion}</div>
      </div>
      <div style="margin-top:50px;display:flex;justify-content:space-between;text-align:center;">
        <div style="border-top:1px solid #000;width:220px;padding-top:4px;">Cuentas Corrientes y Facturación</div>
        <div style="border-top:1px solid #000;width:220px;padding-top:4px;">Auditoría Médica UPP</div>
      </div>
    </body></html>
  `);
  w.document.close();
  w.print();
}

// Exportar globalmente al objeto window para máxima compatibilidad


function toggleRegSoat(val) {
  const boxPlaca = document.getElementById("box_reg_soat_placa");
  const boxSeguro = document.getElementById("box_reg_seguro");

  if (val === "soat_placa") {
    if (boxPlaca) boxPlaca.style.display = "block";
    if (boxSeguro) boxSeguro.style.display = "none";
  } else if (val === "soat_fuga") {
    if (boxPlaca) boxPlaca.style.display = "none";
    if (boxSeguro) boxSeguro.style.display = "none";
  } else {
    if (boxPlaca) boxPlaca.style.display = "none";
    if (boxSeguro) boxSeguro.style.display = "block";
  }
}

async function consultarReniecDiferida() {
  const dniEl = document.getElementById("reg_dni_input");
  const dni = (dniEl?.value || "").trim();
  if (dni.length !== 8) {
    alert("⚠️ Ingrese un DNI válido de 8 dígitos para consultar.");
    return;
  }
  if (dni === "44418504") {
    const nombreCompleto = "LUIS GUILLERMO VASQUEZ VALDIVIESO";
    const nomInput = document.getElementById("reg_nombre_input");
    if (nomInput) nomInput.value = nombreCompleto;
    alert(`✅ RENIEC: Paciente identificado como: ${nombreCompleto}`);
    return;
  } else if (dni === "10203040") {
    const nombreCompleto = "CARLOS MENDOZA ROJAS";
    const nomInput = document.getElementById("reg_nombre_input");
    if (nomInput) nomInput.value = nombreCompleto;
    alert(`✅ RENIEC: Paciente identificado como: ${nombreCompleto}`);
    return;
  } else if (dni === "70809010") {
    const nombreCompleto = "MARIA TORRES SILVA";
    const nomInput = document.getElementById("reg_nombre_input");
    if (nomInput) nomInput.value = nombreCompleto;
    alert(`✅ RENIEC: Paciente identificado como: ${nombreCompleto}`);
    return;
  }
  try {
    const res = await fetch(`https://api.apis.net.pe/v2/reniec/dni?numero=${dni}`, {
      headers: { "Authorization": `Bearer ${DEFAULT_APISPERU_TOKEN}` }
    });
    if (res.ok) {
      const data = await res.json();
      const nombreCompleto = `${data.nombres} ${data.apellidoPaterno} ${data.apellidoMaterno}`;
      const nomInput = document.getElementById("reg_nombre_input");
      if (nomInput) nomInput.value = nombreCompleto;
      alert(`✅ RENIEC: Paciente identificado como: ${nombreCompleto}`);
    } else {
      alert("No se pudo verificar el DNI en RENIEC. Ingrese el nombre manualmente.");
    }
  } catch (e) {
    alert("Error de conexión a RENIEC. Ingrese el nombre manualmente.");
  }
}

function guardarRegularizacionDiferida() {
  const dni = (document.getElementById("reg_dni_input")?.value || "").trim();
  const nombre = (document.getElementById("reg_nombre_input")?.value || "").trim();
  const origen = document.getElementById("reg_origen_select")?.value || "comun";
  const placa = (document.getElementById("reg_placa_input")?.value || "").trim().toUpperCase();
  const seguro = document.getElementById("reg_seguro_select")?.value || "SIS";

  if (nombre.length > 2) {
    STATE.nombreReniec = nombre;
    STATE.identificador = dni || STATE.identificador;
    const nomDisp = document.getElementById("nombre_display");
    if (nomDisp) nomDisp.textContent = nombre;
    const idInput = document.getElementById("identificador_full");
    if (idInput) idInput.value = dni || STATE.identificador;
  }

  if (origen === "soat_placa") {
    STATE.esAccidenteTransito = true;
    STATE.soatVehiculoFuga = false;
    STATE.eventoFugaTransversal = false;
    STATE.soatPlaca = placa || "PLACA-REGULARIZADA";
    STATE.tipoSeguro = "SOAT";
    STATE.bloqueoSinadef = true;
    if (STATE.padronSusalud) STATE.padronSusalud.condicion_evento = "NORMAL";
  } else if (origen === "soat_fuga") {
    STATE.esAccidenteTransito = true;
    STATE.soatVehiculoFuga = true;
    STATE.eventoFugaTransversal = true;
    STATE.soatPlaca = "SIN PLACA (FUGA)";
    STATE.tipoSeguro = "Particular (Chofer en Fuga / Ley 27604)";
    STATE.bloqueoSinadef = true;
    if (STATE.padronSusalud) STATE.padronSusalud.condicion_evento = "ACCIDENTE_TRANSITO_FUGA";
  } else {
    STATE.esAccidenteTransito = false;
    STATE.soatVehiculoFuga = false;
    STATE.eventoFugaTransversal = false;
    STATE.tipoSeguro = seguro;
    STATE.bloqueoSinadef = false;
    if (STATE.padronSusalud) STATE.padronSusalud.condicion_evento = "NORMAL";
  }

  if (dni && dni.length === 8 && typeof sincronizarPadronSusalud === "function") {
    sincronizarPadronSusalud(dni);
  }

  cerrarModalRegularizacionDiferida();
  actualizarFactura();
  alert("✅ Regularización Administrativa Guardada con Éxito.\nSe actualizaron la filiación, el régimen de aseguramiento y la liquidación financiera sin perder los registros quirúrgicos.");
}

// Exportaciones globales
window.activarIngresoDirectoQuirofano = activarIngresoDirectoQuirofano;
window.asignarQuirofanoEspecifico = asignarQuirofanoEspecifico;
window.asignarCamaURPA = asignarCamaURPA;
window.ejecutarOrdenQuirurgicaEmergencia = ejecutarOrdenQuirurgicaEmergencia;
window.abrirModalRegularizacionDiferida = abrirModalRegularizacionDiferida;
window.cerrarModalRegularizacionDiferida = cerrarModalRegularizacionDiferida;
window.toggleRegSoat = toggleRegSoat;
window.consultarReniecDiferida = consultarReniecDiferida;
window.guardarRegularizacionDiferida = guardarRegularizacionDiferida;

window.buscarSeguroPacienteEnBd = buscarSeguroPacienteEnBd;
window.guardarSeguroPacienteEnBd = guardarSeguroPacienteEnBd;
window.aplicarSeleccionSeguroYEntorno = aplicarSeleccionSeguroYEntorno;

window.abrirModalTableroCamas = abrirModalTableroCamas;
window.cerrarModalTableroCamas = cerrarModalTableroCamas;
window.filtrarTableroRecursos = filtrarTableroRecursos;
window.filtrarTableroModal = filtrarTableroModal;
window.asignarPacienteActualARecurso = asignarPacienteActualARecurso;
window.ampliarHorasObservacion = ampliarHorasObservacion;
window.liberarCamaRecurso = liberarCamaRecurso;
window.acelerarTiempoDemo = acelerarTiempoDemo;
window.finalizarTiempoAhora = finalizarTiempoAhora;
window.aplicarNormaHorasObservacion = aplicarNormaHorasObservacion;
window.ampliarHorasCamaActual = ampliarHorasCamaActual;
window.acelerarTiempoDemoObservacion = acelerarTiempoDemoObservacion;
window.finalizarTiempoDemoObservacion = finalizarTiempoDemoObservacion;
window.liberarCamaActualManual = liberarCamaActualManual;
window.renderizarTableroCamasYQuirofanos = renderizarTableroCamasYQuirofanos;
window.renderizarMonitorObservacionModulo5 = renderizarMonitorObservacionModulo5;
window.autoGuardarCambioEnHistoriaClinica = autoGuardarCambioEnHistoriaClinica;
function toggleDrawerFlotante(e) {
  if (e) e.stopPropagation();
  const drawer = document.getElementById("widgetPanelDrawer");
  const arrow = document.getElementById("widget_drawer_arrow");
  if (!drawer) return;
  const isOpen = drawer.classList.contains("open");
  if (isOpen) {
    drawer.classList.remove("open");
    if (arrow) arrow.style.transform = "rotate(0deg)";
  } else {
    drawer.classList.add("open");
    if (arrow) arrow.style.transform = "rotate(180deg)";
    actualizarWidgetFlotanteCamas();
  }
}

function actualizarWidgetFlotanteCamas() {
  const counts = {
    total: { total: 0, disponible: 0, ocupada: 0 },
    quirofano: { total: 0, disponible: 0, ocupada: 0 },
    observacion: { total: 0, disponible: 0, ocupada: 0 },
    shock_trauma: { total: 0, disponible: 0, ocupada: 0 },
    urpa: { total: 0, disponible: 0, ocupada: 0 },
    uci: { total: 0, disponible: 0, ocupada: 0 }
  };

  for (const id in RECURSOS_HOSPITALARIOS) {
    const rec = RECURSOS_HOSPITALARIOS[id];
    const tipo = rec.tipo || "observacion";
    if (counts[tipo]) {
      counts[tipo].total++;
      if (rec.estado === "ocupada") counts[tipo].ocupada++;
      else counts[tipo].disponible++;
    }
    counts.total.total++;
    if (rec.estado === "ocupada") counts.total.ocupada++;
    else counts.total.disponible++;
  }

  // 1. Contador total en la cápsula
  const elTotal = document.getElementById("hud_total_count");
  if (elTotal) {
    elTotal.innerHTML = `${counts.total.disponible}/${counts.total.total}<span class="widget-libres-label"> LIBRES</span>`;
    if (counts.total.disponible === 0) {
      elTotal.style.color = "#ef4444";
      elTotal.style.textShadow = "0 0 10px rgba(239, 68, 68, 0.6)";
    } else if (counts.total.disponible <= 3) {
      elTotal.style.color = "#f59e0b";
      elTotal.style.textShadow = "0 0 10px rgba(245, 158, 11, 0.6)";
    } else {
      elTotal.style.color = "#4ade80";
      elTotal.style.textShadow = "0 0 10px rgba(74, 222, 128, 0.5)";
    }
  }

  // 2. Chips en la cápsula flotante
  const setPillChip = (elId, disp, tot, icon) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = `${icon} ${disp}/${tot}`;
    if (disp === 0) {
      el.style.background = "rgba(239, 68, 68, 0.85)";
      el.style.color = "#ffffff";
      el.style.borderColor = "#f87171";
    } else {
      el.style.background = "";
      el.style.color = "";
      el.style.borderColor = "";
    }
  };

  setPillChip("pill_chip_sop", counts.quirofano.disponible, counts.quirofano.total, "🔪");
  setPillChip("pill_chip_obs", counts.observacion.disponible, counts.observacion.total, "🛏️");
  setPillChip("pill_chip_st", counts.shock_trauma.disponible, counts.shock_trauma.total, "⚡");
  setPillChip("pill_chip_urpa", counts.urpa.disponible, counts.urpa.total, "🛌");
  setPillChip("pill_chip_uci", counts.uci.disponible, counts.uci.total, "🏥");

  // 3. Filas en el panel desplegable
  const setDrawerCount = (elId, disp, tot) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = `${disp} / ${tot} Libres`;
  };

  setDrawerCount("hud_sop_count", counts.quirofano.disponible, counts.quirofano.total);
  setDrawerCount("hud_obs_count", counts.observacion.disponible, counts.observacion.total);
  setDrawerCount("hud_st_count", counts.shock_trauma.disponible, counts.shock_trauma.total);
  setDrawerCount("hud_urpa_count", counts.urpa.disponible, counts.urpa.total);
  setDrawerCount("hud_uci_count", counts.uci.disponible, counts.uci.total);
}

window.toggleDrawerFlotante = toggleDrawerFlotante;
window.actualizarWidgetFlotanteCamas = actualizarWidgetFlotanteCamas;


// ==============================================================================
// PRESETS DE CASOS CLÍNICOS RÁPIDOS DE 1 CLIC (EXPOSICIÓN & AUDITORÍA ASISTENCIAL)
// ==============================================================================
function cargarCasoPreset(prioNum) {
  // Limpiar cargos de facturación y kardex previos para simulación limpia e independiente
  STATE.items_factura = [];
  STATE.kardexAdministrados = [];
  STATE.kardexItems = [];
  STATE.ordenesLaboratorio = [];
  STATE.ordenesImagenes = [];
  STATE.liquidacionAuditada = null;
  STATE.estadoFlujo = "PENDIENTE_TRIAJE";
  STATE.coberturaValidada = false;
  STATE.firmas = {};
  STATE.alertaPrioridad1 = false;

  // 0. Mock temporal para evitar alertas bloqueantes durante la simulación automática
  const origAlert = window.alert;
  window.alert = function(msg) { console.log("[SIMULACIÓN ALERT INTERCEPTADO]:", msg); };

  // Limpiar códigos de tiempo previos
  const chkInfarto = document.getElementById("check_cod_infarto");
  if (chkInfarto) { chkInfarto.checked = false; toggleCodigoTiempo('infarto', false); }
  const chkIctus = document.getElementById("check_cod_ictus");
  if (chkIctus) { chkIctus.checked = false; toggleCodigoTiempo('ictus', false); }
  const chkSepsis = document.getElementById("check_cod_sepsis");
  if (chkSepsis) { chkSepsis.checked = false; toggleCodigoTiempo('sepsis', false); }

  const casos = {
    1: {
      titulo: "Caso 1: Shock Hipovolémico / Politrauma por Atropello (P-I Rojo)",
      motivo: "Politraumatismo severo por atropello en vía pública, shock circulatorio, hemorragia activa y depresión neurológica severa",
      spo2: 82, fc: 142, pas: 70, pad: 40, fr: 32, temp: 35.5, glasgow: 7, glucosa: 60, eva: 0,
      dni: "44418504", nombre: "LUIS GUILLERMO VASQUEZ VALDIVIESO", edad: 22, sexo: "M", gsan: "O+",
      alergias: "Niega alergias medicamentosas conocidas (NKDA)",
      origen: "soat",
      seguro: "SOAT Activo (La Positiva Seguros — Póliza 99214)",
      cie10: "T14.9 — Traumatismo no especificado por accidente de tránsito",
      medico: "Médico de Turno 1 (Emergenciólogo / CMP 0001)",
      camaId: "ST-01",
      camaNombre: "Shock Trauma ST-01",
      condicionConsentimiento: "exonerado_emergencia",
      procedimientoConsentimiento: "Intervención Quirúrgica de Emergencia (SOP) y Laparotomía / Toracotomía",
      kardex: [
        { med: "Cloruro de Sodio 0.9% 1000ml", dosis: "NaCl 0.9% 1000 ml EV a chorro STAT", via: "EV", cum: "CUM-CLNA" },
        { med: "Fentanilo 0.5mg/10ml", dosis: "1 ampolla EV directa en bolo lento STAT", via: "EV", cum: "CUM-FENT" },
        { med: "Ceftriaxona 1g", dosis: "2 gr EV en infusión intermitente c/24h", via: "EV", cum: "CUM-CEFT" }
      ],
      horasObs: "8|Traumatismo Encéfalo-Craneano (TEC) Leve con riesgo / Moderado",
      estadoAlta: "En Atención Crítica — Shock Trauma ST-01"
    },
    2: {
      titulo: "Caso 2: Crisis Hipertensiva / Sospecha Síndrome Coronario Agudo (P-II Naranja)",
      motivo: "Cefalea holocraneana pulsátil intensa 9/10, dolor precordial opresivo con irradiación a cuello y náuseas sin shock",
      spo2: 96, fc: 98, pas: 185, pad: 115, fr: 22, temp: 36.8, glasgow: 15, glucosa: 110, eva: 7,
      dni: "10203040", nombre: "CARLOS MENDOZA ROJAS", edad: 58, sexo: "M", gsan: "A+",
      alergias: "Penicilina y derivados",
      origen: "comun",
      seguro: "EsSalud Titular Acreditado (Reg. 5810203040)",
      cie10: "I21.9 — Infarto agudo del miocardio sin otra especificación",
      medico: "Médico de Turno 3 (Médico Internista / CMP 0003)",
      camaId: "OBS-01",
      camaNombre: "Observación OBS-01",
      condicionConsentimiento: "paciente_lucido",
      procedimientoConsentimiento: "Atención Médica y Reanimación en Emergencia",
      kardex: [
        { med: "Captopril 25mg", dosis: "1 tableta SL STAT", via: "SL", cum: "CUM-CAPT" },
        { med: "Cloruro de Sodio 0.9% 1000ml", dosis: "NaCl 0.9% 1000 ml EV a 30 gotas/min", via: "EV", cum: "CUM-CLNA" }
      ],
      horasObs: "6|Síndrome Coronario Agudo Descartado / Dolor Torácico",
      estadoAlta: "En Observación — Monitoreo Cardíaco"
    },
    3: {
      titulo: "Caso 3: Cólico Renal Agudo / Urolitiasis Complicada (P-III Amarillo)",
      motivo: "Dolor cólico lumbar unilateral agudo moderado 5/10 irradiado a flanco y fosa ilíaca con náuseas",
      spo2: 98, fc: 84, pas: 130, pad: 85, fr: 18, temp: 37.1, glasgow: 15, glucosa: 100, eva: 5,
      dni: "70809010", nombre: "HERMELINDA ANTONIO VILLANUEVA", edad: 45, sexo: "F", gsan: "O+",
      alergias: "Niega alergias medicamentosas conocidas (NKDA)",
      origen: "comun",
      seguro: "SIS Gratuito (Padrón Único SUSALUD Acreditado)",
      cie10: "R10.4 — Otros dolores abdominales y los no especificados",
      medico: "Médico de Turno 1 (Emergenciólogo / CMP 0001)",
      camaId: "OBS-02",
      camaNombre: "Observación OBS-02",
      condicionConsentimiento: "paciente_lucido",
      procedimientoConsentimiento: "Atención Médica y Reanimación en Emergencia",
      kardex: [
        { med: "Ketorolaco 30mg/ml", dosis: "1 ampolla diluida en 100 ml NaCl 0.9% EV a pasar en 30 min", via: "EV", cum: "CUM-KETO" },
        { med: "Cloruro de Sodio 0.9% 1000ml", dosis: "NaCl 0.9% 1000 ml EV a 45 gotas/min", via: "EV", cum: "CUM-CLNA" }
      ],
      horasObs: "6|Dolor Abdominal Agudo en estudio (Descarte apendicitis / ecografía)",
      estadoAlta: "En Observación — Analgesia Administrada"
    },
    4: {
      titulo: "Caso 4: Faringoamigdalitis Aguda / Síndrome Febril (P-IV Verde)",
      motivo: "Odinofagia marcada de 48 horas de evolución, fiebre cuantificada en 38.0 °C, malestar general sin dificultad respiratoria",
      spo2: 99, fc: 78, pas: 115, pad: 75, fr: 16, temp: 38.0, glasgow: 15, glucosa: 95, eva: 3,
      dni: "45678901", nombre: "RONY ALEXANDER ARENAS HUAMANCHUMO", edad: 28, sexo: "M", gsan: "O+",
      alergias: "Niega alergias medicamentosas conocidas (NKDA)",
      origen: "comun",
      seguro: "SIS Para Todos (Acreditación Automática)",
      cie10: "J45.9 — Asma, no especificada (Crisis asmática)",
      medico: "Médico de Turno 4 (Pediatra de Turno / CMP 0004)",
      camaId: null,
      camaNombre: "Tópico Ambulatorio (Sin cama requerida)",
      condicionConsentimiento: "paciente_lucido",
      procedimientoConsentimiento: "Atención y Tratamiento General de Emergencia",
      kardex: [
        { med: "Paracetamol 500mg", dosis: "1 tableta VO STAT con agua", via: "VO", cum: "CUM-PARA" }
      ],
      horasObs: "4|Crisis Asmática / Broncoespasmo Agudo",
      estadoAlta: "Atendido / Alta Médica Ambulatoria con Receta"
    },
    5: {
      titulo: "Caso 5: Retiro de Puntos de Sutura y Curación de Herida (P-V Azul)",
      motivo: "Paciente ambulatorio acude para retiro de 5 puntos de sutura en antebrazo y curación de herida operatoria limpia",
      spo2: 99, fc: 72, pas: 120, pad: 80, fr: 16, temp: 36.5, glasgow: 15, glucosa: 90, eva: 0,
      dni: "12345678", nombre: "DEMO PACIENTE AMBULATORIO", edad: 32, sexo: "M", gsan: "O+",
      alergias: "Niega alergias medicamentosas conocidas (NKDA)",
      origen: "comun",
      seguro: "Particular / Seguro Privado",
      cie10: "K35.8 — Apendicitis aguda",
      medico: "Médico de Turno 2 (Cirujano de Guardia / CMP 0002)",
      camaId: null,
      camaNombre: "Tópico de Procedimientos Menores",
      condicionConsentimiento: "paciente_lucido",
      procedimientoConsentimiento: "Atención y Tratamiento General de Emergencia",
      kardex: [
        { med: "Clorhexidina 2%", dosis: "Curación tópica y apósito estéril", via: "Tópica", cum: "CUM-CLOR" }
      ],
      horasObs: "4|Crisis Asmática / Broncoespasmo Agudo",
      estadoAlta: "Atendido / Alta Definitiva Post-Procedimiento"
    }
  };

  const c = casos[prioNum];
  if (!c) { window.alert = origAlert; return; }

  // 1. DESPLEGAR Y ABRIR TODOS LOS MÓDULOS (1 AL 8) PARA VISIBILIDAD TOTAL
  for (let i = 1; i <= 8; i++) {
    const b = document.getElementById(`body_mod${i}`);
    if (b) {
      b.style.display = "block";
      b.classList.add("open");
    }
    const a = document.getElementById(`arrow_mod${i}`);
    if (a) a.classList.add("open");
  }

  // 2. MÓDULO 1: LLENAR CONSTANTES VITALES Y EVALUAR TRIAJE
  const elMotivo = document.getElementById("motivo_full");
  const elSpo2 = document.getElementById("spo2_full");
  const elFc = document.getElementById("fc_full");
  const elPas = document.getElementById("pas_full");
  const elPad = document.getElementById("pad_full");
  const elFr = document.getElementById("fr_full");
  const elTemp = document.getElementById("temp_full");
  const elGlasgow = document.getElementById("glasgow_full");
  const elGlucosa = document.getElementById("glucosa_full");
  const elEva = document.getElementById("eva_full");
  const elEvaRange = document.getElementById("eva_range");
  const elIdent = document.getElementById("ident_full");

  if (elMotivo) { elMotivo.value = c.motivo; STATE.motivoConsulta = c.motivo; }
  if (elSpo2) elSpo2.value = c.spo2;
  if (elFc) elFc.value = c.fc;
  if (elPas) elPas.value = c.pas;
  if (elPad) elPad.value = c.pad;
  if (elFr) elFr.value = c.fr;
  if (elTemp) elTemp.value = c.temp;
  if (elGlasgow) elGlasgow.value = c.glasgow;
  if (elGlucosa) elGlucosa.value = c.glucosa;
  if (elEva) elEva.value = c.eva;
  if (elEvaRange) elEvaRange.value = c.eva;
  actualizarEVA(c.eva);

  // Origen del Evento
  if (c.origen === "soat") {
    if (typeof cambiarOrigenEvento === "function") cambiarOrigenEvento("soat");
  } else {
    if (typeof cambiarOrigenEvento === "function") cambiarOrigenEvento("comun");
  }

  // Ejecutar evaluación de triaje completa (ESI v5 + NEWS2 + MINSA)
  evaluarPacienteCompleto();

  // 3. MÓDULO 2: DATOS FILIATORIOS Y RENIEC COMPLETOS
  if (elIdent) elIdent.value = `${c.nombre} (DNI ${c.dni})`;
  const elDniM1 = document.getElementById("dni_mod1");
  if (elDniM1) elDniM1.value = c.dni;
  const elDniM2 = document.getElementById("dni_reniec_input");
  if (elDniM2) elDniM2.value = c.dni;
  const elEdad = document.getElementById("edad_full");
  if (elEdad) elEdad.value = c.edad;
  const elSexo = document.getElementById("sexo_full");
  if (elSexo) elSexo.value = c.sexo;
  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = c.gsan;
  const elAlergias = document.getElementById("alergias_full");
  if (elAlergias) elAlergias.value = c.alergias;

  STATE.numDni = c.dni;
  STATE.nombreReniec = c.nombre;
  STATE.identificador = `${c.nombre} (DNI ${c.dni})`;
  STATE.edad = c.edad;
  STATE.sexo = c.sexo;
  STATE.grupoSanguineo = c.gsan;
  STATE.alergias = c.alergias;
  STATE.historiaClinica = `HC-2026-${c.dni.slice(-4)}`;

  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = STATE.historiaClinica;
  const badgeEstado = document.getElementById("hc_badge_estado");
  if (badgeEstado) {
    badgeEstado.textContent = "✅ Identificado en RENIEC";
    badgeEstado.className = "badge-estado badge-si";
  }

  const m1Card = document.getElementById("m1_reniec_result_card");
  if (m1Card) {
    m1Card.style.display = "block";
    const m1N = document.getElementById("m1_disp_nombre");
    if (m1N) m1N.textContent = c.nombre;
    const m1D = document.getElementById("m1_disp_dni");
    if (m1D) m1D.textContent = c.dni;
    const m1S = document.getElementById("m1_disp_sexo");
    if (m1S) m1S.textContent = c.sexo;
    const m1H = document.getElementById("m1_disp_hc");
    if (m1H) m1H.textContent = STATE.historiaClinica;
  }

  // Sincronizar en todos los módulos
  if (typeof sincronizarDatosPacienteEnTodosLosModulos === "function") {
    sincronizarDatosPacienteEnTodosLosModulos({
      esNN: false,
      dni: c.dni,
      nombre: c.nombre,
      hc: STATE.historiaClinica,
      sexo: c.sexo
    });
  }

  // Generar Brazalete Oficial
  if (typeof generarBrazaleteEmergencia === "function") {
    generarBrazaleteEmergencia("oficial");
  }

  // 4. MÓDULO 3: ASEGURAMIENTO Y PÓLIZA
  STATE.tipoSeguro = c.seguro;
  const badgeSusalud = document.getElementById("badge_susalud_persistencia");
  if (badgeSusalud) {
    badgeSusalud.style.display = "inline-block";
    badgeSusalud.textContent = `[PADRÓN SUSALUD: ${c.seguro.toUpperCase()}]`;
    badgeSusalud.style.background = "#dcfce7";
    badgeSusalud.style.color = "#15803d";
  }

  // 5. MÓDULO 4: MÉDICO DE GUARDIA, DIAGNÓSTICO CIE-10, KARDEX & CONSENTIMIENTO
  actualizarMedicoAsignado(c.medico);

  const selCie = document.getElementById("cie10_select");
  if (selCie) selCie.value = c.cie10;
  STATE.cie10 = c.cie10;

  const selCondC = document.getElementById("sel_condicion_consentimiento");
  if (selCondC) selCondC.value = c.condicionConsentimiento;
  const selProcC = document.getElementById("sel_procedimiento_consentimiento");
  if (selProcC) selProcC.value = c.procedimientoConsentimiento;
  actualizarCondicionConsentimiento(c.condicionConsentimiento);

  const chkConsentimiento = document.getElementById("chk_consentimiento_firmado");
  if (chkConsentimiento) {
    chkConsentimiento.checked = true;
    toggleConsentimientoFirmado(true);
  }

  // Agregar medicamentos al Kardex
  c.kardex.forEach(k => {
    agregarMedicamentoAKardex(k.med, k.dosis, k.via, k.cum);
  });

  // 6. MÓDULO 5: SALA DE OBSERVACIÓN / MONITOREO
  const selHorasObs = document.getElementById("select_m5_patologia_horas");
  if (selHorasObs) selHorasObs.value = c.horasObs;
  if (typeof aplicarNormaHorasObservacion === "function") {
    aplicarNormaHorasObservacion(c.horasObs);
  }
  if (typeof calcularBalanceHidrico === "function") {
    calcularBalanceHidrico();
  }

  // 7. MÓDULO 6: CAMAS & QUIRÓFANOS (ASIGNACIÓN DE RECURSO)
  if (c.camaId && typeof asignarPacienteActualARecurso === "function") {
    // Si la cama estuviese ocupada, liberarla primero para garantizar la simulación limpia
    if (typeof RECURSOS_HOSPITALARIOS !== "undefined" && RECURSOS_HOSPITALARIOS[c.camaId]) {
      RECURSOS_HOSPITALARIOS[c.camaId].estado = "disponible";
    }
    asignarPacienteActualARecurso(c.camaId, null, null, true);
  } else {
    STATE.camaAsignada = c.camaNombre;
  }

  // 8. MÓDULO 7: CIERRE ASISTENCIAL Y ALTA
  STATE.destinoPostTopico = (prioNum === 1) ? "shock_trauma" : (prioNum <= 3 ? "observacion" : "alta");

  // 9. MÓDULO 8: FACTURACIÓN Y LIQUIDACIÓN AL 100%
  if (typeof actualizarFactura === "function") {
    actualizarFactura();
  }
  if (typeof sincronizarFacturacionYExportar === "function") {
    sincronizarFacturacionYExportar(true);
  }

  // 10. MARCAR TODOS LOS 8 PASOS DEL STEPPER COMO COMPLETADOS
  for (let i = 1; i <= 8; i++) {
    const btnTop = document.getElementById(`btnStepTop_${i}`);
    if (btnTop) btnTop.classList.add("is-completed");
    const btnDrawer = document.getElementById(`btnStepDrawer_${i}`);
    if (btnDrawer) btnDrawer.classList.add("is-completed");
  }

  // 11. ACTUALIZAR EN LA COLA DE EMERGENCIAS
  let pxActivo = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
  if (!pxActivo) {
    pxActivo = crearRegistroPaciente({
      identificador: STATE.identificador,
      nombre: c.nombre,
      dni: c.dni,
      prioridad: (prioNum === 1 ? 'I' : (prioNum === 2 ? 'II' : (prioNum === 3 ? 'III' : (prioNum === 4 ? 'IV' : 'V')))),
      camaNombre: c.camaNombre,
      medico: c.medico,
      estadoAtencion: c.estadoAlta
    });
    PACIENTES_COLA = [pxActivo];
    pacienteActivoId = pxActivo.id;
  } else {
    pxActivo.nombre = c.nombre;
    pxActivo.dni = c.dni;
    pxActivo.medico = c.medico;
    pxActivo.camaNombre = c.camaNombre;
    pxActivo.prioridad = (prioNum === 1 ? 'I' : (prioNum === 2 ? 'II' : (prioNum === 3 ? 'III' : (prioNum === 4 ? 'IV' : 'V'))));
    pxActivo.estadoAtencion = c.estadoAlta;
  }
  renderizarTableroColaPacientes();

  // 12. BLOQUEO GENERAL DE TODOS LOS CAMPOS DE LOS 8 MÓDULOS (AUDITORÍA INMUTABLE)
  bloquearCamposSimulacion(true);

  // Restaurar alert
  window.alert = origAlert;

  // Feedback y activación del botón seleccionado
  document.querySelectorAll('.btn-preset-caso').forEach(b => b.classList.remove('active-preset'));
  const btnAct = document.getElementById(`btn_preset_${prioNum}`);
  if (btnAct) btnAct.classList.add('active-preset');

  const msgToast = document.getElementById("toast_preset_msg");
  if (msgToast) {
    msgToast.style.display = "block";
    msgToast.innerHTML = `🧪 <strong>Simulación Finalizada al 100%:</strong> ${c.titulo}. Los 8 módulos fueron completados exitosamente y todos los campos se encuentran bloqueados con sus constantes oficiales.`;
    setTimeout(() => { msgToast.style.display = "none"; }, 5000);
  }
}


// ==============================================================================
