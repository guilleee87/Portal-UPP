/**
 * ==============================================================================
 * SIMULADOR HIS COMPLETO — EMERGENCIA NIVEL III-1
 * Curso: Pensamiento Algorítmico - Ciclo II (Trabajo Parcial UPP)
 * Facultad de Ciencias de la Salud — Enfermería
 * Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
 * ==============================================================================
 * Módulos Implementados:
 *   1. Enfermería 1: APISPERU/RENIEC, Modalidad, HC, Alerta NN
 *   2. Enfermería 2: Verificación manual SUSALUD/SIS/EsSalud/SOAT/EPS
 *   3. Triaje Clínico: 8 Signos Vitales, 5 Prioridades (I–V), Ley 27604
 *   4. Gestión de Camas: Stock en tiempo real, REFCON
 *   5. Laboratorio / Imágenes / Banco de Sangre
 *   6. Farmacia: Prescripción + cargo a factura
 *   7. Ruta Clínica, Consentimiento Informado, Estado de Salida
 *   8. Reporte de Auditoría + Factura imprimible
 * ==============================================================================
 */


// ---------------------------------------------------------------------------
// 1. CONFIGURACIÓN Y TOKEN DE APISPERU (RENIEC)
// ---------------------------------------------------------------------------
const DEFAULT_APISPERU_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6Imd1aWxsZXJtb3ZzdmxAZ21haWwuY29tIiwianRpIjoiZGE3MjEyOTliNTY0ODJjNyJ9.Bz4MHxTs72gLqGKlIuaIZ25NJmwtGx1ZqnkQU8YOorw";


// ---------------------------------------------------------------------------
// 2. BASE DE DATOS SIMULADA (IDÉNTICA a triage_prioridad.py — NO MODIFICAR)
// ---------------------------------------------------------------------------
const BASE_DATOS_HC = {
  "px a": "HC-2025-089",
  "px b": "HC-2026-142",
  "10203040": "HC-2024-510",
  "70809010": "HC-2025-332",
  "carlos mendoza rojas": "HC-2023-115",
  "maria torres silva": "HC-2024-890",
};


// Cargar base de datos persistente desde localStorage
try {
  const bdLocal = localStorage.getItem("UPP_BASE_DATOS_HC");
  if (bdLocal) {
    Object.assign(BASE_DATOS_HC, JSON.parse(bdLocal));
  }
} catch (e) {}


let contadorHcNueva = parseInt(localStorage.getItem("UPP_CONTADOR_HC") || "1", 10);
let contadorHcTemp = 1;


// ---------------------------------------------------------------------------

// ==============================================================================
// MOTOR DE AUTO-GUARDADO REACTIVO EN HISTORIA CLÍNICA (SUPABASE CLOUD & MASTER DB)
// Guarda de manera inmediata CADA CAMBIO clínico, administrativo y asistencial.
// Sustentos: NTS N° 139-MINSA/DGIEM (Historia Clínica) y Ley N° 29414
// ==============================================================================
async function autoGuardarCambioEnHistoriaClinica(motivo = "Actualización asistencial") {
  const cleanId = String(STATE.identificador || STATE.numDni || "").trim();
  const fechaActual = new Date();
  const horaStr = fechaActual.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // 1. Número de Historia Clínica formal
  let nroHc = STATE.historiaClinica;
  if (!nroHc || nroHc === "—") {
    if (cleanId && cleanId.length >= 2) {
      nroHc = `HC-2026-${cleanId.slice(-4)}`;
      STATE.historiaClinica = nroHc;
      const hcDisplay = document.getElementById("hc_display");
      if (hcDisplay) hcDisplay.textContent = nroHc;
    } else {
      nroHc = "HC-EN-PROCESO";
    }
  }

  // 2. Compilar snapshot del episodio clínico actual
  const snapshotEpisodio = {
    fecha_modificacion: fechaActual.toISOString(),
    fecha_hora_texto: `${fechaActual.toLocaleDateString()}, ${horaStr}`,
    motivo_actualizacion: motivo,
    identificador: cleanId || "SIN_DNI",
    historia_clinica: nroHc,
    nombre_completo: STATE.nombreReniec || STATE.identificador || "Paciente en Atención",
    edad: STATE.edad || document.getElementById("edad_full")?.value || null,
    sexo: STATE.sexo || document.getElementById("sexo_full")?.value || "M",
    tipo_seguro: STATE.tipoSeguro || "Particular",
    prioridad: STATE.prioridad ? `P-${STATE.prioridad}` : "Por evaluar",
    ticket: STATE.turno || "T-01",
    cama_asignada: STATE.camaAsignada || "Ninguna asignada",
    horas_observacion: STATE.horasObservacion || 0,
    cie10: STATE.cie10Codigo ? `${STATE.cie10Codigo} - ${STATE.cie10Descripcion}` : "En evaluación",
    medico_tratante: STATE.medicoTratante || "Por asignar",
    signos_vitales: {
      spo2: document.getElementById("spo2_full")?.value || STATE.spo2 || "—",
      fc: document.getElementById("fc_full")?.value || STATE.fc || "—",
      fr: document.getElementById("fr_full")?.value || STATE.fr || "—",
      pa: `${document.getElementById("pas_full")?.value || STATE.pasSistolica || "—"}/${document.getElementById("pad_full")?.value || STATE.padDiastolica || "—"}`,
      temp: document.getElementById("temp_full")?.value || STATE.temp || "—",
      glucosa: document.getElementById("glucosa_full")?.value || STATE.glucosa || "—",
      glasgow: document.getElementById("glasgow_full")?.value || STATE.glasgow || "15",
      dolor: document.getElementById("eva_full")?.value || STATE.eva || "0"
    },
    kardex_count: STATE.kardexItems?.length || 0,
    lab_count: STATE.ordenesLaboratorio?.length || 0,
    imagenes_count: STATE.ordenesImagenes?.length || 0,
    total_facturado: STATE.items_factura?.reduce((acc, i) => acc + (parseFloat(i.costo) || 0), 0) || 0,
    estado_salida: STATE.estadoSalida || "En atención activa",
    firmante: STATE.firmante || "Lic. Enfermería / Dr. Guardia UPP"
  };

  // 3. Persistir en Base de Datos Local de Pacientes Master
  try {
    const master = cargarPacientesMaster();
    const idKey = cleanId || "PACIENTE_ACTUAL";
    if (!master[idKey]) {
      master[idKey] = {
        identificador: cleanId,
        historia_clinica: nroHc,
        nombre_completo: snapshotEpisodio.nombre_completo,
        tipo_seguro: snapshotEpisodio.tipo_seguro,
        episodios: []
      };
    }
    master[idKey].tipo_seguro = snapshotEpisodio.tipo_seguro;
    master[idKey].historia_clinica = nroHc;
    master[idKey].ultimo_episodio = snapshotEpisodio;
    guardarPacientesMaster(master);
  } catch(e) {
    console.warn("Aviso master:", e);
  }

  // 4. Sincronizar en la Nube de Supabase (Tabla historias_clinicas)
  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key && cleanId && cleanId.length >= 2) {
    try {
      const payloadSupabase = {
        identificador: cleanId,
        historia_clinica: nroHc,
        nombre_completo: STATE.nombreReniec || cleanId,
        tipo_seguro: STATE.tipoSeguro || "Particular",
        estado_bd: "Si",
        prioridad: STATE.prioridad ? `P-${STATE.prioridad}` : null,
        ticket: STATE.turno || "T-01"
      };

      const resCheck = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.eq.${encodeURIComponent(cleanId)},identificador.ilike.*${encodeURIComponent(cleanId)}*)&select=id`, {
        headers: { "apikey": SUPABASE_CONFIG.key, "Authorization": `Bearer ${SUPABASE_CONFIG.key}` }
      });
      const data = await resCheck.json();

      if (data && data.length > 0) {
        await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.eq.${encodeURIComponent(cleanId)},identificador.ilike.*${encodeURIComponent(cleanId)}*)`, {
          method: "PATCH",
          headers: {
            "apikey": SUPABASE_CONFIG.key,
            "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payloadSupabase)
        });
      } else {
        await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_CONFIG.key,
            "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payloadSupabase)
        });
      }
      console.log(`☁️ Supabase Cloud sincronizado [${motivo}] para DNI: ${cleanId}`);
    } catch(e) {
      console.warn("Aviso sincronización Supabase:", e);
    }
  }

  // 5. Reflejo visual inmediato en la Barra de Telemetría Superior
  const badgeDb = document.getElementById("telemetry_db_status");
  if (badgeDb) {
    badgeDb.innerHTML = `☁️ Supabase &amp; HC: <strong>Guardado '${motivo}' (${horaStr})</strong>`;
    badgeDb.style.color = "#16a34a";
  }
}


// CONFIGURACIÓN OFICIAL SUPABASE (CLOUD DATABASE)
// ---------------------------------------------------------------------------
const SUPABASE_CONFIG = {
  url: "https://fvgogdgxfmxupyegeuzp.supabase.co",
  key: "sb_publishable_mFaj4X5VLMkI3hkBZvA9Zw_TeeNFbFm"
};


async function sincronizarConSupabase(identificador, nroHc, nombre = "", seguro = "", ticket = "", prioridad = "") {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.key) return null;
  const cleanId = String(identificador || "").trim().toLowerCase();
  if (!cleanId || cleanId.length < 2) return null;
  try {
    // 1. Buscar si ya existe en la nube
    const resCheck = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?identificador=eq.${encodeURIComponent(cleanId)}&select=*`, {
      headers: {
        "apikey": SUPABASE_CONFIG.key,
        "Authorization": `Bearer ${SUPABASE_CONFIG.key}`
      }
    });
    if (resCheck.ok) {
      const data = await resCheck.json();
      if (data && data.length > 0) {
        // Si existe y hay datos nuevos (seguro, ticket o prioridad), actualizar fila
        if (seguro || ticket || prioridad) {
          const patchBody = {};
          if (seguro) patchBody.tipo_seguro = seguro;
          if (ticket) patchBody.ticket = ticket;
          if (prioridad) patchBody.prioridad = prioridad;
          await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?identificador=eq.${encodeURIComponent(cleanId)}`, {
            method: "PATCH",
            headers: {
              "apikey": SUPABASE_CONFIG.key,
              "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(patchBody)
          });
        }
        return data[0];
      }
    }
    // 2. Si no existe, insertar nuevo paciente en Supabase
    const resInsert = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_CONFIG.key,
        "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify({
        identificador: cleanId,
        historia_clinica: nroHc,
        nombre_completo: nombre || cleanId.toUpperCase(),
        tipo_seguro: seguro || null,
        ticket: ticket || null,
        prioridad: prioridad || null,
        estado_bd: nroHc.includes("NUEVA") ? "No" : "Si"
      })
    });
    if (resInsert.ok) {
      const inserted = await resInsert.json();
      console.log("☁️ Paciente guardado en Supabase en tiempo real:", inserted);
      return inserted[0] || null;
    }
  } catch (err) {
    console.warn("Aviso: Supabase sync:", err.message);
  }
  return null;
}


function persistirBaseDatosLocal(clave, nroHc, nombre = "") {
  BASE_DATOS_HC[clave] = nroHc;
  try {
    localStorage.setItem("UPP_BASE_DATOS_HC", JSON.stringify(BASE_DATOS_HC));
    localStorage.setItem("UPP_CONTADOR_HC", String(contadorHcNueva));
  } catch (e) {}


  // 1. Sincronizar con base de datos SQLite local en disco
  try {
    fetch(`/api/hc?identificador=${encodeURIComponent(clave)}&nombre=${encodeURIComponent(nombre || clave)}`).catch(() => {});
  } catch (e) {}


  // 2. Sincronizar en vivo con la nube de Supabase
  try {
    sincronizarConSupabase(clave, nroHc, nombre, STATE.tipoSeguro, STATE.turno);
  } catch (e) {}
}


// ---------------------------------------------------------------------------
// GESTIÓN MAESTRA DE PACIENTES Y EXPEDIENTES EPISÓDICOS HISTÓRICOS (MINSA/UPP)
// ---------------------------------------------------------------------------
const STORAGE_KEY_PACIENTES_MASTER = "UPP_PACIENTES_MASTER_V2";
const STORAGE_KEY_HISTORIAL_EPISODIOS = "UPP_HISTORIAL_EPISODIOS_V2";


// Semilla inicial de pacientes con datos clínicos permanentes y antecedentes de alergias
const PACIENTES_MASTER_SEED = {
  "10203040": {
    identificador: "10203040",
    historia_clinica: "HC-2024-510",
    nombre_completo: "Carlos Mendoza Rojas",
    fecha_nacimiento: "1988-06-15",
    edad: 38,
    sexo: "M",
    tipo_seguro: "EsSalud",
    alergias: "Alérgico a Penicilina (Anafilaxia previa severa) y Sulfas",
    antecedentes: "Hipertensión Arterial, Asma bronquial leve",
    episodios: [
      {
        folio: "FOLIO-20261102-1402",
        fecha: "02/11/2026",
        hora: "14:35",
        fecha_hora: "02/11/2026, 14:35:10",
        identificador: "10203040",
        historia_clinica: "HC-2024-510",
        nombre_completo: "Carlos Mendoza Rojas",
        edad: 38,
        sexo: "M",
        alergias: "Alérgico a Penicilina (Anafilaxia previa severa) y Sulfas",
        tipo_seguro: "EsSalud",
        ticket: "T-03",
        motivo_consulta: "Disnea y sibilancias respiratorias de inicio agudo",
        prioridad: "P-II (EMERGENCIA)",
        color_prioridad: "#ea580c",
        destino_clinico: "Tópico de Emergencia / Nebulización",
        signos_vitales: {
          spo2: "91", fc: "108", fr: "26", pas: "135", pad: "85", temp: "36.7", glucosa: "112", glasgow: "15", dolor: "3"
        },
        cama_asignada: "Cama 02 - Observación",
        examenes_realizados: [{ descripcion: "Gases Arteriales (AGA)", costo: 45 }, { descripcion: "Radiografía de Tórax AP", costo: 60 }],
        medicamentos_despachados: [{ descripcion: "Salbutamol solución para nebulizar", costo: 15 }, { descripcion: "Hidrocortisona 100mg EV", costo: 25 }],
        total_facturado: 0.00,
        cobertura_info: "100% Cubierto por EsSalud (Ley N° 27604 - Pago Cero)",
        estado_salida: "Alta con indicación de tratamiento ambulatorio",
        firmante: "Lic. R. Añazgo Farro (CEP 84729) / Dr. L. Vásquez Valdivieso (CMP 62910)"
      }
    ]
  },
  "70809010": {
    identificador: "70809010",
    historia_clinica: "HC-2025-332",
    nombre_completo: "Maria Torres Silva",
    fecha_nacimiento: "1994-09-22",
    edad: 32,
    sexo: "F",
    tipo_seguro: "SIS Gratuito",
    alergias: "Alérgica a AINEs (Ibuprofeno, Ketorolaco — Angioedema)",
    antecedentes: "Migraña episódica, Gastritis superficial",
    episodios: [
      {
        folio: "FOLIO-20261105-0918",
        fecha: "05/11/2026",
        hora: "09:18",
        fecha_hora: "05/11/2026, 09:18:24",
        identificador: "70809010",
        historia_clinica: "HC-2025-332",
        nombre_completo: "Maria Torres Silva",
        edad: 32,
        sexo: "F",
        alergias: "Alérgica a AINEs (Ibuprofeno, Ketorolaco — Angioedema)",
        tipo_seguro: "SIS Gratuito",
        ticket: "T-04",
        motivo_consulta: "Cefalea holocraneana pulsátil EVA 8/10 con náuseas y fotofobia",
        prioridad: "P-III (URGENCIA MENOR)",
        color_prioridad: "#ca8a04",
        destino_clinico: "Consultorio de Urgencias Médicas",
        signos_vitales: {
          spo2: "98", fc: "82", fr: "18", pas: "115", pad: "75", temp: "36.5", glucosa: "96", glasgow: "15", dolor: "8"
        },
        cama_asignada: "Cama 05 - Observación Mujeres",
        examenes_realizados: [{ descripcion: "Hemograma Automatizado", costo: 30 }],
        medicamentos_despachados: [{ descripcion: "Paracetamol 1g EV (Evitar AINEs por alergia)", costo: 18 }, { descripcion: "Dimenhidrinato 50mg EV", costo: 12 }],
        total_facturado: 0.00,
        cobertura_info: "100% Cubierto por SIS Gratuito (FUA Acreditado - Pago Cero)",
        estado_salida: "Alta con remisión sintomática completa",
        firmante: "Lic. L. Vásquez Valdivieso (CEP 78314) / Méd. Urgenciólogo"
      }
    ]
  }
};


function normalizarClavePaciente(val) {
  return String(val || "").trim().toLowerCase().replace(/[\s\.\-]/g, "");
}


function cargarPacientesMaster() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PACIENTES_MASTER);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (e) {}
  guardarPacientesMaster(PACIENTES_MASTER_SEED);
  return { ...PACIENTES_MASTER_SEED };
}


function guardarPacientesMaster(map) {
  try {
    localStorage.setItem(STORAGE_KEY_PACIENTES_MASTER, JSON.stringify(map));
  } catch (e) {}
}


function obtenerPacienteMaster(identificador, nroHc = "", nombre = "") {
  const master = cargarPacientesMaster();
  const cId = normalizarClavePaciente(identificador);
  const cHc = normalizarClavePaciente(nroHc);
  const cNom = normalizarClavePaciente(nombre);


  for (const [k, p] of Object.entries(master)) {
    const pkId = normalizarClavePaciente(p.identificador);
    const pkHc = normalizarClavePaciente(p.historia_clinica);
    const pkNom = normalizarClavePaciente(p.nombre_completo);


    if ((cId && pkId === cId) || (cHc && pkHc === cHc) || (cNom && pkNom === cNom)) {
      return p;
    }
  }
  return null;
}


function obtenerOInicializarPacienteMaster(identificador, nroHc, nombre = "", tipoSeguro = "") {
  let p = obtenerPacienteMaster(identificador, nroHc, nombre);
  const master = cargarPacientesMaster();
  const cleanId = String(identificador || "").trim();


  if (!p) {
    p = {
      identificador: cleanId || "TEMP",
      historia_clinica: nroHc || `HC-${new Date().getFullYear()}-${Math.floor(100+Math.random()*900)}`,
      nombre_completo: nombre || cleanId.toUpperCase(),
      fecha_nacimiento: "",
      edad: null,
      sexo: "M",
      tipo_seguro: tipoSeguro || "EsSalud",
      alergias: "Niega alergias medicamentosas conocidas (NKDA)",
      antecedentes: "Sin antecedentes patológicos relevantes declarados",
      episodios: []
    };
    master[cleanId || p.historia_clinica] = p;
    guardarPacientesMaster(master);
  } else {
    let mod = false;
    if (nroHc && (!p.historia_clinica || p.historia_clinica === "—")) { p.historia_clinica = nroHc; mod = true; }
    if (nombre && (!p.nombre_completo || p.nombre_completo === p.identificador)) { p.nombre_completo = nombre; mod = true; }
    if (tipoSeguro && !p.tipo_seguro) { p.tipo_seguro = tipoSeguro; mod = true; }
    if (mod) {
      master[p.identificador || p.historia_clinica] = p;
      guardarPacientesMaster(master);
    }
  }
  return p;
}


function actualizarAlergiasEnMaster(identificador, nroHc, alergias) {
  if (!alergias || !identificador) return;
  const master = cargarPacientesMaster();
  const cId = normalizarClavePaciente(identificador);
  const cHc = normalizarClavePaciente(nroHc);


  for (const [k, p] of Object.entries(master)) {
    const pkId = normalizarClavePaciente(p.identificador);
    const pkHc = normalizarClavePaciente(p.historia_clinica);
    if ((cId && pkId === cId) || (cHc && pkHc === cHc)) {
      p.alergias = alergias;
      master[k] = p;
      guardarPacientesMaster(master);
      return;
    }
  }
}


function actualizarAlergiasEnTiempoReal(val) {
  const cleanVal = String(val || "").trim();
  STATE.alergias = cleanVal;
  actualizarIndicadorVisualAlergias(cleanVal);
  if (STATE.identificador && STATE.historiaClinica) {
    actualizarAlergiasEnMaster(STATE.identificador, STATE.historiaClinica, cleanVal);
  }
}


function actualizarIndicadorVisualAlergias(val) {
  const tag = document.getElementById("alergias_alerta_tag");
  const banner = document.getElementById("alergias_alerta_banner");
  const input = document.getElementById("alergias_full");


  const str = String(val || "").trim();
  const esAlergico = str && !str.toLowerCase().includes("niega") && !str.toLowerCase().includes("ninguna") && !str.toLowerCase().includes("desconocida");


  if (tag) tag.style.display = esAlergico ? "inline-block" : "none";
  if (banner) {
    if (esAlergico) {
      banner.innerHTML = `⚠️ <strong>ALERTA ASISTENCIAL:</strong> Paciente con alergia crítica a <strong>"${str}"</strong>. Prohibido prescribir medicamentos derivados o de reactividad cruzada.`;
      banner.style.display = "block";
    } else {
      banner.style.display = "none";
    }
  }
  if (input) {
    if (esAlergico) {
      input.style.borderColor = "#ef4444";
      input.style.backgroundColor = "#fff1f2";
      input.style.color = "#991b1b";
      input.style.fontWeight = "700";
    } else {
      input.style.borderColor = "";
      input.style.backgroundColor = "";
      input.style.color = "";
      input.style.fontWeight = "";
    }
  }
}


function limpiarCamposParaNuevaAtencion() {
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = "";
  STATE.motivoConsulta = "";


  ["spo2_full","fc_full","pas_full","pad_full","fr_full","temp_full","glucosa_full","glasgow_full"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const elEva = document.getElementById("eva_full");
  if (elEva) elEva.value = "0";
  const elEvaRange = document.getElementById("eva_range");
  if (elEvaRange) elEvaRange.value = "0";
  const elEvaLabel = document.getElementById("eva_label");
  if (elEvaLabel) elEvaLabel.textContent = "Sin dolor";


  STATE.prioridad = null;
  STATE.colorPrioridad = null;
  const elPrioridadDisplay = document.getElementById("prioridad_display");
  if (elPrioridadDisplay) elPrioridadDisplay.classList.remove("visible");


  STATE.camaAsignada = null;
  const elCamaDisplay = document.getElementById("camaAsignadaDisplay");
  if (elCamaDisplay) elCamaDisplay.style.display = "none";
  document.querySelectorAll(".cama-slot-btn").forEach(btn => btn.classList.remove("selected"));


  STATE.items_factura = [];
  actualizarFactura();


  const elFirma = document.getElementById("firma_consentimiento");
  if (elFirma) elFirma.value = "";
  const elFirmaTs = document.getElementById("firma_timestamp");
  if (elFirmaTs) elFirmaTs.textContent = "";
  const elSalida = document.getElementById("salida_display");
  if (elSalida) elSalida.style.display = "none";


  const ahora = new Date();
  const horaStr = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  const elHora = document.getElementById("hora_full");
  if (elHora) elHora.value = horaStr;
  STATE.horaLlegada = horaStr;
}


function obtenerEpisodiosDePaciente(identificador, nroHc) {
  const cId = normalizarClavePaciente(identificador);
  const cHc = normalizarClavePaciente(nroHc);


  let episodios = [];


  try {
    const rawGlobal = localStorage.getItem(STORAGE_KEY_HISTORIAL_EPISODIOS) || localStorage.getItem("UPP_HISTORIAL_EPISODIOS") || "[]";
    const parsedGlobal = JSON.parse(rawGlobal);
    if (Array.isArray(parsedGlobal)) {
      parsedGlobal.forEach(ep => {
        const epId = normalizarClavePaciente(ep.identificador);
        const epHc = normalizarClavePaciente(ep.historia_clinica);
        if ((cId && (epId.includes(cId) || cId.includes(epId))) || (cHc && epHc === cHc) || (cId && ep.nombre_completo && normalizarClavePaciente(ep.nombre_completo).includes(cId))) {
          episodios.push(ep);
        }
      });
    }
  } catch (e) {}


  const master = obtenerPacienteMaster(identificador, nroHc);
  if (master && Array.isArray(master.episodios)) {
    master.episodios.forEach(ep => {
      if (!episodios.some(x => x.folio && ep.folio && x.folio === ep.folio)) {
        episodios.push(ep);
      }
    });
  }


  episodios.sort((a, b) => {
    const fA = a.fecha_hora ? new Date(a.fecha_hora).getTime() : 0;
    const fB = b.fecha_hora ? new Date(b.fecha_hora).getTime() : 0;
    return fB - fA;
  });


  return episodios;
}




// ---------------------------------------------------------------------------
// 2. CLASIFICACIÓN DE IDENTIDAD (igual que triage_prioridad.py)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// MOTOR DE BÚSQUEDA Y CONSULTA DE HISTORIAS CLÍNICAS (DNI / APELLIDOS / NOMBRES)
// ---------------------------------------------------------------------------
let busquedaCoincidenciasTimer = null;
let catalogoHcCache = [];


async function buscarCoincidenciasHC(termino) {
  const cleanTerm = String(termino || "").trim();
  if (cleanTerm.length < 2) return [];


  let resultados = [];


  // 1. Consultar en la nube de Supabase (PostgREST ILIKE)
  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
    try {
      const encoded = encodeURIComponent(cleanTerm);
      const url = `${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.ilike.*${encoded}*,nombre_completo.ilike.*${encoded}*,historia_clinica.ilike.*${encoded}*)&select=*&limit=15`;
      const res = await fetch(url, {
        headers: {
          "apikey": SUPABASE_CONFIG.key,
          "Authorization": `Bearer ${SUPABASE_CONFIG.key}`
        }
      });
      if (res.ok) {
        resultados = await res.json();
      }
    } catch (e) {
      console.warn("Supabase query fallback:", e);
    }
  }


  // 2. Si no hubo resultados en la nube o falló la red, consultar SQLite local
  if (resultados.length === 0) {
    try {
      const resLocal = await fetch(`/api/hc/coincidencias?q=${encodeURIComponent(cleanTerm)}`);
      if (resLocal.ok) {
        const dataLocal = await resLocal.json();
        if (dataLocal.exito && dataLocal.resultados) {
          resultados = dataLocal.resultados;
        }
      }
    } catch (e) {}
  }


  // 3. Fallback de emergencia a la memoria del navegador (BASE_DATOS_HC)
  if (resultados.length === 0) {
    const termLow = cleanTerm.toLowerCase();
    for (const [k, v] of Object.entries(BASE_DATOS_HC)) {
      if (k.includes(termLow) || v.toLowerCase().includes(termLow)) {
        resultados.push({
          identificador: k,
          historia_clinica: v,
          nombre_completo: k.toUpperCase(),
          tipo_seguro: "Asegurado",
          ticket: "T-01",
          estado_bd: "Si"
        });
      }
    }
  }


  return resultados;
}


async function ejecutarBusquedaCoincidenciasEnVivo(termino) {
  const dropdown = document.getElementById("hc_sugerencias_dropdown");
  if (!dropdown) return;


  const resultados = await buscarCoincidenciasHC(termino);


  if (!resultados || resultados.length === 0) {
    dropdown.style.display = "none";
    dropdown.innerHTML = "";
    return;
  }


  let html = `
    <div class="hc-sugerencias-header">
      <span>🎯 ${resultados.length} COINCIDENCIA(S) EN BD (SUPABASE / LOCAL):</span>
      <span style="cursor:pointer;color:#dc2626;" onclick="cerrarSugerenciasHC()">✕ Cerrar</span>
    </div>
  `;


  resultados.forEach(p => {
    const ident = p.identificador || "—";
    const nom = p.nombre_completo || ident;
    const hc = p.historia_clinica || "—";
    const seg = p.tipo_seguro || "Sin seguro";
    const pJson = encodeURIComponent(JSON.stringify(p));


    html += `
      <div class="hc-sugerencia-item" onclick="seleccionarPacienteDeBusqueda('${pJson}')">
        <div>
          <div class="nombre">👤 ${nom}</div>
          <div class="meta">
            <span>DNI/ID: <strong>${ident}</strong></span>
            <span class="hc-pill-tag">${hc}</span>
            <span class="hc-pill-seguro">${seg}</span>
          </div>
        </div>
        <div style="font-size:0.75rem;font-weight:700;color:#0284c7;background:#e0f2fe;padding:4px 8px;border-radius:6px;">
          Elegir ➔
        </div>
      </div>
    `;
  });


  dropdown.innerHTML = html;
  dropdown.style.display = "block";
}


function cerrarSugerenciasHC() {
  const dropdown = document.getElementById("hc_sugerencias_dropdown");
  if (dropdown) {
    dropdown.style.display = "none";
  }
}


function seleccionarPacienteDeBusqueda(pacienteEncoded) {
  let paciente;
  try {
    paciente = typeof pacienteEncoded === "string" ? JSON.parse(decodeURIComponent(pacienteEncoded)) : pacienteEncoded;
  } catch (e) {
    paciente = pacienteEncoded;
  }
  if (!paciente) return;
  cerrarSugerenciasHC();
  cerrarModalConsultaHC();
  cerrarModalVisualizarHC();
  const ident = paciente.identificador || "";
  const nom = paciente.nombre_completo || ident;
  const hc = paciente.historia_clinica || "";
  // Recuperar registro maestro permanente que conserva ALERGIAS y demografía indeleble
  const master = obtenerOInicializarPacienteMaster(ident, hc, nom, paciente.tipo_seguro);
  const seguro = master.tipo_seguro || paciente.tipo_seguro || "EsSalud";
  const alergias = master.alergias || paciente.alergias || "Niega alergias medicamentosas conocidas";
  // 1. Cargar en el input principal de Módulo 1
  const inputIdent = document.getElementById("ident_full");
  if (inputIdent) inputIdent.value = ident;
  // Actualizar STATE con datos del paciente
  STATE.identificador = `${nom} (ID ${ident})`;
  STATE.historiaClinica = hc;
  STATE.nombreReniec = nom;
  STATE.estadoRegistrado = "Si";
  STATE.accionHc = `Paciente autenticado: ${nom} -> HC ${hc} recuperada de BD`;
  STATE.alertaPnpSs = false;
  STATE.edad = master.edad || STATE.edad;
  STATE.sexo = master.sexo || "M";
  STATE.alergias = alergias;
  // Datos demográficos
  if (master.fecha_nacimiento) {
    const elFecha = document.getElementById("fecha_nac_full");
    if (elFecha) elFecha.value = master.fecha_nacimiento;
  }
  if (master.edad) {
    const elEdad = document.getElementById("edad_full");
    if (elEdad) elEdad.value = master.edad;
  }
  if (master.sexo) {
    const elSexo = document.getElementById("sexo_full");
    if (elSexo) elSexo.value = master.sexo;
  }
  // ⚠️ PRESERVAR Y CARGAR ALERGIAS PERMANENTES EN EL FORMULARIO
  const elAlergias = document.getElementById("alergias_full");
  if (elAlergias) {
    elAlergias.value = alergias;
    actualizarIndicadorVisualAlergias(alergias);
  }
  // Indicadores visuales de Módulo 1
  const badgeEl = document.getElementById("hc_badge_estado");
  if (badgeEl) {
    badgeEl.textContent = "Si (En BD)";
    badgeEl.className = "badge-estado badge-si";
  }
  const codeEl = document.getElementById("hc_code_display");
  if (codeEl) codeEl.textContent = hc;
  const accEl = document.getElementById("hc_accion_display");
  if (accEl) accEl.textContent = `HC ${hc} activa · Alergias: ${alergias}`;
  const alertaNn = document.getElementById("alerta_nn");
  if (alertaNn) alertaNn.classList.remove("visible");
  // Panel RENIEC / Base de Datos
  const panelReniec = document.getElementById("apisperu_panel");
  if (panelReniec) {
    const esAlergico = alergias && !alergias.toLowerCase().includes("niega") && !alergias.toLowerCase().includes("ninguna");
    panelReniec.innerHTML = `
      <div class="apisperu-title">✅ Paciente Seleccionado desde Base de Datos Hospitalaria</div>
      <div class="apisperu-result" style="font-size:1.1rem;font-weight:800;color:#166534;">${nom}</div>
      <div style="font-size:0.82rem;color:#334155;margin-top:6px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px;background:#ffffff;padding:10px 12px;border-radius:8px;border:1.5px solid #bbf7d0;">
        <div><strong>DNI/ID:</strong> ${ident}</div>
        <div><strong>Historia Clínica:</strong> <span class="hc-pill-tag">${hc}</span></div>
        <div><strong>Seguro Registrado:</strong> <span class="hc-pill-seguro">${seguro}</span></div>
        <div style="grid-column: 1 / -1; ${esAlergico ? "background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:6px 10px;border-radius:6px;font-weight:800;" : "color:#166534;"}">
          ${esAlergico ? `⚠️ ALERGIA REGISTRADA EN HC: ${alergias}` : `✓ Condición Alergias: ${alergias}`}
        </div>
      </div>
    `;
    panelReniec.classList.add("visible");
  }
  // Asignar seguro en Módulo 2
  if (seguro) {
    actualizarSeguroConsolidado(seguro);
    STATE.tipoSeguro = seguro;
    const segLow = seguro.toLowerCase();
    if (segLow.includes("essalud")) activarTabSeguro("essalud", document.querySelectorAll(".seguro-tab")[1]);
    else if (segLow.includes("sis")) activarTabSeguro("sis", document.querySelectorAll(".seguro-tab")[0]);
    else if (segLow.includes("soat")) activarTabSeguro("soat", document.querySelectorAll(".seguro-tab")[2]);
    else if (segLow.includes("eps")) activarTabSeguro("eps", document.querySelectorAll(".seguro-tab")[3]);
  }
  // 🏥 INICIAR NUEVO ENCUENTRO DE EMERGENCIA (LIMPIAR SIGNOS VITALES, MOTIVO Y FACTURA ANTERIOR)
  limpiarCamposParaNuevaAtencion();
  // Asignar nuevo ticket y hora actual de llegada
  calcularTicket();
  // Guardar en sesión local
  BASE_DATOS_HC[ident.toLowerCase()] = hc;
  BASE_DATOS_HC[nom.toLowerCase()] = hc;
}
// ---------------------------------------------------------------------------
// MODAL DE CATÁLOGO COMPLETO DE HISTORIAS CLÍNICAS
// ---------------------------------------------------------------------------
async function abrirModalConsultaHC() {
  const modal = document.getElementById("modal_consulta_hc");
  if (!modal) return;
  modal.classList.add("open");
  modal.classList.add("show");
  modal.style.setProperty("display", "flex", "important");


  const inputModal = document.getElementById("modal_search_hc_input");
  if (inputModal) {
    inputModal.value = "";
    setTimeout(() => inputModal.focus(), 80);
  }


  cargarTablaCatalogoHC("");
}


function cerrarModalConsultaHC() {
  const modal = document.getElementById("modal_consulta_hc");
  if (modal) {
    modal.classList.remove("open");
    modal.classList.remove("show");
    modal.style.setProperty("display", "none", "important");
  }
}


async function cargarTablaCatalogoHC(filtro = "") {
  const tbody = document.getElementById("modal_hc_table_body");
  const countEl = document.getElementById("modal_hc_total_count");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:18px;color:#64748b;">⏳ Cargando registros desde Supabase Cloud y catálogo local...</td></tr>`;
  let registros = [];
  // 1. Obtener de Supabase
  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
    try {
      let url = `${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?select=*&order=id.desc&limit=50`;
      if (filtro && filtro.trim().length >= 2) {
        const enc = encodeURIComponent(filtro.trim());
        url = `${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.ilike.*${enc}*,nombre_completo.ilike.*${enc}*,historia_clinica.ilike.*${enc}*)&select=*&order=id.desc&limit=50`;
      }
      const res = await fetch(url, {
        headers: {
          "apikey": SUPABASE_CONFIG.key,
          "Authorization": `Bearer ${SUPABASE_CONFIG.key}`
        }
      });
      if (res.ok) {
        registros = await res.json();
      }
    } catch (e) {}
  }
  // 2. Si no hay Supabase, pedir al servidor Python SQLite
  if (registros.length === 0) {
    try {
      const resLocal = await fetch(filtro ? `/api/hc/coincidencias?q=${encodeURIComponent(filtro)}` : `/api/hc/listar`);
      if (resLocal.ok) {
        const d = await resLocal.json();
        if (d.exito && (d.registros || d.resultados)) {
          registros = d.registros || d.resultados;
        }
      }
    } catch (e) {}
  }
  // 3. Fallback con base de datos local y master seed
  if (registros.length === 0) {
    const master = cargarPacientesMaster();
    const fLow = filtro.toLowerCase();
    registros = Object.values(master)
      .filter(p => !filtro || p.identificador.toLowerCase().includes(fLow) || p.nombre_completo.toLowerCase().includes(fLow) || p.historia_clinica.toLowerCase().includes(fLow))
      .map((p, idx) => ({
        id: idx + 1,
        identificador: p.identificador,
        nombre_completo: p.nombre_completo,
        historia_clinica: p.historia_clinica,
        tipo_seguro: p.tipo_seguro,
        alergias: p.alergias,
        ticket: `T-0${idx + 1}`
      }));
  }
  // Enriquecer cada registro con datos del master (alergias y conteo de episodios)
  registros.forEach(r => {
    const masterP = obtenerPacienteMaster(r.identificador, r.historia_clinica, r.nombre_completo);
    if (masterP) {
      if (!r.alergias && masterP.alergias) r.alergias = masterP.alergias;
      r.total_episodios = Array.isArray(masterP.episodios) ? masterP.episodios.length : 0;
    } else {
      const eps = obtenerEpisodiosDePaciente(r.identificador, r.historia_clinica);
      r.total_episodios = eps.length;
    }
  });
  catalogoHcCache = registros;
  if (countEl) countEl.textContent = `${registros.length} registros`;
  if (registros.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8;">No se encontraron coincidencias para "${filtro}".</td></tr>`;
    return;
  }
  let htmlRows = "";
  registros.forEach((r, idx) => {
    const ident = r.identificador || "—";
    const nom = r.nombre_completo || ident;
    const hc = r.historia_clinica || "—";
    const seg = r.tipo_seguro || "Sin seguro";
    const tck = r.ticket || "—";
    const alergias = r.alergias || "Niega alergias";
    const esAlergico = alergias && !alergias.toLowerCase().includes("niega") && !alergias.toLowerCase().includes("ninguna");
    const totalEps = r.total_episodios || 0;
    const pJson = encodeURIComponent(JSON.stringify(r));
    htmlRows += `
      <tr>
        <td style="font-weight:700;color:#64748b;">${idx + 1}</td>
        <td>
          <strong style="color:#0f172a;">${nom}</strong>
          ${esAlergico ? `<span style="display:inline-block;margin-left:6px;font-size:0.7rem;font-weight:800;background:#fee2e2;color:#b91c1c;padding:1px 6px;border-radius:4px;border:1px solid #ef4444;" title="${alergias}">⚠️ Alérgico</span>` : ""}
          <div style="font-size:0.73rem;color:#64748b;margin-top:2px;">
            <span>📋 ${totalEps} atención${totalEps === 1 ? "" : "es"} registrada${totalEps === 1 ? "" : "s"}</span>
          </div>
        </td>
        <td><code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;color:#0284c7;">${ident}</code></td>
        <td><span class="hc-pill-tag">${hc}</span></td>
        <td><span class="hc-pill-seguro">${seg}</span></td>
        <td><strong>${tck}</strong></td>
        <td style="white-space:nowrap; text-align:center;">
          <div style="display:flex; gap:6px; justify-content:center;">
            <button type="button" class="btn-full-primary" style="padding:5px 10px;font-size:0.75rem;background:#16a34a;border:none;border-radius:6px;cursor:pointer;"
              title="Cargar paciente para nueva atención" onclick="seleccionarPacienteDeBusqueda('${pJson}')">
              ✓ Cargar
            </button>
            <button type="button" class="btn-full-secondary" style="padding:5px 10px;font-size:0.75rem;background:#f8fafc;border:1.5px solid #0284c7;color:#0284c7;border-radius:6px;cursor:pointer;"
              title="Visualizar expediente e historial clínico completo" onclick="visualizarHistoriaClinica('${pJson}')">
              👁️ Ver
            </button>
            <button type="button" class="btn-full-secondary" style="padding:5px 10px;font-size:0.75rem;background:#ffffff;border:1.5px solid #475569;color:#334155;border-radius:6px;cursor:pointer;"
              title="Imprimir ficha oficial de historia clínica con historial" onclick="imprimirFichaHistoriaClinica('${pJson}')">
              🖨️ Imprimir
            </button>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = htmlRows;
}
// ---------------------------------------------------------------------------
// PROTOCOLO DE INGRESO DE PACIENTES NN (IDENTIDAD NO CONFIRMADA)
// ---------------------------------------------------------------------------
function ingresarPacienteNN() {
  const nroHcTemp = `HC-TEMP-EMG-${String(contadorHcTemp).padStart(3, "0")}`;
  contadorHcTemp++;
  const ahora = new Date();
  const horaActual = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  const turnoTemp = `T-NN-${String(contadorHcTemp - 1).padStart(2, "0")}`;


  STATE.esNN = true;
  STATE.identificador = "PACIENTE NO IDENTIFICADO (NN)";
  STATE.historiaClinica = nroHcTemp;
  STATE.nombreReniec = `PACIENTE NO IDENTIFICADO (NN)`;
  STATE.estadoRegistrado = "Por confirmar (NN)";
  STATE.accionHc = `Identidad no confirmada → Se abre ${nroHcTemp} (Notificación emitida a PNP y Servicio Social - Ley N° 27604)`;
  STATE.alertaPnpSs = true;
  STATE.turno = turnoTemp;
  STATE.horaLlegada = horaActual;
  STATE.fechaNacimiento = "";
  STATE.edad = null;
  STATE.alergias = "Desconocidas (Paciente NN)";
  STATE.tipoSeguro = "Seguro por confirmar";


  // 1. Llenar / Limpiar celdas en Módulo 1 (fecha de nacimiento, edad y alergias en blanco)
  const inputIdent = document.getElementById("ident_full");
  if (inputIdent) inputIdent.value = "PACIENTE NO IDENTIFICADO (NN)";


  const inputHora = document.getElementById("hora_full");
  if (inputHora) inputHora.value = horaActual;


  const elFechaNac = document.getElementById("fecha_nac_full");
  if (elFechaNac) elFechaNac.value = "";


  const elEdad = document.getElementById("edad_full");
  if (elEdad) elEdad.value = "";


  const elAlergias = document.getElementById("alergias_full");
  if (elAlergias) elAlergias.value = "";


  const elSexo = document.getElementById("sexo_full");
  if (elSexo) elSexo.value = "Desconocido";

  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = "Desconocido";
  STATE.grupoSanguineo = "Desconocido";


  // Indicadores de Módulo 1
  const badgeEl = document.getElementById("hc_badge_estado");
  if (badgeEl) {
    badgeEl.textContent = "Por confirmar (NN)";
    badgeEl.className = "badge-estado badge-conf";
  }
  const codeEl = document.getElementById("hc_code_display");
  if (codeEl) codeEl.textContent = nroHcTemp;
  const accEl = document.getElementById("hc_accion_display");
  if (accEl) accEl.textContent = STATE.accionHc;


  const ticketDisplay = document.getElementById("ticket_display");
  if (ticketDisplay) ticketDisplay.textContent = `🎫 Ticket asignado: ${turnoTemp} (hora: ${horaActual})`;


  const alertaNn = document.getElementById("alerta_nn");
  if (alertaNn) alertaNn.classList.add("visible");


  // 2. Módulo 2 (Paso 2): Marcar automáticamente como "Seguro por confirmar"
  const seguroConsolidado = document.getElementById("seguro_consolidado");
  if (seguroConsolidado) {
    seguroConsolidado.textContent = "Seguro por confirmar (Paciente NN — Ley N° 27604)";
  }
  const resSusalud = document.getElementById("resultado_susalud");
  if (resSusalud) {
    resSusalud.innerHTML = `
      <div style="background:#fff7ed;border:1.5px solid #fb923c;border-radius:8px;padding:12px;margin-top:8px;">
        <strong style="color:#c2410c;">⚠️ Seguro por confirmar</strong>
        <span class="seguro-badge seguro-badge-soat">Ley N° 27604</span>
        <div style="font-size:0.75rem;color:#9a3412;margin-top:4px;">
          Paciente no identificado en admisión. Atención médica y de soporte vital garantizada sin condicionamiento de seguro previo ni pago. Regularización posterior a la estabilización clínica.
        </div>
      </div>
    `;
  }


  // Telemetría de cabecera
  const telHc = document.getElementById("telemetry_hc_val");
  if (telHc) telHc.textContent = nroHcTemp;
  const telId = document.getElementById("telemetry_ident_val");
  if (telId) telId.textContent = "PACIENTE NN";
  const telSeg = document.getElementById("telemetry_seguro_val");
  if (telSeg) telSeg.textContent = "Por confirmar";


  // Registrar en base de datos local y sincronizar con Supabase
  BASE_DATOS_HC["paciente no identificado (nn)"] = nroHcTemp;
  try {
    persistirBaseDatosLocal("PACIENTE NO IDENTIFICADO (NN)", nroHcTemp, `NN DESCONOCIDO (${nroHcTemp})`);
    sincronizarConSupabase("NN", nroHcTemp, "PACIENTE NO IDENTIFICADO (NN)", "Seguro por confirmar", turnoTemp, "Por evaluar");
  } catch (e) {}


  actualizarFactura();


  // Enfocar en Módulo 1 y permitir continuar el flujo paso a paso
  irAModulo(1);


  alert(`🚨 ADMISIÓN DE PACIENTE NN REGISTRADA CON ÉXITO\n\n` +
        `• Historia Clínica Temporal: ${nroHcTemp}\n` +
        `• Ticket de Atención: ${turnoTemp}\n` +
        `• Fecha de Nacimiento, Edad y Alergias: En blanco (condición NN permitida).\n` +
        `• Paso 2 (Seguro): Marcado automáticamente como "Seguro por confirmar".\n` +
        `• Protocolo de emergencia vital activado bajo amparo de la Ley N° 27604.`);
}


function cerrarModalVisualizarHC() {
  const modal = document.getElementById("modal_visualizar_hc");
  if (modal) {
    modal.classList.remove("open");
    modal.classList.remove("show");
    modal.style.setProperty("display", "none", "important");
  }
}


function visualizarHistoriaClinica(pacienteEncoded) {
  let p;
  try {
    p = typeof pacienteEncoded === "string" ? JSON.parse(decodeURIComponent(pacienteEncoded)) : pacienteEncoded;
  } catch (e) {
    p = pacienteEncoded;
  }
  if (!p) return;
  const modal = document.getElementById("modal_visualizar_hc");
  const body = document.getElementById("modal_visualizar_hc_body");
  if (!modal || !body) return;
  const ident = p.identificador || "—";
  const nom = p.nombre_completo || ident;
  const hc = p.historia_clinica || "—";
  // Recuperar registro maestro permanente que conserva ALERGIAS y todos los episodios
  const master = obtenerOInicializarPacienteMaster(ident, hc, nom, p.tipo_seguro);
  const seguro = master.tipo_seguro || p.tipo_seguro || "EsSalud / SIS / Particular";
  const alergias = master.alergias || p.alergias || "Niega alergias medicamentosas conocidas";
  const episodios = obtenerEpisodiosDePaciente(ident, hc);
  const esAlergico = alergias && !alergias.toLowerCase().includes("niega") && !alergias.toLowerCase().includes("ninguna");
  let htmlEpisodios = "";
  if (episodios.length === 0) {
    htmlEpisodios = `
      <div style="background:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:10px;padding:24px;text-align:center;color:#64748b;">
        <div style="font-size:2rem;margin-bottom:6px;">📂</div>
        <strong style="color:#1e293b;font-size:0.95rem;">Expediente Clínico Aperturado — Sin Atenciones Previas Archivadas</strong>
        <p style="font-size:0.8rem;margin:6px 0 0;color:#64748b;">
          El paciente cuenta con Historia Clínica <strong>${hc}</strong> pero aún no registra episodios cerrados en el sistema.<br>
          Haga clic en <strong>"Cargar Paciente para Nueva Atención"</strong> para iniciar la primera evaluación de triaje.
        </p>
      </div>
    `;
  } else {
    episodios.forEach((ep, idx) => {
      const sv = ep.signos_vitales || {};
      const pa = sv.pa || (sv.pas && sv.pad ? `${sv.pas}/${sv.pad}` : "—");
      const prioColor = ep.color_prioridad || "#0284c7";
      const totalPagar = ep.liquidacion?.totalPaciente !== undefined ? `S/. ${ep.liquidacion.totalPaciente.toFixed(2)}` : (ep.total_facturado !== undefined ? `S/. ${Number(ep.total_facturado).toFixed(2)}` : "S/. 0.00");
      const cobBadge = ep.cobertura_info || (totalPagar === "S/. 0.00" ? "Pago Cero (Cubierto al 100%)" : "Con copago/deducible");
      const exms = Array.isArray(ep.examenes_realizados) && ep.examenes_realizados.length > 0
        ? ep.examenes_realizados.map(e => e.descripcion || e).join(", ")
        : "Ninguno ordenado";
      const meds = Array.isArray(ep.medicamentos_despachados) && ep.medicamentos_despachados.length > 0
        ? ep.medicamentos_despachados.map(m => m.descripcion || m).join(", ")
        : "Ninguno prescrito";
      htmlEpisodios += `
        <div style="background:#ffffff;border:1.5px solid #e2e8f0;border-left:5px solid ${prioColor};border-radius:10px;padding:14px 16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:0.75rem;font-weight:900;background:#0f172a;color:#ffffff;padding:3px 8px;border-radius:4px;">
                ATENCIÓN N° ${episodios.length - idx}
              </span>
              <span style="font-size:0.85rem;font-weight:800;color:#0f172a;">📅 ${ep.fecha || "—"} · ⏱️ ${ep.hora || "—"}</span>
              <code style="font-size:0.75rem;background:#f1f5f9;color:#64748b;padding:2px 6px;border-radius:4px;">${ep.folio || "FOLIO"}</code>
            </div>
            <div>
              <span style="background:${prioColor};color:#ffffff;font-size:0.76rem;font-weight:900;padding:4px 10px;border-radius:12px;letter-spacing:0.4px;">
                🚦 ${ep.prioridad || "PRIORIDAD DE TRIAJE"}
              </span>
            </div>
          </div>
          <div style="font-size:0.85rem;margin-bottom:8px;color:#0f172a;">
            <strong>Motivo de Consulta / Anamnesis:</strong> <span style="color:#334155;">${ep.motivo_consulta || "Atención de emergencia / triaje"}</span>
          </div>
          <!-- Signos Vitales del Episodio -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:6px;background:#f8fafc;padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;font-size:0.78rem;margin-bottom:8px;">
            <div><span style="color:#64748b;font-weight:700;">SpO2:</span> <strong>${sv.spo2 || "—"}%</strong></div>
            <div><span style="color:#64748b;font-weight:700;">FC:</span> <strong>${sv.fc || "—"} lpm</strong></div>
            <div><span style="color:#64748b;font-weight:700;">PA:</span> <strong>${pa}</strong></div>
            <div><span style="color:#64748b;font-weight:700;">FR:</span> <strong>${sv.fr || "—"} rpm</strong></div>
            <div><span style="color:#64748b;font-weight:700;">T°:</span> <strong>${sv.temp || "—"}°C</strong></div>
            <div><span style="color:#64748b;font-weight:700;">Dolor EVA:</span> <strong>${sv.dolor || "0"}/10</strong></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;font-size:0.8rem;color:#475569;">
            <div>🏥 <strong>Cama / Destino:</strong> ${ep.cama_asignada || ep.destino_clinico || "Observación"}</div>
            <div>🔬 <strong>Apoyo Diagnóstico:</strong> ${exms}</div>
            <div>💊 <strong>Farmacia:</strong> ${meds}</div>
            <div>💰 <strong>Facturación:</strong> <span style="font-weight:800;color:${totalPagar === "S/. 0.00" ? "#16a34a" : "#0284c7"};">${totalPagar}</span> (${cobBadge})</div>
            <div style="grid-column: 1 / -1;border-top:1px dashed #e2e8f0;padding-top:4px;margin-top:2px;font-size:0.75rem;color:#64748b;display:flex;justify-content:space-between;">
              <span><strong>Estado al Egreso:</strong> ${ep.estado_salida || "En observación"}</span>
              <span><strong>Responsable:</strong> ${ep.firmante || "Lic. Enfermería de Turno"}</span>
            </div>
          </div>
        </div>
      `;
    });
  }
  body.innerHTML = `
    <!-- ENCABEZADO DE EXPEDIENTE -->
    <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:16px 20px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;border-bottom:2px solid #0284c7;padding-bottom:10px;margin-bottom:12px;">
        <div>
          <span style="font-size:0.72rem;font-weight:800;color:#0284c7;text-transform:uppercase;letter-spacing:1px;">
            EXPEDIENTE CLÍNICO DE ADMISIÓN Y TRIAJE — FCS UPP
          </span>
          <h2 style="margin:2px 0 0;font-size:1.35rem;font-weight:900;color:#0f172a;">${nom}</h2>
        </div>
        <div style="text-align:right;">
          <span class="hc-pill-tag" style="font-size:1.05rem;padding:6px 14px;background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc;">${hc}</span>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px;">N° Historia Clínica Oficial</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:0.83rem;">
        <div><strong>DNI / Identificador:</strong> <code style="background:#ffffff;padding:2px 6px;border-radius:4px;border:1px solid #e2e8f0;">${ident}</code></div>
        <div><strong>Seguro Registrado:</strong> <span class="hc-pill-seguro">${seguro}</span></div>
        <div><strong>Edad / Sexo:</strong> ${master.edad ? `${master.edad} años` : "—"} (${master.sexo === "F" ? "Femenino" : "Masculino"})</div>
        <div><strong>Total Atenciones:</strong> <strong style="color:#0284c7;">${episodios.length} episodio(s) registrados</strong></div>
        <div><strong>Estado en BD:</strong> <span class="badge-estado badge-si">Autenticado / Activo</span></div>
      </div>
    </div>
    <!-- ⚠️ SECCIÓN CRÍTICA DE ALERGIAS (DATO PERMANENTE EN HC) -->
    <div style="background:${esAlergico ? "#fee2e2" : "#f0fdf4"};border:2px solid ${esAlergico ? "#ef4444" : "#86efac"};border-radius:12px;padding:14px 18px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:1.3rem;">${esAlergico ? "⚠️" : "🛡️"}</span>
        <h4 style="margin:0;font-size:0.92rem;font-weight:900;color:${esAlergico ? "#991b1b" : "#166534"};text-transform:uppercase;letter-spacing:0.5px;">
          ${esAlergico ? "ALERGIAS MEDICAMENTOSAS REGISTRADAS — ALERTA MÉDICA PERMANENTE" : "CONDICIÓN DE ALERGIAS MEDICAMENTOSAS"}
        </h4>
      </div>
      <div style="font-size:1.05rem;font-weight:900;color:${esAlergico ? "#7f1d1d" : "#14532d"};margin-top:6px;padding-left:28px;">
        ${alergias}
      </div>
      <div style="font-size:0.75rem;color:${esAlergico ? "#991b1b" : "#166534"};margin-top:4px;padding-left:28px;">
        ${esAlergico
          ? "* Este dato clínico pertenece permanentemente a la Historia Clínica del paciente y nunca se borra al abrir nuevas atenciones."
          : "✓ El paciente niega alergias conocidas. Se puede prescribir según criterio clínico."}
      </div>
    </div>
    <!-- HISTORIAL CRONOLÓGICO ACUMULATIVO DE ATENCIONES -->
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h4 style="margin:0;font-size:0.95rem;font-weight:800;color:#0f172a;display:flex;align-items:gap:6px;">
          <span>📋</span> Histórico Cronológico de Atenciones de Emergencia (${episodios.length} episodio${episodios.length === 1 ? "" : "s"})
        </h4>
        <span style="font-size:0.75rem;color:#64748b;font-style:italic;">Cronología clínica acumulativa</span>
      </div>
      <div style="max-height:360px;overflow-y:auto;padding-right:4px;">
        ${htmlEpisodios}
      </div>
    </div>
  `;
  // Asignar eventos de botones del modal
  const btnCargar = document.getElementById("btn_modal_cargar_paciente");
  if (btnCargar) {
    btnCargar.onclick = () => {
      cerrarModalVisualizarHC();
      seleccionarPacienteDeBusqueda(pacienteEncoded);
    };
  }
  const btnImprimir = document.getElementById("btn_modal_imprimir_hc");
  if (btnImprimir) {
    btnImprimir.onclick = () => {
      imprimirFichaHistoriaClinica(pacienteEncoded);
    };
  }
  modal.classList.add("open");
  modal.classList.add("show");
  modal.style.setProperty("display", "flex", "important");
}
function imprimirFichaHistoriaClinica(pacienteEncoded) {
  let p;
  try {
    p = typeof pacienteEncoded === "string" ? JSON.parse(decodeURIComponent(pacienteEncoded)) : pacienteEncoded;
  } catch (e) {
    p = pacienteEncoded;
  }
  if (!p) return;
  const ident = p.identificador || "—";
  const nom = p.nombre_completo || ident;
  const hc = p.historia_clinica || "—";
  const master = obtenerOInicializarPacienteMaster(ident, hc, nom, p.tipo_seguro);
  const seguro = master.tipo_seguro || p.tipo_seguro || "EsSalud / SIS / Particular";
  const alergias = master.alergias || p.alergias || "Niega alergias medicamentosas conocidas";
  const episodios = obtenerEpisodiosDePaciente(ident, hc);
  const esAlergico = alergias && !alergias.toLowerCase().includes("niega") && !alergias.toLowerCase().includes("ninguna");
  let filasHtml = "";
  if (episodios.length === 0) {
    filasHtml = `<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748b;">Expediente sin atenciones de emergencia previas registradas.</td></tr>`;
  } else {
    episodios.forEach((ep, i) => {
      const sv = ep.signos_vitales || {};
      const pa = sv.pa || (sv.pas && sv.pad ? `${sv.pas}/${sv.pad}` : "—");
      const vitalsStr = `SpO2 ${sv.spo2 || "—"}% | FC ${sv.fc || "—"} | PA ${pa} | T° ${sv.temp || "—"}°C`;
      const pagoStr = ep.liquidacion?.totalPaciente !== undefined ? `S/. ${ep.liquidacion.totalPaciente.toFixed(2)}` : "S/. 0.00";
      filasHtml += `
        <tr>
          <td style="font-weight:700;">#${episodios.length - i}<br><code style="font-size:10px;">${ep.folio || ""}</code></td>
          <td>${ep.fecha || "—"}<br><span style="font-size:10px;color:#64748b;">${ep.hora || ""}</span></td>
          <td style="font-weight:800;color:#0284c7;">${ep.prioridad || "—"}</td>
          <td>${ep.motivo_consulta || "Triaje de Emergencia"}</td>
          <td style="font-size:11px;">${vitalsStr}</td>
          <td>${ep.cama_asignada || "Observación"}</td>
          <td style="font-weight:800;">${pagoStr}<br><span style="font-size:10px;color:#16a34a;">${ep.tipo_seguro || seguro}</span></td>
        </tr>
      `;
    });
  }
  const printHtml = `
    <html><head><title>Expediente de Historia Clínica — ${hc}</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; padding: 30px; max-width: 900px; margin: auto; color: #0f172a; line-height: 1.45; font-size: 12px; }
      .header-hc { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; }
      .inst-info h2 { margin: 0; font-size: 1.2rem; color: #0f172a; font-weight: 900; }
      .inst-info p { margin: 2px 0 0; font-size: 0.78rem; color: #64748b; font-weight: 600; }
      .hc-badge { border: 2px solid #0284c7; background: #e0f2fe; color: #0369a1; padding: 6px 14px; border-radius: 8px; font-size: 1.1rem; font-weight: 900; text-align: center; font-family: monospace; }
      .section-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 14px; }
      .section-title { font-size: 0.82rem; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
      .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
      .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; }
      .field label { font-size: 0.7rem; color: #64748b; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 2px; }
      .field span { font-size: 0.88rem; font-weight: 700; color: #0f172a; }
      .alergia-alert { background: ${esAlergico ? "#fee2e2" : "#f0fdf4"}; border: 2px solid ${esAlergico ? "#ef4444" : "#86efac"}; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
      th { background: #f8fafc; font-weight: 800; color: #334155; }
      .firma-box { margin-top: 40px; display: flex; justify-content: space-around; text-align: center; }
      .firma-line { border-top: 1px solid #0f172a; width: 220px; padding-top: 6px; font-size: 0.75rem; font-weight: 700; }
    </style></head>
    <body>
      <div class="header-hc">
        <div class="inst-info">
          <h2>UNIVERSIDAD POLITÉCNICA DEL PERÚ — FCS</h2>
          <p>Departamento de Emergencia y Cuidados Críticos · Hospital Docente UPP</p>
          <p style="color:#0284c7;font-weight:700;">EXPEDIENTE DE HISTORIA CLÍNICA INTEGRAL (CON HISTORIAL EPISÓDICO)</p>
        </div>
        <div>
          <div class="hc-badge">${hc}</div>
          <div style="font-size:0.72rem;text-align:center;color:#64748b;margin-top:3px;">FOLIO HIS OFICIAL</div>
        </div>
      </div>
      <div class="section-box">
        <div class="section-title">I. Filiación y Datos de Identificación</div>
        <div class="grid-4">
          <div class="field"><label>Apellidos y Nombres</label><span>${nom}</span></div>
          <div class="field"><label>Documento de Identidad</label><span>DNI ${ident}</span></div>
          <div class="field"><label>Edad / Sexo</label><span>${master.edad ? `${master.edad} años` : "—"} (${master.sexo || "M"})</span></div>
          <div class="field"><label>Régimen de Aseguramiento</label><span>${seguro}</span></div>
        </div>
      </div>
      <div class="alergia-alert">
        <div style="font-size:0.8rem;font-weight:900;color:${esAlergico ? "#991b1b" : "#166534"};text-transform:uppercase;">
          ${esAlergico ? "⚠️ ALERGIAS MEDICAMENTOSAS REGISTRADAS (ALERTA MÉDICA PERMANENTE)" : "✓ ALERGIAS MEDICAMENTOSAS REGISTRADAS"}
        </div>
        <div style="font-size:1rem;font-weight:900;color:${esAlergico ? "#7f1d1d" : "#14532d"};margin-top:3px;">
          ${alergias}
        </div>
      </div>
      <div class="section-box">
        <div class="section-title">II. Registro Histórico y Cronológico de Atenciones de Emergencia (${episodios.length} episodio${episodios.length === 1 ? "" : "s"})</div>
        <table>
          <thead>
            <tr>
              <th style="width:75px;">Episodio</th>
              <th style="width:85px;">Fecha / Hora</th>
              <th style="width:90px;">Prioridad</th>
              <th>Motivo de Consulta</th>
              <th>Signos Vitales</th>
              <th>Cama / Destino</th>
              <th style="width:95px;">Liquidación</th>
            </tr>
          </thead>
          <tbody>
            ${filasHtml}
          </tbody>
        </table>
      </div>
      <div class="section-box">
        <div class="section-title">III. Marco Legal y Derechos Asistenciales</div>
        <p style="font-size:0.74rem;color:#475569;margin:0;">
          Atención brindada en estricto cumplimiento de la <strong>Ley N° 27604</strong> (Atención de Emergencia sin condicionamiento previo) y Ley N° 26842 (Ley General de Salud). La confidencialidad y preservación del histórico clínico se rige bajo la Ley N° 29733 de Protección de Datos Personales.
        </p>
      </div>
      <div class="firma-box">
        <div>
          <div class="firma-line">Lic. Enfermería de Turno / Triaje<br>Colegio de Enfermeros del Perú</div>
        </div>
        <div>
          <div class="firma-line">Médico Emergentólogo / Asistencial<br>Colegio Médico del Perú</div>
        </div>
      </div>
    </body></html>
  `;
  const w = window.open("", "_blank");
  w.document.write(printHtml);
  w.document.close();
  w.print();
}
function clasificarYBuscarEnBD(identificador) {
  const limpio = String(identificador || "").trim().replace(/\s+/g, " ");
  const clave = limpio.toLowerCase();
  const esCasoDemo = (clave === "px a" || clave === "px b");
  const esDni = /^\d{8}$/.test(limpio);
  const palabras = limpio.split(" ");
  const soloLetras = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/.test(limpio);
  const esNn = palabras[0].toLowerCase() === "nn";
  const esNombreCompleto = (palabras.length >= 2 && soloLetras && !esNn);


  let estado, nroHc, accion;


  if (esDni || esNombreCompleto || esCasoDemo) {
    if (clave in BASE_DATOS_HC) {
      nroHc = BASE_DATOS_HC[clave];
      estado = "Si";
      accion = `Encontrado en BD (${nroHc} recuperada)`;
    } else {
      nroHc = `HC-NUEVA-${String(contadorHcNueva).padStart(3, "0")}`;
      contadorHcNueva++;
      persistirBaseDatosLocal(clave, nroHc);
      estado = "No";
      accion = `No figura en BD → Se crea y registra ${nroHc}`;
    }
  } else {
    nroHc = `HC-TEMP-EMG-${String(contadorHcTemp).padStart(3, "0")}`;
    contadorHcTemp++;
    estado = "Por confirmar";
    accion = `Identidad parcial/NN → Se abre ${nroHc}`;
  }


  return { estado, nroHc, accion, esDni };
}


// ---------------------------------------------------------------------------
// 3. ESTADO GLOBAL DEL SIMULADOR
// ---------------------------------------------------------------------------
const STATE = {
  // Origen del Evento (Norma NTS N° 042-MINSA & Ley N° 27604)
  tipoOrigenEvento: "comun", // "comun" o "transito"
  esAccidenteTransito: false,
  esClinicaPrivada: false, // true cuando opera en modo Clínica Privada EPS
  entornoBloqueado: false, // true cuando el seguro ha sido acreditado oficialmente en Módulo 3
  panicoShockTrauma: false,

  // Módulo 1: Triaje Fisiológico
  spo2: null, fc: null, pasSistolica: null, paDiastolica: null,
  fr: null, temperatura: null, glucosa: null, glasgow: null, eva: 0,
  hemoglucotest: null,
  antecedentes: false,
  motivoConsulta: "",
  prioridad: null, // "I", "II", "III", "IV", "V"
  colorPrioridad: null,
  codigoInfarto: false,
  codigoIctus: false,
  codigoSepsis: false,
  esGestante: false,
  semanasGestacion: null,
  lcf: null,
  claveObstetrica: "ninguna",
  esPediatrico: false,
  aislamientoEpidemiologico: "ninguno",

  // Módulo 2: Admisión
  modalidadIngreso: "A pie",
  identificador: "",
  estadoRegistrado: "Por confirmar",
  historiaClinica: "—",
  accionHc: "",
  nombreReniec: null,
  alertaPnpSs: false,
  edad: null, sexo: null, grupoSanguineo: null, alergias: null,
  horaLlegada: null,
  turno: null,

  // Módulo 3: Acreditación PIDE-SUSALUD & SOAT
  tipoSeguro: "Particular",
  validacionManual: null,
  numerFua: null,
  acreditadoEsSalud: null,
  porcentajeCopago: null,
  soatOpcion: "placa", // "placa", "fuga"
  soatPlaca: "",
  soatAseguradora: "Pacífico Compañía de Seguros y Reaseguros",
  soatPoliza: "SOAT-2026-981245",
  soatEstado: "ACTIVO / VIGENTE (APESEG)",
  soatVehiculoFuga: false,
  soatTopeLegal: 27500, // 5 UIT
  soatConsumido: 0,
  soatDisponible: 27500,

  // Módulo 4: Médico, Tópicos, Kardex, Laboratorio e Imágenes (INICIA TOTALMENTE EN BLANCO)
  cie10Codigo: "",
  cie10Descripcion: "",
  medicoTratante: "Por asignar",
  kardexItems: [],
  kardexAdministrados: [],
  ordenesLaboratorio: [],
  ordenesImagenes: [],
  destinoPostTopico: "por_definir",

  // Módulo 5: Sala de Observación (INICIA TOTALMENTE EN BLANCO)
  horasObservacion: 0,
  balanceIngresosMl: 0,
  balanceEgresosMl: 0,
  balanceNetoMl: 0,
  decisionPostObs: "por_definir",

  // Módulo 6: Camas & Áreas Críticas (INICIA TOTALMENTE EN BLANCO)
  camaAsignada: null,
  camaAsignadaId: null,
  prioridadUci: 2,
  desempateScore: 0,
  boardingActivo: false,

  // Módulo 7: Egreso & Auditoría Legal
  modalidadEgreso: "alta_medica",
  bloqueoSinadef: false,
  rutaActual: 0,
  estadoSalida: "Alta Médica / Domicilio",
  firmante: "Dr. Roberto Mendoza Silva — CMP 48215",
  firmaTiempo: null,

  // Módulo 8: Facturación
  items_factura: [],

  // Timestamps por módulo
  ts: {},
};


// ---------------------------------------------------------------------------
// 4. DATOS DE CATÁLOGO
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 4. CATÁLOGOS MÉDICOS DE EMERGENCIA AMPLIADOS (MINSA / ESSALUD / CLÍNICAS PRIVADAS)
// ---------------------------------------------------------------------------
const LABORATORIO = [
  // Hematología y Coagulación
  { nombre: "Hemograma Completo + Plaquetas Automatizado", costo: 25, cat: "Laboratorio" },
  { nombre: "Perfil de Coagulación (TP, INR, TTPa, Fibrinógeno)", costo: 48, cat: "Laboratorio" },
  { nombre: "Dímero D Cuantitativo (Sospecha TEP / TVP / CID)", costo: 65, cat: "Laboratorio" },
  

  // Bioquímica y Función Renal / Hepática
  { nombre: "Glucemia Sérica Rápida / Hemoglucotest", costo: 15, cat: "Laboratorio" },
  { nombre: "Perfil Renal (Urea y Creatinina Sérica)", costo: 28, cat: "Laboratorio" },
  { nombre: "Perfil Hepático (TGO, TGP, Bilirrubinas, Fosfatasa)", costo: 38, cat: "Laboratorio" },
  { nombre: "Amilasa y Lipasa Sérica (Descarte Pancreatitis Aguda)", costo: 55, cat: "Laboratorio" },
  { nombre: "Electrolitos Séricos (Sodio, Potasio, Cloro, Calcio Iónico)", costo: 40, cat: "Laboratorio" },
  

  // Marcadores Críticos y Emergencia Cardiovascular
  { nombre: "Troponina I Ultrasensible (Infarto Agudo de Miocardio)", costo: 85, cat: "Laboratorio" },
  { nombre: "Troponina T Cuantitativa / CK-MB Masa", costo: 90, cat: "Laboratorio" },
  { nombre: "Gases Arteriales (AGA) + Lactato Sérico", costo: 60, cat: "Laboratorio" },
  { nombre: "Procalcitonina Cuantitativa (Marcador de Sepsis / Shock)", costo: 110, cat: "Laboratorio" },
  { nombre: "Proteína C Reactiva (PCR) Ultrasensible", costo: 40, cat: "Laboratorio" },


  // Orina, Microbiología y Toxicología
  { nombre: "Examen Completo de Orina (EGO) con Sedimento", costo: 15, cat: "Laboratorio" },
  { nombre: "Urocultivo con Antibiograma Automatizado", costo: 45, cat: "Laboratorio" },
  { nombre: "Hemocultivo Automatizado x 2 Frascos (Aerobio/Anaerobio)", costo: 75, cat: "Laboratorio" },
  { nombre: "Panel Toxicológico Rápido en Orina (Drogas de Abuso)", costo: 80, cat: "Laboratorio" },
  { nombre: "Alcoholemia Cuantitativa en Sangre", costo: 60, cat: "Laboratorio" },
  { nombre: "Beta-HCG Cuantitativa en Sangre (Emergencia Ginecológica)", costo: 35, cat: "Laboratorio" },
  { nombre: "Prueba Rápida Dengue NS1 / IgM / IgG", costo: 45, cat: "Laboratorio" }
];


const IMAGENES = [
  // Radiología Digital de Emergencia
  { nombre: "Rx Tórax AP y Lateral (Bipedestación / Portátil)", costo: 55, cat: "Imágenes" },
  { nombre: "Rx Abdomen Simple (Decúbito y Bipedestación)", costo: 50, cat: "Imágenes" },
  { nombre: "Rx Columna Cervical 3 Incidencias (Trauma)", costo: 65, cat: "Imágenes" },
  { nombre: "Rx Pelvis y Cadera AP (Politraumatismo)", costo: 60, cat: "Imágenes" },
  { nombre: "Rx Extremidades (Huesos Largos / Articulación)", costo: 50, cat: "Imágenes" },
  

  // Ultrasonografía y Ecocardiografía
  { nombre: "Ecografía FAST (Trauma / Detección Líquido Libre)", costo: 110, cat: "Imágenes" },
  { nombre: "Ecografía Abdominal Completa y Vías Biliares", costo: 120, cat: "Imágenes" },
  { nombre: "Ecografía Renal y Vías Urinarias", costo: 100, cat: "Imágenes" },
  { nombre: "Ecografía Gineco-Obstétrica Transvaginal de Urgencia", costo: 125, cat: "Imágenes" },
  { nombre: "Ecografía Doppler Vascular (Descarte TVP Miembros Inf.)", costo: 160, cat: "Imágenes" },
  { nombre: "Ecocardiograma Transtorácico de Emergencia", costo: 190, cat: "Imágenes" },


  // Tomografía y Resonancia de Urgencia
  { nombre: "TAC Cerebral Sin Contraste (Descarte ACV / TEC Agudo)", costo: 350, cat: "Imágenes" },
  { nombre: "TAC Cerebral Con Contraste", costo: 420, cat: "Imágenes" },
  { nombre: "AngioTAC de Tórax (Sospecha Tromboembolismo TEP)", costo: 580, cat: "Imágenes" },
  { nombre: "TAC Abdomen y Pelvis con Contraste EV", costo: 490, cat: "Imágenes" },
  { nombre: "TAC Multicorte Columna Total (Politraumatizado)", costo: 450, cat: "Imágenes" },
  { nombre: "Electrocardiograma (ECG) 12 Derivaciones con Informe", costo: 35, cat: "Imágenes" },
  { nombre: "Resonancia Magnética (RMN) Cerebral de Urgencia", costo: 680, cat: "Imágenes" }
];


const SANGRE = [
  { nombre: "Grupo Sanguíneo y Factor Rh", costo: 20, cat: "Banco de Sangre" },
  { nombre: "Prueba Cruzada Mayor y Menor (Compatibilidad)", costo: 40, cat: "Banco de Sangre" },
  { nombre: "Paquete Globular (Glóbulos Rojos Concentrados) - 1 Unidad", costo: 220, cat: "Banco de Sangre" },
  { nombre: "Paquete Globular O Rh Negativo (Emergencia Vital Inmediata)", costo: 260, cat: "Banco de Sangre" },
  { nombre: "Plasma Fresco Congelado (PFC) - 1 Unidad", costo: 150, cat: "Banco de Sangre" },
  { nombre: "Concentrado de Plaquetas (Pool de 4 Unidades)", costo: 280, cat: "Banco de Sangre" },
  { nombre: "Plaquetas por Aféresis (1 Unidad Terapéutica Completa)", costo: 550, cat: "Banco de Sangre" },
  { nombre: "Crioprecipitado (Rico en Fibrinógeno y Factor VIII)", costo: 140, cat: "Banco de Sangre" },
  { nombre: "Albúmina Humana al 20% Frasco 50ml EV", costo: 180, cat: "Banco de Sangre" },
  { nombre: "Rastreo de Anticuerpos Irregulares (Coombs Indirecto)", costo: 60, cat: "Banco de Sangre" }
];


const FARMACIA = [
  // Soluciones Parenterales y Reanimación Hídrica
  { nombre: "Cloruro de Sodio 0.9% (Suero Fisiológico) 1000ml EV", costo: 12, cat: "Farmacia" },
  { nombre: "Lactato de Ringer (Hartmann) 1000ml EV (Shock / Quemados)", costo: 15, cat: "Farmacia" },
  { nombre: "Dextrosa al 5% 1000ml / Dextrosa 33% Ampollas EV", costo: 14, cat: "Farmacia" },
  { nombre: "Manitol al 20% Frasco 500ml EV (Edema Cerebral)", costo: 35, cat: "Farmacia" },
  { nombre: "Bicarbonato de Sodio 8.4% Ampolla 20ml EV", costo: 18, cat: "Farmacia" },


  // Fármacos Cardiovasculares, Reanimación y Soporte Vital
  { nombre: "Adrenalina (Epinefrina) 1mg/1ml Ampolla EV/SC", costo: 25, cat: "Farmacia" },
  { nombre: "Atropina Sulfato 0.5mg/1ml Ampolla EV", costo: 18, cat: "Farmacia" },
  { nombre: "Noradrenalina 4mg/4ml Ampolla EV (Vasopresor de Shock)", costo: 65, cat: "Farmacia" },
  { nombre: "Amiodarona 150mg/3ml Ampolla EV (Antiarrítmico)", costo: 32, cat: "Farmacia" },
  { nombre: "Nitroglicerina 50mg/10ml Ampolla EV Infusión", costo: 55, cat: "Farmacia" },
  { nombre: "Furosemida 20mg/2ml Ampolla EV (Diurético de Asa)", costo: 12, cat: "Farmacia" },
  { nombre: "Captopril 25mg Tableta Sublingual", costo: 5, cat: "Farmacia" },


  // Analgésicos, Antiinflamatorios y Antipiréticos
  { nombre: "Paracetamol (Acetaminofén) 1g Frasco Solución EV", costo: 18, cat: "Farmacia" },
  { nombre: "Metamizol Sódico (Dipirona) 2g/5ml Ampolla EV", costo: 10, cat: "Farmacia" },
  { nombre: "Ketorolaco Trometamol 30mg/1ml Ampolla EV/IM", costo: 12, cat: "Farmacia" },
  { nombre: "Ketoprofeno 100mg Ampolla EV", costo: 14, cat: "Farmacia" },
  { nombre: "Tramadol Clorhidrato 100mg/2ml Ampolla EV", costo: 16, cat: "Farmacia" },
  { nombre: "Fentanilo 0.1mg/2ml Ampolla EV (Analgésico Mayor)", costo: 28, cat: "Farmacia" },
  { nombre: "Morfina Clorhidrato 10mg/1ml Ampolla EV/SC", costo: 30, cat: "Farmacia" },


  // Gastrointestinales y Antieméticos
  { nombre: "Omeprazol 40mg Frasco Ampolla EV", costo: 18, cat: "Farmacia" },
  { nombre: "Ranitidina 50mg/2ml Ampolla EV", costo: 8, cat: "Farmacia" },
  { nombre: "Ondansetrón 8mg/4ml Ampolla EV (Antiemético Potente)", costo: 18, cat: "Farmacia" },
  { nombre: "Metoclopramida 10mg/2ml Ampolla EV", costo: 8, cat: "Farmacia" },
  { nombre: "Hioscina Butilbromuro 20mg Ampolla EV", costo: 12, cat: "Farmacia" },


  // Respiratorios, Broncodilatadores y Corticoides
  { nombre: "Salbutamol 5mg/ml Solución para Nebulización", costo: 16, cat: "Farmacia" },
  { nombre: "Bromuro de Ipratropio Solución para Nebulizar", costo: 22, cat: "Farmacia" },
  { nombre: "Hidrocortisona 100mg / 250mg Frasco Ampolla EV", costo: 20, cat: "Farmacia" },
  { nombre: "Metilprednisolona 500mg Frasco Ampolla EV", costo: 60, cat: "Farmacia" },
  { nombre: "Dexametasona 4mg / 8mg Ampolla EV", costo: 10, cat: "Farmacia" },


  // Anticonvulsivantes y Sedación
  { nombre: "Diazepam 10mg/2ml Ampolla EV (Anticonvulsivante)", costo: 12, cat: "Farmacia" },
  { nombre: "Midazolam 5mg/5ml Ampolla EV (Sedación Rápida)", costo: 20, cat: "Farmacia" },
  { nombre: "Fenitoína Sódica 250mg/5ml Ampolla EV", costo: 22, cat: "Farmacia" },
  { nombre: "Haloperidol 5mg/1ml Ampolla IM/EV", costo: 15, cat: "Farmacia" },


  // Antibióticos Críticos de Emergencia
  { nombre: "Ceftriaxona 1g / 2g Frasco Ampolla EV", costo: 28, cat: "Farmacia" },
  { nombre: "Ciprofloxacino 200mg/100ml Frasco Infusión EV", costo: 22, cat: "Farmacia" },
  { nombre: "Meropenem 1g Frasco Ampolla EV (Shock Séptico)", costo: 75, cat: "Farmacia" },
  { nombre: "Vancomicina 1g Frasco Ampolla EV", costo: 48, cat: "Farmacia" },
  { nombre: "Metronidazol 500mg/100ml Frasco Infusión EV", costo: 18, cat: "Farmacia" }
];


// Stock de camas inicial
const STOCK_CAMAS = {
  "Trauma Shock": { total: 1, disponible: 1, codigo: "TRAUMA", color: "#dc2626" },
  "Tópico Crítico": { total: 3, disponible: 3, codigo: "TOPIC", color: "#ea580c" },
  "Observación": { total: 5, disponible: 5, codigo: "OBS", color: "#ca8a04" },
  "UCI": { total: 2, disponible: 2, codigo: "UCI", color: "#2563eb" },
};


// Ruta clínica según prioridad
const RUTAS = {
  "I": ["🚨 Puerta", "🏃 Trauma Shock", "💉 Reanimación", "🔬 Laboratorio/Imagen", "🏥 UCI / Quirófano", "🏠 Alta / Deceso"],
  "II": ["🚨 Puerta", "🔴 Tópico Crítico", "💊 Tratamiento", "🔬 Laboratorio", "🛏️ Observación", "🏠 Alta / Referencia"],
  "III": ["🚶 Puerta", "🟡 Observación", "🩺 Evaluación", "💊 Tratamiento", "🏠 Alta / Interconsulta"],
  "IV": ["🚶 Puerta", "🟢 Tópico Rápido", "💊 Tratamiento breve", "🏠 Alta con receta"],
  "V": ["🚶 Puerta", "🔵 Consulta Administrativa", "📋 Derivación programada", "🏠 Salida"],
};


// Definición de prioridades
const PRIORIDADES = {
  "I": { nombre: "EMERGENCIA VITAL", color: "I", hex: "#dc2626", destino: "Trauma Shock / Reanimación", clase: "pnum-I" },
  "II": { nombre: "URGENCIA MAYOR", color: "II", hex: "#ea580c", destino: "Tópico Crítico", clase: "pnum-II" },
  "III": { nombre: "URGENCIA MENOR", color: "III", hex: "#ca8a04", destino: "Observación / Medicina General", clase: "pnum-III" },
  "IV": { nombre: "URGENCIA LEVE", color: "IV", hex: "#16a34a", destino: "Tópico Rápido", clase: "pnum-IV" },
  "V": { nombre: "NO URGENTE", color: "V", hex: "#2563eb", destino: "Consulta Administrativa / Derivación", clase: "pnum-V" },
};


// ---------------------------------------------------------------------------
// 5. INICIALIZACIÓN
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  cargarToken();
  renderizarStockCamas();
  iniciarCronometrosRecursos();
  renderizarTableroCamasYQuirofanos();
  renderizarMonitorObservacionModulo5();
  actualizarWidgetFlotanteCamas();
  renderizarLaboratorio();
  renderizarFarmacia();
  renderizarRutaClinica("III"); // ruta por defecto
  actualizarFactura();
  activarModo("simulador"); // Mostrar el simulador de inmediato al cargar la página
  refrescarCaptchaSeguro(); // Generar el código CAPTCHA inicial para acreditación
});


// ---------------------------------------------------------------------------
// 6. SELECTOR DE MODO
// ---------------------------------------------------------------------------
function activarModo(modo) {
  document.getElementById("sectionModoPiloto").style.display = "none";
  document.getElementById("sectionModoSimulador").style.display = "none";
  document.getElementById("btnModoPiloto").classList.remove("active");
  document.getElementById("btnModoSimulador").classList.remove("active");


  if (modo === "piloto") {
    document.getElementById("sectionModoPiloto").style.display = "block";
    document.getElementById("btnModoPiloto").classList.add("active");
  } else {
    document.getElementById("sectionModoSimulador").style.display = "block";
    document.getElementById("btnModoSimulador").classList.add("active");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}


// ---------------------------------------------------------------------------
// 7. MÓDULOS COLAPSABLES
// ---------------------------------------------------------------------------
function toggleModule(id) {
  const body = document.getElementById(`body_${id}`);
  const arrow = document.getElementById(`arrow_${id}`);
  if (!body) return;
  body.style.display = ""; // Limpiar cualquier override inline
  const isOpen = body.classList.contains("open");
  body.classList.toggle("open", !isOpen);
  if (arrow) arrow.classList.toggle("open", !isOpen);
}


// ---------------------------------------------------------------------------
// 8. MÓDULO 1 — ENFERMERÍA 1
// ---------------------------------------------------------------------------
function selectModalidad(btn) {
  document.querySelectorAll(".modalidad-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  STATE.modalidadIngreso = btn.getAttribute("data-mod");
  registrarTimestamp("M1_modalidad");
}


let reniecDebounceTimer = null;


function procesarIdentificadorFull() {
  const val = document.getElementById("ident_full").value.trim();
  STATE.identificador = val;


  if (val.length < 2) {
    document.getElementById("hc_badge_estado").textContent = "Por confirmar";
    document.getElementById("hc_badge_estado").className = "badge-estado badge-conf";
    document.getElementById("hc_code_display").textContent = "—";
    document.getElementById("hc_accion_display").textContent = "Ingrese al menos 2 caracteres...";
    document.getElementById("alerta_nn").classList.remove("visible");
    document.getElementById("apisperu_panel").classList.remove("visible");
    return;
  }


  if (val.toUpperCase().startsWith("NN") || val.toUpperCase().includes("NO IDENTIFICADO") || val.toUpperCase().includes("INDOCUMENTADO")) {
    STATE.esNN = true;
    STATE.alertaPnpSs = true;
    STATE.grupoSanguineo = "Desconocido";
    const elGsan = document.getElementById("gsan_full");
    if (elGsan) elGsan.value = "Desconocido";
    const elSexo = document.getElementById("sexo_full");
    if (elSexo && (!elSexo.value || elSexo.value === "M")) {
      elSexo.value = val.toUpperCase().includes("FEM") ? "F" : "M";
    }
  }

  const { estado, nroHc, accion, esDni } = clasificarYBuscarEnBD(val);
  STATE.estadoRegistrado = estado;
  STATE.historiaClinica = nroHc;
  STATE.accionHc = accion;
  STATE.alertaPnpSs = (estado === "Por confirmar");


  const badgeEl = document.getElementById("hc_badge_estado");
  if (estado === "Si") { badgeEl.textContent = "Si (En BD)"; badgeEl.className = "badge-estado badge-si"; }
  else if (estado === "No") { badgeEl.textContent = "No (Nuevo)"; badgeEl.className = "badge-estado badge-no"; }
  else { badgeEl.textContent = "Por confirmar"; badgeEl.className = "badge-estado badge-conf"; }


  document.getElementById("hc_code_display").textContent = nroHc;
  document.getElementById("hc_accion_display").textContent = accion;

  // Si existe en BD, autocompletar alergias y demografía permanente
  if (estado === "Si") {
    const masterP = obtenerPacienteMaster(val, nroHc);
    if (masterP) {
      if (masterP.alergias) {
        STATE.alergias = masterP.alergias;
        const elAlergias = document.getElementById("alergias_full");
        if (elAlergias) {
          elAlergias.value = masterP.alergias;
          actualizarIndicadorVisualAlergias(masterP.alergias);
        }
      }
      if (masterP.edad) {
        STATE.edad = masterP.edad;
        const elEdad = document.getElementById("edad_full");
        if (elEdad) elEdad.value = masterP.edad;
      }
      if (masterP.sexo) {
        STATE.sexo = masterP.sexo;
        const elSexo = document.getElementById("sexo_full");
        if (elSexo) elSexo.value = masterP.sexo;
      }
      if (masterP.fecha_nacimiento) {
        const elFecha = document.getElementById("fecha_nac_full");
        if (elFecha) elFecha.value = masterP.fecha_nacimiento;
      }
    }
  }


  // Alerta NN
  document.getElementById("alerta_nn").classList.toggle("visible", STATE.alertaPnpSs);


  // Búsqueda en vivo de coincidencias parciales (DNI, Nombres o Apellidos)
  clearTimeout(busquedaCoincidenciasTimer);
  if (val.length >= 2 && !/^[0-9]{8}$/.test(val)) {
    busquedaCoincidenciasTimer = setTimeout(() => {
      ejecutarBusquedaCoincidenciasEnVivo(val);
    }, 250);
  } else {
    cerrarSugerenciasHC();
  }


  // Auto-consulta a RENIEC si se ingresaron 8 dígitos exactos
  const dniLimpio = val.replace(/[\s\.\-]/g, "");
  if (/^\d{8}$/.test(dniLimpio)) {
    cerrarSugerenciasHC();
    clearTimeout(reniecDebounceTimer);
    reniecDebounceTimer = setTimeout(() => {
      consultarReniec();
    }, 500);
  }


  registrarTimestamp("M1_identidad");
  calcularTicket();
}


// APISPERU / RENIEC
function cargarToken() {
  let t = localStorage.getItem("apisperu_token");
  if (!t) {
    t = DEFAULT_APISPERU_TOKEN;
    localStorage.setItem("apisperu_token", t);
  }
  const inputEl = document.getElementById("apiToken");
  if (inputEl) inputEl.value = t;
}


function guardarToken() {
  const inputEl = document.getElementById("apiToken");
  const t = inputEl ? inputEl.value.trim() : "";
  localStorage.setItem("apisperu_token", t || DEFAULT_APISPERU_TOKEN);
}


async function consultarReniec() {
  const inputEl = document.getElementById("ident_full");
  const rawInput = inputEl ? inputEl.value.trim() : "";
  const token = (document.getElementById("apiToken") ? document.getElementById("apiToken").value.trim() : "") || DEFAULT_APISPERU_TOKEN;
  const panel = document.getElementById("apisperu_panel");

  // Si el paciente es NN, informar sin pedir DNI (Ley N° 27604)
  if (STATE.esNN || rawInput.toUpperCase().startsWith("NN") || rawInput.toUpperCase().includes("INDOCUMENTADO") || rawInput.toUpperCase().includes("NO IDENTIFICADO")) {
    if (panel) {
      panel.style.display = "block";
      panel.innerHTML = `<div class="apisperu-title" style="color:#c2410c;">🚨 <strong>Paciente Indocumentado (NN) — Exonerado de Consulta RENIEC:</strong> Por mandato de la Ley N° 27604, la atención médica de emergencia no se condiciona a la presentación ni consulta de DNI. El paciente continuará su flujo con código temporal de reanimación.</div>`;
      panel.classList.add("visible");
    }
    return;
  }

  if (!rawInput) {
    if (panel) {
      panel.style.display = "block";
      panel.innerHTML = `<div class="apisperu-title">⚠️ Por favor ingrese un número de DNI de 8 dígitos en la casilla.</div>`;
      panel.classList.add("visible");
    }
    alert("⚠️ Ingrese un número de DNI de 8 dígitos antes de consultar.");
    return;
  }

  // Extraer 8 dígitos continuos (permite espacios, puntos o guiones accidentales)
  const dniMatch = rawInput.replace(/[\s\.\-]/g, "").match(/\d{8}/);
  if (!dniMatch) {
    if (panel) {
      panel.style.display = "block";
      panel.innerHTML = `<div class="apisperu-title">⚠️ El valor ingresado no contiene un DNI válido de 8 dígitos.</div>`;
      panel.classList.add("visible");
    }
    alert("⚠️ El valor ingresado no contiene un DNI válido de 8 dígitos numéricos.");
    return;
  }

  const ident = dniMatch[0];
  STATE.numDni = ident;

  if (panel) {
    panel.style.display = "block";
    panel.innerHTML = `<div class="apisperu-title" style="color:#0284c7;font-weight:800;">⏳ Consultando RENIEC en tiempo real para DNI ${ident}...</div>`;
    panel.classList.add("visible");
  }

  let nombreCompleto = "";
  let payload = null;

  // TIER 1: Consulta a dniruc.apisperu.com
  try {
    const url1 = `https://dniruc.apisperu.com/api/v1/dni/${ident}?token=${token}`;
    const controller1 = new AbortController();
    const to1 = setTimeout(() => controller1.abort(), 5000);
    const res1 = await fetch(url1, { signal: controller1.signal });
    clearTimeout(to1);
    if (res1.ok) {
      const data1 = await res1.json();
      if (data1 && (data1.nombres || (data1.data && data1.data.nombres))) {
        payload = data1.data || data1;
        nombreCompleto = `${payload.nombres} ${payload.apellidoPaterno} ${payload.apellidoMaterno}`.trim();
      }
    }
  } catch (e1) {
    console.warn("RENIEC Tier 1 (apisperu):", e1.message);
  }

  // TIER 2: Si Tier 1 falló, consultar servicio secundario apis.net.pe
  if (!nombreCompleto) {
    try {
      const url2 = `https://api.apis.net.pe/v2/reniec/dni?numero=${ident}`;
      const controller2 = new AbortController();
      const to2 = setTimeout(() => controller2.abort(), 5000);
      const res2 = await fetch(url2, {
        signal: controller2.signal,
        headers: { "Authorization": `Bearer ${token}` }
      });
      clearTimeout(to2);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2 && data2.nombres) {
          payload = data2;
          nombreCompleto = `${data2.nombres} ${data2.apellidoPaterno} ${data2.apellidoMaterno}`.trim();
        }
      }
    } catch (e2) {
      console.warn("RENIEC Tier 2 (apis.net.pe):", e2.message);
    }
  }

  // TIER 3: Si la red o adblocker bloqueó las APIs públicas, buscar en Base de Datos Supabase y Local
  if (!nombreCompleto) {
    // 3a. DNI oficial de autores / demo
    if (ident === "44418504") {
      nombreCompleto = "LUIS GUILLERMO VASQUEZ VALDIVIESO";
      payload = { nombres: "LUIS GUILLERMO", apellidoPaterno: "VASQUEZ", apellidoMaterno: "VALDIVIESO", codVerifica: 5 };
    } else if (ident === "10203040") {
      nombreCompleto = "CARLOS MENDOZA ROJAS";
      payload = { nombres: "CARLOS", apellidoPaterno: "MENDOZA", apellidoMaterno: "ROJAS", codVerifica: 8 };
    } else if (ident === "70809010") {
      nombreCompleto = "MARIA TORRES SILVA";
      payload = { nombres: "MARIA", apellidoPaterno: "TORRES", apellidoMaterno: "SILVA", codVerifica: 2 };
    }

    // 3b. Buscar en Supabase historias_clinicas
    if (!nombreCompleto && SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
      try {
        const resDb = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.eq.${encodeURIComponent(ident)},identificador.ilike.*${encodeURIComponent(ident)}*)&select=nombre_completo&order=id.desc&limit=1`, {
          headers: { "apikey": SUPABASE_CONFIG.key, "Authorization": `Bearer ${SUPABASE_CONFIG.key}` }
        });
        if (resDb.ok) {
          const dbData = await resDb.json();
          if (dbData && dbData.length > 0 && dbData[0].nombre_completo && !dbData[0].nombre_completo.includes("NN")) {
            nombreCompleto = dbData[0].nombre_completo.toUpperCase();
            payload = { nombres: nombreCompleto, apellidoPaterno: "", apellidoMaterno: "" };
          }
        }
      } catch (eDb) {}
    }
  }

  // TIER 4: Si no existe en ningún lado ni hubo internet, solicitar ingreso manual sin bloquear la atención
  if (!nombreCompleto) {
    const nombreManual = prompt(`RENIEC: No se pudo conectar a la base de datos externa para el DNI ${ident} (posible bloqueo de adblocker o red).\n\nIngrese el Nombre y Apellidos del paciente para continuar:`, "");
    if (nombreManual && nombreManual.trim().length > 2) {
      nombreCompleto = nombreManual.trim().toUpperCase();
      payload = { nombres: nombreCompleto, apellidoPaterno: "", apellidoMaterno: "" };
    } else {
      if (panel) {
        panel.style.display = "block";
        panel.innerHTML = `<div class="apisperu-title" style="color:#dc2626;">❌ No se pudo verificar el DNI ${ident}</div>
        <div style="font-size:0.8rem;color:#64748b;margin-top:4px;">Verifique el número digitado o ingrese los apellidos y nombres manualmente.</div>`;
      }
      return;
    }
  }

  // --- PROCESAMIENTO EXITOSO DE IDENTIDAD ---
  const primerNombre = (payload?.nombres || nombreCompleto).split(" ")[0].toUpperCase();
  const nombresFemeninos = ["MARIA", "ANA", "CARMEN", "ROSA", "LUZ", "ISABEL", "GLORIA", "HERMELINDA", "ALFONSINA", "TERESA", "JULIA", "ELENA", "PATRICIA", "SILVIA", "DIANA", "CLAUDIA", "PAOLA", "ANDREA", "CAROLINA", "RUTH", "LIDIA", "MIRIAM", "VERONICA", "BEATRIZ", "MONICA"];
  let sexoDetectado = "M";
  if (primerNombre.endsWith("A") || primerNombre.endsWith("IA") || nombresFemeninos.includes(primerNombre)) {
    sexoDetectado = "F";
  }

  // 1. Actualizar STATE
  STATE.numDni = ident;
  STATE.nombreReniec = nombreCompleto;
  STATE.identificador = `${nombreCompleto} (DNI ${ident})`;
  STATE.sexo = sexoDetectado;

  // Asignar o recuperar Historia Clínica
  if (!STATE.historiaClinica || STATE.historiaClinica === "—") {
    STATE.historiaClinica = `HC-2026-${ident.slice(-4)}`;
  }

  // 2. Actualizar el campo de texto de admisión en pantalla (MUY VISIBLE)
  if (inputEl) {
    inputEl.value = `${nombreCompleto} (DNI ${ident})`;
  }

  const elSexo = document.getElementById("sexo_full");
  if (elSexo) elSexo.value = sexoDetectado;

  // 3. Actualizar badges de Historia Clínica
  const badgeEstado = document.getElementById("hc_badge_estado");
  if (badgeEstado) {
    badgeEstado.textContent = "✅ Identificado RENIEC";
    badgeEstado.className = "badge-estado badge-si";
  }

  const codeDisplay = document.getElementById("hc_code_display");
  if (codeDisplay) codeDisplay.textContent = STATE.historiaClinica;

  const accionDisplay = document.getElementById("hc_accion_display");
  if (accionDisplay) {
    accionDisplay.innerHTML = `✅ DNI <strong>${ident}</strong> autenticado en RENIEC: <strong style="color:#15803d;">${nombreCompleto}</strong> &rarr; ${STATE.historiaClinica}`;
  }

  // 4. Desplegar panel oficial APISPERU / RENIEC (VISIBLE GARANTIZADO)
  if (panel) {
    panel.style.display = "block";
    panel.classList.add("visible");
    panel.innerHTML = `
      <div class="apisperu-title" style="color:#15803d;font-weight:900;font-size:0.95rem;">✅ Identidad Autenticada en RENIEC</div>
      <div class="apisperu-result" style="font-size: 1.2rem; font-weight: 900; color: #14532d; margin: 4px 0 8px 0;">
        ${nombreCompleto}
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; font-size: 0.82rem; background: #ffffff; padding: 12px; border-radius: 8px; border: 1.5px solid #86efac;">
        <div><strong style="color:#15803d;">DNI Oficial:</strong> ${ident}</div>
        <div><strong style="color:#15803d;">Historia Clínica:</strong> ${STATE.historiaClinica}</div>
        <div><strong style="color:#15803d;">Sexo Biológico:</strong> ${sexoDetectado === "F" ? "Femenino (F)" : "Masculino (M)"}</div>
        <div><strong style="color:#15803d;">Estado RENIEC:</strong> Válido / Padrón Nacional</div>
      </div>
    `;
  }

  // 5. Recuperar alergias previas si existían en el expediente maestro
  try {
    const masterReniec = obtenerPacienteMaster(ident, STATE.historiaClinica, nombreCompleto);
    if (masterReniec && masterReniec.alergias) {
      STATE.alergias = masterReniec.alergias;
      const elAlergias = document.getElementById("alergias_full");
      if (elAlergias) {
        elAlergias.value = masterReniec.alergias;
        actualizarIndicadorVisualAlergias(masterReniec.alergias);
      }
    }
  } catch (eMaster) {}

  // 6. Consultar seguro persistido en Base de Datos (Memoria DNI)
  buscarSeguroPacienteEnBd(ident).then(seguroGuardado => {
    if (seguroGuardado) {
      console.log(`🧠 Memoria Base de Datos: DNI ${ident} recuperó seguro guardado:`, seguroGuardado);
      aplicarSeleccionSeguroYEntorno(seguroGuardado, false, true);
    } else {
      actualizarSeguroConsolidado("Sin consultar (Pendiente de Acreditación con CAPTCHA)");
      STATE.tipoSeguro = null;
      const boxPideInit = document.getElementById("pide_acreditacion_box");
      if (boxPideInit) boxPideInit.style.display = "none";
    }
  });

  // 7. Auto-guardar en Base de Datos (Supabase & Master)
  try {
    autoGuardarCambioEnHistoriaClinica(`Identificación RENIEC: ${nombreCompleto}`);
  } catch(eSave) {}

  // 8. Confirmación visual con alerta
  alert(`✅ RENIEC: Paciente identificado con éxito\n\nNombre: ${nombreCompleto}\nDNI: ${ident}\nHistoria Clínica: ${STATE.historiaClinica}`);
}


function calcularEdadDesdeFecha() {
  const inputFecha = document.getElementById("fecha_nac_full");
  const inputEdad = document.getElementById("edad_full");
  if (!inputFecha || !inputFecha.value) return;


  const hoy = new Date();
  const cumpleanos = new Date(inputFecha.value);
  let edad = hoy.getFullYear() - cumpleanos.getFullYear();
  const m = hoy.getMonth() - cumpleanos.getMonth();


  if (m < 0 || (m === 0 && hoy.getDate() < cumpleanos.getDate())) {
    edad--;
  }


  if (edad >= 0 && edad <= 125) {
    if (inputEdad) inputEdad.value = edad;
    STATE.edad = edad;
  }
}


function sincronizarEdad() {
  const inputEdad = document.getElementById("edad_full");
  if (!inputEdad) return;
  STATE.edad = parseInt(inputEdad.value, 10) || null;
}


// ---------------------------------------------------------------------------
// MOTOR DE VALIDACIÓN CAPTCHA Y CONSULTA DE SEGUROS (SUSALUD / SIS / ESSALUD)
// ---------------------------------------------------------------------------
let captchaSesionActual = null;


function generarCodigoCaptchaLocal(longitud = 5) {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let res = "";
  for (let i = 0; i < longitud; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}


async function refrescarCaptchaSeguro() {
  const canvas = document.getElementById("captcha_canvas_seguro");
  const inputCaptcha = document.getElementById("captcha_input_seguro");
  const msgBox = document.getElementById("captcha_seguro_msg");
  if (inputCaptcha) inputCaptcha.value = "";
  if (msgBox) { msgBox.style.display = "none"; msgBox.innerHTML = ""; }


  try {
    const res = await fetch("/api/seguro/captcha");
    if (res.ok) {
      const data = await res.json();
      if (data.exito && data.codigo) {
        captchaSesionActual = { token: data.token, codigo: data.codigo };
        renderizarCaptchaCanvas(data.codigo);
        return;
      }
    }
  } catch (e) {
    // Si no hay servidor Python activo, fallback al motor local autónomo
  }


  // Generador local
  const codigoLocal = generarCodigoCaptchaLocal();
  captchaSesionActual = { token: "local", codigo: codigoLocal };
  renderizarCaptchaCanvas(codigoLocal);
}


function renderizarCaptchaCanvas(codigo) {
  const canvas = document.getElementById("captcha_canvas_seguro");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;


  // Fondo degradado
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#f8fafc");
  grad.addColorStop(1, "#e2e8f0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);


  // Líneas de interferencia anti-bot
  const coloresLineas = ["#38bdf8", "#94a3b8", "#f43f5e", "#10b981"];
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = coloresLineas[i % coloresLineas.length];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * height);
    ctx.bezierCurveTo(
      width * 0.3, Math.random() * height,
      width * 0.7, Math.random() * height,
      width, Math.random() * height
    );
    ctx.stroke();
  }


  // Puntos de ruido
  ctx.fillStyle = "#64748b";
  for (let i = 0; i < 35; i++) {
    ctx.fillRect(Math.random() * width, Math.random() * height, 1.5, 1.5);
  }


  // Dibujar caracteres con distorsión y rotación
  const numChars = codigo.length;
  const charSpacing = width / (numChars + 1);
  const coloresTexto = ["#0f172a", "#1e293b", "#0369a1", "#047857", "#b91c1c"];


  for (let i = 0; i < numChars; i++) {
    const ch = codigo[i];
    ctx.save();
    const x = (i + 1) * charSpacing;
    const y = height / 2 + (Math.random() * 4 - 2);
    const rot = (Math.random() - 0.5) * 0.4; // rotación entre -11° y +11°


    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = "bold 21px 'Courier New', monospace";
    ctx.fillStyle = coloresTexto[i % coloresTexto.length];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
}


function mostrarMensajeCaptcha(texto, tipo = "error") {
  const msgBox = document.getElementById("captcha_seguro_msg");
  if (!msgBox) return;
  msgBox.style.display = "block";
  if (tipo === "error") {
    msgBox.style.color = "#f87171";
    msgBox.innerHTML = `<span>❌ ${texto}</span>`;
  } else {
    msgBox.style.color = "#34d399";
    msgBox.innerHTML = `<span>${texto}</span>`;
  }
}


async function ejecutarConsultaSeguroConCaptcha() {
  const inputCaptcha = document.getElementById("captcha_input_seguro");
  const elIdent = document.getElementById("ident_full");
  const ident = (elIdent ? elIdent.value.trim() : "") || (STATE.identificador ? String(STATE.identificador).trim() : "");

  if (!ident) {
    mostrarMensajeCaptcha("Ingrese primero un identificador o DNI en el Módulo 1.", "error");
    if (elIdent) elIdent.focus();
    return;
  }

  const codigoIngresado = (inputCaptcha ? inputCaptcha.value.trim().toUpperCase() : "");
  if (!codigoIngresado) {
    mostrarMensajeCaptcha("Escriba el código de seguridad de la imagen para validar la consulta.", "error");
    if (inputCaptcha) inputCaptcha.focus();
    return;
  }

  // Validación de Captcha (local o sesión)
  if (!captchaSesionActual || codigoIngresado !== captchaSesionActual.codigo.toUpperCase()) {
    mostrarMensajeCaptcha(`El código '${codigoIngresado}' no coincide con la imagen. Intente con el nuevo código generado.`, "error");
    refrescarCaptchaSeguro();
    return;
  }

  // Extraer número de DNI
  const dniMatch = ident.match(/\d{8}/);
  const numDni = dniMatch ? dniMatch[0] : (ident.length >= 8 ? ident.slice(0, 8) : "70809010");
  const nombrePac = STATE.nombreReniec || STATE.identificador || "PACIENTE ASEGURADO";

  // Helpers oficiales de adscripción asistencial — EXCLUSIVAMENTE LIMA - PERÚ
  const resolverCentroLima = (dni) => {
    const prefijo = (dni || "").slice(0, 2);
    const n = parseInt(prefijo || "10", 10);

    // Hospitales de EsSalud en Lima - Perú (Redes Rebagliati, Almenara y Sabogal)
    const essaludLima = [
      { nombre: "Hospital Nacional Edgardo Rebagliati Martins (Red Rebagliati - Jesús María, Lima)", ipress: "Hospital Nacional Edgardo Rebagliati Martins", renaes: "00003502" },
      { nombre: "Hospital Nacional Guillermo Almenara Irigoyen (Red Almenara - La Victoria, Lima)", ipress: "Hospital Nacional Guillermo Almenara Irigoyen", renaes: "00003503" },
      { nombre: "Hospital Nacional Alberto Sabogal Sologuren (Red Sabogal - Bellavista, Callao/Lima)", ipress: "Hospital Nacional Alberto Sabogal Sologuren", renaes: "00003504" },
      { nombre: "Hospital de Emergencias Grau (Red Almenara - Cercado de Lima, Lima)", ipress: "Hospital de Emergencias Grau", renaes: "00003510" },
      { nombre: "Hospital II Suárez-Angamos (Red Rebagliati - Miraflores, Lima)", ipress: "Hospital II Suárez-Angamos", renaes: "00003515" }
    ];

    // Hospitales e IPRESS del MINSA en Lima - Perú
    const minsaLima = [
      { nombre: "Hospital Nacional Arzobispo Loayza (Lima Centro - Cercado de Lima)", ipress: "Hospital Nacional Arzobispo Loayza", renaes: "00000410" },
      { nombre: "Hospital Nacional Dos de Mayo (Lima Centro - Barrios Altos, Lima)", ipress: "Hospital Nacional Dos de Mayo", renaes: "00000411" },
      { nombre: "Hospital de Emergencias José Casimiro Ulloa (Lima Centro - Miraflores, Lima)", ipress: "Hospital de Emergencias José Casimiro Ulloa", renaes: "00000820" },
      { nombre: "Hospital Nacional Cayetano Heredia (Lima Norte - San Martín de Porres, Lima)", ipress: "Hospital Nacional Cayetano Heredia", renaes: "00001045" },
      { nombre: "Hospital de Emergencias Villa El Salvador (Lima Sur - Villa El Salvador, Lima)", ipress: "Hospital de Emergencias Villa El Salvador", renaes: "00002891" },
      { nombre: "Hospital María Auxiliadora (Lima Sur - San Juan de Miraflores, Lima)", ipress: "Hospital María Auxiliadora", renaes: "00002450" }
    ];

    // Clínicas Privadas en Lima - Perú (Red Prestacional EPS: Pacífico, Rímac, Mapfre, Sanitas)
    const epsLima = [
      { nombre: "Clínica Internacional - Sede San Borja (Lima)", ipress: "Clínica Internacional - Sede San Borja", poliza: "POL-PACIFICO-98210" },
      { nombre: "Clínica Javier Prado (San Isidro, Lima - Red EPS Rímac / Pacífico)", ipress: "Clínica Javier Prado", poliza: "POL-RIMAC-44812" },
      { nombre: "Clínica Ricardo Palma (San Isidro, Lima - Red EPS Mapfre / Sanitas)", ipress: "Clínica Ricardo Palma", poliza: "POL-MAPFRE-77215" },
      { nombre: "Clínica San Felipe (Jesús María, Lima - Red EPS)", ipress: "Clínica San Felipe", poliza: "POL-SANITAS-33910" },
      { nombre: "Clínica Anglo Americana (San Isidro, Lima - Red EPS)", ipress: "Clínica Anglo Americana", poliza: "POL-PACIFICO-11048" },
      { nombre: "Clínica Delgado Auna (Miraflores, Lima - Red EPS)", ipress: "Clínica Delgado Auna", poliza: "POL-RIMAC-88492" }
    ];

    const idxEss = n % essaludLima.length;
    const idxMin = n % minsaLima.length;
    const idxEps = n % epsLima.length;

    return {
      essalud: essaludLima[idxEss].nombre,
      ipress_essalud: essaludLima[idxEss].ipress,
      renaes_essalud: essaludLima[idxEss].renaes,
      sis: minsaLima[idxMin].nombre,
      ipress_sis: minsaLima[idxMin].ipress,
      renaes_sis: minsaLima[idxMin].renaes,
      eps: epsLima[idxEps].nombre,
      ipress_eps: epsLima[idxEps].ipress,
      poliza_eps: epsLima[idxEps].poliza
    };
  };

  const centro = resolverCentroLima(numDni);
  const autogen = `9505151AVNH${numDni.slice(-3)}`;
  const fua = `${centro.renaes_sis}-2026-00${numDni.slice(-6)}`;

  // DETERMINACIÓN AUTOMÁTICA DEL SEGURO SEGÚN BASE DE DATOS O ASIGNACIÓN AL AZAR
  let tipoResuelto = "";
  const seguroGuardado = await buscarSeguroPacienteEnBd(numDni);

  if (seguroGuardado) {
    const segL = seguroGuardado.toLowerCase();
    if (segL.includes("sis") || segL.includes("minsa")) tipoResuelto = "sis";
    else if (segL.includes("essalud")) tipoResuelto = "essalud";
    else if (segL.includes("eps") || segL.includes("privad") || segL.includes("rimac") || segL.includes("pacifico") || segL.includes("mapfre") || segL.includes("sanitas") || segL.includes("positiva")) tipoResuelto = "eps";
    else if (segL.includes("soat")) tipoResuelto = "soat";
    else if (segL.includes("particular") || segL.includes("sin seguro") || segL.includes("ningun")) tipoResuelto = "particular";
    else tipoResuelto = "particular";
    console.log(`🧠 Memoria Base de Datos: Paciente DNI ${numDni} recuperó seguro guardado:`, tipoResuelto);
  } else {
    // Si no tiene seguro en la base de datos, el sistema le acredita un tipo de seguro AL AZAR (SIS, EsSalud, EPS)
    const opcionesAlAzar = ["sis", "essalud", "eps", "particular"];
    tipoResuelto = opcionesAlAzar[Math.floor(Math.random() * opcionesAlAzar.length)];
    console.log(`🎲 Acreditación inicial al azar para nuevo DNI ${numDni}:`, tipoResuelto, "-> Guardando permanentemente en Base de Datos Supabase...");
    await guardarSeguroPacienteEnBd(numDni, STATE.historiaClinica, nombrePac, tipoResuelto.toUpperCase());
  }

  let resultado = {};
  if (tipoResuelto === "sis") {
    resultado = {
      tipo_seguro: "SIS",
      estado: "AFILIADO ACTIVO",
      plan: "SIS Gratuito (Ley N° 30885 - Aseguramiento Universal AUS)",
      centro_adscrito: centro.sis,
      fua: fua,
      vigencia: "Indefinida / Activa en SUSALUD",
      ipress: centro.ipress_sis,
      copago: "S/. 0.00 (Exoneración 100% Pago Cero)"
    };
  } else if (tipoResuelto === "essalud") {
    resultado = {
      tipo_seguro: "EsSalud",
      estado: "ACREDITADO ACTIVO",
      plan: "Titular Regular — D.L. 728 / Cobertura Integral Nivel III",
      centro_adscrito: centro.essalud,
      ipress: centro.ipress_essalud,
      autogenerado: autogen,
      vigencia: "Activa hasta 31/12/2026 (Sistema ESSI - Lima)",
      prestacion_especial: "Cobertura de Sepelio / Fallecimiento (Activa)",
      copago: "S/. 0.00 (Exoneración Institucional EsSalud)"
    };
  } else if (tipoResuelto === "eps") {
    resultado = {
      tipo_seguro: "EPS",
      estado: "PÓLIZA PRIVADA ACTIVA",
      plan: "Red de Clínicas Privadas de Lima (Pacífico Salud / Rímac / Mapfre)",
      centro_adscrito: centro.eps,
      poliza: centro.poliza_eps,
      vigencia: "Póliza Privada Vigente (Registro IAFAS SUSALUD)",
      copago: "Urgencia S/. 80.00 + 10% coaseguro farmacia",
      copago_pct: 10
    };
  } else if (tipoResuelto === "particular") {
    resultado = {
      tipo_seguro: "Particular",
      estado: "NO ASEGURADO (SIN SEGURO)",
      plan: "Atención Particular / Sin Seguro en Salud",
      centro_adscrito: "Sin adscripción en IAFAS pública ni privada en Lima",
      vigencia: "Sin Cobertura Activa",
      copago: "100% de todo lo facturado a cargo del paciente"
    };
  } else {
    resultado = {
      tipo_seguro: "SIS",
      estado: "AFILIADO ACTIVO",
      plan: "SIS Gratuito (MINSA)",
      centro_adscrito: centro.sis,
      fua: fua,
      vigencia: "Indefinida / Activa",
      copago: "S/. 0.00"
    };
  }

  mostrarMensajeCaptcha(`✅ CAPTCHA Validado con éxito — Seguro Acreditado Automáticamente: ${resultado.tipo_seguro}`, "success");
  procesarResultadoAcreditacion(resultado, ident);
}

function procesarResultadoAcreditacion(datos, ident) {
  const box = document.getElementById("pide_acreditacion_box");
  const grid = document.getElementById("pide_detalles_grid");
  const titulo = document.getElementById("pide_tipo_titulo");
  const badgeEstado = document.getElementById("pide_badge_estado");
  const bannerCondicion = document.getElementById("pide_condiciones_cobro_banner");

  if (box) box.style.display = "block";

  if (datos.tipo_seguro === "EsSalud") {
    STATE.tipoSeguro = "EsSalud";
    seleccionarEntornoEstablecimiento("essalud", false, true);
    STATE.acreditadoEsSalud = true;

    if (titulo) titulo.textContent = "🏛️ ACREDITACIÓN PIDE-SUSALUD: EsSalud (Seguro Social de Salud - Lima)";
    if (badgeEstado) {
      badgeEstado.textContent = "✅ ACREDITADO ACTIVO";
      badgeEstado.style.background = "#10b981";
    }

    if (grid) {
      grid.innerHTML = `
        <div><span style="color:#64748b;">Asegurado / Plan:</span><br><strong>${datos.plan || "Titular Regular D.L. 728"}</strong></div>
        <div><span style="color:#64748b;">Hospital Adscrito (Lima):</span><br><strong>${datos.centro_adscrito || "Hospital Nacional Edgardo Rebagliati Martins"}</strong></div>
        <div><span style="color:#64748b;">N° Autogenerado ESSI:</span><br><strong style="font-family:monospace;color:#0284c7;">${datos.autogenerado || "9505151AVNH010"}</strong></div>
        <div><span style="color:#64748b;">Vigencia de Derechos:</span><br><strong>${datos.vigencia || "Activa hasta 31/12/2026"}</strong></div>
        <div><span style="color:#64748b;">Prestación Especial:</span><br><strong style="color:#16a34a;">${datos.prestacion_especial || "Cobertura de Sepelio Activa"}</strong></div>
        <div><span style="color:#64748b;">Copago Paciente:</span><br><strong style="color:#16a34a;">S/. 0.00 (Exoneración 100% Pago Cero)</strong></div>
      `;
    }

    if (bannerCondicion) {
      bannerCondicion.style.borderLeftColor = "#1d4ed8";
      bannerCondicion.innerHTML = `
        <strong style="color:#1e40af;display:block;margin-bottom:4px;">⚖️ CONDICIÓN DE COBRO OFICIAL APLICADA — ESSALUD LIMA (PAGO CERO):</strong>
        Paciente asegurado titular/derechohabiente con derechos vigentes en la Red Asistencial de EsSalud en Lima. La totalidad de la atención médica de emergencia, procedimientos clínicos, tópicos, cama, medicamentos e insumos de farmacia, exámenes auxiliares de laboratorio y radiología diagnóstica están <strong>100% CUBIERTOS POR ESSALUD (S/. 0.00 a pagar por el paciente)</strong>.
      `;
    }

    actualizarSeguroConsolidado("EsSalud — Asegurado Activo ESSI Lima (Pago Cero 100%)");
  } else if (datos.tipo_seguro === "SIS") {
    STATE.tipoSeguro = "SIS";
    seleccionarEntornoEstablecimiento("minsa_sis", false, true);

    if (titulo) titulo.textContent = "🏛️ ACREDITACIÓN PIDE-SUSALUD: SIS Gratuito (MINSA Lima / AUS)";
    if (badgeEstado) {
      badgeEstado.textContent = "✅ AFILIADO ACTIVO";
      badgeEstado.style.background = "#10b981";
    }

    if (grid) {
      grid.innerHTML = `
        <div><span style="color:#64748b;">Plan de Aseguramiento:</span><br><strong>${datos.plan || "SIS Gratuito Subsidiado"}</strong></div>
        <div><span style="color:#64748b;">Hospital Adscrito (Lima):</span><br><strong>${datos.centro_adscrito || "Hospital Nacional Arzobispo Loayza (Lima Centro)"}</strong></div>
        <div><span style="color:#64748b;">N° de Formato FUA:</span><br><strong style="font-family:monospace;color:#0284c7;">${datos.fua || "00000410-2026-004812"}</strong></div>
        <div><span style="color:#64748b;">Vigencia de Cobertura:</span><br><strong>${datos.vigencia || "Indefinida / Activa"}</strong></div>
        <div><span style="color:#64748b;">Norma de Amparo:</span><br><strong>Ley N° 30885 / AUS</strong></div>
        <div><span style="color:#64748b;">Copago Paciente:</span><br><strong style="color:#16a34a;">S/. 0.00 (Exoneración 100% Pago Cero)</strong></div>
      `;
    }

    if (bannerCondicion) {
      bannerCondicion.style.borderLeftColor = "#0284c7";
      bannerCondicion.innerHTML = `
        <strong style="color:#0369a1;display:block;margin-bottom:4px;">⚖️ CONDICIÓN DE COBRO OFICIAL APLICADA — SIS GRATUITO LIMA (PAGO CERO):</strong>
        Paciente acreditado en el Seguro Integral de Salud (Régimen Subsidiado del Estado) adscrito a hospital de Lima. Todos los procedimientos asistenciales, consulta médica, medicamentos de farmacia, exámenes de laboratorio, imágenes y estancia en cama están <strong>100% FINANCIADOS POR EL ESTADO MEDIANTE FUA (S/. 0.00 a pagar por el paciente)</strong>.
      `;
    }

    actualizarSeguroConsolidado("SIS Gratuito Integral — MINSA Lima / FUA (Pago Cero 100%)");
  } else if (datos.tipo_seguro === "EPS") {
    STATE.tipoSeguro = "EPS";
    seleccionarEntornoEstablecimiento("clinica_eps", false, true);

    if (titulo) titulo.textContent = "🏢 ACREDITACIÓN PIDE-SUSALUD: Clínica Privada en Lima (Red EPS)";
    if (badgeEstado) {
      badgeEstado.textContent = "✅ PÓLIZA PRIVADA ACTIVA";
      badgeEstado.style.background = "#10b981";
    }

    if (grid) {
      grid.innerHTML = `
        <div><span style="color:#64748b;">Aseguradora EPS:</span><br><strong>${datos.plan || "Pacífico Salud / Rímac / Mapfre"}</strong></div>
        <div><span style="color:#64748b;">Clínica Asignada (Lima):</span><br><strong>${datos.centro_adscrito || "Clínica Internacional - Sede San Borja (Lima)"}</strong></div>
        <div><span style="color:#64748b;">N° Póliza / Certificado:</span><br><strong style="font-family:monospace;color:#0284c7;">${datos.poliza || "POL-PACIFICO-98210"}</strong></div>
        <div><span style="color:#64748b;">Estado en Registro IAFAS:</span><br><strong>Vigente y Activa</strong></div>
        <div><span style="color:#64748b;">Consulta de Urgencia (P-III/IV/V):</span><br><strong style="color:#b45309;">S/. 80.00 (Tarifa Fija)</strong></div>
        <div><span style="color:#64748b;">Coaseguro Farmacia:</span><br><strong style="color:#b45309;">10% del total de medicamentos</strong></div>
      `;
    }

    if (bannerCondicion) {
      bannerCondicion.style.borderLeftColor = "#10b981";
      bannerCondicion.innerHTML = `
        <strong style="color:#065f46;display:block;margin-bottom:4px;">⚖️ CONDICIÓN DE COBRO OFICIAL APLICADA — CLÍNICA PRIVADA EN LIMA (EPS):</strong>
        • <strong>Si es Emergencia Médica (Prioridad I o II):</strong> Por Ley N° 27604, la atención médica, sala de reanimación, cama y exámenes tienen costo S/. 0.00 para el asegurado. En farmacia asume únicamente el <strong>10% de coaseguro</strong>.<br>
        • <strong>Si NO es Emergencia (Prioridad III, IV o V):</strong> El sistema clasifica <strong>AUTOMÁTICAMENTE COMO URGENCIA</strong>. Aplica cobro fijo de <strong>S/. 80.00 por consulta de urgencia</strong> y el <strong>10% del total de medicamentos</strong> prescritos. Exámenes de laboratorio e imágenes quedan 100% cubiertos por la aseguradora EPS.
      `;
    }

    actualizarSeguroConsolidado("Clínica Privada — EPS Activa en Lima (Pacífico / Rímac / Mapfre)");
  } else if (datos.tipo_seguro === "Particular" || String(datos.tipo_seguro).toLowerCase().includes("particular") || String(datos.tipo_seguro).toLowerCase().includes("sin seguro")) {
    STATE.tipoSeguro = "Particular";
    STATE.esClinicaPrivada = false;
    seleccionarEntornoEstablecimiento("particular", false, true);

    if (titulo) titulo.textContent = "👤 ACREDITACIÓN PIDE-SUSALUD: Sin Seguro (Paciente Particular)";
    if (badgeEstado) {
      badgeEstado.textContent = "❌ NO ASEGURADO (SIN COBERTURA)";
      badgeEstado.style.background = "#ef4444";
    }

    if (grid) {
      grid.innerHTML = `
        <div><span style="color:#64748b;">Condición de Cobertura:</span><br><strong style="color:#dc2626;">Sin Seguro Activo (Particular)</strong></div>
        <div><span style="color:#64748b;">Padrón Nacional IAFAS:</span><br><strong>No figura en SIS, EsSalud ni EPS de Lima</strong></div>
        <div><span style="color:#64748b;">Modalidad de Atención:</span><br><strong>Tarifario General Particular</strong></div>
        <div><span style="color:#64748b;">Procedimientos y Cama:</span><br><strong style="color:#dc2626;">100% a cargo del paciente</strong></div>
        <div><span style="color:#64748b;">Medicamentos (Farmacia):</span><br><strong style="color:#dc2626;">100% a cargo del paciente</strong></div>
        <div><span style="color:#64748b;">Cobertura Aseguradora:</span><br><strong style="color:#dc2626;">S/. 0.00 (Sin Cobertura)</strong></div>
      `;
    }

    if (bannerCondicion) {
      bannerCondicion.style.borderLeftColor = "#ef4444";
      bannerCondicion.innerHTML = `
        <strong style="color:#b91c1c;display:block;margin-bottom:4px;">⚖️ CONDICIÓN DE COBRO OFICIAL APLICADA — PARTICULAR (100% A CARGO DEL PACIENTE):</strong>
        Al no contar con ningún seguro activo (público ni privado), el paciente <strong>EN TODOS LOS CASOS ASUME EL 100% DE LA TOTALIDAD DE LO FACTURADO</strong>: consulta médica de admisión, tópicos de emergencia, estancia en cama, procedimientos, la totalidad de los medicamentos administrados en Kardex, exámenes analíticos de laboratorio y estudios radiológicos de imágenes. Cobertura de aseguradora: S/. 0.00.
      `;
    }

    actualizarSeguroConsolidado("Particular (Sin Seguro Activo — Cobro al 100%)");
  }

  // Persistir en Base de Datos de manera inalterable
  const dniMatch = (ident || "").match(/\d{8}/);
  const numDni = dniMatch ? dniMatch[0] : ident;
  guardarSeguroPacienteEnBd(numDni, STATE.historiaClinica, STATE.nombreReniec, datos.tipo_seguro);

  // Actualizar inmediatamente Factura y Triaje
  if (typeof recalcularPrioridad === "function") {
    try { recalcularPrioridad(); } catch(e){}
  }
  if (typeof actualizarFactura === "function") {
    try { actualizarFactura(); } catch(e){}
  }
}


function activarTabSeguro(tab, btn, syncSelector = true) {
  document.querySelectorAll(".seguro-pane").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".seguro-tab").forEach(b => b.classList.remove("active"));
  const pane = document.getElementById(`pane_${tab}`);
  if (pane) pane.classList.add("active");
  if (btn) btn.classList.add("active");


  if (syncSelector) {
    const sel = document.getElementById("entidad_consulta_seguro");
    if (sel && sel.type !== "hidden") {
      if (tab === "essalud") sel.value = "essalud";
      else if (tab === "sis") sel.value = "sis";
      else if (tab === "soat") sel.value = "soat";
      else if (tab === "eps") sel.value = "eps";
      else if (tab === "susalud") sel.value = "essalud";
    }
  }
}


function sincronizarTabSeguroConSelector(val) {
  const tabs = document.querySelectorAll(".seguro-tab");
  if (val === "essalud" && tabs[2]) activarTabSeguro("essalud", tabs[2], false);
  else if (val === "sis" && tabs[1]) activarTabSeguro("sis", tabs[1], false);
  else if (val === "soat" && tabs[3]) activarTabSeguro("soat", tabs[3], false);
  else if ((val === "eps" || val === "particular") && tabs[4]) activarTabSeguro("eps", tabs[4], false);
  else if (tabs[0]) activarTabSeguro("susalud", tabs[0], false);
}


function registrarSeguroManual(tipo) {
  const val = document.getElementById(`res_${tipo}`).value;
  if (!val) return;
  STATE.tipoSeguro = val;
  STATE.validacionManual = `Verificado en SUSALUD: ${val} | ${new Date().toLocaleTimeString()}`;
  document.getElementById("resultado_susalud").innerHTML = `
    <strong>${val}</strong> <span class="seguro-badge seguro-badge-sis">✓ Registrado</span>
  `;
  actualizarSeguroConsolidado(val);
  registrarTimestamp("M2_seguro");
}


function registrarSIS() {
  const val = document.getElementById("estado_sis").value;
  if (!val) return;
  STATE.tipoSeguro = "SIS";
  document.getElementById("resultado_sis").innerHTML = `
    <strong>SIS — ${val}</strong> <span class="seguro-badge seguro-badge-sis">✓</span>
  `;
  actualizarSeguroConsolidado("SIS — " + val);
  registrarTimestamp("M2_sis");
}


function actualizarFUA() {
  STATE.numerFua = document.getElementById("fua_sis").value.trim();
}


function registrarEsSalud() {
  const val = document.getElementById("estado_essalud").value;
  if (!val) return;
  STATE.tipoSeguro = "EsSalud";
  STATE.acreditadoEsSalud = (val === "Acreditado Activo");
  document.getElementById("resultado_essalud").innerHTML = `
    <strong>EsSalud — ${val}</strong> <span class="seguro-badge seguro-badge-essalud">✓</span>
  `;
  actualizarSeguroConsolidado("EsSalud — " + val);
  registrarTimestamp("M2_essalud");
}


function validarSOAT() {
  const placa = document.getElementById("placa_soat").value.trim();
  const aseg = document.getElementById("aseg_soat").value;
  if (!placa) { alert("Ingrese la placa del vehículo"); return; }
  const regex = /^[A-Z]{1,3}[-]?\d{3,4}$/;
  if (!regex.test(placa.replace(/-/g,""))) {
    document.getElementById("resultado_soat").innerHTML = `<span style="color:#ef4444;">⚠️ Formato de placa inválido</span>`;
    return;
  }
  STATE.tipoSeguro = "SOAT";
  document.getElementById("resultado_soat").innerHTML = `
    <strong>SOAT — ${aseg || "Aseguradora"} | Placa: ${placa}</strong>
    <span class="seguro-badge seguro-badge-soat">✓</span><br>
    <span style="font-size:0.75rem;color:#64748b;">Tope máximo: S/. 26,000 (5 UIT)</span>
  `;
  actualizarSeguroConsolidado(`SOAT — ${aseg} | Placa ${placa}`);
  registrarTimestamp("M2_soat");
}


function toggleCopago() {
  const tipo = document.getElementById("tipo_eps").value;
  document.getElementById("copago_field").style.display = tipo === "EPS" ? "flex" : "none";
}


function registrarEPS() {
  const tipo = document.getElementById("tipo_eps").value;
  const copago = document.getElementById("pct_copago").value;
  STATE.tipoSeguro = tipo;
  if (tipo === "EPS" && copago) STATE.porcentajeCopago = parseFloat(copago);
  const txt = tipo === "EPS"
    ? `EPS Privada (${copago || "—"}% copago paciente)`
    : "No asegurado (Particular)";
  document.getElementById("resultado_eps").innerHTML = `
    <strong>${txt}</strong>
    <span class="seguro-badge ${tipo === "EPS" ? "seguro-badge-eps" : "seguro-badge-particular"}">✓</span>
  `;
  actualizarSeguroConsolidado(txt);
  registrarTimestamp("M2_eps");
}


function actualizarSeguroConsolidado(texto) {
  document.getElementById("seguro_consolidado").textContent = texto;
  registrarFacturaItem("Verificación administrativa de seguro", 0, "Administrativo");
}


// ---------------------------------------------------------------------------
// 10. MÓDULO 3 — TRIAJE CLÍNICO (5 PRIORIDADES Y RANGOS BIOLÓGICOS ESTRICTOS)
// ---------------------------------------------------------------------------


// RANGOS BIOLÓGICOS Y LÍMITES FISIOLÓGICOS COMPATIBLES CON LA VIDA
const RANGOS_BIOLOGICOS = {
  spo2: {
    min: 0,
    max: 100,
    nombre: "SpO2 (Saturación O2)",
    unidad: "%",
    elId: "spo2_full",
    cardId: "card_spo2",
    errId: "error_spo2_full"
  },
  fc: {
    min: 0,
    max: 280,
    nombre: "Frecuencia Cardíaca",
    unidad: "lpm",
    elId: "fc_full",
    cardId: "card_fc",
    errId: "error_fc_full"
  },
  pas: {
    min: 0,
    max: 300,
    nombre: "PA Sistólica",
    unidad: "mmHg",
    elId: "pas_full",
    cardId: "card_pas",
    errId: "error_pas_full"
  },
  pad: {
    min: 0,
    max: 200,
    nombre: "PA Diastólica",
    unidad: "mmHg",
    elId: "pad_full",
    cardId: "card_pad",
    errId: "error_pad_full"
  },
  fr: {
    min: 0,
    max: 80,
    nombre: "Frecuencia Respiratoria",
    unidad: "rpm",
    elId: "fr_full",
    cardId: "card_fr",
    errId: "error_fr_full"
  },
  temp: {
    min: 25.0,
    max: 45.0,
    nombre: "Temperatura Corporal",
    unidad: "°C",
    elId: "temp_full",
    cardId: "card_temp",
    errId: "error_temp_full"
  },
  glucosa: {
    min: 10,
    max: 800,
    nombre: "Glucosa Capilar",
    unidad: "mg/dL",
    elId: "glucosa_full",
    cardId: "card_glucosa",
    errId: "error_glucosa_full"
  },
  glasgow: {
    min: 3,
    max: 15,
    nombre: "Escala de Glasgow",
    unidad: "pts",
    elId: "glasgow_full",
    cardId: "card_glasgow",
    errId: "error_glasgow_full"
  },
  eva: {
    min: 0,
    max: 10,
    nombre: "Escala EVA de Dolor",
    unidad: "pts",
    elId: "eva_full",
    cardId: "field_eva",
    errId: "error_eva_full"
  }
};


/**
 * Validación Biológica de Dos Niveles (Normativa NTS N° 042-MINSA & Ley N° 27604)
 * Nivel 1 — Error de Digitación (Bloqueante): Valores físicamente imposibles.
 * Nivel 2 — Signos de Paro / Agonía (No Bloqueante): PAS=0, FC=0, FR=0, Glasgow=3 activa Código Rojo Shock Trauma.
 */
function validarSignosVitalesEnVivo() {
  const errores = [];
  let primerElementoInvalido = null;
  let esParoOAgonia = false;

  // 1. Validar cada parámetro biológico
  for (const [clave, def] of Object.entries(RANGOS_BIOLOGICOS)) {
    const el = document.getElementById(def.elId);
    const card = document.getElementById(def.cardId);
    const errBox = document.getElementById(def.errId);

    if (!el) continue;

    const raw = String(el.value || "").trim();
    if (raw === "") {
      el.classList.remove("is-invalid");
      if (card) card.classList.remove("has-error");
      if (errBox) { errBox.style.display = "none"; errBox.innerHTML = ""; }
      continue;
    }

    const val = parseFloat(raw.replace(",", "."));
    if (isNaN(val)) {
      const msg = `${def.nombre}: Ingrese un valor numérico válido.`;
      marcarCampoError(el, card, errBox, msg);
      errores.push(msg);
      if (!primerElementoInvalido) primerElementoInvalido = el;
      continue;
    }

    // Nivel 1: Error de digitación física
    if (val < def.min || val > def.max) {
      const msg = `${def.nombre} = ${val} ${def.unidad} fuera del límite biológico posible (${def.min} a ${def.max} ${def.unidad}).`;
      marcarCampoError(el, card, errBox, msg);
      errores.push(msg);
      if (!primerElementoInvalido) primerElementoInvalido = el;
      continue;
    }

    // Nivel 2: Detección de Paro Cardiorrespiratorio o Inestabilidad Extrema
    if ((clave === "fc" && val === 0) || (clave === "pas" && val === 0) || (clave === "fr" && val === 0) || (clave === "glasgow" && val === 3)) {
      esParoOAgonia = true;
    }

    // Parámetro correcto
    el.classList.remove("is-invalid");
    if (card) card.classList.remove("has-error");
    if (errBox) { errBox.style.display = "none"; errBox.innerHTML = ""; }
  }

  // Validación de Presión Arterial: PAD < PAS
  const elPas = document.getElementById("pas_full");
  const elPad = document.getElementById("pad_full");
  const cardPad = document.getElementById("card_pad");
  const errPad = document.getElementById("error_pad_full");

  if (elPas && elPad && elPas.value.trim() !== "" && elPad.value.trim() !== "") {
    const pas = parseFloat(elPas.value.trim().replace(",", "."));
    const pad = parseFloat(elPad.value.trim().replace(",", "."));
    if (!isNaN(pas) && !isNaN(pad) && pas > 0 && pad > 0) {
      if (pad >= pas) {
        const msg = `PA Diastólica (${pad} mmHg) no puede ser mayor o igual a Sistólica (${pas} mmHg).`;
        marcarCampoError(elPad, cardPad, errPad, msg);
        errores.push(msg);
        if (!primerElementoInvalido) primerElementoInvalido = elPad;
      }
    }
  }

  // Gestión de Alerta Nivel 2: Paro Cardiorrespiratorio
  const bannerParo = document.getElementById("banner_paro_agonia");
  if (esParoOAgonia) {
    if (bannerParo) bannerParo.style.display = "block";
    STATE.panicoShockTrauma = true;
    STATE.prioridad = "I";
    STATE.colorPrioridad = "ROJO";
    const chipLive = document.getElementById("chipPrioLive");
    if (chipLive) {
      chipLive.textContent = "P-I ROJO (PARO / SHOCK TRAUMA)";
      chipLive.className = "top-prio-chip prio-I";
    }
  } else {
    if (bannerParo) bannerParo.style.display = "none";
  }

  // Banner Nivel 1 de Error de Digitación
  const banner = document.getElementById("banner_error_vitales");
  const bannerDetalles = document.getElementById("banner_error_vitales_detalles");
  const btnEval = document.getElementById("btn_evaluar_full");

  const esValido = (errores.length === 0);

  if (!esValido) {
    if (banner) {
      banner.classList.add("visible");
      if (bannerDetalles) {
        bannerDetalles.innerHTML = `<ul style="margin:4px 0 0 16px;padding:0;color:#991b1b;font-weight:700;">` +
          errores.map(e => `<li>${e}</li>`).join("") + `</ul>`;
      }
    }
    if (btnEval) {
      btnEval.disabled = true;
      btnEval.style.opacity = "0.5";
      btnEval.title = "Corrija los valores biológicamente imposibles antes de evaluar.";
    }
  } else {
    if (banner) {
      banner.classList.remove("visible");
      if (bannerDetalles) bannerDetalles.innerHTML = "";
    }
    if (btnEval) {
      btnEval.disabled = false;
      btnEval.style.opacity = "1";
      btnEval.title = "Evaluar y clasificar según NTS N° 042-MINSA";
    }
  }

  return { esValido, errores, esParoOAgonia, primerElementoInvalido };
}

function marcarCampoError(el, card, errBox, mensaje) {
  if (el) el.classList.add("is-invalid");
  if (card) card.classList.add("has-error");
  if (errBox) {
    errBox.style.display = "block";
    errBox.innerHTML = `⚠️ ${mensaje}`;
  }
}

function mostrarErrorBiologicoEnPrioridad(errores) {
  const pd = document.getElementById("prioridad_display");
  if (!pd) return;
  pd.style.background = "#fee2e2";
  pd.style.borderColor = "#dc2626";
  pd.innerHTML = `
    <div style="color:#991b1b;font-weight:800;font-size:16px;">
      ⛔ EVALUACIÓN BLOQUEADA: DIGITACIÓN BIOLÓGICAMENTE IMPOSIBLE
    </div>
    <div style="color:#7f1d1d;font-size:13px;margin-top:6px;text-align:left;">
      Corrija los campos señalados en rojo para habilitar el algoritmo de Triaje:
      <ul style="margin:4px 0 0 16px;">
        ${errores.map(e => `<li>${e}</li>`).join("")}
      </ul>
    </div>
  `;
}

function cargarPresetVitales(tipo) {
  const presets = {
    normal: { spo2: 98, fc: 72, pas: 120, pad: 80, fr: 16, temp: 36.6, glucosa: 95, glasgow: 15, eva: 0 },
    critico: { spo2: 84, fc: 142, pas: 75, pad: 45, fr: 34, temp: 39.8, glucosa: 48, glasgow: 8, eva: 9 },
    urgente: { spo2: 93, fc: 108, pas: 165, pad: 98, fr: 24, temp: 38.6, glucosa: 190, glasgow: 14, eva: 7 },
    paro: { spo2: 45, fc: 0, pas: 0, pad: 0, fr: 0, temp: 35.0, glucosa: 70, glasgow: 3, eva: 0 }
  };
  const d = presets[tipo] || presets.normal;
  const map = {
    spo2_full: d.spo2, fc_full: d.fc, pas_full: d.pas, pad_full: d.pad,
    fr_full: d.fr, temp_full: d.temp, glucosa_full: d.glucosa, glasgow_full: d.glasgow, eva_full: d.eva
  };
  for (const [id, val] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }
  actualizarEVA(d.eva);
  validarSignosVitalesEnVivo();
  recalcularPrioridad();
}

function syncEva(val) {
  actualizarEVA(val);
}

function recalcularPrioridad() {
  const validacion = validarSignosVitalesEnVivo();
  if (!validacion.esValido) {
    mostrarErrorBiologicoEnPrioridad(validacion.errores);
    return;
  }

  // Si se activó botón de pánico o signo de paro
  if (STATE.panicoShockTrauma || validacion.esParoOAgonia) {
    STATE.prioridad = "I";
    STATE.colorPrioridad = PRIORIDADES["I"].nombre;
    mostrarPrioridad("I");
    renderizarRutaClinica("I");
    const chipLive = document.getElementById("chipPrioLive");
    if (chipLive) {
      chipLive.textContent = "P-I ROJO (PARO / SHOCK TRAUMA)";
      chipLive.className = "top-prio-chip prio-I";
    }
    return;
  }

  // Leer valores
  const spo2 = parseFloat(document.getElementById("spo2_full")?.value) || null;
  const fc = parseFloat(document.getElementById("fc_full")?.value) || null;
  const pas = parseFloat(document.getElementById("pas_full")?.value) || null;
  const pad = parseFloat(document.getElementById("pad_full")?.value) || null;
  const fr = parseFloat(document.getElementById("fr_full")?.value) || null;
  const temp = parseFloat(document.getElementById("temp_full")?.value) || null;
  const glucosa = parseFloat(document.getElementById("glucosa_full")?.value) || null;
  const glasgow = parseFloat(document.getElementById("glasgow_full")?.value) || null;
  const eva = parseInt(document.getElementById("eva_full")?.value) || 0;
  const motivo = (document.getElementById("motivo_full")?.value || "").toLowerCase();

  const antCardio = document.getElementById("ant_cardio")?.checked || false;
  const antResp = document.getElementById("ant_resp")?.checked || false;
  const antDiab = document.getElementById("ant_diab")?.checked || false;
  const antNeuro = document.getElementById("ant_neuro")?.checked || false;
  const antecedentes = antCardio || antResp || antDiab || antNeuro;

  STATE.spo2 = spo2; STATE.fc = fc; STATE.pasSistolica = pas;
  STATE.paDiastolica = pad; STATE.fr = fr; STATE.temperatura = temp;
  STATE.glucosa = glucosa; STATE.glasgow = glasgow; STATE.eva = eva;
  STATE.antecedentes = antecedentes;
  STATE.motivoConsulta = document.getElementById("motivo_full")?.value || "";

  // Determinar Prioridad I a V según NTS N° 042-MINSA
  let prio = null;
  const tieneDatos = spo2 !== null || fc !== null || pas !== null || glasgow !== null;

  // Criterios Prioridad I — ROJO (Emergencia Vital con Riesgo Inminente)
  const esCritico = (
    (spo2 !== null && spo2 < 92) ||
    (fc !== null && (fc >= 130 || fc < 40)) ||
    (pas !== null && pas < 90) ||
    (pas !== null && pas >= 160 && (motivo.includes("torác") || motivo.includes("pecho") || STATE.codigoInfarto)) ||
    (glasgow !== null && glasgow <= 12) ||
    (glucosa !== null && glucosa < 54) ||
    (glucosa !== null && glucosa > 400 && glasgow !== null && glasgow < 15) ||
    STATE.codigoInfarto || STATE.codigoIctus || STATE.codigoSepsis ||
    (STATE.esGestante && (STATE.claveObstetrica === "roja" || STATE.claveObstetrica === "azul" || STATE.claveObstetrica === "amarilla")) ||
    (antecedentes && spo2 !== null && spo2 < 94) ||
    (antecedentes && fc !== null && fc > 110)
  );
  if (esCritico) { prio = "I"; }

  // Criterios Prioridad II — NARANJA (Urgencia Mayor)
  if (!prio) {
    const esUrgente = (
      eva >= 8 ||
      (fr !== null && fr > 25) ||
      (temp !== null && temp > 39.5) ||
      (spo2 !== null && spo2 >= 92 && spo2 < 95) ||
      (pas !== null && pas >= 160) ||
      (glucosa !== null && glucosa < 70) ||
      (glucosa !== null && glucosa > 300)
    );
    if (esUrgente) { prio = "II"; }
  }

  // Criterios Prioridad III — AMARILLO (Urgencia Menor / Moderada)
  if (!prio) {
    const esModerado = (
      (temp !== null && temp >= 38.0 && temp <= 39.5 && eva >= 4) ||
      (fc !== null && fc > 100 && fc <= 110) ||
      (fr !== null && fr > 20 && fr <= 25) ||
      (pas !== null && pas >= 140 && pas < 160) ||
      (pad !== null && pad >= 90 && pad < 100) ||
      (eva >= 4 && eva < 8) ||
      (antecedentes && eva >= 4) ||
      (motivo.includes("dolor") && eva >= 4)
    );
    if (esModerado) { prio = "III"; }
  }

  // Criterios Prioridad IV — VERDE (Urgencia Leve / Sin compromiso vital)
  if (!prio) {
    const esLeve = (
      (eva >= 2 && eva < 4) ||
      (temp !== null && temp >= 37.5 && temp < 38.5) ||
      motivo.includes("faringitis") || motivo.includes("resfrío") || motivo.includes("odinofagia") ||
      /\btos\b/i.test(motivo) || motivo.includes("garganta")
    );
    if (esLeve) { prio = "IV"; }
  }

  // Criterios Prioridad V — AZUL (No Urgencia / Ambulatorio / Procedimientos)
  if (!prio) {
    prio = (motivo.includes("retiro") || motivo.includes("punto") || motivo.includes("curacion") || motivo.includes("curación") || eva <= 1) ? "V" : "IV";
  }
  if (!tieneDatos && antecedentes) { prio = "I"; }

  STATE.prioridad = prio;
  STATE.colorPrioridad = PRIORIDADES[prio].nombre;

  mostrarPrioridad(prio);
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
}

function mostrarPrioridad(prio) {
  const pd = document.getElementById("prioridad_display");
  const def = PRIORIDADES[prio];
  pd.className = `prioridad-display visible prioridad-${prio}`;
  pd.style.background = "";
  pd.style.borderColor = "";
  pd.style.borderWidth = "";

  const seguro = String(STATE.tipoSeguro || "").trim().toLowerCase();
  const esEps = (STATE.esClinicaPrivada || seguro.includes("eps") || seguro.includes("privad") || 
                 seguro.includes("rimac") || seguro.includes("pacifico") || seguro.includes("pacífico") || 
                 seguro.includes("sanitas") || seguro.includes("mapfre") || seguro.includes("positiva"));
  const esEmergencia = (prio === "I" || prio === "II");

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

  // LÓGICA DE CATEGORIZACIÓN: EN CLÍNICA PRIVADA EPS, SI NO ES EMERGENCIA SE COLOCA AUTOMÁTICAMENTE COMO URGENCIA
  if (esEps && !esEmergencia) {
    document.getElementById("prio_tipo").textContent = "URGENCIA (Clínica Privada EPS)";
    document.getElementById("prio_tipo").style.color = "#ca8a04";
    document.getElementById("prio_desc").textContent = 
      "ATENCIÓN DE URGENCIA EN CLÍNICA PRIVADA EPS. Por normativa contractual de aseguradoras privadas EPS, al descartarse emergencia con riesgo vital o secuela inminente (P-I/II), la atención se clasifica AUTOMÁTICAMENTE COMO URGENCIA: Aplica cobro fijo de consulta de S/. 80.00 soles y coaseguro del 10% en medicamentos prescritos. Exámenes de laboratorio, imágenes diagnósticas y procedimientos cubiertos al 100% por la EPS.";
    document.getElementById("prio_destino").textContent = "Destino: Tópico de Urgencias EPS / Consulta Médica de Urgencia";
    document.getElementById("prio_destino").style.color = "#ca8a04";

    const topicoLbl = document.getElementById("topico_asignado_lbl");
    if (topicoLbl) topicoLbl.textContent = "Tópico de Urgencias Médicas (Clínica Privada EPS)";

    const chipLive = document.getElementById("chipPrioLive");
    if (chipLive) {
      chipLive.textContent = `URGENCIA EPS (P-${prio})`;
      chipLive.className = "top-prio-chip prio-III";
    }
  } else if (esEps && esEmergencia) {
    document.getElementById("prio_tipo").textContent = prio === "I" ? "EMERGENCIA VITAL (P-I EPS)" : "EMERGENCIA / URGENCIA MAYOR (P-II EPS)";
    document.getElementById("prio_tipo").style.color = def.hex;
    document.getElementById("prio_desc").textContent = 
      "EMERGENCIA MÉDICA EN CLÍNICA PRIVADA EPS (Ley N° 27604). Atención inmediata sin condicionamiento ni pago previo. Procedimientos críticos, tópicos, cama y exámenes auxiliares con costo S/. 0.00 para el paciente (asumidos al 100% por EPS). Medicamentos: paciente asume 10% de coaseguro.";
    document.getElementById("prio_destino").textContent = `Destino: ${def.destino}`;
    document.getElementById("prio_destino").style.color = def.hex;

    const topicoLbl = document.getElementById("topico_asignado_lbl");
    if (topicoLbl) topicoLbl.textContent = "Shock Trauma / Tópico Crítico (Clínica Privada EPS)";

    const chipLive = document.getElementById("chipPrioLive");
    if (chipLive) {
      chipLive.textContent = `EMERGENCIA EPS (P-${prio})`;
      chipLive.className = `top-prio-chip prio-${prio}`;
    }
  } else {
    // Régimen público estándar (MINSA / EsSalud / Particular)
    document.getElementById("prio_tipo").textContent = def.nombre;
    document.getElementById("prio_tipo").style.color = def.hex;
    document.getElementById("prio_desc").textContent = obtenerDescripcionPrioridad(prio);
    document.getElementById("prio_destino").textContent = `Destino: ${def.destino}`;
    document.getElementById("prio_destino").style.color = def.hex;

    const topicoLbl = document.getElementById("topico_asignado_lbl");
    if (topicoLbl) topicoLbl.textContent = def.destino;
  }

  // Ley 27604
  const ley = document.getElementById("ley27604_banner");
  if (ley) ley.classList.toggle("visible", prio === "I" || prio === "II");

  // Actualizar pipeline asistencial de 8 módulos y monitor dinámico de áreas
  actualizarPipelineFull(prio);

  // Cargar costos de triage
  registrarFacturaItem("Atención de Triaje Clínico", 30, "Triaje");
}

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
    elB5.textContent = STOCK_CAMAS["Trauma Shock"]?.disponible > 0 ? "1 Libre" : "Saturado";
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
        🪑 Tópico de Medicina (Vigilancia cada 30 min en Espera)
      </span>
      <span class="hospital-area-chip" style="background:#e0e7ff; border:1.5px solid #6366f1; color:#3730a3; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        💉 Enfermería Terapéutica (Vía Periférica & Hioscina/Metamizol EV)
      </span>
      <span class="hospital-area-chip" style="background:#f0fdf4; border:1.5px solid #22c55e; color:#15803d; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        🧪 Laboratorio Clínico Ambulatorio & Ecografía Abdominal
      </span>
      <span class="hospital-area-chip" style="background:#f0fdf4; border:1.5px solid #22c55e; color:#15803d; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        💊 Farmacia de Emergencia (Dispensación Receta Domicilio)
      </span>
      <span class="hospital-area-chip" style="background:#fef3c7; border:1.5px solid #f59e0b; color:#b45309; padding:5px 12px; border-radius:6px; font-weight:700; font-size:0.8rem;">
        🩺 Consulta Externa & Interconsulta REFCON (Gastroenterología)
      </span>
    `;
  }
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
  registrarTimestamp("M4_cama");
  avanzarRuta(1);
}


function liberarCama() {
  if (!STATE.camaAsignada) { alert("No hay cama asignada actualmente."); return; }
  const mapPrioACama = { "I": "Trauma Shock", "II": "Tópico Crítico", "III": "Observación", "IV": "Observación", "V": "Observación" };
  const tipoCama = mapPrioACama[STATE.prioridad] || "Observación";
  STOCK_CAMAS[tipoCama].disponible = Math.min(STOCK_CAMAS[tipoCama].disponible + 1, STOCK_CAMAS[tipoCama].total);
  STATE.camaAsignada = null;
  document.getElementById("camaAsignadaDisplay").style.display = "none";
  renderizarStockCamas();
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
  const labels = document.querySelectorAll("#farmaciaGrid label");
  labels.forEach(label => {
    const text = (label.textContent || "").toLowerCase();
    label.style.display = (!q || text.includes(q)) ? "flex" : "none";
  });
}


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
  const display = document.getElementById("salida_display");
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


  if (tipo === "Deceso — SINADEF") {
    display.innerHTML += `
      <div style="margin-top:10px;padding:10px;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;font-size:0.8rem;line-height:1.5;text-align:left;">
        <strong style="color:#0f172a;">⚖️ Protocolo Post-Mortem y Cobertura de Sepelio (Ley N° 26842 / Art. 114):</strong><br>
        • <strong>Si deudos reclaman el cuerpo:</strong> Acreditación con DNI original + Certificado SINADEF. Se activa póliza de sepelio según seguro acreditado (${STATE.tipoSeguro || "Registrado"}): EsSalud hasta S/. 2,070 (Formulario 1010), SIS PES hasta S/. 1,000, SOAT hasta 5 UIT (4 UIT muerte + 1 UIT entierro), o Particular con Servicio Social.<br>
        • <strong>Si NO reclaman el cuerpo (48-72h):</strong> Custodia en cámara frigorífica, notificación inmediata a PNP y Fiscalía de Turno, necropsia por IML y destino legal a Beneficencia (fosa común) o donación para docencia e investigación a Facultades de Medicina Humana.
      </div>
    `;
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
// 15. LIQUIDACIÓN Y FACTURACIÓN HOSPITALARIA CON REGLAS DE COBERTURA
// ---------------------------------------------------------------------------
function calcularLiquidacionSeguro() {
  const seguro = String(STATE.tipoSeguro || "").trim().toLowerCase();
  const esAccidente = STATE.esAccidenteTransito;
  const esFuga = STATE.soatVehiculoFuga;
  const totalBruto = STATE.items_factura.reduce((s, i) => s + (parseFloat(i.costo) || 0), 0);
  const subtotalFarmacia = STATE.items_factura
    .filter(i => (i.categoria || "").toLowerCase().includes("farmacia"))
    .reduce((s, i) => s + (parseFloat(i.costo) || 0), 0);
  const subtotalServicios = Math.max(0, totalBruto - subtotalFarmacia);
  const esEmergencia = (STATE.prioridad === "I" || STATE.prioridad === "II");
  const esUrgencia = !esEmergencia;

  let lugarAtencion = "Hospital Regional Docente UPP (Red Asistencial Pública / MINSA / EsSalud)";
  let coberturaSeguro = 0;
  let coaseguroFarmacia = 0;
  let copagoUrgencia = 0;
  let totalPaciente = 0;
  let motivoLiquidacion = "";
  let etiquetaRegimen = "";
  let coberturaSoatAplicada = 0;
  let saldoSoatRestante = STATE.soatTopeLegal;
  let esEpsPrivado = false;
  let esPublico = false;

  // ESCENARIO 1: Accidente de Tránsito con SOAT Activo (Placa identificada)
  if (esAccidente && !esFuga) {
    lugarAtencion = "Servicio de Emergencia Especializado SOAT — D.S. N° 024-2002-MTC";
    etiquetaRegimen = "🚗 SOAT Ley D.S. N° 024-2002-MTC (Tope 5 UIT = S/. 27,500)";
    const topeSoat = STATE.soatTopeLegal; // S/. 27,500.00
    if (totalBruto <= topeSoat) {
      coberturaSeguro = totalBruto;
      totalPaciente = 0.00; // PAGO CERO TOTAL
      coberturaSoatAplicada = totalBruto;
      saldoSoatRestante = topeSoat - totalBruto;
      motivoLiquidacion = `COBERTURA TOTAL POR SOAT ACTIVO (D.S. N° 024-2002-MTC). Póliza ${STATE.soatPoliza || 'Vigente'} de ${STATE.soatAseguradora || 'Aseguradora'} (Placa: ${STATE.soatPlaca || 'Identificada'}). Total facturado S/. ${totalBruto.toFixed(2)} cubierto al 100% dentro del tope legal de 5 UIT (S/. 27,500.00). Saldo SOAT remanente disponible: S/. ${saldoSoatRestante.toFixed(2)}. Paciente paga: S/. 0.00.`;
    } else {
      coberturaSeguro = topeSoat;
      totalPaciente = totalBruto - topeSoat;
      coberturaSoatAplicada = topeSoat;
      saldoSoatRestante = 0.00;
      motivoLiquidacion = `TOPE SOAT AGOTADO (5 UIT = S/. 27,500.00). El SOAT cubrió el límite legal máximo de S/. 27,500.00. El excedente acumulado de S/. ${totalPaciente.toFixed(2)} pasa a responsabilidad del paciente o seguro complementario.`;
    }
  }
  // ESCENARIO 2: Accidente de Tránsito con Chofer en Fuga (Sin Placa)
  else if (esAccidente && esFuga) {
    lugarAtencion = "Servicio de Emergencia — Accidente de Tránsito Chofer en Fuga (Art. 31 D.S. 024-2002-MTC)";
    etiquetaRegimen = "🚨 Chofer en Fuga (Art. 31 D.S. 024-2002-MTC / Cobro Particular)";
    coberturaSeguro = 0.00;
    coaseguroFarmacia = subtotalFarmacia;
    copagoUrgencia = 0.00;
    totalPaciente = totalBruto; // Paciente paga el 100%
    motivoLiquidacion = "VEHÍCULO EN FUGA / NO IDENTIFICADO (Art. 31 D.S. N° 024-2002-MTC). Al no existir placa o póliza identificada en el punto de atención, no aplica débito directo a aseguradora privada. La totalidad de la cuenta es asumida temporalmente por el paciente o sus familiares, con expedición de comprobante y peritaje oficial para su posterior reembolso ante el Fondo de Compensación del SOAT (FONSAT/MTC).";
  }
  // ESCENARIO 3: MINSA con SIS Activo
  else if (seguro.includes("sis") || seguro.includes("minsa")) {
    esPublico = true;
    lugarAtencion = "Hospital Regional Docente UPP (Red Asistencial MINSA)";
    etiquetaRegimen = "SIS Gratuito Integral (MINSA / FUA Ley N° 27604)";
    coberturaSeguro = totalBruto;
    coaseguroFarmacia = 0.00;
    copagoUrgencia = 0.00;
    totalPaciente = 0.00; // PAGO CERO TOTAL
    motivoLiquidacion = "COBERTURA TOTAL INTEGRAL 100% (SIS - PAGO CERO). Paciente acreditado en SIS Gratuito. Todos los conceptos (consulta, procedimientos, cama, farmacia, imágenes y laboratorio) están 100% financiados por el Estado mediante Formato Único de Atención (FUA). Paciente paga: S/. 0.00.";
  }
  // ESCENARIO 4: EsSalud con EsSalud Activo
  else if (seguro.includes("essalud")) {
    esPublico = true;
    lugarAtencion = "Red Prestacional EsSalud (Seguro Social de Salud del Perú)";
    etiquetaRegimen = "EsSalud (Asegurado Titular / Derechohabiente ESSI)";
    coberturaSeguro = totalBruto;
    coaseguroFarmacia = 0.00;
    copagoUrgencia = 0.00;
    totalPaciente = 0.00; // PAGO CERO TOTAL
    motivoLiquidacion = "COBERTURA TOTAL INTEGRAL 100% (EsSalud - PAGO CERO). Paciente cuenta con acreditación regular vigente en el sistema ESSI de EsSalud. La institución asume la totalidad de la atención de emergencia, estancia, medicamentos e insumos. Paciente paga: S/. 0.00.";
  }
  // ESCENARIO 5: Seguro Privado o EPS (Clínica Privada)
  else if (STATE.esClinicaPrivada || seguro.includes("eps") || seguro.includes("privad") || 
           seguro.includes("rimac") || seguro.includes("pacifico") || seguro.includes("pacífico") || 
           seguro.includes("sanitas") || seguro.includes("mapfre") || seguro.includes("positiva")) {
    esEpsPrivado = true;
    lugarAtencion = "Clínica Privada Especializada (Red Prestacional Privada EPS)";
    if (esEmergencia) {
      // 5A: Emergencia Médica (P-I o P-II): Cobro S/. 0.00 en consulta/cama/lab/procedimientos, Farmacia paga 10% coaseguro
      copagoUrgencia = 0.00;
      coaseguroFarmacia = subtotalFarmacia * 0.10;
      coberturaSeguro = subtotalServicios + (subtotalFarmacia * 0.90);
      totalPaciente = coaseguroFarmacia;
      etiquetaRegimen = "Clínica Privada EPS · Emergencia Médica (P-I / P-II)";
      motivoLiquidacion = "EMERGENCIA MÉDICA EN CLÍNICA PRIVADA EPS (P-I / P-II). Conforme a la Ley N° 27604, la atención médica de emergencia, procedimientos críticos, tópicos, cama y exámenes auxiliares de laboratorio e imágenes tienen costo S/. 0.00 para el asegurado (100% asumido por la EPS). En la receta médica de farmacia, el paciente asume únicamente el 10% del total de medicamentos como coaseguro.";
    } else {
      // 5B: No es Emergencia -> AUTOMÁTICAMENTE URGENCIA (P-III, IV, V):
      // Consulta fija de S/. 80.00 + 10% del total de medicamentos. Exámenes y servicios cubiertos al 100% por EPS.
      copagoUrgencia = 80.00;
      coaseguroFarmacia = subtotalFarmacia * 0.10;
      totalPaciente = copagoUrgencia + coaseguroFarmacia;
      coberturaSeguro = subtotalServicios + (subtotalFarmacia * 0.90);
      etiquetaRegimen = "Clínica Privada EPS · Consulta de Urgencia (P-III / IV / V)";
      motivoLiquidacion = "ATENCIÓN DE URGENCIA EN CLÍNICA PRIVADA EPS. Al descartarse emergencia con riesgo vital (P-I/II), la atención se clasifica AUTOMÁTICAMENTE COMO URGENCIA conforme a la póliza privada. Aplica cobro fijo de consulta de S/. 80.00 soles. En la receta médica de farmacia, el paciente asume únicamente el 10% del total de medicamentos (coaseguro). Los exámenes de laboratorio, imágenes diagnósticas, procedimientos y estancia están cubiertos al 100% por la aseguradora EPS.";
    }
  }
  // ESCENARIO 6: Sin Cobertura / Particular
  else {
    lugarAtencion = "Hospital Regional Docente UPP — Atención Particular";
    etiquetaRegimen = "Particular (Sin Cobertura Activa)";
    coberturaSeguro = 0.00;
    coaseguroFarmacia = subtotalFarmacia;
    copagoUrgencia = 0.00;
    totalPaciente = totalBruto;
    etiquetaRegimen = "Particular (Sin Cobertura Activa — Cobro al 100%)";
    motivoLiquidacion = "PACIENTE PARTICULAR / SIN NINGÚN SEGURO ACTIVO. No registra afiliación en SIS, EsSalud ni aseguradoras privadas EPS. En todos los casos, el paciente asume el 100% de la totalidad de lo facturado (consulta médica, tópicos, cama, medicamentos de farmacia, exámenes analíticos de laboratorio y radiología diagnóstica). Cobertura asumida por aseguradora: S/. 0.00.";
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
    copagoUrgencia,
    totalPaciente,
    motivoLiquidacion,
    etiquetaRegimen,
    esEmergencia,
    esUrgencia,
    esEpsPrivado,
    esPublico,
    coberturaSoatAplicada,
    saldoSoatRestante
  };
}

function actualizarFactura() {
  const container = document.getElementById("factura_items");
  const totalEl = document.getElementById("factura_total_num");
  const miniEl = document.getElementById("factura_total_mini");
  const leyBanner = document.getElementById("factura_ley27604");

  const liq = calcularLiquidacionSeguro();
  // Sincronizar estado completo para el portal especializado facturacion.html
  try {
    localStorage.setItem("UPP_ITEMS_FACTURA", JSON.stringify(STATE.items_factura || []));
    localStorage.setItem("UPP_TIPO_SEGURO", STATE.tipoSeguro || "Particular");
    localStorage.setItem("UPP_PACIENTE_NOMBRE", STATE.nombreReniec || STATE.identificador || "Paciente");
    localStorage.setItem("UPP_PACIENTE_DNI", STATE.numDni || "");
    localStorage.setItem("UPP_PACIENTE_HC", STATE.historiaClinica || "");
    localStorage.setItem("UPP_PRIORIDAD", STATE.prioridad || "II");
    localStorage.setItem("UPP_ES_SOAT", STATE.esAccidenteTransito ? "true" : "false");
    localStorage.setItem("UPP_SOAT_FUGA", STATE.soatVehiculoFuga ? "true" : "false");
  } catch(e) {}

  // Actualizar resumen clínico de Módulo 8
  const m8Nom = document.getElementById("m8_disp_nombre");
  if (m8Nom) m8Nom.textContent = STATE.nombreReniec || STATE.identificador || "Paciente en Atención";
  const m8Hc = document.getElementById("m8_disp_hc");
  if (m8Hc) m8Hc.textContent = STATE.historiaClinica || "HC-2026-—";
  const m8Prio = document.getElementById("m8_disp_prio");
  if (m8Prio) m8Prio.textContent = STATE.prioridad ? `Prioridad ${STATE.prioridad}` : "Por evaluar";
  const m8Seg = document.getElementById("m8_disp_seguro");
  if (m8Seg) m8Seg.textContent = STATE.tipoSeguro ? STATE.tipoSeguro.toUpperCase() : "Sin acreditar";


  // Actualizar acumulador en Top Steps Navbar
  const navMontoEl = document.getElementById("navFacturaMonto");
  if (navMontoEl) {
    navMontoEl.textContent = `S/. ${liq.totalPaciente.toFixed(2)}`;
  }

  // Actualizar medidor SOAT
  actualizarMedidorSoat(liq);

  if (!container) return;

  if (STATE.items_factura.length === 0 && liq.copagoUrgencia === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:32px 16px;color:#94a3b8;">
        <span style="font-size:36px;display:block;margin-bottom:8px;">🧾</span>
        <strong>Sin cargos clínicos activos en la cuenta.</strong>
        <p style="font-size:12px;margin-top:4px;">Los medicamentos administrados en Kardex y procedimientos se liquidarán acumulativamente aquí.</p>
      </div>
    `;
    if (totalEl) totalEl.textContent = "0.00";
    if (miniEl) miniEl.textContent = "S/. 0.00";
    const detalleEl = document.getElementById("liquidacion_detalle_box");
    if (detalleEl) detalleEl.innerHTML = "";
    return;
  }

  // Renderizar items facturados con desglose de cobertura
  let html = `<table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left;">
    <thead>
      <tr style="background:#f1f5f9;color:#475569;border-bottom:2px solid #cbd5e1;">
        <th style="padding:10px 12px;">Concepto Asistencial</th>
        <th style="padding:10px 12px;width:130px;">Servicio</th>
        <th style="padding:10px 12px;width:95px;text-align:right;">Subtotal</th>
        <th style="padding:10px 12px;width:125px;text-align:right;">Cargo Paciente</th>
      </tr>
    </thead>
    <tbody>`;

  // Si aplica Copago Consulta de Urgencia (S/. 80.00 en Clínica Privada EPS)
  if (liq.copagoUrgencia > 0) {
    html += `
      <tr style="border-bottom:1px solid #cbd5e1; background:#f0fdf4;">
        <td style="padding:9px 12px;font-weight:700;color:#166534;">
          🩺 Consulta Médica de Urgencia (Clínica Privada EPS)
          <div style="font-size:11px;color:#15803d;font-weight:normal;">Tarifa fija por atención ambulatoria de urgencia (P-III, IV, V)</div>
        </td>
        <td style="padding:9px 12px;color:#166534;font-size:12px;">
          <span style="background:#dcfce7;padding:2px 8px;border-radius:4px;font-weight:700;">Consulta / Urgencias</span>
        </td>
        <td style="padding:9px 12px;text-align:right;color:#64748b;font-size:12px;">S/. 80.00</td>
        <td style="padding:9px 12px;text-align:right;font-weight:800;color:#166534;">S/. 80.00</td>
      </tr>`;
  }

  STATE.items_factura.forEach(item => {
    const esFar = (item.categoria || "").toLowerCase().includes("farmacia");
    let cargoPac = parseFloat(item.costo) || 0;
    let badgeCobertura = "";

    if (liq.esEpsPrivado) {
      if (esFar) {
        cargoPac = (parseFloat(item.costo) || 0) * 0.10;
        badgeCobertura = `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">Coaseguro 10% (EPS cubre 90%)</span>`;
      } else {
        cargoPac = 0.00;
        badgeCobertura = `<span style="background:#dcfce7;color:#15803d;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">Cubierto 100% EPS</span>`;
      }
    } else if (liq.esPublico) {
      cargoPac = 0.00;
      badgeCobertura = `<span style="background:#dcfce7;color:#15803d;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">Cubierto 100% (Pago Cero)</span>`;
    } else if (STATE.esAccidenteTransito && !STATE.soatVehiculoFuga) {
      cargoPac = 0.00;
      badgeCobertura = `<span style="background:#ffedd5;color:#9a3412;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">Cubierto por SOAT (5 UIT)</span>`;
    } else if (STATE.esAccidenteTransito && STATE.soatVehiculoFuga) {
      cargoPac = parseFloat(item.costo) || 0;
      badgeCobertura = `<span style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">🚨 Sin Placa / Cargo 100%</span>`;
    }

    html += `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 12px;font-weight:600;color:#1e293b;">
          ${item.nombre}
          ${badgeCobertura ? `<div style="margin-top:2px;">${badgeCobertura}</div>` : ''}
        </td>
        <td style="padding:8px 12px;color:#64748b;font-size:12px;">
          <span style="background:#f8fafc;padding:2px 6px;border-radius:4px;border:1px solid #e2e8f0;">${item.categoria || 'Clínica'}</span>
        </td>
        <td style="padding:8px 12px;text-align:right;color:#64748b;font-size:12px;">S/. ${(parseFloat(item.costo)||0).toFixed(2)}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:${cargoPac === 0 ? '#16a34a' : '#0f172a'};">
          ${cargoPac === 0 ? 'S/. 0.00' : `S/. ${cargoPac.toFixed(2)}`}
        </td>
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
    const totalBrutoGenerado = liq.totalBruto + liq.copagoUrgencia;
    detalleEl.innerHTML = `
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:14px;margin-top:14px;font-size:13px;">
        <div style="font-weight:800;color:#0f172a;margin-bottom:8px;font-size:14px;">📊 Desglose de Auditoría Financiera — Ley N° 29414 (SUSALUD)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:10px;">
          <div><span style="color:#64748b;">Régimen / Establecimiento:</span> <strong>${liq.etiquetaRegimen}</strong></div>
          <div><span style="color:#64748b;">Total Bruto Generado:</span> <strong>S/. ${totalBrutoGenerado.toFixed(2)}</strong></div>
          <div><span style="color:#64748b;">Cobertura Aseguradora:</span> <strong style="color:#15803d;">S/. ${liq.coberturaSeguro.toFixed(2)}</strong></div>
          <div><span style="color:#64748b;">Total a Pagar Paciente:</span> <strong style="color:#0284c7;font-size:16px;">S/. ${liq.totalPaciente.toFixed(2)}</strong></div>
        </div>
        ${liq.esEpsPrivado ? `
          <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:6px;padding:10px 14px;margin-bottom:10px;font-size:12px;color:#166534;line-height:1.5;">
            <strong style="display:block;margin-bottom:4px;font-size:13px;">🏢 Liquidación Detallada en Clínica Privada EPS:</strong>
            • <strong>Copago Fijo de Consulta Urgencia:</strong> S/. ${liq.copagoUrgencia.toFixed(2)}<br>
            • <strong>Farmacia (Medicamentos Prescritos):</strong> Total S/. ${liq.subtotalFarmacia.toFixed(2)} ➔ Paciente paga 10% coaseguro (<strong>S/. ${liq.coaseguroFarmacia.toFixed(2)}</strong>) | Aseguradora EPS cubre 90% (S/. ${(liq.subtotalFarmacia * 0.90).toFixed(2)})<br>
            • <strong>Servicios Clínicos, Procedimientos y Exámenes:</strong> Total S/. ${liq.subtotalServicios.toFixed(2)} ➔ Aseguradora EPS cubre 100% (S/. ${liq.subtotalServicios.toFixed(2)}) | Paciente paga <strong>S/. 0.00</strong><br>
            • <strong>TOTAL NETO A PAGAR PACIENTE:</strong> <strong>S/. ${liq.totalPaciente.toFixed(2)}</strong>
          </div>
        ` : ''}
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
  if (!STATE.identificador || STATE.identificador.length < 2) {
    alert("⚠️ Por favor ingrese o seleccione un paciente antes de grabar la atención.");
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
    </div>
    <div style="text-align:center;font-size:0.75rem;color:#64748b;">
      ✓ Atención registrada y acumulada con éxito en la Historia Clínica <strong>${ep.historia_clinica}</strong>.
    </div>
  `;
  modal.classList.add("open"); modal.classList.add("show"); modal.style.setProperty("display", "flex", "important");
}
function resetSimulador() {
  if (!confirm("¿Iniciar nuevo paciente? Se perderán los datos actuales.")) return;


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
  document.getElementById("alerta_nn").classList.remove("visible");
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
    targetBody.style.display = "";
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


function moduloSiguiente() {
  if (moduloActivoActual < 8) {
    irAModulo(moduloActivoActual + 1);
  }
}


// Inicializar en Módulo 1 en el primer render
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    irAModulo(1);
  }, 100);
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

  PACIENTES_COLA.push(pxST);
  pacienteActivoId = pxST.id;

  // 2. Configurar STATE
  limpiarFormularioCompletoState();
  STATE.panicoShockTrauma = true;
  STATE.prioridad = "I";
  STATE.colorPrioridad = "ROJO";
  STATE.identificador = idEmergencia;
  STATE.nombreReniec = nombreCritico;
  STATE.historiaClinica = hcEmergencia;
  STATE.camaAsignada = "Shock Trauma ST-01";
  STATE.camaAsignadaId = "ST-01";
  STATE.tipoSeguro = "SIS Gratuito";
  STATE.grupoSanguineo = "Desconocido";
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
  }

  // 3. Sincronizar DOM
  const elIdent = document.getElementById("ident_full");
  if (elIdent) elIdent.value = idEmergencia;
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = "Paro Cardiorrespiratorio / Shock Circulatorio Extremo (P-I)";
  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = "Desconocido";
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

  mostrarPrioridad("I", {
    tipo: "Prioridad I — ROJO (Resucitación / Shock Trauma)",
    desc: "Ingreso directo a Shock Trauma ST-01 activado. Trámites y origen omitidos por premura asistencial.",
    destino: "Shock Trauma ST-01"
  });

  renderizarTableroColaPacientes();
  mostrarToastCola(`🚨 <strong>Ingreso Directo a Shock Trauma:</strong> Asignado en atención inmediata en el Tablero.`);

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
    if (miniSoatBadge) miniSoatBadge.style.display = "none";

    STATE.soatPlaca = "NO IDENTIFICADO (SIN PLACA)";
    STATE.tipoSeguro = "Particular (Accidente de Tránsito sin Placa / En Fuga)";
  } else {
    if (rbIdent) rbIdent.checked = true;
    if (rbFuga) rbFuga.checked = false;
    if (boxCampos) boxCampos.style.display = "grid";
    if (meterCard) meterCard.style.display = "block";
    if (boxFugaAlert) boxFugaAlert.style.display = "none";
    if (navSoatBadge) navSoatBadge.style.display = "inline-flex";
    if (miniSoatBadge) miniSoatBadge.style.display = "inline-flex";

    STATE.tipoSeguro = "SOAT";
  }

  actualizarFactura();
}


// --- MÓDULO 4: MÉDICO Y KARDEX DE ENFERMERÍA ---
function seleccionarCIE10(codigo, desc) {
  STATE.cie10Codigo = codigo;
  STATE.cie10Descripcion = desc;
  const input = document.getElementById("cie10_input");
  if (input) input.value = `${codigo} - ${desc}`;
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
    motivo: "Apendicectomía / Colecistitis Aguda Complicada",
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
    motivo: "Monitoreo Clínico Seriado y Reevaluación",
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
  }
};

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
  actualizarWidgetFlotanteCamas();
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
  const idObsActiva = STATE.camaAsignadaId && RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId] ? STATE.camaAsignadaId : "OBS-01";
  const recObs = RECURSOS_HOSPITALARIOS[idObsActiva];

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
}


// ==============================================================================
// GESTIÓN DEL BOTÓN FLOTANTE HUD DE DISPONIBILIDAD HOSPITALARIA
// Permite ver en todo momento las camas libres desglosadas por tipo mientras se navega
// ==============================================================================
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
    elTotal.textContent = `${counts.total.disponible}/${counts.total.total} LIBRES`;
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


// RENDERIZADO DEL TABLERO EN MÓDULO 6 Y EN EL MODAL FLOTANTE
function renderizarTableroCamasYQuirofanos(filtro = null, targetContainerId = "camas_stock_grid") {
  if (filtro) filtroRecursoActivo = filtro;
  const f = filtroRecursoActivo || "todos";

  const container = document.getElementById(targetContainerId);
  if (!container) return;

  let html = "";

  const ORDEN_PRIORIDAD_TIPOS = {
    "shock_trauma": 1,
    "quirofano": 2,
    "uci": 3,
    "observacion": 4,
    "urpa": 5
  };

  const listaOrdenada = Object.values(RECURSOS_HOSPITALARIOS).sort((a, b) => {
    const ordenA = ORDEN_PRIORIDAD_TIPOS[a.tipo] || 99;
    const ordenB = ORDEN_PRIORIDAD_TIPOS[b.tipo] || 99;
    if (ordenA !== ordenB) return ordenA - ordenB;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });

  for (const rec of listaOrdenada) {
    const id = rec.id;

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
function asignarPacienteActualARecurso(idRecurso, duracionManual = null, motivoManual = null) {
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

  alert(`✅ ASIGNACIÓN CONFIRMADA:

${rec.nombre}
Paciente: ${rec.paciente.nombre}
Estancia programada: ${horas} horas (${rec.norma})

El contador en tiempo real ha iniciado.`);
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
    alert(`🚨 ALERTA CRÍTICA DE AUDITORÍA (NTS N° 042-MINSA):

La cama ${rec.nombre} ha acumulado ${rec.duracionHoras} horas en observación.
Supera el límite legal de 24 horas. Es obligatorio tramitar internamiento en hospitalización o activar derivación REFCON.`);
  } else if (rec.duracionHoras > 12) {
    alert(`⚠️ ADVERTENCIA NORMATIVA (NTS N° 042-MINSA):

La estancia acumulada de ${rec.nombre} ha alcanzado ${rec.duracionHoras} horas (supera las 12 horas estándar).
Se requiere consignar la nota médica de evolución en la historia clínica.`);
  } else {
    alert(`⏱️ Ampliación de Observación Confirmada:

Se añadieron +${h} horas a la cama ${rec.nombre}.
Nuevo tiempo total de permanencia: ${rec.duracionHoras} horas.
Motivo: ${motivoClinico}.`);
  }

  // Refrescar cronómetro al instante
  autoGuardarCambioEnHistoriaClinica(`Ampliación +${h}h en ${rec.nombre}`);
  tickCronometrosCamas();
  renderizarTableroCamasYQuirofanos();
  if (document.getElementById("modalTableroCamasOverlay")?.classList.contains("open")) {
    renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
  }
}

// LIBERACIÓN MANUAL O POR ALTA
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

  autoGuardarCambioEnHistoriaClinica(`Ampliación +${h}h en ${rec.nombre}`);
  tickCronometrosCamas();
  renderizarTableroCamasYQuirofanos();
  if (document.getElementById("modalTableroCamasOverlay")?.classList.contains("open")) {
    renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
  }
  autoGuardarCambioEnHistoriaClinica(`Liberación de ${rec.nombre}`);
  renderizarMonitorObservacionModulo5();

  alert(`🔓 RECURSO LIBERADO:

${rec.nombre} ha quedado libre.
Motivo: ${motivoSalida} de ${pacienteNombre}.
La cama se encuentra disponible para nueva asignación.`);
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

  autoGuardarCambioEnHistoriaClinica(`Ampliación +${h}h en ${rec.nombre}`);
  tickCronometrosCamas();
  renderizarTableroCamasYQuirofanos();
  if (document.getElementById("modalTableroCamasOverlay")?.classList.contains("open")) {
    renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
  }
  renderizarMonitorObservacionModulo5();

  alert(`⏰ TIEMPO DE OBSERVACIÓN COMPLETADO:

La cama ${rec.nombre} ha cumplido sus ${horasTot} horas de estancia programada para el paciente ${nombrePac}.

✅ La cama ha sido liberada automáticamente conforme a la NTS N° 042-MINSA y se encuentra disponible para admisión.`);
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
  const idObs = STATE.camaAsignadaId && RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId] ? STATE.camaAsignadaId : null;
  const rec = idObs ? RECURSOS_HOSPITALARIOS[idObs] : null;

  const elNom = document.getElementById("lbl_m5_cama_nombre");
  const elEstado = document.getElementById("lbl_m5_cama_estado");
  const elPac = document.getElementById("lbl_m5_paciente_info");
  const elTotalInfo = document.getElementById("lbl_m5_tiempo_total_info");
  const elTiempoM5 = document.getElementById("lbl_m5_tiempo_restante");
  const elBarM5 = document.getElementById("bar_m5_progreso_estancia");
  const elBadgeEstancia = document.getElementById("estancia_estado_badge");

  if (!rec || rec.estado !== "ocupada") {
    if (elNom) elNom.textContent = "🛏️ Ninguna cama asignada";
    if (elEstado) {
      elEstado.textContent = "DISPONIBLE";
      elEstado.style.background = "#f1f5f9";
      elEstado.style.color = "#475569";
    }
    if (elPac) elPac.textContent = "Complete la admisión y asigne una cama en el Módulo 4, 5 o 6 para iniciar el monitoreo.";
    if (elTotalInfo) elTotalInfo.textContent = "(Sin cama asignada)";
    if (elTiempoM5) {
      elTiempoM5.textContent = "--:--:--";
      elTiempoM5.style.color = "#64748b";
    }
    if (elBarM5) elBarM5.style.width = "0%";
    if (elBadgeEstancia) {
      elBadgeEstancia.textContent = "En espera de paciente";
      elBadgeEstancia.className = "estancia-badge estancia-verde";
    }
    return;
  }

  if (elNom) elNom.textContent = `🛏️ ${rec.nombre}`;

  if (elEstado) {
    elEstado.textContent = rec.estado === "ocupada" ? "OCUPADA" : "DISPONIBLE";
    elEstado.style.background = rec.estado === "ocupada" ? "#fee2e2" : "#dcfce7";
    elEstado.style.color = rec.estado === "ocupada" ? "#991b1b" : "#15803d";
  }

  if (elPac) {
    if (rec.estado === "ocupada" && rec.paciente) {
      elPac.textContent = `Paciente: ${rec.paciente.nombre} (DNI ${rec.paciente.dni}) | Diagnóstico: ${rec.paciente.diagnostico}`;
    } else {
      elPac.textContent = "Sin paciente actualmente. Cama libre para asignación.";
    }
  }

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
    alert(`⏱️ Norma clínica aplicada a ${rec.nombre}:
${motivo}
Estancia fijada en ${horas} horas.`);
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
    alert("🩺 Paciente estabilizado favorablemente. Pasando al Módulo 7 para generar Epicrisis y Alta Médica Definitiva.");
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
  alert("⚠️ PROTOCOLO DE CONTINGENCIA ACTIVADO: BOARDING CRÍTICO EN SALA DE OBSERVACIÓN (NTS N° 042-MINSA).\n\n" +
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
      <div style="margin-top:40px;display:flex;justify-content:space-between;text-align:center;">
        <div style="border-top:1px solid #000;width:220px;padding-top:4px;">Firma y Sello Médico Tratante<br>CMP / RNE</div>
        <div style="border-top:1px solid #000;width:220px;padding-top:4px;">Firma del Paciente / Familiar<br>Conformidad de Alta</div>
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
        <div style="border-top:1px solid #000;width:200px;padding-top:4px;">Médico de Ambulancia / Traslado</div>
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
  let idx = 1;

  if (liq.copagoUrgencia > 0) {
    itemsHtml += `
      <tr style="background:#f0fdf4;">
        <td style="border:1px solid #cbd5e1;padding:6px 10px;">${idx++}</td>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;font-weight:700;color:#166534;">Consulta Médica de Urgencia (Clínica Privada EPS)</td>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;">Consulta / Urgencias</td>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;font-weight:700;">S/. 80.00</td>
      </tr>
    `;
  }

  STATE.items_factura.forEach((item) => {
    const esFar = (item.categoria || "").toLowerCase().includes("farmacia");
    let detalleNota = "";
    if (liq.esEpsPrivado) {
      detalleNota = esFar ? " (Coaseguro 10%)" : " (Cubierto 100% EPS)";
    }
    itemsHtml += `
      <tr>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;">${idx++}</td>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;font-weight:600;">${item.nombre}${detalleNota}</td>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;">${item.categoria || 'Clínica'}</td>
        <td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;">S/. ${(parseFloat(item.costo)||0).toFixed(2)}</td>
      </tr>
    `;
  });

  const totalBrutoGenerado = liq.totalBruto + liq.copagoUrgencia;

  w.document.write(`
    <html><head><title>Liquidación Hospitalaria Oficial - Ley N° 29414</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;font-size:12px;line-height:1.4;}table{width:100%;border-collapse:collapse;margin-top:12px;}th{background:#f1f5f9;border:1px solid #cbd5e1;padding:8px 10px;text-align:left;}</style>
    </head><body>
      <h2 style="margin:0;color:#0f172a;">${liq.lugarAtencion} — COMPROBANTE DE LIQUIDACIÓN DE ATENCIÓN</h2>
      <h4 style="margin:0 0 10px 0;color:#475569;">AUDITORÍA FINANCIERA Y TRANSPARENCIA ASISTENCIAL (LEY N° 29414 - SUSALUD)</h4>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px;border-radius:6px;">
        <strong>Paciente:</strong> ${nombre} | <strong>Identificador:</strong> ${STATE.identificador || "—"} | <strong>HC:</strong> ${STATE.historiaClinica || "—"}<br>
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
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Total Bruto Facturado:</span><strong>S/. ${totalBrutoGenerado.toFixed(2)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#15803d;"><span>Cobertura Asumida por Aseguradora:</span><strong>- S/. ${liq.coberturaSeguro.toFixed(2)}</strong></div>
        <div style="display:flex;justify-content:space-between;border-top:2px solid #0f172a;padding-top:6px;font-size:15px;color:#0f172a;"><span>TOTAL NETO A PAGAR PACIENTE:</span><strong>S/. ${liq.totalPaciente.toFixed(2)}</strong></div>
        <div style="font-size:11px;color:#475569;margin-top:8px;"><strong>Fundamento Auditoría:</strong> ${liq.motivoLiquidacion}</div>
      </div>
      <div style="margin-top:50px;display:flex;justify-content:space-between;text-align:center;">
        <div style="border-top:1px solid #000;width:220px;padding-top:4px;">Cuentas Corrientes y Facturación</div>
        <div style="border-top:1px solid #000;width:220px;padding-top:4px;">Auditoría Médica Especializada</div>
      </div>
    </body></html>
  `);
  w.document.close();
  w.print();
}

// Exportar globalmente al objeto window para máxima compatibilidad
window.seleccionarEntornoEstablecimiento = seleccionarEntornoEstablecimiento;
window.seleccionarRegimenSeguroDirecto = seleccionarRegimenSeguroDirecto;
window.cambiarOrigenEvento = cambiarOrigenEvento;
window.activarPanicoShockTrauma = activarPanicoShockTrauma;
window.actualizarEVA = actualizarEVA;
window.toggleCodigoTiempo = toggleCodigoTiempo;
window.toggleGestante = toggleGestante;
window.togglePediatrico = togglePediatrico;
window.consultarSoatApeseg = consultarSoatApeseg;
window.cambiarOpcionSoat = cambiarOpcionSoat;
window.actualizarMedidorSoat = actualizarMedidorSoat;
window.seleccionarCIE10 = seleccionarCIE10;
window.abrirCatalogoRapidoKardex = abrirCatalogoRapidoKardex;
window.administrarKardexItem = administrarKardexItem;
window.seleccionarDestinoPostTopico = seleccionarDestinoPostTopico;
window.actualizarEstanciaObservacion = actualizarEstanciaObservacion;
window.setEstanciaHoras = setEstanciaHoras;
window.calcularBalanceHidrico = calcularBalanceHidrico;
window.decisionObservacion = decisionObservacion;
window.actualizarPrioridadUCI = actualizarPrioridadUCI;
window.calcularPuntajePrelacionABCDE = calcularPuntajePrelacionABCDE;
window.activarBoardingCritico = activarBoardingCritico;
window.seleccionarModalidadEgreso = seleccionarModalidadEgreso;
window.verificarCandadoLegalSinadef = verificarCandadoLegalSinadef;
window.imprimirEpicrisisReceta = imprimirEpicrisisReceta;
window.imprimirFormatoRefcon = imprimirFormatoRefcon;
window.imprimirActaAltaVoluntaria = imprimirActaAltaVoluntaria;
window.imprimirCertificadoSinadef = imprimirCertificadoSinadef;
window.imprimirOficioFiscaliaLevantamiento = imprimirOficioFiscaliaLevantamiento;
window.imprimirFacturaOficial = imprimirFacturaOficial;


// ==============================================================================
// 24. GESTIÓN INTEGRAL DE MÓDULO 4: MÉDICO, KARDEX, LABORATORIO E IMÁGENES
// ==============================================================================

// A. ASIGNACIÓN DE MÉDICO DE GUARDIA SEGÚN DISPONIBILIDAD Y ESPECIALIDAD
function asignarMedicoDisponible() {
  const select = document.getElementById("medico_responsable_select");
  if (!select) return;

  // Lógica clínica inteligente de asignación según el motivo y contexto del paciente:
  let indexAsignado = 0; // Default: Médico 1 (Emergenciólogo)

  const edadNum = parseInt(STATE.edad || document.getElementById("edad_full")?.value) || 30;
  const motivo = (STATE.motivoConsulta || document.getElementById("motivo_full")?.value || "").toLowerCase();

  if (STATE.esPediatrico || edadNum < 14) {
    indexAsignado = 3; // Médico 4: Pediatra de Turno
  } else if (STATE.esGestante || (STATE.claveObstetrica && STATE.claveObstetrica !== "ninguna")) {
    indexAsignado = 4; // Médico 5: Ginecólogo Obstetra
  } else if (STATE.esAccidenteTransito || motivo.includes("fractura") || motivo.includes("trauma") || motivo.includes("caída")) {
    indexAsignado = 5; // Médico 6: Traumatólogo de Guardia
  } else if (STATE.prioridad === "I") {
    indexAsignado = 0; // Médico 1: Emergenciólogo (Shock Trauma)
  } else if (motivo.includes("abdomen") || motivo.includes("apéndice") || motivo.includes("herida")) {
    indexAsignado = 1; // Médico 2: Cirujano de Guardia
  } else {
    // Rota al siguiente médico disponible en el rol de guardia
    indexAsignado = (select.selectedIndex + 1) % select.options.length;
  }

  select.selectedIndex = indexAsignado;
  const medicoElegido = select.options[indexAsignado].value;
  actualizarMedicoAsignado(medicoElegido);

  alert(`🩺 Médico Asignado según Rol de Guardia y Disponibilidad:\n${medicoElegido}\nEstado: 🟢 Activo / Disponible en Servicio.`);
}

function asignarMedicoAzar() {
  asignarMedicoDisponible();
}

function actualizarMedicoAsignado(val) {
  STATE.medicoTratante = val;
  STATE.firmante = val;
}

// B. INICIALIZAR Y POBLAR SELECTORES DEL CATÁLOGO MÉDICO
function inicializarSelectoresCatalogo() {
  // 1. Selector de Farmacia
  const selFarm = document.getElementById("select_farmacia_catalogo");
  if (selFarm && FARMACIA && selFarm.options.length <= 1) {
    selFarm.innerHTML = "";
    FARMACIA.forEach((item, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `${item.nombre} (S/. ${item.costo.toFixed(2)})`;
      selFarm.appendChild(opt);
    });
  }

  // 2. Selector de Laboratorio
  const selLab = document.getElementById("select_laboratorio_catalogo");
  if (selLab && LABORATORIO && selLab.options.length <= 1) {
    selLab.innerHTML = "";
    LABORATORIO.forEach((item, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `${item.nombre} (S/. ${item.costo.toFixed(2)})`;
      selLab.appendChild(opt);
    });
  }

  // 3. Selector de Imágenes
  const selImg = document.getElementById("select_imagenes_catalogo");
  if (selImg && IMAGENES && selImg.options.length <= 1) {
    selImg.innerHTML = "";
    IMAGENES.forEach((item, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `${item.nombre} (S/. ${item.costo.toFixed(2)})`;
      selImg.appendChild(opt);
    });
  }

  renderizarKardex();
  renderizarOrdenesLaboratorio();
  renderizarOrdenesImagenes();
}

// C. KARDEX DE ENFERMERÍA DINÁMICO
function agregarMedicamentoAKardex() {
  const selFarm = document.getElementById("select_farmacia_catalogo");
  const dosisInput = document.getElementById("input_dosis_kardex");
  const horarioInput = document.getElementById("input_horario_kardex");

  const idx = parseInt(selFarm?.value) || 0;
  const item = FARMACIA[idx];
  if (!item) return;

  const dosis = (dosisInput?.value || "Dosis terapéutica EV").trim();
  const horario = (horarioInput?.value || "Stat").trim();

  if (!Array.isArray(STATE.kardexItems)) STATE.kardexItems = [];
  STATE.kardexItems.push({
    nombre: item.nombre,
    dosis: `${dosis} (${horario})`,
    costo: item.costo,
    cat: "Farmacia",
    administrado: false,
    horaAdmin: null
  });

  renderizarKardex();
  alert(`💊 Medicamento indicado y añadido al Kardex de Enfermería: ${item.nombre}. Recuerde que solo se facturará cuando Enfermería marque [ ✓ Administrado ].`);
}

function renderizarKardex() {
  const tbody = document.getElementById("kardex_items_body");
  if (!tbody) return;

  if (!Array.isArray(STATE.kardexItems) || STATE.kardexItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:12px;color:#94a3b8;">Sin medicamentos prescritos en el Kardex. Seleccione un fármaco arriba para indicar.</td></tr>`;
    return;
  }

  let html = "";
  STATE.kardexItems.forEach((k, idx) => {
    const isAdm = k.administrado;
    html += `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px;font-weight:600;color:#0f172a;">${k.nombre}</td>
        <td style="padding:8px 10px;color:#475569;">${k.dosis}</td>
        <td style="padding:8px 10px;text-align:center;">
          <button type="button" 
                  class="btn-kardex-admin"
                  data-administrado="${isAdm ? 'true' : 'false'}"
                  style="padding:5px 12px;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;border:none;background:${isAdm ? '#15803d' : '#e0f2fe'};color:${isAdm ? '#ffffff' : '#0369a1'};"
                  onclick="administrarKardexItem(${idx}, '${k.nombre.replace(/'/g, "\'")}', ${k.costo}, 'Farmacia', this)">
            ${isAdm ? `✅ Administrado (${k.horaAdmin || 'Registrado'})` : '[ ✓ Administrado por Enf. ]'}
          </button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function administrarKardexItem(idx, nombre, costo, cat, btnEl) {
  if (!Array.isArray(STATE.kardexItems) || !STATE.kardexItems[idx]) return;
  const k = STATE.kardexItems[idx];
  const yaAdm = k.administrado;
  const now = new Date();
  const horaStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!yaAdm) {
    k.administrado = true;
    k.horaAdmin = horaStr;
    registrarFacturaItem(nombre, costo, cat);
    if (!STATE.kardexAdministrados.includes(nombre)) {
      STATE.kardexAdministrados.push(nombre);
    }
  } else {
    k.administrado = false;
    k.horaAdmin = null;
    const itemIdx = STATE.items_factura.findIndex(i => i.nombre === nombre);
    if (itemIdx !== -1) {
      STATE.items_factura.splice(itemIdx, 1);
    }
    STATE.kardexAdministrados = STATE.kardexAdministrados.filter(n => n !== nombre);
    actualizarFactura();
  }

  renderizarKardex();
}

// D. ÓRDENES DE LABORATORIO CLÍNICO
function solicitarExamenLaboratorio() {
  const selLab = document.getElementById("select_laboratorio_catalogo");
  const prioSel = document.getElementById("select_prioridad_lab");

  const idx = parseInt(selLab?.value) || 0;
  const item = LABORATORIO[idx];
  if (!item) return;

  const prioridad = prioSel?.value || "🚨 Urgente (30 min)";

  if (!Array.isArray(STATE.ordenesLaboratorio)) STATE.ordenesLaboratorio = [];
  STATE.ordenesLaboratorio.push({
    nombre: item.nombre,
    prioridad: prioridad,
    costo: item.costo,
    estado: "⏳ En proceso de análisis"
  });

  // Agregar cargo directo a factura por orden de laboratorio emitida
  registrarFacturaItem(item.nombre, item.costo, "Laboratorio");
  renderizarOrdenesLaboratorio();
  alert(`🧪 Análisis de Laboratorio solicitado: ${item.nombre}. Orden transmitida a Toma de Muestras y cargada a cuenta hospitalaria.`);
}

function renderizarOrdenesLaboratorio() {
  const tbody = document.getElementById("tabla_ordenes_lab_body");
  if (!tbody) return;

  if (!Array.isArray(STATE.ordenesLaboratorio) || STATE.ordenesLaboratorio.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:12px;color:#94a3b8;">Sin análisis de laboratorio solicitados. Seleccione una prueba arriba para ordenar.</td></tr>`;
    return;
  }

  let html = "";
  STATE.ordenesLaboratorio.forEach(o => {
    html += `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px;font-weight:600;color:#0f172a;">${o.nombre}</td>
        <td style="padding:8px 10px;color:#475569;font-size:11px;">${o.prioridad}</td>
        <td style="padding:8px 10px;text-align:center;">
          <span style="background:#ecfeff;color:#0891b2;border:1px solid #a5f3fc;padding:3px 8px;border-radius:9999px;font-size:10px;font-weight:800;">
            ${o.estado}
          </span>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// E. ÓRDENES DE DIAGNÓSTICO POR IMÁGENES Y PROCEDIMIENTOS
function solicitarEstudioImagen() {
  const selImg = document.getElementById("select_imagenes_catalogo");
  const indInput = document.getElementById("input_indicacion_img");

  const idx = parseInt(selImg?.value) || 0;
  const item = IMAGENES[idx];
  if (!item) return;

  const indicacion = (indInput?.value || "Evaluación de emergencia").trim();

  if (!Array.isArray(STATE.ordenesImagenes)) STATE.ordenesImagenes = [];
  STATE.ordenesImagenes.push({
    nombre: item.nombre,
    indicacion: indicacion,
    costo: item.costo,
    estado: "⏳ Estudio en ejecución"
  });

  // Agregar cargo directo a factura por orden de imagen/estudio
  registrarFacturaItem(item.nombre, item.costo, "Imágenes");
  renderizarOrdenesImagenes();
  alert(`🩻 Estudio Radiológico / Imagen solicitado: ${item.nombre}. Orden transmitida al Servicio de Imágenes de Emergencia.`);
}

function renderizarOrdenesImagenes() {
  const tbody = document.getElementById("tabla_ordenes_img_body");
  if (!tbody) return;

  if (!Array.isArray(STATE.ordenesImagenes) || STATE.ordenesImagenes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:12px;color:#94a3b8;">Sin estudios radiológicos solicitados. Seleccione un estudio arriba para ordenar.</td></tr>`;
    return;
  }

  let html = "";
  STATE.ordenesImagenes.forEach(o => {
    html += `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px;font-weight:600;color:#0f172a;">${o.nombre}</td>
        <td style="padding:8px 10px;color:#475569;font-size:11px;">${o.indicacion}</td>
        <td style="padding:8px 10px;text-align:center;">
          <span style="background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;padding:3px 8px;border-radius:9999px;font-size:10px;font-weight:800;">
            ${o.estado}
          </span>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// Exportar globalmente
window.asignarMedicoDisponible = asignarMedicoDisponible;
window.asignarMedicoAzar = asignarMedicoAzar;
window.actualizarMedicoAsignado = actualizarMedicoAsignado;
window.inicializarSelectoresCatalogo = inicializarSelectoresCatalogo;
window.agregarMedicamentoAKardex = agregarMedicamentoAKardex;
window.renderizarKardex = renderizarKardex;
window.solicitarExamenLaboratorio = solicitarExamenLaboratorio;
window.renderizarOrdenesLaboratorio = renderizarOrdenesLaboratorio;
window.solicitarEstudioImagen = solicitarEstudioImagen;
window.renderizarOrdenesImagenes = renderizarOrdenesImagenes;
window.imprimirBrazalete = imprimirBrazalete;

// Inicializar selectores cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(inicializarSelectoresCatalogo, 150);
});


// ==============================================================================
// 25. PROTOCOLO DE PASE DIRECTO A QUIRÓFANO (SOP) Y REGULARIZACIÓN DIFERIDA (LEY N° 27604)
// ==============================================================================

function activarIngresoDirectoQuirofano() {
  const now = new Date();
  const horaStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '');
  const idEmergencia = `CRITICO-SOP-${horaStr}`;
  const hcEmergencia = `HC-SOP-${Math.floor(1000 + Math.random() * 9000)}`;
  const nombreCritico = "PACIENTE CRÍTICO (QUIRÓFANO SOP 1)";

  guardarEstadoPacienteActivo();

  // 1. Asignar atención en el Tablero de Atención Simultánea (omitiendo cómo llegó o quién lo trajo)
  const pxSOP = crearRegistroPaciente({
    identificador: idEmergencia,
    nombre: nombreCritico,
    dni: "NN",
    prioridad: "I",
    motivo: "Hemorragia Masiva Exsanguinante / Cirugía de Control de Daños (P-I)",
    estadoAtencion: "En Atención — Quirófano SOP 1",
    camaNombre: "Quirófano 1 (SOP 1)",
    camaId: "SOP-01",
    esEmergenciaDirecta: true,
    esNN: true
  });

  PACIENTES_COLA.push(pxSOP);
  pacienteActivoId = pxSOP.id;

  // 2. Configurar STATE
  limpiarFormularioCompletoState();
  STATE.prioridad = "I";
  STATE.colorPrioridad = "ROJO";
  STATE.regularizacionDiferida = true;
  STATE.destinoPostTopico = "sop_uci";
  STATE.identificador = idEmergencia;
  STATE.nombreReniec = nombreCritico;
  STATE.historiaClinica = hcEmergencia;
  STATE.camaAsignada = "Quirófano 1 (SOP 1)";
  STATE.camaAsignadaId = "SOP-01";
  STATE.tipoSeguro = "SIS Gratuito";
  STATE.grupoSanguineo = "Desconocido";

  // Asignar recurso hospitalario SOP-01
  if (typeof RECURSOS_HOSPITALARIOS !== "undefined" && RECURSOS_HOSPITALARIOS["SOP-01"]) {
    RECURSOS_HOSPITALARIOS["SOP-01"].estado = "ocupada";
    RECURSOS_HOSPITALARIOS["SOP-01"].paciente = {
      nombre: nombreCritico,
      identificador: idEmergencia,
      historiaClinica: hcEmergencia,
      prioridad: "I"
    };
    if (typeof renderizarTableroCamasYQuirofanos === "function") {
      renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "camas_stock_grid");
      renderizarTableroCamasYQuirofanos(filtroRecursoActivo, "modal_camas_stock_grid");
    }
  }

  // 3. Sincronizar DOM
  const elIdent = document.getElementById("ident_full");
  if (elIdent) elIdent.value = idEmergencia;
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = "Cirugía de Control de Daños / Hemorragia Masiva Activa (Pase Directo)";
  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = "Desconocido";
  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = hcEmergencia;
  const badgeEstado = document.getElementById("hc_badge_estado");
  if (badgeEstado) {
    badgeEstado.textContent = "🔪 Quirófano SOP (Ley 27604)";
    badgeEstado.className = "badge-estado badge-danger";
  }

  mostrarPrioridad("I", {
    tipo: "Prioridad I — ROJO (Cirugía de Emergencia / SOP 1)",
    desc: "Ingreso directo a sala de operaciones. Trámites y origen omitidos por premura asistencial.",
    destino: "Quirófano 1 (SOP 1)"
  });

  renderizarTableroColaPacientes();
  mostrarToastCola(`🔪 <strong>Ingreso Directo a Quirófano (SOP 1):</strong> Asignado en atención quirúrgica en el Tablero.`);

  // Si no tenía nombre o DNI, asignar código de reanimación inmediata
  if (!STATE.identificador || STATE.identificador.length < 2) {
    STATE.identificador = idEmergencia;
    STATE.nombreReniec = "PACIENTE NN (INGRESO CRÍTICO A QUIRÓFANO / LEY 27604)";
    STATE.historiaClinica = hcEmergencia;
    STATE.alertaPnpSs = true;

    const idInput = document.getElementById("identificador_full");
    if (idInput) idInput.value = idEmergencia;
    const nomDisp = document.getElementById("nombre_display");
    if (nomDisp) nomDisp.textContent = STATE.nombreReniec;
    const hcDisp = document.getElementById("hc_display");
    if (hcDisp) hcDisp.textContent = hcEmergencia;
  }

  // 2. Asignar Quirófano SOP 1
  STATE.camaAsignada = "Quirófano 1 (SOP 1 - Cirugía de Control de Daños)";
  try {
    asignarPacienteActualARecurso("SOP-01", 2, "Cirugía de Control de Daños / Laparotomía de Urgencia (Ley N° 27604)");
  } catch (e) { console.warn(e); }

  // 3. Cargar paquete quirúrgico de reanimación de emergencia
  registrarFacturaItem("Derecho de Sala de Operaciones de Emergencia (SOP 1)", 450, "Procedimientos");
  registrarFacturaItem("Cirugía de Control de Daños / Laparotomía de Urgencia", 850, "Procedimientos");
  registrarFacturaItem("Monitoreo Anestésico y Sedación Integral", 320, "Procedimientos");
  registrarFacturaItem("Paquete Globular O- Transfusión de Urgencia (Banco Sangre)", 240, "Procedimientos");

  // 4. Actualizar badges y telemetría
  const chipLive = document.getElementById("chipPrioLive");
  if (chipLive) {
    chipLive.textContent = "P-I ROJO (QUIRÓFANO SOP 1)";
    chipLive.className = "top-prio-chip prio-I";
  }

  const bannerSop = document.getElementById("banner_quirofano_urgente_activo");
  if (bannerSop) bannerSop.style.display = "block";

  const badgeSop1 = document.getElementById("badge_sop1");
  if (badgeSop1) {
    badgeSop1.textContent = "🔴 EN OPERACIÓN";
    badgeSop1.style.background = "#fee2e2";
    badgeSop1.style.color = "#991b1b";
  }

  // 5. Notificación oficial y navegación directa a Módulo 6
  alert("🏥 ALERTA MÁXIMA HOSPITALARIA (LEY N° 27604):\n\n" +
        "Pase directo a Quirófano de Emergencia (SOP 1) para Cirugía de Control de Daños.\n" +
        "Se aplicó el principio de no condicionamiento a pago ni seguro. El paciente se encuentra en sala de operaciones.\n\n" +
        "Al finalizar la estabilización, el personal de Admisión podrá regularizar los datos filiatorios y de cobertura con el botón [ Regularizar Datos Post-Estabilización ].");

  irAModulo(6);
}

function asignarQuirofanoEspecifico(num) {
  const sopId = `SOP-0${num}`;
  asignarPacienteActualARecurso(sopId, 2, `Procedimiento Quirúrgico en Quirófano ${num}`);
}

function asignarCamaURPA() {
  asignarPacienteActualARecurso("URPA-01", 3, "Recuperación Post-Anestésica Inmediata (Escala Aldrete)");
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
  try {
    const sopId = sala.includes("1") ? "SOP-01" : "SOP-02";
    asignarPacienteActualARecurso(sopId, 2.5, nombreCirugia);
  } catch (e) { console.warn(e); }
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
  if (modal) modal.style.display = "none";
}

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
    STATE.soatPlaca = placa || "PLACA-REGULARIZADA";
    STATE.tipoSeguro = "SOAT";
    STATE.bloqueoSinadef = true;
  } else if (origen === "soat_fuga") {
    STATE.esAccidenteTransito = true;
    STATE.soatVehiculoFuga = true;
    STATE.soatPlaca = "SIN PLACA (FUGA)";
    STATE.tipoSeguro = "Particular (Chofer en Fuga / Ley 27604)";
    STATE.bloqueoSinadef = true;
  } else {
    STATE.esAccidenteTransito = false;
    STATE.soatVehiculoFuga = false;
    STATE.tipoSeguro = seguro;
    STATE.bloqueoSinadef = false;
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
window.toggleDrawerFlotante = toggleDrawerFlotante;
window.actualizarWidgetFlotanteCamas = actualizarWidgetFlotanteCamas;


// ==============================================================================
// PRESETS DE CASOS CLÍNICOS RÁPIDOS DE 1 CLIC (EXPOSICIÓN & AUDITORÍA ASISTENCIAL)
// ==============================================================================
function cargarCasoPreset(prioNum) {
  // Limpiar códigos de tiempo previos
  const chkInfarto = document.getElementById("check_cod_infarto");
  if (chkInfarto) { chkInfarto.checked = false; toggleCodigoTiempo('infarto', false); }
  const chkIctus = document.getElementById("check_cod_ictus");
  if (chkIctus) { chkIctus.checked = false; toggleCodigoTiempo('ictus', false); }
  const chkSepsis = document.getElementById("check_cod_sepsis");
  if (chkSepsis) { chkSepsis.checked = false; toggleCodigoTiempo('sepsis', false); }

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

  const casos = {
    1: {
      titulo: "Caso 1: Shock Hipovolémico / Politrauma (P-I)",
      motivo: "Politraumatismo severo por atropello con hemorragia masiva activa y shock circulatorio",
      spo2: 82, fc: 142, pas: 70, pad: 40, fr: 32, temp: 35.5, glasgow: 7, glucosa: 60, eva: 0,
      dni: "44418504", nombre: "LUIS GUILLERMO VASQUEZ VALDIVIESO"
    },
    2: {
      titulo: "Caso 2: Crisis Hipertensiva / Urgencia Mayor (P-II)",
      motivo: "Cefalea pulsátil intensa, mareos y dolor precordial opresivo sin shock",
      spo2: 96, fc: 98, pas: 180, pad: 110, fr: 22, temp: 36.8, glasgow: 15, glucosa: 110, eva: 7,
      dni: "10203040", nombre: "CARLOS MENDOZA ROJAS"
    },
    3: {
      titulo: "Caso 3: Cólico Renal Agudo / Urgencia Menor (P-III)",
      motivo: "Dolor lumbar unilateral tipo cólico agudo moderado irradiado a fosa ilíaca",
      spo2: 98, fc: 84, pas: 130, pad: 85, fr: 18, temp: 37.1, glasgow: 15, glucosa: 100, eva: 5,
      dni: "70809010", nombre: "HERMELINDA ANTONIO VILLANUEVA"
    },
    4: {
      titulo: "Caso 4: Faringoamigdalitis Aguda / Urgencia Leve (P-IV)",
      motivo: "Odinofagia intensa, disfagia y alza térmica de 48 horas de evolución",
      spo2: 99, fc: 78, pas: 115, pad: 75, fr: 16, temp: 38.0, glasgow: 15, glucosa: 95, eva: 3,
      dni: "45678901", nombre: "RONY ALEXANDER ARENAS HUAMANCHUMO"
    },
    5: {
      titulo: "Caso 5: Retiro de Puntos / No Urgencia (P-V)",
      motivo: "Paciente acude para retiro de puntos de sutura y curación de herida operatoria",
      spo2: 99, fc: 72, pas: 120, pad: 80, fr: 16, temp: 36.5, glasgow: 15, glucosa: 90, eva: 0,
      dni: "12345678", nombre: "DEMO PACIENTE AMBULATORIO"
    }
  };
  const c = casos[prioNum];
  if (!c) return;

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

  if (c.codigo === "infarto" && chkInfarto) {
    chkInfarto.checked = true;
    toggleCodigoTiempo('infarto', true);
  }

  // Si no hay identificación previa, autocompletar identificación del paciente demo
  if (elIdent && (!elIdent.value || elIdent.value.length < 2)) {
    elIdent.value = `${c.nombre} (DNI ${c.dni})`;
    STATE.numDni = c.dni;
    STATE.nombreReniec = c.nombre;
    STATE.identificador = `${c.nombre} (DNI ${c.dni})`;
    STATE.historiaClinica = `HC-2026-${c.dni.slice(-4)}`;
    const hcDisp = document.getElementById("hc_code_display");
    if (hcDisp) hcDisp.textContent = STATE.historiaClinica;
    const badgeEstado = document.getElementById("hc_badge_estado");
    if (badgeEstado) {
      badgeEstado.textContent = "✅ Identificado";
      badgeEstado.className = "badge-estado badge-si";
    }
  }

  // Destacar visualmente el botón seleccionado
  document.querySelectorAll('.btn-preset-caso').forEach(b => b.classList.remove('active-preset'));
  const btnAct = document.getElementById(`btn_preset_${prioNum}`);
  if (btnAct) btnAct.classList.add('active-preset');

  // Ejecutar evaluación inmediata en el algoritmo de triaje
  evaluarPacienteCompleto();

  // Feedback visual rápido
  const msgToast = document.getElementById("toast_preset_msg");
  if (msgToast) {
    msgToast.style.display = "block";
    msgToast.innerHTML = `⚡ <strong>Cargado con éxito:</strong> ${c.titulo} — Evaluado en el algoritmo en tiempo real.`;
    setTimeout(() => { msgToast.style.display = "none"; }, 4000);
  }
}


// ==============================================================================
// 26. MOTOR DE ATENCIÓN SIMULTÁNEA Y GESTIÓN DE COLA DE URGENCIAS (NTS N° 042-MINSA)
// Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
// ==============================================================================

let PACIENTES_COLA = [];
let pacienteActivoId = null;
let contadorSecuencialPx = 1;
let intervalCronometrosCola = null;

const ORDEN_PRIORIDADES = { "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, null: 99 };
const COLORES_PRIORIDAD = {
  "I": { bg: "#fee2e2", border: "#fecaca", text: "#b91c1c", label: "P-I ROJO" }, // bg-red-100 text-red-700 border-red-200
  "II": { bg: "#ffedd5", border: "#fed7aa", text: "#c2410c", label: "P-II NARANJA" }, // bg-orange-100 text-orange-700 border-orange-200
  "III": { bg: "#fef9c3", border: "#fef08a", text: "#a16207", label: "P-III AMARILLO" }, // bg-yellow-100 text-yellow-700 border-yellow-200
  "IV": { bg: "#dcfce7", border: "#bbf7d0", text: "#15803d", label: "P-IV VERDE" }, // bg-emerald-100 text-emerald-700 border-emerald-200
  "V": { bg: "#dbeafe", border: "#bfdbfe", text: "#1d4ed8", label: "P-V AZUL" }, // bg-blue-100 text-blue-700 border-blue-200
  null: { bg: "#f1f5f9", border: "#e2e8f0", text: "#64748b", label: "POR EVALUAR" }
};

function generarIdPaciente() {
  return "PX-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1000).toString(36);
}

function crearRegistroPaciente(datos = {}) {
  const ahora = new Date();
  const horaStr = ahora.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const num = datos.numero || contadorSecuencialPx++;
  const id = datos.id || generarIdPaciente();
  
  return {
    id: id,
    numero: num,
    identificador: datos.identificador || `Paciente #${num}`,
    nombre: datos.nombre || `Paciente #${num} (En espera)`,
    dni: datos.dni || "",
    edad: datos.edad || null,
    sexo: datos.sexo || "M",
    horaLlegada: datos.horaLlegada || horaStr,
    timestampLlegada: datos.timestampLlegada || ahora.getTime(),
    modalidad: datos.modalidad || "A pie",
    prioridad: datos.prioridad || null,
    motivo: datos.motivo || "",
    estadoAtencion: datos.estadoAtencion || "En Triaje",
    camaId: datos.camaId || null,
    camaNombre: datos.camaNombre || null,
    esNN: Boolean(datos.esNN),
    stateSnapshot: datos.stateSnapshot ? JSON.parse(JSON.stringify(datos.stateSnapshot)) : null,
    formSnapshot: datos.formSnapshot ? JSON.parse(JSON.stringify(datos.formSnapshot)) : null
  };
}

function capturarFormularioActual() {
  const inputs = {};
  const ids = [
    "ident_full", "dni_reniec_input", "motivo_full", "spo2_full", "fc_full",
    "pas_full", "pad_full", "fr_full", "temp_full", "glasgow_full", "glucosa_full",
    "eva_full", "eva_range", "edad_full", "sexo_full", "fecha_nac_full",
    "check_cod_infarto", "check_cod_ictus", "check_cod_sepsis",
    "chk_gestante_full", "chk_pediatrico_full"
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      inputs[id] = (el.type === "checkbox") ? el.checked : el.value;
    }
  });
  return inputs;
}

function aplicarFormulario(inputs) {
  if (!inputs) return;
  Object.keys(inputs).forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.type === "checkbox") {
        el.checked = Boolean(inputs[id]);
      } else {
        el.value = inputs[id];
      }
    }
  });
  const evaVal = inputs["eva_full"] !== undefined ? parseInt(inputs["eva_full"], 10) : 0;
  if (!isNaN(evaVal) && typeof actualizarEVA === "function") {
    actualizarEVA(evaVal);
  }
}

function guardarEstadoPacienteActivo() {
  if (!pacienteActivoId) return;
  const p = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
  if (!p) return;

  p.stateSnapshot = JSON.parse(JSON.stringify(STATE));
  p.formSnapshot = capturarFormularioActual();
  p.prioridad = STATE.prioridad;
  p.identificador = STATE.identificador || p.identificador;
  p.nombre = STATE.nombreReniec || p.nombre;
  p.dni = STATE.numDni || p.dni;
  p.motivo = STATE.motivoConsulta || p.motivo;
  p.camaId = STATE.camaAsignadaId;
  p.camaNombre = STATE.camaAsignada;
}

function ordenarColaPacientes() {
  PACIENTES_COLA.sort((a, b) => {
    const pA = ORDEN_PRIORIDADES[a.prioridad] || 99;
    const pB = ORDEN_PRIORIDADES[b.prioridad] || 99;
    if (pA !== pB) return pA - pB;
    return a.timestampLlegada - b.timestampLlegada;
  });
}

function formatearTiempoEspera(ms) {
  const diffSeg = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const min = Math.floor(diffSeg / 60);
  const seg = diffSeg % 60;
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

function renderizarTableroColaPacientes() {
  const container = document.getElementById("activePatientsCardsList");
  const countBadge = document.getElementById("lbl_total_px_activos");
  if (!container) return;

  ordenarColaPacientes();

  if (countBadge) {
    countBadge.textContent = `${PACIENTES_COLA.length} ${PACIENTES_COLA.length === 1 ? 'Paciente en atención' : 'Pacientes en simultáneo'}`;
  }

  if (PACIENTES_COLA.length === 0) {
    if (countBadge) {
      countBadge.textContent = "0 Pacientes en espera";
      countBadge.style.background = "#f1f5f9";
      countBadge.style.color = "#64748b";
    }
    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; padding:12px 16px; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:10px; color:#64748b; font-size:0.8rem; width:100%;">
        <span style="font-size:1.3rem;">⏳</span>
        <div>
          <strong>Sala de Espera y Triaje Despejada:</strong> No hay pacientes en cola. Presione <strong>«➕ Registrar Paciente en Espera»</strong> cuando ingrese un nuevo paciente, o active un ingreso directo (NN / Shock Trauma / Quirófano).
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  PACIENTES_COLA.forEach(p => {
    const prioCfg = COLORES_PRIORIDAD[p.prioridad] || COLORES_PRIORIDAD[null];
    const esActivo = (p.id === pacienteActivoId);
    const tiempoEspera = formatearTiempoEspera(p.timestampLlegada);

    const card = document.createElement("div");
    card.className = `patient-queue-card ${esActivo ? 'active-card' : ''}`;
    card.style.borderLeft = `5px solid ${prioCfg.border}`;
    card.onclick = () => cambiarPacienteActivo(p.id);

    // OMITIR CÓMO LLEGÓ O QUIÉN LO TRAJO EN EMERGENCIAS CRÍTICAS (NN, SHOCK TRAUMA, QUIRÓFANO)
    const metaOrigen = (p.esEmergenciaDirecta || p.esNN)
      ? `<span style="font-weight:700; color:#dc2626;">🚨 Pase Directo Vital</span>`
      : `<span>${p.modalidad || 'A pie'}</span>`;

    const metaDestino = p.camaNombre
      ? `<span style="font-weight:700; color:#15803d;">🛏️ ${p.camaNombre}</span>`
      : `<span style="font-weight:700; color:#0284c7;">${p.estadoAtencion || 'En Espera'}</span>`;

    card.innerHTML = `
      <div class="card-top-row">
        <span class="card-prio-badge" style="background:${prioCfg.bg}; color:${prioCfg.text}; border:1px solid ${prioCfg.border};">
          ${prioCfg.label}
        </span>
        <span class="card-timer" id="timer_px_${p.id}" title="Tiempo desde su ingreso">⏱️ ${tiempoEspera}</span>
      </div>
      <div class="card-name" title="${p.nombre}">
        ${p.esNN ? '🚨 ' : ''}${p.nombre}
      </div>
      <div class="card-meta">
        ${metaOrigen}
        ${metaDestino}
      </div>
      <button type="button" class="btn-close-card" onclick="cerrarAtencionPaciente('${p.id}', event)" title="Finalizar atención / Dar de alta">&times;</button>
    `;

    container.appendChild(card);
  });
}

function cambiarPacienteActivo(nuevoId) {
  if (nuevoId === pacienteActivoId) return;

  guardarEstadoPacienteActivo();

  const nuevoPx = PACIENTES_COLA.find(x => x.id === nuevoId);
  if (!nuevoPx) return;

  pacienteActivoId = nuevoId;

  if (nuevoPx.stateSnapshot) {
    Object.assign(STATE, JSON.parse(JSON.stringify(nuevoPx.stateSnapshot)));
  } else {
    limpiarFormularioCompletoState();
    STATE.identificador = nuevoPx.identificador;
    STATE.nombreReniec = nuevoPx.nombre;
    STATE.numDni = nuevoPx.dni;
    STATE.prioridad = nuevoPx.prioridad;
  }

  if (nuevoPx.formSnapshot) {
    aplicarFormulario(nuevoPx.formSnapshot);
  } else {
    const elIdent = document.getElementById("ident_full");
    if (elIdent) elIdent.value = nuevoPx.identificador || "";
    const elDni = document.getElementById("dni_reniec_input");
    if (elDni) elDni.value = nuevoPx.dni || "";
    const elMotivo = document.getElementById("motivo_full");
    if (elMotivo) elMotivo.value = nuevoPx.motivo || "";
  }

  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = STATE.historiaClinica || "—";
  const badgeEstado = document.getElementById("hc_badge_estado");
  if (badgeEstado) {
    badgeEstado.textContent = STATE.estadoRegistrado || (nuevoPx.esNN ? "🚨 Paciente NN" : "Por confirmar");
    badgeEstado.className = nuevoPx.esNN ? "badge-estado badge-warning" : "badge-estado";
  }

  if (STATE.prioridad && typeof mostrarPrioridad === "function") {
    mostrarPrioridad(STATE.prioridad, {
      tipo: PRIORIDADES[STATE.prioridad]?.nombre || "Prioridad Asignada",
      desc: nuevoPx.motivo || "Atención activa en curso",
      destino: STATE.camaAsignada || (STATE.prioridad === 'I' ? 'Shock Trauma' : (STATE.prioridad === 'II' ? 'Tópico de Emergencia' : 'Observación / Espera'))
    });
  } else {
    limpiarPrioridadUI();
  }

  renderizarTableroColaPacientes();
  mostrarToastCola(`🔄 Paciente activo: <strong>${nuevoPx.nombre}</strong>`);
}

function limpiarFormularioCompletoState() {
  STATE.spo2 = null; STATE.fc = null; STATE.pasSistolica = null; STATE.paDiastolica = null;
  STATE.fr = null; STATE.temperatura = null; STATE.glucosa = null; STATE.glasgow = null; STATE.eva = 0;
  STATE.motivoConsulta = ""; STATE.prioridad = null; STATE.colorPrioridad = null;
  STATE.codigoInfarto = false; STATE.codigoIctus = false; STATE.codigoSepsis = false;
  STATE.identificador = ""; STATE.numDni = null; STATE.nombreReniec = null;
  STATE.historiaClinica = "—"; STATE.camaAsignada = null; STATE.camaAsignadaId = null;

  const inputsIds = [
    "ident_full", "dni_reniec_input", "motivo_full", "spo2_full", "fc_full",
    "pas_full", "pad_full", "fr_full", "temp_full", "glasgow_full", "glucosa_full",
    "eva_full", "eva_range", "edad_full", "sexo_full", "fecha_nac_full"
  ];
  inputsIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = "Desconocido";
  STATE.grupoSanguineo = "Desconocido";

  if (typeof actualizarEVA === "function") actualizarEVA(0);
  limpiarPrioridadUI();
}

function limpiarPrioridadUI() {
  const pDisp = document.getElementById("prioridad_display");
  if (pDisp) pDisp.style.display = "none";
  const pCard = document.getElementById("prio_result_card");
  if (pCard) pCard.style.display = "none";
  const miniPrio = document.getElementById("mini_prioridad_badge");
  if (miniPrio) {
    miniPrio.textContent = "🚦 Triaje: Por evaluar";
    miniPrio.style.background = "";
    miniPrio.style.color = "";
  }
}

function crearNuevoPacienteEnBlanco() {
  guardarEstadoPacienteActivo();
  const nuevoPx = crearRegistroPaciente();
  PACIENTES_COLA.push(nuevoPx);
  pacienteActivoId = nuevoPx.id;
  limpiarFormularioCompletoState();
  renderizarTableroColaPacientes();
  mostrarToastCola(`➕ Ficha en blanco creada: <strong>${nuevoPx.nombre}</strong>`);
}

function cerrarAtencionPaciente(id, event) {
  if (event) event.stopPropagation();
  const px = PACIENTES_COLA.find(x => x.id === id);
  if (!px) return;

  if (!confirm(`¿Desea cerrar la atención y dar salida a ${px.nombre}?`)) return;

  if (px.camaId && typeof liberarCamaRecurso === "function") {
    liberarCamaRecurso(px.camaId, "Alta de Urgencia");
  }

  PACIENTES_COLA = PACIENTES_COLA.filter(x => x.id !== id);

  if (PACIENTES_COLA.length === 0) {
    pacienteActivoId = null;
    limpiarFormularioCompletoState();
  } else if (pacienteActivoId === id) {
    pacienteActivoId = PACIENTES_COLA[0].id;
    cambiarPacienteActivo(pacienteActivoId);
  }

  renderizarTableroColaPacientes();
  mostrarToastCola(`✅ Atención finalizada: <strong>${px.nombre}</strong>`);
}

function abrirModalAdmisionRapidaNN() {
  const m = document.getElementById("modalAdmisionNN");
  if (m) m.style.display = "flex";
}

function cerrarModalAdmisionNN() {
  const m = document.getElementById("modalAdmisionNN");
  if (m) m.style.display = "none";
}

function ejecutarAdmisionRapidaNN(event) {
  if (event) event.preventDefault();
  const rbs = document.getElementsByName("nn_sexo");
  let sexo = "M";
  for (let r of rbs) { if (r.checked) { sexo = r.value; break; } }

  const edad = parseInt(document.getElementById("nn_edad_input")?.value || "30", 10);
  const modalidad = "Pase Directo"; // Omitido por premura de riesgo vital
  const motivo = document.getElementById("nn_estado_input")?.value || "Inconsciente / Politraumatizado / Falla Vital Inminente";

  const ahora = new Date();
  const fechaCod = ahora.toISOString().slice(0, 10).replace(/-/g, "");
  const numSec = String(PACIENTES_COLA.filter(x => x.esNN).length + 1).padStart(2, "0");
  const codigoNN = `NN-${sexo === 'M' ? 'MASC' : 'FEM'}-${fechaCod}-${numSec}`;
  const nombreNN = `NN (${sexo === 'M' ? 'Masculino' : 'Femenino'} ~${edad}a) — Indocumentado`;

  guardarEstadoPacienteActivo();

  const pxNN = crearRegistroPaciente({
    identificador: codigoNN,
    nombre: nombreNN,
    dni: "NN",
    edad: edad,
    sexo: sexo,
    modalidad: modalidad,
    motivo: motivo,
    prioridad: "I",
    esNN: true,
    estadoAtencion: "Shock Trauma Inmediato"
  });

  PACIENTES_COLA.push(pxNN);
  pacienteActivoId = pxNN.id;

  limpiarFormularioCompletoState();

  // Actualizar STATE con datos de NN
  STATE.esNN = true;
  STATE.alertaPnpSs = true;
  STATE.identificador = codigoNN;
  STATE.nombreReniec = nombreNN;
  STATE.numDni = "NN";
  STATE.edad = edad;
  STATE.sexo = sexo;
  STATE.grupoSanguineo = "Desconocido"; // OBLIGATORIO: Desconocido para NN
  STATE.tipoSeguro = "SIS Gratuito";
  STATE.modalidadIngreso = modalidad;
  STATE.motivoConsulta = motivo;
  STATE.prioridad = "I";
  STATE.historiaClinica = `HC-NN-${fechaCod}-${numSec}`;
  STATE.accionHc = `Paciente indocumentado (NN) — Historia clínica temporal abierta conforme a Ley N° 27604. Notificación emitida a PNP y Servicio Social.`;

  // 1. SINCRONIZAR MÓDULO 1
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = motivo;

  // 2. SINCRONIZAR MÓDULO 2 (IDENTIFICACIÓN & ADMISIÓN)
  const elIdent = document.getElementById("ident_full");
  if (elIdent) {
    elIdent.value = codigoNN;
    elIdent.placeholder = "PACIENTE NN — Documento No Requerido (Ley N° 27604)";
  }
  const elEdad = document.getElementById("edad_full");
  if (elEdad) elEdad.value = edad;
  const elSexo = document.getElementById("sexo_full");
  if (elSexo) elSexo.value = sexo;
  const elFechaNac = document.getElementById("fecha_nac_full");
  if (elFechaNac) elFechaNac.value = "";
  const elAlergias = document.getElementById("alergias_full");
  if (elAlergias) elAlergias.value = "Desconocidas (Paciente NN)";

  // GRUPO SANGUÍNEO: Asignar obligatoriamente "Desconocido"
  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = "Desconocido";

  // Marcar modalidad de ingreso en Módulo 2
  document.querySelectorAll(".modalidad-btn").forEach(b => {
    b.classList.remove("selected");
    const modAttr = b.getAttribute("data-mod") || "";
    if (modalidad.toLowerCase().includes(modAttr.toLowerCase()) || modAttr.toLowerCase().includes("ambulancia")) {
      b.classList.add("selected");
    }
  });

  // Indicadores de Historia Clínica
  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = STATE.historiaClinica;
  const badgeEstado = document.getElementById("hc_badge_estado");
  if (badgeEstado) {
    badgeEstado.textContent = "🚨 NN (Ley 27604)";
    badgeEstado.className = "badge-estado badge-warning";
  }
  const accDisp = document.getElementById("hc_accion_display");
  if (accDisp) accDisp.textContent = STATE.accionHc;

  const btnPnp = document.getElementById("btn_notif_pnp");
  if (btnPnp) btnPnp.style.display = "inline-block";

  // 3. ACTIVAR PRIORIDAD I ROJO INMEDIATA
  if (typeof mostrarPrioridad === "function") {
    mostrarPrioridad("I", {
      tipo: "Prioridad I — ROJO (Resucitación / Shock Trauma)",
      desc: `Paciente indocumentado (${codigoNN}) en riesgo vital. Atención inmediata garantizada por Ley N° 27604 sin requisito de DNI.`,
      destino: "Shock Trauma ST-01 / ST-02"
    });
  }

  cerrarModalAdmisionNN();
  renderizarTableroColaPacientes();
  mostrarToastCola(`🚨 <strong>Admisión Rápida NN:</strong> ${codigoNN} cargado en Módulo 2 con Grupo Sanguíneo <strong>Desconocido</strong>.`);
}

function abrirModalPreTriageSTART() {
  const m = document.getElementById("modalPreTriageSTART");
  if (m) {
    m.style.display = "flex";
    avanzarPasoSTART(1);
  }
}

function cerrarModalPreTriageSTART() {
  const m = document.getElementById("modalPreTriageSTART");
  if (m) m.style.display = "none";
}

function avanzarPasoSTART(numPaso) {
  for (let i = 1; i <= 4; i++) {
    const paso = document.getElementById(`start_step_${i}`);
    if (paso) paso.style.display = (i === numPaso) ? "block" : "none";
  }
}

function completarPreTriageSTART(prio, motivo) {
  cerrarModalPreTriageSTART();
  guardarEstadoPacienteActivo();

  const num = contadorSecuencialPx++;
  const ticket = `T-START-${String(num).padStart(3, '0')}`;
  const nombrePx = `Paciente ${ticket} (Pre-Triage Cola)`;

  const px = crearRegistroPaciente({
    numero: num,
    identificador: ticket,
    nombre: nombrePx,
    prioridad: prio,
    motivo: `Pre-Triage START: ${motivo}`,
    modalidad: "A pie",
    estadoAtencion: prio === 'I' ? "Shock Trauma" : (prio === 'II' ? "Tópico Inmediato" : "En Espera")
  });

  PACIENTES_COLA.push(px);
  pacienteActivoId = px.id;

  limpiarFormularioCompletoState();
  STATE.identificador = ticket;
  STATE.nombreReniec = nombrePx;
  STATE.prioridad = prio;
  STATE.motivoConsulta = `Pre-Triage START: ${motivo}`;
  STATE.historiaClinica = `HC-2026-${ticket}`;

  const elIdent = document.getElementById("ident_full");
  if (elIdent) elIdent.value = ticket;
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = STATE.motivoConsulta;

  if (typeof mostrarPrioridad === "function") {
    mostrarPrioridad(prio, {
      tipo: PRIORIDADES[prio]?.nombre || `Prioridad P-${prio}`,
      desc: motivo,
      destino: prio === 'I' ? 'Shock Trauma' : (prio === 'II' ? 'Tópico de Emergencia' : 'Sala de Espera')
    });
  }

  renderizarTableroColaPacientes();
  mostrarToastCola(`⚡ <strong>Pre-Triage START Completado:</strong> ${ticket} asignado a <strong>P-${prio}</strong>.`);
}

function simularLlegadaMasiva() {
  guardarEstadoPacienteActivo();

  const casosMasivos = [
    {
      identificador: "NN-MASC-CHOQUE-01",
      nombre: "NN Conductor (Masc ~35a) — Politrauma",
      dni: "",
      edad: 35,
      sexo: "M",
      modalidad: "Ambulancia",
      prioridad: "I",
      motivo: "Choque frontal a alta velocidad. Politraumatizado, shock hipovolémico, volet costal derecho, pérdida de conocimiento.",
      estadoAtencion: "Shock Trauma ST-01",
      camaNombre: "Shock Trauma ST-01",
      esNN: true,
      vitals: { spo2: 82, fc: 142, pas: 70, pad: 40, fr: 32, temp: 35.5, glasgow: 7, glucosa: 70, eva: 0 }
    },
    {
      identificador: "10203040",
      nombre: "CARLOS MENDOZA ROJAS (Copiloto)",
      dni: "10203040",
      edad: 48,
      sexo: "M",
      modalidad: "Ambulancia Bomberos",
      prioridad: "II",
      motivo: "Fractura expuesta de fémur derecho con sangrado profuso activo controlado con torniquete, dolor 9/10, crisis hipertensiva.",
      estadoAtencion: "Tópico de Cirugía / SOP",
      camaNombre: null,
      esNN: false,
      vitals: { spo2: 96, fc: 108, pas: 185, pad: 115, fr: 22, temp: 36.8, glasgow: 14, glucosa: 110, eva: 9 }
    },
    {
      identificador: "70809010",
      nombre: "MARIA TORRES SILVA (Pasajera)",
      dni: "70809010",
      edad: 39,
      sexo: "F",
      modalidad: "Patrullero PNP",
      prioridad: "III",
      motivo: "Contusión torácica leve por cinturón de seguridad, dolor lumbar moderado, taquicardia reactiva por crisis de ansiedad.",
      estadoAtencion: "Tópico de Medicina / Espera",
      camaNombre: null,
      esNN: false,
      vitals: { spo2: 98, fc: 92, pas: 130, pad: 85, fr: 18, temp: 37.0, glasgow: 15, glucosa: 98, eva: 6 }
    },
    {
      identificador: "45678901",
      nombre: "JORGE QUISPE RAMOS (Peatón)",
      dni: "45678901",
      edad: 26,
      sexo: "M",
      modalidad: "A pie / Serenazgo",
      prioridad: "IV",
      motivo: "Excoriaciones dermoepidérmicas superficiales múltiples en miembros superiores y rodillas. Deambula por sus propios medios.",
      estadoAtencion: "Tópico de Curaciones / Ambulatorio",
      camaNombre: null,
      esNN: false,
      vitals: { spo2: 99, fc: 76, pas: 118, pad: 76, fr: 16, temp: 36.6, glasgow: 15, glucosa: 92, eva: 3 }
    }
  ];

  PACIENTES_COLA = [];
  casosMasivos.forEach(c => {
    const px = crearRegistroPaciente({
      identificador: c.identificador,
      nombre: c.nombre,
      dni: c.dni,
      edad: c.edad,
      sexo: c.sexo,
      modalidad: c.modalidad,
      prioridad: c.prioridad,
      motivo: c.motivo,
      estadoAtencion: c.estadoAtencion,
      camaNombre: c.camaNombre,
      esNN: c.esNN,
      formSnapshot: {
        ident_full: c.nombre,
        dni_reniec_input: c.dni,
        motivo_full: c.motivo,
        spo2_full: c.vitals.spo2,
        fc_full: c.vitals.fc,
        pas_full: c.vitals.pas,
        pad_full: c.vitals.pad,
        fr_full: c.vitals.fr,
        temp_full: c.vitals.temp,
        glasgow_full: c.vitals.glasgow,
        glucosa_full: c.vitals.glucosa,
        eva_full: c.vitals.eva,
        eva_range: c.vitals.eva,
        edad_full: c.edad,
        sexo_full: c.sexo
      }
    });
    PACIENTES_COLA.push(px);
  });

  ordenarColaPacientes();

  const pxCritico = PACIENTES_COLA[0];
  pacienteActivoId = pxCritico.id;
  cambiarPacienteActivo(pxCritico.id);

  mostrarToastCola(`💥 <strong>Llegada Masiva Simulada (4 Pacientes):</strong> Priorizados por severidad según NTS N° 042-MINSA. Caso crítico cargado.`);
}

function mostrarToastCola(htmlMsg) {
  let toast = document.getElementById("toast_cola_msg");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast_cola_msg";
    toast.style.cssText = "position:fixed; top:54px; right:20px; z-index:99999; background:#0f172a; color:#ffffff; padding:12px 18px; border-radius:10px; border-left:4px solid #0284c7; box-shadow:0 8px 24px rgba(0,0,0,0.3); font-size:0.85rem; max-width:420px; transition:all 0.3s ease;";
    document.body.appendChild(toast);
  }
  toast.innerHTML = htmlMsg;
  toast.style.display = "block";
  toast.style.opacity = "1";
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => { toast.style.display = "none"; }, 300);
  }, 4500);
}

function registrarPacienteEnEspera() {
  guardarEstadoPacienteActivo();
  const num = contadorSecuencialPx++;
  const nombrePx = `Paciente #${num} (En Espera)`;
  const idPx = `PX-ESP-${num}-${Date.now().toString(36).slice(-4)}`;

  const nuevoPx = crearRegistroPaciente({
    numero: num,
    id: idPx,
    identificador: `Ticket T-${String(num).padStart(3, '0')}`,
    nombre: nombrePx,
    prioridad: null,
    estadoAtencion: "En Espera de Triaje",
    modalidad: "A pie"
  });

  PACIENTES_COLA.push(nuevoPx);

  if (!pacienteActivoId || PACIENTES_COLA.length === 1) {
    pacienteActivoId = nuevoPx.id;
    cambiarPacienteActivo(nuevoPx.id);
  }

  renderizarTableroColaPacientes();
  mostrarToastCola(`👤 <strong>Llegada Registrada:</strong> ${nombrePx} ingresado a sala de espera.`);
}
window.registrarPacienteEnEspera = registrarPacienteEnEspera;

function inicializarTableroColaPacientes() {
  // Inicia 100% en blanco: NO coloca automáticamente ningún paciente en espera
  renderizarTableroColaPacientes();

  if (!intervalCronometrosCola) {
    intervalCronometrosCola = setInterval(() => {
      PACIENTES_COLA.forEach(p => {
        const elTimer = document.getElementById(`timer_px_${p.id}`);
        if (elTimer) {
          elTimer.textContent = `⏱️ ${formatearTiempoEspera(p.timestampLlegada)}`;
        }
      });
    }, 1000);
  }
}

// Exponer en window para acceso universal
window.PACIENTES_COLA = PACIENTES_COLA;
window.abrirModalAdmisionRapidaNN = abrirModalAdmisionRapidaNN;
window.cerrarModalAdmisionNN = cerrarModalAdmisionNN;
window.ejecutarAdmisionRapidaNN = ejecutarAdmisionRapidaNN;
window.abrirModalPreTriageSTART = abrirModalPreTriageSTART;
window.cerrarModalPreTriageSTART = cerrarModalPreTriageSTART;
window.avanzarPasoSTART = avanzarPasoSTART;
window.completarPreTriageSTART = completarPreTriageSTART;
window.crearNuevoPacienteEnBlanco = crearNuevoPacienteEnBlanco;
window.cambiarPacienteActivo = cambiarPacienteActivo;
window.cerrarAtencionPaciente = cerrarAtencionPaciente;
window.simularLlegadaMasiva = simularLlegadaMasiva;
window.inicializarTableroColaPacientes = inicializarTableroColaPacientes;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(inicializarTableroColaPacientes, 200);
  });
} else {
  setTimeout(inicializarTableroColaPacientes, 200);
}

window.advertirEntornoBloqueado = advertirEntornoBloqueado;
window.resetearEntornoEstablecimientoAPendiente = resetearEntornoEstablecimientoAPendiente;

function actualizarGrupoSanguineo(val) {
  STATE.grupoSanguineo = val;
  autoGuardarCambioEnHistoriaClinica(`Grupo sanguíneo actualizado a ${val}`);
}
window.actualizarGrupoSanguineo = actualizarGrupoSanguineo;

// ==============================================================================
// GESTIÓN DE VISTA APP: MODO PASOS (TABS) VS VISTA CONTINUA
// ==============================================================================
let modoTabsActivo = false; // Por defecto: Modo Paso a Paso (Estilo App)

function alternarModoVistaApp(forzarModo) {
  if (forzarModo !== undefined) {
    modoTabsActivo = forzarModo;
  } else {
    modoTabsActivo = !modoTabsActivo;
  }

  const btnToggle = document.getElementById("btn_toggle_view_mode");
  const btnToggleMobile = document.getElementById("btn_toggle_view_mode_mobile");

  const textoBtn = modoTabsActivo ? "📑 Modo Pasos (App)" : "📜 Vista Continua";
  const claseBtn = modoTabsActivo
    ? "hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all cursor-pointer shadow-2xs"
    : "hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-all cursor-pointer shadow-2xs";

  if (btnToggle) {
    btnToggle.innerHTML = `<span>${textoBtn}</span>`;
    btnToggle.className = claseBtn;
  }
  if (btnToggleMobile) {
    btnToggleMobile.innerHTML = modoTabsActivo ? "📑 Modo App" : "📜 Vista Continua";
  }

  actualizarVistaModoTabs(moduloActivoActual || 1);
}

function actualizarVistaModoTabs(num) {
  const n = num || moduloActivoActual || 1;
  for (let i = 1; i <= 8; i++) {
    const sec = document.getElementById(`sec_mod${i}`);
    const btn = document.getElementById(`btnStepTop_${i}`);
    if (sec) {
      if (modoTabsActivo) {
        sec.style.display = (i === n) ? "block" : "none";
        if (i === n) {
          sec.classList.add("tab-step-active");
          const b = document.getElementById(`body_mod${i}`);
          if (b) {
            b.style.display = "block";
            b.classList.add("open");
          }
        }
      } else {
        sec.style.display = "block";
      }
    }
    if (btn) {
      if (i === n) {
        btn.classList.add("active");
        btn.classList.add("active-step-tab");
      } else {
        btn.classList.remove("active");
        btn.classList.remove("active-step-tab");
      }
    }
  }
}

window.alternarModoVistaApp = alternarModoVistaApp;
window.actualizarVistaModoTabs = actualizarVistaModoTabs;

// ==============================================================================
// SLIDER HORIZONTAL DE CAMAS & GESTIÓN DE MODO OSCURO (DARK MODE)
// ==============================================================================
function desplazarSliderCamas(containerId, offset) {
  const track = document.getElementById(containerId);
  if (track) {
    track.scrollBy({ left: offset, behavior: 'smooth' });
  }
}
window.desplazarSliderCamas = desplazarSliderCamas;

function alternarModoOscuro() {
  const isDark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("triaje_dark_mode", isDark ? "true" : "false");
  } catch(e) {}
  actualizarIconoModoOscuro(isDark);
}

function actualizarIconoModoOscuro(isDark) {
  const icon = document.getElementById("dark_mode_icon");
  if (icon) {
    icon.textContent = isDark ? "☀️" : "🌙";
  }
}

// Cargar preferencia guardada de modo oscuro
try {
  if (localStorage.getItem("triaje_dark_mode") === "true") {
    document.documentElement.classList.add("dark");
  }
} catch(e) {}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    actualizarIconoModoOscuro(document.documentElement.classList.contains("dark"));
  });
} else {
  actualizarIconoModoOscuro(document.documentElement.classList.contains("dark"));
}

window.alternarModoOscuro = alternarModoOscuro;
window.actualizarIconoModoOscuro = actualizarIconoModoOscuro;
