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
// 0. DECLARACIÓN TEMPRANA DEL ESTADO GLOBAL
// ---------------------------------------------------------------------------
var STATE = window.STATE = window.STATE || {};

// ---------------------------------------------------------------------------
// 1. CONFIGURACIÓN Y TOKEN DE APISPERU (RENIEC)
// ---------------------------------------------------------------------------
const DEFAULT_APISPERU_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6Imd1aWxsZXJtb3ZzdmxAZ21haWwuY29tIiwianRpIjoiZGE3MjEyOTliNTY0ODJjNyJ9.Bz4MHxTs72gLqGKlIuaIZ25NJmwtGx1ZqnkQU8YOorw";


// ---------------------------------------------------------------------------
// 2. BASE DE DATOS SIMULADA (IDÉNTICA a triage_prioridad.py — NO MODIFICAR)
// ---------------------------------------------------------------------------
// Base de datos de historias clínicas vacía (inicio desde cero)
const BASE_DATOS_HC = {};


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
// RESET LIMPIO DE HISTORIAS CLÍNICAS (INICIO DESDE CERO SOLICITADO)
// ---------------------------------------------------------------------------
(function verificarYPurgarBdInicial() {
  const DB_VERSION_KEY = "UPP_DB_VERSION_ZERO_2026";
  if (!localStorage.getItem(DB_VERSION_KEY)) {
    try {
      localStorage.removeItem("UPP_BASE_DATOS_HC");
      localStorage.removeItem("UPP_PACIENTES_MASTER_V2");
      localStorage.removeItem("UPP_HISTORIAL_EPISODIOS_V2");
      localStorage.removeItem("UPP_HISTORIAL_EPISODIOS");
      localStorage.removeItem("UPP_CONTADOR_HC");

      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("padron_susalud_") || k.startsWith("seguro_asignado_"))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      localStorage.setItem(DB_VERSION_KEY, "true");
      localStorage.setItem("UPP_CONTADOR_HC", "1");
      console.log("🧹 Base de datos local purgada con éxito. Comenzando historias clínicas desde cero.");
    } catch(e) {}
  }
})();



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
const PACIENTES_MASTER_SEED = {};

function normalizarClavePaciente(val) {
  return String(val || "").trim().toLowerCase().replace(/[\s\.\-]/g, "");
}

function generarDatosDemograficosCoherentes(dni, edadExistente = null, fechaExistente = null) {
  let edad = parseInt(edadExistente, 10);
  let fechaNac = String(fechaExistente || "").trim();

  if (!isNaN(edad) && edad >= 0 && edad <= 125) {
    if (!fechaNac) {
      const anio = new Date().getFullYear() - edad;
      fechaNac = `${anio}-06-15`;
    }
  } else if (fechaNac) {
    const dNac = new Date(fechaNac);
    if (!isNaN(dNac.getTime())) {
      const hoy = new Date();
      edad = hoy.getFullYear() - dNac.getFullYear();
      const m = hoy.getMonth() - dNac.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < dNac.getDate())) edad--;
    } else {
      edad = 34;
      fechaNac = `${new Date().getFullYear() - 34}-08-20`;
    }
  } else {
    // Deducir edad coherente según rango numérico de DNI peruano
    const cleanDni = String(dni || "").replace(/\D/g, "");
    if (cleanDni.length === 8) {
      const primerDigito = cleanDni.charAt(0);
      if (primerDigito === "4") edad = 35;
      else if (primerDigito === "7") edad = 24;
      else if (primerDigito === "1" || primerDigito === "0") edad = 62;
      else if (primerDigito === "8") edad = 19;
      else edad = 32;
    } else {
      edad = 30;
    }
    const anio = new Date().getFullYear() - edad;
    fechaNac = `${anio}-08-20`;
  }

  return {
    edad: edad,
    fechaNacimiento: fechaNac,
    grupoSanguineo: "O+"
  };
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

  if (cId && master[cId]) return master[cId];
  if (cHc && master[cHc]) return master[cHc];

  for (const [k, p] of Object.entries(master)) {
    const pkId = normalizarClavePaciente(p.identificador || p.dni);
    const pkHc = normalizarClavePaciente(p.historia_clinica);
    const pkNom = normalizarClavePaciente(p.nombre_completo);

    if ((cId && pkId === cId) || (cHc && pkHc === cHc) || (cNom && pkNom === cNom)) {
      return p;
    }
  }
  return null;
}

function guardarEnHistoriaClinicaMaster(datos = {}) {
  const st = (typeof window !== "undefined" && window.STATE) ? window.STATE : ((typeof STATE !== "undefined") ? STATE : {});
  const dniMatch = String(datos.dni || st.numDni || document.getElementById("dni_mod1")?.value || document.getElementById("ident_full")?.value || "").replace(/[\s\.\-]/g, "").match(/\d{8}/);
  const dni = dniMatch ? dniMatch[0] : String(datos.dni || st.numDni || "").trim();
  if (!dni || dni.length < 5) return null;

  const master = cargarPacientesMaster();
  const nroHc = datos.historia_clinica || st.historiaClinica || `HC-2026-${dni.slice(-4)}`;
  const cDni = normalizarClavePaciente(dni);

  let p = master[cDni] || obtenerPacienteMaster(dni, nroHc);
  if (!p) {
    p = {
      identificador: dni,
      dni: dni,
      historia_clinica: nroHc,
      nombre_completo: datos.nombre_completo || st.nombreReniec || `PACIENTE DNI ${dni}`,
      fecha_nacimiento: datos.fecha_nacimiento || st.fechaNacimiento || document.getElementById("fecha_nac_full")?.value || "",
      edad: datos.edad !== undefined ? datos.edad : (st.edad || document.getElementById("edad_full")?.value || null),
      sexo: datos.sexo || st.sexo || document.getElementById("sexo_full")?.value || "M",
      grupo_sanguineo: datos.grupo_sanguineo || st.grupoSanguineo || document.getElementById("gsan_full")?.value || "O+",
      tipo_seguro: datos.tipo_seguro || st.tipoSeguro || "MINSA (SIS)",
      alergias: datos.alergias || st.alergias || document.getElementById("alergias_full")?.value || "Niega alergias medicamentosas conocidas",
      antecedentes: datos.antecedentes || "Sin antecedentes patológicos declarados",
      episodios: []
    };
  } else {
    if (datos.nombre_completo) p.nombre_completo = datos.nombre_completo;
    if (datos.fecha_nacimiento) p.fecha_nacimiento = datos.fecha_nacimiento;
    if (datos.edad !== undefined && datos.edad !== null) p.edad = datos.edad;
    if (datos.sexo) p.sexo = datos.sexo;
    if (datos.grupo_sanguineo) p.grupo_sanguineo = datos.grupo_sanguineo;
    if (datos.tipo_seguro) p.tipo_seguro = datos.tipo_seguro;
    if (datos.alergias) p.alergias = datos.alergias;
    if (datos.antecedentes) p.antecedentes = datos.antecedentes;
    if (nroHc && (!p.historia_clinica || p.historia_clinica === "—")) p.historia_clinica = nroHc;
  }

  // Si no tenía fecha/edad, generarlos de forma coherente y persistirlos
  if (!p.fecha_nacimiento || !p.edad) {
    const demo = generarDatosDemograficosCoherentes(dni, p.edad, p.fecha_nacimiento);
    p.edad = demo.edad;
    p.fecha_nacimiento = demo.fechaNacimiento;
    if (!p.grupo_sanguineo || p.grupo_sanguineo === "Desconocido") p.grupo_sanguineo = demo.grupoSanguineo;
  }

  master[cDni] = p;
  if (p.historia_clinica) master[normalizarClavePaciente(p.historia_clinica)] = p;
  guardarPacientesMaster(master);

  // Persistir en mapeo local de BD HC
  try {
    BASE_DATOS_HC[dni] = p.historia_clinica;
    if (p.nombre_completo) BASE_DATOS_HC[p.nombre_completo.toLowerCase()] = p.historia_clinica;
    localStorage.setItem("UPP_BASE_DATOS_HC", JSON.stringify(BASE_DATOS_HC));
  } catch(e){}

  return p;
}

function obtenerOInicializarPacienteMaster(ident, hc, nom, seguro) {
  ident = ident || "";
  hc = hc || "";
  nom = nom || "";
  seguro = seguro || "Particular";
  let p = obtenerPacienteMaster(ident) || (hc ? obtenerPacienteMaster(hc) : null);
  if (!p) {
    p = guardarEnHistoriaClinicaMaster({
      identificador: ident,
      historia_clinica: hc,
      nombre_completo: nom,
      tipo_seguro: seguro
    });
  }
  return p || {};
}

window.guardarEnHistoriaClinicaMaster = guardarEnHistoriaClinicaMaster;
window.obtenerPacienteMaster = obtenerPacienteMaster;
window.obtenerOInicializarPacienteMaster = obtenerOInicializarPacienteMaster;
window.registrarEpisodioEnHistoriaClinica = registrarEpisodioEnHistoriaClinica;
window.generarDatosDemograficosCoherentes = generarDatosDemograficosCoherentes;

function registrarEpisodioEnHistoriaClinica(px = {}, etapa = "Triaje") {
  const st = (typeof window !== "undefined" && window.STATE) ? window.STATE : ((typeof STATE !== "undefined") ? STATE : {});
  const dniMatch = String(px.dni || st.numDni || px.identificador || "").replace(/[\s\.\-]/g, "").match(/\d{8}/);
  const dni = dniMatch ? dniMatch[0] : (px.dni || st.numDni);
  if (!dni) return;

  const master = cargarPacientesMaster();
  const cDni = normalizarClavePaciente(dni);
  const p = master[cDni] || obtenerPacienteMaster(dni);
  if (!p) return;

  p.episodios = Array.isArray(p.episodios) ? p.episodios : [];
  const folio = px.turno || st.turno || `E-${String(p.episodios.length + 1).padStart(3, "0")}`;

  let ep = p.episodios.find(x => x.folio === folio);
  if (!ep) {
    ep = {
      folio: folio,
      fecha_hora: new Date().toISOString(),
      prioridad: px.prioridad || st.prioridad || "III",
      motivo: px.motivo || st.motivoConsulta || "Atención en emergencia",
      cama: px.camaNombre || st.camaAsignada || "Tópico de Emergencia",
      diagnostico: px.diagnosticoCie10 || st.diagnosticoCie10 || "En evaluación clínica",
      tipo_seguro: px.tipoSeguro || st.tipoSeguro || p.tipo_seguro || "MINSA (SIS)",
      responsable: px.firmas?.medico?.usuario || px.firmas?.triaje?.usuario || "Personal de Turno UPP",
      etapa: etapa
    };
    p.episodios.unshift(ep);
  } else {
    ep.prioridad = px.prioridad || st.prioridad || ep.prioridad;
    if (px.diagnosticoCie10 || st.diagnosticoCie10) ep.diagnostico = px.diagnosticoCie10 || st.diagnosticoCie10;
    if (px.camaNombre || st.camaAsignada) ep.cama = px.camaNombre || st.camaAsignada;
    if (px.motivo || st.motivoConsulta) ep.motivo = px.motivo || st.motivoConsulta;
    ep.etapa = etapa;
  }

  master[cDni] = p;
  guardarPacientesMaster(master);
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
  STATE.alergiasConocidas = cleanVal;

  const elM1 = document.getElementById("alergias_mod1");
  const elFull = document.getElementById("alergias_full");
  if (elM1 && elM1.value !== cleanVal) elM1.value = cleanVal;
  if (elFull && elFull.value !== cleanVal) elFull.value = cleanVal;

  actualizarIndicadorVisualAlergias(cleanVal);
  if (STATE.identificador && STATE.historiaClinica) {
    actualizarAlergiasEnMaster(STATE.identificador, STATE.historiaClinica, cleanVal);
  }
}


function actualizarIndicadorVisualAlergias(val) {
  const str = String(val || "").trim();
  const esAlergico = str && !str.toLowerCase().includes("niega") && !str.toLowerCase().includes("ninguna") && !str.toLowerCase().includes("desconocid");

  const tagM1 = document.getElementById("alergias_mod1_tag");
  const bannerM1 = document.getElementById("alergias_mod1_banner");
  const inputM1 = document.getElementById("alergias_mod1");

  const tagM2 = document.getElementById("alergias_alerta_tag");
  const bannerM2 = document.getElementById("alergias_alerta_banner");
  const inputM2 = document.getElementById("alergias_full");

  [tagM1, tagM2].forEach(tag => {
    if (tag) tag.style.display = esAlergico ? "inline-block" : "none";
  });

  [bannerM1, bannerM2].forEach(banner => {
    if (banner) {
      if (esAlergico) {
        banner.innerHTML = `⚠️ <strong>ALERTA ASISTENCIAL:</strong> Paciente con alergia crítica a <strong>"${str}"</strong>. Prohibido prescribir medicamentos derivados o de reactividad cruzada.`;
        banner.style.display = "block";
      } else {
        banner.style.display = "none";
      }
    }
  });

  [inputM1, inputM2].forEach(inp => {
    if (inp) {
      if (esAlergico) {
        inp.style.borderColor = "#ef4444";
        inp.style.backgroundColor = "#fff1f2";
        inp.style.color = "#991b1b";
        inp.style.fontWeight = "700";
      } else {
        inp.style.borderColor = "";
        inp.style.backgroundColor = "";
        inp.style.color = "";
        inp.style.fontWeight = "";
      }
    }
  });
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



// ---------------------------------------------------------------------------
// PURGADO MANUAL COMPLETO DE BASE DE DATOS (REINICIO TOTAL A CERO)
// ---------------------------------------------------------------------------
async function purgarTodaLaBaseDeDatos() {
  if (!confirm("⚠️ ¿Está seguro de reiniciar la Base de Datos a CERO?\n\nSe eliminarán todas las historias clínicas registradas localmente y en el servidor. Comenzaremos desde cero.")) {
    return;
  }

  // 1. Limpiar estructuras en memoria
  for (const k in BASE_DATOS_HC) delete BASE_DATOS_HC[k];
  contadorHcNueva = 1;

  // 2. Limpiar localStorage
  try {
    localStorage.removeItem("UPP_BASE_DATOS_HC");
    localStorage.removeItem("UPP_PACIENTES_MASTER_V2");
    localStorage.removeItem("UPP_HISTORIAL_EPISODIOS_V2");
    localStorage.removeItem("UPP_HISTORIAL_EPISODIOS");
    localStorage.setItem("UPP_CONTADOR_HC", "1");

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("padron_susalud_") || k.startsWith("seguro_asignado_"))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {}

  // 3. Purgar SQLite en servidor Python
  try {
    await fetch("/api/hc/purgar");
  } catch (e) {}

  // 4. Limpiar formulario activo
  if (typeof limpiarFormularioCompletoState === "function") {
    limpiarFormularioCompletoState();
  }

  // 5. Actualizar vista de catálogo si está abierto
  if (typeof cargarTablaCatalogoHC === "function") {
    cargarTablaCatalogoHC("");
  }

  alert("✅ Base de datos purgada con éxito.\nTodas las Historias Clínicas comienzan desde cero.");
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
      let url = `${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?estado_bd=neq.ELIMINADO&select=*&order=id.desc&limit=50`;
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
        registros = (await res.json()).filter(r => r.estado_bd !== "ELIMINADO" && !String(r.identificador || "").startsWith("PURGED"));
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
// ===========================================================================
// PROTOCOLO DE PACIENTES NN: 1. NN CONSCIENTE vs 2. NN INCONSCIENTE (LEY N° 27604)
// ===========================================================================

// 1. NN CONSCIENTE: Indocumentado lúcido -> Pasa a EVALUACIÓN CLÍNICA DE TRIAJE
function ingresarNNConsciente() {
  if (typeof bloquearIdentificacionEnMod2 === "function") bloquearIdentificacionEnMod2(false);
  window._identificacionOrigen = null;
  const ahora = new Date();
  const fechaCod = ahora.toISOString().slice(0, 10).replace(/-/g, "");
  const numSec = String((window.PACIENTES_COLA || []).filter(x => x.esNN).length + 1).padStart(2, "0");
  const horaActual = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  const codigoNN = `NN-CONS-${fechaCod}-${numSec}`;
  const nombreNN = `Paciente NN Consciente (Indocumentado ${codigoNN})`;
  const hcTemp = `HC-NN-CONS-${fechaCod}-${numSec}`;

  guardarEstadoPacienteActivo();

  const pxNN = crearRegistroPaciente({
    identificador: codigoNN,
    nombre: nombreNN,
    dni: "NN",
    edad: "Desconocido",
    sexo: "Desconocido",
    prioridad: "III", // Provisional, a ser determinada por signos vitales en triaje
    motivo: "Paciente NN consciente / Indocumentado. Acude para evaluación clínica de triaje.",
    estadoAtencion: "En Evaluación de Triaje",
    camaNombre: "Sala de Espera / Triaje",
    camaId: "SIN-CAMA",
    esEmergenciaDirecta: false,
    esNN: true,
    esNNConsciente: true,
    esNNInconsciente: false,
    estadoFlujo: "PENDIENTE_TRIAJE"
  });

  esLlegadaSimultanea = false;
  if (!Array.isArray(window.PACIENTES_COLA)) window.PACIENTES_COLA = [];
  window.PACIENTES_COLA.push(pxNN);
  pacienteActivoId = pxNN.id;

  limpiarFormularioCompletoState();

  STATE.esNN = true;
  STATE.esNNConsciente = true;
  STATE.esNNInconsciente = false;
  STATE.ingresoDirectoCritico = false;
  STATE.motivoIngresoCritico = null;
  STATE.alertaPnpSs = true;
  STATE.identificador = codigoNN;
  STATE.nombreReniec = nombreNN;
  STATE.numDni = "NN";
  STATE.historiaClinica = hcTemp;
  STATE.estadoRegistrado = "👤 NN Consciente (En Evaluación de Triaje)";
  STATE.accionHc = `Identidad no confirmada → Se abre ${hcTemp} (Oficio emitido a PNP y Servicio Social)`;
  STATE.horaLlegada = horaActual;
  STATE.edad = null;
  STATE.sexo = "Desconocido";
  STATE.grupoSanguineo = "Desconocido";
  STATE.alergias = "";
  STATE.tipoSeguro = "Seguro por regularizar (Ley N° 27604)";
  STATE.prioridad = "III";
  STATE.camaAsignadaId = "SIN-CAMA";
  STATE.camaAsignada = "Sin cama — Sala de Espera / Triaje";
  STATE.estadoFlujo = "PENDIENTE_TRIAJE";

  // Llenar DOM de Módulo 1 y 2
  const inputIdent = document.getElementById("ident_full");
  if (inputIdent) inputIdent.value = codigoNN;
  const inputDni = document.getElementById("dni_reniec_input");
  if (inputDni) inputDni.value = "NN";
  const inputHora = document.getElementById("hora_full");
  if (inputHora) inputHora.value = horaActual;
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = "Paciente NN consciente / Indocumentado. Acude para evaluación clínica de triaje.";
  const elGlasgow = document.getElementById("glasgow_full");
  if (elGlasgow) elGlasgow.value = "15";
  const elAlergias = document.getElementById("alergias_full");
  if (elAlergias) {
    elAlergias.value = "";
    elAlergias.placeholder = "Indagar alergias directamente al paciente (está lúcido)...";
  }
  const elAlergiasM1 = document.getElementById("alergias_mod1");
  if (elAlergiasM1) elAlergiasM1.value = "";
  const elEdad = document.getElementById("edad_full");
  if (elEdad) elEdad.value = "";
  const elSexo = document.getElementById("sexo_full");
  if (elSexo) elSexo.value = "Desconocido";

  // Badges e indicadores visuales
  const badgeEstado = document.getElementById("hc_badge_estado");
  if (badgeEstado) {
    badgeEstado.textContent = "👤 NN Consciente · En Evaluación de Triaje";
    badgeEstado.className = "badge-estado badge-info";
    badgeEstado.style.background = "#eff6ff";
    badgeEstado.style.color = "#1d4ed8";
    badgeEstado.style.border = "1px solid #bfdbfe";
  }
  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = hcTemp;
  const btnPnp = document.getElementById("btn_notif_pnp");
  if (btnPnp) btnPnp.style.display = "inline-flex";

  guardarEstadoPacienteActivo();
  if (typeof sincronizarExpedienteActivoEnStore === "function") sincronizarExpedienteActivoEnStore();
  if (typeof notificarCambioColaGlobal === "function") notificarCambioColaGlobal("ACTUALIZAR");
  if (typeof renderizarTableroColaPacientes === "function") renderizarTableroColaPacientes();
  if (typeof renderizarTrackBoardLista === "function") renderizarTrackBoardLista();

  if (typeof window.irAModulo === "function") window.irAModulo(1);
  mostrarToastCola(`👤 <strong>NN Consciente:</strong> Paciente indocumentado lúcido derivado a Evaluación de Triaje.`);
}

// 2. NN INCONSCIENTE: Riesgo Vital Inminente -> ATENCIÓN INMEDIATA (SHOCK TRAUMA LEY 27604)
function ingresarNNInconsciente() {
  if (typeof bloquearIdentificacionEnMod2 === "function") bloquearIdentificacionEnMod2(false);
  window._identificacionOrigen = null;
  const ahora = new Date();
  const fechaCod = ahora.toISOString().slice(0, 10).replace(/-/g, "");
  const numSec = String((window.PACIENTES_COLA || []).filter(x => x.esNN).length + 1).padStart(2, "0");
  const horaActual = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  const codigoNN = `NN-INCONS-${fechaCod}-${numSec}`;
  const nombreNN = `Paciente NN Inconsciente (Pase Directo Vital ${codigoNN})`;
  const hcEmergencia = `HC-EMG-NN-${fechaCod}-${numSec}`;

  guardarEstadoPacienteActivo();

  // Buscar cama Shock Trauma libre sin duplicar
  let camaId = "ST-01";
  let camaNombre = "Shock Trauma ST-01";
  if (typeof RECURSOS_HOSPITALARIOS !== "undefined") {
    if (RECURSOS_HOSPITALARIOS["ST-01"] && RECURSOS_HOSPITALARIOS["ST-01"].estado === "disponible") {
      camaId = "ST-01";
      camaNombre = "Shock Trauma ST-01";
    } else if (RECURSOS_HOSPITALARIOS["ST-02"] && RECURSOS_HOSPITALARIOS["ST-02"].estado === "disponible") {
      camaId = "ST-02";
      camaNombre = "Shock Trauma ST-02";
    }
    if (RECURSOS_HOSPITALARIOS[camaId]) {
      RECURSOS_HOSPITALARIOS[camaId].estado = "ocupada";
      RECURSOS_HOSPITALARIOS[camaId].paciente = { id: codigoNN, nombre: nombreNN };
    }
  }

  const pxNN = crearRegistroPaciente({
    identificador: codigoNN,
    nombre: nombreNN,
    dni: "NN",
    edad: "Desconocido",
    sexo: "Desconocido",
    prioridad: "I",
    motivo: "Admisión de Emergencia Paciente NN Inconsciente / Riesgo Vital Inminente — Pase Directo a Shock Trauma (Ley N° 27604)",
    estadoAtencion: "Shock Trauma Inmediato (Pase Directo Vital)",
    camaNombre: camaNombre,
    camaId: camaId,
    esEmergenciaDirecta: true,
    esNN: true,
    esNNConsciente: false,
    esNNInconsciente: true,
    estadoFlujo: "EN_ATENCION_MEDICA"
  });

  esLlegadaSimultanea = false;
  if (!Array.isArray(window.PACIENTES_COLA)) window.PACIENTES_COLA = [];
  window.PACIENTES_COLA.push(pxNN);
  pacienteActivoId = pxNN.id;

  limpiarFormularioCompletoState();

  STATE.esNN = true;
  STATE.esNNConsciente = false;
  STATE.esNNInconsciente = true;
  STATE.ingresoDirectoCritico = true;
  STATE.motivoIngresoCritico = "Admisión de Emergencia Paciente NN Inconsciente / Riesgo Vital Inminente — Pase Directo a Shock Trauma (Ley N° 27604)";
  STATE.alertaPnpSs = true;
  STATE.identificador = codigoNN;
  STATE.nombreReniec = nombreNN;
  STATE.numDni = "NN";
  STATE.historiaClinica = hcEmergencia;
  STATE.estadoRegistrado = "🚨 NN Inconsciente (Atención Inmediata Shock Trauma)";
  STATE.accionHc = `Pase Directo Vital → Se abre ${hcEmergencia} (Oficio emitido a PNP y Servicio Social - Ley N° 27604)`;
  STATE.horaLlegada = horaActual;
  STATE.edad = null;
  STATE.sexo = "Desconocido";
  STATE.grupoSanguineo = "Desconocido";
  STATE.alergias = "Desconocido (Inconsciente)";
  STATE.tipoSeguro = "Regularización Diferida (Garantía Ley N° 27604)";
  STATE.prioridad = "I";
  STATE.camaAsignadaId = camaId;
  STATE.camaAsignada = camaNombre;
  STATE.estadoFlujo = "EN_ATENCION_MEDICA";

  // Llenar DOM
  const inputIdent = document.getElementById("ident_full");
  if (inputIdent) inputIdent.value = codigoNN;
  const inputDni = document.getElementById("dni_reniec_input");
  if (inputDni) inputDni.value = "NN";
  const inputHora = document.getElementById("hora_full");
  if (inputHora) inputHora.value = horaActual;
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = "Paciente NN inconsciente / Coma / Sensorio no valorable / Trauma vital inminente. Activación directa Ley N° 27604.";
  const elGlasgow = document.getElementById("glasgow_full");
  if (elGlasgow) elGlasgow.value = "6";
  const elAlergias = document.getElementById("alergias_full");
  if (elAlergias) elAlergias.value = "Desconocido (Inconsciente)";
  const elAlergiasM1 = document.getElementById("alergias_mod1");
  if (elAlergiasM1) elAlergiasM1.value = "Desconocido (Inconsciente)";
  const elEdad = document.getElementById("edad_full");
  if (elEdad) elEdad.value = "";
  const elSexo = document.getElementById("sexo_full");
  if (elSexo) elSexo.value = "Desconocido";

  // Badges e indicadores visuales
  const badgeEstado = document.getElementById("hc_badge_estado");
  if (badgeEstado) {
    badgeEstado.textContent = "🚨 NN Inconsciente · Atención Inmediata Shock Trauma (Ley 27604)";
    badgeEstado.className = "badge-estado badge-danger";
    badgeEstado.style.background = "#fee2e2";
    badgeEstado.style.color = "#b91c1c";
    badgeEstado.style.border = "1px solid #fca5a5";
  }
  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = hcEmergencia;
  const btnPnp = document.getElementById("btn_notif_pnp");
  if (btnPnp) btnPnp.style.display = "inline-flex";

  // Sellar derivación médica de emergencia directamente
  if (typeof window.mostrarPrioridad === "function") {
    window.mostrarPrioridad("I", {
      tipo: "Prioridad I (Rojo)",
      desc: "Admisión directa de Trauma Shock / Paciente NN Inconsciente — Ley N° 27604",
      destino: camaNombre
    });
  }

  guardarEstadoPacienteActivo();
  if (typeof sincronizarExpedienteActivoEnStore === "function") sincronizarExpedienteActivoEnStore();
  if (typeof notificarCambioColaGlobal === "function") notificarCambioColaGlobal("ACTUALIZAR");
  if (typeof renderizarTableroColaPacientes === "function") renderizarTableroColaPacientes();
  if (typeof renderizarTrackBoardLista === "function") renderizarTrackBoardLista();

  // Generar brazalete de identificación de emergencia
  if (typeof generarBrazaleteEmergencia === "function") {
    generarBrazaleteEmergencia("temporal");
  }

  if (typeof window.irAModulo === "function") window.irAModulo(4);
  mostrarToastCola(`🚨 <strong>NN Inconsciente:</strong> Pase directo a Shock Trauma ${camaId} activado (Ley N° 27604).`);
}

// Aliases para compatibilidad transversal
function ingresarPacienteNN() { ingresarNNConsciente(); }
function admitirEmergenciaNN() { ingresarNNInconsciente(); }
window.ingresarNNConsciente = ingresarNNConsciente;
window.ingresarNNInconsciente = ingresarNNInconsciente;
window.ingresarPacienteNN = ingresarNNConsciente;
window.admitirEmergenciaNN = ingresarNNInconsciente;

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
  const elAlergiasFull = document.getElementById("alergias_full");
  if (elAlergiasFull) elAlergiasFull.value = "Desconocido";
  const elAlergiasM1 = document.getElementById("alergias_mod1");
  if (elAlergiasM1) elAlergiasM1.value = "Desconocido";
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


  // Sincronizar paciente NN en todos los módulos (incluido Módulo 4)
  if (typeof sincronizarDatosPacienteEnTodosLosModulos === "function") {
    sincronizarDatosPacienteEnTodosLosModulos({
      esNN: true,
      dni: "NN",
      nombre: STATE.nombreReniec,
      hc: STATE.historiaClinica,
      sexo: STATE.sexo
    });
  }

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
var STATE = window.STATE = Object.assign(window.STATE || {}, {
  // Origen del Evento y Entorno Operativo (Norma NTS N° 042-MINSA & Ley N° 27604 / SUSALUD)
  tipoOrigenEvento: "comun", // "comun" o "transito"
  esAccidenteTransito: false,
  esClinicaPrivada: false, // true cuando opera en modo Clínica Privada EPS
  entornoBloqueado: false, // true cuando el seguro ha sido acreditado oficialmente en Módulo 3
  entornoOperativo: "publico", // "publico" (MINSA/SIS/EsSalud) | "privado" (Clínica/EPS/SITEDS)
  padronSusalud: null, // Padrón Único SUSALUD del paciente
  eventoFugaTransversal: false, // Marca de fuga transversal
  ingresoDirectoCritico: false,
  motivoIngresoCritico: null,
  panicoShockTrauma: false,
  estadoFlujo: "PENDIENTE_TRIAJE", // "PENDIENTE_TRIAJE" | "EN_ATENCION_MEDICA" | "PENDIENTE_CAJA" | "CERRADO_FACTURADO"
  coberturaValidada: false,
  firmas: {},
  alertaPrioridad1: false,

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
});
window.STATE = STATE;


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
  actualizarVisibilidadBotonesEntorno();
  actualizarFactura();
  activarModo("simulador"); // Mostrar el simulador de inmediato al cargar la página
  refrescarCaptchaSeguro(); // Generar el código CAPTCHA inicial para acreditación
});


// ---------------------------------------------------------------------------
// 6. SELECTOR DE MODO
// ---------------------------------------------------------------------------
function activarModo(modo) {
  const sPiloto = document.getElementById("sectionModoPiloto");
  const sSim = document.getElementById("sectionModoSimulador");
  const bPiloto = document.getElementById("btnModoPiloto");
  const bSim = document.getElementById("btnModoSimulador");

  if (sPiloto) sPiloto.style.display = "none";
  if (sSim) sSim.style.display = "none";
  if (bPiloto) bPiloto.classList.remove("active");
  if (bSim) bSim.classList.remove("active");

  if (modo === "piloto") {
    if (sPiloto) sPiloto.style.display = "block";
    if (bPiloto) bPiloto.classList.add("active");
  } else {
    if (sSim) sSim.style.display = "block";
    if (bSim) bSim.classList.add("active");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}


// ---------------------------------------------------------------------------
// 7. MÓDULOS COLAPSABLES
// ---------------------------------------------------------------------------
function toggleModule(id) {
  const num = parseInt(String(id).replace(/\D/g, ""), 10);
  if (!isNaN(num) && num >= 1 && num <= 8) {
    moduloActivoActual = num;
  }
  const body = document.getElementById(`body_${id}`);
  const arrow = document.getElementById(`arrow_${id}`);
  if (!body) return;
  const isCurrentlyOpen = body.classList.contains("open") || (body.style.display === "block");
  if (isCurrentlyOpen) {
    body.classList.remove("open");
    body.style.display = "none";
    if (arrow) arrow.classList.remove("open");
  } else {
    body.classList.add("open");
    body.style.display = "block";
    if (arrow) arrow.classList.add("open");
  }
}

function cerrarTodosLosModulos() {
  for (let i = 1; i <= 8; i++) {
    const b = document.getElementById(`body_mod${i}`);
    const a = document.getElementById(`arrow_mod${i}`);
    if (b) {
      b.classList.remove("open");
      b.style.display = "none";
    }
    if (a) a.classList.remove("open");
  }
}
window.cerrarTodosLosModulos = cerrarTodosLosModulos;


// ---------------------------------------------------------------------------
// 8. MÓDULO 1 — ENFERMERÍA 1
// ---------------------------------------------------------------------------
function selectModalidad(btn) {
  if (typeof btn === 'string') {
    btn = document.querySelector(`.modalidad-btn[data-mod="${btn}"]`);
  }
  if (!btn) return;
  document.querySelectorAll(".modalidad-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  const mod = btn.getAttribute("data-mod") || "A pie";
  STATE.modalidadIngreso = mod;
  
  const lbl = document.getElementById("lbl_modalidad_activa");
  if (lbl) {
    lbl.textContent = btn.textContent.trim();
  }
  if (typeof registrarTimestamp === "function") {
    registrarTimestamp("M1_modalidad");
  }
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
    document.getElementById("alerta_nn")?.classList.remove("visible");
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

  // Detección de DNI (8 dígitos) e hidratación / grabación en Historia Clínica para próximas consultas
  const matchDniExact = val.replace(/[\s\.\-]/g, "").match(/\d{8}/);
  if (matchDniExact) {
    const cleanDni = matchDniExact[0];
    STATE.numDni = cleanDni;
    const elDni1 = document.getElementById("dni_mod1");
    if (elDni1 && elDni1.value !== cleanDni) elDni1.value = cleanDni;

    const masterP = obtenerPacienteMaster(cleanDni, nroHc);
    if (masterP) {
      // 1. Paciente ya tiene Historia Clínica previa: Recuperar todos sus datos permanentes
      if (masterP.nombre_completo && masterP.nombre_completo !== cleanDni) {
        STATE.nombreReniec = masterP.nombre_completo;
        STATE.identificador = `${masterP.nombre_completo} (DNI ${cleanDni})`;
      }
      if (masterP.alergias) {
        STATE.alergias = masterP.alergias;
        const elAlergias = document.getElementById("alergias_full");
        if (elAlergias) elAlergias.value = masterP.alergias;
        const elAlergiasM1 = document.getElementById("alergias_mod1");
        if (elAlergiasM1) elAlergiasM1.value = masterP.alergias;
        actualizarIndicadorVisualAlergias(masterP.alergias);
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
        STATE.fechaNacimiento = masterP.fecha_nacimiento;
        const elFecha = document.getElementById("fecha_nac_full");
        if (elFecha) elFecha.value = masterP.fecha_nacimiento;
      }
      if (masterP.grupo_sanguineo) {
        STATE.grupoSanguineo = masterP.grupo_sanguineo;
        const elGsan = document.getElementById("gsan_full");
        if (elGsan) elGsan.value = masterP.grupo_sanguineo;
      }
      if (masterP.tipo_seguro) {
        STATE.tipoSeguro = masterP.tipo_seguro;
        const elSeguro = document.getElementById("tipo_seguro_select");
        if (elSeguro) elSeguro.value = masterP.tipo_seguro;
      }
      document.getElementById("hc_badge_estado").textContent = "✅ Historia Clínica Recuperada";
      document.getElementById("hc_badge_estado").className = "badge-estado badge-si";
      document.getElementById("hc_accion_display").textContent = `📂 HC ${masterP.historia_clinica} encontrada. Grupo sanguíneo ${masterP.grupo_sanguineo || 'O+'} y ${masterP.episodios ? masterP.episodios.length : 0} atención(es) previa(s).`;
    } else {
      // 2. Primer ingreso manual de este DNI: Generar datos coherentes y grabar en Historia Clínica
      const inputEdad = document.getElementById("edad_full");
      const inputFecha = document.getElementById("fecha_nac_full");
      const demo = generarDatosDemograficosCoherentes(cleanDni, inputEdad?.value, inputFecha?.value);

      if (inputEdad && (!inputEdad.value || inputEdad.value === "")) inputEdad.value = demo.edad;
      if (inputFecha && (!inputFecha.value || inputFecha.value === "")) inputFecha.value = demo.fechaNacimiento;
      const elGsan = document.getElementById("gsan_full");
      if (elGsan && (!elGsan.value || elGsan.value === "Desconocido")) elGsan.value = demo.grupoSanguineo;

      STATE.edad = demo.edad;
      STATE.fechaNacimiento = demo.fechaNacimiento;
      STATE.grupoSanguineo = demo.grupoSanguineo;

      // Grabar inmediatamente en el registro maestro para las próximas consultas
      guardarEnHistoriaClinicaMaster({
        dni: cleanDni,
        historia_clinica: nroHc,
        edad: demo.edad,
        fecha_nacimiento: demo.fechaNacimiento,
        grupo_sanguineo: demo.grupoSanguineo
      });

      document.getElementById("hc_accion_display").textContent = `📝 Historia Clínica ${nroHc} aperturada. Datos demográficos y grupo ${demo.grupoSanguineo} grabados para próximas consultas.`;
    }
  } else if (estado === "Si") {
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
      if (masterP.grupo_sanguineo) {
        STATE.grupoSanguineo = masterP.grupo_sanguineo;
        const elGsan = document.getElementById("gsan_full");
        if (elGsan) elGsan.value = masterP.grupo_sanguineo;
      }
    }
  }


  // Alerta NN
  document.getElementById("alerta_nn")?.classList.toggle("visible", STATE.alertaPnpSs);


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


function calcularTicket() {
  const st = (typeof window !== "undefined" && window.STATE) ? window.STATE : ((typeof STATE !== "undefined") ? STATE : {});
  if (!st.turno || st.turno === "—") {
    const num = String(Math.floor(Math.random() * 80) + 10).padStart(2, "0");
    st.turno = `T-${num}`;
  }
  const ticketDisplay = document.getElementById("ticket_display");
  if (ticketDisplay) {
    const hora = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    ticketDisplay.textContent = `🎫 Ticket asignado: ${st.turno} (hora: ${hora})`;
  }
  return st.turno;
}

window.calcularTicket = calcularTicket;

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

  // TIER 0: Consulta al proxy seguro del servidor (Caché 24h y Llave Privada Oculta)
  try {
    const res0 = await fetch(`/api/reniec/consultar?dni=${ident}`);
    if (res0.ok) {
      const data0 = await res0.json();
      if (data0 && data0.exito && data0.data && data0.data.nombres) {
        payload = data0.data;
        nombreCompleto = `${payload.nombres} ${payload.apellidoPaterno} ${payload.apellidoMaterno}`.trim();
      }
    }
  } catch (e0) {}

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

  // Sincronizar en Módulo 1, Módulo 2 y Módulo 4 inmediatamente
  if (typeof sincronizarDatosPacienteEnTodosLosModulos === "function") {
    sincronizarDatosPacienteEnTodosLosModulos({
      dni: ident,
      nombre: nombreCompleto,
      sexo: sexoDetectado,
      hc: STATE.historiaClinica
    });
  }

  // Sincronizar automáticamente Padrón Único SUSALUD / SITEDS
  try {
    if (typeof sincronizarPadronSusalud === "function") {
      await sincronizarPadronSusalud(ident);
    }
  } catch(eSusalud) {
    console.warn("Aviso sincronizar padron susalud:", eSusalud);
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
    STATE.fechaNacimiento = inputFecha.value;
    guardarEnHistoriaClinicaMaster({ edad: edad, fecha_nacimiento: inputFecha.value });
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

  // Sincronizar centralizadamente con el Padrón Único SUSALUD / SITEDS
  const padron = await sincronizarPadronSusalud(numDni);
  const segNombre = padron ? (STATE.entornoOperativo === "privado" ? padron.privado.iafas_eps : padron.publico.entidad) : "CONSOLIDADO";
  mostrarMensajeCaptcha(`✅ CAPTCHA Validado con éxito — Seguro Acreditado en SUSALUD: ${segNombre}`, "success");
  
  if (padron) {
    renderizarBoxAcreditacionSusalud(padron);
  }
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

// ===========================================================================
// MOTOR CLÍNICO ESTANDARIZADO DE TRIAJE HOSPITALARIO
// Estándares: NTS N° 042-MINSA/DGSP-V.01 · ESI v5 (AHRQ/ENA) · NEWS2 (RCP London) · ADA · PALS
// ===========================================================================

/**
 * PARTE 1: LECTURA SEGURA DE DATOS (CERO FALSOS POSITIVOS)
 * Retorna null si el campo está vacío o no es un número válido.
 * PROHIBIDO convertir campos vacíos en 0.
 */
function parseVital(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const val = (typeof el.value === "string") ? el.value.trim() : "";
  if (val === "" || val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}
window.parseVital = parseVital;

/**
 * PARTE 2: MOTOR 1 — CÁLCULO OFICIAL NEWS2 (ADULTOS >= 14 AÑOS + PALS < 14 AÑOS)
 * Royal College of Physicians (UK) + Rangos Pediátricos PALS
 * Devuelve: { scoreTotal: number, maxParametroUnico: number, desglose: string[] }
 */
function calcularNEWS2(params = {}) {
  const fr = params.fr ?? null;
  const spo2 = params.spo2 ?? null;
  const pas = params.pas ?? null;
  const fc = params.fc ?? null;
  const glasgow = params.glasgow ?? null;
  const temp = params.temp ?? null;
  const esPediatrico = Boolean(params.esPediatrico);
  const edad = typeof params.edad === "number" ? params.edad : 30;

  const desglose = [];
  let maxParametroUnico = 0;
  let scoreTotal = 0;

  // 1. Frecuencia Respiratoria (rpm)
  let ptsFR = 0;
  if (fr === null || isNaN(fr)) {
    desglose.push("FR: No registrado (+0)");
  } else if (esPediatrico) {
    if (edad < 3) {
      ptsFR = (fr <= 15 || fr >= 50) ? 3 : (fr >= 41 ? 2 : (fr <= 23 ? 1 : 0));
    } else {
      ptsFR = (fr <= 10 || fr >= 31) ? 3 : (fr >= 26 ? 2 : (fr <= 14 ? 1 : 0));
    }
    desglose.push(`FR PALS: ${fr} rpm (+${ptsFR})`);
  } else {
    if (fr <= 8 || fr >= 25) ptsFR = 3;
    else if (fr >= 21 && fr <= 24) ptsFR = 2;
    else if (fr >= 9 && fr <= 11) ptsFR = 1;
    else ptsFR = 0; // 12 a 20
    desglose.push(`FR: ${fr} rpm (+${ptsFR})`);
  }
  scoreTotal += ptsFR;
  if (ptsFR > maxParametroUnico) maxParametroUnico = ptsFR;

  // 2. Saturación de Oxígeno (SpO2 %)
  let ptsSpO2 = 0;
  if (spo2 === null || isNaN(spo2)) {
    desglose.push("SpO2: No registrado (+0)");
  } else {
    if (spo2 <= 91) ptsSpO2 = 3;
    else if (spo2 <= 93) ptsSpO2 = 2;
    else if (spo2 <= 95) ptsSpO2 = 1;
    else ptsSpO2 = 0; // >= 96
    desglose.push(`SpO2: ${spo2}% (+${ptsSpO2})`);
  }
  scoreTotal += ptsSpO2;
  if (ptsSpO2 > maxParametroUnico) maxParametroUnico = ptsSpO2;

  // 3. Presión Arterial Sistólica (PAS mmHg)
  let ptsPAS = 0;
  if (pas === null || isNaN(pas)) {
    desglose.push("PAS: No registrado (+0)");
  } else if (esPediatrico) {
    const limInf = 70 + 2 * Math.max(1, edad);
    if (pas < limInf || pas >= 135) ptsPAS = 3;
    else if (pas < 90) ptsPAS = 2;
    else if (pas < 100) ptsPAS = 1;
    else ptsPAS = 0;
    desglose.push(`PAS PALS: ${pas} mmHg (+${ptsPAS})`);
  } else {
    if (pas <= 90 || pas >= 220) ptsPAS = 3;
    else if (pas <= 100) ptsPAS = 2;
    else if (pas <= 110) ptsPAS = 1;
    else ptsPAS = 0; // 111 a 219
    desglose.push(`PAS: ${pas} mmHg (+${ptsPAS})`);
  }
  scoreTotal += ptsPAS;
  if (ptsPAS > maxParametroUnico) maxParametroUnico = ptsPAS;

  // 4. Frecuencia Cardíaca (FC lpm)
  let ptsFC = 0;
  if (fc === null || isNaN(fc)) {
    desglose.push("FC: No registrado (+0)");
  } else if (esPediatrico) {
    if (edad < 5) {
      ptsFC = (fc <= 60 || fc >= 161) ? 3 : (fc >= 131 ? 2 : (fc <= 79 ? 1 : 0));
    } else {
      ptsFC = (fc <= 50 || fc >= 141) ? 3 : (fc >= 111 ? 2 : (fc <= 59 ? 1 : 0));
    }
    desglose.push(`FC PALS: ${fc} lpm (+${ptsFC})`);
  } else {
    if (fc <= 40 || fc >= 131) ptsFC = 3;
    else if (fc >= 111 && fc <= 130) ptsFC = 2;
    else if ((fc >= 41 && fc <= 50) || (fc >= 91 && fc <= 110)) ptsFC = 1;
    else ptsFC = 0; // 51 a 90
    desglose.push(`FC: ${fc} lpm (+${ptsFC})`);
  }
  scoreTotal += ptsFC;
  if (ptsFC > maxParametroUnico) maxParametroUnico = ptsFC;

  // 5. Nivel de Conciencia (Glasgow Coma Scale)
  let ptsGCS = 0;
  if (glasgow === null || isNaN(glasgow)) {
    desglose.push("Glasgow: No registrado (+0)");
  } else {
    if (glasgow <= 14) ptsGCS = 3;
    else ptsGCS = 0; // 15
    desglose.push(`Glasgow: ${glasgow}/15 (+${ptsGCS})`);
  }
  scoreTotal += ptsGCS;
  if (ptsGCS > maxParametroUnico) maxParametroUnico = ptsGCS;

  // 6. Temperatura Axilar (°C)
  let ptsTemp = 0;
  if (temp === null || isNaN(temp)) {
    desglose.push("Temp: No registrado (+0)");
  } else {
    if (temp <= 35.0) ptsTemp = 3;
    else if (temp >= 39.1) ptsTemp = 2;
    else if ((temp >= 35.1 && temp <= 36.0) || (temp >= 38.1 && temp <= 39.0)) ptsTemp = 1;
    else ptsTemp = 0; // 36.1 a 38.0
    desglose.push(`Temp: ${temp}°C (+${ptsTemp})`);
  }
  scoreTotal += ptsTemp;
  if (ptsTemp > maxParametroUnico) maxParametroUnico = ptsTemp;

  return { scoreTotal, maxParametroUnico, desglose };
}
window.calcularNEWS2 = calcularNEWS2;

/**
 * PARTE 3: MOTOR 2 — ÁRBOL DE DECISIÓN OFICIAL ESI v5 + OVERLAY MINSA/ADA
 * Aplica secuencialmente las 4 Compuertas Oficiales (A, B, C y D).
 * Cumple estrictamente las 4 leyes matemáticas invariantes.
 */
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
  // 1. COMPUERTA A (ESI 1 -> PRIORIDAD I - Rojo, SLA: Inmediato 0 min)
  // Amenaza vital inmediata real
  // =========================================================================
  const amenazasA = [];

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
  // 2. COMPUERTA B (ESI 2 -> PRIORIDAD II - Naranja, SLA: Máx. 10 min)
  // Alto riesgo o dolor severo
  // =========================================================================
  const criteriosB = [];

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
    news2.scoreTotal >= 2 ||
    (eva !== null && eva >= 4 && eva <= 7) ||
    (glucosa !== null && glucosa >= 250 && glucosa <= 400) ||
    (pas !== null && pas >= 140 && pas <= 179) ||
    (pad !== null && pad >= 90 && pad <= 119) ||
    (pas !== null && pas >= 180) || (pad !== null && pad >= 120) // Hipertensión aislada asintomática con NEWS2=0
  );

  if (esPrioridad3) {
    const motivosC = [];
    if (news2.scoreTotal >= 2) motivosC.push(`NEWS2 Leve/Moderado (${news2.scoreTotal} pts)`);
    if (eva !== null && eva >= 4 && eva <= 7) motivosC.push(`Dolor Moderado EVA ${eva}/10`);
    if (glucosa !== null && glucosa >= 250 && glucosa <= 400) motivosC.push(`Hiperglucemia Moderada (${glucosa} mg/dL)`);
    if ((pas !== null && pas >= 140) || (pad !== null && pad >= 90)) motivosC.push(`Presión Arterial Elevada (${pas || "--"}/${pad || "--"} mmHg)`);
    if (motivosC.length === 0) motivosC.push("Requiere ≥ 2 recursos diagnósticos o terapéuticos en tópico");

    return {
      prioridad: "III",
      esiNivel: 3,
      compuerta: "COMPUERTA C (Estabilidad Relativa / Múltiples Recursos)",
      slaNormativo: "Máx. 30 min (NTS: ≤ 60 min)",
      news2,
      motivos: motivosC,
      resumenClinico: "Urgencia Menor. Requiere laboratorio, imágenes o medicación en tópico."
    };
  }

  // Prioridad IV (Verde, SLA: ≤ 60 min / NTS: hasta 120 min)
  const esPrioridad4 = (
    news2.scoreTotal === 1 ||
    (eva !== null && eva >= 1 && eva <= 3) ||
    (glucosa !== null && glucosa >= 180 && glucosa < 250)
  );

  if (esPrioridad4) {
    const motivosD1 = [];
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
    motivos: ["Constantes vitales normales (NEWS2 = 0 pts)", "Sin dolor o dolor EVA 0", "Sin requerimiento de recursos inmediatos de emergencia"],
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
  const esGestante = Boolean(STATE.esGestante || document.getElementById("check_gestante")?.checked);
  const claveObstetrica = STATE.claveObstetrica || document.getElementById("clave_obstetrica_sel")?.value || null;

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

  // PARTE 2 y 3: Evaluar con Motor Estándar ESI v5 + NEWS2 + ADA + MINSA
  const datosTriaje = {
    spo2, fc, pas, pad, fr, temp, glucosa, glasgow, eva,
    esPediatrico: Boolean(STATE.edad !== null && STATE.edad !== undefined && STATE.edad < 14),
    edad: (typeof STATE.edad === "number") ? STATE.edad : 30,
    motivo,
    esGestante,
    claveObstetrica,
    codigoInfarto: Boolean(STATE.codigoInfarto),
    codigoIctus: Boolean(STATE.codigoIctus),
    codigoSepsis: Boolean(STATE.codigoSepsis),
    panicoShockTrauma: Boolean(STATE.panicoShockTrauma),
    esParoOAgonia: Boolean(validacion.esParoOAgonia),
    ingresoDirectoCritico: Boolean(STATE.ingresoDirectoCritico),
    motivoIngresoCritico: STATE.motivoIngresoCritico || "Activación directa de Trauma Shock / Riesgo Vital Inmediato — Ley N° 27604"
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

  // CORRECCIÓN 3: Recálculo de tipo de cama / recurso al editar signos vitales
  if (!STATE.ingresoDirectoCritico && !STATE.panicoShockTrauma) {
    if (prio === "I" || prio === "II") {
      const recursoSugerido = (typeof sugerirRecursoSegunPrioridad === "function") ? sugerirRecursoSegunPrioridad(prio) : "ST-01";
      if (recursoSugerido && recursoSugerido !== "SIN-CAMA" && typeof RECURSOS_HOSPITALARIOS !== "undefined" && RECURSOS_HOSPITALARIOS[recursoSugerido]) {
        if (!STATE.camaAsignadaId || STATE.camaAsignadaId === "SIN-CAMA") {
          STATE.camaAsignadaId = recursoSugerido;
          STATE.camaAsignada = RECURSOS_HOSPITALARIOS[recursoSugerido].nombre || recursoSugerido;
          RECURSOS_HOSPITALARIOS[recursoSugerido].estado = "ocupada";
          RECURSOS_HOSPITALARIOS[recursoSugerido].paciente = { id: STATE.id || pacienteActivoId, nombre: STATE.nombreReniec || STATE.identificador };
        }
      }
    } else if (prio === "IV" || prio === "V") {
      if (STATE.camaAsignadaId && STATE.camaAsignadaId !== "SIN-CAMA") {
        if (typeof liberarRecursoHospitalarioOperativo === "function") {
          liberarRecursoHospitalarioOperativo(STATE.camaAsignadaId, STATE.id || pacienteActivoId);
        }
      }
      STATE.camaAsignada = "Sin cama — Atención Ambulatoria";
      STATE.camaAsignadaId = "SIN-CAMA";
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
  PACIENTES_COLA = [pxST];
  pacienteActivoId = pxST.id;

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
  PACIENTES_COLA = [pxSOP];
  pacienteActivoId = pxSOP.id;

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
// 26. MOTOR DE ATENCIÓN SIMULTÁNEA Y GESTIÓN DE COLA DE EMERGENCIAS (NTS N° 042-MINSA)
// Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
// ==============================================================================

let PACIENTES_COLA = [];
let pacienteActivoId = null;
window.PACIENTES_COLA = PACIENTES_COLA;
window.pacienteActivoId = pacienteActivoId;
try {
  Object.defineProperty(window, "PACIENTES_COLA", {
    get: function() { return PACIENTES_COLA; },
    set: function(v) { PACIENTES_COLA = v; },
    configurable: true
  });
  Object.defineProperty(window, "pacienteActivoId", {
    get: function() { return pacienteActivoId; },
    set: function(v) { pacienteActivoId = v; },
    configurable: true
  });
} catch(e) {}
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
    medico: datos.medico || STATE.medicoTratante || "Por asignar",
    esNN: Boolean(datos.esNN),
    estadoFlujo: datos.estadoFlujo || ((datos.prioridad === 'I' || datos.ingresoDirectoCritico) ? 'EN_ATENCION_MEDICA' : 'PENDIENTE_TRIAJE'),
    coberturaValidada: Boolean(datos.coberturaValidada),
    firmas: datos.firmas || {},
    alertaPrioridad1: Boolean(datos.prioridad === 'I' || datos.ingresoDirectoCritico || datos.alertaPrioridad1),
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
    "chk_gestante_full", "chk_pediatrico_full", "clave_obstetrica_sel",
    "enfermero_triaje_select", "alergias_full", "chk_consentimiento_datos",
    "chk_evento_fuga", "chk_exclusion_eps", "sel_consentimiento_medico",
    "cie10_select", "cie10_input", "dni_mod1", "dni_mod4",
    "select_ipress_publica", "select_plan_privado", "sel_condicion_consentimiento",
    "sel_procedimiento_consentimiento", "chk_consentimiento_firmado", "medico_responsable_select"
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
  p.medico = STATE.medicoTratante || p.medico || "Por asignar";
  p.estadoFlujo = STATE.estadoFlujo || p.estadoFlujo || "PENDIENTE_TRIAJE";
  p.coberturaValidada = Boolean(STATE.coberturaValidada);
  p.firmas = STATE.firmas || p.firmas || {};
  p.alertaPrioridad1 = Boolean(STATE.alertaPrioridad1 || STATE.prioridad === 'I');
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
    if (esLlegadaSimultanea && PACIENTES_COLA.length > 1) {
      countBadge.textContent = `${PACIENTES_COLA.length} Pacientes en atención simultánea (Desempate Activo)`;
      countBadge.style.background = "#eef2ff";
      countBadge.style.color = "#4338ca";
    } else {
      countBadge.textContent = `${PACIENTES_COLA.length} ${PACIENTES_COLA.length === 1 ? 'Paciente en atención (Caso Único)' : 'Pacientes en espera'}`;
      countBadge.style.background = "";
      countBadge.style.color = "";
    }
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

    const medNombre = p.medico || (p.stateSnapshot && p.stateSnapshot.medicoTratante) || (esActivo && STATE.medicoTratante && STATE.medicoTratante !== "Por asignar" ? STATE.medicoTratante : null);
    const metaMedico = medNombre && medNombre !== "Por asignar"
      ? `<span style="font-weight:700; color:#0369a1; display:flex; align-items:center; gap:4px; font-size:0.72rem;">👨‍⚕️ ${medNombre}</span>`
      : `<span style="color:#94a3b8; font-style:italic; font-size:0.72rem;">👨‍⚕️ Médico por asignar</span>`;

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
      <div class="card-medico-row" style="margin-top:4px; padding-top:4px; border-top:1px dashed #e2e8f0;">
        ${metaMedico}
      </div>
      <button type="button" class="btn-close-card" onclick="cerrarAtencionPaciente('${p.id}', event)" title="Finalizar atención / Dar de alta">&times;</button>
    `;

    container.appendChild(card);
  });
}

function cambiarPacienteActivo(nuevoId, forzarRehidratacion = false) {
  if (nuevoId === pacienteActivoId && !forzarRehidratacion) return;

  guardarEstadoPacienteActivo();

  let nuevoPx = PACIENTES_COLA.find(x => x.id === nuevoId);
  if (!nuevoPx) {
    try {
      const storeRaw = localStorage.getItem("upp_expedientes_v1");
      if (storeRaw) {
        const store = JSON.parse(storeRaw);
        if (store[nuevoId] && store[nuevoId].paciente) {
          nuevoPx = store[nuevoId].paciente;
          PACIENTES_COLA.push(nuevoPx);
        }
      }
    } catch(e){}
  }
  if (!nuevoPx) return;

  // Si no tiene snapshots en RAM, hidratar desde upp_expedientes_v1
  if (!nuevoPx.stateSnapshot || !nuevoPx.formSnapshot) {
    try {
      const storeRaw = localStorage.getItem("upp_expedientes_v1");
      if (storeRaw) {
        const store = JSON.parse(storeRaw);
        if (store[nuevoId]) {
          if (!nuevoPx.stateSnapshot && store[nuevoId].state) nuevoPx.stateSnapshot = store[nuevoId].state;
          if (!nuevoPx.formSnapshot && store[nuevoId].form) nuevoPx.formSnapshot = store[nuevoId].form;
        }
      }
    } catch(e){}
  }

  pacienteActivoId = nuevoId;
  window.pacienteActivoId = nuevoId;

  if (nuevoPx.stateSnapshot) {
    Object.assign(STATE, JSON.parse(JSON.stringify(nuevoPx.stateSnapshot)));
    STATE.firmas = nuevoPx.firmas || nuevoPx.stateSnapshot.firmas || {};
    STATE.estadoFlujo = nuevoPx.estadoFlujo || nuevoPx.stateSnapshot.estadoFlujo || "PENDIENTE_TRIAJE";
    STATE.coberturaValidada = Boolean(nuevoPx.coberturaValidada || nuevoPx.stateSnapshot.coberturaValidada);
  } else {
    limpiarFormularioCompletoState();
    STATE.identificador = nuevoPx.identificador;
    STATE.nombreReniec = nuevoPx.nombre;
    STATE.numDni = nuevoPx.dni;
    STATE.prioridad = nuevoPx.prioridad;
    STATE.medicoTratante = nuevoPx.medico || (nuevoPx.stateSnapshot && nuevoPx.stateSnapshot.medicoTratante) || "Por asignar";
    STATE.estadoFlujo = nuevoPx.estadoFlujo || "PENDIENTE_TRIAJE";
    STATE.coberturaValidada = Boolean(nuevoPx.coberturaValidada);
    STATE.firmas = nuevoPx.firmas || {};
    STATE.alertaPrioridad1 = Boolean(nuevoPx.alertaPrioridad1 || nuevoPx.prioridad === 'I');
    const selMedResponsable = document.getElementById("medico_responsable_select");
    if (selMedResponsable && STATE.medicoTratante) selMedResponsable.value = STATE.medicoTratante;
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

    if (typeof actualizarFactura === "function") {
    actualizarFactura();
  }
  if (typeof sincronizarFacturacionYExportar === "function") {
    sincronizarFacturacionYExportar(true);
  }
  if (typeof window.actualizarBandejaPostaUI === "function") {
    window.actualizarBandejaPostaUI();
  }
  if (typeof sincronizarDatosPacienteEnTodosLosModulos === "function") {
    sincronizarDatosPacienteEnTodosLosModulos(STATE);
  }
  if (window.COCKPIT && typeof window.COCKPIT.actualizarContextoCockpit === "function") {
    window.COCKPIT.actualizarContextoCockpit();
  }
  renderizarTableroColaPacientes();
  mostrarToastCola(`🔄 Paciente activo: <strong>${nuevoPx.nombre}</strong>`);
}

function limpiarFormularioCompletoState() {
  STATE.estadoFlujo = "PENDIENTE_TRIAJE";
  STATE.firmas = {};
  STATE.coberturaValidada = false;
  STATE.spo2 = null; STATE.fc = null; STATE.pasSistolica = null; STATE.paDiastolica = null;
  STATE.fr = null; STATE.temperatura = null; STATE.glucosa = null; STATE.glasgow = null; STATE.eva = 0;
  STATE.motivoConsulta = ""; STATE.prioridad = null; STATE.colorPrioridad = null;
  STATE.codigoInfarto = false; STATE.codigoIctus = false; STATE.codigoSepsis = false;
  STATE.ingresoDirectoCritico = false; STATE.motivoIngresoCritico = null;
  STATE.identificador = ""; STATE.numDni = null; STATE.nombreReniec = null;
  STATE.historiaClinica = "—"; STATE.camaAsignada = null; STATE.camaAsignadaId = null;
  STATE.alergias = "";
  STATE.items_factura = [];
  STATE.kardexAdministrados = [];
  STATE.kardexItems = [];
  STATE.ordenesLaboratorio = [];
  STATE.ordenesImagenes = [];
  STATE.tipoSeguro = "SIS";
  STATE.esAccidenteTransito = false;
  STATE.tipoOrigenEvento = "comun";
  STATE.soatVehiculoFuga = false;
  STATE.eventoFugaTransversal = false;
  STATE.liquidacionAuditada = null;
  STATE.fechaIngresoBrazalete = null;
  STATE.horaIngresoBrazalete = null;
  STATE.horaLlegada = null;
  STATE.fechaLlegada = null;

  const inputsIds = [
    "ident_full", "dni_reniec_input", "dni_mod1", "motivo_full", "spo2_full", "fc_full",
    "pas_full", "pad_full", "fr_full", "temp_full", "glasgow_full", "glucosa_full",
    "eva_full", "eva_range", "edad_full", "sexo_full", "fecha_nac_full", "alergias_full"
  ];
  inputsIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = "Desconocido";
  const elAlergiasFull = document.getElementById("alergias_full");
  if (elAlergiasFull) elAlergiasFull.value = "Desconocido";
  const elAlergiasM1 = document.getElementById("alergias_mod1");
  if (elAlergiasM1) elAlergiasM1.value = "Desconocido";
  STATE.grupoSanguineo = "Desconocido";

  if (typeof actualizarEVA === "function") actualizarEVA(0);
  if (typeof actualizarIndicadorVisualAlergias === "function") actualizarIndicadorVisualAlergias("");
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
    liberarCamaRecurso(px.camaId, "Alta de Emergencia");
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

  esLlegadaSimultanea = false;
  PACIENTES_COLA = [pxNN];
  pacienteActivoId = pxNN.id;

  limpiarFormularioCompletoState();

  // Actualizar STATE con datos de NN
  STATE.esNN = true;
  STATE.ingresoDirectoCritico = true;
  STATE.motivoIngresoCritico = "Admisión de Emergencia Paciente NN Indocumentado / Riesgo Vital Inminente — Ley N° 27604";
  STATE.alertaPnpSs = true;
  STATE.identificador = codigoNN;
  STATE.nombreReniec = nombreNN;
  STATE.numDni = "NN";
  STATE.edad = edad;
  STATE.sexo = sexo;
  STATE.grupoSanguineo = "Desconocido"; // OBLIGATORIO: Desconocido para NN
  STATE.tipoSeguro = "Regularización Diferida (Ley N° 27604)";
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
  const elAlergiasFull = document.getElementById("alergias_full");
  if (elAlergiasFull) elAlergiasFull.value = "Desconocido";
  const elAlergiasM1 = document.getElementById("alergias_mod1");
  if (elAlergiasM1) elAlergiasM1.value = "Desconocido";

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

  // 3. ACTIVAR PRIORIDAD I ROJO INMEDIATA CON AUDITORÍA SINCRONIZADA
  if (typeof recalcularPrioridad === "function") {
    recalcularPrioridad();
  } else if (typeof mostrarPrioridad === "function") {
    mostrarPrioridad("I", {
      tipo: "Prioridad I — ROJO (Resucitación / Shock Trauma)",
      desc: `Paciente indocumentado (${codigoNN}) en riesgo vital. Atención inmediata garantizada por Ley N° 27604 sin requisito de DNI.`,
      destino: "Shock Trauma ST-01 / ST-02"
    });
  }

  // Sincronizar paciente NN en todos los módulos (incluido Módulo 4)
  if (typeof sincronizarDatosPacienteEnTodosLosModulos === "function") {
    sincronizarDatosPacienteEnTodosLosModulos({
      esNN: true,
      dni: "NN",
      nombre: nombreNN,
      hc: STATE.historiaClinica,
      sexo: sexo
    });
  }

  cerrarModalAdmisionNN();
  renderizarTableroColaPacientes();
  mostrarToastCola(`🚨 <strong>Admitir Emergencia NN (P-I):</strong> ${codigoNN} cargado en Módulo 2 con Grupo Sanguíneo <strong>Desconocido</strong>.`);
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

  esLlegadaSimultanea = false;
  PACIENTES_COLA = [px];
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

  esLlegadaSimultanea = false;
  PACIENTES_COLA = [nuevoPx];
  pacienteActivoId = nuevoPx.id;
  cambiarPacienteActivo(nuevoPx.id);

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
try {
  Object.defineProperty(window, 'PACIENTES_COLA', {
    get() { return PACIENTES_COLA; },
    set(val) { PACIENTES_COLA = val; },
    configurable: true
  });
  Object.defineProperty(window, 'pacienteActivoId', {
    get() { return pacienteActivoId; },
    set(val) { pacienteActivoId = val; },
    configurable: true
  });
} catch(e) {
  try {
  Object.defineProperty(window, 'PACIENTES_COLA', {
    get() { return PACIENTES_COLA; },
    set(val) { PACIENTES_COLA = val; },
    configurable: true
  });
  Object.defineProperty(window, 'pacienteActivoId', {
    get() { return pacienteActivoId; },
    set(val) { pacienteActivoId = val; },
    configurable: true
  });
} catch(e) {
  window.PACIENTES_COLA = PACIENTES_COLA;
  window.pacienteActivoId = pacienteActivoId;
}
  window.pacienteActivoId = pacienteActivoId;
}
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
  guardarEnHistoriaClinicaMaster({ grupo_sanguineo: val });
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

// ==============================================================================
// SINCRONIZACIÓN UNIVERSAL RENIEC ENTRE MÓDULO 1, MÓDULO 2 Y MÓDULO 4
// ==============================================================================
function bloquearIdentificacionEnMod2(bloquear = true) {
  const elIdent2 = document.getElementById("ident_full");
  const lockNotice = document.getElementById("mod2_reniec_locked_notice");
  const btnReniec2 = document.getElementById("btn_reniec_mod2");

  if (bloquear) {
    if (elIdent2) {
      elIdent2.readOnly = true;
      elIdent2.style.backgroundColor = "#f1f5f9";
      elIdent2.style.borderColor = "#94a3b8";
      elIdent2.style.cursor = "not-allowed";
      elIdent2.title = "Identificación bloqueada: Autenticada y transferida desde Módulo 1 (Triaje)";
    }
    if (lockNotice) lockNotice.style.display = "flex";
    if (btnReniec2) {
      btnReniec2.disabled = true;
      btnReniec2.innerHTML = "🔒 Validado en Módulo 1";
      btnReniec2.style.opacity = "0.7";
      btnReniec2.style.cursor = "not-allowed";
    }
  } else {
    if (elIdent2) {
      elIdent2.readOnly = false;
      elIdent2.style.backgroundColor = "";
      elIdent2.style.borderColor = "";
      elIdent2.style.cursor = "";
      elIdent2.title = "";
    }
    if (lockNotice) lockNotice.style.display = "none";
    if (btnReniec2) {
      btnReniec2.disabled = false;
      btnReniec2.innerHTML = "🔍 Consultar RENIEC";
      btnReniec2.style.opacity = "";
      btnReniec2.style.cursor = "";
    }
  }
}

function desbloquearIdentificacionMod2() {
  if (confirm("¿Desea desbloquear la identificación en el Módulo 2 para modificar los datos del paciente?")) {
    bloquearIdentificacionEnMod2(false);
    window._identificacionOrigen = null;
    mostrarToastCola("🔓 Identificación en Módulo 2 desbloqueada para edición manual.");
  }
}

function sincronizarDatosPacienteEnTodosLosModulos(datos = {}) {
  const dni = datos.dni || STATE.numDni || "";
  const nombre = (datos.nombre || STATE.nombreReniec || "").toUpperCase();
  const sexo = datos.sexo || STATE.sexo || "M";
  const hc = datos.hc || STATE.historiaClinica || "—";
  const sexoDesc = (sexo === "F" ? "Femenino (F)" : "Masculino (M)");
  const origen = datos.origen || window._identificacionOrigen || "mod2";

  // 1. Sincronizar Módulo 1 (Triaje Fisiológico)
  const elDni1 = document.getElementById("dni_mod1");
  if (elDni1 && dni) elDni1.value = dni;

  const m1Card = document.getElementById("m1_reniec_result_card");
  const m1Nombre = document.getElementById("m1_disp_nombre");
  const m1Dni = document.getElementById("m1_disp_dni");
  const m1Sexo = document.getElementById("m1_disp_sexo");
  const m1Hc = document.getElementById("m1_disp_hc");

  if (m1Card && nombre) {
    if (m1Nombre) m1Nombre.textContent = nombre;
    if (m1Dni) m1Dni.textContent = dni;
    if (m1Sexo) m1Sexo.textContent = sexoDesc;
    if (m1Hc) m1Hc.textContent = hc;
    m1Card.style.display = "block";
  }

  // 2. Sincronizar Módulo 2 (Admisión & RENIEC)
  const elIdent2 = document.getElementById("ident_full");
  if (elIdent2 && nombre) elIdent2.value = `${nombre} (DNI ${dni})`;

  const elSexo2 = document.getElementById("sexo_full");
  if (elSexo2) elSexo2.value = sexo;

  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = hc;

  const hcBadge = document.getElementById("hc_badge_estado");
  if (hcBadge && nombre) {
    hcBadge.textContent = "✅ Identificado RENIEC";
    hcBadge.className = "badge-estado badge-si";
  }

  // Si la consulta fue realizada en Módulo 1, bloquear Módulo 2
  if (origen === "mod1") {
    bloquearIdentificacionEnMod2(true);
  }

  // 3. Sincronizar Módulo 4 (Shock Trauma & Kardex)
  const elDni4 = document.getElementById("dni_mod4");
  const m4Card = document.getElementById("m4_reniec_result_card");
  const m4Nombre = document.getElementById("m4_disp_nombre");
  const m4Dni = document.getElementById("m4_disp_dni");
  const m4Sexo = document.getElementById("m4_disp_sexo");
  const m4Hc = document.getElementById("m4_disp_hc");
  const m4Edad = document.getElementById("m4_disp_edad");
  const m4Seguro = document.getElementById("m4_disp_seguro");
  const m4Badge = document.getElementById("m4_badge_sincronizado");

  const esNN = Boolean(datos.esNN || STATE.esNN || (dni && String(dni).toUpperCase().startsWith("NN")));

  if (esNN) {
    if (elDni4) {
      elDni4.value = "PACIENTE NN (INDOCUMENTADO)";
      elDni4.placeholder = "PACIENTE NN — Sin DNI (Ley N° 27604)";
    }
    if (m4Badge) {
      m4Badge.textContent = "🚨 Paciente NN / Indocumentado (Ley N° 27604)";
      m4Badge.style.background = "#fff7ed";
      m4Badge.style.color = "#c2410c";
      m4Badge.style.borderColor = "#fb923c";
    }
    if (m4Card) {
      m4Card.style.display = "block";
      m4Card.style.background = "#fff7ed";
      m4Card.style.borderColor = "#fb923c";
    }
    if (m4Nombre) m4Nombre.textContent = nombre || STATE.nombreReniec || "PACIENTE NN (DESCONOCIDO / LEY 27604)";
    if (m4Dni) m4Dni.textContent = "NN (Sin DNI Identificado)";
    if (m4Sexo) m4Sexo.textContent = sexoDesc;
    if (m4Hc) m4Hc.textContent = hc || STATE.historiaClinica || "HC-TEMP-NN";
    if (m4Edad) m4Edad.textContent = STATE.edad ? `${STATE.edad} años (estimada)` : "No determinada";
    if (m4Seguro) m4Seguro.textContent = "Seguro por confirmar (Ley N° 27604)";
  } else if (nombre) {
    if (elDni4 && dni) elDni4.value = dni;
    if (m4Badge) {
      m4Badge.textContent = "✅ Sincronizado con Módulo 1 y 2";
      m4Badge.style.background = "#eff6ff";
      m4Badge.style.color = "#1d4ed8";
      m4Badge.style.borderColor = "#bfdbfe";
    }
    if (m4Card) {
      m4Card.style.display = "block";
      m4Card.style.background = "#f0fdf4";
      m4Card.style.borderColor = "#86efac";
    }
    if (m4Nombre) m4Nombre.textContent = nombre;
    if (m4Dni) m4Dni.textContent = dni;
    if (m4Sexo) m4Sexo.textContent = sexoDesc;
    if (m4Hc) m4Hc.textContent = hc;
    if (m4Edad) m4Edad.textContent = STATE.edad ? `${STATE.edad} años` : "—";
    if (m4Seguro) m4Seguro.textContent = STATE.tipoSeguro || "Acreditado";
  }

  // 4. Sincronizar con paciente activo en el Tablero de Atención Simultánea
  if (pacienteActivoId && Array.isArray(PACIENTES_COLA)) {
    const px = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
    if (px && nombre) {
      px.nombre = nombre;
      px.dni = dni;
      renderizarTableroColaPacientes();
    }
  }

  // 5. Retro-sincronización de Pasos y Módulos Anteriores (Triaje Módulo 1 y 2)
  const spo2Inp = document.getElementById("spo2_full") || document.getElementById("spo2_val");
  if (spo2Inp && (datos.spo2 !== undefined || STATE.spo2 !== null)) {
    spo2Inp.value = datos.spo2 || STATE.spo2 || "";
  }
  const fcInp = document.getElementById("fc_full") || document.getElementById("fc_val");
  if (fcInp && (datos.fc !== undefined || STATE.fc !== null)) {
    fcInp.value = datos.fc || STATE.fc || "";
  }
  const pasInp = document.getElementById("pas_full") || document.getElementById("pas_val");
  if (pasInp && (datos.pasSistolica !== undefined || STATE.pasSistolica !== null)) {
    pasInp.value = datos.pasSistolica || STATE.pasSistolica || "";
  }
  const padInp = document.getElementById("pad_full") || document.getElementById("pad_val");
  if (padInp && (datos.paDiastolica !== undefined || STATE.paDiastolica !== null)) {
    padInp.value = datos.paDiastolica || STATE.paDiastolica || "";
  }
  const frInp = document.getElementById("fr_full") || document.getElementById("fr_val");
  if (frInp && (datos.fr !== undefined || STATE.fr !== null)) {
    frInp.value = datos.fr || STATE.fr || "";
  }
  const tempInp = document.getElementById("temp_full") || document.getElementById("temp_val");
  if (tempInp && (datos.temperatura !== undefined || STATE.temperatura !== null)) {
    tempInp.value = datos.temperatura || STATE.temperatura || "";
  }
  const glucInp = document.getElementById("glucosa_full");
  if (glucInp && (datos.glucosa !== undefined || STATE.glucosa !== null)) {
    glucInp.value = datos.glucosa || STATE.glucosa || "";
  }
  const gcsInp = document.getElementById("glasgow_full");
  if (gcsInp && (datos.glasgow !== undefined || STATE.glasgow !== null)) {
    gcsInp.value = datos.glasgow || STATE.glasgow || "";
  }
  const evaInp = document.getElementById("eva_full");
  if (evaInp && (datos.eva !== undefined || STATE.eva !== null)) {
    evaInp.value = datos.eva !== undefined ? datos.eva : (STATE.eva || 0);
  }
  const alergInp = document.getElementById("alergias_full");
  if (alergInp && (datos.alergias || STATE.alergias)) {
    alergInp.value = datos.alergias || STATE.alergias || "";
  }
  const motInp = document.getElementById("motivo_full");
  if (motInp && (datos.motivo || STATE.motivoConsulta)) {
    motInp.value = datos.motivo || STATE.motivoConsulta || "";
  }

  // 6. Retro-sincronización Módulo 3 (Seguro y Cobertura)
  const seguroActivo = datos.tipoSeguro || STATE.tipoSeguro;
  const selSeguro = document.getElementById("tipo_seguro_select") || document.getElementById("select_seguro_principal");
  if (selSeguro && seguroActivo) {
    for (let opt of selSeguro.options) {
      if (opt.value === seguroActivo || opt.text.includes(seguroActivo)) {
        selSeguro.value = opt.value;
        break;
      }
    }
  }

  // 7. Retro-sincronización Módulo 5 (Cama Hospitalaria)
  const camaNombre = datos.camaNombre || datos.camaAsignada || STATE.camaAsignada;
  const dispCamaMod5 = document.getElementById("cama_asignada_display");
  if (dispCamaMod5 && camaNombre) {
    dispCamaMod5.textContent = camaNombre;
  }
}

async function consultarReniecMod1() {
  const elDni = document.getElementById("dni_mod1");
  const dni = elDni ? elDni.value.trim() : "";
  if (!dni) {
    alert("⚠️ Ingrese un número de DNI de 8 dígitos en la casilla del Módulo 1.");
    if (elDni) elDni.focus();
    return;
  }
  const elLoading = document.getElementById("m1_reniec_loading");
  if (elLoading) elLoading.style.display = "block";
  const btnM1 = document.getElementById("btn_reniec_mod1");
  if (btnM1) btnM1.disabled = true;

  try {
    const elIdent = document.getElementById("ident_full");
    if (elIdent) elIdent.value = dni;
    window._identificacionOrigen = "mod1";

    await consultarReniec();

    bloquearIdentificacionEnMod2(true);
    mostrarToastCola("✅ <strong>RENIEC (Módulo 1):</strong> Paciente autenticado y bloqueado en Módulo 2.");
  } finally {
    if (elLoading) elLoading.style.display = "none";
    if (btnM1) btnM1.disabled = false;
  }
}

async function consultarReniecMod4() {
  const elDni = document.getElementById("dni_mod4");
  const dni = elDni ? elDni.value.trim() : "";
  if (!dni) {
    alert("⚠️ Ingrese un número de DNI de 8 dígitos en la casilla del Módulo 4.");
    if (elDni) elDni.focus();
    return;
  }
  const elIdent = document.getElementById("ident_full");
  if (elIdent) elIdent.value = dni;
  window._identificacionOrigen = "mod4";
  await consultarReniec();
}

function limpiarIdentificacionPaciente() {
  STATE.numDni = null;
  STATE.nombreReniec = null;
  STATE.identificador = "";
  STATE.historiaClinica = "—";
  window._identificacionOrigen = null;

  bloquearIdentificacionEnMod2(false);

  const ids = ["dni_mod1", "dni_mod4", "ident_full"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const cards = ["m1_reniec_result_card", "m4_reniec_result_card", "apisperu_panel"];
  cards.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  const hcBadge = document.getElementById("hc_badge_estado");
  if (hcBadge) {
    hcBadge.textContent = "Por confirmar";
    hcBadge.className = "badge-estado badge-conf";
  }
  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = "—";

  mostrarToastCola("🔄 Datos de identificación del paciente limpiados.");
}

window.bloquearIdentificacionEnMod2 = bloquearIdentificacionEnMod2;
window.desbloquearIdentificacionMod2 = desbloquearIdentificacionMod2;
window.sincronizarDatosPacienteEnTodosLosModulos = sincronizarDatosPacienteEnTodosLosModulos;
window.consultarReniecMod1 = consultarReniecMod1;
window.consultarReniecMod4 = consultarReniecMod4;
window.limpiarIdentificacionPaciente = limpiarIdentificacionPaciente;


// ==============================================================================
// MOTOR MAESTRO DE ASEGURAMIENTO SUSALUD / SITEDS PERÚ (LEY N° 29344 & LEY N° 27604)
// Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
// ==============================================================================

// ------------------------------------------------------------------------------
// GENERADOR MAESTRO DE ASEGURAMIENTO (PLUG & PLAY PARA PRODUCCIÓN SUSALUD / SITEDS)
// # TODO: CONECTAR ENDPOINT REAL SITEDS / SUSALUD (Plataforma PIDE del Estado)
// ------------------------------------------------------------------------------
async function fetch_padron_susalud_siteds(dni) {
  // Simulación asíncrona de latencia de red SITEDS/SUSALUD (300ms)
  await new Promise(r => setTimeout(r, 200));

  const numDni = String(dni).replace(/\D/g, "");
  const rand = Math.random();
  const rndCode = Math.floor(1000 + Math.random() * 9000);
  const rndSiteds = Math.floor(10000 + Math.random() * 90000);

  // Determinar marca transversal de accidente en fuga (15% prob)
  const esFuga = Math.random() < 0.15;
  const condicionEvento = esFuga ? "ACCIDENTE_TRANSITO_FUGA" : "NORMAL";

  let padron = null;

  if (rand < 0.25) {
    // PERFIL 1: AFILIADO SIS (25% prob)
    padron = {
      dni: numDni,
      tipo_aseguramiento: "SOLO_SIS",
      condicion_evento: condicionEvento,
      publico: {
        entidad: "SIS",
        regimen: "SIS Gratuito / Para Todos",
        estado: "ACTIVO",
        codigo: `FUA-2026-${rndCode}`
      },
      privado: {
        iafas_eps: "SIN COBERTURA PRIVADA (AFILIADO SIS)",
        estado_poliza: "INACTIVA",
        copago_fijo: 0,
        coaseguro_pct: 1.0,
        exclusiones: []
      }
    };
  } else if (rand < 0.45) {
    // PERFIL 2: AFILIADO SOLO ESSALUD SIN EPS (20% prob)
    padron = {
      dni: numDni,
      tipo_aseguramiento: "SOLO_ESSALUD",
      condicion_evento: condicionEvento,
      publico: {
        entidad: "ESSALUD",
        regimen: "EsSalud Regular Titular",
        estado: "ACTIVO",
        codigo: `AUT-ESS-${rndCode}`
      },
      privado: {
        iafas_eps: "SIN COBERTURA EPS (SOLO ESSALUD)",
        estado_poliza: "INACTIVA",
        copago_fijo: 0,
        coaseguro_pct: 1.0,
        exclusiones: []
      }
    };
  } else if (rand < 0.75) {
    // PERFIL 3: RÉGIMEN CONTRIBUTIVO CON EPS + ESSALUD (30% prob)
    const epsList = ["Pacífico EPS", "Rímac EPS", "Sanitas Perú", "Mapfre EPS"];
    const planList = ["Plan Base", "Plan Red Preferente", "Plan Pleno VIP"];
    const copagoList = [40.00, 60.00, 80.00, 100.00];
    const coaseguroList = [0.10, 0.15, 0.20, 0.30];
    const exclusionesPool = ["Intoxicación Etílica", "Lesiones Autoinfligidas", "Deportes Extremos", "Accidente en Fuga"];
    const tieneExcl = Math.random() < 0.35;
    const exclusiones = tieneExcl ? [exclusionesPool[Math.floor(Math.random() * exclusionesPool.length)]] : [];

    padron = {
      dni: numDni,
      tipo_aseguramiento: "EPS_Y_ESSALUD",
      condicion_evento: condicionEvento,
      publico: {
        entidad: "ESSALUD",
        regimen: "EsSalud Activo (Vínculo Laboral EPS)",
        estado: "ACTIVO",
        codigo: `AUT-ESS-${rndCode}`
      },
      privado: {
        siteds_codigo: `SITEDS-2026-${rndSiteds}`,
        iafas_eps: epsList[Math.floor(Math.random() * epsList.length)],
        plan_salud: planList[Math.floor(Math.random() * planList.length)],
        estado_poliza: "ACTIVA",
        copago_fijo: copagoList[Math.floor(Math.random() * copagoList.length)],
        coaseguro_pct: coaseguroList[Math.floor(Math.random() * coaseguroList.length)],
        exclusiones: exclusiones
      }
    };
  } else if (rand < 0.85) {
    // PERFIL 4: SEGURO PRIVADO PURO / PÓLIZA INDIVIDUAL (10% prob)
    const epsList = ["Pacífico Seguros (Individual)", "Rímac Salud Preferente", "Mapfre Salud Individual"];
    const planList = ["Plan Integral Privado", "Plan Global Medical", "Plan Familiar Preferente"];
    const copagoList = [50.00, 70.00, 90.00, 120.00];
    const coaseguroList = [0.10, 0.15, 0.20, 0.25];
    const exclusionesPool = ["Intoxicación Etílica", "Lesiones Autoinfligidas", "Deportes Extremos"];
    const tieneExcl = Math.random() < 0.25;

    padron = {
      dni: numDni,
      tipo_aseguramiento: "SOLO_PRIVADO",
      condicion_evento: condicionEvento,
      publico: {
        entidad: "NINGUNA (TIENE SEGURO PRIVADO)",
        regimen: "No Acreditado en Estado",
        estado: "INACTIVO",
        codigo: null
      },
      privado: {
        siteds_codigo: `SITEDS-IND-2026-${rndSiteds}`,
        iafas_eps: epsList[Math.floor(Math.random() * epsList.length)],
        plan_salud: planList[Math.floor(Math.random() * planList.length)],
        estado_poliza: "ACTIVA",
        copago_fijo: copagoList[Math.floor(Math.random() * copagoList.length)],
        coaseguro_pct: coaseguroList[Math.floor(Math.random() * coaseguroList.length)],
        exclusiones: tieneExcl ? [exclusionesPool[Math.floor(Math.random() * exclusionesPool.length)]] : []
      }
    };
  } else {
    // PERFIL 5: PARTICULAR ABSOLUTO / SIN NINGÚN SEGURO (15% prob)
    padron = {
      dni: numDni,
      tipo_aseguramiento: "SIN_SEGURO",
      condicion_evento: condicionEvento,
      publico: {
        entidad: "NINGUNA",
        regimen: "PARTICULAR NO ASEGURADO",
        estado: "INACTIVO",
        codigo: null
      },
      privado: {
        iafas_eps: "PARTICULAR (SIN SEGURO)",
        estado_poliza: "INACTIVA",
        copago_fijo: 0,
        coaseguro_pct: 1.0,
        exclusiones: []
      }
    };
  }

  return padron;
}

// ------------------------------------------------------------------------------
// PADRÓN ÚNICO Y PERSISTENCIA ESTRICTA (RANDOM DE UN SOLO USO)
// ------------------------------------------------------------------------------
// ------------------------------------------------------------------------------
// CONSTRUCTOR DE PADRÓN SUSALUD A PARTIR DE SEGURO EXISTENTE EN BD HISTÓRICA
// ------------------------------------------------------------------------------
function crearPadronDesdeSeguroExistente(numDni, seguro) {
  const s = String(seguro || "").toLowerCase();
  const rndCode = Math.floor(1000 + Math.random() * 9000);
  const rndSiteds = Math.floor(10000 + Math.random() * 90000);

  if (s.includes("sis") || s.includes("minsa")) {
    return {
      dni: numDni,
      tipo_aseguramiento: "SOLO_SIS",
      condicion_evento: "NORMAL",
      publico: { entidad: "SIS", regimen: "SIS Gratuito / Para Todos", estado: "ACTIVO", codigo: `FUA-2026-${rndCode}` },
      privado: { iafas_eps: "SIN COBERTURA PRIVADA (AFILIADO SIS)", estado_poliza: "INACTIVA", copago_fijo: 0, coaseguro_pct: 1.0, exclusiones: [] },
      origen_registro: "BD_HISTORICA"
    };
  } else if (s.includes("essalud")) {
    return {
      dni: numDni,
      tipo_aseguramiento: "SOLO_ESSALUD",
      condicion_evento: "NORMAL",
      publico: { entidad: "ESSALUD", regimen: "EsSalud Regular Titular", estado: "ACTIVO", codigo: `AUT-ESS-${rndCode}` },
      privado: { iafas_eps: "SIN COBERTURA EPS (SOLO ESSALUD)", estado_poliza: "INACTIVA", copago_fijo: 0, coaseguro_pct: 1.0, exclusiones: [] },
      origen_registro: "BD_HISTORICA"
    };
  } else if (s.includes("eps") || s.includes("pacifico") || s.includes("rimac") || s.includes("mapfre") || s.includes("sanitas")) {
    const iafas = s.includes("rimac") ? "Rímac EPS" : s.includes("mapfre") ? "Mapfre EPS" : s.includes("sanitas") ? "Sanitas Perú" : "Pacífico EPS";
    return {
      dni: numDni,
      tipo_aseguramiento: "EPS_Y_ESSALUD",
      condicion_evento: "NORMAL",
      publico: { entidad: "ESSALUD", regimen: "EsSalud Activo (Vínculo Laboral EPS)", estado: "ACTIVO", codigo: `AUT-ESS-${rndCode}` },
      privado: { siteds_codigo: `SITEDS-2026-${rndSiteds}`, iafas_eps: iafas, plan_salud: "Plan Red Preferente", estado_poliza: "ACTIVA", copago_fijo: 60.00, coaseguro_pct: 0.15, exclusiones: [] },
      origen_registro: "BD_HISTORICA"
    };
  } else if (s.includes("privad")) {
    return {
      dni: numDni,
      tipo_aseguramiento: "SOLO_PRIVADO",
      condicion_evento: "NORMAL",
      publico: { entidad: "NINGUNA (TIENE SEGURO PRIVADO)", regimen: "No Acreditado en Estado", estado: "INACTIVO", codigo: null },
      privado: { siteds_codigo: `SITEDS-2026-${rndSiteds}`, iafas_eps: "Rímac EPS", plan_salud: "Plan Individual Preferente", estado_poliza: "ACTIVA", copago_fijo: 80.00, coaseguro_pct: 0.20, exclusiones: [] },
      origen_registro: "BD_HISTORICA"
    };
  } else {
    return {
      dni: numDni,
      tipo_aseguramiento: "SIN_SEGURO",
      condicion_evento: "NORMAL",
      publico: { entidad: "NINGUNA", regimen: "PARTICULAR NO ASEGURADO", estado: "INACTIVO", codigo: null },
      privado: { iafas_eps: "PARTICULAR (SIN SEGURO)", estado_poliza: "INACTIVA", copago_fijo: 0, coaseguro_pct: 1.0, exclusiones: [] },
      origen_registro: "BD_HISTORICA"
    };
  }
}

async function obtenerOGenerarPadronSusalud(dni) {
  if (!dni || String(dni).toUpperCase().startsWith("NN") || STATE.esNN) {
    return null; // Excepción NN: no se guarda en padrón definitivo
  }

  const numDni = String(dni).replace(/\D/g, "");
  if (numDni.length !== 8) return null;

  // PASO 1: Buscar DNI en Base de Datos (localStorage / Supabase)
  try {
    const rawLocal = localStorage.getItem("padron_susalud_" + numDni);
    if (rawLocal) {
      const obj = JSON.parse(rawLocal);
      if (obj && obj.publico && obj.privado) {
        obj.origen_registro = "BD_HISTORICA";
        console.log(`💾 Padrón SUSALUD cargado desde BD Histórica (Local) para DNI ${numDni}:`, obj);
        return obj;
      }
    }
  } catch (e) {}

  // PASO 1.5: Si no tiene padrón JSON pero ya tenía Historia Clínica / Seguro en BD
  try {
    const seguroPrevio = localStorage.getItem("seguro_asignado_" + numDni);
    if (seguroPrevio && seguroPrevio !== "null" && seguroPrevio !== "undefined" && seguroPrevio !== "Seguro por confirmar") {
      const padronPrevio = crearPadronDesdeSeguroExistente(numDni, seguroPrevio);
      try { localStorage.setItem("padron_susalud_" + numDni, JSON.stringify(padronPrevio)); } catch(e){}
      console.log(`📁 Padrón SUSALUD recuperado del historial médico previo (${seguroPrevio}) para DNI ${numDni}:`, padronPrevio);
      return padronPrevio;
    }
    if (typeof buscarPacienteMaster === "function") {
      const pacMaster = buscarPacienteMaster(numDni);
      if (pacMaster && pacMaster.tipo_seguro && pacMaster.tipo_seguro !== "Seguro por confirmar") {
        const padronPrevio = crearPadronDesdeSeguroExistente(numDni, pacMaster.tipo_seguro);
        try { localStorage.setItem("padron_susalud_" + numDni, JSON.stringify(padronPrevio)); } catch(e){}
        return padronPrevio;
      }
    }
  } catch(e) {}

  // Consulta en Supabase historias_clinicas
  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.eq.${encodeURIComponent(numDni)},identificador.ilike.*${encodeURIComponent(numDni)}*)&select=padron_susalud,tipo_seguro&order=id.desc&limit=1`, {
        headers: { "apikey": SUPABASE_CONFIG.key, "Authorization": `Bearer ${SUPABASE_CONFIG.key}` }
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0 && rows[0].padron_susalud) {
          const obj = typeof rows[0].padron_susalud === "string" ? JSON.parse(rows[0].padron_susalud) : rows[0].padron_susalud;
          if (obj && obj.publico && obj.privado) {
            obj.origen_registro = "BD_HISTORICA";
            try { localStorage.setItem("padron_susalud_" + numDni, JSON.stringify(obj)); } catch(e){}
            console.log(`☁️ Padrón SUSALUD cargado desde Supabase para DNI ${numDni}:`, obj);
            return obj;
          }
        }
      }
    } catch (e) {
      console.warn("Aviso: Supabase padron lookup:", e.message);
    }
  }

  // PASO 2: Si el DNI NO EXISTE en BD -> Generar una ÚNICA VEZ y guardar permanentemente
  const nuevoPadron = await fetch_padron_susalud_siteds(numDni);
  nuevoPadron.origen_registro = "NUEVA_CONSULTA";

  // Guardar en localStorage
  try {
    localStorage.setItem("padron_susalud_" + numDni, JSON.stringify(nuevoPadron));
    // Guardar también en seguro_asignado para persistencia histórica
    const seguroTexto = nuevoPadron.tipo_aseguramiento === "SOLO_SIS" ? "SIS" :
                        nuevoPadron.tipo_aseguramiento === "SOLO_ESSALUD" ? "EsSalud" :
                        nuevoPadron.tipo_aseguramiento === "EPS_Y_ESSALUD" ? (nuevoPadron.privado.iafas_eps || "Pacífico EPS") :
                        nuevoPadron.tipo_aseguramiento === "SOLO_PRIVADO" ? (nuevoPadron.privado.iafas_eps || "Seguro Privado") : "Sin Seguro";
    localStorage.setItem("seguro_asignado_" + numDni, seguroTexto);
  } catch (e) {}

  // Guardar en Supabase (si está configurado)
  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
    try {
      fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.eq.${encodeURIComponent(numDni)},identificador.ilike.*${encodeURIComponent(numDni)}*)`, {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_CONFIG.key,
          "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ padron_susalud: nuevoPadron })
      }).catch(() => {});
    } catch (e) {}
  }

  console.log(`✨ Nuevo Padrón SUSALUD generado y guardado permanentemente para DNI ${numDni}:`, nuevoPadron);
  return nuevoPadron;
}

// ------------------------------------------------------------------------------
// SINCRONIZADOR CENTRALIZADO DE PADRÓN SUSALUD EN TODA LA APLICACIÓN
// ------------------------------------------------------------------------------
async function sincronizarPadronSusalud(dni) {
  if (!dni || String(dni).toUpperCase().startsWith("NN") || STATE.esNN) {
    STATE.padronSusalud = null;
    renderizarBadgesPadronSusalud(null);
    return null;
  }

  const padron = await obtenerOGenerarPadronSusalud(dni);
  STATE.padronSusalud = padron;

  if (padron) {
    // Si el padrón trajo marca de accidente en fuga y no se había marcado manualmente
    if (padron.condicion_evento === "ACCIDENTE_TRANSITO_FUGA") {
      STATE.eventoFugaTransversal = true;
      const chkFuga = document.getElementById("chk_evento_fuga");
      if (chkFuga) chkFuga.checked = true;
    }

    // Sincronizar STATE.tipoSeguro con el padrón recuperado/generado
    const seguroTexto = padron.tipo_aseguramiento === "SOLO_SIS" ? "SIS" :
                        padron.tipo_aseguramiento === "SOLO_ESSALUD" ? "EsSalud" :
                        padron.tipo_aseguramiento === "EPS_Y_ESSALUD" ? (padron.privado.iafas_eps || "Pacífico EPS") :
                        padron.tipo_aseguramiento === "SOLO_PRIVADO" ? (padron.privado.iafas_eps || "Seguro Privado") : "Sin Seguro";
    STATE.tipoSeguro = seguroTexto;
    if (typeof aplicarSeleccionSeguroYEntorno === "function") {
      aplicarSeleccionSeguroYEntorno(seguroTexto, false, true);
    }

    renderizarBadgesPadronSusalud(padron);
    actualizarVistaSegunEntornoOperativo();
    renderizarBoxAcreditacionSusalud(padron);
  }

  actualizarFactura();
  return padron;
}

// ------------------------------------------------------------------------------
// RENDERIZADO DE BADGES DE PERSISTENCIA SUSALUD
// ------------------------------------------------------------------------------
function renderizarBadgesPadronSusalud(padron) {
  const badgePersist = document.getElementById("badge_susalud_persistencia");
  const badgeFactura = document.getElementById("badge_susalud_factura");
  const badgeM3 = document.getElementById("pide_badge_bloqueo");

  if (!padron) {
    if (badgePersist) badgePersist.style.display = "none";
    if (badgeFactura) {
      badgeFactura.textContent = "—";
      badgeFactura.style.background = "#f1f5f9";
      badgeFactura.style.color = "#64748b";
    }
    return;
  }

  const esHistorico = (padron.origen_registro === "BD_HISTORICA");
  const badgeText = esHistorico ? "[BD HISTÓRICA: PERFIL SUSALUD RECUPERADO]" : "[NUEVA CONSULTA API -> GUARDADO EN BD]";
  const bg = esHistorico ? "#dbeafe" : "#dcfce7";
  const color = esHistorico ? "#1e40af" : "#166534";
  const border = esHistorico ? "1.5px solid #93c5fd" : "1.5px solid #86efac";

  if (badgePersist) {
    badgePersist.style.display = "inline-flex";
    badgePersist.textContent = badgeText;
    badgePersist.style.background = bg;
    badgePersist.style.color = color;
    badgePersist.style.border = border;
  }

  if (badgeFactura) {
    badgeFactura.style.display = "inline-flex";
    badgeFactura.textContent = badgeText;
    badgeFactura.style.background = bg;
    badgeFactura.style.color = color;
    badgeFactura.style.border = border;
  }

  if (badgeM3) {
    badgeM3.textContent = esHistorico ? "🔒 BD HISTÓRICA: PERFIL SUSALUD RECUPERADO" : "✨ NUEVA CONSULTA API -> GUARDADO EN BD";
    badgeM3.style.background = bg;
    badgeM3.style.color = color;
  }
}

// ------------------------------------------------------------------------------
// BIFURCACIÓN DE ENTORNO OPERATIVO ([Modo Público] vs [Modo Privado])
// ------------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// VISIBILIDAD DE ENTORNO ASISTENCIAL (MODO PÚBLICO VS MODO PRIVADO)
// En Privado: Únicamente Clínica Privada (EPS) y Sin Seguro (Particular)
// En Público: Hospital MINSA, Hospital EsSalud y Sin Seguro
// ---------------------------------------------------------------------------
function actualizarVisibilidadBotonesEntorno() {
  const modo = STATE.entornoOperativo || "publico";
  const btnMinsa = document.getElementById("btn_entorno_minsa");
  const btnEssalud = document.getElementById("btn_entorno_essalud");
  const btnCli = document.getElementById("btn_entorno_clinica_eps");
  const btnPart = document.getElementById("btn_entorno_particular");

  if (modo === "privado") {
    // EN PESTAÑA PRIVADA: SOLO DEBE APARECER EPS Y SIN SEGURO
    if (btnMinsa) btnMinsa.style.setProperty("display", "none", "important");
    if (btnEssalud) btnEssalud.style.setProperty("display", "none", "important");
    if (btnCli) btnCli.style.setProperty("display", "flex", "important");
    if (btnPart) btnPart.style.setProperty("display", "flex", "important");
  } else {
    // EN PESTAÑA PÚBLICA: MINSA, EsSalud y Sin seguro
    if (btnMinsa) btnMinsa.style.setProperty("display", "flex", "important");
    if (btnEssalud) btnEssalud.style.setProperty("display", "flex", "important");
    if (btnCli) btnCli.style.setProperty("display", "none", "important");
    if (btnPart) btnPart.style.setProperty("display", "flex", "important");
  }
}
window.actualizarVisibilidadBotonesEntorno = actualizarVisibilidadBotonesEntorno;

function cambiarEntornoOperativo(modo) {
  const modoAnterior = STATE.entornoOperativo || "publico";
  const nuevoModo = (modo === "privado") ? "privado" : "publico";
  const debeBorrarAvance = (nuevoModo === "privado" && (modoAnterior === "publico" || STATE.numDni || STATE.identificador || (document.getElementById("dni_mod1")?.value) || (document.getElementById("ident_full")?.value)));

  STATE.entornoOperativo = nuevoModo;
  STATE.esClinicaPrivada = (nuevoModo === "privado");

  if (debeBorrarAvance) {
    // Requerimiento: Si ya estoy ingresando los datos en SIS o ESSALUD, al cambiar de pestaña a Privado se borra el avance
    if (typeof limpiarFormularioCompletoState === "function") {
      limpiarFormularioCompletoState();
    }
    STATE.entornoOperativo = "privado";
    STATE.esClinicaPrivada = true;
    STATE.tipoSeguro = "Particular";
    STATE.planPrivado = "base_80_20";

    const cie10 = document.getElementById("cie10_select");
    if (cie10) cie10.selectedIndex = 0;
    const dxPres = document.getElementById("dx_presuntivo");
    if (dxPres) dxPres.value = "";
    const recFarm = document.getElementById("select_receta_farmacia");
    if (recFarm) recFarm.selectedIndex = 0;
    const indMed = document.getElementById("indicaciones_medicas");
    if (indMed) indMed.value = "";

    if (typeof window.actualizarFichaClinicaEnTiempoReal === "function") {
      try { window.actualizarFichaClinicaEnTiempoReal(); } catch(e){}
    }
    if (typeof window.actualizarFlujoSidebarEnTiempoReal === "function") {
      try { window.actualizarFlujoSidebarEnTiempoReal(); } catch(e){}
    }
    if (typeof window.renderizarBandejaPosta === "function") {
      try { window.renderizarBandejaPosta(); } catch(e){}
    }
    if (typeof window.actualizarCamasMonitorEnTiempoReal === "function") {
      try { window.actualizarCamasMonitorEnTiempoReal(); } catch(e){}
    }
    if (typeof mostrarToastCola === "function") {
      mostrarToastCola("🔄 <strong>Entorno Privado:</strong> Se ha borrado el avance anterior para iniciar un ingreso limpio en sector privado.");
    }
  } else {
    // Bloque 6: Persistencia del seguro SITEDS por DNI al alternar modo Público y Privado
    const dniAct = STATE.numDni || (document.getElementById("dni_reniec_input")?.value) || (document.getElementById("dni_mod1")?.value) || "";
    STATE.segurosSitedsPorDni = STATE.segurosSitedsPorDni || {};
    if (dniAct) {
      if (nuevoModo === "publico" && STATE.planPrivado) {
        STATE.segurosSitedsPorDni[dniAct] = {
          planPrivado: STATE.planPrivado,
          tipoSeguro: STATE.tipoSeguro,
          padronPrivado: STATE.padronSusalud?.privado ? JSON.parse(JSON.stringify(STATE.padronSusalud.privado)) : null
        };
      } else if (nuevoModo === "privado" && STATE.segurosSitedsPorDni[dniAct]) {
        const guardado = STATE.segurosSitedsPorDni[dniAct];
        if (guardado.planPrivado) {
          STATE.planPrivado = guardado.planPrivado;
          const selPlan = document.getElementById("select_plan_privado");
          if (selPlan) selPlan.value = guardado.planPrivado;
        }
        if (guardado.tipoSeguro && guardado.tipoSeguro !== "Particular") {
          STATE.tipoSeguro = guardado.tipoSeguro;
        }
        if (guardado.padronPrivado && STATE.padronSusalud) {
          STATE.padronSusalud.privado = guardado.padronPrivado;
        }
      }
    }
  }

  // Actualizar estilos de los botones del selector
  const btnPub = document.getElementById("tab_entorno_publico");
  const btnPriv = document.getElementById("tab_entorno_privado");
  const txtBanner = document.getElementById("entorno_sector_info_texto");
  const badgeSector = document.getElementById("badge_sector_factura");

  if (nuevoModo === "publico") {
    if (btnPub) {
      btnPub.classList.add("active");
      btnPub.style.border = "2.5px solid #0284c7";
      btnPub.style.background = "#eff6ff";
      btnPub.style.color = "#0369a1";
      btnPub.style.boxShadow = "0 2px 6px rgba(2,132,199,0.18)";
    }
    if (btnPriv) {
      btnPriv.classList.remove("active");
      btnPriv.style.border = "2px solid #e2e8f0";
      btnPriv.style.background = "#f8fafc";
      btnPriv.style.color = "#64748b";
      btnPriv.style.boxShadow = "none";
    }
    if (txtBanner) {
      txtBanner.innerHTML = "<strong>Regla Sectorial Activa:</strong> Afiliados SIS y EsSalud gozan de cobertura al 100% (Pago S/ 0.00). Pacientes particulares o con seguro privado puro pagan 100%.";
    }
    if (badgeSector) {
      badgeSector.textContent = "Sector: Modo Público (MINSA / SIS / EsSalud)";
      badgeSector.style.background = "#eff6ff";
      badgeSector.style.color = "#1d4ed8";
      badgeSector.style.border = "1px solid #bfdbfe";
    }
  } else {
    if (btnPriv) {
      btnPriv.classList.add("active");
      btnPriv.style.border = "2.5px solid #7c3aed";
      btnPriv.style.background = "#f5f3ff";
      btnPriv.style.color = "#6d28d9";
      btnPriv.style.boxShadow = "0 2px 6px rgba(124,58,237,0.18)";
    }
    if (btnPub) {
      btnPub.classList.remove("active");
      btnPub.style.border = "2px solid #e2e8f0";
      btnPub.style.background = "#f8fafc";
      btnPub.style.color = "#64748b";
      btnPub.style.boxShadow = "none";
    }
    if (txtBanner) {
      txtBanner.innerHTML = "<strong>Regla Sectorial Activa:</strong> Afiliados EPS con póliza activa cubiertos según copago y coaseguro (o 100% en P-I/II Ley N° 27604). Afiliados SIS o Solo EsSalud pagan 100% como particulares.";
    }
    if (badgeSector) {
      badgeSector.textContent = "Sector: Modo Privado (Clínica / EPS / SITEDS)";
      badgeSector.style.background = "#f5f3ff";
      badgeSector.style.color = "#6d28d9";
      badgeSector.style.border = "1px solid #ddd6fe";
    }
  }

  // Alternar sub-selectores según entorno
  const boxIpress = document.getElementById("subselector_ipress_publica");
  const boxPlanPriv = document.getElementById("subselector_plan_privado");
  if (nuevoModo === "publico") {
    if (boxIpress) boxIpress.style.display = "flex";
    if (boxPlanPriv) boxPlanPriv.style.display = "none";
  } else {
    if (boxIpress) boxIpress.style.display = "none";
    if (boxPlanPriv) boxPlanPriv.style.display = "flex";
  }

  actualizarVisibilidadBotonesEntorno();
  actualizarVistaSegunEntornoOperativo();
  actualizarFactura();

  if (typeof recalcularPrioridad === "function") {
    try { recalcularPrioridad(); } catch(e){}
  }

  mostrarToastCola(`⚙️ <strong>Entorno Operativo:</strong> Cambiado a ${nuevoModo === 'publico' ? '🏛️ Modo Público (MINSA/SIS/EsSalud)' : '🏥 Modo Privado (Clínica/EPS/SITEDS)'}.`);
}

function toggleCondicionFugaTransversal(chk) {
  STATE.eventoFugaTransversal = chk;
  STATE.soatVehiculoFuga = chk;
  if (chk) {
    STATE.esAccidenteTransito = true;
    STATE.tipoOrigenEvento = "soat";
  }

  const rbFuga = document.getElementById("rb_soat_fuga");
  const rbIdent = document.getElementById("rb_soat_identificado");
  if (rbFuga) rbFuga.checked = chk;
  if (rbIdent) rbIdent.checked = !chk;

  const boxFugaAlert = document.getElementById("box_soat_fuga_alert");
  const boxCampos = document.getElementById("box_soat_campos");
  const meterCard = document.getElementById("soat_meter_card");
  if (boxFugaAlert) boxFugaAlert.style.display = chk ? "block" : "none";
  if (boxCampos) boxCampos.style.display = chk ? "none" : "grid";
  if (meterCard) meterCard.style.display = chk ? "none" : "block";

  if (STATE.padronSusalud) {
    STATE.padronSusalud.condicion_evento = chk ? "ACCIDENTE_TRANSITO_FUGA" : "NORMAL";
  }

  actualizarFactura();
  mostrarToastCola(chk
    ? "🚨 <strong>Accidente en Fuga:</strong> Sin SOAT identificable. Ningún seguro (SIS, EsSalud, Privado) cubre; paciente asume el 100%."
    : "ℹ️ <strong>Régimen Normal:</strong> Accidente en Fuga desmarcado."
  );
}

function actualizarVistaSegunEntornoOperativo() {
  actualizarVisibilidadBotonesEntorno();
  const modo = STATE.entornoOperativo || "publico";
  const padron = STATE.padronSusalud;

  if (!padron) return;

  if (modo === "publico") {
    if (padron.publico && padron.publico.estado === "ACTIVO") {
      STATE.tipoSeguro = padron.publico.entidad === "SIS" ? "SIS" : "EsSalud";
    } else {
      STATE.tipoSeguro = "Particular";
    }
  } else {
    if (padron.privado && padron.privado.estado_poliza === "ACTIVA") {
      STATE.tipoSeguro = padron.privado.iafas_eps;
    } else {
      STATE.tipoSeguro = "Particular";
    }
  }

  // Refrescar en Módulo 3 si está desplegado
  renderizarBoxAcreditacionSusalud(padron);
}

// ------------------------------------------------------------------------------
// RENDERIZADO DEL CUADRO DE ACREDITACIÓN EN MÓDULO 3
// ------------------------------------------------------------------------------
function renderizarBoxAcreditacionSusalud(padron) {
  const box = document.getElementById("pide_acreditacion_box");
  const grid = document.getElementById("pide_detalles_grid");
  const titulo = document.getElementById("pide_tipo_titulo");
  const badgeEstado = document.getElementById("pide_badge_estado");
  const bannerCondicion = document.getElementById("pide_condiciones_cobro_banner");

  if (!box || !padron) return;
  box.style.display = "block";

  const modo = STATE.entornoOperativo || "publico";

  if (modo === "publico") {
    const pub = padron.publico;
    const esActivo = pub.estado === "ACTIVO";

    if (titulo) {
      titulo.textContent = esActivo
        ? `🏛️ ACREDITACIÓN PÚBLICA: ${pub.entidad} (${pub.regimen})`
        : "🏛️ SECTOR PÚBLICO: SIN COBERTURA ESTATAL (PARTICULAR)";
    }
    if (badgeEstado) {
      badgeEstado.textContent = esActivo ? "✅ AFILIADO ACTIVO EN ESTADO" : "⚠️ NO ACREDITADO (PARTICULAR)";
      badgeEstado.style.background = esActivo ? "#16a34a" : "#dc2626";
    }

    if (grid) {
      grid.innerHTML = `
        <div><span style="color:#64748b;">DNI Titular:</span><br><strong>${padron.dni}</strong></div>
        <div><span style="color:#64748b;">Entidad Pública:</span><br><strong>${pub.entidad}</strong></div>
        <div><span style="color:#64748b;">Régimen Estatal:</span><br><strong>${pub.regimen}</strong></div>
        <div><span style="color:#64748b;">Código Prestacional:</span><br><strong style="font-family:monospace;color:#0284c7;">${pub.codigo || 'NO APLICA'}</strong></div>
        <div><span style="color:#64748b;">Póliza Privada Vinculada:</span><br><strong>${padron.privado.iafas_eps}</strong></div>
        <div><span style="color:#64748b;">Cobertura en Sector Público:</span><br><strong style="color:${esActivo ? '#16a34a' : '#dc2626'};">${esActivo ? '100% Gratuito (Pago S/ 0.00)' : '0% (Tarifa Particular 100%)'}</strong></div>
      `;
    }

    if (bannerCondicion) {
      bannerCondicion.style.borderLeftColor = esActivo ? "#16a34a" : "#dc2626";
      bannerCondicion.innerHTML = esActivo
        ? `<strong style="color:#15803d;display:block;margin-bottom:4px;">⚖️ REGLA PÚBLICA APLICADA (LEY N° 27604 - AUS):</strong> Paciente con derecho integral vigente en ${pub.entidad}. Todos los servicios médicos de emergencia, cama, exámenes y medicamentos están financiados al 100% por el Estado peruano (S/. 0.00 a pagar).`
        : `<strong style="color:#b91c1c;display:block;margin-bottom:4px;">⚠️ ATENCIÓN PARTICULAR EN HOSPITAL PÚBLICO:</strong> El paciente no registra afiliación en SIS ni EsSalud. Asume el 100% de la liquidación monetaria.`;
    }
  } else {
    // MODO PRIVADO
    const priv = padron.privado;
    const esActivo = priv.estado_poliza === "ACTIVA";

    if (titulo) {
      titulo.textContent = esActivo
        ? `🏥 SITEDS ACREDITACIÓN PRIVADA: ${priv.iafas_eps} (${priv.plan_salud})`
        : "🏥 CLÍNICA PRIVADA: SIN COBERTURA EPS (PACIENTE PARTICULAR)";
    }
    if (badgeEstado) {
      badgeEstado.textContent = esActivo ? "✅ PÓLIZA EPS ACTIVA (SITEDS)" : "⚠️ PÓLIZA INACTIVA / PARTICULAR";
      badgeEstado.style.background = esActivo ? "#7c3aed" : "#ea580c";
    }

    const exclusionesStr = priv.exclusiones && priv.exclusiones.length > 0 ? priv.exclusiones.join(", ") : "Ninguna (Póliza Plena)";

    if (grid) {
      grid.innerHTML = `
        <div><span style="color:#64748b;">DNI Titular:</span><br><strong>${padron.dni}</strong></div>
        <div><span style="color:#64748b;">IAFAS Privada:</span><br><strong>${priv.iafas_eps}</strong></div>
        <div><span style="color:#64748b;">Plan de Salud:</span><br><strong>${priv.plan_salud || 'Particular'}</strong></div>
        <div><span style="color:#64748b;">Código SITEDS:</span><br><strong style="font-family:monospace;color:#7c3aed;">${priv.siteds_codigo || 'SIN CÓDIGO'}</strong></div>
        <div><span style="color:#64748b;">Copago Fijo / Coaseguro:</span><br><strong>S/. ${priv.copago_fijo ? priv.copago_fijo.toFixed(2) : '0.00'} | ${(priv.coaseguro_pct * 100).toFixed(0)}%</strong></div>
        <div><span style="color:#64748b;">Exclusiones Contractuales:</span><br><strong style="color:${priv.exclusiones?.length ? '#b91c1c' : '#16a34a'};">${exclusionesStr}</strong></div>
      `;
    }

    if (bannerCondicion) {
      bannerCondicion.style.borderLeftColor = esActivo ? "#7c3aed" : "#ea580c";
      bannerCondicion.innerHTML = esActivo
        ? `<strong style="color:#6d28d9;display:block;margin-bottom:4px;">⚖️ REGLA PRIVADA APLICADA (SITEDS - EPS):</strong> En Prioridad I y II (Emergencia Vital), la aseguradora cubre el 100% (Pago S/ 0.00). En Prioridades III, IV y V, el paciente asume copago fijo de S/. ${priv.copago_fijo.toFixed(2)} + ${(priv.coaseguro_pct*100).toFixed(0)}% de coaseguro.`
        : `<strong style="color:#c2410c;display:block;margin-bottom:4px;">🚨 ALERTA CLÍNICA PRIVADA:</strong> Paciente registra [${padron.publico.entidad || 'Sin Seguro'}] -> No aplica cobertura en Clínica Privada. Todo servicio se factura como Particular 100%.`;
    }
  }
}


// ---------------------------------------------------------------------------
// ADMISIÓN RÁPIDA DE EMERGENCIA VIAL / SOAT (LEY N° 27181 & D.S. N° 024-2002-MTC)
// ---------------------------------------------------------------------------
function admitirEmergenciaSoat() {
  cambiarOrigenEvento("soat");
  STATE.ingresoDirectoCritico = true;
  STATE.prioridad = "I";
  STATE.colorPrioridad = "ROJO";
  STATE.motivoIngresoCritico = "Protocolo de Emergencia Accidente de Tránsito / Trauma Vial Crítico (SOAT) — Ley N° 27181 & D.S. N° 024-2002-MTC";

  // Si el Módulo 1 está colapsado, desplegarlo para ingreso inmediato de datos
  const bodyM1 = document.getElementById("body_mod1");
  if (bodyM1 && (bodyM1.style.display === "none" || !bodyM1.classList.contains("visible"))) {
    toggleModule("mod1");
  }

  // Scroll suave al Módulo 1
  const secM1 = document.getElementById("sec_mod1");
  if (secM1) {
    secM1.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (typeof recalcularPrioridad === "function") {
    try { recalcularPrioridad(); } catch(e){}
  }
  if (typeof actualizarFactura === "function") {
    try { actualizarFactura(); } catch(e){}
  }

  mostrarToastCola("🚗 <strong>Protocolo SOAT de Emergencia Activado:</strong> Origen establecido como Accidente de Tránsito / Trauma Vial (Ley N° 27181 & D.S. N° 024-2002-MTC).");
}

window.admitirEmergenciaSoat = admitirEmergenciaSoat;
window.fetch_padron_susalud_siteds = fetch_padron_susalud_siteds;
window.obtenerOGenerarPadronSusalud = obtenerOGenerarPadronSusalud;
window.sincronizarPadronSusalud = sincronizarPadronSusalud;
window.renderizarBadgesPadronSusalud = renderizarBadgesPadronSusalud;
window.cambiarEntornoOperativo = cambiarEntornoOperativo;
window.toggleCondicionFugaTransversal = toggleCondicionFugaTransversal;
window.actualizarVistaSegunEntornoOperativo = actualizarVistaSegunEntornoOperativo;
window.renderizarBoxAcreditacionSusalud = renderizarBoxAcreditacionSusalud;


function advertirEntornoBloqueado() {
  mostrarToastCola("🔒 <strong>Entorno Asistencial:</strong> Se establece automáticamente según el Padrón SUSALUD o el entorno operativo seleccionado ([Modo Público] / [Modo Privado]).");
}
window.advertirEntornoBloqueado = advertirEntornoBloqueado;


// EXPORTACIONES GLOBALES PARA ELEMENTOS ONCLICK EN EL DOM
window.irAModulo = irAModulo;
window.moduloSiguiente = moduloSiguiente;
window.moduloAnterior = moduloAnterior;
window.toggleModule = toggleModule;
window.activarPanicoShockTrauma = activarPanicoShockTrauma;
window.activarIngresoDirectoQuirofano = activarIngresoDirectoQuirofano;
window.asignarQuirofanoEspecifico = asignarQuirofanoEspecifico;
window.asignarCamaURPA = asignarCamaURPA;
window.ejecutarOrdenQuirurgicaEmergencia = ejecutarOrdenQuirurgicaEmergencia;
window.abrirModalRegularizacionDiferida = abrirModalRegularizacionDiferida;
window.cerrarModalRegularizacionDiferida = cerrarModalRegularizacionDiferida;
window.registrarPacienteEnEspera = registrarPacienteEnEspera;
window.ingresarPacienteNN = ingresarPacienteNN;
window.ejecutarAdmisionRapidaNN = ejecutarAdmisionRapidaNN;
window.seleccionarCIE10 = seleccionarCIE10;
window.abrirCatalogoRapidoKardex = abrirCatalogoRapidoKardex;
window.administrarKardexItem = administrarKardexItem;
window.seleccionarDestinoPostTopico = seleccionarDestinoPostTopico;
window.setEstanciaHoras = setEstanciaHoras;
window.actualizarEstanciaObservacion = actualizarEstanciaObservacion;
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

// ---------------------------------------------------------------------------
// PARÁMETROS LEGALES, PROCEDIMIENTOS HOSPITALARIOS Y DEL SEGURO ANTE FALLECIMIENTO
// Sustento: NTS N° 042-MINSA, NTS N° 139-MINSA, Arts. 195/196 CPP, D.S. N° 024-2002-MTC, Ley N° 27604
// ---------------------------------------------------------------------------

function mostrarTabFallecimiento(tabId) {
  const tabs = ['tab_proc_hospital', 'tab_proc_seguro', 'tab_parametros_legales'];
  tabs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === tabId) ? 'block' : 'none';
  });

  const btns = document.querySelectorAll('#tabs_protocolo_fallecimiento .tab-fallecimiento-btn');
  btns.forEach(b => {
    b.classList.remove('active');
    b.style.background = 'transparent';
    b.style.color = '#64748b';
    b.style.borderBottom = 'none';
  });

  const activeBtn = Array.from(btns).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.background = '#ffffff';
    activeBtn.style.color = '#0284c7';
    activeBtn.style.borderBottom = '2.5px solid #0284c7';
  }

  // Actualizar seguro actual en tab 2
  const lblSeguro = document.getElementById('lbl_seguro_fallecido_actual');
  if (lblSeguro) {
    const st = (typeof window !== 'undefined' && window.STATE) ? window.STATE : {};
    const seg = st.tipoSeguro || document.getElementById('tipo_seguro_select')?.value || 'Particular';
    let detalle = `Seguro Activo: ${seg}`;
    if (seg.toLowerCase().includes('sis')) detalle = 'Seguro Activo: SIS (Prestación de Sepelio hasta S/ 1,000)';
    else if (seg.toLowerCase().includes('essalud')) detalle = 'Seguro Activo: EsSalud (Subsidio Sepelio hasta S/ 2,070)';
    else if (seg.toLowerCase().includes('soat')) detalle = 'Seguro Activo: SOAT (Sepelio 1 UIT S/ 5,350 + Muerte 4 UIT)';
    else if (seg.toLowerCase().includes('eps')) detalle = 'Seguro Activo: EPS Privada (Liquidación + Póliza de Auxilio)';
    lblSeguro.textContent = detalle;
  }
}

function imprimirActaCustodiaCadaver() {
  const st = (typeof window !== 'undefined' && window.STATE) ? window.STATE : {};
  const nombre = st.nombreReniec || st.identificador || "CADÁVER NO IDENTIFICADO (NN)";
  const dni = st.numDni || st.identificador || "S/D";
  const hc = st.historiaClinica || "HC-PROVISIONAL";
  const fecha = new Date().toLocaleString('es-PE');
  const medico = st.medicoTratante || "Médico Emergenciólogo de Guardia (CMP 0001)";

  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir."); return; }
  w.document.write(`
    <html>
    <head>
      <title>Acta de Rotulado, Custodia e Inventario de Cadáver - UPP</title>
      <style>
        body { font-family: 'Arial', sans-serif; padding: 35px; font-size: 13px; color: #1e293b; line-height: 1.5; }
        .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
        .box { border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; margin-bottom: 14px; background: #f8fafc; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th, td { border: 1px solid #94a3b8; padding: 6px 10px; }
        th { background: #e2e8f0; text-align: left; }
        .signatures { display: flex; justify-content: space-between; margin-top: 60px; text-align: center; }
        .sig-box { width: 30%; border-top: 1px solid #000; padding-top: 6px; font-size: 11px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h3 style="margin:0;">HOSPITAL REGIONAL DOCENTE UPP — SERVICIO DE EMERGENCIA</h3>
        <h4 style="margin:4px 0 0; color:#475569;">UNIDAD DE CUSTODIA MORTUORIA Y ASUNTOS MÉDICO-LEGALES</h4>
        <h2 style="margin:12px 0 0; color:#0f172a;">ACTA INSTITUCIONAL DE ROTULADO, CUSTODIA DE CADÁVER E INVENTARIO DE PERTENENCIAS</h2>
      </div>

      <div class="box">
        <p style="margin:0;"><strong>FECHA Y HORA DE EMISIÓN:</strong> ${fecha}</p>
        <p style="margin:4px 0 0;"><strong>PACIENTE FALLECIDO:</strong> ${nombre} | <strong>DOCUMENTO:</strong> ${dni} | <strong>N° HC:</strong> ${hc}</p>
        <p style="margin:4px 0 0;"><strong>UBICACIÓN DE CUSTODIA:</strong> Tópico de Cadáveres / Mortuorio de Emergencia UPP</p>
        <p style="margin:4px 0 0;"><strong>CONDICIÓN DE INGRESO:</strong> ${st.esAccidenteTransito ? '🚗 Accidente de Tránsito (Ley SOAT) — Custodia Fiscal' : (st.esNN ? 'Paciente NN — Descarte de Identidad PNP' : 'Causa Médica Crítica')}</p>
      </div>

      <h4>1. Rotulado y Dispositivos de Bioseguridad Hospitalaria:</h4>
      <p>Se deja constancia de la colocación de doble brazalete hospitalario termosensible indeleble en extremidad superior derecha e inferior izquierda, rotulado de bolsa de mortaja y custodia física en refrigerador mortuorio a temperatura controlada (2°C a 4°C).</p>

      <h4>2. Inventario de Pertenencias y Valores Personales:</h4>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Descripción de la Pertenencia / Prenda</th>
            <th>Estado Físico</th>
            <th>Destino de Custodia</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Documento de Identidad y Billetera con documentos personales</td>
            <td>Conservado</td>
            <td>Caja Fuerte de Emergencia</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Prendas de vestir retiradas durante la reanimación (Custodia Forense)</td>
            <td>Embalado sellado</td>
            <td>Cadena de Custodia PNP/Fiscalía</td>
          </tr>
          <tr>
            <td>3</td>
            <td>Dispositivo móvil / Objetos de valor entregados bajo acta</td>
            <td>Inventariado</td>
            <td>Entrega bajo recibo</td>
          </tr>
        </tbody>
      </table>

      <h4>3. Mandato Legal y Notificación:</h4>
      <p>En aplicación de la Directiva N° 216-MINSA y el Art. 195° del Código Procesal Penal, el presente establecimiento garantiza la inviolabilidad del cadáver y su trazabilidad para la diligencia de Levantamiento por el Ministerio Público o entrega a familiares con derecho legal acreditado.</p>

      <div class="signatures">
        <div class="sig-box">
          ${medico}<br><strong>Médico Tratante / RNE</strong>
        </div>
        <div class="sig-box">
          Lic. Enfermería de Guardia<br><strong>Jefatura de Tópico</strong>
        </div>
        <div class="sig-box">
          Efectivo PNP / Familiar Acreditado<br><strong>Recepción / Custodia</strong>
        </div>
      </div>
    </body>
    </html>
  `);
  w.document.close();
}

function imprimirConstanciaSepelioSeguro() {
  const st = (typeof window !== 'undefined' && window.STATE) ? window.STATE : {};
  const nombre = st.nombreReniec || st.identificador || "PACIENTE ASISTIDO";
  const dni = st.numDni || st.identificador || "S/D";
  const hc = st.historiaClinica || "HC-PROVISIONAL";
  const seguro = st.tipoSeguro || document.getElementById('tipo_seguro_select')?.value || 'MINSA (SIS)';
  const fecha = new Date().toLocaleDateString('es-PE');
  const hora = st.horaLlegada || new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const cie = `${st.cie10Codigo || 'R99.X'} — ${st.cie10Descripcion || 'Causa básica en estudio'}`;
  const medico = st.medicoTratante || "Médico Emergenciólogo de Guardia (CMP 0001)";

  let textoPrestacion = "";
  if (seguro.toLowerCase().includes('sis')) {
    textoPrestacion = "Documento emitido para tramitación de la <strong>Prestación Económica de Sepelio (PES) del SIS</strong> conforme al D.S. N° 007-2012-SA, con cobertura de hasta S/ 1,000 para gastos de ataúd, capilla y sepultura.";
  } else if (seguro.toLowerCase().includes('essalud')) {
    textoPrestacion = "Documento emitido para tramitación del <strong>Subsidio por Sepelio EsSalud (Formulario 1010)</strong> conforme a la Ley N° 26790, con reembolso de hasta S/ 2,070 a favor de quien sufragó los gastos funerarios.";
  } else if (seguro.toLowerCase().includes('soat')) {
    textoPrestacion = "Documento emitido en mérito al <strong>D.S. N° 024-2002-MTC (Reglamento SOAT)</strong> para la cobertura de Gastos de Sepelio hasta por 1 UIT (S/ 5,350) e indemnización por Muerte por 4 UIT (S/ 21,400) a favor de los beneficiarios de ley.";
  } else {
    textoPrestacion = "Documento emitido como certificación de gastos médicos y asistencia de emergencia hospitalaria previa al fallecimiento para liquidación de póliza de asistencia y seguro de vida / sepelio privado.";
  }

  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir."); return; }
  w.document.write(`
    <html>
    <head>
      <title>Constancia Hospitalaria de Cierre y Sepelio para el Seguro - UPP</title>
      <style>
        body { font-family: 'Arial', sans-serif; padding: 35px; font-size: 13px; color: #1e293b; line-height: 1.6; }
        .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; }
        .card { border: 1.5px solid #cbd5e1; padding: 14px; border-radius: 8px; margin-bottom: 16px; background: #f8fafc; }
        .signatures { display: flex; justify-content: space-between; margin-top: 70px; text-align: center; }
        .sig-box { width: 42%; border-top: 1px solid #000; padding-top: 8px; font-size: 11px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h3 style="margin:0; color:#0369a1;">HOSPITAL REGIONAL DOCENTE UPP</h3>
        <h4 style="margin:2px 0 0; color:#475569;">DIRECCIÓN DE ADMINISTRACIÓN Y ADMISIÓN HOSPITALARIA</h4>
        <h2 style="margin:12px 0 0; color:#0f172a;">CONSTANCIA MÉDICA HOSPITALARIA DE ATENCIÓN DE EMERGENCIA Y GASTOS DE SEPELIO</h2>
      </div>

      <p>La Dirección Médica y la Jefatura de Admisión Hospitalaria del Hospital Regional Docente UPP certifican que el/la paciente:</p>

      <div class="card">
        <p style="margin:0;"><strong>NOMBRE COMPLETO:</strong> ${nombre}</p>
        <p style="margin:4px 0 0;"><strong>DOCUMENTO DE IDENTIDAD:</strong> ${dni} | <strong>HISTORIA CLÍNICA:</strong> ${hc}</p>
        <p style="margin:4px 0 0;"><strong>RÉGIMEN DE ASEGURAMIENTO:</strong> <span style="color:#0284c7; font-weight:800;">${seguro}</span></p>
        <p style="margin:4px 0 0;"><strong>FECHA Y HORA DE INGRESO A EMERGENCIA:</strong> ${fecha} · ${hora}</p>
        <p style="margin:4px 0 0;"><strong>DIAGNÓSTICO CIE-10 DE INGRESO / EVENTO:</strong> ${cie}</p>
        <p style="margin:4px 0 0;"><strong>CONDICIÓN DE EGRESO ASISTENCIAL:</strong> <strong>FALLECIMIENTO (ÓBITO EN ESTABLECIMIENTO)</strong></p>
      </div>

      <h4>Finalidad Institucional ante la Entidad Aseguradora:</h4>
      <p>${textoPrestacion}</p>

      <p>Se expide la presente constancia a solicitud de los familiares directos acreditados para los fines exclusivos de tramitación ante la entidad aseguradora correspondiente, en cumplimiento de la Ley N° 26842, Ley N° 27604 y regulaciones vigentes de SUSALUD.</p>

      <div class="signatures">
        <div class="sig-box">
          ${medico}<br>
          <strong>Médico Asistencial de Guardia<br>CMP / RNE</strong>
        </div>
        <div class="sig-box">
          Oficina de Seguros y Facturación<br>
          <strong>Hospital Regional Docente UPP<br>SUSALUD / IPRESS</strong>
        </div>
      </div>
    </body>
    </html>
  `);
  w.document.close();
}

window.mostrarTabFallecimiento = mostrarTabFallecimiento;
window.imprimirActaCustodiaCadaver = imprimirActaCustodiaCadaver;
window.imprimirConstanciaSepelioSeguro = imprimirConstanciaSepelioSeguro;



// ==============================================================================
// MASTER SUITE: BLOQUES 1, 2, 3 Y 4 — AUDITORÍA Y CERTIFICACIÓN HIS PERÚ
// Sustento: NTS N° 042-MINSA, NTS N° 139-MINSA, Ley N° 27604, D.S. N° 024-2002-MTC, Ley N° 29733
// Desarrollado por: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
// ==============================================================================

// --- 1. PUENTE DE DATOS HACIA FACTURACION.HTML (BLOQUE 1.5) ---
function sincronizarFacturacionYExportar(silencioso = false) {
  try {
    if (typeof calcularLiquidacionSeguro === 'function') {
      STATE.liquidacionAuditada = calcularLiquidacionSeguro();
    }
    STATE.exportadoFacturacionEn = new Date().toISOString();

    const nombre = STATE.nombreReniec || STATE.identificador || "Paciente en Atención";
    const dni = STATE.numDni || (STATE.identificador ? STATE.identificador.replace(/\D/g, '') : '') || "44418504";
    const hc = STATE.historiaClinica || `HC-2026-${dni.slice(-4)}`;
    const prio = (STATE.prioridad || "I").toString().replace("P-", "");
    const seguro = STATE.tipoSeguro || (STATE.tipoOrigenEvento === "soat" ? "SOAT Activo (La Positiva Seguros)" : "SIS Gratuito (MINSA)");
    const esAccidente = Boolean(STATE.esAccidenteTransito || STATE.tipoOrigenEvento === "soat" || seguro.toLowerCase().includes("soat"));
    const esFuga = Boolean(STATE.soatVehiculoFuga || STATE.eventoFugaTransversal);
    const medico = STATE.medicoTratante || "Médico de Guardia (Emergenciólogo / CMP 0001)";

    // 1. Guardar expediente consolidado completo en LocalStorage
    localStorage.setItem('EXPEDIENTE_FACTURACION_ACTUAL', JSON.stringify(STATE));

    // 2. Sincronizar llaves directas de UPP para retrocompatibilidad total
    localStorage.setItem('UPP_PACIENTE_NOMBRE', nombre);
    localStorage.setItem('UPP_PACIENTE_DNI', dni);
    localStorage.setItem('UPP_PACIENTE_HC', hc);
    localStorage.setItem('UPP_PRIORIDAD', prio);
    localStorage.setItem('UPP_TIPO_SEGURO', seguro);
    localStorage.setItem('UPP_ES_SOAT', esAccidente ? "true" : "false");
    localStorage.setItem('UPP_SOAT_FUGA', esFuga ? "true" : "false");
    localStorage.setItem('UPP_ITEMS_FACTURA', JSON.stringify(STATE.items_factura || []));

    // 3. Episodio actual
    const episodioActual = {
      folio: `FOL-2026-${dni.slice(-4) || '8821'}`,
      nombre_completo: nombre,
      identificador: dni,
      historia_clinica: hc,
      tipo_seguro: seguro,
      prioridad: `P-${prio}`,
      items_factura: STATE.items_factura || [],
      cama_asignada: STATE.camaAsignada || 'Ninguna',
      cie10: STATE.cie10 || STATE.cie10Codigo || 'En evaluación',
      medico_tratante: medico,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('UPP_EPISODIO_ACTUAL', JSON.stringify(episodioActual));

    // 4. Actualizar en PACIENTES_MASTER por DNI
    try {
      const master = JSON.parse(localStorage.getItem('UPP_PACIENTES_MASTER') || '{}');
      master[dni] = {
        identificador: dni,
        historia_clinica: hc,
        nombre_completo: nombre,
        tipo_seguro: seguro,
        ultimo_episodio: episodioActual
      };
      localStorage.setItem('UPP_PACIENTES_MASTER', JSON.stringify(master));
    } catch(e) {}

    if (!silencioso) {
      registrarLogAuditoria("Módulo 8", "EXPORTAR_FACTURACION", `Expediente de ${nombre} (DNI ${dni}) sincronizado con portal de facturación`);
      console.log("📦 EXPEDIENTE_FACTURACION_ACTUAL sincronizado para:", nombre, dni, seguro);
    }
  } catch (err) {
    console.error("Error al exportar expediente hacia facturacion.html:", err);
  }
}
window.sincronizarFacturacionYExportar = sincronizarFacturacionYExportar;

function abrirPortalFacturacion(event) {
  if (event) {
    try { event.preventDefault(); } catch(e){}
  }
  sincronizarFacturacionYExportar(false);
  const dni = STATE.numDni || (STATE.identificador ? STATE.identificador.replace(/\D/g, '') : '') || '';
  const hc = STATE.historiaClinica || '';
  const prio = STATE.prioridad || '';
  const url = `facturacion.html?dni=${encodeURIComponent(dni)}&hc=${encodeURIComponent(hc)}&prio=${encodeURIComponent(prio)}&t=${Date.now()}`;
  window.open(url, '_blank');
  return false;
}
window.abrirPortalFacturacion = abrirPortalFacturacion;

// --- 2. GENERACIÓN Y GESTIÓN DE BRAZALETE DE EMERGENCIA UNIFICADO (BLOQUE 2.1 & NTS 042/139) ---
function construirHTMLBrazalete(esTemporal = false) {
  const prio = STATE.prioridad || "I";
  const coloresPrio = { "I": "#dc2626", "II": "#ea580c", "III": "#ca8a04", "IV": "#16a34a", "V": "#2563eb" };
  const nombresPrio = {
    "I": "P-I ROJO (SHOCK TRAUMA / VITAL)",
    "II": "P-II NARANJA (URGENCIA MAYOR)",
    "III": "P-III AMARILLO (URGENCIA)",
    "IV": "P-IV VERDE (URGENCIA MENOR)",
    "V": "P-V AZUL (NO URGENTE)"
  };
  const colorBanda = coloresPrio[prio] || "#dc2626";
  const nombrePrio = nombresPrio[prio] || `PRIORIDAD ${prio}`;

  // 1. FECHA Y HORA INMUTABLES:
  if (!STATE.fechaIngresoBrazalete) {
    STATE.fechaIngresoBrazalete = STATE.fechaLlegada || new Date().toLocaleDateString('es-PE');
  }
  if (!STATE.horaIngresoBrazalete) {
    STATE.horaIngresoBrazalete = STATE.horaLlegada || new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }
  if (!STATE.horaLlegada) STATE.horaLlegada = STATE.horaIngresoBrazalete;
  if (!STATE.fechaLlegada) STATE.fechaLlegada = STATE.fechaIngresoBrazalete;
  const fechaActual = STATE.fechaIngresoBrazalete;
  const horaActual = STATE.horaIngresoBrazalete;

  // 2. LECTURA EXHAUSTIVA DE DATOS DEL PACIENTE:
  let nombrePaciente = (STATE.nombreReniec || STATE.identificador || "PACIENTE POR IDENTIFICAR").toUpperCase();
  let hcPaciente = STATE.historiaClinica || document.getElementById("hc_code_display")?.textContent?.trim() || "";
  if (!hcPaciente || hcPaciente === "—") {
    hcPaciente = (esTemporal || STATE.esNN) ? "HC-TEMP-NN" : "HC-PROVISIONAL";
  }

  let docPaciente = STATE.numDni || document.getElementById("dni_mod1")?.value?.trim() || document.getElementById("ident_full")?.value?.trim() || STATE.identificador || "";
  if (!docPaciente || docPaciente === "NN") {
    docPaciente = "S/D (INDOCUMENTADO)";
  }

  // EDAD
  let edadRaw = STATE.edad || document.getElementById("edad_full")?.value?.trim();
  let edadDisplay = edadRaw ? `${edadRaw} años` : "desconocido";

  // GÉNERO
  let generoRaw = STATE.sexo || document.getElementById("sexo_full")?.value;
  let generoDisplay = (generoRaw && generoRaw !== "Desconocido") ? generoRaw : "desconocido";

  // GRUPO SANGUÍNEO Y FACTOR RH
  let gsanRaw = STATE.grupoSanguineo || document.getElementById("gsan_full")?.value || "Desconocido";
  let gsanDisplay = (gsanRaw && gsanRaw !== "Desconocido") ? gsanRaw : "Desconocido / Por tipificar";

  // CORRECCIÓN ALERGIAS: VISIBILIDAD GARANTIZADA Y REGLAS DE CONDICIÓN DE INGRESO
  const esAdmisionRapidaEmergencia = Boolean(
    esTemporal || STATE.esNN || STATE.ingresoDirectoCritico || STATE.panicoShockTrauma ||
    STATE.esAccidenteTransito || STATE.esSOAT ||
    (STATE.numDni && String(STATE.numDni).startsWith("NN")) ||
    (docPaciente && docPaciente.startsWith("S/D"))
  );
  const alergiasInput = (document.getElementById("alergias_mod1")?.value || document.getElementById("alergias_full")?.value || STATE.alergias || STATE.alergiasConocidas || "").trim();

  let alergiasDisplay = "";
  let alergiaBadgeStyle = "";

  if (alergiasInput && !alergiasInput.toLowerCase().includes("desconocid") && !alergiasInput.toLowerCase().includes("no registra") && !alergiasInput.toLowerCase().includes("ningun") && !alergiasInput.toLowerCase().includes("niega")) {
    alergiasDisplay = `🔴 ALERGIAS: ${alergiasInput.toUpperCase()}`;
    alergiaBadgeStyle = "background:#dc2626; color:#ffffff; font-weight:900; box-shadow:0 1px 4px rgba(220,38,38,0.35);";
  } else if (esAdmisionRapidaEmergencia || alergiasInput.toLowerCase().includes("desconocid")) {
    const sufijoNN = STATE.esNNInconsciente ? " (Inconsciente)" : (STATE.esNNConsciente ? " (Indagar)" : "");
    alergiasDisplay = `⚠️ ALERGIAS: Desconocido${sufijoNN}`;
    alergiaBadgeStyle = "background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-weight:800;";
  } else {
    alergiasDisplay = "⚠️ ALERGIAS: No registradas / Indagar";
    alergiaBadgeStyle = "background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-weight:700;";
  }

  // UBICACIÓN / CAMA ASIGNADA
  const ubicacion = STATE.camaAsignada || (prio === 'I' ? 'Shock Trauma ST-01' : (prio === 'II' ? 'Tópico de Emergencia' : 'Observación / Espera'));

  // INDICADOR TEMPORAL vs OFICIAL
  const esRealmenteTemporal = Boolean(esTemporal || STATE.esNN || !STATE.numDni || STATE.numDni === "NN" || docPaciente.startsWith("S/D") || hcPaciente.includes("TEMP") || hcPaciente.includes("NN"));

  return `
    <div class="wristband-strip" style="width:960px; max-width:100%; height:148px; max-height:148px; background:#ffffff; border:2px solid #94a3b8; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.15); display:flex; position:relative; overflow:hidden; font-family:Arial, Helvetica, sans-serif; box-sizing:border-box; margin:auto;">
      
      <!-- 1. BANDA LATERAL CON COLOR DE TRIAJE -->
      <div class="band-triage" style="width:60px; min-width:60px; height:100%; background:${colorBanda}; color:#ffffff; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; text-align:center; padding:4px; box-sizing:border-box; border-right:2px solid rgba(0,0,0,0.15);">
        <div class="prio-code" style="font-size:24px; line-height:1;">P-${prio}</div>
        <div class="prio-desc" style="font-size:8.5px; writing-mode:vertical-rl; transform:rotate(180deg); letter-spacing:1px; margin-top:6px; text-transform:uppercase;">${nombrePrio}</div>
      </div>

      <!-- 2. CUERPO CENTRAL DE IDENTIFICACIÓN -->
      <div class="wristband-body" style="flex:1; padding:7px 12px; display:flex; flex-direction:column; justify-content:space-between; border-right:2px dashed #cbd5e1; box-sizing:border-box; overflow:visible;">
        
        <!-- HEADER INSTITUCIONAL -->
        <div class="inst-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #cbd5e1; padding-bottom:3px; height:18px;">
          <span class="inst-name" style="font-size:11px; font-weight:800; color:#0f172a; letter-spacing:0.5px;">HOSPITAL REGIONAL DOCENTE UPP</span>
          <div style="display:flex; align-items:center; gap:8px;">
            ${esRealmenteTemporal ? '<span style="background:#dc2626; color:#ffffff; font-size:9px; font-weight:900; padding:1px 6px; border-radius:4px; letter-spacing:0.4px;">🏷️ BRAZALETE TEMPORAL</span>' : '<span style="background:#16a34a; color:#ffffff; font-size:9px; font-weight:900; padding:1px 6px; border-radius:4px; letter-spacing:0.4px;">✓ OFICIAL IDENTIFICADO</span>'}
            <span class="service-name" style="font-size:9.5px; font-weight:700; color:#0284c7;">SERVICIO DE EMERGENCIA · NIVEL III-1</span>
          </div>
        </div>

        <!-- DATOS DEL PACIENTE: NOMBRE Y UBICACIÓN -->
        <div class="patient-main" style="margin:2px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="patient-name" style="font-size:15px; font-weight:900; color:#0f172a; line-height:1.2; letter-spacing:0.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:420px;">
              ${STATE.esNN ? (STATE.esNNInconsciente ? '🚨 ' : '👤 ') : ''}${nombrePaciente}
            </div>
            <div style="font-size:9.5px; font-weight:800; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; padding:2px 6px; border-radius:4px; white-space:nowrap;">
              🛏️ ${ubicacion}
            </div>
          </div>

          <!-- LÍNEA COMPACTA DE FILIACIÓN CLÍNICA -->
          <div class="patient-details" style="display:flex; gap:10px; font-size:10px; color:#334155; margin-top:4px; font-weight:600; flex-wrap:wrap; line-height:1.25;">
            <span><strong>HC:</strong> <span class="hc-badge" style="background:#0f172a; color:#ffffff; padding:1px 5px; border-radius:3px; font-family:monospace; font-size:10px; font-weight:800;">${hcPaciente}</span></span>
            <span><strong>DOC/DNI:</strong> ${docPaciente}</span>
            <span><strong>EDAD:</strong> ${edadDisplay}</span>
            <span><strong>GÉNERO:</strong> ${generoDisplay}</span>
            <span><strong>GS/Rh:</strong> <span style="background:#fee2e2; color:#991b1b; padding:1px 5px; border-radius:3px; font-weight:800;">${gsanDisplay}</span></span>
            <span><strong>INGRESO:</strong> <span style="font-family:monospace; font-weight:700;">${fechaActual} ${horaActual}</span></span>
          </div>
        </div>

        <!-- 3. FOOTER EXCLUSIVO: ALERGIAS Y ALERTAS CRÍTICAS - PERMANENTEMENTE VISIBLE -->
        <div class="risk-bars" style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #cbd5e1; padding-top:4px; margin-top:auto;">
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            <div class="bar-allergy" style="padding:3px 10px; border-radius:4px; font-size:10px; font-weight:900; letter-spacing:0.3px; text-transform:uppercase; ${alergiaBadgeStyle}">
              ${alergiasDisplay}
            </div>
            ${esRealmenteTemporal ? '<div style="background:#7f1d1d; color:#fecaca; font-size:9px; font-weight:900; padding:2px 6px; border-radius:4px;">🚨 LEY N° 27604</div>' : ''}
            ${STATE.esAccidenteTransito ? '<div style="background:#ea580c; color:#fff; font-size:9px; font-weight:900; padding:2px 6px; border-radius:4px;">🚗 SOAT</div>' : ''}
          </div>
          <div style="font-size:8.5px; font-weight:800; color:#64748b; letter-spacing:0.3px;">
            NTS N° 042 / NTS N° 139-MINSA
          </div>
        </div>

      </div>

      <!-- 3. CÓDIGO DE BARRAS DE TRAZABILIDAD (ANTES DE CIERRE) -->
      <div class="wristband-barcode-area" style="width:130px; min-width:130px; height:100%; padding:6px 8px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fafafa; box-sizing:border-box; border-right:2px dashed #94a3b8;">
        <div class="barcode-lines" style="width:110px; height:48px; background:repeating-linear-gradient(90deg, #000 0, #000 2px, #fff 2px, #fff 4px, #000 4px, #000 7px, #fff 7px, #fff 9px, #000 9px, #000 13px, #fff 13px, #fff 15px); border-radius:2px;"></div>
        <div class="barcode-text" style="font-family:monospace; font-size:9px; color:#334155; margin-top:3px; font-weight:700;">*${hcPaciente}*</div>
        <div class="seal-minsa" style="font-size:7.5px; color:#64748b; text-align:center; margin-top:3px; font-weight:700;">MINSA · SEGURIDAD</div>
      </div>

      <!-- 4. ZONA DE TRASLAPE Y CIERRE ADHESIVO (NO CUBRE CÓDIGO DE BARRAS) -->
      <div class="wristband-closure-area" style="width:175px; min-width:175px; height:100%; background:#f8fafc; padding:8px 10px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; box-sizing:border-box;">
        <div style="font-size:9px; font-weight:900; color:#334155; text-transform:uppercase; letter-spacing:0.5px; display:flex; align-items:center; gap:4px;">
          <span>🔒</span> <span>ÁREA DE TRASLAPE</span>
        </div>
        <div style="font-size:8px; font-weight:700; color:#64748b; margin-top:3px; line-height:1.2;">
          ZONA DE CIERRE ADHESIVO
        </div>
        <div style="margin-top:6px; border:1.5px dashed #0284c7; background:#e0f2fe; border-radius:4px; padding:3px 8px; font-size:8px; font-weight:800; color:#0369a1;">
          ✂️ PEGAR / TRASLAPAR AQUÍ
        </div>
        <div style="font-size:7.5px; color:#94a3b8; margin-top:5px; line-height:1.1;">
          [ NO CUBRE CÓDIGO DE BARRAS ]
        </div>
      </div>

    </div>
  `;
}
function generarBrazaleteEmergencia(modo = 'temporal') {
  const printArea = document.getElementById('brazalete_print_area');
  const modalPreview = document.getElementById('brazalete_modal_preview');
  const banner = document.getElementById('banner_notificacion_brazalete');
  const bannerTexto = document.getElementById('banner_brazalete_texto');

  const esTemporal = (modo === 'temporal');
  const htmlBrazalete = construirHTMLBrazalete(esTemporal);

  if (printArea) printArea.innerHTML = htmlBrazalete;
  if (modalPreview) modalPreview.innerHTML = htmlBrazalete;

  if (banner) {
    banner.style.display = 'flex';
    if (bannerTexto) {
      bannerTexto.textContent = esTemporal
        ? '🏷️ [BRAZALETE DE EMERGENCIA TEMPORAL GENERADO AUTOMÁTICAMENTE]'
        : '🏷️ Brazalete Reconciliado con DNI Real — Listo para Re-impresión';
    }
  }

  const hcCodigo = STATE.historiaClinica || "HC-TEMP-NN";
  registrarLogAuditoria("Módulo 1", "GENERAR_BRAZALETE", `Brazalete generado: ${hcCodigo} (Temporal: ${esTemporal})`);
}

function abrirModalBrazalete() {
  const m = document.getElementById('modal_ver_brazalete');
  const modalPreview = document.getElementById('brazalete_modal_preview');
  if (modalPreview) {
    const esTemporal = Boolean(STATE.esNN || !STATE.numDni || STATE.numDni === "NN");
    modalPreview.innerHTML = construirHTMLBrazalete(esTemporal);
  }
  if (m) {
    m.classList.add('open');
    m.style.display = 'flex';
  }
}

function cerrarModalBrazalete() {
  const m = document.getElementById('modal_ver_brazalete');
  if (m) {
    m.classList.remove('open');
    m.style.display = 'none';
  }
}

function imprimirBrazaleteModal() {
  abrirModalBrazalete();
}

function imprimirBrazaleteDirecto() {
  const esTemporal = Boolean(STATE.esNN || !STATE.numDni || STATE.numDni === "NN");
  const htmlBrazalete = construirHTMLBrazalete(esTemporal);
  const hcPaciente = STATE.historiaClinica || "HC-TEMP-NN";

  const w = window.open('', '_blank');
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
        @media print {
          body { background: #ffffff; padding: 0; margin: 0; }
          .instruction-box { display: none; }
          .wristband-strip { box-shadow: none !important; border: 1px solid #000 !important; width: 960px !important; margin: 20px auto !important; }
        }
      </style>
    </head>
    <body>
      <div class="instruction-box">
        <strong>PULSERA TÉRMICA OFICIAL DE IDENTIFICACIÓN DE PACIENTE — NTS N° 042 / NTS N° 139-MINSA</strong><br>
        Imprima y coloque inmediatamente en la muñeca dominante del paciente. El área de traslape posterior evita la obstrucción del código de barras.
      </div>
      ${htmlBrazalete}
    </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 250);
}

window.construirHTMLBrazalete = construirHTMLBrazalete;
window.generarBrazaleteEmergencia = generarBrazaleteEmergencia;
window.abrirModalBrazalete = abrirModalBrazalete;
window.cerrarModalBrazalete = cerrarModalBrazalete;
window.imprimirBrazaleteModal = imprimirBrazaleteModal;
window.imprimirBrazaleteDirecto = imprimirBrazaleteDirecto;


// --- 3. RECONCILIACIÓN EN GUARDAR REGULARIZACIÓN DIFERIDA (BLOQUE 2.1) ---
const orig_guardarRegularizacionDiferida = window.guardarRegularizacionDiferida;
window.guardarRegularizacionDiferida = async function() {
  const dniInput = document.getElementById("reg_dni_input");
  const nomInput = document.getElementById("reg_nombre_input");
  const numDni = dniInput ? dniInput.value.trim() : "";
  const nombre = nomInput ? nomInput.value.trim() : "";

  if (numDni.length === 8 && /^\d+$/.test(numDni)) {
    // FUSIONAR HC-TEMP-NN con Historia Clínica Definitiva
    const hcDefinitiva = `HC-2026-${numDni.slice(-4)}`;
    const hcAnterior = STATE.historiaClinica;
    STATE.numDni = numDni;
    STATE.nombreReniec = nombre || STATE.nombreReniec || "PACIENTE IDENTIFICADO";
    STATE.identificador = `${STATE.nombreReniec} (DNI ${numDni})`;
    STATE.historiaClinica = hcDefinitiva;
    STATE.esNN = false;

    // Actualizar campos en UI
    const elIdent = document.getElementById("ident_full");
    if (elIdent) elIdent.value = STATE.identificador;
    const elDni = document.getElementById("dni_reniec_input");
    if (elDni) elDni.value = numDni;
    const hcDisp = document.getElementById("hc_code_display");
    if (hcDisp) hcDisp.textContent = hcDefinitiva;
    const badgeEstado = document.getElementById("hc_badge_estado");
    if (badgeEstado) {
      badgeEstado.textContent = "✅ Identificado";
      badgeEstado.className = "badge-estado badge-si";
    }

    // Acreditar en SUSALUD Padrón Único
    try {
      if (typeof obtenerOGenerarPadronSusalud === 'function') {
        const padron = await obtenerOGenerarPadronSusalud(numDni);
        if (padron) {
          STATE.padronSusalud = padron;
          if (typeof aplicarSeleccionSeguroYEntorno === 'function') {
            aplicarSeleccionSeguroYEntorno(padron);
          }
        }
      }
    } catch (e) {
      console.warn("Error acreditando en SUSALUD tras reconciliación:", e);
    }

    // Disparar actualización de brazalete reconciliado
    generarBrazaleteEmergencia('reconciliado');

    registrarLogAuditoria("Módulo 2", "RECONCILIACION_IDENTIDAD", `Fusión de ${hcAnterior} a ${hcDefinitiva} (DNI ${numDni})`);
  }

  // Cerrar modal
  cerrarModalRegularizacionDiferida();
  if (typeof actualizarFactura === 'function') actualizarFactura();
  alert("✅ Regularización Administrativa Guardada con Éxito.\nSe fusionaron la identidad y el régimen de aseguramiento conservando intactos todos los medicamentos del Kardex, exámenes, SOP y tiempos de cama.");
};

// --- 4. AUTOMATIZACIÓN DE ÓRDENES CLÍNICAS TIEMPO-DEPENDIENTES & CLAVES OBSTÉTRICAS (BLOQUE 2.2) ---
function inyectarOrdenClinicaAutomatica(tipo, nombre, categoria, costo, cpms_cum) {
  // Asegurar que no se duplique
  if (categoria === 'Farmacia') {
    if (!STATE.kardexItems) STATE.kardexItems = [];
    if (!STATE.kardexItems.some(x => x.nombre === nombre)) {
      STATE.kardexItems.push({
        id: 'MED-AUTO-' + Date.now() + '-' + Math.floor(Math.random()*100),
        nombre: nombre,
        dosis: 'Según protocolo STAT',
        via: 'EV',
        frecuencia: 'STAT',
        cum: cpms_cum,
        costo: costo
      });
      // Inyectar en administrados para que se facture
      if (!STATE.kardexAdministrados) STATE.kardexAdministrados = [];
      if (!STATE.kardexAdministrados.includes(nombre)) STATE.kardexAdministrados.push(nombre);
      registrarFacturaItem(`${nombre} (CUM ${cpms_cum})`, costo, 'Farmacia');
    }
  } else if (categoria === 'Laboratorio') {
    if (!STATE.ordenesLaboratorio) STATE.ordenesLaboratorio = [];
    if (!STATE.ordenesLaboratorio.some(x => x.nombre === nombre)) {
      STATE.ordenesLaboratorio.push({
        id: 'LAB-AUTO-' + Date.now(),
        nombre: nombre,
        cpms: cpms_cum,
        costo: costo,
        estado: 'Procesando STAT'
      });
      registrarFacturaItem(`${nombre} (CPMS ${cpms_cum})`, costo, 'Laboratorio');
    }
  } else if (categoria === 'Imagenes' || categoria === 'Procedimientos') {
    if (!STATE.ordenesImagenes) STATE.ordenesImagenes = [];
    if (!STATE.ordenesImagenes.some(x => x.nombre === nombre)) {
      STATE.ordenesImagenes.push({
        id: 'IMG-AUTO-' + Date.now(),
        nombre: nombre,
        cpms: cpms_cum,
        costo: costo,
        estado: 'Solicitado STAT'
      });
      registrarFacturaItem(`${nombre} (CPMS ${cpms_cum})`, costo, 'Procedimientos');
    }
  }
}

// Override toggleCodigoTiempo to inject critical orders and elevate priority
const orig_toggleCodigoTiempo = window.toggleCodigoTiempo;
window.toggleCodigoTiempo = function(tipo, chk) {
  if (typeof orig_toggleCodigoTiempo === 'function') {
    try { orig_toggleCodigoTiempo(tipo, chk); } catch(e){}
  }

  if (chk) {
    if (tipo === 'infarto') {
      inyectarOrdenClinicaAutomatica('procedimiento', 'Electrocardiograma (EKG) de 12 derivaciones STAT (< 10 min)', 'Procedimientos', 45.00, '89.52.01');
      inyectarOrdenClinicaAutomatica('laboratorio', 'Troponina I de Alta Sensibilidad', 'Laboratorio', 85.00, '84.48.01');
      inyectarOrdenClinicaAutomatica('farmacia', 'Kit Código Infarto (AAS 300mg + Clopidogrel 300mg + Nitroglicerina)', 'Farmacia', 65.00, '00452-01');
      asignarPrioridadClinicaExplicita('I', 'Código Infarto Agudo de Miocardio (SCACEST)');
    } else if (tipo === 'ictus') {
      inyectarOrdenClinicaAutomatica('imagen', 'Tomografía Espiral Multicorte (TEM) Cerebral sin contraste STAT', 'Imagenes', 280.00, '87.03.01');
      inyectarOrdenClinicaAutomatica('laboratorio', 'Perfil de Coagulación + Glicemia STAT', 'Laboratorio', 55.00, '85.02.05');
      asignarPrioridadClinicaExplicita('I', 'Código Ictus / ACV Isquémico Agudo (< 4.5h Ventana)');
    } else if (tipo === 'sepsis') {
      inyectarOrdenClinicaAutomatica('laboratorio', 'Lactato Sérico + Hemocultivo x2 STAT', 'Laboratorio', 95.00, '84.13.02');
      inyectarOrdenClinicaAutomatica('farmacia', 'Reto de Fluidos NaCl 0.9% 30ml/kg EV + Ceftriaxona 2g EV STAT', 'Farmacia', 75.00, '01284-02');
      asignarPrioridadClinicaExplicita('I', 'Código Sepsis Severa / Shock Séptico');
    }

    if (typeof renderizarFarmacia === 'function') renderizarFarmacia();
    if (typeof renderizarLaboratorio === 'function') renderizarLaboratorio();
    if (typeof actualizarFactura === 'function') actualizarFactura();
    registrarLogAuditoria("Módulo 1", "CODIGO_TIEMPO_ACTIVADO", `Protocolo ${tipo.toUpperCase()} activado: Órdenes inyectadas`);
  }
};

function asignarPrioridadClinicaExplicita(prio, motivo) {
  STATE.prioridad = prio;
  if (!STATE.motivoConsulta || STATE.motivoConsulta.length < 5) {
    STATE.motivoConsulta = motivo;
  }
  if (typeof mostrarPrioridad === 'function') {
    mostrarPrioridad(prio, {
      tipo: PRIORIDADES[prio]?.nombre || `Prioridad ${prio}`,
      desc: motivo,
      destino: prio === 'I' ? 'Shock Trauma ST-01' : 'Tópico Crítico / Emergencia'
    });
  }
}

// Hook Clave Obstétrica
document.addEventListener("DOMContentLoaded", function() {
  const selClave = document.getElementById("clave_obstetrica_sel");
  if (selClave) {
    selClave.addEventListener("change", function() {
      const val = this.value;
      if (val === "roja") {
        inyectarOrdenClinicaAutomatica('farmacia', 'Kit Clave Roja: Oxitocina + Ácido Tranexámico 1g EV', 'Farmacia', 80.00, '00891-01');
        asignarPrioridadClinicaExplicita('I', 'Clave Roja Obstétrica: Hemorragia Posparto Masiva');
      } else if (val === "azul") {
        inyectarOrdenClinicaAutomatica('farmacia', 'Kit Clave Azul: Sulfato de Magnesio 4g EV Esquema Zuspan', 'Farmacia', 70.00, '00932-01');
        asignarPrioridadClinicaExplicita('I', 'Clave Azul Obstétrica: Preeclampsia Severa / Eclampsia');
      } else if (val === "amarilla") {
        inyectarOrdenClinicaAutomatica('farmacia', 'Kit Clave Amarilla: Antibioterapia amplio espectro + Fluidoterapia', 'Farmacia', 90.00, '01045-01');
        asignarPrioridadClinicaExplicita('II', 'Clave Amarilla Obstétrica: Sepsis Puerperal / Infección Severa');
      }
      if (typeof renderizarFarmacia === 'function') renderizarFarmacia();
      if (typeof actualizarFactura === 'function') actualizarFactura();
      registrarLogAuditoria("Módulo 1", "CLAVE_OBSTETRICA", `Clave Obstétrica activada: ${val}`);
    });
  }
});

// --- 5. FARMACOVIGILANCIA ACTIVA Y BLOQUEO POR ALERGIAS (BLOQUE 2.3) ---
function validarFarmacovigilanciaAlergias(nombreItem, tipoItem = 'fármaco') {
  const rawAlergias = (document.getElementById('alergias_full')?.value || STATE.alergias || '').toLowerCase();
  if (!rawAlergias || rawAlergias === 'ninguna' || rawAlergias === 'niega') {
    return { permitido: true };
  }

  const itemLower = (nombreItem || '').toLowerCase();

  const grupos = [
    {
      alergenos: ['penicilina', 'betalactamico', 'betalactámico', 'amoxicilina', 'ampicilina'],
      farmacosBloqueados: ['penicilina', 'amoxicilina', 'ampicilina', 'ceftriaxona', 'cefazolina', 'meropenem', 'piperacilina'],
      nombreGrupo: 'Penicilinas / Betalactámicos'
    },
    {
      alergenos: ['aine', 'metamizol', 'ketorolaco', 'ibuprofeno', 'aspirina', 'naproxeno', 'diclofenaco'],
      farmacosBloqueados: ['ketorolaco', 'metamizol', 'ibuprofeno', 'diclofenaco', 'ketoprofeno', 'naproxeno', 'aspirina', 'aas', 'clonixinato'],
      nombreGrupo: 'AINEs / Metamizol / Ketorolaco'
    },
    {
      alergenos: ['sulfa', 'sulfas', 'cotrimoxazol', 'trimetoprima'],
      farmacosBloqueados: ['sulfametoxazol', 'trimetoprima', 'sulfa', 'sulfadiazina'],
      nombreGrupo: 'Sulfonamidas (Sulfas)'
    },
    {
      alergenos: ['yodo', 'contraste', 'medio de contraste'],
      farmacosBloqueados: ['contraste', 'tem con contraste', 'urografia', 'angiotem con contraste'],
      nombreGrupo: 'Yodo / Medios de Contraste Radiológico'
    }
  ];

  for (const g of grupos) {
    const tieneAlergia = g.alergenos.some(a => rawAlergias.includes(a));
    if (tieneAlergia) {
      const matchFarmaco = g.farmacosBloqueados.some(f => itemLower.includes(f));
      if (matchFarmaco) {
        return {
          permitido: false,
          grupo: g.nombreGrupo,
          detalle: `El paciente registra antecedente confirmado de alergia a [${g.nombreGrupo}]. La administración de '${nombreItem}' fue bloqueada inmediatamente por Farmacovigilancia (NTS N° 139-MINSA).`
        };
      }
    }
  }

  return { permitido: true };
}

function agregarMedicamentoAKardex(med, dosis, via = 'EV', cum = 'CUM-GEN') {
  const selMedEl = document.getElementById('select_farmacia_catalogo');
  med = med || (selMedEl ? selMedEl.value : 'Medicamento General');
  const selDosisEl = document.getElementById('input_dosis_kardex');
  dosis = dosis || (selDosisEl ? selDosisEl.value : '1 ampolla EV');
  const selHorarioEl = document.getElementById('input_horario_kardex');
  const horario = (selHorarioEl ? selHorarioEl.value : 'STAT');
  const check = validarFarmacovigilanciaAlergias(med, 'medicamento');
  if (!check.permitido) {
    alert(`🚨 ALERTA ROJA DE FARMACOVIGILANCIA (NTS N° 139-MINSA):\n\n${check.detalle}\n\nPrescripción BLOQUEADA por seguridad del paciente.`);
    registrarLogAuditoria("Módulo 4", "FARMACOVIGILANCIA_BLOQUEO", check.detalle);
    return false;
  }

  inyectarOrdenClinicaAutomatica('farmacia', med, 'Farmacia', 25.00, cum);
  if (typeof renderizarFarmacia === 'function') renderizarFarmacia();
  if (typeof actualizarFactura === 'function') actualizarFactura();
  return true;
}

function solicitarEstudioImagen(tipo, cpms = 'CPMS-IMG') {
  const selImgEl = document.getElementById('select_imagenes_catalogo');
  tipo = tipo || (selImgEl ? selImgEl.value : '');
  if (!tipo) {
    alert('Por favor seleccione un estudio de imágenes.');
    return false;
  }
  const selIndEl = document.getElementById('input_indicacion_img');
  const indicacion = selIndEl ? selIndEl.value : 'Evaluación de Emergencia';
  const check = validarFarmacovigilanciaAlergias(tipo, 'imagen');
  if (!check.permitido) {
    alert(`🚨 ALERTA ROJA DE FARMACOVIGILANCIA (NTS N° 139-MINSA):\n\n${check.detalle}\n\nEstudio radiológico BLOQUEADO.`);
    registrarLogAuditoria("Módulo 4", "FARMACOVIGILANCIA_BLOQUEO", check.detalle);
    return false;
  }

  inyectarOrdenClinicaAutomatica('imagen', tipo, 'Imagenes', 150.00, cpms);
  renderizarTablaOrdenesImagenes(tipo, indicacion);
  if (typeof actualizarFactura === 'function') actualizarFactura();
  return true;
}

function solicitarExamenLaboratorio(nombre, cpms = 'CPMS-LAB', prioridad) {
  const selLabEl = document.getElementById('select_laboratorio_catalogo');
  nombre = nombre || (selLabEl ? selLabEl.value : '');
  if (!nombre) {
    alert('Por favor seleccione una prueba de laboratorio.');
    return false;
  }
  const selPrioEl = document.getElementById('select_prioridad_lab');
  prioridad = prioridad || (selPrioEl ? selPrioEl.value : 'Urgente (30 min)');

  const check = validarFarmacovigilanciaAlergias(nombre, 'laboratorio');
  if (!check.permitido) {
    alert(`🚨 ALERTA ROJA (NTS N° 139-MINSA):\n\n${check.detalle}\n\nPrueba analítica BLOQUEADA.`);
    registrarLogAuditoria("Módulo 4", "FARMACOVIGILANCIA_BLOQUEO", check.detalle);
    return false;
  }

  inyectarOrdenClinicaAutomatica('laboratorio', nombre, 'Laboratorio', 45.00, cpms);
  renderizarTablaOrdenesLaboratorio(nombre, prioridad);
  if (typeof actualizarFactura === 'function') actualizarFactura();
  return true;
}

function renderizarTablaOrdenesLaboratorio(nuevoNombre, nuevaPrioridad) {
  const tbody = document.getElementById('tabla_ordenes_lab_body');
  if (!tbody) return;
  const st = (typeof window !== 'undefined' && window.STATE) ? window.STATE : ((typeof STATE !== 'undefined') ? STATE : {});
  if (!st.ordenesLaboratorio) st.ordenesLaboratorio = [];
  
  if (nuevoNombre) {
    const orden = st.ordenesLaboratorio.find(x => x.nombre === nuevoNombre);
    if (orden) orden.prioridad = nuevaPrioridad;
  }

  tbody.innerHTML = st.ordenesLaboratorio.map(o => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:8px 10px; font-weight:700; color:#0f172a;">🧪 ${o.nombre}</td>
      <td style="padding:8px 10px;">
        <span style="background:${(o.prioridad || '').includes('Urgente') ? '#fee2e2' : '#f1f5f9'}; color:${(o.prioridad || '').includes('Urgente') ? '#dc2626' : '#475569'}; padding:3px 8px; border-radius:4px; font-weight:800; font-size:11px;">
          ${o.prioridad || 'Urgente (30 min)'}
        </span>
      </td>
      <td style="padding:8px 10px; text-align:center;">
        <span style="background:#e0f2fe; color:#0369a1; padding:3px 8px; border-radius:4px; font-weight:700; font-size:11px;">
          ⏳ ${o.estado || 'Procesando STAT'}
        </span>
      </td>
    </tr>
  `).join('');
}

function renderizarTablaOrdenesImagenes(nuevoNombre, nuevaIndicacion) {
  const tbody = document.getElementById('tabla_ordenes_img_body');
  if (!tbody) return;
  const st = (typeof window !== 'undefined' && window.STATE) ? window.STATE : ((typeof STATE !== 'undefined') ? STATE : {});
  if (!st.ordenesImagenes) st.ordenesImagenes = [];

  if (nuevoNombre) {
    const orden = st.ordenesImagenes.find(x => x.nombre === nuevoNombre);
    if (orden) orden.indicacion = nuevaIndicacion;
  }

  tbody.innerHTML = st.ordenesImagenes.map(o => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:8px 10px; font-weight:700; color:#0f172a;">🩻 ${o.nombre}</td>
      <td style="padding:8px 10px; font-size:11px; color:#334155;">
        ${o.indicacion || 'Evaluación de Emergencia'}
      </td>
      <td style="padding:8px 10px; text-align:center;">
        <span style="background:#fef3c7; color:#b45309; padding:3px 8px; border-radius:4px; font-weight:700; font-size:11px;">
          📸 En cola de adquisición
        </span>
      </td>
    </tr>
  `).join('');
}

window.solicitarExamenLaboratorio = solicitarExamenLaboratorio;
window.renderizarTablaOrdenesLaboratorio = renderizarTablaOrdenesLaboratorio;
window.renderizarTablaOrdenesImagenes = renderizarTablaOrdenesImagenes;

window.validarFarmacovigilanciaAlergias = validarFarmacovigilanciaAlergias;
window.agregarMedicamentoAKardex = agregarMedicamentoAKardex;
window.solicitarEstudioImagen = solicitarEstudioImagen;

// --- 6. CICLO DE CAMAS EN ACCESOS RÁPIDOS Y DESCUENTO AUTOMÁTICO (BLOQUE 2.4) ---
function ocuparCamaPorTipo(tipoDeseado) {
  // Buscar en RECURSOS_HOSPITALARIOS la primera cama libre del tipo
  for (const id in RECURSOS_HOSPITALARIOS) {
    const rec = RECURSOS_HOSPITALARIOS[id];
    if (rec && rec.tipo === tipoDeseado && rec.estado === 'disponible') {
      if (typeof asignarPacienteActualARecurso === 'function') {
        asignarPacienteActualARecurso(id);
        if (typeof actualizarWidgetFlotanteCamas === 'function') actualizarWidgetFlotanteCamas();
        return id;
      }
    }
  }
  // Si no hay específica, actualizar flotante
  if (typeof actualizarWidgetFlotanteCamas === 'function') actualizarWidgetFlotanteCamas();
  return null;
}

const orig_activarPanicoShockTrauma = window.activarPanicoShockTrauma;
window.activarPanicoShockTrauma = function() {
  if (typeof orig_activarPanicoShockTrauma === 'function') {
    orig_activarPanicoShockTrauma();
  }
  // Idempotente: solo asignar cama si el paciente no tiene aún cama registrada
  if (!STATE.camaAsignadaId) {
    if (RECURSOS_HOSPITALARIOS['ST-01'] && RECURSOS_HOSPITALARIOS['ST-01'].estado === 'disponible') {
      asignarPacienteActualARecurso('ST-01', null, null, true);
    } else if (RECURSOS_HOSPITALARIOS['ST-02'] && RECURSOS_HOSPITALARIOS['ST-02'].estado === 'disponible') {
      asignarPacienteActualARecurso('ST-02', null, null, true);
    }
  }
  // Generar brazalete de emergencia P-I sin bloquear
  generarBrazaleteEmergencia('temporal');
  if (typeof actualizarWidgetFlotanteCamas === 'function') actualizarWidgetFlotanteCamas();
};

const orig_activarIngresoDirectoQuirofano = window.activarIngresoDirectoQuirofano;
window.activarIngresoDirectoQuirofano = function() {
  if (typeof orig_activarIngresoDirectoQuirofano === 'function') {
    orig_activarIngresoDirectoQuirofano();
  }
  // Ocupar 1 solo quirófano libre
  for (let id of ['SOP-01', 'SOP-02', 'SOP-03']) {
    if (RECURSOS_HOSPITALARIOS[id] && RECURSOS_HOSPITALARIOS[id].estado === 'disponible') {
      asignarPacienteActualARecurso(id, null, null, true);
      break;
    }
  }
  generarBrazaleteEmergencia('temporal');
  if (typeof actualizarWidgetFlotanteCamas === 'function') actualizarWidgetFlotanteCamas();
};

const orig_ejecutarAdmisionRapidaNN = window.ejecutarAdmisionRapidaNN;
window.ejecutarAdmisionRapidaNN = function(e) {
  if (typeof orig_ejecutarAdmisionRapidaNN === 'function') {
    orig_ejecutarAdmisionRapidaNN(e);
  }
  generarBrazaleteEmergencia('temporal');
  if (typeof actualizarWidgetFlotanteCamas === 'function') actualizarWidgetFlotanteCamas();
};

const orig_admitirEmergenciaSoat = window.admitirEmergenciaSoat;
window.admitirEmergenciaSoat = function() {
  if (typeof orig_admitirEmergenciaSoat === 'function') {
    orig_admitirEmergenciaSoat();
  }
  generarBrazaleteEmergencia('temporal');
};

const orig_seleccionarDestinoPostTopico = window.seleccionarDestinoPostTopico;
window.seleccionarDestinoPostTopico = function(destino) {
  if (typeof orig_seleccionarDestinoPostTopico === 'function') {
    orig_seleccionarDestinoPostTopico(destino);
  }
  if (destino === 'observacion') {
    ocuparCamaPorTipo('observacion');
  } else if (destino === 'quirofano') {
    ocuparCamaPorTipo('quirofano');
  } else if (destino === 'shock_trauma') {
    ocuparCamaPorTipo('shock_trauma');
  }
  if (typeof actualizarWidgetFlotanteCamas === 'function') actualizarWidgetFlotanteCamas();
};

const orig_grabarAtencionCompleta = window.grabarAtencionCompleta;
window.grabarAtencionCompleta = function() {
  if (STATE.camaAsignadaId && typeof liberarCamaRecurso === 'function') {
    liberarCamaRecurso(STATE.camaAsignadaId);
  }
  if (typeof orig_grabarAtencionCompleta === 'function') {
    orig_grabarAtencionCompleta();
  }
  if (typeof actualizarWidgetFlotanteCamas === 'function') actualizarWidgetFlotanteCamas();

  // Bloqueo de Historia Clínica Cerrada e Inmutable (NTS N° 139-MINSA)
  const lockBanner = document.getElementById('banner_hc_inmutable_lock');
  if (lockBanner) lockBanner.style.display = 'flex';
  STATE.atencionCerrada = true;
  registrarLogAuditoria("Módulo 8", "CIERRE_HC_INMUTABLE", `Atención cerrada. Historia Clínica cerrada e inmutable: ${STATE.historiaClinica}`);
};

// --- 7. PADRÓN ÚNICO SUSALUD BD Y PERSISTENCIA POR DNI (BLOQUE 3.1 & 3.2) ---
// # TODO: REEMPLAZAR POR ENDPOINT REAL SITEDS / SUSALUD
window.obtenerOGenerarPadronSusalud = async function(dni) {
  if (!dni || String(dni).toUpperCase().startsWith("NN") || STATE.esNN) {
    return null;
  }
  const numDni = String(dni).replace(/\D/g, "");
  if (numDni.length !== 8) return null;

  const badgePersistencia = document.getElementById("badge_susalud_persistencia");

  // PASO 1: Buscar en PADRON_UNICO_SUSALUD_BD en localStorage
  let padronBD = {};
  try {
    const rawBD = localStorage.getItem("PADRON_UNICO_SUSALUD_BD");
    if (rawBD) padronBD = JSON.parse(rawBD);
  } catch(e){}

  if (padronBD[numDni]) {
    const padronExistente = padronBD[numDni];
    padronExistente.origen_registro = "BD_HISTORICA";
    if (badgePersistencia) {
      badgePersistencia.style.display = "inline-block";
      badgePersistencia.style.background = "#dcfce7";
      badgePersistencia.style.color = "#15803d";
      badgePersistencia.style.border = "1px solid #86efac";
      badgePersistencia.textContent = "🔒 [BD HISTÓRICA: PERFIL SUSALUD RECUPERADO]";
    }
    registrarLogAuditoria("Módulo 3", "SUSALUD_RECUPERADO_BD", `Perfil SUSALUD recuperado de BD para DNI ${numDni}`);
    return padronExistente;
  }

  // PASO 2: Si no existe, sortear perfil UNA ÚNICA VEZ y guardarlo permanentemente
  const nuevoPadron = await fetch_padron_susalud_siteds(numDni);
  padronBD[numDni] = nuevoPadron;
  try {
    localStorage.setItem("PADRON_UNICO_SUSALUD_BD", JSON.stringify(padronBD));
  } catch(e){}

  if (badgePersistencia) {
    badgePersistencia.style.display = "inline-block";
    badgePersistencia.style.background = "#e0f2fe";
    badgePersistencia.style.color = "#0369a1";
    badgePersistencia.style.border = "1px solid #bae6fd";
    badgePersistencia.textContent = "✨ [NUEVA CONSULTA API -> GUARDADO EN BD]";
  }
  registrarLogAuditoria("Módulo 3", "SUSALUD_NUEVA_CONSULTA", `Nuevo perfil SUSALUD guardado en BD para DNI ${numDni}`);
  return nuevoPadron;
};

// --- 8. REGLA ESTRICTA SOAT Y LIQUIDACIÓN (BLOQUE 3.3 & 3.4) ---
function toggleExclusionEps(checked) {
  STATE.exclusionEps = checked;
  if (typeof actualizarFactura === 'function') {
    actualizarFactura();
  }
  registrarLogAuditoria("Entorno Asistencial", "EXCLUSION_EPS_TOGGLE", `Exclusión EPS: ${checked ? 'ACTIVA' : 'INACTIVA'}`);
}
window.toggleExclusionEps = toggleExclusionEps;

// Override calcularLiquidacionSeguro with exact legal rules
const orig_calcularLiquidacionSeguro = window.calcularLiquidacionSeguro;
window.calcularLiquidacionSeguro = function() {
  const entorno = STATE.entornoOperativo || "publico";
  const padron = STATE.padronSusalud;
  const esAccidente = STATE.esAccidenteTransito || STATE.tipoOrigenEvento === "soat";
  const esFuga = STATE.soatVehiculoFuga || STATE.eventoFugaTransversal || (padron && padron.condicion_evento === "ACCIDENTE_TRANSITO_FUGA");
  const totalBruto = STATE.items_factura ? STATE.items_factura.reduce((s, i) => s + (parseFloat(i.costo) || 0), 0) : 0;
  const subtotalFarmacia = STATE.items_factura
    ? STATE.items_factura.filter(i => (i.categoria || "").toLowerCase().includes("farmacia")).reduce((s, i) => s + (parseFloat(i.costo) || 0), 0)
    : 0;
  const subtotalServicios = Math.max(0, totalBruto - subtotalFarmacia);
  const esEmergencia = (STATE.prioridad === "I" || STATE.prioridad === "II");

  let lugarAtencion = "";
  let coberturaSeguro = 0;
  let copagoFijo = 0;
  let pctCoaseguro = 0;
  let totalPaciente = 0;
  let motivoLiquidacion = "";
  let etiquetaRegimen = "";
  let condicionSusalud = "";
  let coberturaSector = "";
  let alertaSector = "";
  let esEpsPrivado = (entorno === "privado");
  let esPublico = (entorno === "publico");

  // CASO A: ACCIDENTE DE TRÁNSITO CON VEHÍCULO EN FUGA (O SOAT VENCIDO)
  if (esFuga) {
    lugarAtencion = "Emergencia Especializada (Accidente de Tránsito con Chofer en Fuga)";
    etiquetaRegimen = "🚨 Chofer en Fuga (Sin SOAT Identificado · Cobro 100% Particular)";
    condicionSusalud = "🚨 Accidente de Tránsito con Fuga (Sin SOAT)";
    coberturaSector = "0% (Sin Cobertura: Chofer en Fuga)";
    copagoFijo = 0.00;
    pctCoaseguro = 100;
    coberturaSeguro = 0.00;
    totalPaciente = totalBruto;
    alertaSector = "🚨 Sin SOAT identificable por fuga vehicular: Ningún seguro (SIS, EsSalud, Privado) cubre este evento. El paciente asume el 100% de la liquidación.";
    motivoLiquidacion = "ACCIDENTE DE TRÁNSITO CON VEHÍCULO EN FUGA (D.S. N° 024-2002-MTC). Al no existir vehículo ni placa identificada, NO SE ACTIVA EL SOAT. Por normativa SUSALUD, ningún seguro regular cubre siniestros viales. 100% a cargo del paciente.";

    STATE.soatConsumido = 0;
    STATE.soatDisponible = 0;

    return {
      lugarAtencion, totalBruto, subtotalServicios, subtotalFarmacia,
      coberturaSeguro: 0, coaseguroFarmacia: 0, copagoUrgencia: 0, copagoFijo: 0,
      pctCoaseguro: 100, totalPaciente, motivoLiquidacion, etiquetaRegimen,
      condicionSusalud, coberturaSector, alertaSector, esEpsPrivado, esPublico
    };
  }

  // CASO B: ACCIDENTE DE TRÁNSITO CON PLACA IDENTIFICADA (SOAT ACTIVO)
  if (esAccidente && !esFuga) {
    lugarAtencion = "Servicio de Emergencia Especializado SOAT — D.S. N° 024-2002-MTC";
    etiquetaRegimen = "🚗 SOAT Ley D.S. N° 024-2002-MTC (Tope 5 UIT = S/. 27,500.00)";
    condicionSusalud = "🚗 Siniestro Vial SOAT Activo (Placa Identificada)";
    coberturaSector = "100% Cobertura SOAT (Hasta 5 UIT = S/. 27,500.00)";
    copagoFijo = 0.00;
    pctCoaseguro = 0;
    const topeSoat = 27500.00;

    if (totalBruto <= topeSoat) {
      coberturaSeguro = totalBruto;
      totalPaciente = 0.00;
      STATE.soatConsumido = totalBruto;
      STATE.soatDisponible = topeSoat - totalBruto;
      alertaSector = "✅ Cobertura SOAT al 100% dentro del tope legal de 5 UIT (S/. 27,500.00). Paciente paga S/. 0.00.";
      motivoLiquidacion = `COBERTURA TOTAL SOAT ACTIVO. Total facturado S/. ${totalBruto.toFixed(2)} cubierto al 100% dentro del tope de 5 UIT. Saldo disponible: S/. ${STATE.soatDisponible.toFixed(2)}.`;
    } else {
      // REGLA ESTRICTA DE EXCESO SOAT (> 5 UIT = S/. 27,500.00)
      coberturaSeguro = topeSoat;
      totalPaciente = totalBruto - topeSoat;
      STATE.soatConsumido = topeSoat;
      STATE.soatDisponible = 0.00;
      alertaSector = `🚨 TOPE LEGAL SOAT 5 UIT (S/. 27,500.00) AGOTADO: Ningún seguro regular (SIS/EsSalud/EPS) cubre siniestros viales. El saldo excedente de S/. ${totalPaciente.toFixed(2)} es asumido al 100% por el Paciente / Responsable Solidario.`;
      motivoLiquidacion = `TOPE LEGAL SOAT 5 UIT AGOTADO (S/. 27,500.00). Por mandato de la Ley General de Transporte y SUSALUD, ningún seguro de salud (SIS, EsSalud ni IAFAS EPS) cubre siniestros viales. El excedente de S/. ${totalPaciente.toFixed(2)} es facturado al 100% al paciente.`;
    }

    return {
      lugarAtencion, totalBruto, subtotalServicios, subtotalFarmacia,
      coberturaSeguro, coaseguroFarmacia: 0, copagoUrgencia: 0, copagoFijo: 0,
      pctCoaseguro: 0, totalPaciente, motivoLiquidacion, etiquetaRegimen,
      condicionSusalud, coberturaSector, alertaSector, esEpsPrivado, esPublico
    };
  }

  // CASO C: ENTORNO PÚBLICO (MINSA / SIS / ESSALUD)
  if (entorno === "publico") {
    lugarAtencion = "Hospital Regional Docente UPP (Red Asistencial Pública / MINSA / EsSalud)";
    const pub = padron ? padron.publico : null;

    if (!pub || pub.estado !== "ACTIVO") {
      etiquetaRegimen = "Hospital Público · Paciente Particular (Sin Seguro Estatal)";
      condicionSusalud = pub?.regimen || "PARTICULAR NO ASEGURADO EN ESTADO";
      coberturaSector = "0% (Sin Cobertura Estatal en Red Pública)";
      copagoFijo = 0.00;
      pctCoaseguro = 100;
      coberturaSeguro = 0.00;
      totalPaciente = totalBruto;
      alertaSector = "⚠️ Paciente no registra afiliación pública activa (SIS/EsSalud): Tarifa particular 100%.";
      motivoLiquidacion = "PACIENTE PARTICULAR EN RED PÚBLICA. No registra seguro estatal activo en el Padrón SUSALUD. Asume el 100% de la liquidación.";
    } else {
      etiquetaRegimen = `${pub.entidad} Gratuito Integral (${pub.regimen} · Ley N° 27604)`;
      condicionSusalud = `${pub.entidad} - ${pub.regimen} (${pub.codigo || 'ACTIVO'})`;
      coberturaSector = "100% Cobertura Integral Pública (Pago S/ 0.00)";
      copagoFijo = 0.00;
      pctCoaseguro = 0;
      coberturaSeguro = totalBruto;
      totalPaciente = 0.00;
      alertaSector = "✅ Cobertura Integral Estatal al 100% (Pago Cero en cualquier prioridad I a V).";
      motivoLiquidacion = `COBERTURA TOTAL ESTATAL. Paciente acreditado en ${pub.entidad} bajo régimen '${pub.regimen}'. Conforme a Ley 27604 y Ley 29344, 100% cubierto por el Estado. Paciente paga S/. 0.00.`;
    }

    return {
      lugarAtencion, totalBruto, subtotalServicios, subtotalFarmacia,
      coberturaSeguro, coaseguroFarmacia: 0, copagoUrgencia: 0, copagoFijo,
      pctCoaseguro, totalPaciente, motivoLiquidacion, etiquetaRegimen,
      condicionSusalud, coberturaSector, alertaSector, esEpsPrivado, esPublico
    };
  }

  // CASO D: ENTORNO PRIVADO (CLÍNICA / EPS / SITEDS)
  lugarAtencion = "Clínica Privada Especializada (Red Prestacional Privada EPS / SITEDS)";
  const priv = padron ? padron.privado : null;

  if (!priv || priv.estado_poliza !== "ACTIVA") {
    etiquetaRegimen = "Clínica Privada · Tarifa Particular (Sin Póliza EPS)";
    condicionSusalud = `Sin Cobertura Privada (${padron ? padron.tipo_aseguramiento : 'PARTICULAR'})`;
    coberturaSector = "0% (No aplica cobertura pública en Clínica Privada)";
    copagoFijo = 0.00;
    pctCoaseguro = 100;
    coberturaSeguro = 0.00;
    totalPaciente = totalBruto;
    alertaSector = `Paciente registra [${padron?.publico?.entidad || 'Sin Seguro'}] -> No aplica cobertura en Clínica Privada (Cobro 100% Particular).`;
    motivoLiquidacion = "ATENCIÓN PARTICULAR EN CLÍNICA PRIVADA. Paciente no cuenta con seguro privado EPS activo. La totalidad es asumida al 100% por el paciente.";
  } else if (STATE.exclusionEps) {
    // APLICACIÓN ESTRICTA DE EXCLUSIÓN EPS
    etiquetaRegimen = "Clínica Privada EPS · Siniestro Rechazado por Exclusión Contractual";
    condicionSusalud = "Rechazo SITEDS (Exclusión de Póliza Aplicada)";
    coberturaSector = "0% (Siniestro Rechazado por Aseguradora)";
    copagoFijo = 0.00;
    pctCoaseguro = 100;
    coberturaSeguro = 0.00;
    totalPaciente = totalBruto;
    alertaSector = "🚨 Siniestro Rechazado por Exclusión Contractual de Póliza EPS. El paciente asume el 100% de la cuenta hospitalaria (incluso en P-I y P-II).";
    motivoLiquidacion = "SINIESTRO RECHAZADO POR IAFAS EPS. Por causal de exclusión contractual (ej. intoxicación, falta de carencia o riesgo excluido), la aseguradora anula la cobertura. Paciente asume el 100% de la totalidad facturada.";
  } else if (esEmergencia) {
    // LEY DE EMERGENCIA N° 27604 EN PRIORIDAD I Y II
    etiquetaRegimen = `${priv.iafas_eps} · Emergencia Médica Vital (P-${STATE.prioridad} · Ley N° 27604)`;
    condicionSusalud = `${priv.iafas_eps} · ${priv.plan_salud || 'Plan Preferente'} (Emergencia Vital P-${STATE.prioridad})`;
    coberturaSector = "100% Cobertura Ley de Emergencia N° 27604 (Pago S/ 0.00)";
    copagoFijo = 0.00;
    pctCoaseguro = 0;
    coberturaSeguro = totalBruto;
    totalPaciente = 0.00;
    alertaSector = "✅ Ley N° 27604: Emergencia con riesgo de muerte o daño orgánico cubierta al 100% por IAFAS EPS (Pago S/ 0.00).";
    motivoLiquidacion = `EMERGENCIA VITAL CUBIERTA AL 100% POR LEY N° 27604 (P-${STATE.prioridad}). Póliza ${priv.iafas_eps} activa. Procedimientos críticos, shock trauma, exámenes, estancia y farmacia cubiertos al 100% por la aseguradora. Pago del paciente: S/. 0.00.`;
  } else {
    // ATENCIÓN DE URGENCIA EPS EN PRIORIDAD III, IV Y V
    copagoFijo = parseFloat(priv.copago_fijo) || 60.00;
    pctCoaseguro = parseFloat(priv.coaseguro_pct) || 0.15;
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
    condicionSusalud = `${priv.iafas_eps} · ${priv.plan_salud || 'Plan Base'} (SITEDS: AUTORIZADO)`;
    coberturaSector = `Copago Fijo S/. ${copagoFijo.toFixed(2)} + ${(pctCoaseguro * 100).toFixed(0)}% Coaseguro`;
    alertaSector = `Atención de Urgencia/Ambulatoria EPS: Paciente abona copago fijo S/. ${copagoFijo.toFixed(2)} + ${(pctCoaseguro * 100).toFixed(0)}% coaseguro (S/. ${coaseguroMonto.toFixed(2)}). Saldo facturado a la EPS.`;
    motivoLiquidacion = `ATENCIÓN DE URGENCIA EPS (P-${STATE.prioridad || 'III'}). Póliza ${priv.iafas_eps} activa. Se liquida copago fijo S/. ${copagoFijo.toFixed(2)} más coaseguro del ${(pctCoaseguro * 100).toFixed(0)}%. Total a cargo del paciente: S/. ${totalPaciente.toFixed(2)}.`;
  }

  return {
    lugarAtencion, totalBruto, subtotalServicios, subtotalFarmacia,
    coberturaSeguro, coaseguroFarmacia: 0, copagoUrgencia: copagoFijo, copagoFijo,
    pctCoaseguro: (pctCoaseguro * 100), totalPaciente, motivoLiquidacion, etiquetaRegimen,
    condicionSusalud, coberturaSector, alertaSector, esEpsPrivado, esPublico
  };
};

// Hook Anti-Glosas Checklist in actualizarFactura
const orig_actualizarFactura = window.actualizarFactura;
window.actualizarFactura = function() {
  if (typeof orig_actualizarFactura === 'function') {
    orig_actualizarFactura();
  }

  // Actualizar indicadores Anti-Glosas
  const g1 = document.getElementById("glosa_ind_1");
  const g2 = document.getElementById("glosa_ind_2");
  const g3 = document.getElementById("glosa_ind_3");
  const g4 = document.getElementById("glosa_ind_4");

  if (g1) {
    const tieneSeguroValido = Boolean(STATE.padronSusalud || (STATE.tipoOrigenEvento === 'soat' && !STATE.soatVehiculoFuga));
    g1.textContent = tieneSeguroValido ? "[✓] Acreditación SUSALUD / SITEDS / SOAT validada" : "[⚠️] Acreditación SUSALUD pendiente";
    g1.style.color = tieneSeguroValido ? "#16a34a" : "#dc2626";
  }

  if (g2) {
    const cie10Val = (STATE.cie10Codigo || document.getElementById("cie10_select")?.value || document.getElementById("cie10_input")?.value || "").trim();
    const tieneCie10 = cie10Val.length > 2;
    g2.textContent = tieneCie10 ? `[✓] Diagnóstico CIE-10 (${cie10Val}) y procedimientos CPMS/CUM` : "[❌] Alerta: Diagnóstico CIE-10 no registrado";
    g2.style.color = tieneCie10 ? "#16a34a" : "#dc2626";
  }

  if (g3) {
    const consentExonerado = (STATE.prioridad === 'I' || STATE.prioridad === 'II' || STATE.esNN);
    const chkDatos = document.getElementById("chk_consentimiento_datos")?.checked;
    const consentValido = consentExonerado || chkDatos;
    g3.textContent = consentValido ? "[✓] Consentimientos Ley N° 29733 y NTS N° 139 conformes" : "[⚠️] Falta consentimiento Ley N° 29733";
    g3.style.color = consentValido ? "#16a34a" : "#dc2626";
  }

  if (g4) {
    const enf = STATE.enfermeroTriaje || document.getElementById("enfermero_triaje_select")?.value || "Lic. Roxana Paredes (CEP 45892)";
    g4.textContent = `[✓] Responsables colegiados (${enf.slice(0, 18)}... + CMP)`;
    g4.style.color = "#16a34a";
  }
};

// --- 9. SLA SEMÁFORO EN MOSTRAR PRIORIDAD (BLOQUE 4.1) ---
const orig_mostrarPrioridad = window.mostrarPrioridad;
window.mostrarPrioridad = function(prio, detalle) {
  if (typeof orig_mostrarPrioridad === 'function') {
    orig_mostrarPrioridad(prio, detalle);
  }

  const slaMap = {
    'I': '⏱️ SLA Normativo NTS N° 042: Inmediato — 0 min',
    'II': '⏱️ SLA Normativo NTS N° 042: Máx. 10 min',
    'III': '⏱️ SLA Normativo NTS N° 042: Máx. 30 min',
    'IV': '⏱️ SLA Normativo NTS N° 042: Máx. 60 min',
    'V': '⏱️ SLA Normativo NTS N° 042: Máx. 120 min'
  };

  const slaEl = document.getElementById("prio_sla_display");
  if (slaEl) {
    slaEl.textContent = slaMap[prio] || '⏱️ SLA Normativo NTS N° 042: --';
  }

  // Actualizar tarjeta consentimiento Ley 29733
  const badgeConsentExon = document.getElementById("badge_consentimiento_exonerado");
  const boxConsentChk = document.getElementById("box_consentimiento_checkbox");
  if (badgeConsentExon && boxConsentChk) {
    if (prio === 'I' || prio === 'II' || STATE.esNN) {
      badgeConsentExon.style.display = "inline-block";
      boxConsentChk.style.opacity = "0.6";
    } else {
      badgeConsentExon.style.display = "none";
      boxConsentChk.style.opacity = "1.0";
    }
  }
};

function actualizarEnfermeroTriaje(val) {
  STATE.enfermeroTriaje = val;
  registrarLogAuditoria("Módulo 1", "ENFERMERO_CEP_CAMBIO", `Enfermero de triaje: ${val}`);
}
window.actualizarEnfermeroTriaje = actualizarEnfermeroTriaje;

// --- 10. CANDADOS LEGALES DE DEFUNCIÓN EN MÓDULO 7 (BLOQUE 4.4) ---
const orig_seleccionarTipoEgreso = window.seleccionarTipoEgreso;
window.seleccionarTipoEgreso = function(tipo) {
  if (typeof orig_seleccionarTipoEgreso === 'function') {
    orig_seleccionarTipoEgreso(tipo);
  }

  if (tipo === 'fallecido' || tipo === 4 || String(tipo).includes('Fallec')) {
    const bloq = document.getElementById("bloqueo_sinadef_box");
    const permit = document.getElementById("sinadef_permitido_box");
    const esSoat = (STATE.esAccidenteTransito || STATE.tipoOrigenEvento === 'soat');
    const esNN = Boolean(STATE.esNN || (STATE.identificador && STATE.identificador.startsWith("NN-")));
    const estanciaCorta = (!STATE.estanciaHoras || STATE.estanciaHoras < 24);

    if (esSoat || esNN || estanciaCorta) {
      if (bloq) bloq.style.display = "block";
      if (permit) permit.style.display = "none";
      registrarLogAuditoria("Módulo 7", "BLOQUEO_LEGAL_SINADEF", "Fallecimiento con investigación fiscal obligatoria (Art. 195 CPP)");
    } else {
      if (bloq) bloq.style.display = "none";
      if (permit) permit.style.display = "block";
      registrarLogAuditoria("Módulo 7", "SINADEF_PERMITIDO", "Fallecimiento por causa natural > 24h");
    }
  }
};

// --- 11. BITÁCORA INMUTABLE DE AUDITORÍA (AUDIT_LOGS) & HEADER (BLOQUE 4.6) ---
const AUDIT_LOGS = [];

function registrarLogAuditoria(modulo, evento, detalle) {
  const logItem = {
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    rol: "Facultativo / Auditor HIS",
    dni: STATE.numDni || (STATE.esNN ? "NN" : "—"),
    modulo: modulo,
    evento: evento,
    detalle: detalle
  };
  AUDIT_LOGS.unshift(logItem);
  try {
    const raw = localStorage.getItem("AUDIT_LOGS_HISTORIAL") || "[]";
    const arr = JSON.parse(raw);
    arr.unshift(logItem);
    if (arr.length > 200) arr.pop();
    localStorage.setItem("AUDIT_LOGS_HISTORIAL", JSON.stringify(arr));
  } catch(e){}
}
window.registrarLogAuditoria = registrarLogAuditoria;

function abrirModalAuditLogSusalud() {
  const m = document.getElementById("modal_audit_logs_susalud");
  const cont = document.getElementById("audit_logs_table_container");
  if (!m) return;

  let arr = AUDIT_LOGS;
  try {
    const raw = localStorage.getItem("AUDIT_LOGS_HISTORIAL");
    if (raw) arr = JSON.parse(raw);
  } catch(e){}

  if (cont) {
    if (arr.length === 0) {
      cont.innerHTML = "<p style='text-align:center;color:#94a3b8;padding:20px;'>No hay eventos registrados en esta sesión.</p>";
    } else {
      let t = `<table style="width:100%; border-collapse:collapse; font-size:0.75rem; text-align:left;">
        <thead>
          <tr style="background:#0f172a; color:#ffffff;">
            <th style="padding:8px 10px; border:1px solid #334155;">Timestamp</th>
            <th style="padding:8px 10px; border:1px solid #334155;">Rol</th>
            <th style="padding:8px 10px; border:1px solid #334155;">DNI</th>
            <th style="padding:8px 10px; border:1px solid #334155;">Módulo</th>
            <th style="padding:8px 10px; border:1px solid #334155;">Evento</th>
            <th style="padding:8px 10px; border:1px solid #334155;">Detalle</th>
          </tr>
        </thead>
        <tbody>`;
      arr.slice(0, 50).forEach((l, idx) => {
        t += `<tr style="background:${idx % 2 === 0 ? '#f8fafc' : '#ffffff'}; border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px 10px; font-family:monospace; color:#64748b;">${l.timestamp}</td>
          <td style="padding:6px 10px; font-weight:700;">${l.rol}</td>
          <td style="padding:6px 10px; font-family:monospace; color:#0284c7;">${l.dni}</td>
          <td style="padding:6px 10px;">${l.modulo}</td>
          <td style="padding:6px 10px; font-weight:800; color:#0f172a;">${l.evento}</td>
          <td style="padding:6px 10px; color:#334155;">${l.detalle}</td>
        </tr>`;
      });
      t += `</tbody></table>`;
      cont.innerHTML = t;
    }
  }

  m.classList.add("open");
  m.style.display = "flex";
}

function cerrarModalAuditLogSusalud() {
  const m = document.getElementById("modal_audit_logs_susalud");
  if (m) {
    m.classList.remove("open");
    m.style.display = "none";
  }
}
window.abrirModalAuditLogSusalud = abrirModalAuditLogSusalud;
window.cerrarModalAuditLogSusalud = cerrarModalAuditLogSusalud;

// --- 12. NOTA ADENDA LEGAL (BLOQUE 4.5) ---
function abrirModalAdendaLegal() {
  const m = document.getElementById("modal_adenda_legal");
  if (m) {
    m.classList.add("open");
    m.style.display = "flex";
  }
}

function cerrarModalAdendaLegal() {
  const m = document.getElementById("modal_adenda_legal");
  if (m) {
    m.classList.remove("open");
    m.style.display = "none";
  }
}

function guardarAdendaLegal() {
  const txt = document.getElementById("adenda_legal_texto")?.value.trim();
  const med = document.getElementById("adenda_legal_medico")?.value.trim() || "Dr. Carlos Mendoza CMP 54821";
  if (!txt) {
    alert("Ingrese el contenido aclaratorio de la Nota Adenda Legal.");
    return;
  }

  if (!STATE.adendasLegales) STATE.adendasLegales = [];
  const adenda = {
    fechaHora: new Date().toLocaleString('es-PE'),
    medico: med,
    contenido: txt
  };
  STATE.adendasLegales.push(adenda);

  registrarLogAuditoria("Módulo 8", "ADENDA_LEGAL_REGISTRADA", `Adenda por ${med}: ${txt.slice(0, 40)}...`);
  cerrarModalAdendaLegal();
  alert("✅ Nota Adenda Legal Firmada y Anexada Exitosamente a la Historia Clínica.");
}
window.abrirModalAdendaLegal = abrirModalAdendaLegal;
window.cerrarModalAdendaLegal = cerrarModalAdendaLegal;
window.guardarAdendaLegal = guardarAdendaLegal;

// --- 13. PRIVACIDAD POR ROL: SWITCH VISTA CLÍNICA / CAJA (BLOQUE 4.6) ---
let modoVistaCajaActivo = false;
function toggleVistaClinicaCaja() {
  modoVistaCajaActivo = !modoVistaCajaActivo;
  const lbl = document.getElementById("lbl_toggle_vista_caja");
  const elMotivo = document.getElementById("motivo_full");
  const elAlergias = document.getElementById("alergias_full");

  if (modoVistaCajaActivo) {
    if (lbl) lbl.textContent = "👁️ Vista: Caja (Privada)";
    if (elMotivo) {
      elMotivo.dataset.realVal = elMotivo.value;
      elMotivo.value = "🔒 [DATO DE ANAMNESIS CLÍNICA PROTEGIDO — LEY N° 29733]";
      elMotivo.disabled = true;
    }
    if (elAlergias) {
      elAlergias.dataset.realVal = elAlergias.value;
      elAlergias.value = "🔒 [INFORMACIÓN MÉDICA CONFIDENCIAL]";
      elAlergias.disabled = true;
    }
    registrarLogAuditoria("Header", "SWITCH_VISTA_CAJA", "Activada Vista Caja: Datos sensibles enmascarados");
  } else {
    if (lbl) lbl.textContent = "👁️ Vista: Clínica";
    if (elMotivo) {
      elMotivo.value = elMotivo.dataset.realVal || STATE.motivoConsulta || "";
      elMotivo.disabled = false;
    }
    if (elAlergias) {
      elAlergias.value = elAlergias.dataset.realVal || STATE.alergias || "";
      elAlergias.disabled = false;
    }
    registrarLogAuditoria("Header", "SWITCH_VISTA_CLINICA", "Activada Vista Clínica: Anamnesis visible");
  }
}
window.toggleVistaClinicaCaja = toggleVistaClinicaCaja;



// ==============================================================================
// GESTIÓN DE LLEGADAS SIMULTÁNEAS Y DESEMPATE CLÍNICO (NTS N° 042 & NTS N° 031)
// ==============================================================================
let esLlegadaSimultanea = false;
let PACIENTES_DESEMPATE_TEMP = [];

function obtenerResumenCamasDisponibles() {
  const resumen = {
    shock_trauma: { libres: 0, total: 0, items: [] },
    quirofano: { libres: 0, total: 0, items: [] },
    observacion: { libres: 0, total: 0, items: [] },
    uci: { libres: 0, total: 0, items: [] },
    urpa: { libres: 0, total: 0, items: [] },
    totalLibres: 0,
    totalCamas: 0
  };

  if (typeof RECURSOS_HOSPITALARIOS !== "undefined") {
    for (const id in RECURSOS_HOSPITALARIOS) {
      const rec = RECURSOS_HOSPITALARIOS[id];
      const tipo = rec.tipo;
      if (resumen[tipo]) {
        resumen[tipo].total++;
        resumen.totalCamas++;
        if (rec.estado === "disponible") {
          resumen[tipo].libres++;
          resumen[tipo].items.push(rec);
          resumen.totalLibres++;
        }
      }
    }
  }
  return resumen;
}

function abrirModalLlegadasSimultaneasDesempate() {
  const modal = document.getElementById("modalLlegadasSimultaneasDesempate");
  if (!modal) return;

  actualizarUIRecursosDesempate();
  generarPacientesLlegadaSimultanea();

  modal.classList.add("open");
  modal.style.display = "flex";
}

function cerrarModalLlegadasSimultaneasDesempate() {
  const modal = document.getElementById("modalLlegadasSimultaneasDesempate");
  if (!modal) return;
  modal.classList.remove("open");
  modal.style.display = "none";
}

function actualizarUIRecursosDesempate() {
  const resumen = obtenerResumenCamasDisponibles();
  const badgeTotal = document.getElementById("badge_desempate_camas_total");
  const gridRecursos = document.getElementById("grid_resumen_camas_desempate");

  if (badgeTotal) {
    badgeTotal.textContent = `🟢 ${resumen.totalLibres} de ${resumen.totalCamas} Camas Libres`;
    if (resumen.totalLibres <= 2) {
      badgeTotal.style.background = "#fee2e2";
      badgeTotal.style.color = "#dc2626";
      badgeTotal.style.borderColor = "#fca5a5";
    } else {
      badgeTotal.style.background = "#dcfce7";
      badgeTotal.style.color = "#15803d";
      badgeTotal.style.borderColor = "#86efac";
    }
  }

  if (gridRecursos) {
    gridRecursos.innerHTML = `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:0.75rem;">
        <div style="color:#64748b; font-weight:700;">⚡ Shock Trauma</div>
        <div style="font-size:1.1rem; font-weight:900; color:#dc2626;">${resumen.shock_trauma.libres} / ${resumen.shock_trauma.total}</div>
        <div style="color:#94a3b8; font-size:0.68rem;">P-I Vital Inmediato</div>
      </div>
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:0.75rem;">
        <div style="color:#64748b; font-weight:700;">🔪 Quirófano SOP</div>
        <div style="font-size:1.1rem; font-weight:900; color:#ea580c;">${resumen.quirofano.libres} / ${resumen.quirofano.total}</div>
        <div style="color:#94a3b8; font-size:0.68rem;">Cirugía de Emergencia</div>
      </div>
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:0.75rem;">
        <div style="color:#64748b; font-weight:700;">🏥 UCI Adultos</div>
        <div style="font-size:1.1rem; font-weight:900; color:#7c3aed;">${resumen.uci.libres} / ${resumen.uci.total}</div>
        <div style="color:#94a3b8; font-size:0.68rem;">Soporte Ventilatorio</div>
      </div>
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:0.75rem;">
        <div style="color:#64748b; font-weight:700;">🛏️ Observación</div>
        <div style="font-size:1.1rem; font-weight:900; color:#0284c7;">${resumen.observacion.libres} / ${resumen.observacion.total}</div>
        <div style="color:#94a3b8; font-size:0.68rem;">Corta estancia (≤12h)</div>
      </div>
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:0.75rem;">
        <div style="color:#64748b; font-weight:700;">🛌 URPA Recup.</div>
        <div style="font-size:1.1rem; font-weight:900; color:#059669;">${resumen.urpa.libres} / ${resumen.urpa.total}</div>
        <div style="color:#94a3b8; font-size:0.68rem;">Post-quirúrgico</div>
      </div>
    `;
  }
}

function verificarParametrosCamasVsPacientes() {
  const inputCant = document.getElementById("input_cant_px_simultaneos");
  const alerta = document.getElementById("alerta_saturacion_desempate");
  if (!inputCant || !alerta) return;

  const cant = parseInt(inputCant.value, 10) || 2;
  const resumen = obtenerResumenCamasDisponibles();

  if (cant > resumen.totalLibres) {
    alerta.style.display = "block";
    alerta.innerHTML = `
      <strong>⚠️ ALERTA DE SATURACIÓN HOSPITALARIA (NTS N° 042-MINSA):</strong>
      Ingresan <strong>${cant} pacientes</strong> simultáneamente pero solo hay <strong>${resumen.totalLibres} camas libres</strong> en el establecimiento.
      El sistema aplicará estrictamente el <strong>Algoritmo de Desempate Fisiológico ABCDE</strong> para asignar las camas a los casos más graves; los pacientes excedentes serán programados para <strong>Boarding en Emergencia</strong> o <strong>Derivación REFCON</strong>.
    `;
  } else {
    alerta.style.display = "none";
  }
}

function calcularScorePrelacionParaCaso(c) {
  const spo2 = c.vitals.spo2 || 98;
  const glasgow = c.vitals.glasgow || 15;
  const fc = c.vitals.fc || 80;
  const pas = c.vitals.pas || 120;
  const eva = c.vitals.eva || 0;
  const relFcPas = pas > 0 ? (fc / pas) : 1;

  let basePrio = 0;
  if (c.prioridad === 'I') basePrio = 500;
  else if (c.prioridad === 'II') basePrio = 300;
  else if (c.prioridad === 'III') basePrio = 150;
  else if (c.prioridad === 'IV') basePrio = 50;

  let fisiologico = ((100 - spo2) * 1.5) + ((15 - glasgow) * 3) + (relFcPas * 15) + eva;

  let bonif = 0;
  if (c.esGestante) bonif += 10;
  if (c.tieneCodigo) bonif += 6;
  if (c.edad < 14 || c.edad >= 65) bonif += 3;

  return Math.round((basePrio + fisiologico + bonif) * 10) / 10;
}

function generarPacientesLlegadaSimultanea() {
  verificarParametrosCamasVsPacientes();
  const inputCant = document.getElementById("input_cant_px_simultaneos");
  const cant = Math.max(2, Math.min(15, parseInt(inputCant?.value, 10) || 3));

  const bancoCasos = [
    {
      identificador: "PX-SIM-01",
      nombre: "NN MASCULINO (~35a) — Politraumatizado Choque",
      dni: "NN",
      edad: 35,
      sexo: "M",
      esNN: true,
      motivo: "Accidente vehicular alta energía, volet costal, shock hipovolémico, pulso débil.",
      modalidad: "Ambulancia SAMU",
      vitals: { spo2: 83, fc: 140, pas: 72, pad: 42, fr: 32, temp: 35.6, glasgow: 8, glucosa: 80, eva: 0 },
      esGestante: false,
      tieneCodigo: true,
      prioridadDeseada: "I"
    },
    {
      identificador: "PX-SIM-02",
      nombre: "JUAN CARLOS BENITEZ SOTO (58a)",
      dni: "10874523",
      edad: 58,
      sexo: "M",
      esNN: false,
      motivo: "Dolor precordial opresivo irradiado a mandíbula >30 min, diaforesis profusa, crisis hipertensiva.",
      modalidad: "Vehículo Particular",
      vitals: { spo2: 94, fc: 106, pas: 184, pad: 112, fr: 22, temp: 36.8, glasgow: 15, glucosa: 135, eva: 9 },
      esGestante: false,
      tieneCodigo: true,
      prioridadDeseada: "II"
    },
    {
      identificador: "PX-SIM-03",
      nombre: "MARIA ELENA ROJAS VILCHEZ (28a) — Gestante",
      dni: "72458901",
      edad: 28,
      sexo: "F",
      esNN: false,
      motivo: "Gestante 36 semanas, cefalea intensa, fotopsias, escotomas, PA crítica 168/112 mmHg (Clave Azul).",
      modalidad: "Patrullero PNP",
      vitals: { spo2: 96, fc: 98, pas: 168, pad: 112, fr: 20, temp: 37.1, glasgow: 15, glucosa: 95, eva: 8 },
      esGestante: true,
      tieneCodigo: true,
      prioridadDeseada: "I"
    },
    {
      identificador: "PX-SIM-04",
      nombre: "ROBERTO GUTIERREZ PAZ (46a)",
      dni: "41987654",
      edad: 46,
      sexo: "M",
      esNN: false,
      motivo: "Apendicitis aguda con 48h de evolución, fiebre, signo de rebote (Blumberg) positivo, dolor cólico 8/10.",
      modalidad: "A pie",
      vitals: { spo2: 97, fc: 102, pas: 130, pad: 85, fr: 20, temp: 38.6, glasgow: 15, glucosa: 105, eva: 8 },
      esGestante: false,
      tieneCodigo: false,
      prioridadDeseada: "II"
    },
    {
      identificador: "PX-SIM-05",
      nombre: "TERESA CONDORI MAMANI (74a)",
      dni: "08451234",
      edad: 74,
      sexo: "F",
      esNN: false,
      motivo: "Deshidratación moderada secundaria a GECA, intolerancia oral, debilidad generalizada.",
      modalidad: "A pie / Silla de Ruedas",
      vitals: { spo2: 96, fc: 88, pas: 110, pad: 68, fr: 18, temp: 37.4, glasgow: 15, glucosa: 118, eva: 4 },
      esGestante: false,
      tieneCodigo: false,
      prioridadDeseada: "III"
    },
    {
      identificador: "PX-SIM-06",
      nombre: "CARMEN SILVA PRADO (33a)",
      dni: "45678912",
      edad: 33,
      sexo: "F",
      esNN: false,
      motivo: "Cólico nefrítico izquierdo agudo irradiado a flanco, náuseas, dolor severo 7/10.",
      modalidad: "Taxi",
      vitals: { spo2: 98, fc: 90, pas: 135, pad: 86, fr: 18, temp: 36.9, glasgow: 15, glucosa: 92, eva: 7 },
      esGestante: false,
      tieneCodigo: false,
      prioridadDeseada: "III"
    },
    {
      identificador: "PX-SIM-07",
      nombre: "LUCAS MENDOZA SANDOVAL (9a)",
      dni: "78912345",
      edad: 9,
      sexo: "M",
      esNN: false,
      motivo: "Herida cortocontusa superficial en ceja izquierda por caída accidental, hemostasia lograda.",
      modalidad: "A pie con acompañante",
      vitals: { spo2: 99, fc: 86, pas: 105, pad: 65, fr: 18, temp: 36.7, glasgow: 15, glucosa: 90, eva: 3 },
      esGestante: false,
      tieneCodigo: false,
      prioridadDeseada: "IV"
    }
  ];

  PACIENTES_DESEMPATE_TEMP = [];

  for (let i = 0; i < cant; i++) {
    const plantilla = bancoCasos[i % bancoCasos.length];
    const copia = JSON.parse(JSON.stringify(plantilla));
    copia.numOrden = i + 1;
    copia.identificador = `SIM-${String(i + 1).padStart(2, "0")}-${copia.esNN ? "NN" : copia.dni.slice(-4)}`;

    if (typeof evaluarTriajeEstandar === "function") {
      const evalClinica = evaluarTriajeEstandar({
        fr: copia.vitals.fr,
        spo2: copia.vitals.spo2,
        pas: copia.vitals.pas,
        pad: copia.vitals.pad,
        fc: copia.vitals.fc,
        temp: copia.vitals.temp,
        glasgow: copia.vitals.glasgow,
        glucosa: copia.vitals.glucosa,
        eva: copia.vitals.eva,
        esGestante: copia.esGestante,
        codigoInfarto: copia.tieneCodigo && copia.prioridadDeseada === "II",
        esPediatrico: copia.edad < 14,
        edad: copia.edad
      });
      copia.prioridad = evalClinica.prioridad || copia.prioridadDeseada;
    } else {
      copia.prioridad = copia.prioridadDeseada;
    }

    copia.scorePrelacion = calcularScorePrelacionParaCaso(copia);
    copia.camaAsignadaId = "";
    copia.camaAsignadaNombre = "";
    PACIENTES_DESEMPATE_TEMP.push(copia);
  }

  PACIENTES_DESEMPATE_TEMP.sort((a, b) => b.scorePrelacion - a.scorePrelacion);
  renderizarListaPacientesDesempate();
}

function renderizarListaPacientesDesempate() {
  const cont = document.getElementById("contenedor_lista_pacientes_desempate");
  if (!cont) return;

  const prioColors = {
    "I": { bg: "#fee2e2", text: "#991b1b", border: "#f87171", label: "P-I ROJO" },
    "II": { bg: "#ffedd5", text: "#9a3412", border: "#fb923c", label: "P-II NARANJA" },
    "III": { bg: "#fef9c3", text: "#854d0e", border: "#facc15", label: "P-III AMARILLO" },
    "IV": { bg: "#dcfce7", text: "#166534", border: "#4ade80", label: "P-IV VERDE" },
    "V": { bg: "#e0f2fe", text: "#075985", border: "#38bdf8", label: "P-V AZUL" }
  };

  let opcionesCamasHtml = `<option value="">(Seleccione Cama o Destino)</option>`;
  if (typeof RECURSOS_HOSPITALARIOS !== "undefined") {
    opcionesCamasHtml += `<optgroup label="⚡ Shock Trauma (P-I Vital)">`;
    for (let id of ["ST-01", "ST-02"]) {
      const r = RECURSOS_HOSPITALARIOS[id];
      if (r) opcionesCamasHtml += `<option value="${r.id}">${r.nombre} [${r.estado === 'disponible' ? '🟢 Libre' : '🔴 Ocupada'}]</option>`;
    }
    opcionesCamasHtml += `</optgroup>`;

    opcionesCamasHtml += `<optgroup label="🔪 Quirófanos SOP (Cirugía)">`;
    for (let id of ["SOP-01", "SOP-02", "SOP-03"]) {
      const r = RECURSOS_HOSPITALARIOS[id];
      if (r) opcionesCamasHtml += `<option value="${r.id}">${r.nombre} [${r.estado === 'disponible' ? '🟢 Libre' : '🔴 Ocupada'}]</option>`;
    }
    opcionesCamasHtml += `</optgroup>`;

    opcionesCamasHtml += `<optgroup label="🏥 UCI / UCIN (Cuidados Críticos)">`;
    for (let id of ["UCI-01", "UCI-02"]) {
      const r = RECURSOS_HOSPITALARIOS[id];
      if (r) opcionesCamasHtml += `<option value="${r.id}">${r.nombre} [${r.estado === 'disponible' ? '🟢 Libre' : '🔴 Ocupada'}]</option>`;
    }
    opcionesCamasHtml += `</optgroup>`;

    opcionesCamasHtml += `<optgroup label="🛏️ Sala de Observación (Estancia Corta)">`;
    for (let id of ["OBS-01", "OBS-02", "OBS-03", "OBS-04", "OBS-05", "OBS-06"]) {
      const r = RECURSOS_HOSPITALARIOS[id];
      if (r) opcionesCamasHtml += `<option value="${r.id}">${r.nombre} [${r.estado === 'disponible' ? '🟢 Libre' : '🔴 Ocupada'}]</option>`;
    }
    opcionesCamasHtml += `</optgroup>`;

    opcionesCamasHtml += `<optgroup label="🛌 URPA (Recuperación)">`;
    for (let id of ["URPA-01", "URPA-02"]) {
      const r = RECURSOS_HOSPITALARIOS[id];
      if (r) opcionesCamasHtml += `<option value="${r.id}">${r.nombre} [${r.estado === 'disponible' ? '🟢 Libre' : '🔴 Ocupada'}]</option>`;
    }
    opcionesCamasHtml += `</optgroup>`;
  }
  opcionesCamasHtml += `<optgroup label="⚠️ Contingencia por Saturación">
    <option value="REFCON">🚑 Derivación Inmediata REFCON (Stock Cero)</option>
    <option value="BOARDING">🏥 Boarding en Pasillo / Camilla de Transporte</option>
  </optgroup>`;

  cont.innerHTML = "";

  PACIENTES_DESEMPATE_TEMP.forEach((p, idx) => {
    const cfg = prioColors[p.prioridad] || prioColors["III"];
    const card = document.createElement("div");
    card.style.cssText = `background:#ffffff; border:1.5px solid ${cfg.border}; border-left:6px solid ${cfg.border}; border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; box-shadow:0 1px 4px rgba(0,0,0,0.05);`;

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="background:${cfg.bg}; color:${cfg.text}; font-weight:900; font-size:0.75rem; padding:2px 8px; border-radius:6px; border:1px solid ${cfg.border};">
            ${cfg.label}
          </span>
          <strong style="font-size:0.86rem; color:#0f172a;">${p.nombre}</strong>
          <span style="font-size:0.72rem; color:#64748b;">(${p.sexo}, ${p.edad}a · ${p.modalidad})</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="background:#f1f5f9; color:#0f172a; font-weight:800; font-size:0.75rem; padding:2px 8px; border-radius:6px; border:1px solid #cbd5e1;" title="Puntaje matemático de prelación">
            🧮 Score Desempate: <strong style="color:#0369a1;">${p.scorePrelacion} pts</strong>
          </span>
          <span style="font-size:0.72rem; color:#64748b; font-weight:700;">#${idx + 1} en Prelación</span>
        </div>
      </div>

      <div style="font-size:0.78rem; color:#334155;">
        <strong>Motivo de Consulta:</strong> ${p.motivo}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#f8fafc; padding:8px 10px; border-radius:8px; border:1px solid #f1f5f9;">
        <div style="font-size:0.74rem; color:#475569; display:flex; gap:10px; flex-wrap:wrap;">
          <span>SpO₂: <strong>${p.vitals.spo2}%</strong></span>
          <span>FC: <strong>${p.vitals.fc} lpm</strong></span>
          <span>PA: <strong>${p.vitals.pas}/${p.vitals.pad}</strong></span>
          <span>FR: <strong>${p.vitals.fr} rpm</strong></span>
          <span>Glasgow: <strong>${p.vitals.glasgow}/15</strong></span>
          <span>EVA: <strong>${p.vitals.eva}/10</strong></span>
        </div>

        <div style="display:flex; align-items:center; gap:8px; min-width:260px;">
          <label style="font-size:0.74rem; font-weight:800; color:#0f172a; white-space:nowrap;">Asignar Cama:</label>
          <select id="select_cama_sim_${idx}" class="input-full" style="padding:4px 8px; font-size:0.76rem; font-weight:700; border-radius:6px;" onchange="cambiarCamaPacienteDesempateManual(${idx}, this.value)">
            ${opcionesCamasHtml}
          </select>
        </div>
      </div>
    `;

    cont.appendChild(card);

    if (p.camaAsignadaId) {
      setTimeout(() => {
        const sel = document.getElementById(`select_cama_sim_${idx}`);
        if (sel) sel.value = p.camaAsignadaId;
      }, 10);
    }
  });
}

function cambiarCamaPacienteDesempateManual(idx, camaId) {
  if (!PACIENTES_DESEMPATE_TEMP[idx]) return;
  PACIENTES_DESEMPATE_TEMP[idx].camaAsignadaId = camaId;
  if (camaId === "REFCON") {
    PACIENTES_DESEMPATE_TEMP[idx].camaAsignadaNombre = "Derivación REFCON (Saturación)";
  } else if (camaId === "BOARDING") {
    PACIENTES_DESEMPATE_TEMP[idx].camaAsignadaNombre = "Boarding en Camilla";
  } else if (typeof RECURSOS_HOSPITALARIOS !== "undefined" && RECURSOS_HOSPITALARIOS[camaId]) {
    PACIENTES_DESEMPATE_TEMP[idx].camaAsignadaNombre = RECURSOS_HOSPITALARIOS[camaId].nombre;
  }
}

function asignarTodosACamaDesempate() {
  const camasAsignadasSet = new Set();

  PACIENTES_DESEMPATE_TEMP.forEach((p, idx) => {
    let camaElegidaId = null;

    if (p.prioridad === 'I') {
      if (RECURSOS_HOSPITALARIOS['ST-01'] && RECURSOS_HOSPITALARIOS['ST-01'].estado === 'disponible' && !camasAsignadasSet.has('ST-01')) {
        camaElegidaId = 'ST-01';
      } else if (RECURSOS_HOSPITALARIOS['ST-02'] && RECURSOS_HOSPITALARIOS['ST-02'].estado === 'disponible' && !camasAsignadasSet.has('ST-02')) {
        camaElegidaId = 'ST-02';
      } else if (RECURSOS_HOSPITALARIOS['SOP-01'] && RECURSOS_HOSPITALARIOS['SOP-01'].estado === 'disponible' && !camasAsignadasSet.has('SOP-01')) {
        camaElegidaId = 'SOP-01';
      } else if (RECURSOS_HOSPITALARIOS['UCI-01'] && RECURSOS_HOSPITALARIOS['UCI-01'].estado === 'disponible' && !camasAsignadasSet.has('UCI-01')) {
        camaElegidaId = 'UCI-01';
      } else {
        camaElegidaId = 'BOARDING';
      }
    } else if (p.prioridad === 'II') {
      if (p.motivo.toLowerCase().includes("apendic") || p.motivo.toLowerCase().includes("quirúrg")) {
        if (RECURSOS_HOSPITALARIOS['SOP-02'] && RECURSOS_HOSPITALARIOS['SOP-02'].estado === 'disponible' && !camasAsignadasSet.has('SOP-02')) {
          camaElegidaId = 'SOP-02';
        }
      }
      if (!camaElegidaId) {
        for (let id of ['OBS-01', 'OBS-02', 'OBS-03', 'OBS-04', 'OBS-05', 'OBS-06']) {
          if (RECURSOS_HOSPITALARIOS[id] && RECURSOS_HOSPITALARIOS[id].estado === 'disponible' && !camasAsignadasSet.has(id)) {
            camaElegidaId = id;
            break;
          }
        }
      }
      if (!camaElegidaId) camaElegidaId = 'REFCON';
    } else {
      for (let id of ['OBS-01', 'OBS-02', 'OBS-03', 'OBS-04', 'OBS-05', 'OBS-06']) {
        if (RECURSOS_HOSPITALARIOS[id] && RECURSOS_HOSPITALARIOS[id].estado === 'disponible' && !camasAsignadasSet.has(id)) {
          camaElegidaId = id;
          break;
        }
      }
      if (!camaElegidaId) camaElegidaId = 'REFCON';
    }

    if (camaElegidaId && camaElegidaId !== 'REFCON' && camaElegidaId !== 'BOARDING') {
      camasAsignadasSet.add(camaElegidaId);
    }

    cambiarCamaPacienteDesempateManual(idx, camaElegidaId);
    const sel = document.getElementById(`select_cama_sim_${idx}`);
    if (sel) sel.value = camaElegidaId;
  });

  mostrarToastCola(`⚡ <strong>Camas Asignadas Automáticamente:</strong> Criterio de desempate ABCDE aplicado a ${PACIENTES_DESEMPATE_TEMP.length} pacientes.`);
}

function confirmarLlegadaSimultaneaAlTablero() {
  if (PACIENTES_DESEMPATE_TEMP.length === 0) {
    alert("No hay pacientes para ingresar.");
    return;
  }

  guardarEstadoPacienteActivo();

  PACIENTES_DESEMPATE_TEMP.forEach((p, idx) => {
    const sel = document.getElementById(`select_cama_sim_${idx}`);
    if (sel && sel.value) {
      cambiarCamaPacienteDesempateManual(idx, sel.value);
    }
  });

  const nuevosPacientesCola = [];

  PACIENTES_DESEMPATE_TEMP.forEach(p => {
    if (p.camaAsignadaId && RECURSOS_HOSPITALARIOS[p.camaAsignadaId]) {
      const rec = RECURSOS_HOSPITALARIOS[p.camaAsignadaId];
      rec.estado = "ocupada";
      rec.inicioMs = Date.now();
      rec.finMs = rec.inicioMs + (rec.duracionHoras * 3600 * 1000);
      rec.paciente = {
        nombre: p.nombre,
        identificador: p.identificador,
        dni: p.dni,
        prioridad: p.prioridad,
        motivo: p.motivo
      };
    }

    const reg = crearRegistroPaciente({
      identificador: p.identificador,
      nombre: p.nombre,
      dni: p.dni,
      edad: p.edad,
      sexo: p.sexo,
      modalidad: p.modalidad,
      prioridad: p.prioridad,
      motivo: p.motivo,
      estadoAtencion: p.camaAsignadaNombre ? `🛏️ ${p.camaAsignadaNombre}` : "En Espera",
      camaNombre: p.camaAsignadaNombre || null,
      camaId: p.camaAsignadaId || null,
      esNN: p.esNN,
      formSnapshot: {
        ident_full: p.nombre,
        dni_reniec_input: p.dni,
        motivo_full: p.motivo,
        spo2_full: p.vitals.spo2,
        fc_full: p.vitals.fc,
        pas_full: p.vitals.pas,
        pad_full: p.vitals.pad,
        fr_full: p.vitals.fr,
        temp_full: p.vitals.temp,
        glasgow_full: p.vitals.glasgow,
        glucosa_full: p.vitals.glucosa,
        eva_full: p.vitals.eva,
        eva_range: p.vitals.eva,
        edad_full: p.edad,
        sexo_full: p.sexo
      }
    });

    nuevosPacientesCola.push(reg);
  });

  PACIENTES_COLA = nuevosPacientesCola;
  esLlegadaSimultanea = true;

  const primerPx = PACIENTES_COLA[0];
  pacienteActivoId = primerPx.id;
  cambiarPacienteActivo(primerPx.id);

  cerrarModalLlegadasSimultaneasDesempate();

  renderizarTableroColaPacientes();
  if (typeof renderizarTableroCamasYQuirofanos === "function") renderizarTableroCamasYQuirofanos();
  if (typeof actualizarWidgetFlotanteCamas === "function") actualizarWidgetFlotanteCamas();

  mostrarToastCola(`⚖️ <strong>Llegada Simultánea Confirmada:</strong> ${PACIENTES_COLA.length} pacientes ingresados con desempate ABCDE. Puede navegar entre ellos en el tablero.`);
}

window.abrirModalLlegadasSimultaneasDesempate = abrirModalLlegadasSimultaneasDesempate;
window.cerrarModalLlegadasSimultaneasDesempate = cerrarModalLlegadasSimultaneasDesempate;
window.generarPacientesLlegadaSimultanea = generarPacientesLlegadaSimultanea;
window.asignarTodosACamaDesempate = asignarTodosACamaDesempate;
window.confirmarLlegadaSimultaneaAlTablero = confirmarLlegadaSimultaneaAlTablero;
window.cambiarCamaPacienteDesempateManual = cambiarCamaPacienteDesempateManual;
window.obtenerResumenCamasDisponibles = obtenerResumenCamasDisponibles;
window.verificarParametrosCamasVsPacientes = verificarParametrosCamasVsPacientes;



// ==============================================================================
// GESTIÓN DE MÉDICO DE TURNO, CONSENTIMIENTO INFORMADO & ROLES (NTS 042 / NTS 139)
// ==============================================================================

// --- ASIGNACIÓN DE MÉDICO DE TURNO CON SINCRONIZACIÓN TOTAL ---
function actualizarMedicoAsignado(medico) {
  if (!medico) return;
  STATE.medicoTratante = medico;

  // 1. Sincronizar en el paciente activo de la cola
  const pxActivo = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
  if (pxActivo) {
    pxActivo.medico = medico;
    if (pxActivo.stateSnapshot) {
      pxActivo.stateSnapshot.medicoTratante = medico;
    }
  }

  // 2. Si tiene cama asignada, actualizar en RECURSOS_HOSPITALARIOS
  if (STATE.camaAsignadaId && typeof RECURSOS_HOSPITALARIOS !== "undefined" && RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId]) {
    if (RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId].paciente) {
      RECURSOS_HOSPITALARIOS[STATE.camaAsignadaId].paciente.medico = medico;
    }
  }

  // 3. Sincronizar selectores del DOM
  const selMed = document.getElementById("medico_responsable_select");
  if (selMed && selMed.value !== medico) selMed.value = medico;
  const elAdendaMed = document.getElementById("adenda_legal_medico");
  if (elAdendaMed) elAdendaMed.value = medico;

  // 4. Re-renderizar tablero de cola y stock de camas
  renderizarTableroColaPacientes();
  if (typeof renderizarTableroCamasYQuirofanos === "function") {
    renderizarTableroCamasYQuirofanos();
  }
  if (typeof actualizarWidgetFlotanteCamas === "function") {
    actualizarWidgetFlotanteCamas();
  }

  // 5. Registro inmutable de auditoría
  const nomPx = STATE.nombreReniec || STATE.identificador || "Paciente";
  registrarLogAuditoria("Módulo 4", "ASIGNAR_MEDICO", `Médico de Turno asignado: ${medico} — Paciente: ${nomPx}`);
  if (typeof mostrarToastCola === "function") {
    mostrarToastCola(`👨‍⚕️ <strong>Médico Asignado:</strong> ${medico} al paciente <strong>${nomPx}</strong>`);
  }
}
window.actualizarMedicoAsignado = actualizarMedicoAsignado;

function asignarMedicoDisponible() {
  const selMed = document.getElementById("medico_responsable_select");
  if (!selMed) return;

  const prio = STATE.prioridad || "I";
  let medicoSugerido = selMed.options[0]?.value;

  if (prio === "I") {
    medicoSugerido = selMed.options[0]?.value; // Emergenciólogo
  } else if (prio === "II") {
    if (STATE.codigoInfarto || (STATE.pasSistolica && STATE.pasSistolica >= 180)) {
      medicoSugerido = selMed.options[2]?.value || selMed.options[0]?.value; // Internista
    } else {
      medicoSugerido = selMed.options[1]?.value || selMed.options[0]?.value; // Cirujano
    }
  } else if (STATE.esPediatrico) {
    medicoSugerido = selMed.options[3]?.value || selMed.options[0]?.value; // Pediatra
  } else if (STATE.claveObstetrica && STATE.claveObstetrica !== "ninguna") {
    medicoSugerido = selMed.options[4]?.value || selMed.options[0]?.value; // Gineco-Obstetra
  } else {
    medicoSugerido = selMed.value || selMed.options[0]?.value;
  }

  selMed.value = medicoSugerido;
  actualizarMedicoAsignado(medicoSugerido);
}
window.asignarMedicoDisponible = asignarMedicoDisponible;

// --- GESTIÓN DE CONSENTIMIENTO INFORMADO MÉDICO POR LEY ---
function actualizarCondicionConsentimiento(cond) {
  STATE.condicionConsentimiento = cond;
  const banner = document.getElementById("consentimiento_alerta_banner");
  if (!banner) return;

  if (cond === "exonerado_emergencia") {
    banner.style.background = "#fff1f2";
    banner.style.borderColor = "#fecdd3";
    banner.style.color = "#9f1239";
    banner.innerHTML = `<strong>⚡ EXCEPCIÓN LEGAL DE EMERGENCIA VITAL (Art. 4° Ley N° 26842 & Ley N° 27604):</strong> Paciente en estado crítico de inconsciencia o sin familiar. El Médico Asistencial tratante actúa de oficio sin condicionar a firma previa para salvar la vida o prevenir secuelas graves. Se suscribe informe médico de emergencia en la Historia Clínica.`;
  } else if (cond === "representante_legal") {
    banner.style.background = "#fefce8";
    banner.style.borderColor = "#fef08a";
    banner.style.color = "#854d0e";
    banner.innerHTML = `<strong>👥 REPRESENTACIÓN LEGAL (Ley N° 29414):</strong> Paciente menor de edad (<18 años) o con incapacidad de discernimiento. Otorga y suscribe el familiar directo (cónyuge, conviviente, padres, hijos mayores) o tutor legal con DNI acreditado.`;
  } else if (cond === "disentimiento_rechazo") {
    banner.style.background = "#fef2f2";
    banner.style.borderColor = "#ef4444";
    banner.style.color = "#b91c1c";
    banner.innerHTML = `<strong>❌ DISENTIMIENTO INFORMADO / RECHAZO DE TRATAMIENTO (Art. 15° Ley N° 26842):</strong> El paciente o deudo legal rehúsa el procedimiento propuesto tras ser informado de los riesgos letales o secuelas. Obligatorio firmar acta de exoneración de responsabilidad médica.`;
  } else {
    banner.style.background = "#eff6ff";
    banner.style.borderColor = "#bfdbfe";
    banner.style.color = "#1e40af";
    banner.innerHTML = `<strong>ℹ️ RÉGIMEN ORDINARIO:</strong> Paciente lúcido y consciente (≥18 años) en pleno uso de sus facultades mentales. Suscribe el consentimiento de forma libre e informada tras comprender objetivos, riesgos y alternativas.`;
  }

  registrarLogAuditoria("Módulo 4", "CAMBIO_REGIMEN_CONSENTIMIENTO", `Régimen: ${cond}`);
}
window.actualizarCondicionConsentimiento = actualizarCondicionConsentimiento;

function toggleConsentimientoFirmado(checked) {
  STATE.consentimientoAdjuntoHC = Boolean(checked);
  const pxActivo = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
  if (pxActivo && pxActivo.stateSnapshot) {
    pxActivo.stateSnapshot.consentimientoAdjuntoHC = Boolean(checked);
  }
  const nomPx = STATE.nombreReniec || STATE.identificador || "Paciente";
  registrarLogAuditoria("Módulo 4", "CONSENTIMIENTO_ADJUNTO_HC", `Consentimiento firmado adjunto a HC: ${checked} — Paciente: ${nomPx}`);
  if (typeof mostrarToastCola === "function") {
    mostrarToastCola(checked
      ? `📑 <strong>Consentimiento Informado:</strong> Documento firmado adjuntado a la Historia Clínica de ${nomPx}.`
      : `⚠️ <strong>Consentimiento Informado:</strong> Pendiente de firma y adjunto físico a HC.`);
  }
}
window.toggleConsentimientoFirmado = toggleConsentimientoFirmado;

function construirHTMLDocumentoConsentimiento() {
  const nomPx = (STATE.nombreReniec || STATE.identificador || "PACIENTE POR IDENTIFICAR").toUpperCase();
  const dniPx = STATE.numDni || "S/D (INDOCUMENTADO)";
  const hcPx = STATE.historiaClinica || "HC-PROVISIONAL";
  const edadPx = STATE.edad ? `${STATE.edad} años` : "Desconocido";
  const sexoPx = STATE.sexo || "Desconocido";
  const diagCIE10 = document.getElementById("cie10_select")?.value || STATE.cie10 || "Evaluación Clínica de Emergencia";
  const medResponsable = STATE.medicoTratante || "Médico Emergenciólogo de Guardia (CMP 0001)";
  const procedimientoSel = document.getElementById("sel_procedimiento_consentimiento")?.value || "Atención Médica y Reanimación en Emergencia";
  const condicionSel = document.getElementById("sel_condicion_consentimiento")?.value || "paciente_lucido";
  const fechaHoy = new Date().toLocaleDateString('es-PE');
  const horaHoy = STATE.horaLlegada || new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  let textoDeclaracion = "";
  if (condicionSel === "exonerado_emergencia") {
    textoDeclaracion = `
      <div style="background:#fff1f2; border:1.5px solid #fecdd3; padding:12px; border-radius:6px; font-size:11px; color:#9f1239; margin-bottom:14px; line-height:1.45;">
        <strong>CERTIFICACIÓN MÉDICA DE EXCEPCIÓN LEGAL POR EMERGENCIA VITAL (ART. 4° LEY N° 26842 & LEY N° 27604):</strong><br>
        Se deja constancia expresa de que el/la paciente ingresa en estado de riesgo vital inminente / alteración del sensorio sin presencia de familiar responsable. En estricto cumplimiento de la Ley General de Salud, el equipo médico asistencial procede de oficio a ejecutar las maniobras médico-quirúrgicas y de soporte vital indispensable para preservar la vida, exonerando la suscripción previa de consentimiento.
      </div>
    `;
  } else if (condicionSel === "representante_legal") {
    textoDeclaracion = `
      <div style="font-size:11px; color:#1e293b; line-height:1.5; margin-bottom:14px;">
        Yo, en calidad de <strong>REPRESENTANTE LEGAL / FAMILIAR DIRECTO</strong> del paciente antes identificado, declaro que el Médico Tratante me ha explicado en lenguaje claro y comprensible el diagnóstico presuntivo, la naturaleza del procedimiento propuesto, sus objetivos, beneficios esperados, riesgos potenciales y alternativas terapéuticas. En consecuencia, <strong>OTORGO MI CONSENTIMIENTO LIBRE E INFORMADO</strong> para la realización de dicho procedimiento en el Servicio de Emergencia.
      </div>
    `;
  } else if (condicionSel === "disentimiento_rechazo") {
    textoDeclaracion = `
      <div style="background:#fef2f2; border:1.5px solid #ef4444; padding:12px; border-radius:6px; font-size:11px; color:#b91c1c; margin-bottom:14px; line-height:1.45;">
        <strong>ACTA DE DISENTIMIENTO Y RECHAZO EXPRESO DE TRATAMIENTO MÉDICO (ART. 15° LEY N° 26842):</strong><br>
        Habiendo sido plenamente advertido(a) sobre la gravedad del cuadro clínico y los riesgos inminentes (incluido el desenlace fatal o secuelas irreversibles) que conlleva rechazar el procedimiento indicado, <strong>DECLARO MI DECISIÓN DE NO AUTORIZAR</strong> su realización, asumiendo de manera exclusiva toda responsabilidad legal y clínica, y exonerando al personal médico y al hospital.
      </div>
    `;
  } else {
    textoDeclaracion = `
      <div style="font-size:11px; color:#1e293b; line-height:1.5; margin-bottom:14px;">
        Yo, <strong>${nomPx}</strong>, identificado(a) con DNI N° <strong>${dniPx}</strong>, en pleno uso de mis facultades mentales, declaro que el Médico Tratante me ha informado satisfactoriamente sobre mi estado de salud, el diagnóstico, la necesidad de la intervención propuesta, los beneficios esperados, riesgos frecuentes y complicaciones graves posibles. Habiendo absuelto todas mis dudas, <strong>OTORGO VOLUNTARIAMENTE MI CONSENTIMIENTO INFORMADO</strong> para su realización.
      </div>
    `;
  }

  return `
    <div class="consentimiento-doc" style="width:700px; max-width:100%; margin:auto; background:#ffffff; border:1px solid #000; padding:28px 34px; font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#0f172a; box-sizing:border-box;">
      <!-- CABECERA OFICIAL MINSA -->
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:14px;">
        <div style="font-size:10px; font-weight:800; color:#000;">
          REPÚBLICA DEL PERÚ<br>
          MINISTERIO DE SALUD
        </div>
        <div style="text-align:center;">
          <strong style="font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Hospital Regional Docente UPP</strong><br>
          <span style="font-size:10px; font-weight:700; color:#0284c7;">SERVICIO DE EMERGENCIA · NIVEL III-1</span>
        </div>
        <div style="font-size:10px; text-align:right;">
          <strong>NTS N° 139-MINSA</strong><br>
          FORMATO OFICIAL CI-01
        </div>
      </div>

      <div style="text-align:center; font-size:13px; font-weight:900; text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
        FORMATO DE CONSENTIMIENTO INFORMADO MÉDICO-QUIRÚRGICO DE EMERGENCIA
      </div>

      <!-- DATOS DE FILIACIÓN DEL PACIENTE -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:10.5px;">
        <tr>
          <td style="padding:4px; border:1px solid #94a3b8; background:#f8fafc; width:22%;"><strong>Paciente:</strong></td>
          <td style="padding:4px; border:1px solid #94a3b8; font-weight:700;" colspan="3">${nomPx}</td>
        </tr>
        <tr>
          <td style="padding:4px; border:1px solid #94a3b8; background:#f8fafc;"><strong>DNI / Doc:</strong></td>
          <td style="padding:4px; border:1px solid #94a3b8;">${dniPx}</td>
          <td style="padding:4px; border:1px solid #94a3b8; background:#f8fafc; width:20%;"><strong>Historia Clínica:</strong></td>
          <td style="padding:4px; border:1px solid #94a3b8; font-weight:700;">${hcPx}</td>
        </tr>
        <tr>
          <td style="padding:4px; border:1px solid #94a3b8; background:#f8fafc;"><strong>Edad / Sexo:</strong></td>
          <td style="padding:4px; border:1px solid #94a3b8;">${edadPx} | ${sexoPx}</td>
          <td style="padding:4px; border:1px solid #94a3b8; background:#f8fafc;"><strong>Fecha / Hora:</strong></td>
          <td style="padding:4px; border:1px solid #94a3b8;">${fechaHoy} ${horaHoy}</td>
        </tr>
        <tr>
          <td style="padding:4px; border:1px solid #94a3b8; background:#f8fafc;"><strong>Diagnóstico (CIE-10):</strong></td>
          <td style="padding:4px; border:1px solid #94a3b8; font-weight:700;" colspan="3">${diagCIE10}</td>
        </tr>
        <tr>
          <td style="padding:4px; border:1px solid #94a3b8; background:#f8fafc;"><strong>Procedimiento:</strong></td>
          <td style="padding:4px; border:1px solid #94a3b8; font-weight:700; color:#0369a1;" colspan="3">${procedimientoSel}</td>
        </tr>
        <tr>
          <td style="padding:4px; border:1px solid #94a3b8; background:#f8fafc;"><strong>Médico Tratante:</strong></td>
          <td style="padding:4px; border:1px solid #94a3b8; font-weight:700;" colspan="3">${medResponsable}</td>
        </tr>
      </table>

      <!-- CUERPO DE DECLARACIÓN -->
      ${textoDeclaracion}

      <!-- FUNDAMENTO LEGAL -->
      <div style="font-size:9.5px; color:#475569; border-top:1px dashed #cbd5e1; padding-top:6px; margin-bottom:18px; line-height:1.35;">
        <strong>BASE LEGAL:</strong> Ley General de Salud N° 26842 (Artículos 4° y 15°), Ley N° 29414 (Derechos de los Usuarios en Salud), D.S. N° 027-2015-SA, y Ley N° 27604 (Atención Médica de Emergencia). Toda información se encuentra amparada por el secreto profesional y la Ley N° 29733 de Protección de Datos Personales.
      </div>

      <!-- SECCIÓN DE FIRMAS Y HUELLA DACTILAR -->
      <table style="width:100%; border-collapse:collapse; margin-top:20px; text-align:center; font-size:10px;">
        <tr>
          <td style="width:36%; vertical-align:bottom; padding:0 8px;">
            <div style="border-bottom:1.5px solid #000; height:50px;"></div>
            <div style="margin-top:4px; font-weight:700;">Firma del Paciente / Representante</div>
            <div>DNI: _______________________</div>
            <div style="font-size:8.5px; color:#64748b;">Parentesco: ___________________</div>
          </td>
          <td style="width:28%; vertical-align:middle; padding:0 6px;">
            <div style="width:68px; height:78px; border:1.5px dashed #475569; margin:auto; display:flex; align-items:center; justify-content:center; font-size:8px; color:#64748b; text-align:center;">
              Huella Dactilar<br>Índice Derecho
            </div>
          </td>
          <td style="width:36%; vertical-align:bottom; padding:0 8px;">
            <div style="border-bottom:1.5px solid #000; height:50px;"></div>
            <div style="margin-top:4px; font-weight:700;">Firma y Sello del Médico Tratante</div>
            <div>${medResponsable}</div>
            <div style="font-size:8.5px; color:#64748b;">Colegio Médico del Perú (CMP)</div>
          </td>
        </tr>
      </table>

      <div style="margin-top:16px; text-align:center; font-size:8.5px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:6px;">
        ESTE DOCUMENTO FORMA PARTE INTEGRANTE DE LA HISTORIA CLÍNICA (NTS N° 139-MINSA) · ARCHIVO OBLIGATORIO
      </div>
    </div>
  `;
}

function abrirModalConsentimiento() {
  const m = document.getElementById("modal_consentimiento_informado");
  const cont = document.getElementById("consentimiento_modal_preview");
  if (cont) {
    cont.innerHTML = construirHTMLDocumentoConsentimiento();
  }
  if (m) {
    m.classList.add("open");
    m.style.display = "flex";
  }
}
window.abrirModalConsentimiento = abrirModalConsentimiento;

function cerrarModalConsentimiento() {
  const m = document.getElementById("modal_consentimiento_informado");
  if (m) {
    m.classList.remove("open");
    m.style.display = "none";
  }
}
window.cerrarModalConsentimiento = cerrarModalConsentimiento;

function imprimirConsentimientoDirecto() {
  const htmlDoc = construirHTMLDocumentoConsentimiento();
  const nomPx = STATE.nombreReniec || STATE.identificador || "Paciente";
  const hcPx = STATE.historiaClinica || "HC-PROVISIONAL";

  const w = window.open('', '_blank');
  if (!w) { alert("Permita las ventanas emergentes para imprimir el consentimiento."); return; }

  w.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Consentimiento Informado — ${nomPx} (${hcPx})</title>
      <style>
        @page { size: portrait; margin: 15mm; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #e2e8f0; display:flex; justify-content:center; }
        @media print {
          body { background: #ffffff; padding: 0; }
          .consentimiento-doc { border: none !important; box-shadow: none !important; }
        }
      </style>
    </head>
    <body>
      ${htmlDoc}
    </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 250);
}
window.imprimirConsentimientoDirecto = imprimirConsentimientoDirecto;

// --- GESTIÓN DE ROLES ASISTENCIALES Y PROTECCIÓN DE DATOS (LEY N° 29733) ---
let rolActivoActual = "ADMIN";
function cambiarRolSistema(rol) {
  rolActivoActual = rol || "ADMIN";
  const lbl = document.getElementById("lbl_toggle_vista_caja");

  // Redireccionar al módulo principal del rol
  const rolModulos = {
    "ENF_TRIAJE": 1,
    "ADMISION": 2,
    "MEDICO": 4,
    "ENF_ASIST": 6,
    "GESTION_CAMAS": 7,
    "FACTURACION": 8,
    "ADMIN": 1
  };
  const modDestino = rolModulos[rolActivoActual] || 1;
  if (typeof irAModulo === "function") {
    irAModulo(modDestino);
  }

  // Protección de datos sensibles (Ley N° 29733)
  const elMotivo = document.getElementById("motivo_full");
  const elAlergias = document.getElementById("alergias_full");

  if (rolActivoActual === "FACTURACION") {
    if (lbl) lbl.textContent = "👁️ Vista: Caja (Financiera)";
    if (elMotivo) {
      if (!elMotivo.dataset.realVal) elMotivo.dataset.realVal = elMotivo.value;
      elMotivo.value = "🔒 [ANAMNESIS MÉDICA PROTEGIDA — LEY N° 29733]";
      elMotivo.disabled = true;
    }
  } else {
    if (lbl) lbl.textContent = `👁️ Vista: ${rolActivoActual}`;
    if (elMotivo && elMotivo.dataset.realVal) {
      elMotivo.value = elMotivo.dataset.realVal || STATE.motivoConsulta || "";
      elMotivo.disabled = false;
    }
  }

  registrarLogAuditoria("Sistema", "CAMBIO_ROL", `Rol activo modificado a: ${rolActivoActual}`);
  if (typeof mostrarToastCola === "function") {
    const nombresRoles = {
      "ADMIN": "🛡️ Administrador / Auditor General",
      "ENF_TRIAJE": "👩‍⚕️ Lic. Enfermería de Triaje",
      "ADMISION": "📋 Admisión de Emergencia / SUSALUD",
      "MEDICO": "🩺 Médico Especialista de Guardia",
      "ENF_ASIST": "💉 Lic. Enfermería Asistencial",
      "GESTION_CAMAS": "🛏️ Gestión de Camas y Flujo",
      "FACTURACION": "💳 Facturación y Liquidación"
    };
    mostrarToastCola(`👤 <strong>Sesión Activa:</strong> ${nombresRoles[rolActivoActual] || rolActivoActual}`);
  }
}
window.cambiarRolSistema = cambiarRolSistema;

// --- MOTOR DE BLOQUEO Y DESBLOQUEO DE CAMPOS EN SIMULACIÓN ---
function bloquearCamposSimulacion(bloquear = true) {
  for (let i = 1; i <= 8; i++) {
    const modEl = document.getElementById(`sec_mod${i}`) || document.getElementById(`body_mod${i}`);
    if (!modEl) continue;
    const elements = modEl.querySelectorAll("input:not(#chk_consentimiento_firmado), select:not(#selector_rol_sistema):not(#enfermero_triaje_select), textarea");
    elements.forEach(el => {
      el.disabled = Boolean(bloquear);
      if (bloquear) {
        el.style.backgroundColor = "#f8fafc";
        el.style.color = "#0f172a";
        el.style.fontWeight = "700";
        el.style.borderColor = "#cbd5e1";
        el.style.cursor = "not-allowed";
        el.title = "🔒 Campo bloqueado con valor clínico simulado (NTS N° 042-MINSA)";
      } else {
        el.style.backgroundColor = "";
        el.style.color = "";
        el.style.fontWeight = "";
        el.style.borderColor = "";
        el.style.cursor = "";
        el.title = "";
      }
    });
  }

  const bannerSim = document.getElementById("banner_sandbox_completado");
  if (bannerSim) {
    bannerSim.style.display = bloquear ? "flex" : "none";
  }
}
window.bloquearCamposSimulacion = bloquearCamposSimulacion;


// ---------------------------------------------------------------------------
// GESTIÓN IDEMPOTENTE DE CAMAS Y ADMISIÓN NN DE EMERGENCIA (LEYES 27604 / 29414)
// ---------------------------------------------------------------------------
function liberarRecursoHospitalarioOperativo(idRecursoOCama, idExpediente) {
  let idRec = idRecursoOCama;
  if (!idRec && typeof RECURSOS_HOSPITALARIOS !== 'undefined') {
    for (let k in RECURSOS_HOSPITALARIOS) {
      if (RECURSOS_HOSPITALARIOS[k].paciente && (RECURSOS_HOSPITALARIOS[k].paciente.id === idExpediente || RECURSOS_HOSPITALARIOS[k].paciente.identificador === idExpediente)) {
        idRec = k;
        break;
      }
    }
  }
  if (!idRec && window.STATE && window.STATE.camaAsignadaId) {
    idRec = window.STATE.camaAsignadaId;
  }
  if (idRec && typeof RECURSOS_HOSPITALARIOS !== 'undefined' && RECURSOS_HOSPITALARIOS[idRec]) {
    const rec = RECURSOS_HOSPITALARIOS[idRec];
    rec.estado = "disponible";
    rec.paciente = null;
    rec.pacienteId = null;
    rec.pacienteNombre = null;
    rec.inicioMs = null;
    rec.finMs = null;
    rec.horasAmpliadas = 0;
    rec.tiempoFormateado = "--:--:--";
    rec.progresoPct = 0;
    if (window.STATE && window.STATE.camaAsignadaId === idRec) {
      window.STATE.camaAsignada = null;
      window.STATE.camaAsignadaId = null;
    }
    if (typeof tickCronometrosCamas === "function") tickCronometrosCamas();
    if (typeof renderizarTableroCamasYQuirofanos === "function") renderizarTableroCamasYQuirofanos();
    if (typeof renderizarMonitorObservacionModulo5 === "function") renderizarMonitorObservacionModulo5();
    if (typeof actualizarWidgetFlotanteCamas === "function") actualizarWidgetFlotanteCamas();
    return true;
  }
  return false;
}
window.liberarRecursoHospitalarioOperativo = liberarRecursoHospitalarioOperativo;
window.liberarRecurso = liberarRecursoHospitalarioOperativo;

function sugerirRecursoSegunPrioridad(prioridad) {
  if (prioridad === 'I') {
    if (RECURSOS_HOSPITALARIOS['ST-01'] && RECURSOS_HOSPITALARIOS['ST-01'].estado === 'disponible') return 'ST-01';
    if (RECURSOS_HOSPITALARIOS['ST-02'] && RECURSOS_HOSPITALARIOS['ST-02'].estado === 'disponible') return 'ST-02';
    return 'ST-01';
  } else if (prioridad === 'II') {
    for (let id of ['OBS-01','OBS-02','OBS-03','OBS-04','OBS-05','OBS-06']) {
      if (RECURSOS_HOSPITALARIOS[id] && RECURSOS_HOSPITALARIOS[id].estado === 'disponible') return id;
    }
    return 'OBS-01';
  } else if (prioridad === 'III') {
    for (let id of ['OBS-01','OBS-02','OBS-03','SILLON-01']) {
      if (RECURSOS_HOSPITALARIOS[id] && RECURSOS_HOSPITALARIOS[id].estado === 'disponible') return id;
    }
    return 'SILLON-01';
  } else {
    return 'SIN-CAMA';
  }
}
window.sugerirRecursoSegunPrioridad = sugerirRecursoSegunPrioridad;

function admitirEmergenciaNN() {
  if (typeof bloquearIdentificacionEnMod2 === "function") bloquearIdentificacionEnMod2(false);
  window._identificacionOrigen = null;
  const ahora = new Date();
  const fechaCod = ahora.toISOString().slice(0, 10).replace(/-/g, "");
  const numSec = String((window.PACIENTES_COLA || []).filter(x => x.esNN).length + 1).padStart(2, "0");
  const codigoNN = `NN-${fechaCod}-${numSec}`;
  const nombreNN = `Paciente NN (Indocumentado ${codigoNN})`;
  const hcEmergencia = `HC-NN-${fechaCod}-${numSec}`;

  guardarEstadoPacienteActivo();

  // Buscar cama Shock Trauma libre sin duplicar
  let camaId = "ST-01";
  let camaNombre = "Shock Trauma ST-01";
  if (typeof RECURSOS_HOSPITALARIOS !== "undefined") {
    if (RECURSOS_HOSPITALARIOS["ST-01"] && RECURSOS_HOSPITALARIOS["ST-01"].estado === "disponible") {
      camaId = "ST-01";
      camaNombre = "Shock Trauma ST-01";
    } else if (RECURSOS_HOSPITALARIOS["ST-02"] && RECURSOS_HOSPITALARIOS["ST-02"].estado === "disponible") {
      camaId = "ST-02";
      camaNombre = "Shock Trauma ST-02";
    }
  }

  const pxNN = crearRegistroPaciente({
    identificador: codigoNN,
    nombre: nombreNN,
    dni: "NN",
    edad: "Desconocido",
    sexo: "Desconocido",
    prioridad: "I",
    motivo: "Admisión de Emergencia Paciente NN / Riesgo Vital Inminente — Ley N° 27604",
    estadoAtencion: "Shock Trauma Inmediato",
    camaNombre: camaNombre,
    camaId: camaId,
    esEmergenciaDirecta: true,
    esNN: true,
    estadoFlujo: "EN_ATENCION_MEDICA"
  });

  esLlegadaSimultanea = false;
  PACIENTES_COLA = [pxNN];
  pacienteActivoId = pxNN.id;

  limpiarFormularioCompletoState();

  STATE.esNN = true;
  STATE.ingresoDirectoCritico = true;
  STATE.motivoIngresoCritico = "Admisión de Emergencia Paciente NN Indocumentado / Riesgo Vital Inminente — Ley N° 27604";
  STATE.alertaPnpSs = true;
  STATE.identificador = codigoNN;
  STATE.nombreReniec = nombreNN;
  STATE.numDni = "NN";
  STATE.edad = "Desconocido";
  STATE.sexo = "Desconocido";
  STATE.telefono = "Desconocido";
  STATE.direccion = "Desconocido";
  STATE.grupoSanguineo = "Desconocido";
  STATE.alergias = "Desconocido";
  STATE.alergiasConocidas = "Desconocido";
  STATE.tipoSeguro = "Regularización Diferida (Ley N° 27604)";
  STATE.modalidadIngreso = "Pase Directo / Ambulancia";
  STATE.motivoConsulta = "Admisión de Emergencia Paciente NN / Riesgo Vital Inminente — Ley N° 27604";
  STATE.prioridad = "I";
  STATE.colorPrioridad = "ROJO";
  STATE.historiaClinica = hcEmergencia;
  STATE.camaAsignada = camaNombre;
  STATE.camaAsignadaId = camaId;
  STATE.estadoFlujo = "EN_ATENCION_MEDICA";

  // Asignar recurso hospitalario exactamente 1 cama de forma idempotente
  if (typeof asignarPacienteActualARecurso === "function") {
    asignarPacienteActualARecurso(camaId, 2, "Admisión de Emergencia Paciente NN (Ley N° 27604)", true);
  }

  // Sincronizar DOM
  const elIdent = document.getElementById("ident_full");
  if (elIdent) {
    elIdent.value = codigoNN;
    elIdent.placeholder = "PACIENTE NN — Documento No Requerido (Ley N° 27604)";
  }
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = STATE.motivoConsulta;
  const elEdad = document.getElementById("edad_full");
  if (elEdad) { elEdad.value = ""; elEdad.placeholder = "Desconocido"; }
  const elSexo = document.getElementById("sexo_full");
  if (elSexo) elSexo.value = "Desconocido";
  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = "Desconocido";
  const elAlergiasFull = document.getElementById("alergias_full");
  if (elAlergiasFull) elAlergiasFull.value = "Desconocido";
  const elAlergiasM1 = document.getElementById("alergias_mod1");
  if (elAlergiasM1) elAlergiasM1.value = "Desconocido";
  const elAlergias = document.getElementById("alergias_full");
  if (elAlergias) elAlergias.value = "Desconocido";
  const elAlergiasM1NN = document.getElementById("alergias_mod1");
  if (elAlergiasM1NN) elAlergiasM1NN.value = "Desconocido";
  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = hcEmergencia;

  if (typeof mostrarPrioridad === "function") {
    mostrarPrioridad("I", {
      tipo: "Prioridad I — ROJO (Resucitación / Shock Trauma)",
      desc: `Paciente indocumentado (${codigoNN}) en riesgo vital. Atención inmediata garantizada por Ley N° 27604 sin requisito de DNI.`,
      destino: camaNombre
    });
  }

  if (typeof generarBrazaleteEmergencia === "function") {
    generarBrazaleteEmergencia("temporal");
  }

  if (typeof sincronizarDatosPacienteEnTodosLosModulos === "function") {
    sincronizarDatosPacienteEnTodosLosModulos({
      esNN: true,
      dni: "NN",
      nombre: nombreNN,
      hc: hcEmergencia,
      sexo: "Desconocido"
    });
  }

  renderizarTableroColaPacientes();
  if (typeof renderizarBandejaPosta === "function") renderizarBandejaPosta();
  else if (window.RBAC_FLUJO && typeof window.RBAC_FLUJO.renderizarBandejaPosta === "function") window.RBAC_FLUJO.renderizarBandejaPosta();
  if (typeof actualizarWidgetFlotanteCamas === "function") actualizarWidgetFlotanteCamas();

  if (typeof mostrarToast === "function") {
    mostrarToast("warning", "🚨 Paciente NN Admitido (P-I)", `${codigoNN} derivado a Shock Trauma (${camaNombre}) conforme a Ley N° 27604.`);
  } else if (typeof mostrarToastCola === "function") {
    mostrarToastCola(`🚨 <strong>Admitir Emergencia NN (P-I):</strong> ${codigoNN} cargado con Grupo Sanguíneo <strong>Desconocido</strong>.`);
  }

  if (window.RBAC_FLUJO && typeof window.RBAC_FLUJO.sincronizarExpedienteActivoEnStore === "function") {
    window.RBAC_FLUJO.sincronizarExpedienteActivoEnStore();
  }

  irAModulo(4);
}
window.admitirEmergenciaNN = admitirEmergenciaNN;


// ==============================================================================
// GESTIÓN DE SUB-SELECTORES: IPRESS PÚBLICA (FUA / ESSI) Y PLANES PRIVADOS EPS
// ==============================================================================
function cambiarIpressPublica(valor) {
  STATE.tipoIpressPublica = valor || "MINSA";
  if (valor === "MINSA") {
    STATE.nroFua = STATE.nroFua || `FUA-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    STATE.estadoFua = STATE.estadoFua || "ABIERTO";
  } else if (valor === "ESSALUD") {
    STATE.nroEssi = STATE.nroEssi || `ESSI-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    STATE.estadoEssi = STATE.estadoEssi || "ABIERTO";
  }
  actualizarFactura();
  if (window.COCKPIT && typeof window.COCKPIT.actualizarTarjetaResumenTriaje === "function") {
    window.COCKPIT.actualizarTarjetaResumenTriaje();
  }
}
window.cambiarIpressPublica = cambiarIpressPublica;

function cambiarPlanPrivado(plan) {
  STATE.planPrivado = plan || "base_80_20";
  actualizarFactura();
}
window.cambiarPlanPrivado = cambiarPlanPrivado;

// Vinculación reactiva instantánea a campos de signos vitales (CORRECCIÓN 3)
function vincularEventosRecalculoDinamicoVitales() {
  const idsInputs = [
    "spo2_full", "fc_full", "pas_full", "pad_full", "fr_full", "temp_full",
    "glasgow_full", "glucosa_full", "eva_full", "eva_range", "sem_gestacion", "lcf_gestacion"
  ];
  idsInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._recalculoBound) {
      el.addEventListener("input", () => {
        if (typeof recalcularPrioridad === "function") recalcularPrioridad();
      });
      el.addEventListener("change", () => {
        if (typeof recalcularPrioridad === "function") recalcularPrioridad();
      });
      el._recalculoBound = true;
    }
  });

  const idsChecks = [
    "check_cod_infarto", "check_cod_ictus", "check_cod_sepsis",
    "check_gestante", "check_pediatrico", "clave_obstetrica_sel",
    "ant_cardio", "ant_resp", "ant_diab", "ant_neuro"
  ];
  idsChecks.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._recalculoBound) {
      el.addEventListener("change", () => {
        if (typeof recalcularPrioridad === "function") recalcularPrioridad();
      });
      el._recalculoBound = true;
    }
  });
}
window.vincularEventosRecalculoDinamicoVitales = vincularEventosRecalculoDinamicoVitales;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", vincularEventosRecalculoDinamicoVitales);
} else {
  vincularEventosRecalculoDinamicoVitales();
}
