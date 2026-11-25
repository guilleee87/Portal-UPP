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
    kardex_items: Array.isArray(STATE.kardexItems) ? JSON.parse(JSON.stringify(STATE.kardexItems)) : [],
    lab_count: STATE.ordenesLaboratorio?.length || 0,
    ordenes_lab: Array.isArray(STATE.ordenesLaboratorio) ? JSON.parse(JSON.stringify(STATE.ordenesLaboratorio)) : [],
    imagenes_count: STATE.ordenesImagenes?.length || 0,
    ordenes_imagenes: Array.isArray(STATE.ordenesImagenes) ? JSON.parse(JSON.stringify(STATE.ordenesImagenes)) : [],
    junta_medica: window._ultimaActaJuntaMedica ? {
      numActa: window._ultimaActaJuntaMedica.numActa,
      cie10: window._ultimaActaJuntaMedica.cie10,
      recursoCama: window._ultimaActaJuntaMedica.recursoCama
    } : null,
    es_nn: Boolean(STATE.esNN),
    total_facturado: STATE.items_factura?.reduce((acc, i) => acc + (parseFloat(i.costo) || 0), 0) || 0,
    estado_salida: STATE.estadoSalida || "En atención activa",
    firmante: STATE.firmante || "Lic. Enfermería / Dr. Guardia UPP"
  };

  // 3. Persistir en Base de Datos Local de Pacientes Master
  try {
    const master = cargarPacientesMaster();
    const idKey = normalizarClavePaciente(STATE.numDni || cleanId || nroHc || "PACIENTE_ACTUAL");
    if (!master[idKey]) {
      master[idKey] = {
        identificador: cleanId || nroHc,
        historia_clinica: nroHc,
        nombre_completo: snapshotEpisodio.nombre_completo,
        tipo_seguro: snapshotEpisodio.tipo_seguro,
        episodios: []
      };
    }
    master[idKey].nombre_completo = snapshotEpisodio.nombre_completo;
    master[idKey].tipo_seguro = snapshotEpisodio.tipo_seguro;
    master[idKey].historia_clinica = nroHc;
    master[idKey].ultimo_episodio = snapshotEpisodio;
    if (nroHc && nroHc !== "—") master[normalizarClavePaciente(nroHc)] = master[idKey];
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
  const rolCockpit = document.getElementById("cockpit_sim_role_select")?.value || (window.RBAC_FLUJO ? window.RBAC_FLUJO.obtenerRolActivo() : "");
  const rolPerm = (rolCockpit && ["AUDITOR", "ADMIN", "MEDICO", "TRIAJE", "ADMISION", "CAJA"].includes(rolCockpit))
    ? rolCockpit
    : ((typeof rolActivoActual !== "undefined" && rolActivoActual) ? rolActivoActual : (document.getElementById("selector_rol_sistema")?.value || "ADMIN"));
  if (rolPerm !== "ADMIN" && rolPerm !== "AUDITOR" && rolPerm !== "MEDICO") {
    alert("🔒 Acceso restringido (Ley N° 29733 / NTS N° 139-MINSA): La búsqueda del catálogo de Historias Clínicas solo está habilitada para el Rol de Auditor y Médico.");
    return;
  }
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
  // 3. Unificar todas las historias clínicas del establecimiento (master local, historial de episodios y BASE_DATOS_HC)
  const fLow = String(filtro || "").trim().toLowerCase();
  const agregarSiNoExiste = (reg) => {
    const hcReg = String(reg.historia_clinica || "").trim();
    const idReg = String(reg.identificador || "").trim();
    const nomReg = String(reg.nombre_completo || idReg).trim();
    if (fLow && !nomReg.toLowerCase().includes(fLow) && !idReg.toLowerCase().includes(fLow) && !hcReg.toLowerCase().includes(fLow)) return;
    const dup = registros.some(r =>
      (hcReg && hcReg !== "—" && r.historia_clinica === hcReg) ||
      (idReg && idReg !== "—" && String(r.identificador || "").toLowerCase() === idReg.toLowerCase())
    );
    if (!dup) registros.push(reg);
  };

  try {
    const master = cargarPacientesMaster();
    Object.values(master).forEach((p, idx) => {
      if (!p || (!p.historia_clinica && !p.identificador)) return;
      agregarSiNoExiste({
        id: `M-${idx + 1}`,
        identificador: p.identificador || p.dni || p.historia_clinica,
        nombre_completo: p.nombre_completo || p.identificador || "Paciente Registrado",
        historia_clinica: p.historia_clinica || "—",
        tipo_seguro: p.tipo_seguro || "Particular",
        alergias: p.alergias,
        ticket: `T-${String(idx + 1).padStart(2, "0")}`
      });
    });
  } catch (e) {}

  try {
    const histEps = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORIAL_EPISODIOS) || localStorage.getItem("UPP_HISTORIAL_EPISODIOS") || "[]");
    if (Array.isArray(histEps)) {
      histEps.forEach((ep, idx) => {
        if (!ep || !ep.historia_clinica) return;
        agregarSiNoExiste({
          id: `EP-${idx + 1}`,
          identificador: ep.identificador || ep.historia_clinica,
          nombre_completo: ep.nombre_completo || ep.identificador || "Paciente Atendido",
          historia_clinica: ep.historia_clinica,
          tipo_seguro: ep.tipo_seguro || "Particular",
          alergias: ep.alergias,
          ticket: ep.folio || `EP-${idx + 1}`
        });
      });
    }
  } catch (e) {}

  // 3b. Incluir pacientes activos en cola (incluyendo NN con HC temporal y atenciones en curso)
  if (Array.isArray(PACIENTES_COLA)) {
    PACIENTES_COLA.forEach((px, idx) => {
      const snap = px.stateSnapshot || {};
      const hcPx = snap.historiaClinica || px.historiaClinica || (px.esNN ? `HC-TEMP-NN` : `HC-2026-${String(px.numero || idx + 1).padStart(4, "0")}`);
      const identPx = px.dni || px.identificador || hcPx;
      const nomPx = px.nombre || identPx;
      agregarSiNoExiste({
        id: `COLA-${idx + 1}`,
        identificador: identPx,
        nombre_completo: nomPx,
        historia_clinica: hcPx,
        tipo_seguro: px.tipoSeguro || snap.tipoSeguro || "Particular",
        alergias: snap.alergias || "Por confirmar",
        ticket: px.identificador || `T-${px.numero || idx + 1}`
      });
    });
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
      <tr style="cursor:pointer;" onclick="visualizarHistoriaClinica('${pJson}')" title="Clic para abrir la Historia Clínica completa">
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
            <button type="button" class="btn-full-secondary" style="padding:5px 10px;font-size:0.75rem;background:#f8fafc;border:1.5px solid #0284c7;color:#0284c7;border-radius:6px;cursor:pointer;"
              title="Visualizar expediente e historial clínico completo" onclick="event.stopPropagation(); visualizarHistoriaClinica('${pJson}')">
              👁️ Ver Historia
            </button>
            <button type="button" class="btn-full-secondary" style="padding:5px 10px;font-size:0.75rem;background:#ffffff;border:1.5px solid #475569;color:#334155;border-radius:6px;cursor:pointer;"
              title="Imprimir ficha oficial de historia clínica con historial" onclick="event.stopPropagation(); imprimirFichaHistoriaClinica('${pJson}')">
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

function abrirModalIngresoNN() {
  const m = document.getElementById("modal_ingreso_nn");
  if (!m) { ingresarNNConsciente(); return; }
  const rConsc = document.querySelector('input[name="nn_estado_conciencia"][value="consciente"]');
  const rReg = document.querySelector('input[name="nn_ruta_prioridad"][value="regular"]');
  if (rConsc) rConsc.checked = true;
  if (rReg) rReg.checked = true;
  m.classList.add("open");
  m.classList.add("show");
  m.style.setProperty("display", "flex", "important");
}
window.abrirModalIngresoNN = abrirModalIngresoNN;

function cerrarModalIngresoNN() {
  const m = document.getElementById("modal_ingreso_nn");
  if (!m) return;
  m.classList.remove("open");
  m.classList.remove("show");
  m.style.setProperty("display", "none", "important");
}
window.cerrarModalIngresoNN = cerrarModalIngresoNN;

function confirmarIngresoNNModal() {
  const estado = document.querySelector('input[name="nn_estado_conciencia"]:checked')?.value || "consciente";
  const ruta = document.querySelector('input[name="nn_ruta_prioridad"]:checked')?.value || "regular";
  cerrarModalIngresoNN();
  STATE.nnEstadoConciencia = estado;
  STATE.nnRutaPrioridad = ruta;
  if (ruta === "inmediata") {
    ingresarNNInconsciente();
    if (estado === "consciente") {
      const elMot = document.getElementById("motivo_full");
      if (elMot) elMot.value = "Paciente NN Consciente — Atención Inmediata Prioridad I (Ley N° 27604)";
      STATE.motivoConsulta = "Paciente NN Consciente — Atención Inmediata Prioridad I (Ley N° 27604)";
    }
  } else {
    ingresarNNConsciente();
    if (estado === "inconsciente") {
      const elMot = document.getElementById("motivo_full");
      if (elMot) elMot.value = "Paciente NN Inconsciente — Derivado a Evaluación de Triaje";
      STATE.motivoConsulta = "Paciente NN Inconsciente — Derivado a Evaluación de Triaje";
    }
  }
  if (typeof registrarLogAuditoria === "function") {
    registrarLogAuditoria("Admisión NN", "INGRESO_NN_UNIFICADO", `Estado: ${estado.toUpperCase()} | Prioridad/Ruta: ${ruta.toUpperCase()}`);
  }
}
window.confirmarIngresoNNModal = confirmarIngresoNNModal;

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


function verHistoriaClinicaPacienteActual() {
  const ident = STATE.numDni || STATE.identificador || document.getElementById("dni_mod1")?.value || document.getElementById("ident_full")?.value || "";
  const nom = STATE.nombreReniec || STATE.identificador || "";
  const hc = STATE.historiaClinica || "—";
  if (!ident && (!hc || hc === "—")) {
    alert("⚠️ No hay ningún paciente activo en atención en este momento.");
    return;
  }
  visualizarHistoriaClinica({
    identificador: ident || hc,
    nombre_completo: nom || ident || "Paciente en Atención",
    historia_clinica: hc,
    tipo_seguro: STATE.tipoSeguro || "Particular",
    alergias: STATE.alergias || "Por confirmar"
  });
}
window.verHistoriaClinicaPacienteActual = verHistoriaClinicaPacienteActual;

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
  const epCurso = master.ultimo_episodio || (STATE.historiaClinica === hc ? {
    fecha_hora_texto: new Date().toLocaleString(),
    historia_clinica: hc,
    prioridad: STATE.prioridad ? `P-${STATE.prioridad}` : "Por evaluar",
    cie10: STATE.cie10 || "En evaluación",
    cama_asignada: STATE.camaAsignada || "Ninguna asignada",
    signos_vitales: { spo2: STATE.spo2, fc: STATE.fc, fr: STATE.fr, pa: `${STATE.pasSistolica || "—"}/${STATE.paDiastolica || "—"}`, temp: STATE.temperatura, dolor: STATE.eva },
    kardex_items: STATE.kardexItems || [],
    ordenes_lab: STATE.ordenesLaboratorio || [],
    ordenes_imagenes: STATE.ordenesImagenes || [],
    junta_medica: window._ultimaActaJuntaMedica ? { numActa: window._ultimaActaJuntaMedica.numActa, cie10: window._ultimaActaJuntaMedica.cie10, recursoCama: window._ultimaActaJuntaMedica.recursoCama } : null
  } : null);
  if (epCurso) {
    const svC = epCurso.signos_vitales || {};
    const medsC = Array.isArray(epCurso.kardex_items) && epCurso.kardex_items.length > 0 ? epCurso.kardex_items.map(k => `${k.nombre} (${k.dosis || 'STAT'})`).join(", ") : "Sin fármacos aún";
    const labsC = Array.isArray(epCurso.ordenes_lab) && epCurso.ordenes_lab.length > 0 ? epCurso.ordenes_lab.map(l => l.nombre).join(", ") : "Sin laboratorio aún";
    const imgsC = Array.isArray(epCurso.ordenes_imagenes) && epCurso.ordenes_imagenes.length > 0 ? epCurso.ordenes_imagenes.map(im => im.nombre).join(", ") : "Sin imágenes aún";
    htmlEpisodios += `
      <div style="background:#f0f9ff;border:1.5px solid #38bdf8;border-left:5px solid #0284c7;border-radius:10px;padding:12px 16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
          <strong style="color:#0369a1;font-size:0.86rem;">⚡ ATENCIÓN ACTUAL EN CURSO (Guardado en Tiempo Real · ${hc})</strong>
          <span style="font-size:0.74rem;color:#0369a1;font-weight:700;">${epCurso.prioridad || "Por evaluar"} · ${epCurso.fecha_hora_texto || ""}</span>
        </div>
        <div style="font-size:0.78rem;color:#0f172a;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px;">
          <div><strong>CIE-10:</strong> ${epCurso.cie10 || "En evaluación"}</div>
          <div><strong>Cama / Recurso:</strong> ${epCurso.cama_asignada || "Ninguna"}</div>
          <div><strong>Vitales:</strong> SpO2 ${svC.spo2 || "—"}% · FC ${svC.fc || "—"} · PA ${svC.pa || "—"} · T° ${svC.temp || "—"}</div>
          <div><strong>Kardex:</strong> ${medsC}</div>
          <div><strong>Laboratorio:</strong> ${labsC}</div>
          <div><strong>Imágenes:</strong> ${imgsC}</div>
          ${epCurso.junta_medica ? `<div><strong>Junta Médica:</strong> Acta ${epCurso.junta_medica.numActa} → ${epCurso.junta_medica.recursoCama}</div>` : ""}
        </div>
      </div>
    `;
  }
  if (episodios.length === 0 && !epCurso) {
    htmlEpisodios = `
      <div style="background:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:10px;padding:20px;text-align:center;color:#64748b;">
        <div style="font-size:1.8rem;margin-bottom:6px;">📂</div>
        <strong style="color:#1e293b;font-size:0.95rem;">Expediente Clínico Aperturado — Sin Atenciones Previas Archivadas</strong>
        <p style="font-size:0.8rem;margin:6px 0 0;color:#64748b;">
          El paciente cuenta con Historia Clínica <strong>${hc}</strong> sin episodios cerrados registrados en el historial.
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
            <div>🏥 <strong>Cama / Destino:</strong> ${ep.cama_asignada || ep.destino_clinico || "—"}</div>
            <div>🔬 <strong>Apoyo Diagnóstico:</strong> ${exms}</div>
            <div>💊 <strong>Farmacia:</strong> ${meds}</div>
            <div>💰 <strong>Facturación:</strong> <span style="font-weight:800;color:${totalPagar === "S/. 0.00" ? "#16a34a" : "#0284c7"};">${totalPagar}</span> (${cobBadge})</div>
            <div style="grid-column: 1 / -1;border-top:1px dashed #e2e8f0;padding-top:4px;margin-top:2px;font-size:0.75rem;color:#64748b;display:flex;justify-content:space-between;">
              <span><strong>Estado al Egreso:</strong> ${ep.estado_salida || "—"}</span>
              <span><strong>Responsable:</strong> ${ep.firmante || "—"}</span>
            </div>
          </div>
        </div>
      `;
    });
  }
  const modsAudit = Array.isArray(master.modificaciones_auditoria) ? master.modificaciones_auditoria : [];
  const htmlModsAudit = modsAudit.length > 0
    ? modsAudit.map((m, i) => `
        <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px 8px; font-weight:800; color:#0f172a;">${m.auditor}</td>
          <td style="padding:6px 8px; font-family:monospace; color:#0369a1; font-weight:700;">${m.ip}</td>
          <td style="padding:6px 8px; white-space:nowrap;">${m.fecha}</td>
          <td style="padding:6px 8px; white-space:nowrap; font-family:monospace;">${m.hora}</td>
          <td style="padding:6px 8px;"><strong>${m.campo}</strong></td>
          <td style="padding:6px 8px; color:#64748b;">${m.valor_anterior || "—"}</td>
          <td style="padding:6px 8px; color:#065f46; font-weight:700;">${m.valor}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="7" style="padding:10px; text-align:center; color:#94a3b8;">No se registran modificaciones de auditoría en esta Historia Clínica.</td></tr>`;

  const identEsc = String(ident).replace(/'/g, "\\'");
  const hcEsc = String(hc).replace(/'/g, "\\'");
  const nomEsc = String(nom).replace(/'/g, "\\'");
  const segEsc = String(seguro).replace(/'/g, "\\'");

  // Consolidar datos completos (NTS N° 139-MINSA / HL7 FHIR / ISO 13606)
  const pxCola = (typeof PACIENTES_COLA !== "undefined" && Array.isArray(PACIENTES_COLA))
    ? PACIENTES_COLA.find(x => (x.historiaClinica === hc || x.dni === ident || x.identificador === ident))
    : null;
  const esActivo = STATE && (STATE.historiaClinica === hc || STATE.numDni === ident || STATE.identificador === ident);

  const enfTriaje = master.enfermera_triaje || pxCola?.firmas?.triaje?.usuario || (esActivo && STATE.enfermeraTriaje ? STATE.enfermeraTriaje : "") || "—";
  const enfAsist = master.enfermera_asistencial || pxCola?.firmas?.enfermeria?.usuario || (esActivo && STATE.enfermeraAsistencial ? STATE.enfermeraAsistencial : "") || "—";
  const medTrat = master.medico_tratante || pxCola?.firmas?.medico?.usuario || (esActivo && STATE.medicoTratante ? STATE.medicoTratante : "") || "—";
  const admisionista = master.admisionista || pxCola?.firmas?.admision?.usuario || (esActivo && STATE.admisionista ? STATE.admisionista : "") || "—";
  const formaLlegada = master.forma_llegada || pxCola?.formaLlegada || (esActivo ? STATE.formaLlegada : "") || "—";
  const fechaNac = master.fecha_nacimiento || (esActivo ? STATE.fechaNacimiento : "") || "—";
  const grupoSang = master.grupo_sanguineo || (esActivo && STATE.grupoSanguineo ? STATE.grupoSanguineo : "") || "—";
  const factorRh = master.factor_rh || (esActivo && STATE.factorRh ? STATE.factorRh : "") || "—";
  const gsRhTxt = (grupoSang !== "—" || factorRh !== "—") ? `${grupoSang} ${factorRh !== "—" ? factorRh : ""}`.trim() : "—";
  const direccion = master.direccion || (esActivo ? STATE.direccion : "") || "—";
  const telefono = master.telefono || (esActivo ? STATE.telefono : "") || "—";
  const contactoEmerg = master.contacto_emergencia || "—";
  const antPersonales = master.antecedentes_personales || "—";
  const antFamiliares = master.antecedentes_familiares || "—";
  const medHabitual = master.medicacion_habitual || "—";

  const labConsolidado = master.resultados_laboratorio || (esActivo && Array.isArray(STATE.ordenesLaboratorio) && STATE.ordenesLaboratorio.length > 0 ? STATE.ordenesLaboratorio.map(l => `${l.nombre} (${l.resultado || l.estado || "Solicitado"})`).join(" | ") : "—");
  const imgConsolidado = master.resultados_imagenes || (esActivo && Array.isArray(STATE.ordenesImagenes) && STATE.ordenesImagenes.length > 0 ? STATE.ordenesImagenes.map(im => `${im.nombre} (${im.informe || im.estado || "Solicitado"})`).join(" | ") : "—");
  const kardexConsolidado = master.kardex_medicamentos || (esActivo && Array.isArray(STATE.kardexItems) && STATE.kardexItems.length > 0 ? STATE.kardexItems.map(k => `${k.nombre} ${k.dosis || ""} (${k.via || "EV"} · ${k.hora || "STAT"})`).join(" | ") : "—");
  const notasEnfConsolidado = master.notas_enfermeria || "—";

  const consultasExt = Array.isArray(master.consultas_externas) ? master.consultas_externas : [];
  const htmlConsultasExt = consultasExt.length > 0
    ? consultasExt.map((ce, idxCe) => `
        <div style="background:#ffffff;border:1px solid #cbd5e1;border-left:4px solid #6366f1;border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:0.78rem;">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
            <strong style="color:#312e81;">Consulta Externa #${consultasExt.length - idxCe} — ${ce.especialidad || "—"}</strong>
            <span style="color:#475569;font-family:monospace;">📅 ${ce.fecha || "—"} · ⏱️ ${ce.hora || "—"}</span>
          </div>
          <div style="color:#334155;margin-top:3px;"><strong>Médico:</strong> ${ce.medico || "—"} · <strong>Detalle/CIE-10:</strong> ${ce.detalle || "—"}</div>
        </div>
      `).join("")
    : `<div style="font-size:0.78rem;color:#94a3b8;padding:8px 10px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;">— (Sin atenciones en Consulta Externa)</div>`;

  const camposPersonalizados = master.campos_personalizados && typeof master.campos_personalizados === "object"
    ? Object.entries(master.campos_personalizados).map(([ck, cv]) => `<div><strong>${ck}:</strong> ${cv}</div>`).join("")
    : "";

  const rolCockpitModal = document.getElementById("cockpit_sim_role_select")?.value || "";
  const rolEfectivoModal = (rolCockpitModal && ["AUDITOR", "ADMIN", "MEDICO", "TRIAJE", "ADMISION", "CAJA"].includes(rolCockpitModal))
    ? rolCockpitModal
    : (typeof rolActivoActual !== "undefined" ? rolActivoActual : (document.getElementById("selector_rol_sistema")?.value || "ADMIN"));
  const esRolAuditor = (rolEfectivoModal === "ADMIN" || rolEfectivoModal === "AUDITOR");
  const bloqueFormularioAuditor = esRolAuditor ? `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
        <h4 style="margin:0;font-size:0.9rem;font-weight:900;color:#92400e;">✏️ Modificación Auditada de Cualquier Campo (Solo Auditor)</h4>
        <span style="font-size:0.72rem;color:#b45309;font-weight:700;">Trazabilidad: Nombre · IP de la PC · Día · Hora · Valor Anterior → Nuevo</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:8px;margin-bottom:10px;">
        <div>
          <label style="font-size:0.74rem;font-weight:700;color:#78350f;display:block;margin-bottom:3px;">Nombre del Auditor que modifica:</label>
          <input type="text" id="hc_audit_nombre_editor" class="input-full" placeholder="Ej. Dr. Juan Pérez (Auditor)" style="font-size:0.8rem;padding:6px 8px;">
        </div>
        <div>
          <label style="font-size:0.74rem;font-weight:700;color:#78350f;display:block;margin-bottom:3px;">Campo de la Historia a modificar:</label>
          <select id="hc_audit_campo" class="input-full" style="font-size:0.8rem;padding:6px 8px;" onchange="const c=document.getElementById('hc_audit_custom_wrap'); if(c) c.style.display=(this.value==='campo_personalizado')?'block':'none';">
            <optgroup label="Filiación y Seguro">
              <option value="nombre_completo">Nombre Completo</option>
              <option value="identificador">DNI / Identificador</option>
              <option value="edad">Edad</option>
              <option value="sexo">Sexo (M / F)</option>
              <option value="fecha_nacimiento">Fecha de Nacimiento</option>
              <option value="direccion">Dirección</option>
              <option value="telefono">Teléfono</option>
              <option value="contacto_emergencia">Contacto de Emergencia</option>
              <option value="tipo_seguro">Seguro / IAFAS</option>
              <option value="forma_llegada">Forma de Llegada / Ingreso</option>
            </optgroup>
            <optgroup label="Alergias y Antecedentes">
              <option value="grupo_sanguineo">Grupo Sanguíneo (GS)</option>
              <option value="factor_rh">Factor Rh</option>
              <option value="alergias">Alergias Medicamentosas</option>
              <option value="antecedentes_personales">Antecedentes Personales / Patológicos</option>
              <option value="antecedentes_familiares">Antecedentes Familiares</option>
              <option value="medicacion_habitual">Medicación Habitual</option>
            </optgroup>
            <optgroup label="Equipo Asistencial (Enfermeras / Médicos)">
              <option value="enfermera_triaje">Enfermera(o) de Triaje</option>
              <option value="enfermera_asistencial">Enfermera(o) Asistencial / Kardex</option>
              <option value="medico_tratante">Médico Tratante</option>
              <option value="admisionista">Personal de Admisión</option>
            </optgroup>
            <optgroup label="Resultados, Análisis, Imágenes y Consultas">
              <option value="resultados_laboratorio">Resultados de Laboratorio</option>
              <option value="resultados_imagenes">Resultados / Informes de Imágenes</option>
              <option value="kardex_medicamentos">Kardex / Medicamentos</option>
              <option value="notas_enfermeria">Notas de Enfermería</option>
              <option value="consulta_externa_nueva">Agregar Consulta Externa</option>
              <option value="nota_auditoria">Nota / Aclaración de Auditoría</option>
              <option value="campo_personalizado">✏️ Otro Campo (Escribir nombre libre)</option>
            </optgroup>
          </select>
        </div>
        <div id="hc_audit_custom_wrap" style="display:none;">
          <label style="font-size:0.74rem;font-weight:700;color:#78350f;display:block;margin-bottom:3px;">Nombre del campo personalizado:</label>
          <input type="text" id="hc_audit_campo_custom" class="input-full" placeholder="Ej. Grupo Sanguíneo, Glasgow..." style="font-size:0.8rem;padding:6px 8px;">
        </div>
        <div>
          <label style="font-size:0.74rem;font-weight:700;color:#78350f;display:block;margin-bottom:3px;">Nuevo valor / Observación:</label>
          <input type="text" id="hc_audit_valor" class="input-full" placeholder="Ingrese nuevo valor o detalle..." style="font-size:0.8rem;padding:6px 8px;">
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
        <button type="button" id="btn_hc_audit_guardar" class="btn-full-primary" style="background:#b45309;padding:7px 14px;font-size:0.78rem;font-weight:800;"
          onclick="registrarModificacionAuditorHC('${identEsc}','${hcEsc}','${nomEsc}','${segEsc}')">
          💾 Registrar Modificación Auditada
        </button>
      </div>
  ` : `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
        <h4 style="margin:0;font-size:0.88rem;font-weight:900;color:#92400e;">🛡️ Bitácora de Modificaciones de Auditoría (Solo Lectura — Rol Médico)</h4>
        <span style="font-size:0.72rem;color:#b45309;font-weight:700;">La edición directa de registros archivados corresponde exclusivamente al Rol Auditor</span>
      </div>
  `;

  body.innerHTML = `
    <!-- 1. FILIACIÓN COMPLETA E IDENTIFICACIÓN (NTS N° 139-MINSA / HL7 PATIENT) -->
    <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:16px 20px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;border-bottom:2px solid #0284c7;padding-bottom:10px;margin-bottom:12px;">
        <div>
          <span style="font-size:0.72rem;font-weight:800;color:#0284c7;text-transform:uppercase;letter-spacing:1px;">
            HISTORIA CLÍNICA INTEGRAL — NTS N° 139-MINSA / HL7 FHIR / ISO 13606
          </span>
          <h2 style="margin:2px 0 0;font-size:1.35rem;font-weight:900;color:#0f172a;">${master.nombre_completo || nom}</h2>
        </div>
        <div style="text-align:right;">
          <span class="hc-pill-tag" style="font-size:1.05rem;padding:6px 14px;background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc;">${hc}</span>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px;">N° Historia Clínica Oficial</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:8px;font-size:0.81rem;">
        <div><strong>DNI / Identificador:</strong> <code style="background:#ffffff;padding:2px 6px;border-radius:4px;border:1px solid #e2e8f0;">${master.identificador || ident}</code></div>
        <div><strong>Seguro / IAFAS:</strong> <span class="hc-pill-seguro">${seguro}</span></div>
        <div><strong>Edad / Sexo:</strong> ${master.edad ? `${master.edad} años` : "—"} (${master.sexo === "F" ? "Femenino" : (master.sexo === "M" ? "Masculino" : "—")})</div>
        <div><strong>Grupo Sanguíneo / Rh:</strong> <strong style="color:${factorRh.includes("Negativo") ? "#b91c1c" : "#0f172a"};">${gsRhTxt}</strong></div>
        <div><strong>Fecha Nac.:</strong> ${fechaNac}</div>
        <div><strong>Teléfono:</strong> ${telefono}</div>
        <div><strong>Dirección:</strong> ${direccion}</div>
        <div><strong>Contacto Emerg.:</strong> ${contactoEmerg}</div>
        <div><strong>Forma de Llegada:</strong> ${formaLlegada}</div>
        <div><strong>Total Episodios:</strong> <strong style="color:#0284c7;">${episodios.length} ingreso(s)</strong></div>
        <div><strong>Estado en BD:</strong> <span class="badge-estado badge-si">Autenticado / Activo</span></div>
        ${camposPersonalizados}
      </div>
    </div>

    <!-- 2. ALERGIAS Y ANTECEDENTES CLÍNICOS PERMANENTES -->
    <div style="background:${esAlergico ? "#fee2e2" : "#f0fdf4"};border:2px solid ${esAlergico ? "#ef4444" : "#86efac"};border-radius:12px;padding:12px 16px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:1.2rem;">${esAlergico ? "⚠️" : "🛡️"}</span>
        <h4 style="margin:0;font-size:0.88rem;font-weight:900;color:${esAlergico ? "#991b1b" : "#166534"};text-transform:uppercase;">
          ${esAlergico ? "ALERGIAS MEDICAMENTOSAS — ALERTA MÉDICA PERMANENTE" : "ALERGIAS Y ANTECEDENTES CLÍNICOS"}
        </h4>
      </div>
      <div style="font-size:0.95rem;font-weight:900;color:${esAlergico ? "#7f1d1d" : "#14532d"};margin-top:4px;">Alergias: ${alergias}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px;font-size:0.78rem;color:#334155;margin-top:6px;">
        <div><strong>Ant. Personales/Patológicos:</strong> ${antPersonales}</div>
        <div><strong>Ant. Familiares:</strong> ${antFamiliares}</div>
        <div><strong>Medicación Habitual:</strong> ${medHabitual}</div>
      </div>
    </div>

    <!-- 3. EQUIPO ASISTENCIAL INTERVINIENTE (ENFERMERAS, MÉDICOS Y ADMISIÓN) -->
    <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:12px;padding:12px 16px;margin-bottom:14px;">
      <h4 style="margin:0 0 8px 0;font-size:0.88rem;font-weight:900;color:#0369a1;">👩‍⚕️👨‍⚕️ Equipo Asistencial Interviniente (Enfermería, Medicina y Admisión)</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;font-size:0.78rem;color:#0f172a;">
        <div style="background:#ffffff;padding:6px 10px;border-radius:6px;border:1px solid #e0f2fe;"><strong>Enfermera(o) de Triaje:</strong><br>${enfTriaje}</div>
        <div style="background:#ffffff;padding:6px 10px;border-radius:6px;border:1px solid #e0f2fe;"><strong>Enfermera(o) Asistencial / Kardex:</strong><br>${enfAsist}</div>
        <div style="background:#ffffff;padding:6px 10px;border-radius:6px;border:1px solid #e0f2fe;"><strong>Médico Tratante:</strong><br>${medTrat}</div>
        <div style="background:#ffffff;padding:6px 10px;border-radius:6px;border:1px solid #e0f2fe;"><strong>Admisión / Registro:</strong><br>${admisionista}</div>
      </div>
    </div>

    <!-- 4. RESULTADOS DE ANÁLISIS, IMÁGENES, KARDEX Y NOTAS DE ENFERMERÍA -->
    <div style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:12px;padding:12px 16px;margin-bottom:14px;">
      <h4 style="margin:0 0 8px 0;font-size:0.88rem;font-weight:900;color:#0f172a;">🔬 Análisis de Laboratorio, Imágenes, Kardex y Notas de Enfermería</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;font-size:0.78rem;color:#334155;">
        <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e2e8f0;"><strong>🧪 Resultados de Laboratorio:</strong><br>${labConsolidado}</div>
        <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e2e8f0;"><strong>🩻 Imágenes / Apoyo Diagnóstico:</strong><br>${imgConsolidado}</div>
        <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e2e8f0;"><strong>💊 Kardex Terapéutico:</strong><br>${kardexConsolidado}</div>
        <div style="background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e2e8f0;"><strong>📝 Notas de Enfermería:</strong><br>${notasEnfConsolidado}</div>
      </div>
    </div>

    <!-- 5. CONSULTAS EXTERNAS E INTERCONSULTAS -->
    <div style="margin-bottom:14px;">
      <h4 style="margin:0 0 6px 0;font-size:0.88rem;font-weight:900;color:#312e81;">🏥 Consultas Externas y Controles Ambulatorios (${consultasExt.length})</h4>
      ${htmlConsultasExt}
    </div>

    <!-- 6. HISTORIAL CRONOLÓGICO DE INGRESOS Y ATENCIONES DE EMERGENCIA -->
    <div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h4 style="margin:0;font-size:0.92rem;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:6px;">
          <span>📋</span> Histórico Cronológico de Ingresos y Emergencias (${episodios.length} episodio${episodios.length === 1 ? "" : "s"})
        </h4>
        <span style="font-size:0.75rem;color:#64748b;font-style:italic;">Cronología clínica acumulativa</span>
      </div>
      <div style="max-height:260px;overflow-y:auto;padding-right:4px;">
        ${htmlEpisodios}
      </div>
    </div>

    <!-- 7. AUDITORÍA UNIVERSAL: MODIFICAR CUALQUIER CAMPO CON TRAZABILIDAD (NOMBRE, IP, DÍA, HORA, ANTES -> DESPUÉS) -->
    <div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:12px;padding:14px 16px;">
      ${bloqueFormularioAuditor}
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.73rem;background:#ffffff;border:1px solid #fde68a;border-radius:6px;">
          <thead>
            <tr style="background:#fef3c7;color:#78350f;text-align:left;">
              <th style="padding:6px 8px;border-bottom:1px solid #fde68a;">Auditor / Persona</th>
              <th style="padding:6px 8px;border-bottom:1px solid #fde68a;">IP de la PC</th>
              <th style="padding:6px 8px;border-bottom:1px solid #fde68a;">Día</th>
              <th style="padding:6px 8px;border-bottom:1px solid #fde68a;">Hora</th>
              <th style="padding:6px 8px;border-bottom:1px solid #fde68a;">Campo</th>
              <th style="padding:6px 8px;border-bottom:1px solid #fde68a;">Valor Anterior</th>
              <th style="padding:6px 8px;border-bottom:1px solid #fde68a;">Valor Nuevo</th>
            </tr>
          </thead>
          <tbody id="hc_audit_historial_list">
            ${htmlModsAudit}
          </tbody>
        </table>
      </div>
    </div>
  `;
  // Pre-cargar IP de terminal en segundo plano
  if (typeof obtenerIPTerminalAuditor === "function") {
    obtenerIPTerminalAuditor();
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

async function obtenerIPTerminalAuditor() {
  if (window._ipClienteAuditada) return window._ipClienteAuditada;
  // 1. Intentar IP local vía WebRTC ICE candidate
  try {
    const ipLocal = await new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      let resolved = false;
      pc.createDataChannel("");
      pc.onicecandidate = (e) => {
        if (!e.candidate || resolved) return;
        const m = e.candidate.candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
        if (m && m[1]) {
          resolved = true;
          try { pc.close(); } catch (_) {}
          resolve(m[1]);
        }
      };
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => {});
      setTimeout(() => { if (!resolved) { try { pc.close(); } catch (_) {} resolve(null); } }, 450);
    });
    if (ipLocal) {
      window._ipClienteAuditada = ipLocal;
      return ipLocal;
    }
  } catch (_) {}
  // 2. Intentar IP pública si hay red (timeout corto para no bloquear offline)
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 900);
    const res = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const d = await res.json();
      if (d && d.ip) {
        window._ipClienteAuditada = d.ip;
        return d.ip;
      }
    }
  } catch (_) {}
  window._ipClienteAuditada = (window.location.hostname && window.location.hostname !== "") ? window.location.hostname : "127.0.0.1 (PC Local)";
  return window._ipClienteAuditada;
}

async function registrarModificacionAuditorHC(ident, hc, nom, seg) {
  const auditor = (document.getElementById("hc_audit_nombre_editor")?.value || "").trim();
  const campoSel = document.getElementById("hc_audit_campo")?.value || "nota_auditoria";
  const campoCustom = (document.getElementById("hc_audit_campo_custom")?.value || "").trim();
  const valor = (document.getElementById("hc_audit_valor")?.value || "").trim();
  if (!auditor) {
    alert("⚠️ Ingrese el nombre completo del auditor o responsable que realiza la modificación.");
    document.getElementById("hc_audit_nombre_editor")?.focus();
    return;
  }
  if (campoSel === "campo_personalizado" && !campoCustom) {
    alert("⚠️ Escriba el nombre del campo personalizado que desea modificar.");
    document.getElementById("hc_audit_campo_custom")?.focus();
    return;
  }
  if (!valor) {
    alert("⚠️ Ingrese el nuevo valor o detalle de la modificación.");
    document.getElementById("hc_audit_valor")?.focus();
    return;
  }
  const ip = await obtenerIPTerminalAuditor();
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = ahora.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  const master = obtenerOInicializarPacienteMaster(ident, hc, nom, seg);
  const etiquetas = {
    nombre_completo: "Nombre Completo",
    identificador: "DNI / Identificador",
    edad: "Edad",
    sexo: "Sexo",
    fecha_nacimiento: "Fecha de Nacimiento",
    direccion: "Dirección",
    telefono: "Teléfono",
    contacto_emergencia: "Contacto de Emergencia",
    tipo_seguro: "Seguro / IAFAS",
    forma_llegada: "Forma de Llegada",
    grupo_sanguineo: "Grupo Sanguíneo (GS)",
    factor_rh: "Factor Rh",
    alergias: "Alergias Medicamentosas",
    antecedentes_personales: "Antecedentes Personales",
    antecedentes_familiares: "Antecedentes Familiares",
    medicacion_habitual: "Medicación Habitual",
    enfermera_triaje: "Enfermera(o) de Triaje",
    enfermera_asistencial: "Enfermera(o) Asistencial",
    medico_tratante: "Médico Tratante",
    admisionista: "Personal de Admisión",
    resultados_laboratorio: "Resultados de Laboratorio",
    resultados_imagenes: "Resultados de Imágenes",
    kardex_medicamentos: "Kardex / Medicamentos",
    notas_enfermeria: "Notas de Enfermería",
    consulta_externa_nueva: "Consulta Externa Agregada",
    nota_auditoria: "Nota de Auditoría"
  };

  let nombreCampo = etiquetas[campoSel] || campoSel;
  let valorAnterior = "—";

  if (campoSel === "campo_personalizado") {
    nombreCampo = campoCustom;
    if (!master.campos_personalizados || typeof master.campos_personalizados !== "object") master.campos_personalizados = {};
    valorAnterior = master.campos_personalizados[campoCustom] || "—";
    master.campos_personalizados[campoCustom] = valor;
  } else if (campoSel === "consulta_externa_nueva") {
    if (!Array.isArray(master.consultas_externas)) master.consultas_externas = [];
    valorAnterior = `${master.consultas_externas.length} consulta(s)`;
    master.consultas_externas.unshift({
      fecha,
      hora,
      especialidad: "Consulta Externa / Control",
      medico: auditor,
      detalle: valor
    });
  } else if (campoSel === "sexo") {
    valorAnterior = master.sexo || "—";
    master.sexo = valor.toUpperCase().startsWith("F") ? "F" : "M";
  } else if (campoSel !== "nota_auditoria") {
    valorAnterior = master[campoSel] || "—";
    master[campoSel] = valor;
  }

  if (!Array.isArray(master.modificaciones_auditoria)) master.modificaciones_auditoria = [];
  master.modificaciones_auditoria.unshift({
    auditor,
    ip,
    fecha,
    hora,
    campo: nombreCampo,
    valor_anterior: String(valorAnterior),
    valor
  });

  const allMaster = cargarPacientesMaster();
  const key = (ident && ident !== "—" && !String(ident).startsWith("NN-")) ? String(ident).trim().toUpperCase() : String(hc).trim().toUpperCase();
  allMaster[key] = master;
  guardarPacientesMaster(allMaster);

  if (typeof registrarLogAuditoria === "function") {
    registrarLogAuditoria("Historia Clínica", "MODIFICACION_HC_AUDITOR", `${nombreCampo}: "${valorAnterior}" -> "${valor}" | Auditor: ${auditor} | IP: ${ip} | ${fecha} ${hora}`);
  }

  visualizarHistoriaClinica({
    identificador: master.identificador || ident,
    nombre_completo: master.nombre_completo || nom,
    historia_clinica: hc,
    tipo_seguro: master.tipo_seguro || seg,
    alergias: master.alergias || "Niega alergias"
  });
}
window.registrarModificacionAuditorHC = registrarModificacionAuditorHC;
function construirHTMLImpresionHistoriaClinica(pacienteEncoded) {
  let p;
  try {
    p = typeof pacienteEncoded === "string" ? JSON.parse(decodeURIComponent(pacienteEncoded)) : pacienteEncoded;
  } catch (e) {
    p = pacienteEncoded;
  }
  if (!p) return "";
  const ident = p.identificador || "—";
  const nom = p.nombre_completo || ident;
  const hc = p.historia_clinica || "—";
  const master = obtenerOInicializarPacienteMaster(ident, hc, nom, p.tipo_seguro);
  const seguro = master.tipo_seguro || p.tipo_seguro || "—";
  const alergias = master.alergias || p.alergias || "—";
  const episodios = obtenerEpisodiosDePaciente(ident, hc);
  const esAlergico = alergias && alergias !== "—" && !alergias.toLowerCase().includes("niega") && !alergias.toLowerCase().includes("ninguna");

  const pxCola = (typeof PACIENTES_COLA !== "undefined" && Array.isArray(PACIENTES_COLA))
    ? PACIENTES_COLA.find(x => (x.historiaClinica === hc || x.dni === ident || x.identificador === ident))
    : null;
  const esActivo = typeof STATE !== "undefined" && STATE && (STATE.historiaClinica === hc || STATE.numDni === ident || STATE.identificador === ident);

  const enfTriaje = master.enfermera_triaje || pxCola?.firmas?.triaje?.usuario || (esActivo && STATE.enfermeraTriaje ? STATE.enfermeraTriaje : "") || "—";
  const enfAsist = master.enfermera_asistencial || pxCola?.firmas?.enfermeria?.usuario || (esActivo && STATE.enfermeraAsistencial ? STATE.enfermeraAsistencial : "") || "—";
  const medTrat = master.medico_tratante || pxCola?.firmas?.medico?.usuario || (esActivo && STATE.medicoTratante ? STATE.medicoTratante : "") || "—";
  const admisionista = master.admisionista || pxCola?.firmas?.admision?.usuario || (esActivo && STATE.admisionista ? STATE.admisionista : "") || "—";
  const formaLlegada = master.forma_llegada || pxCola?.formaLlegada || (esActivo ? STATE.formaLlegada : "") || "—";
  const fechaNac = master.fecha_nacimiento || (esActivo ? STATE.fechaNacimiento : "") || "—";
  const grupoSang = master.grupo_sanguineo || (esActivo && STATE.grupoSanguineo ? STATE.grupoSanguineo : "") || "—";
  const factorRh = master.factor_rh || (esActivo && STATE.factorRh ? STATE.factorRh : "") || "—";
  const gsRhTxt = (grupoSang !== "—" || factorRh !== "—") ? `${grupoSang} ${factorRh !== "—" ? factorRh : ""}`.trim() : "—";
  const direccion = master.direccion || (esActivo ? STATE.direccion : "") || "—";
  const telefono = master.telefono || (esActivo ? STATE.telefono : "") || "—";
  const contactoEmerg = master.contacto_emergencia || "—";
  const antPersonales = master.antecedentes_personales || "—";
  const antFamiliares = master.antecedentes_familiares || "—";
  const medHabitual = master.medicacion_habitual || "—";

  const labConsolidado = master.resultados_laboratorio || (esActivo && Array.isArray(STATE.ordenesLaboratorio) && STATE.ordenesLaboratorio.length > 0 ? STATE.ordenesLaboratorio.map(l => `${l.nombre} (${l.resultado || l.estado || "Solicitado"})`).join(" | ") : "—");
  const imgConsolidado = master.resultados_imagenes || (esActivo && Array.isArray(STATE.ordenesImagenes) && STATE.ordenesImagenes.length > 0 ? STATE.ordenesImagenes.map(im => `${im.nombre} (${im.informe || im.estado || "Solicitado"})`).join(" | ") : "—");
  const kardexConsolidado = master.kardex_medicamentos || (esActivo && Array.isArray(STATE.kardexItems) && STATE.kardexItems.length > 0 ? STATE.kardexItems.map(k => `${k.nombre} ${k.dosis || ""} (${k.via || "EV"} · ${k.hora || "STAT"})`).join(" | ") : "—");
  const notasEnfConsolidado = master.notas_enfermeria || "—";

  const consultasExt = Array.isArray(master.consultas_externas) ? master.consultas_externas : [];
  const filasConsultasExt = consultasExt.length > 0
    ? consultasExt.map((ce, idxCe) => `
        <tr>
          <td>#${consultasExt.length - idxCe}</td>
          <td>${ce.fecha || "—"}<br><span style="font-size:10px;color:#64748b;">${ce.hora || "—"}</span></td>
          <td>${ce.especialidad || "—"}</td>
          <td>${ce.medico || "—"}</td>
          <td>${ce.detalle || "—"}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;">— (Sin atenciones en Consulta Externa)</td></tr>`;

  const camposPersonalizadosHtml = master.campos_personalizados && typeof master.campos_personalizados === "object"
    ? Object.entries(master.campos_personalizados).map(([ck, cv]) => `<div class="field"><label>${ck}</label><span>${cv}</span></div>`).join("")
    : "";

  let filasHtml = "";
  const epCurso = master.ultimo_episodio || (esActivo && STATE.historiaClinica === hc ? {
    fecha_hora_texto: new Date().toLocaleString("es-PE"),
    folio: "EN CURSO",
    prioridad: STATE.prioridad ? `P-${STATE.prioridad}` : "—",
    motivo_consulta: STATE.motivoConsulta || "—",
    cama_asignada: STATE.camaAsignada || "—",
    signos_vitales: { spo2: STATE.spo2, fc: STATE.fc, fr: STATE.fr, pa: `${STATE.pasSistolica || "—"}/${STATE.paDiastolica || "—"}`, temp: STATE.temperatura },
    tipo_seguro: seguro
  } : null);

  if (epCurso) {
    const svC = epCurso.signos_vitales || {};
    const vitalsC = `SpO2 ${svC.spo2 || "—"}% | FC ${svC.fc || "—"} | PA ${svC.pa || "—"} | T° ${svC.temp || "—"}°C`;
    filasHtml += `
      <tr style="background:#f0f9ff;">
        <td style="font-weight:800;color:#0369a1;">EN CURSO<br><code style="font-size:10px;">${epCurso.folio || hc}</code></td>
        <td>${epCurso.fecha_hora_texto || "—"}</td>
        <td style="font-weight:800;color:#0284c7;">${epCurso.prioridad || "—"}</td>
        <td>${epCurso.motivo_consulta || "—"}</td>
        <td style="font-size:11px;">${vitalsC}</td>
        <td>${epCurso.cama_asignada || "—"}</td>
        <td>—</td>
      </tr>
    `;
  }

  if (episodios.length === 0 && !epCurso) {
    filasHtml = `<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748b;">— (Sin episodios de emergencia registrados)</td></tr>`;
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
          <td>${ep.motivo_consulta || "—"}</td>
          <td style="font-size:11px;">${vitalsStr}</td>
          <td>${ep.cama_asignada || ep.destino_clinico || "—"}</td>
          <td style="font-weight:800;">${pagoStr}<br><span style="font-size:10px;color:#16a34a;">${ep.tipo_seguro || seguro}</span></td>
        </tr>
      `;
    });
  }

  const modsAudit = Array.isArray(master.modificaciones_auditoria) ? master.modificaciones_auditoria : [];
  const filasModsHtml = modsAudit.length > 0
    ? modsAudit.map(m => `
        <tr>
          <td><strong>${m.auditor}</strong></td>
          <td style="font-family:monospace;">${m.ip}</td>
          <td>${m.fecha} ${m.hora}</td>
          <td><strong>${m.campo}</strong></td>
          <td>${m.valor_anterior || "—"} → <strong>${m.valor}</strong></td>
        </tr>
      `).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Sin modificaciones de auditoría registradas.</td></tr>`;

  // Firmas electrónicas simuladas (Médico que corresponde siempre; si hubo modificación, al costado firma del Auditor)
  const nombreMedFirma = (medTrat && medTrat !== "—") ? medTrat : "Médico Tratante / Guardia Emergencia";
  const hashMed = Math.abs((hc + nombreMedFirma).split("").reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0) | 0, 0)).toString(16).toUpperCase().padStart(8, "0");
  const bloqueFirmaMedico = `
    <div id="firma_electronica_medico_hc" style="width:270px; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; background:#f8fafc; text-align:center;">
      <svg width="180" height="42" viewBox="0 0 190 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 14 38 C 24 8, 40 44, 54 14 C 66 2, 80 36, 94 12 C 106 2, 118 30, 132 10 C 144 4, 160 26, 174 8 M 28 42 C 75 45, 125 40, 182 32" stroke="#0f2b5c" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
      <div style="border-top:1.5px solid #0f2b5c; padding-top:5px; font-size:0.78rem; font-weight:800; color:#0f172a;">${nombreMedFirma}</div>
      <div style="font-size:0.68rem; color:#475569;">Médico Responsable · Colegio Médico del Perú</div>
      <div style="font-size:0.64rem; color:#0369a1; font-family:monospace; margin-top:3px;">FIRMA ELECTRÓNICA SIMULADA · PKI-${hashMed}</div>
    </div>
  `;

  let bloqueFirmaAuditor = "";
  if (modsAudit.length > 0) {
    const ultMod = modsAudit[0];
    const hashAud = Math.abs((hc + ultMod.auditor + ultMod.fecha + ultMod.hora).split("").reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0) | 0, 0)).toString(16).toUpperCase().padStart(8, "0");
    bloqueFirmaAuditor = `
      <div id="firma_electronica_auditor_hc" style="width:270px; border:1.5px solid #fcd34d; border-radius:8px; padding:10px 12px; background:#fffbeb; text-align:center;">
        <svg width="180" height="42" viewBox="0 0 190 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 18 34 C 36 6, 48 40, 68 16 C 84 6, 96 36, 118 12 C 134 4, 150 28, 172 14 M 22 40 C 70 38, 130 42, 176 36" stroke="#b45309" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
        <div style="border-top:1.5px solid #b45309; padding-top:5px; font-size:0.78rem; font-weight:800; color:#78350f;">${ultMod.auditor}</div>
        <div style="font-size:0.68rem; color:#92400e;">Auditor Médico / Verificador · IP: ${ultMod.ip}</div>
        <div style="font-size:0.64rem; color:#b45309; font-family:monospace; margin-top:3px;">FIRMA ELECTRÓNICA AUDITOR · ${ultMod.fecha} ${ultMod.hora} · PKI-${hashAud}</div>
      </div>
    `;
  }

  return `
    <html><head><title>Historia Clínica Integral — ${hc}</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; padding: 24px; max-width: 960px; margin: auto; color: #0f172a; line-height: 1.42; font-size: 11.5px; }
      .header-hc { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #0284c7; padding-bottom: 10px; margin-bottom: 14px; }
      .inst-info h2 { margin: 0; font-size: 1.15rem; color: #0f172a; font-weight: 900; }
      .inst-info p { margin: 2px 0 0; font-size: 0.76rem; color: #64748b; font-weight: 600; }
      .hc-badge { border: 2px solid #0284c7; background: #e0f2fe; color: #0369a1; padding: 6px 14px; border-radius: 8px; font-size: 1.05rem; font-weight: 900; text-align: center; font-family: monospace; }
      .section-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
      .section-title { font-size: 0.78rem; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
      .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .field label { font-size: 0.68rem; color: #64748b; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px; }
      .field span { font-size: 0.82rem; font-weight: 700; color: #0f172a; }
      .alergia-alert { background: ${esAlergico ? "#fee2e2" : "#f0fdf4"}; border: 2px solid ${esAlergico ? "#ef4444" : "#86efac"}; border-radius: 8px; padding: 9px 12px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10.5px; }
      th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; vertical-align: top; }
      th { background: #f8fafc; font-weight: 800; color: #334155; }
      .firma-box { margin-top: 28px; display: flex; justify-content: center; gap: 36px; flex-wrap: wrap; }
    </style></head>
    <body>
      <div class="header-hc">
        <div class="inst-info">
          <h2>UNIVERSIDAD POLITÉCNICA DEL PERÚ — FCS</h2>
          <p>Departamento de Emergencia y Cuidados Críticos · Hospital Docente UPP</p>
          <p style="color:#0284c7;font-weight:700;">HISTORIA CLÍNICA INTEGRAL (NTS N° 139-MINSA / HL7 FHIR / ISO 13606)</p>
        </div>
        <div>
          <div class="hc-badge">${hc}</div>
          <div style="font-size:0.7rem;text-align:center;color:#64748b;margin-top:3px;">FECHA IMPRESIÓN: ${new Date().toLocaleString("es-PE")}</div>
        </div>
      </div>
      <div class="section-box">
        <div class="section-title">I. Filiación Completa y Datos Administrativos</div>
        <div class="grid-4">
          <div class="field"><label>Apellidos y Nombres</label><span>${master.nombre_completo || nom}</span></div>
          <div class="field"><label>DNI / Identificador</label><span>${master.identificador || ident}</span></div>
          <div class="field"><label>Edad / Sexo</label><span>${master.edad ? `${master.edad} años` : "—"} (${master.sexo || "—"})</span></div>
          <div class="field"><label>Seguro / IAFAS</label><span>${seguro}</span></div>
          <div class="field"><label>Grupo Sanguíneo / Rh</label><span>${gsRhTxt}</span></div>
          <div class="field"><label>Fecha de Nacimiento</label><span>${fechaNac}</span></div>
          <div class="field"><label>Teléfono</label><span>${telefono}</span></div>
          <div class="field"><label>Dirección</label><span>${direccion}</span></div>
          <div class="field"><label>Contacto Emergencia</label><span>${contactoEmerg}</span></div>
          <div class="field"><label>Forma de Llegada</label><span>${formaLlegada}</span></div>
          ${camposPersonalizadosHtml}
        </div>
      </div>
      <div class="alergia-alert">
        <div style="font-size:0.78rem;font-weight:900;color:${esAlergico ? "#991b1b" : "#166534"};text-transform:uppercase;">
          II. Alergias y Antecedentes Clínicos
        </div>
        <div style="font-size:0.9rem;font-weight:900;color:${esAlergico ? "#7f1d1d" : "#14532d"};margin-top:2px;">Alergias: ${alergias}</div>
        <div class="grid-2" style="margin-top:4px;font-size:0.76rem;">
          <div><strong>Ant. Personales:</strong> ${antPersonales}</div>
          <div><strong>Ant. Familiares:</strong> ${antFamiliares}</div>
          <div><strong>Medicación Habitual:</strong> ${medHabitual}</div>
        </div>
      </div>
      <div class="section-box">
        <div class="section-title">III. Equipo Asistencial Interviniente</div>
        <div class="grid-4">
          <div class="field"><label>Enfermera(o) de Triaje</label><span>${enfTriaje}</span></div>
          <div class="field"><label>Enfermera(o) Asistencial</label><span>${enfAsist}</span></div>
          <div class="field"><label>Médico Tratante</label><span>${medTrat}</span></div>
          <div class="field"><label>Personal de Admisión</label><span>${admisionista}</span></div>
        </div>
      </div>
      <div class="section-box">
        <div class="section-title">IV. Análisis de Laboratorio, Imágenes, Kardex y Notas de Enfermería</div>
        <div class="grid-2">
          <div class="field"><label>Resultados de Laboratorio</label><span>${labConsolidado}</span></div>
          <div class="field"><label>Imágenes / Apoyo Diagnóstico</label><span>${imgConsolidado}</span></div>
          <div class="field"><label>Kardex Terapéutico</label><span>${kardexConsolidado}</span></div>
          <div class="field"><label>Notas de Enfermería</label><span>${notasEnfConsolidado}</span></div>
        </div>
      </div>
      <div class="section-box">
        <div class="section-title">V. Consultas Externas y Controles Ambulatorios (${consultasExt.length})</div>
        <table>
          <thead><tr><th>#</th><th>Fecha / Hora</th><th>Especialidad</th><th>Médico</th><th>Detalle / CIE-10</th></tr></thead>
          <tbody>${filasConsultasExt}</tbody>
        </table>
      </div>
      <div class="section-box">
        <div class="section-title">VI. Registro Histórico de Ingresos y Atenciones de Emergencia (${episodios.length})</div>
        <table>
          <thead><tr><th>Episodio</th><th>Fecha / Hora</th><th>Prioridad</th><th>Motivo</th><th>Signos Vitales</th><th>Cama / Destino</th><th>Liquidación</th></tr></thead>
          <tbody>${filasHtml}</tbody>
        </table>
      </div>
      <div class="section-box">
        <div class="section-title">VII. Bitácora de Modificaciones Auditadas (${modsAudit.length})</div>
        <table>
          <thead><tr><th>Auditor</th><th>IP PC</th><th>Día / Hora</th><th>Campo</th><th>Cambio Realizado</th></tr></thead>
          <tbody>${filasModsHtml}</tbody>
        </table>
      </div>
      <div class="firma-box">
        ${bloqueFirmaMedico}
        ${bloqueFirmaAuditor}
      </div>
    </body></html>
  `;
}
window.construirHTMLImpresionHistoriaClinica = construirHTMLImpresionHistoriaClinica;

function imprimirFichaHistoriaClinica(pacienteEncoded) {
  const printHtml = construirHTMLImpresionHistoriaClinica(pacienteEncoded);
  if (!printHtml) return;
  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir la Historia Clínica."); return; }
  w.document.write(printHtml);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 200);
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
  "I": { 
    ctasNivel: 1,
      nivel: 1,
    ctasNombre: "Reanimación (Resuscitation)",
    nombre: "Prioridad I — Reanimación (Rojo)", 
    color: "I", 
    hex: "#dc2626", 
    destino: "Trauma Shock / Reanimación", 
    sla: "Inmediato · 0 min",
    reevaluacion: "Continua",
    clase: "pnum-I" 
  },
  "II": { 
    ctasNivel: 2,
      nivel: 2,
    ctasNombre: "Emergencia (Emergency)",
    nombre: "Prioridad II — Emergencia (Naranja)", 
    color: "II", 
    hex: "#ea580c", 
    destino: "Cola Priorizada / Tópico de Evaluación Médica", 
    sla: "≤ 10–15 min",
    reevaluacion: "Cada 15 min",
    clase: "pnum-II" 
  },
  "III": { 
    ctasNivel: 3,
      nivel: 3,
    ctasNombre: "Urgente (Urgent)",
    nombre: "Prioridad III — Urgente (Amarillo)", 
    color: "III", 
    hex: "#ca8a04", 
    destino: "Cola Priorizada / Tópico de Evaluación Médica", 
    sla: "≤ 30 min",
    reevaluacion: "Cada 30 min",
    clase: "pnum-III" 
  },
  "IV": { 
    ctasNivel: 4,
      nivel: 4,
    ctasNombre: "Menos Urgente (Less Urgent)",
    nombre: "Prioridad IV — Menos Urgente (Verde)", 
    color: "IV", 
    hex: "#16a34a", 
    destino: "Cola Priorizada / Tópico de Evaluación Médica", 
    sla: "≤ 60 min",
    reevaluacion: "Cada 60 min",
    clase: "pnum-IV" 
  },
  "V": { 
    ctasNivel: 5,
      nivel: 5,
    ctasNombre: "No Urgente (Non Urgent)",
    nombre: "Prioridad V — No Urgente / Consulta (Azul)", 
    color: "V", 
    hex: "#2563eb", 
    destino: "Cola Priorizada / Consulta Externa", 
    sla: "≤ 120 min",
    reevaluacion: "Cada 120 min",
    clase: "pnum-V" 
  },
};
window.PRIORIDADES = PRIORIDADES;


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
    if (!isNaN(num) && num >= 1 && num <= 8) {
      const btnTop = document.getElementById(`btnStepTop_${num}`);
      if (btnTop) btnTop.classList.remove("active");
    }
  } else {
    body.classList.add("open");
    body.style.display = "block";
    if (arrow) arrow.classList.add("open");
    if (!isNaN(num) && num >= 1 && num <= 8) {
      for (let i = 1; i <= 8; i++) {
        const btnTop = document.getElementById(`btnStepTop_${i}`);
        if (btnTop) btnTop.classList.toggle("active", i === num);
      }
      if (num === 4 && typeof actualizarTarjetaResumenMedico === "function") {
        actualizarTarjetaResumenMedico();
      }
    }
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
    const btnTop = document.getElementById(`btnStepTop_${i}`);
    if (btnTop) btnTop.classList.remove("active");
  }
}
window.cerrarTodosLosModulos = cerrarTodosLosModulos;

function resetearModificadoresYSubsecciones() {
  const boxMod2do = document.getElementById("box_modificadores_segundo_orden");
  if (boxMod2do) boxMod2do.style.display = "none";
  const iconMod2do = document.getElementById("icon_mod2do");
  if (iconMod2do) iconMod2do.textContent = "➕";

  const elGluc = document.getElementById("glucosa_full");
  if (elGluc) {
    elGluc.value = "";
    elGluc.classList.remove("is-invalid", "input-critical-alert");
  }
  const tipGluc = document.getElementById("tooltip_glucosa");
  if (tipGluc) tipGluc.classList.remove("visible");

  const chkPed = document.getElementById("check_pediatrico");
  if (chkPed) chkPed.checked = false;
  const boxPed = document.getElementById("box_pediatrico_detalles") || document.getElementById("campos_pediatrico");
  if (boxPed) boxPed.style.display = "none";
  ["apariencia", "respiracion", "circulacion"].forEach(lado => {
    const chkTep = document.getElementById(`chk_tep_${lado}`);
    if (chkTep) chkTep.checked = false;
    const cardTep = document.getElementById(`card_tep_${lado}`);
    if (cardTep) cardTep.classList.remove("checked");
  });
  const selGrupoPed = document.getElementById("sel_grupo_pediatrico");
  if (selGrupoPed) selGrupoPed.value = "escolar";

  const chkGest = document.getElementById("check_gestante");
  if (chkGest) chkGest.checked = false;
  const boxGest = document.getElementById("box_gestante") || document.getElementById("campos_gestante");
  if (boxGest) boxGest.style.display = "none";
  const semGest = document.getElementById("sem_gestacion");
  if (semGest) semGest.value = "";
  const lcfGest = document.getElementById("lcf_gestacion");
  if (lcfGest) lcfGest.value = "";
  const claveObs = document.getElementById("clave_obstetrica_sel");
  if (claveObs) claveObs.value = "ninguna";

  ["infarto", "ictus", "sepsis"].forEach(cod => {
    const chk = document.getElementById(`check_cod_${cod}`);
    if (chk) chk.checked = false;
    const card = document.getElementById(`card_cod_${cod}`);
    if (card) card.classList.remove("checked");
  });

  const btnGluc = document.getElementById("btn_toggle_mod_glucosa");
  if (btnGluc) btnGluc.classList.remove("active");
  const btnPed = document.getElementById("btn_toggle_mod_pediatrico");
  if (btnPed) btnPed.classList.remove("active");
  const btnGest = document.getElementById("btn_toggle_mod_gestante");
  if (btnGest) btnGest.classList.remove("active");
}
window.resetearModificadoresYSubsecciones = resetearModificadoresYSubsecciones;


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


async function consultarReniec(dniParam) {
  const inputEl = document.getElementById("ident_full");
  let rawInput = (typeof dniParam === "string" && dniParam) ? dniParam.trim() : (inputEl ? inputEl.value.trim() : "");
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

  // Extraer 8 dígitos continuos (desde input principal, Módulo 1 o STATE)
  let ident = null;
  const dniMatch = rawInput.replace(/[\s\.\-]/g, "").match(/\d{8}/);
  if (dniMatch) {
    ident = dniMatch[0];
  } else {
    // 1. Buscar si se ingresó en Módulo 1 (dni_mod1)
    const elDni1 = document.getElementById("dni_mod1");
    const m1Match = elDni1 ? elDni1.value.replace(/[\s\.\-]/g, "").match(/\d{8}/) : null;
    if (m1Match) {
      ident = m1Match[0];
      if (inputEl) inputEl.value = ident;
    } else if (STATE.numDni && /^\d{8}$/.test(String(STATE.numDni).trim())) {
      // 2. Buscar si STATE.numDni ya contiene los 8 dígitos
      ident = String(STATE.numDni).trim();
      if (inputEl) inputEl.value = ident;
      if (elDni1 && !elDni1.value) elDni1.value = ident;
    } else {
      // 3. Si tiene ticket o está en blanco, solicitar DNI al usuario mediante prompt interactivo
      const dniPrompt = prompt("Ingrese el número de DNI de 8 dígitos para consultar en RENIEC:", "");
      if (dniPrompt) {
        const pMatch = dniPrompt.replace(/[\s\.\-]/g, "").match(/\d{8}/);
        if (pMatch) {
          ident = pMatch[0];
          if (inputEl) inputEl.value = ident;
          if (elDni1) elDni1.value = ident;
        }
      }
    }
  }

  if (!ident) {
    if (panel) {
      panel.style.display = "block";
      panel.innerHTML = `<div class="apisperu-title">⚠️ Por favor ingrese un número de DNI de 8 dígitos en la casilla.</div>`;
      panel.classList.add("visible");
    }
    alert("⚠️ Ingrese un número de DNI de 8 dígitos numéricos para consultar en RENIEC.");
    return;
  }

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

  // 1. Actualizar STATE (Garantizar salida de estado NN)
  STATE.esNN = false;
  STATE.esNNConsciente = false;
  STATE.esNNInconsciente = false;
  STATE.numDni = ident;
  STATE.nombreReniec = nombreCompleto;
  STATE.identificador = `${nombreCompleto} (DNI ${ident})`;
  STATE.sexo = sexoDetectado;

  // Derivar y asegurar edad demográfica
  const inputEdad = document.getElementById("edad_full");
  const inputFecha = document.getElementById("fecha_nac_full");
  const demoReniec = (typeof generarDatosDemograficosCoherentes === "function")
    ? generarDatosDemograficosCoherentes(ident, inputEdad?.value, inputFecha?.value)
    : { edad: 35, fechaNacimiento: "1991-05-15", grupoSanguineo: "O+" };

  if (inputEdad && (!inputEdad.value || inputEdad.value === "")) inputEdad.value = demoReniec.edad;
  if (inputFecha && (!inputFecha.value || inputFecha.value === "")) inputFecha.value = demoReniec.fechaNacimiento;
  STATE.edad = inputEdad && inputEdad.value ? parseInt(inputEdad.value, 10) : demoReniec.edad;
  STATE.fechaNacimiento = inputFecha && inputFecha.value ? inputFecha.value : demoReniec.fechaNacimiento;

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

  // 6. Consultar seguro persistido en Base de Datos (Memoria DNI inmutable)
  try {
    const seguroGuardado = await buscarSeguroPacienteEnBd(ident);
    if (seguroGuardado && seguroGuardado !== "null" && seguroGuardado !== "undefined" && seguroGuardado !== "Seguro por confirmar") {
      console.log(`🧠 Memoria Base de Datos: DNI ${ident} recuperó seguro guardado:`, seguroGuardado);
      aplicarSeleccionSeguroYEntorno(seguroGuardado, false, true);
    } else if (STATE.tipoSeguro) {
      guardarSeguroPacienteEnBd(ident, STATE.historiaClinica, nombreCompleto, STATE.tipoSeguro);
      guardarConsultaPreviaDni(ident, { tipo_seguro: STATE.tipoSeguro, nombre: nombreCompleto, historiaClinica: STATE.historiaClinica });
    }
  } catch(eSeg) {
    console.warn("Aviso recuperar seguro guardado:", eSeg);
  }

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


function registrarSIS(valorParam) {
  const el = document.getElementById("estado_sis");
  const val = valorParam || (el ? el.value : "") || "Activo / Gratuito";
  if (!val) return;
  STATE.tipoSeguro = "SIS";
  const resEl = document.getElementById("resultado_sis");
  if (resEl) {
    resEl.innerHTML = `
      <strong>SIS — ${val}</strong> <span class="seguro-badge seguro-badge-sis">✓</span>
    `;
  }
  if (typeof actualizarSeguroConsolidado === "function") actualizarSeguroConsolidado("SIS — " + val);
  if (typeof registrarTimestamp === "function") registrarTimestamp("M2_sis");
  const numDni = STATE.numDni || (STATE.identificador ? String(STATE.identificador).match(/\d{8}/)?.[0] : null);
  if (numDni && typeof guardarConsultaPreviaDni === "function") {
    guardarConsultaPreviaDni(numDni, { tipo_seguro: "SIS", nombre: STATE.nombreReniec, historiaClinica: STATE.historiaClinica });
  }
}


function actualizarFUA() {
  const el = document.getElementById("fua_sis");
  STATE.numerFua = el ? el.value.trim() : "";
}


function registrarEsSalud(valorParam) {
  const el = document.getElementById("estado_essalud");
  const val = valorParam || (el ? el.value : "") || "Acreditado Activo";
  if (!val) return;
  STATE.tipoSeguro = "EsSalud";
  STATE.acreditadoEsSalud = (val === "Acreditado Activo");
  const resEl = document.getElementById("resultado_essalud");
  if (resEl) {
    resEl.innerHTML = `
      <strong>EsSalud — ${val}</strong> <span class="seguro-badge seguro-badge-essalud">✓</span>
    `;
  }
  if (typeof actualizarSeguroConsolidado === "function") actualizarSeguroConsolidado("EsSalud — " + val);
  if (typeof registrarTimestamp === "function") registrarTimestamp("M2_essalud");
  const numDni = STATE.numDni || (STATE.identificador ? String(STATE.identificador).match(/\d{8}/)?.[0] : null);
  if (numDni && typeof guardarConsultaPreviaDni === "function") {
    guardarConsultaPreviaDni(numDni, { tipo_seguro: "EsSalud", nombre: STATE.nombreReniec, historiaClinica: STATE.historiaClinica });
  }
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

    // Detección ergonómica matemática de entrada en proceso de digitación para TODOS los indicadores (Glasgow '1', Glucosa '6', Temp '3', etc.)
    const esCampoActivo = (typeof document !== "undefined" && document.activeElement === el);
    let esPrefijoIncompleto = false;
    if (esCampoActivo && val > 0 && val < def.min && val <= def.max) {
      const rawClean = raw.replace(".", "");
      const maxDigitos = String(Math.floor(def.max)).length;
      if (rawClean.length < maxDigitos) {
        const menorFuturo = val * 10;
        const mayorFuturo = (val * 10) + 9.99;
        if (menorFuturo <= def.max && mayorFuturo >= def.min) {
          esPrefijoIncompleto = true;
        }
      }
    }

    // Nivel 1: Error de digitación física (solo bloquea si supera max o si el valor completado no es un prefijo válido y es < min)
    if (val > def.max || (!esPrefijoIncompleto && val < def.min)) {
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
      // Si el usuario está tecleando activamente en PAS y aún no completa los 3 dígitos (ej: escribió '1' o '12' mientras PAD es '80'):
      const esPasEnDigitacion = (typeof document !== "undefined" && document.activeElement === elPas && String(pas).length < 3 && pas < pad);
      if (!esPasEnDigitacion && pad >= pas) {
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
  const pContent = document.getElementById("prio_display_content");
  const pError = document.getElementById("prio_display_error");
  const pLista = document.getElementById("prio_error_lista");

  pd.style.display = "block";
  pd.style.background = "#fee2e2";
  pd.style.borderColor = "#dc2626";
  pd.style.borderWidth = "2px";

  if (pContent && pError && pLista) {
    pContent.style.display = "none";
    pError.style.display = "block";
    pLista.innerHTML = errores.map(e => `<li>${e}</li>`).join("");
  } else {
    pd.innerHTML = `
      <div id="prio_display_error" style="color:#7f1d1d;text-align:left;">
        <div style="color:#991b1b;font-weight:800;font-size:15px;margin-bottom:6px;">
          ⛔ EVALUACIÓN BLOQUEADA: DIGITACIÓN BIOLÓGICAMENTE IMPOSIBLE
        </div>
        <div style="font-size:12.5px;">
          Corrija los campos señalados en rojo para habilitar el algoritmo de Triaje:
          <ul id="prio_error_lista" style="margin:4px 0 0 16px;font-weight:600;">
            ${errores.map(e => `<li>${e}</li>`).join("")}
          </ul>
        </div>
      </div>
    `;
  }
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
 * ===========================================================================
 * BLOQUE 1 & 2: MOTOR OFICIAL CTAS / PaedCTAS (CANADÁ) + NTS N° 042-MINSA
 * Mapeo Oficial CTAS -> Perú (NTS N° 042-MINSA):
 *  CTAS 1 (Reanimación)  -> Prioridad I   (Rojo):     0 min · Reevaluación continua
 *  CTAS 2 (Emergencia)    -> Prioridad II  (Naranja):  ≤ 10–15 min · Reevaluación cada 15 min
 *  CTAS 3 (Urgente)       -> Prioridad III (Amarillo): ≤ 30 min · Reevaluación cada 30 min
 *  CTAS 4 (Menos Urgente) -> Prioridad IV  (Verde):    ≤ 60 min · Reevaluación cada 60 min
 *  CTAS 5 (No Urgente)    -> Prioridad V   (Azul):     ≤ 120 min · Reevaluación cada 120 min
 * ===========================================================================
 */

function calcularCTAS(params = {}) {
  const fr = params.fr ?? null;
  const spo2 = params.spo2 ?? null;
  const pas = params.pas ?? null;
  const pad = params.pad ?? null;
  const fc = params.fc ?? null;
  const glasgow = params.glasgow ?? null;
  const temp = params.temp ?? null;
  const eva = params.eva ?? null;
  const glucosa = params.glucosa ?? null;
  const esPediatrico = Boolean(params.esPediatrico);
  const grupoEtarioPediatrico = params.grupoEtarioPediatrico || params.grupoPediatrico || "escolar"; // neonato, lactante, preescolar, escolar
  const edad = typeof params.edad === "number" ? params.edad : 30;
  const tepApariencia = Boolean(params.tepApariencia || (params.tepLadosAlterados >= 1));
  const tepRespiracion = Boolean(params.tepRespiracion || (params.tepLadosAlterados >= 2));
  const tepCirculacion = Boolean(params.tepCirculacion || (params.tepLadosAlterados >= 3));
  const esGestante = Boolean(params.esGestante);
  const claveObst = params.claveObstetrica || null;
  const motivoCedis = params.motivoCedis || "";
  const esIngresoCritico = Boolean(params.ingresoDirectoCritico || params.panicoShockTrauma || (typeof STATE !== "undefined" && STATE.ingresoDirectoCritico));
  const motivoCritico = params.motivoIngresoCritico || (typeof STATE !== "undefined" && STATE.motivoIngresoCritico) || "Activación directa de Trauma Shock / Riesgo Vital Inmediato — Ley N° 27604";

  const todosVitalesVacios = (fr === null && spo2 === null && pas === null && pad === null && fc === null && glasgow === null && temp === null);

  // 1. Ingreso Directo Crítico (Ley N° 27604)
  if (esIngresoCritico) {
    const textoMotivo = todosVitalesVacios 
      ? "CTAS 1 · Prioridad I — Monitorización pendiente (Ingreso Directo Ley N° 27604)" 
      : motivoCritico;
    return {
      ctasNivel: 1,
      nivel: 1,
      ctasNombre: "Reanimación (Resuscitation)",
      prioridad: "I",
      colorHex: "#dc2626",
      slaNormativo: "Inmediato · 0 min (Reevaluación continua)",
      reevaluacion: "Continua",
      zonaInicial: "Trauma Shock / Reanimación",
      motivos: [textoMotivo],
      resumenClinico: "Riesgo vital inminente. Destino: Unidad de Shock Trauma / Reanimación.",
      scoreNews2Mock: 7
    };
  }

  const desglose = [];

  // =========================================================================
  // EVALUACIÓN PEDIÁTRICA TEP (< 14 AÑOS — PaedCTAS)
  // =========================================================================
  let ladosTepAlterados = 0;
  if (esPediatrico) {
    if (tepApariencia) { ladosTepAlterados++; desglose.push("TEP: Apariencia alterada"); }
    if (tepRespiracion) { ladosTepAlterados++; desglose.push("TEP: Dificultad respiratoria alterada"); }
    if (tepCirculacion) { ladosTepAlterados++; desglose.push("TEP: Circulación cutánea alterada"); }
  }

  // =========================================================================
  // CRITERIOS CTAS 1 — PRIORIDAD I (ROJO) · SLA: 0 min · Reevaluación continua
  // =========================================================================
  const motivos1 = [];

  if (ladosTepAlterados >= 2) {
    motivos1.push(`PaedCTAS 1: Fallo cardiopulmonar pediátrico (≥ 2 lados TEP alterados: ${ladosTepAlterados}/3)`);
  }
  if (glasgow !== null && glasgow <= 9) {
    motivos1.push(`Glasgow ≤ 9 (${glasgow}/15 — Coma / Vía aérea en riesgo inminente)`);
  }
  if (spo2 !== null && spo2 < 90) {
    motivos1.push(`Hipoxemia severa crítica SpO2 < 90% (${spo2}%)`);
  }
  if (!esPediatrico && pas !== null && pas < 90) {
    motivos1.push(`Hipotensión arterial severa / Shock PAS < 90 mmHg (${pas} mmHg)`);
  }
  if (esPediatrico && pas !== null) {
    let pasCritica = 70;
    if (grupoEtarioPediatrico === "neonato") pasCritica = 60;
    else if (grupoEtarioPediatrico === "lactante") pasCritica = 70;
    else if (grupoEtarioPediatrico === "preescolar") pasCritica = 75;
    else if (grupoEtarioPediatrico === "escolar") pasCritica = (edad >= 10) ? 90 : 85;
    if (pas < pasCritica) {
      motivos1.push(`PaedCTAS 1: Hipotensión crítica pediátrica PAS < ${pasCritica} mmHg (${pas} mmHg)`);
    }
  }
  if (fc !== null) {
    if (!esPediatrico) {
      if (fc < 40 || fc > 140) {
        motivos1.push(`Frecuencia cardíaca extrema inestable FC ${fc} lpm (< 40 o > 140)`);
      }
    } else {
      if (grupoEtarioPediatrico === "neonato") {
        if (fc < 80 || fc > 200) motivos1.push(`FC extrema neonatal FC ${fc} lpm (< 80 o > 200)`);
      } else if (grupoEtarioPediatrico === "lactante") {
        if (fc < 70 || fc > 190) motivos1.push(`FC extrema lactante FC ${fc} lpm (< 70 o > 190)`);
      } else if (grupoEtarioPediatrico === "preescolar") {
        if (fc < 50 || fc > 180) motivos1.push(`FC crítica preescolar FC ${fc} lpm (< 50 o > 180)`);
      } else {
        if (fc < 50 || fc > 180) motivos1.push(`FC crítica escolar FC ${fc} lpm (< 50 o > 180)`);
      }
    }
  }
  if (fr !== null) {
    if (!esPediatrico) {
      if (fr < 8 || fr > 30) motivos1.push(`Frecuencia respiratoria extrema FR ${fr} rpm (< 8 o > 30)`);
    } else {
      if (grupoEtarioPediatrico === "neonato") {
        if (fr < 20 || fr > 70) motivos1.push(`FR extrema neonatal FR ${fr} rpm (< 20 o > 70)`);
      } else if (grupoEtarioPediatrico === "lactante") {
        if (fr < 15 || fr > 65) motivos1.push(`FR extrema lactante FR ${fr} rpm (< 15 o > 65)`);
      } else if (grupoEtarioPediatrico === "preescolar") {
        if (fr < 10 || fr > 60) motivos1.push(`FR extrema preescolar FR ${fr} rpm (< 10 o > 60)`);
      } else {
        if (fr < 10 || fr > 60) motivos1.push(`FR extrema escolar FR ${fr} rpm (< 10 o > 60)`);
      }
    }
  }
  if (temp !== null && (temp < 35.0 || temp >= 41.0)) {
    motivos1.push(`Temperatura extrema crítica ${temp} °C (< 35.0 o ≥ 41.0 °C con riesgo neurológico)`);
  }
  if (glucosa !== null && glucosa < 54 && (glasgow !== null && glasgow <= 13)) {
    motivos1.push(`Hipoglucemia severa sintomática con compromiso neurológico < 54 mg/dL (${glucosa} mg/dL)`);
  }
  if (glucosa !== null && glucosa > 600 && (glasgow !== null && glasgow <= 13)) {
    motivos1.push(`Hiperglucemia extrema con alteración de conciencia > 600 mg/dL (${glucosa} mg/dL)`);
  }
  if (claveObst === "roja" || claveObst === "azul") {
    motivos1.push(`Clave Obstétrica Crítica MINSA: Clave ${claveObst.toUpperCase()} (Hemorragia / Eclampsia)`);
  }

  if (motivos1.length > 0) {
    return {
      ctasNivel: 1,
      nivel: 1,
      ctasNombre: "Reanimación (Resuscitation)",
      prioridad: "I",
      colorHex: "#dc2626",
      slaNormativo: "Inmediato · 0 min (Reevaluación continua)",
      reevaluacion: "Continua",
      zonaInicial: "Trauma Shock / Reanimación",
      motivos: motivos1,
      resumenClinico: "Riesgo vital inminente. Destino: Unidad de Shock Trauma / Reanimación.",
      scoreNews2Mock: 7
    };
  }

  // =========================================================================
  // CRITERIOS CTAS 2 — PRIORIDAD II (NARANJA) · SLA: ≤ 10–15 min · Reeval. 15 min
  // =========================================================================
  const motivos2 = [];

  if (ladosTepAlterados === 1) {
    motivos2.push("PaedCTAS 2: 1 lado del Triángulo de Evaluación Pediátrica alterado");
  }
  if (glasgow !== null && glasgow >= 10 && glasgow <= 13) {
    motivos2.push(`Glasgow 10–13 (${glasgow}/15 — Depresión neurológica aguda)`);
  }
  if (spo2 !== null && spo2 >= 90 && spo2 <= 91) {
    motivos2.push(`SpO2 90–91% (${spo2}% — Hipoxemia moderada-severa)`);
  }
  if (fr !== null && !esPediatrico && ((fr >= 9 && fr <= 11) || (fr >= 25 && fr <= 30))) {
    motivos2.push(`FR alterada severa FR ${fr} rpm (9–11 o 25–30 rpm)`);
  }
  if (fc !== null) {
    if (!esPediatrico) {
      if ((fc < 50 && fc >= 40) || (fc > 120 && fc <= 140)) {
        motivos2.push(`FC alterada severa FC ${fc} lpm (< 50 o 121–140 lpm)`);
      }
    } else {
      // PaedCTAS: FC alterada a 2 DE según edad
      if (grupoEtarioPediatrico === "neonato" && (fc < 100 || fc > 180)) {
        motivos2.push(`PaedCTAS 2: FC alterada neonatal ${fc} lpm (Normal: 100–180)`);
      } else if (grupoEtarioPediatrico === "lactante" && (fc < 90 || fc > 160)) {
        motivos2.push(`PaedCTAS 2: FC alterada lactante ${fc} lpm (Normal: 100–160)`);
      } else if (grupoEtarioPediatrico === "preescolar" && (fc < 70 || fc > 140)) {
        motivos2.push(`PaedCTAS 2: FC alterada preescolar ${fc} lpm (Normal: 80–140)`);
      } else if (grupoEtarioPediatrico === "escolar" && (fc < 60 || fc > 120)) {
        motivos2.push(`PaedCTAS 2: FC alterada escolar ${fc} lpm (Normal: 70–120)`);
      }
    }
  }

  if (fr !== null && esPediatrico) {
    if (grupoEtarioPediatrico === "neonato" && (fr < 25 || fr > 60)) motivos2.push(`PaedCTAS 2: FR alterada neonatal ${fr} rpm`);
    else if (grupoEtarioPediatrico === "lactante" && (fr < 25 || fr > 53)) motivos2.push(`PaedCTAS 2: FR alterada lactante ${fr} rpm`);
    else if (grupoEtarioPediatrico === "preescolar" && (fr < 18 || fr > 37)) motivos2.push(`PaedCTAS 2: FR alterada preescolar ${fr} rpm`);
    else if (grupoEtarioPediatrico === "escolar" && (fr < 14 || fr > 30)) motivos2.push(`PaedCTAS 2: FR alterada escolar ${fr} rpm`);
  }
  if (pas !== null && pad !== null && !esPediatrico && (pas >= 180 || pad >= 120)) {
    motivos2.push(`Crisis Hipertensiva PA ${pas}/${pad} mmHg`);
  }
  if (pas !== null && !esPediatrico && pas >= 90 && pas <= 99) {
    motivos2.push(`Hipotensión arterial limítrofe PAS ${pas} mmHg (90–99 mmHg)`);
  }
  if (temp !== null && (temp >= 39.5 || (temp >= 38.0 && (params.codigoSepsis || (esPediatrico && grupoEtarioPediatrico === "neonato"))))) {
    motivos2.push(`Fiebre alta / Riesgo séptico Temp ${temp} °C`);
  }
  if (eva !== null && eva >= 8) {
    motivos2.push(`Dolor severo agudo EVA ${eva}/10 (CTAS 2)`);
  }
  if (glucosa !== null && (glucosa < 54 || glucosa >= 500 || (glucosa >= 250 && glucosa <= 324 && (fr !== null && fr >= 22)))) {
    motivos2.push(`Desbalance metabólico agudo Glucemia ${glucosa} mg/dL (Sospecha CAD)`);
  }
  if (claveObst === "amarilla" || (esGestante && ((pas !== null && pas >= 160) || (pad !== null && pad >= 110)))) {
    motivos2.push(`Emergencia obstétrica / Preeclampsia severa PA ${pas || "--"}/${pad || "--"}`);
  }
  if (params.codigoInfarto || params.codigoIctus || params.codigoSepsis) {
    motivos2.push("Activación de Código Tiempo-Dependiente (Infarto / Ictus / Sepsis)");
  }

  if (motivos2.length > 0) {
    return {
      ctasNivel: 2,
      nivel: 2,
      ctasNombre: "Emergencia (Emergency)",
      prioridad: "II",
      colorHex: "#ea580c",
      slaNormativo: "≤ 10–15 min (Reevaluación cada 15 min)",
      reevaluacion: "Cada 15 min",
      zonaInicial: "Cola Priorizada / Tópico de Evaluación Médica",
      motivos: motivos2,
      resumenClinico: "Urgencia Mayor. Alto potencial de deterioro hemodinámico o neurológico.",
      scoreNews2Mock: 5
    };
  }

  // =========================================================================
  // CRITERIOS CTAS 3 — PRIORIDAD III (AMARILLO) · SLA: ≤ 30 min · Reeval. 30 min
  // =========================================================================
  const motivos3 = [];

  if (glasgow !== null && glasgow === 14) motivos3.push("Glasgow 14/15 (Somnolencia leve)");
  if (spo2 !== null && spo2 >= 92 && spo2 <= 94) motivos3.push(`SpO2 92–94% (${spo2}% — Hipoxemia leve)`);
  if (fr !== null && !esPediatrico && fr >= 21 && fr <= 24) motivos3.push(`FR 21–24 rpm (${fr} rpm — Taquipnea leve)`);
  if (fc !== null && !esPediatrico && ((fc >= 50 && fc <= 59) || (fc >= 101 && fc <= 120))) motivos3.push(`FC ${fc} lpm (50–59 o 101–120 lpm)`);
  if (pas !== null && !esPediatrico && (pas >= 140 && pas <= 179)) motivos3.push(`PAS 140–179 mmHg (${pas} mmHg)`);
  if (pad !== null && !esPediatrico && (pad >= 90 && pad <= 109)) motivos3.push(`PAD 90–109 mmHg (${pad} mmHg)`);
  if (temp !== null && (temp >= 38.0 && temp < 39.5)) motivos3.push(`Fiebre moderada Temp ${temp} °C`);
  if (temp !== null && temp >= 35.0 && temp < 36.0) motivos3.push(`Hipotermia leve Temp ${temp} °C`);
  if (eva !== null && eva >= 4 && eva <= 7) motivos3.push(`Dolor moderado EVA ${eva}/10`);
  if (glucosa !== null && ((glucosa >= 54 && glucosa <= 69) || glucosa > 324)) motivos3.push(`Glucemia alterada asintomática ${glucosa} mg/dL`);

  if (motivos3.length > 0) {
    return {
      ctasNivel: 3,
      nivel: 3,
      ctasNombre: "Urgente (Urgent)",
      prioridad: "III",
      colorHex: "#ca8a04",
      slaNormativo: "≤ 30 min (Reevaluación cada 30 min)",
      reevaluacion: "Cada 30 min",
      zonaInicial: "Cola Priorizada / Tópico de Evaluación Médica",
      motivos: motivos3,
      resumenClinico: "Urgencia Menor. Requiere exámenes auxiliares y estabilización médica en tópico.",
      scoreNews2Mock: 3
    };
  }

  // =========================================================================
  // CRITERIOS CTAS 4 — PRIORIDAD IV (VERDE) · SLA: ≤ 60 min · Reeval. 60 min
  // =========================================================================
  const motivos4 = [];

  if (eva !== null && eva >= 1 && eva <= 3) motivos4.push(`Dolor leve EVA ${eva}/10`);
  if (temp !== null && temp >= 37.6 && temp <= 37.9) motivos4.push(`Febrícula Temp ${temp} °C`);
  if (glucosa !== null && glucosa >= 141 && glucosa < 250) motivos4.push(`Hiperglucemia leve ${glucosa} mg/dL`);

  if (motivos4.length > 0) {
    return {
      ctasNivel: 4,
      nivel: 4,
      ctasNombre: "Menos Urgente (Less Urgent)",
      prioridad: "IV",
      colorHex: "#16a34a",
      slaNormativo: "≤ 60 min (Reevaluación cada 60 min)",
      reevaluacion: "Cada 60 min",
      zonaInicial: "Cola Priorizada / Tópico de Evaluación Médica",
      motivos: motivos4,
      resumenClinico: "Urgencia Leve. Cuadro estable sin riesgo fisiológico. Manejo ambulatorio.",
      scoreNews2Mock: 1
    };
  }

  // =========================================================================
  // CRITERIOS CTAS 5 — PRIORIDAD V (AZUL) · SLA: ≤ 120 min · Reeval. 120 min
  // =========================================================================
  return {
    ctasNivel: 5,
      nivel: 5,
    ctasNombre: "No Urgente (Non Urgent)",
    prioridad: "V",
    colorHex: "#2563eb",
    slaNormativo: "≤ 120 min (Reevaluación cada 120 min)",
    reevaluacion: "Cada 120 min",
    zonaInicial: "Cola Priorizada / Consulta Externa",
    motivos: ["Constantes vitales normales (CTAS 5)", "Sin dolor o EVA 0/10", "No requiere recursos inmediatos de emergencia"],
    resumenClinico: "No Urgente. Consulta externa, reevaluación o trámite administrativo.",
    scoreNews2Mock: 0
  };
}
window.calcularCTAS = calcularCTAS;

// Wrapper de compatibilidad para calcularNEWS2
function calcularNEWS2(params = {}) {
  const ctas = calcularCTAS(params);
  return {
    scoreTotal: ctas.scoreNews2Mock || 0,
    maxParametroUnico: ctas.ctasNivel === 1 ? 3 : (ctas.ctasNivel === 2 ? 2 : 0),
    desglose: ctas.motivos,
    esPendienteMonitorizacion: ctas.ctasNivel === 1 && ctas.motivos.some(m => m.includes("Monitorización pendiente"))
  };
}
window.calcularNEWS2 = calcularNEWS2;

// Wrapper oficial de triaje que devuelve formato unificado
function evaluarTriajeEstandar(datos = {}) {
  const ctas = calcularCTAS(datos);
  return {
    prioridad: ctas.prioridad,
    ctasNivel: ctas.ctasNivel,
    ctasNombre: ctas.ctasNombre,
    esiNivel: ctas.ctasNivel,
    compuerta: `CTAS NIVEL ${ctas.ctasNivel} (${ctas.ctasNombre.toUpperCase()})`,
    slaNormativo: ctas.slaNormativo,
    reevaluacion: ctas.reevaluacion,
    zonaInicial: ctas.zonaInicial,
    news2: {
      scoreTotal: ctas.scoreNews2Mock || 0,
      maxParametroUnico: ctas.ctasNivel === 1 ? 3 : 0,
      desglose: ctas.motivos
    },
    motivos: ctas.motivos,
    resumenClinico: ctas.resumenClinico
  };
}
window.evaluarTriajeEstandar = evaluarTriajeEstandar;

// Validación y resaltado de bordes en vivo para signos vitales (Calm-Tech & IEC 62366-1)
function validarAlertaVitalEnVivo(param, valor) {
  const num = parseFloat(valor);
  const el = document.getElementById(param + "_full");
  if (!el) return;

  el.classList.remove("input-critical-alert", "input-warning-alert");
  if (isNaN(num) || valor === "" || valor === null) return;

  const esPediatrico = Boolean(document.getElementById("check_pediatrico")?.checked);
  const rawStr = String(valor).trim();
  const esActivo = (typeof document !== "undefined" && document.activeElement === el);

  // Evitar falsas alarmas visuales (parpadeo rojo) mientras el usuario está escribiendo valores de múltiples dígitos:
  if (esActivo) {
    if (param === "fc" && rawStr.length < 2) return;
    if (param === "pas" && rawStr.length < 3) return;
    if (param === "pad" && rawStr.length < 2) return;
    if (param === "fr" && rawStr.length < 2) return;
    if (param === "spo2" && rawStr.length < 2) return;
    if (param === "temp" && rawStr.replace(".", "").length < 2) return;
    if (param === "glasgow" && rawStr === "1") return; // 10–15 inicia con el dígito 1
    if (param === "glucosa" && rawStr.length < 2) return;
  }

  if (param === "spo2") {
    if (num < 90) el.classList.add("input-critical-alert");
    else if (num <= 91) el.classList.add("input-warning-alert");
  } else if (param === "fc") {
    if (!esPediatrico) {
      if (num < 40 || num > 140) el.classList.add("input-critical-alert");
      else if (num < 50 || num > 120) el.classList.add("input-warning-alert");
    } else {
      if (num < 50 || num > 180) el.classList.add("input-critical-alert");
      else if (num < 60 || num > 160) el.classList.add("input-warning-alert");
    }
  } else if (param === "pas") {
    if (!esPediatrico) {
      if (num < 90) el.classList.add("input-critical-alert");
      else if (num >= 180 || num <= 99) el.classList.add("input-warning-alert");
    } else {
      if (num < 70) el.classList.add("input-critical-alert");
      else if (num < 85) el.classList.add("input-warning-alert");
    }
  } else if (param === "pad") {
    if (num >= 120) el.classList.add("input-critical-alert");
    else if (num >= 110) el.classList.add("input-warning-alert");
  } else if (param === "fr") {
    if (!esPediatrico) {
      if (num < 8 || num > 30) el.classList.add("input-critical-alert");
      else if (num <= 11 || num >= 25) el.classList.add("input-warning-alert");
    } else {
      if (num < 10 || num > 60) el.classList.add("input-critical-alert");
      else if (num < 15 || num >= 45) el.classList.add("input-warning-alert");
    }
  } else if (param === "temp") {
    if (num < 35.0 || num >= 41.0) el.classList.add("input-critical-alert");
    else if (num >= 39.5) el.classList.add("input-warning-alert");
  } else if (param === "glasgow") {
    if (num <= 9) el.classList.add("input-critical-alert");
    else if (num <= 13) el.classList.add("input-warning-alert");
  } else if (param === "glucosa") {
    if (num < 54 || num > 600) el.classList.add("input-critical-alert");
    else if (num <= 69 || num >= 250) el.classList.add("input-warning-alert");
  }
}
window.validarAlertaVitalEnVivo = validarAlertaVitalEnVivo;

function toggleTooltipVital(id) {
  const el = document.getElementById(id);
  if (!el) return;
  document.querySelectorAll(".tooltip-vital-content").forEach(t => {
    if (t !== el) t.classList.remove("active");
  });
  el.classList.toggle("active");
}
window.toggleTooltipVital = toggleTooltipVital;

function toggleModificadores2doOrden() {
  const box = document.getElementById("box_modificadores_segundo_orden");
  const icon = document.getElementById("icon_mod2do");
  if (!box) return;
  const visible = box.style.display !== "none";
  box.style.display = visible ? "none" : "block";
  if (icon) icon.textContent = visible ? "➕" : "➖";
}
window.toggleModificadores2doOrden = toggleModificadores2doOrden;


// ----------------------------------------------------------------------------
// TOOLTIPS DINÁMICOS DE CONSTANTES VITALES: ADULTOS VS PAEDCTAS POR GRUPO ETARIO
// ----------------------------------------------------------------------------
function actualizarTooltipsVitalesDinamicos() {
  const esPed = Boolean(document.getElementById("check_pediatrico")?.checked || (STATE.edad !== null && STATE.edad < 14));
  const grupo = document.getElementById("sel_grupo_pediatrico")?.value || STATE.grupoEtarioPediatrico || "escolar";

  const tipSpo2 = document.getElementById("tooltip_spo2");
  const tipFc = document.getElementById("tooltip_fc");
  const tipPas = document.getElementById("tooltip_pas");
  const tipPad = document.getElementById("tooltip_pad");
  const tipFr = document.getElementById("tooltip_fr");
  const tipTemp = document.getElementById("tooltip_temp");
  const tipGcs = document.getElementById("tooltip_glasgow");
  const tipEva = document.getElementById("tooltip_eva");

  if (!esPed) {
    // RANGOS FISIOLÓGICOS ABSOLUTOS ADULTOS (≥ 14 años)
    if (tipFc) tipFc.innerHTML = `<strong>FC Adulto (Rangos Fisiológicos Reales):</strong><br>• Normal: 60–100 lpm<br>• CTAS 3: 50–59 o 101–120 lpm<br>• CTAS 2: &lt; 50 o 121–140 lpm<br>• CTAS 1: &lt; 40 o &gt; 140 lpm (Inestable)`;
    if (tipFr) tipFr.innerHTML = `<strong>FR Adulto (Rangos Fisiológicos Reales):</strong><br>• Normal: 12–20 rpm<br>• CTAS 3: 21–24 rpm (Taquipnea leve)<br>• CTAS 2: 9–11 o 25–30 rpm<br>• CTAS 1: &lt; 8 o &gt; 30 rpm (Falla respiratoria)`;
    if (tipPas) tipPas.innerHTML = `<strong>PAS Adulto (Rangos Fisiológicos Reales):</strong><br>• Normal: 90–139 mmHg (Óptima &lt; 120)<br>• CTAS 3: 140–179 mmHg<br>• CTAS 2: ≥ 180 (Sintomática) o 90–99 mmHg<br>• CTAS 1: &lt; 90 mmHg (Shock / Colapso)`;
    if (tipSpo2) tipSpo2.innerHTML = `<strong>SpO2 Adulto (%):</strong><br>• Normal: 95–100% (EPOC: 88–92%)<br>• CTAS 3: 92–94%<br>• CTAS 2: 90–91%<br>• CTAS 1: &lt; 90% (Hipoxemia crítica)`;
  } else {
    // PERCENTILES Y DESVIACIONES ESTÁNDAR POR GRUPO ETARIO (PaedCTAS)
    if (tipSpo2) tipSpo2.innerHTML = `<strong>SpO2 Pediátrico (%):</strong><br>• Normal: 95–100%<br>• CTAS 3: 92–94%<br>• CTAS 2: 90–91%<br>• CTAS 1: &lt; 90% (Hipoxemia crítica)`;
    if (grupo === "neonato") {
      if (tipFc) tipFc.innerHTML = `<strong>FC Neonato (0–28 días · PaedCTAS):</strong><br>• Normal: 100–180 lpm<br>• CTAS 2 (±2 DE): &lt; 100 o &gt; 180 lpm<br>• CTAS 1 (±3 DE): &lt; 80 o &gt; 200 lpm`;
      if (tipFr) tipFr.innerHTML = `<strong>FR Neonato (0–28 días · PaedCTAS):</strong><br>• Normal: 30–60 rpm<br>• CTAS 2 (±2 DE): &lt; 25 o &gt; 60 rpm<br>• CTAS 1 (±3 DE): &lt; 20 o &gt; 70 rpm`;
      if (tipPas) tipPas.innerHTML = `<strong>PAS Neonato (0–28 días · PaedCTAS):</strong><br>• Normal: 60–90 mmHg<br>• CTAS 1 (Crítica): &lt; 60 mmHg (Hipotensión severa)`;
    } else if (grupo === "lactante") {
      if (tipFc) tipFc.innerHTML = `<strong>FC Lactante (1–12 meses · PaedCTAS):</strong><br>• Normal: 100–160 lpm<br>• CTAS 2 (±2 DE): &lt; 90 o &gt; 160 lpm<br>• CTAS 1 (±3 DE): &lt; 70 o &gt; 190 lpm`;
      if (tipFr) tipFr.innerHTML = `<strong>FR Lactante (1–12 meses · PaedCTAS):</strong><br>• Normal: 30–53 rpm<br>• CTAS 2 (±2 DE): &lt; 25 o &gt; 53 rpm<br>• CTAS 1 (±3 DE): &lt; 10 o &gt; 60 rpm`;
      if (tipPas) tipPas.innerHTML = `<strong>PAS Lactante (1–12 meses · PaedCTAS):</strong><br>• Normal: 70–100 mmHg<br>• CTAS 1 (Crítica): &lt; 70 mmHg (Hipotensión severa)`;
    } else if (grupo === "preescolar") {
      if (tipFc) tipFc.innerHTML = `<strong>FC Preescolar (1–5 años · PaedCTAS):</strong><br>• Normal: 80–140 lpm<br>• CTAS 2 (±2 DE): &lt; 70 o &gt; 140 lpm<br>• CTAS 1 (±3 DE): &lt; 50 o &gt; 180 lpm`;
      if (tipFr) tipFr.innerHTML = `<strong>FR Preescolar (1–5 años · PaedCTAS):</strong><br>• Normal: 22–37 rpm<br>• CTAS 2 (±2 DE): &lt; 18 o &gt; 37 rpm<br>• CTAS 1 (±3 DE): &lt; 10 o &gt; 60 rpm`;
      if (tipPas) tipPas.innerHTML = `<strong>PAS Preescolar (1–5 años · PaedCTAS):</strong><br>• Normal: 75–110 mmHg<br>• CTAS 1 (Crítica): &lt; 75 mmHg (70 + 2×edad)`;
    } else { // escolar
      if (tipFc) tipFc.innerHTML = `<strong>FC Escolar (6–12 años · PaedCTAS):</strong><br>• Normal: 70–120 lpm<br>• CTAS 2 (±2 DE): &lt; 60 o &gt; 120 lpm<br>• CTAS 1 (±3 DE): &lt; 50 o &gt; 180 lpm`;
      if (tipFr) tipFr.innerHTML = `<strong>FR Escolar (6–12 años · PaedCTAS):</strong><br>• Normal: 18–30 rpm<br>• CTAS 2 (±2 DE): &lt; 14 o &gt; 30 rpm<br>• CTAS 1 (±3 DE): &lt; 10 o &gt; 60 rpm`;
      if (tipPas) tipPas.innerHTML = `<strong>PAS Escolar (6–12 años · PaedCTAS):</strong><br>• Normal: 85–120 mmHg<br>• CTAS 1 (Crítica): &lt; 85 mmHg (< 90 si edad ≥ 10)`;
    }
  }
}
window.actualizarTooltipsVitalesDinamicos = actualizarTooltipsVitalesDinamicos;

function toggleSeccionMod2do(tipo) {
  const boxMain = document.getElementById("box_modificadores_segundo_orden");
  const icon = document.getElementById("icon_mod2do");
  if (!boxMain) return;

  if (tipo === "glucosa") {
    const isVisible = (boxMain.style.display !== "none" && boxMain.style.display !== "");
    const elGluc = document.getElementById("glucosa_full");
    if (!isVisible) {
      boxMain.style.display = "block";
      if (icon) icon.textContent = "➖";
      if (elGluc) elGluc.focus();
    } else {
      if (elGluc && document.activeElement !== elGluc) {
        elGluc.focus();
      } else {
        boxMain.style.display = "none";
        if (icon) icon.textContent = "➕";
      }
    }
  } else if (tipo === "pediatrico") {
    boxMain.style.display = "block";
    if (icon) icon.textContent = "➖";
    const chk = document.getElementById("check_pediatrico");
    if (chk) {
      chk.checked = !chk.checked;
      togglePediatrico(chk.checked);
    }
  } else if (tipo === "gestante") {
    boxMain.style.display = "block";
    if (icon) icon.textContent = "➖";
    const chk = document.getElementById("check_gestante");
    if (chk) {
      chk.checked = !chk.checked;
      toggleGestante(chk.checked);
    }
  }
}
window.toggleSeccionMod2do = toggleSeccionMod2do;

function cambiarGrupoPediatrico(grupo) {
  if (typeof STATE !== "undefined") {
    STATE.grupoEtarioPediatrico = grupo;
  }
  if (typeof actualizarTooltipsVitalesDinamicos === "function") {
    actualizarTooltipsVitalesDinamicos();
  }
  recalcularPrioridad();
}
window.cambiarGrupoPediatrico = cambiarGrupoPediatrico;

function toggleTep(lado, checked) {
  const card = document.getElementById(`card_tep_${lado}`);
  if (card) {
    if (checked) card.classList.add("checked");
    else card.classList.remove("checked");
  }
  recalcularPrioridad();
}
window.toggleTep = toggleTep;

function seleccionarMotivoCedis(valor) {
  if (typeof STATE !== "undefined") {
    STATE.motivoCedis = valor;
  }
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo && (!elMotivo.value || elMotivo.value.trim() === "")) {
    const mapaNombres = {
      "dolor_toracico": "Dolor torácico opresivo retroesternal / Isquemia aguda",
      "disnea": "Dificultad respiratoria súbita / Disnea aguda",
      "alt_neurologica": "Alteración del estado neurológico / Cefalea severa / Déficit focal",
      "trauma": "Trauma agudo / Mecanismo de alta energía / Accidente no vehicular",
      "dolor_abdominal": "Dolor abdominal agudo de inicio reciente",
      "fiebre_infeccion": "Fiebre alta con malestar general / Sospecha de sepsis",
      "obstetrico": "Emergencia obstétrica / Dolor pélvico o hemorragia en gestante",
      "psiquiatrico": "Crisis psiquiátrica aguda / Agitación psicomotriz / Riesgo conductual",
      "oftalmo_orl": "Urgencia oftalmológica / Otorrinolaringológica (ORL)",
      "piel_menor": "Lesión cutánea superficial / Herida menor / Manejo ambulatorio",
      "accidente_transito": "Accidente de tránsito / Politraumatismo vial (SOAT)",
      "consulta_leve": "Evaluación médica general ambulatoria / Consulta no urgente"
    };
    if (mapaNombres[valor]) {
      elMotivo.value = mapaNombres[valor];
      STATE.motivoConsulta = mapaNombres[valor];
    }
  }

  // Si selecciona accidente de tránsito, activa protocolo SOAT
  if (valor === "accidente_transito") {
    if (typeof toggleTipoEventoSOAT === "function") toggleTipoEventoSOAT(true);
  }
  recalcularPrioridad();
}
window.seleccionarMotivoCedis = seleccionarMotivoCedis;

// ===========================================================================
// RECALCULAR PRIORIDAD CLÍNICA EN VIVO (CERO CACHÉ CONGELADO)
// ===========================================================================
function limpiarPrioridadUI() {
  const pDisp = document.getElementById("prioridad_display");
  const pContent = document.getElementById("prio_display_content");
  const pError = document.getElementById("prio_display_error");
  if (pError) pError.style.display = "none";
  if (pContent) pContent.style.display = "block";

  if (pDisp) {
    pDisp.style.display = "none";
    pDisp.style.background = "";
    pDisp.style.borderColor = "";
    pDisp.style.borderWidth = "";
    pDisp.classList.remove("visible", "prio-I", "prio-II", "prio-III", "prio-IV", "prio-V");
  }
  const pCard = document.getElementById("prio_result_card");
  if (pCard) pCard.style.display = "none";
  const miniPrio = document.getElementById("mini_prioridad_badge");
  if (miniPrio) {
    miniPrio.textContent = "🚦 Triaje: Por evaluar";
    miniPrio.style.background = "#f1f5f9";
    miniPrio.style.color = "#64748b";
  }
  const chipLive = document.getElementById("chipPrioLive");
  if (chipLive) {
    chipLive.textContent = "Sin Prioridad (Triaje Pendiente)";
    chipLive.className = "top-prio-chip";
    chipLive.style.background = "#f1f5f9";
    chipLive.style.color = "#64748b";
    chipLive.style.border = "1px solid #cbd5e1";
  }
  const pxPrio = document.getElementById("cockpit_pill_prioridad");
  if (pxPrio) {
    pxPrio.className = "ui-badge-pill";
    pxPrio.textContent = "⏳ Sin Prioridad (Por evaluar)";
    pxPrio.style.background = "#f1f5f9";
    pxPrio.style.color = "#64748b";
  }
  const elPrioBadge = document.getElementById("c_triage_prio_badge");
  if (elPrioBadge) {
    elPrioBadge.className = "ui-badge-pill";
    elPrioBadge.textContent = "⏳ Triaje Pendiente (Sin Prioridad)";
    elPrioBadge.style.background = "#f1f5f9";
    elPrioBadge.style.color = "#64748b";
  }
  const monEsi = document.getElementById("mon_esi_level");
  if (monEsi) {
    monEsi.textContent = "Sin evaluar";
    monEsi.style.color = "#94a3b8";
  }
  const monNews2 = document.getElementById("mon_news2_score");
  if (monNews2) {
    monNews2.textContent = "—";
    monNews2.style.color = "#94a3b8";
  }
  const news2Disp = document.getElementById("news2_score_display");
  if (news2Disp) news2Disp.textContent = "—";
  const auditNews = document.getElementById("audit_news2_val");
  if (auditNews) auditNews.textContent = "—";
  const auditEsi = document.getElementById("audit_esi_val");
  if (auditEsi) auditEsi.textContent = "—";
  const elRitmo = document.getElementById("lbl_monitor_ritmo");
  if (elRitmo) {
    elRitmo.textContent = "EN ESPERA";
    elRitmo.style.color = "#64748b";
  }
  const elSpo2 = document.getElementById("mon_spo2");
  if (elSpo2) elSpo2.textContent = "--";
  const elFc = document.getElementById("mon_fc");
  if (elFc) elFc.textContent = "--";
  const elPa = document.getElementById("mon_pa");
  if (elPa) elPa.textContent = "--/--";
  const elFr = document.getElementById("mon_fr");
  if (elFr) elFr.textContent = "--";
  const elTemp = document.getElementById("mon_temp");
  if (elTemp) elTemp.textContent = "--";
  const elG = document.getElementById("mon_glasgow");
  if (elG) elG.textContent = "--";
  const pxCama = document.getElementById("cockpit_pill_cama");
  if (pxCama) pxCama.textContent = "🛏️ Sin cama";
}
window.limpiarPrioridadUI = limpiarPrioridadUI;

function recalcularPrioridad() {
  const validacion = (typeof validarSignosVitalesEnVivo === "function") 
    ? validarSignosVitalesEnVivo() 
    : { esValido: true, errores: [] };

  if (!validacion.esValido) {
    if (typeof mostrarErrorBiologicoEnPrioridad === "function") {
      mostrarErrorBiologicoEnPrioridad(validacion.errores);
    }
    return;
  } else {
    const pContent = document.getElementById("prio_display_content");
    const pError = document.getElementById("prio_display_error");
    if (pError) pError.style.display = "none";
    if (pContent) pContent.style.display = "block";
    const pd = document.getElementById("prioridad_display");
    if (pd && pd.style.borderColor === "rgb(220, 38, 38)") {
      pd.style.background = "";
      pd.style.borderColor = "";
      pd.style.borderWidth = "";
    }
  }

  const spo2 = parseVital("spo2_full");
  const fc = parseVital("fc_full");
  const pas = parseVital("pas_full");
  const pad = parseVital("pad_full");
  const fr = parseVital("fr_full");
  const temp = parseVital("temp_full");
  const glucosa = parseVital("glucosa_full");
  const glasgow = parseVital("glasgow_full");

  let eva = null;
  const elEva = document.getElementById("eva_full");
  if (elEva && elEva.value !== "") {
    const valEva = parseInt(elEva.value, 10);
    if (!isNaN(valEva)) eva = valEva;
  }

  const motivoCedis = document.getElementById("motivo_cedis_select")?.value || STATE.motivoCedis || "";
  const motivoTexto = document.getElementById("motivo_full")?.value || STATE.motivoConsulta || "";
  const esGestante = Boolean(STATE.esGestante || document.getElementById("check_gestante")?.checked);
  const claveObst = STATE.claveObstetrica || document.getElementById("clave_obstetrica_sel")?.value || null;

  const esPediatrico = Boolean(document.getElementById("check_pediatrico")?.checked || (STATE.edad !== null && STATE.edad < 14));
  const grupoPediatrico = document.getElementById("sel_grupo_pediatrico")?.value || STATE.grupoEtarioPediatrico || "escolar";

  const tepApariencia = Boolean(document.getElementById("chk_tep_apariencia")?.checked);
  const tepRespiracion = Boolean(document.getElementById("chk_tep_respiracion")?.checked);
  const tepCirculacion = Boolean(document.getElementById("chk_tep_circulacion")?.checked);

  // Sincronizar STATE
  STATE.spo2 = spo2; STATE.fc = fc; STATE.pasSistolica = pas;
  STATE.paDiastolica = pad; STATE.fr = fr; STATE.temperatura = temp;
  STATE.glucosa = glucosa; STATE.glasgow = glasgow; STATE.eva = eva !== null ? eva : 0;
  STATE.motivoConsulta = motivoTexto;
  STATE.motivoCedis = motivoCedis;
  STATE.esPediatrico = esPediatrico;
  STATE.grupoEtarioPediatrico = grupoPediatrico;

  const datosEval = {
    spo2, fc, pas, pad, fr, temp, glucosa, glasgow, eva,
    esPediatrico,
    grupoEtarioPediatrico: grupoPediatrico,
    edad: (typeof STATE.edad === "number") ? STATE.edad : (esPediatrico ? 8 : 30),
    tepApariencia,
    tepRespiracion,
    tepCirculacion,
    motivoCedis,
    esGestante,
    claveObstetrica: claveObst,
    codigoInfarto: Boolean(STATE.codigoInfarto || document.getElementById("check_cod_infarto")?.checked),
    codigoIctus: Boolean(STATE.codigoIctus || document.getElementById("check_cod_ictus")?.checked),
    codigoSepsis: Boolean(STATE.codigoSepsis || document.getElementById("check_cod_sepsis")?.checked),
    panicoShockTrauma: Boolean(STATE.panicoShockTrauma),
    esParoOAgonia: Boolean(validacion.esParoOAgonia),
    ingresoDirectoCritico: Boolean(STATE.ingresoDirectoCritico),
    motivoIngresoCritico: STATE.motivoIngresoCritico || "Activación directa de Trauma Shock / Riesgo Vital Inmediato — Ley N° 27604"
  };

  // =========================================================================
  // REGLA CLÍNICA Y NORMATIVA DE TRIAJE (NTS N° 042-MINSA & CTAS):
  // Paciente recién registrado en espera o sin toma física de constantes vitales
  // permanece estrictamente sin prioridad (null: Por Evaluar) y con 0 camas físicas ocupadas.
  // =========================================================================
  const todosVitalesVacios = (spo2 === null && fc === null && pas === null && pad === null && fr === null && temp === null && glucosa === null && glasgow === null);
  const sinAlarmaCritica = !datosEval.codigoInfarto && !datosEval.codigoIctus && !datosEval.codigoSepsis && !datosEval.panicoShockTrauma && !datosEval.esParoOAgonia && !datosEval.ingresoDirectoCritico && (!datosEval.claveObstetrica || datosEval.claveObstetrica === "ninguna") && (!datosEval.motivoCedis || datosEval.motivoCedis === "");

  if (todosVitalesVacios && sinAlarmaCritica) {
    STATE.prioridad = null;
    STATE.ctasNivel = null;
    STATE.colorPrioridad = null;
    STATE.resultadoTriajeEstandar = null;
    STATE.camaAsignadaId = null;
    STATE.camaAsignada = null;
    STATE.estadoFlujo = "PENDIENTE_TRIAJE";
    limpiarPrioridadUI();
    if (typeof pacienteActivoId !== "undefined" && pacienteActivoId && Array.isArray(PACIENTES_COLA)) {
      const pxActivo = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
      if (pxActivo) {
        pxActivo.prioridad = null;
        pxActivo.estadoAtencion = "En Espera de Triaje";
        renderizarTableroColaPacientes();
      }
    }
    return;
  }

  const resultado = calcularCTAS(datosEval);
  const prio = resultado.prioridad;

  STATE.prioridad = prio;
  STATE.ctasNivel = resultado.ctasNivel;
  STATE.resultadoTriajeEstandar = resultado;
  STATE.colorPrioridad = PRIORIDADES[prio]?.nombre || "Desconocido";

  // Mostrar en la UI
  if (typeof mostrarPrioridad === "function") {
    mostrarPrioridad(prio, resultado);
  }
  if (typeof renderizarRutaClinica === "function") {
    renderizarRutaClinica(prio);
  }
  if (typeof registrarTimestamp === "function") {
    registrarTimestamp("M3_triage");
  }

  // Actualizar Live Chip en Top Navbar
  const chipLive = document.getElementById("chipPrioLive");
  if (chipLive) {
    const nombres = {
      "I": "CTAS 1 · P-I ROJO (0 min)",
      "II": "CTAS 2 · P-II NARANJA (15 min)",
      "III": "CTAS 3 · P-III AMARILLO (30 min)",
      "IV": "CTAS 4 · P-IV VERDE (60 min)",
      "V": "CTAS 5 · P-V AZUL (120 min)"
    };
    chipLive.textContent = nombres[prio] || `P-${prio}`;
    chipLive.className = `top-prio-chip prio-${prio}`;
  }

  // =========================================================================
  // REGLA FUNDAMENTAL DE ROLES (BLOQUE 2.3):
  // TRIAJE NO ASIGNA CAMA DEFINITIVA.
  // - CTAS 1 / P-I: Reserva 1 cupo de Trauma Shock (ST-01) por Ley N° 27604.
  // - CTAS 2 a 5: Pasa a Cola Priorizada / Tópico de Evaluación (consume 0 camas).
  // =========================================================================
  if (prio === "I" || STATE.ingresoDirectoCritico || STATE.panicoShockTrauma) {
    let stId = STATE.camaAsignadaId;
    // Si ya tenía asignada una cama ST válida, mantenerla para no duplicar ocupación
    if (!stId || !stId.startsWith("ST-") || stId === "SIN-CAMA") {
      stId = (typeof RECURSOS_HOSPITALARIOS !== "undefined" && RECURSOS_HOSPITALARIOS["ST-01"] && RECURSOS_HOSPITALARIOS["ST-01"].estado === "disponible") ? "ST-01" : "ST-02";
    }
    if (typeof RECURSOS_HOSPITALARIOS !== "undefined" && RECURSOS_HOSPITALARIOS[stId]) {
      STATE.camaAsignadaId = stId;
      STATE.camaAsignada = RECURSOS_HOSPITALARIOS[stId].nombre || `Trauma Shock ${stId}`;
      RECURSOS_HOSPITALARIOS[stId].estado = "ocupada";
      RECURSOS_HOSPITALARIOS[stId].paciente = { id: STATE.id || pacienteActivoId || STATE.identificador, nombre: STATE.nombreReniec || STATE.identificador };
    }
  } else {
    // Si tenía una cama asignada previa en triaje, liberarla
    if (STATE.camaAsignadaId && STATE.camaAsignadaId !== "SIN-CAMA" && STATE.camaAsignadaId.startsWith("ST-")) {
      if (typeof liberarRecursoHospitalarioOperativo === "function") {
        liberarRecursoHospitalarioOperativo(STATE.camaAsignadaId, STATE.id || pacienteActivoId);
      }
    }
    STATE.camaAsignadaId = null;
    STATE.camaAsignada = null;
  }

  // Actualizar Facturación
  if (typeof actualizarFactura === "function") {
    actualizarFactura();
  }

  // Sincronizar en expediente y storage
  if (typeof guardarEstadoPacienteActivo === "function") {
    guardarEstadoPacienteActivo();
  }
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
  if (typeof window.actualizarCamasMonitorEnTiempoReal === "function") {
    window.actualizarCamasMonitorEnTiempoReal();
  }
}
window.recalcularPrioridad = recalcularPrioridad;


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

  const pContent = document.getElementById("prio_display_content");
  const pError = document.getElementById("prio_display_error");
  if (pError) pError.style.display = "none";
  if (pContent) pContent.style.display = "block";

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

  const miniPrio = document.getElementById("mini_prioridad_badge");
  if (miniPrio) {
    miniPrio.textContent = `🚦 Triaje: P-${prio} (${def.nombre})`;
    miniPrio.style.background = def.hex;
    miniPrio.style.color = "#ffffff";
    miniPrio.style.borderColor = def.hex;
  }

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
  const entorno = STATE.entornoOperativo || (STATE.esClinicaPrivada ? "privado" : "publico");
  const esAccidente = Boolean(STATE.esAccidenteTransito || STATE.tipoOrigenEvento === "soat");
  const esFuga = Boolean(STATE.soatVehiculoFuga || STATE.eventoFugaTransversal);
  const totalBruto = STATE.items_factura.reduce((s, i) => s + (parseFloat(i.costo) || 0), 0);
  const subtotalFarmacia = STATE.items_factura
    .filter(i => (i.categoria || "").toLowerCase().includes("farmacia"))
    .reduce((s, i) => s + (parseFloat(i.costo) || 0), 0);
  const subtotalProcedimientos = Math.max(0, totalBruto - subtotalFarmacia);

  const ctasNivel = STATE.prioridadCTAS || (STATE.prioridad === "I" ? 1 : (STATE.prioridad === "II" ? 2 : (STATE.prioridad === "III" ? 3 : (STATE.prioridad === "IV" ? 4 : 5))));
  const esEmergencia = (ctasNivel <= 2);
  const esUrgencia = (ctasNivel >= 3);

  const esNN = Boolean(STATE.esNN || (STATE.identificador && STATE.identificador.toUpperCase().includes("NN")));
  const tipoSegStr = String(STATE.tipoSeguro || "").trim();
  const esParticularSinSeguro = (
    tipoSegStr.toLowerCase() === "particular" ||
    tipoSegStr.toLowerCase().includes("sin seguro") ||
    STATE.tipoIpressPublica === "PARTICULAR"
  );
  const soatEstadoEl = (typeof document !== "undefined") ? document.getElementById("soat_estado") : null;
  const soatVencido = (soatEstadoEl && soatEstadoEl.value === "VENCIDO") || String(STATE.soatEstado || "").toUpperCase().includes("VENCIDO");
  const chkExclusionEl = (typeof document !== "undefined") ? document.getElementById("chk_exclusion_eps") : null;
  const tieneExclusionEps = Boolean(STATE.switchExclusion || STATE.swPreexistenciaNoCubierta || (chkExclusionEl && chkExclusionEl.checked));

  // 1. EVALUAR SOAT EN FUGA (SIN PLACA IDENTIFICADA)
  if (esFuga) {
    return {
      regimen: "SOAT_FUGA",
      entorno: "PARTICULAR",
      etiquetaRegimen: "🚨 Accidente en Fuga (Sin Placa · Cargo Particular 100%)",
      copagoFijo: 0,
      coaseguroPct: 1.0,
      totalBruto: totalBruto,
      coberturaSeguro: 0,
      totalPaciente: totalBruto,
      lineasContables: [
        { concepto: "1. Total Bruto Acumulado", monto: totalBruto },
        { concepto: "2. Cobertura SOAT (Sin Placa / Chofer en Fuga)", monto: 0 },
        { concepto: "3. Coaseguro no aplicable / Recupero posterior FONSAT", monto: 0 },
        { concepto: "4. Saldo Total a Pagar por el Paciente (100%)", monto: totalBruto }
      ],
      motivoLiquidacion: "Accidente de tránsito sin placa identificada (conductor en fuga). No aplica póliza SOAT directa. Paciente asume el 100% con derecho a reembolso ante FONSAT.",
      cartaGarantiaRequerida: false
    };
  }

  // 2. EVALUAR SOAT CON PLACA (VIGENTE VS VENCIDO)
  if (esAccidente && !esFuga) {
    if (soatVencido) {
      return {
        regimen: "SOAT_VENCIDO",
        entorno: "PARTICULAR",
        etiquetaRegimen: `❌ SOAT Vencido (Placa ${STATE.soatPlaca || "Sin verificar"} · Pago Particular 100%)`,
        copagoFijo: 0,
        coaseguroPct: 1.0,
        totalBruto: totalBruto,
        coberturaSeguro: 0,
        totalPaciente: totalBruto,
        lineasContables: [
          { concepto: "1. Total Bruto Facturable", monto: totalBruto },
          { concepto: "2. Cobertura SOAT (Póliza Vencida / Sin Fondos)", monto: 0 },
          { concepto: "3. Copago / Deducible", monto: 0 },
          { concepto: "4. Saldo Total a Pagar por Paciente (100%)", monto: totalBruto }
        ],
        motivoLiquidacion: "Póliza SOAT vencida o sin cobertura activa al momento del siniestro. Paciente o responsable del vehículo asume el 100% de la cuenta.",
        cartaGarantiaRequerida: false
      };
    }

    const TOPE_SOAT_5_UIT = 27500.00;
    const coberturaSoat = Math.min(totalBruto, TOPE_SOAT_5_UIT);
    const excesoSoat = Math.max(0, totalBruto - TOPE_SOAT_5_UIT);
    const asegSoat = STATE.soatAseguradora || document.getElementById("soat_aseguradora")?.value || "Aseguradora SOAT";
    return {
      regimen: "SOAT_ACTIVO",
      entorno: "PUBLICO_FUA",
      etiquetaRegimen: `🚗 SOAT Oficial (${asegSoat} · Placa ${STATE.soatPlaca || "Identificada"} · Tope 5 UIT)`,
      copagoFijo: 0,
      coaseguroPct: 0,
      totalBruto: totalBruto,
      coberturaSeguro: coberturaSoat,
      totalPaciente: excesoSoat,
      coberturaSoatAplicada: coberturaSoat,
      saldoSoatRestante: Math.max(0, TOPE_SOAT_5_UIT - coberturaSoat),
      lineasContables: [
        { concepto: "1. Total Bruto Facturable", monto: totalBruto },
        { concepto: "2. Cobertura SOAT Ley N° 27181 (Tope S/ 27,500)", monto: -coberturaSoat },
        { concepto: "3. Coaseguro SOAT (0% D.S. N° 024-2002-MTC)", monto: 0 },
        { concepto: "4. Saldo a Pagar en Caja por Paciente", monto: excesoSoat }
      ],
      motivoLiquidacion: excesoSoat > 0 ? "Tope SOAT de 5 UIT (S/ 27,500.00) superado. Excedente a cuenta del paciente." : "Cobertura 100% amparada bajo póliza SOAT obligatoria con placa identificada.",
      cartaGarantiaRequerida: false
    };
  }

  // 3. EVALUAR PACIENTE NN (INDOCUMENTADO) O EMERGENCIA VITAL LEY N° 27604
  if (esNN) {
    return {
      regimen: "LEY_27604_NN",
      entorno: "PUBLICO_FUA",
      etiquetaRegimen: "Exoneración por Emergencia Vital — Ley N° 27604 (Paciente NN)",
      copagoFijo: 0,
      coaseguroPct: 0,
      totalBruto: totalBruto,
      coberturaSeguro: totalBruto,
      totalPaciente: 0,
      lineasContables: [
        { concepto: "1. Total Bruto Acumulado", monto: totalBruto },
        { concepto: "2. Garantía Financiera del Estado (Ley N° 27604)", monto: -totalBruto },
        { concepto: "3. Cuenta por Regularizar (Paciente NN)", monto: 0 },
        { concepto: "4. Saldo a Pagar en Caja por Paciente", monto: 0 }
      ],
      motivoLiquidacion: "Cuenta por Regularizar — Garantía Ley N° 27604 (Paciente NN). Cobertura al 100% sin cobro al paciente.",
      cartaGarantiaRequerida: false
    };
  }

  // 4. PACIENTE SIN SEGURO (PARTICULAR) — APLICA TANTO EN PÚBLICO COMO EN CLÍNICA PRIVADA
  if (esParticularSinSeguro) {
    return {
      regimen: "PARTICULAR",
      entorno: "PARTICULAR",
      etiquetaRegimen: `Particular · Sin Cobertura de Seguro (${entorno === "privado" ? "Tarifa Clínica Privada" : "Tarifa Pública Sin Seguro"})`,
      copagoFijo: 0,
      coaseguroPct: 1.0,
      totalBruto: totalBruto,
      coberturaSeguro: 0,
      totalPaciente: totalBruto,
      lineasContables: [
        { concepto: "1. Total Bruto Acumulado", monto: totalBruto },
        { concepto: "2. Cobertura Aseguradora (Sin Seguro Activo)", monto: 0 },
        { concepto: "3. Coaseguro a cargo del Paciente (100%)", monto: 0 },
        { concepto: "4. Saldo Total a Pagar en Caja", monto: totalBruto }
      ],
      motivoLiquidacion: "Paciente sin seguro médico activo (Particular). Asume el 100% del tarifario asistencial.",
      cartaGarantiaRequerida: false
    };
  }

  // 5. MODO PRIVADO GRANULAR (EPS / ASEGURADORAS PRIVADAS Y CONVENIOS)
  if (entorno === "privado" || STATE.esClinicaPrivada || tipoSegStr.toLowerCase().includes("eps") || tipoSegStr.toLowerCase().includes("privad")) {
    const esSoloPublicoEnPrivado = (tipoSegStr === "SIS" || tipoSegStr === "EsSalud");
    if (esSoloPublicoEnPrivado) {
      if (esEmergencia) {
        return {
          regimen: "LEY_27604_PRIVADO",
          entorno: "PRIVADO_LEY27604",
          etiquetaRegimen: `${tipoSegStr} en Clínica Privada · Estabilización Emergencia Vital (Ley N° 27604)`,
          copagoFijo: 0,
          coaseguroPct: 0,
          totalBruto: totalBruto,
          coberturaSeguro: totalBruto,
          totalPaciente: 0,
          lineasContables: [
            { concepto: "1. Total Bruto Acumulado", monto: totalBruto },
            { concepto: "2. Amparo Emergencia Vital Ley N° 27604 (Hasta Estabilización)", monto: -totalBruto },
            { concepto: "3. Copago en Sala de Reanimación", monto: 0 },
            { concepto: "4. Saldo Inmediato Exigible (Pendiente Referencia)", monto: 0 }
          ],
          motivoLiquidacion: `Afiliado ${tipoSegStr} en establecimiento privado con Prioridad CTAS ${ctasNivel}. Atención garantizada por Ley N° 27604 hasta estabilización y contrarreferencia.`,
          cartaGarantiaRequerida: false
        };
      }
      return {
        regimen: "PARTICULAR_SIN_CONVENIO",
        entorno: "PARTICULAR",
        etiquetaRegimen: `Particular en Clínica Privada (${tipoSegStr} sin cobertura EPS en Urgencia)`,
        copagoFijo: 0,
        coaseguroPct: 1.0,
        totalBruto: totalBruto,
        coberturaSeguro: 0,
        totalPaciente: totalBruto,
        lineasContables: [
          { concepto: "1. Total Bruto Acumulado", monto: totalBruto },
          { concepto: `2. Cobertura ${tipoSegStr} (Sin convenio privado en Urgencia CTAS ${ctasNivel})`, monto: 0 },
          { concepto: "3. Deducibles / Coaseguros", monto: 0 },
          { concepto: "4. Saldo Total a Pagar en Caja (100%)", monto: totalBruto }
        ],
        motivoLiquidacion: `Afiliado ${tipoSegStr} atendido por Urgencia no vital (CTAS ${ctasNivel}) en Clínica Privada sin póliza EPS. Paga 100% tarifa particular.`,
        cartaGarantiaRequerida: false
      };
    }

    const seguroNombre = (tipoSegStr && tipoSegStr !== "SIS" && tipoSegStr !== "EsSalud") ? tipoSegStr : "Pacífico EPS";
    const planRaw = STATE.planPrivado || STATE.planNivelEps || "base_80_20";
    let planNivel = "Base 80/20";
    let copagoUrgencia = 80.00;
    let copagoEmergencia = 120.00;
    let coasProcPct = 0.20; // Seguro cubre 80%, paciente 20%
    let coasFarmPct = 0.30; // Seguro cubre 70%, paciente 30%

    if (planRaw === "integral_90_10" || planRaw === "Intermedio") {
      planNivel = "Integral 90/10";
      copagoUrgencia = 50.00;
      copagoEmergencia = 80.00;
      coasProcPct = 0.10; // Cubre 90%
      coasFarmPct = 0.15; // Cubre 85%
    } else if (planRaw === "vip_100" || planRaw === "VIP") {
      planNivel = "VIP 100%";
      copagoUrgencia = 35.00;
      copagoEmergencia = 0.00;
      coasProcPct = 0.00; // Cubre 100% procedimientos
      coasFarmPct = 0.10; // Cubre 90% farmacia
    }

    // Régimen 1: Emergencia Accidental en EPS (S/ 0 copago, 100% cubierto salvo exclusión)
    if ((STATE.esAccidenteTransito || STATE.esEmergenciaAccidental) && !tieneExclusionEps) {
      return {
        regimen: "PRIVADO_ACCIDENTAL",
        entorno: "PRIVADO_EPS",
        etiquetaRegimen: `${seguroNombre} (${planNivel}) · Emergencia Accidental (100% Cobertura)`,
        copagoFijo: 0,
        coaseguroPct: 0,
        totalBruto: totalBruto,
        coberturaSeguro: totalBruto,
        totalPaciente: 0,
        lineasContables: [
          { concepto: "1. Total Bruto Facturable", monto: totalBruto },
          { concepto: "2. Cobertura Integral EPS (Accidente 100%)", monto: -totalBruto },
          { concepto: "3. Deducible / Coaseguro Exonerado", monto: 0 },
          { concepto: "4. Saldo Final a Pagar Paciente", monto: 0 }
        ],
        motivoLiquidacion: "Emergencia Accidental amparada al 100% sin copago ni deducible según póliza EPS.",
        cartaGarantiaRequerida: false
      };
    }

    let gastoExcluido = 0;
    if (tieneExclusionEps) gastoExcluido += (totalBruto * 0.40);
    if (STATE.swMedicamentoNoCubierto) gastoExcluido += subtotalFarmacia;

    const baseCubiertaProc = Math.max(0, subtotalProcedimientos - (tieneExclusionEps ? (subtotalProcedimientos * 0.40) : 0));
    const baseCubiertaFarm = Math.max(0, subtotalFarmacia - (STATE.swMedicamentoNoCubierto ? subtotalFarmacia : (tieneExclusionEps ? (subtotalFarmacia * 0.40) : 0)));

    // Régimen 2: Emergencia Médica (CTAS 1 y 2)
    if (esEmergencia) {
      const coasProc = baseCubiertaProc * coasProcPct;
      const coasFarm = baseCubiertaFarm * coasFarmPct;
      const totalCoaseguro = coasProc + coasFarm;
      const totalPaciente = Math.min(totalBruto, (totalBruto > 0 ? copagoEmergencia : 0) + totalCoaseguro + gastoExcluido);
      const coberturaSeguro = Math.max(0, totalBruto - totalPaciente);
      const reqCarta = Boolean(STATE.camaAsignadaId && ["SOP-01", "OBS-03", "UCI-01"].includes(STATE.camaAsignadaId));

      return {
        regimen: "PRIVADO_EMERGENCIA_MEDICA",
        entorno: "PRIVADO_EPS",
        etiquetaRegimen: `${seguroNombre} (${planNivel}) · Emergencia Médica (CTAS ${ctasNivel})`,
        copagoFijo: copagoEmergencia,
        coaseguroPct: coasProcPct,
        totalBruto: totalBruto,
        coberturaSeguro: coberturaSeguro,
        totalPaciente: totalPaciente,
        cartaGarantiaRequerida: reqCarta,
        lineasContables: [
          { concepto: "1. Total Bruto Facturable", monto: totalBruto },
          { concepto: `2. Cobertura Aseguradora ${seguroNombre}`, monto: -coberturaSeguro },
          { concepto: `3. Copago Fijo (S/ ${(totalBruto > 0 ? copagoEmergencia : 0).toFixed(2)}) + Coaseguros (${(coasProcPct*100).toFixed(0)}%/${(coasFarmPct*100).toFixed(0)}%)${tieneExclusionEps ? ' + Exclusión' : ''}`, monto: totalPaciente },
          { concepto: "4. Saldo Total a Pagar Paciente", monto: totalPaciente }
        ],
        motivoLiquidacion: `Emergencia Médica (CTAS ${ctasNivel}) bajo ${seguroNombre} ${planNivel}. Copago S/ ${(totalBruto > 0 ? copagoEmergencia : 0).toFixed(2)} + Coaseguro Proc ${(coasProcPct*100).toFixed(0)}% / Farm ${(coasFarmPct*100).toFixed(0)}%.${tieneExclusionEps ? ' Incluye exclusión de póliza.' : ''}${reqCarta ? ' ⚠️ REQUIERE CARTA DE GARANTÍA.' : ''}`
      };
    }

    // Régimen 3: Urgencia (CTAS 3, 4 y 5)
    const coasProc = baseCubiertaProc * coasProcPct;
    const coasFarm = baseCubiertaFarm * coasFarmPct;
    const totalCoaseguro = coasProc + coasFarm;
    const totalPaciente = Math.min(totalBruto, (totalBruto > 0 ? copagoUrgencia : 0) + totalCoaseguro + gastoExcluido);
    const coberturaSeguro = Math.max(0, totalBruto - totalPaciente);

    return {
      regimen: "PRIVADO_URGENCIA",
      entorno: "PRIVADO_EPS",
      etiquetaRegimen: `${seguroNombre} (${planNivel}) · Urgencia Médica (CTAS ${ctasNivel})`,
      copagoFijo: copagoUrgencia,
      coaseguroPct: coasProcPct,
      totalBruto: totalBruto,
      coberturaSeguro: coberturaSeguro,
      totalPaciente: totalPaciente,
      cartaGarantiaRequerida: false,
      lineasContables: [
        { concepto: "1. Total Bruto Acumulado", monto: totalBruto },
        { concepto: `2. Cobertura Aseguradora ${seguroNombre}`, monto: -coberturaSeguro },
        { concepto: `3. Copago Urgencia (S/ ${(totalBruto > 0 ? copagoUrgencia : 0).toFixed(2)}) + Coaseguros (${(coasProcPct*100).toFixed(0)}%/${(coasFarmPct*100).toFixed(0)}%)${tieneExclusionEps ? ' + Exclusión' : ''}`, monto: totalPaciente },
        { concepto: "4. Saldo Total a Pagar en Caja", monto: totalPaciente }
      ],
      motivoLiquidacion: `Atención de Urgencia (CTAS ${ctasNivel}) bajo ${seguroNombre} ${planNivel}. Aplica copago fijo S/ ${(totalBruto > 0 ? copagoUrgencia : 0).toFixed(2)} y coaseguros.${tieneExclusionEps ? ' Incluye exclusión de póliza.' : ''}`
    };
  }

  // 6. MODO PÚBLICO: MINSA / SIS (FUA)
  if (STATE.tipoSeguro === "SIS" || (!STATE.tipoSeguro && entorno === "publico")) {
    return {
      regimen: "PUBLICO_SIS_FUA",
      entorno: "PUBLICO_FUA",
      etiquetaRegimen: `MINSA · SIS Gratuito (FUA: ${STATE.nroFua || "FUA-2026-PENDIENTE"})`,
      copagoFijo: 0,
      coaseguroPct: 0,
      totalBruto: totalBruto,
      coberturaSeguro: totalBruto,
      totalPaciente: 0,
      lineasContables: [
        { concepto: "1. Total Bruto Facturable", monto: totalBruto },
        { concepto: "2. Cobertura Integral SIS (FUA 100%)", monto: -totalBruto },
        { concepto: "3. Deducibles / Copagos Públicos", monto: 0 },
        { concepto: "4. Pago Final del Paciente (Cero Copago)", monto: 0 }
      ],
      motivoLiquidacion: "Atención cubierta al 100% por el Seguro Integral de Salud (SIS) mediante subsidio FUA.",
      cartaGarantiaRequerida: false
    };
  }

  // 6. MODO PÚBLICO: ESSALUD (ESSI)
  if (STATE.tipoSeguro === "EsSalud") {
    return {
      regimen: "PUBLICO_ESSALUD_ESSI",
      entorno: "PUBLICO_ESSI",
      etiquetaRegimen: `EsSalud · Acreditación Regular Activa (ESSI: ${STATE.nroEssi || "ESSI-2026-PENDIENTE"})`,
      copagoFijo: 0,
      coaseguroPct: 0,
      totalBruto: totalBruto,
      coberturaSeguro: totalBruto,
      totalPaciente: 0,
      lineasContables: [
        { concepto: "1. Total Bruto Liquidado", monto: totalBruto },
        { concepto: "2. Cobertura Institucional EsSalud", monto: -totalBruto },
        { concepto: "3. Copago Asistencial Titular", monto: 0 },
        { concepto: "4. Saldo Final Paciente (Cero Copago)", monto: 0 }
      ],
      motivoLiquidacion: "Atención cubierta al 100% por la Seguridad Social EsSalud (Acreditación ESSI).",
      cartaGarantiaRequerida: false
    };
  }

  // 7. PARTICULAR (SIN SEGURO)
  return {
    regimen: "PARTICULAR",
    entorno: "PARTICULAR",
    etiquetaRegimen: "Particular · Sin Cobertura de Seguro de Salud",
    copagoFijo: 0,
    coaseguroPct: 1.0,
    totalBruto: totalBruto,
    coberturaSeguro: 0,
    totalPaciente: totalBruto,
    lineasContables: [
      { concepto: "1. Total Bruto Acumulado", monto: totalBruto },
      { concepto: "2. Cobertura Aseguradora", monto: 0 },
      { concepto: "3. Recargos Administrativos", monto: 0 },
      { concepto: "4. Saldo Total a Pagar en Caja", monto: totalBruto }
    ],
    motivoLiquidacion: "Paciente sin seguro médico activo. Liquidación a tarifa particular completa.",
    cartaGarantiaRequerida: false
  };
}

function actualizarFactura() {
  const liq = calcularLiquidacionSeguro();
  const totalEl = document.getElementById("factura_total_val");
  const miniEl = document.getElementById("mini_factura_val");
  const container = document.getElementById("factura_items_body");
  const badgeNav = document.getElementById("navLiquidacionBadge");
  const badgeNavMonto = document.getElementById("navLiquidacionMonto");

  if (typeof actualizarBotonesFormatoPublico === "function") {
    actualizarBotonesFormatoPublico();
  }
  if (totalEl) totalEl.textContent = liq.totalPaciente.toFixed(2);
  if (miniEl) miniEl.textContent = `S/. ${liq.totalPaciente.toFixed(2)}`;
  if (badgeNavMonto) badgeNavMonto.textContent = `S/. ${liq.totalPaciente.toFixed(2)}`;

  if (badgeNav) {
    badgeNav.style.display = "inline-flex";
    if (liq.totalPaciente === 0) {
      badgeNav.style.background = "#dcfce7";
      badgeNav.style.color = "#15803d";
      badgeNav.style.borderColor = "#86efac";
    } else {
      badgeNav.style.background = "#eff6ff";
      badgeNav.style.color = "#1d4ed8";
      badgeNav.style.borderColor = "#bfdbfe";
    }
  }

  // Desglose de 4 líneas contables obligatorias en JetBrains Mono
  const detalleEl = document.getElementById("liquidacion_detalle_box");
  if (detalleEl && Array.isArray(liq.lineasContables)) {
    let tablaHtml = `
      <div style="background:var(--ct-surface-alt, #f8fafc); border:1.5px solid var(--ct-border, #cbd5e1); border-radius:10px; padding:16px; margin-top:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
          <div style="font-weight:800; color:#0f172a; font-size:0.9rem;">
            📊 Desglose Contable de Liquidación (${liq.etiquetaRegimen})
          </div>
          ${liq.cartaGarantiaRequerida ? '<span style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:2px 8px; border-radius:4px; font-weight:800; font-size:0.75rem;">⚠️ Carta de Garantía Requerida</span>' : ''}
        </div>
        <table class="tabla-contable-mono" style="width:100%; font-family:'JetBrains Mono', Consolas, monospace; font-size:0.86rem; border-collapse:collapse; margin-bottom:10px;">
          <tbody>`;

    liq.lineasContables.forEach((l, idx) => {
      const isTotal = (idx === liq.lineasContables.length - 1);
      const rowStyle = isTotal 
        ? "border-top:2px solid #0f172a; font-weight:900; font-size:0.95rem; background:#f1f5f9;" 
        : "border-bottom:1px dashed #e2e8f0;";
      const colorVal = isTotal ? "#0284c7" : (l.monto < 0 ? "#16a34a" : "#0f172a");
      tablaHtml += `
        <tr style="${rowStyle}">
          <td style="padding:7px 10px; color:#334155;">${l.concepto}:</td>
          <td style="padding:7px 10px; text-align:right; color:${colorVal};">
            S/. ${Math.abs(l.monto).toFixed(2)}
          </td>
        </tr>`;
    });

    tablaHtml += `
          </tbody>
        </table>
        <div style="font-size:0.75rem; color:#475569; background:#ffffff; border-left:3px solid #0284c7; padding:8px 12px; border-radius:4px; line-height:1.4;">
          <strong>Dictamen Financiero:</strong> ${liq.motivoLiquidacion}
        </div>
      </div>`;
    detalleEl.innerHTML = tablaHtml;
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
        <div style="text-align:center;">_______________________<br><small>Firma del Paciente / Responsable<br><span style="font-size:0.68rem; color:#64748b;">(En blanco — Sin firma digital RENIEC)</span></small></div>
        <div style="text-align:center;">_______________________<br><small>Jefe de Caja y Facturación HIS<br><span style="font-size:0.68rem; color:#0369a1;">🔐 Firma Digital Simulada Personal de Salud (Ley N° 27269)</span></small></div>
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
  const pxEvaluado = (PACIENTES_COLA || []).find(x => x.id === pacienteActivoId);
  if (pxEvaluado) {
    pxEvaluado.prioridad = STATE.prioridad;
    pxEvaluado.triajeConcluido = true;
  }
  if (typeof renderizarCarruselPreTriaje === "function") renderizarCarruselPreTriaje();
  if (typeof renderizarTableroColaPacientes === "function") renderizarTableroColaPacientes();
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
function tienePacienteActivoValido() {
  // 1. Paciente activo formalmente en la cola del servicio
  if (typeof pacienteActivoId !== "undefined" && pacienteActivoId) {
    if (Array.isArray(window.PACIENTES_COLA) && window.PACIENTES_COLA.length > 0) {
      const px = window.PACIENTES_COLA.find(x => x.id === pacienteActivoId);
      if (px) return true;
    } else {
      return true;
    }
  }

  // 2. Datos filiatorios o identificador en STATE
  const ident = (STATE.identificador || "").trim();
  const dni = (STATE.numDni || "").trim();
  const nom = (STATE.nombreReniec || "").trim();
  const hc = (STATE.historiaClinica && STATE.historiaClinica !== "—" && STATE.historiaClinica !== "-") ? STATE.historiaClinica.trim() : "";
  if (ident || dni || nom || hc || STATE.esNN) {
    return true;
  }

  // 3. Datos manuales ingresados en campos del DOM (Módulo 1 o 2)
  const dniDom = (document.getElementById("dni_mod1")?.value || document.getElementById("dni_reniec_input")?.value || "").trim();
  const nomDom = (document.getElementById("nombre_mod1")?.value || document.getElementById("nombre_mod2")?.value || "").trim();
  const motivoDom = (document.getElementById("motivo_full")?.value || "").trim();
  const spo2Dom = (document.getElementById("spo2_full")?.value || "").trim();
  const fcDom = (document.getElementById("fc_full")?.value || "").trim();
  if (dniDom || nomDom || (motivoDom && motivoDom.length > 2) || spo2Dom || fcDom || STATE.prioridad) {
    return true;
  }

  return false;
}
window.tienePacienteActivoValido = tienePacienteActivoValido;

async function grabarAtencionCompleta() {
  if (!tienePacienteActivoValido() || (!STATE.identificador || STATE.identificador.length < 2)) {
    alert("⚠️ No se puede terminar el flujo: No hay ningún paciente asignado ni datos de atención registrados. Por favor ingrese o seleccione un paciente antes de grabar la atención.");
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
  if (Array.isArray(window.PACIENTES_COLA)) {
    window.PACIENTES_COLA.forEach(px => {
      const match = (
        (typeof pacienteActivoId !== "undefined" && px.id === pacienteActivoId) ||
        (STATE.identificador && px.identificador === STATE.identificador) ||
        (STATE.nombreReniec && px.nombre === STATE.nombreReniec) ||
        (STATE.numDni && px.dni === STATE.numDni)
      );
      if (match) {
        px.estadoFlujo = "CERRADO_FACTURADO";
        px.estadoAtencion = "Atendido";
        px.terminoFlujo = true;
        px.camaId = null;
        px.camaAsignada = null;
      }
    });
  }
  if (typeof window.STATE !== "undefined" && window.STATE) {
    window.STATE.estadoFlujo = "CERRADO_FACTURADO";
    window.STATE.terminoFlujo = true;
    window.STATE.estadoAtencion = "Atendido";
  }
  if (typeof renderizarBandejaPosta === "function") {
    renderizarBandejaPosta();
  } else if (typeof actualizarBandejaPostaUI === "function") {
    actualizarBandejaPostaUI();
  }
  if (typeof renderizarTableroColaPacientes === "function") {
    renderizarTableroColaPacientes();
  }
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
  // Guardia clínica: impedir avanzar al cierre del flujo (Módulo 7 y 8) sin paciente asignado ni datos
  if ((num === 7 || num === 8) && typeof tienePacienteActivoValido === "function" && !tienePacienteActivoValido()) {
    const esAuditor = window.COCKPIT && window.COCKPIT.vistaActual === "AUDITOR";
    if (!esAuditor) {
      alert("⚠️ Flujo clínico bloqueado: No hay ningún paciente asignado ni datos de atención registrados para avanzar a " + (num === 7 ? "Egreso" : "Facturación") + ". Por favor registre o seleccione un paciente en Triaje / Admisión.");
      return;
    }
  }

  moduloActivoActual = num;

  if (num >= 2) {
    const pxA = (PACIENTES_COLA || []).find(x => x.id === pacienteActivoId);
    if (pxA && STATE.prioridad) {
      pxA.prioridad = STATE.prioridad;
      pxA.triajeConcluido = true;
      if (pxA.estadoFlujo === "PENDIENTE_TRIAJE") {
        pxA.estadoFlujo = (num === 2 || num === 3) ? "ADMISION" : "EN_ATENCION_MEDICA";
      }
    }
    if (typeof renderizarCarruselPreTriaje === "function") renderizarCarruselPreTriaje();
  }

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


// Inicializar todos los módulos colapsados por defecto en el primer render (todas las pestañas no desglosadas)
document.addEventListener("DOMContentLoaded", () => {
  if (typeof cerrarTodosLosModulos === "function") {
    cerrarTodosLosModulos();
  }
  if (typeof resetearModificadoresYSubsecciones === "function") {
    resetearModificadoresYSubsecciones();
  }
  moduloActivoActual = null;
  for (let i = 1; i <= 8; i++) {
    const btnTop = document.getElementById(`btnStepTop_${i}`);
    if (btnTop) btnTop.classList.remove("active");
  }
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
// ==============================================================================
// GESTIÓN HISTÓRICA INMUTABLE DE CONSULTAS PREVIAS POR DNI (RENIEC / SUSALUD / SEGUROS)
// Regla: Una vez asignado/consultado un seguro para un DNI, SIEMPRE saldrá el mismo (cero aleatoriedad fluctuante)
// ==============================================================================
function obtenerConsultaPreviaDni(dni) {
  if (!dni) return null;
  const numDni = String(dni).replace(/\D/g, "");
  if (!numDni || numDni.length < 3) return null;

  window._consultasPreviasCache = window._consultasPreviasCache || {};
  if (window._consultasPreviasCache[numDni]) {
    return window._consultasPreviasCache[numDni];
  }

  // 1. Consultar registro maestro de consultas previas
  try {
    const raw = localStorage.getItem("UPP_CONSULTAS_PREVIAS_DNI");
    if (raw) {
      const mapa = JSON.parse(raw);
      if (mapa && mapa[numDni]) {
        window._consultasPreviasCache[numDni] = mapa[numDni];
        return mapa[numDni];
      }
    }
  } catch(e) {}

  // 2. Consultar PADRON_UNICO_SUSALUD_BD
  try {
    const rawBD = localStorage.getItem("PADRON_UNICO_SUSALUD_BD");
    if (rawBD) {
      const mapaBD = JSON.parse(rawBD);
      if (mapaBD && mapaBD[numDni]) {
        const p = mapaBD[numDni];
        const seg = p.tipo_aseguramiento === "SOLO_SIS" ? "SIS" :
                    p.tipo_aseguramiento === "SOLO_ESSALUD" ? "EsSalud" :
                    p.tipo_aseguramiento === "EPS_Y_ESSALUD" ? (p.privado?.iafas_eps || "Pacífico EPS") :
                    p.tipo_aseguramiento === "SOLO_PRIVADO" ? (p.privado?.iafas_eps || "Seguro Privado") : "Particular";
        const rec = { dni: numDni, tipo_seguro: seg, padron: p, origen: "PADRON_UNICO_SUSALUD_BD" };
        window._consultasPreviasCache[numDni] = rec;
        guardarConsultaPreviaDni(numDni, rec);
        return rec;
      }
    }
  } catch(e) {}

  // 3. Consultar claves individuales históricas (seguro_asignado_ y padron_susalud_)
  try {
    const segLoc = localStorage.getItem("seguro_asignado_" + numDni);
    const padronLoc = localStorage.getItem("padron_susalud_" + numDni) || localStorage.getItem("SITEDS_PADRON_DNI_" + numDni);
    if (segLoc || padronLoc) {
      let pObj = null;
      try { pObj = padronLoc ? JSON.parse(padronLoc) : null; } catch(e){}
      let segFinal = segLoc;
      if (!segFinal && pObj) {
        segFinal = pObj.tipo_aseguramiento === "SOLO_SIS" ? "SIS" :
                   pObj.tipo_aseguramiento === "SOLO_ESSALUD" ? "EsSalud" :
                   pObj.tipo_aseguramiento === "EPS_Y_ESSALUD" ? (pObj.privado?.iafas_eps || "Pacífico EPS") : "Particular";
      }
      const rec = { dni: numDni, tipo_seguro: segFinal || "SIS", padron: pObj, origen: "LOCALSTORAGE_PREVIO" };
      window._consultasPreviasCache[numDni] = rec;
      guardarConsultaPreviaDni(numDni, rec);
      return rec;
    }
  } catch(e) {}

  // 4. Consultar pacientes_master
  try {
    const master = (typeof cargarPacientesMaster === "function") ? cargarPacientesMaster() : null;
    if (master) {
      const pm = master[numDni] || Object.values(master).find(x => x.identificador?.includes(numDni) || x.dni === numDni);
      if (pm && pm.tipo_seguro && pm.tipo_seguro !== "Seguro por confirmar") {
        const rec = { dni: numDni, nombre: pm.nombre || pm.nombre_completo, tipo_seguro: pm.tipo_seguro, historiaClinica: pm.historia_clinica, origen: "PACIENTES_MASTER" };
        window._consultasPreviasCache[numDni] = rec;
        guardarConsultaPreviaDni(numDni, rec);
        return rec;
      }
    }
  } catch(e) {}

  return null;
}
window.obtenerConsultaPreviaDni = obtenerConsultaPreviaDni;

function guardarConsultaPreviaDni(dni, datos) {
  if (!dni || !datos) return;
  const numDni = String(dni).replace(/\D/g, "");
  if (!numDni || numDni.length < 3) return;

  window._consultasPreviasCache = window._consultasPreviasCache || {};
  const actual = window._consultasPreviasCache[numDni] || {};
  const fusionado = {
    ...actual,
    ...datos,
    dni: numDni,
    fecha_actualizacion: new Date().toISOString()
  };

  if (fusionado.tipo_seguro) {
    const sLow = fusionado.tipo_seguro.toLowerCase();
    if (sLow.includes("sis") || sLow.includes("minsa")) fusionado.tipo_seguro = "SIS";
    else if (sLow.includes("essalud")) fusionado.tipo_seguro = "EsSalud";
  }

  window._consultasPreviasCache[numDni] = fusionado;

  try {
    const raw = localStorage.getItem("UPP_CONSULTAS_PREVIAS_DNI");
    const mapa = raw ? JSON.parse(raw) : {};
    mapa[numDni] = fusionado;
    localStorage.setItem("UPP_CONSULTAS_PREVIAS_DNI", JSON.stringify(mapa));
  } catch(e) {}

  if (fusionado.padron) {
    try {
      const rawBD = localStorage.getItem("PADRON_UNICO_SUSALUD_BD");
      const mapaBD = rawBD ? JSON.parse(rawBD) : {};
      mapaBD[numDni] = fusionado.padron;
      localStorage.setItem("PADRON_UNICO_SUSALUD_BD", JSON.stringify(mapaBD));
    } catch(e) {}
  }

  if (fusionado.tipo_seguro) {
    try { localStorage.setItem("seguro_asignado_" + numDni, fusionado.tipo_seguro); } catch(e){}
  }
  if (fusionado.padron) {
    try {
      localStorage.setItem("padron_susalud_" + numDni, JSON.stringify(fusionado.padron));
      localStorage.setItem("SITEDS_PADRON_DNI_" + numDni, JSON.stringify(fusionado.padron));
    } catch(e){}
  }

  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key && fusionado.tipo_seguro) {
    try {
      fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.eq.${encodeURIComponent(numDni)},identificador.ilike.*${encodeURIComponent(numDni)}*)`, {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_CONFIG.key,
          "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tipo_seguro: fusionado.tipo_seguro,
          padron_susalud: fusionado.padron || null
        })
      }).catch(() => {});
    } catch(e) {}
  }
}
window.guardarConsultaPreviaDni = guardarConsultaPreviaDni;

async function buscarSeguroPacienteEnBd(identificador) {
  if (!identificador) return null;
  const cleanId = String(identificador).trim().toLowerCase();
  const dniMatch = cleanId.match(/\d{8}/);
  const numDni = dniMatch ? dniMatch[0] : cleanId;

  // 1. Consultar registro de consultas previas grabadas inmutables
  const previa = (typeof obtenerConsultaPreviaDni === "function") ? obtenerConsultaPreviaDni(numDni) : null;
  if (previa && previa.tipo_seguro && previa.tipo_seguro !== "null" && previa.tipo_seguro !== "undefined" && previa.tipo_seguro !== "Seguro por confirmar") {
    console.log(`💾 Consulta previa grabada para DNI ${numDni}:`, previa.tipo_seguro);
    return previa.tipo_seguro;
  }

  // 2. Consultar en localStorage (caché local del cliente)
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

  // 1. Guardar en registro unificado de consultas previas grabadas
  if (typeof guardarConsultaPreviaDni === "function") {
    guardarConsultaPreviaDni(numDni, {
      tipo_seguro: tipoSeguro,
      nombre: nombre || STATE.nombreReniec,
      historiaClinica: nroHc || STATE.historiaClinica
    });
  }

  // 2. Guardar en localStorage para persistencia inmediata y consistente en el cliente
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
  if (idxExistenteST >= 0) {
    PACIENTES_COLA[idxExistenteST] = pxST;
  } else {
    PACIENTES_COLA.push(pxST);
  }
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
  const box = document.getElementById("box_gestante") || document.getElementById("campos_gestante");
  if (box) box.style.display = chk ? "block" : "none";
  if (typeof calcularPuntajePrelacionABCDE === "function") calcularPuntajePrelacionABCDE();
  recalcularPrioridad();
}

function togglePediatrico(chk) {
  STATE.esPediatrico = chk;
  const box = document.getElementById("box_pediatrico_detalles") || document.getElementById("campos_pediatrico");
  if (box) box.style.display = chk ? "block" : "none";
  if (typeof actualizarTooltipsVitalesDinamicos === "function") actualizarTooltipsVitalesDinamicos();
  if (typeof calcularPuntajePrelacionABCDE === "function") calcularPuntajePrelacionABCDE();
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
  if (idxExistenteSOP >= 0) {
    PACIENTES_COLA[idxExistenteSOP] = pxSOP;
  } else {
    PACIENTES_COLA.push(pxSOP);
  }
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
        <div style="border-top:1px solid #000;width:220px;padding-top:4px;">Firma y Sello Médico Tratante<br>CMP / RNE<br><span style="font-size:10px;color:#0369a1;">🔐 Firma Digital Simulada Personal de Salud</span></div>
        <div style="border-top:1px solid #000;width:220px;padding-top:4px;">Firma del Paciente / Familiar<br><small style="color:#64748b;">(En blanco — Sin firma digital RENIEC)</small><br>Conformidad de Alta</div>
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
        <div style="border-top:1px solid #000;width:240px;padding-top:4px;">Firma / Huella del Paciente o Familiar<br><small style="color:#64748b;">(En blanco — Sin firma digital RENIEC)</small><br>DNI N°:</div>
        <div style="border-top:1px solid #000;width:240px;padding-top:4px;">Firma y Sello del Médico Tratante<br>CMP / RNE:<br><span style="font-size:10px;color:#0369a1;">🔐 Firma Digital Simulada Personal de Salud</span></div>
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
  let nombreCompleto = "";
  try {
    const res = await fetch(`https://api.apis.net.pe/v2/reniec/dni?numero=${dni}`, {
      headers: { "Authorization": `Bearer ${DEFAULT_APISPERU_TOKEN}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.nombres) {
        nombreCompleto = `${data.nombres} ${data.apellidoPaterno} ${data.apellidoMaterno}`.trim();
      }
    }
  } catch (e) {}

  if (!nombreCompleto) {
    const demo = (typeof generarDatosDemograficosCoherentes === "function")
      ? generarDatosDemograficosCoherentes(dni)
      : { nombre: "PACIENTE IDENTIFICADO RENIEC" };
    nombreCompleto = demo.nombre || "PACIENTE IDENTIFICADO RENIEC";
  }

  const nomInput = document.getElementById("reg_nombre_input");
  if (nomInput) nomInput.value = nombreCompleto;
  alert(`✅ RENIEC: Paciente identificado como: ${nombreCompleto}`);
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

  // Asignación variada entre los regímenes peruanos reales: SIS, EsSalud, EPS Privadas y Particular (Sin Seguro)
  let tipoSeguroFinal = datos.tipoSeguro;
  let entornoFinal = datos.entornoOperativo;
  let planPrivadoFinal = datos.planPrivado || "base_80_20";
  let planNivelEpsFinal = datos.planNivelEps || "Base";

  if (!tipoSeguroFinal) {
    const slot = (num - 1) % 4;
    if (slot === 0) {
      tipoSeguroFinal = "SIS";
      entornoFinal = "publico";
    } else if (slot === 1) {
      tipoSeguroFinal = "EsSalud";
      entornoFinal = "publico";
    } else if (slot === 2) {
      const aseguradorasEps = ["Pacífico EPS", "Rímac EPS", "Mapfre EPS", "La Positiva EPS", "Sanitas EPS"];
      const planes = [
        { codigo: "base_80_20", nivel: "Base" },
        { codigo: "integral_90_10", nivel: "Intermedio" },
        { codigo: "vip_100", nivel: "VIP" }
      ];
      tipoSeguroFinal = aseguradorasEps[num % aseguradorasEps.length];
      const planSel = planes[num % planes.length];
      planPrivadoFinal = planSel.codigo;
      planNivelEpsFinal = planSel.nivel;
      entornoFinal = "privado";
    } else {
      tipoSeguroFinal = "Particular";
      entornoFinal = (num % 2 === 0) ? "privado" : "publico";
    }
  } else {
    if (!entornoFinal) {
      const low = String(tipoSeguroFinal).toLowerCase();
      entornoFinal = (low.includes("eps") || low.includes("privad")) ? "privado" : "publico";
    }
  }

  const tipoIpressFinal = datos.tipoIpressPublica || (tipoSeguroFinal === "EsSalud" ? "ESSALUD" : (tipoSeguroFinal === "Particular" ? "PARTICULAR" : "MINSA"));
  const nroFuaFinal = datos.nroFua || (tipoSeguroFinal === "SIS" ? `FUA-2026-${Math.floor(100000 + Math.random() * 900000)}` : "");
  const nroEssiFinal = datos.nroEssi || (tipoSeguroFinal === "EsSalud" ? `ESSI-2026-${Math.floor(100000 + Math.random() * 900000)}` : "");

  return {
    id: id,
    numero: num,
    identificador: datos.identificador || `Paciente #${num}`,
    nombre: datos.nombre || `Paciente #${num} (En espera)`,
    dni: datos.dni || "",
    edad: datos.edad || null,
    sexo: datos.sexo || "M",
    tipoSeguro: tipoSeguroFinal,
    entornoOperativo: entornoFinal,
    esClinicaPrivada: (entornoFinal === "privado"),
    planPrivado: planPrivadoFinal,
    planNivelEps: planNivelEpsFinal,
    tipoIpressPublica: tipoIpressFinal,
    nroFua: nroFuaFinal,
    nroEssi: nroEssiFinal,
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
window.crearRegistroPaciente = crearRegistroPaciente;

function capturarFormularioActual() {
  const inputs = {};
  const ids = [
    "ident_full", "dni_reniec_input", "motivo_full", "spo2_full", "fc_full",
    "pas_full", "pad_full", "fr_full", "temp_full", "glasgow_full", "glucosa_full",
    "eva_full", "eva_range", "edad_full", "sexo_full", "fecha_nac_full",
    "check_cod_infarto", "check_cod_ictus", "check_cod_sepsis",
    "check_pediatrico", "check_gestante", "chk_tep_apariencia", "chk_tep_respiracion", "chk_tep_circulacion",
    "clave_obstetrica_sel", "sem_gestacion", "lcf_gestacion", "sel_grupo_pediatrico",
    "enfermero_triaje_select", "alergias_full", "chk_consentimiento_datos",
    "chk_evento_fuga", "chk_exclusion_eps", "sel_consentimiento_medico",
    "cie10_select", "cie10_input", "dni_mod1", "dni_mod4",
    "select_ipress_publica", "select_aseguradora_privada", "select_plan_privado", "sel_condicion_consentimiento",
    "sel_procedimiento_consentimiento", "chk_consentimiento_firmado", "medico_responsable_select"
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      inputs[id] = (el.type === "checkbox") ? el.checked : el.value;
    }
  });
  const boxMod = document.getElementById("box_modificadores_segundo_orden");
  inputs["_box_mod_abierto"] = Boolean(boxMod && boxMod.style.display !== "none" && boxMod.style.display !== "");
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
  if (inputs["_box_mod_abierto"]) {
    const boxMod = document.getElementById("box_modificadores_segundo_orden");
    if (boxMod) boxMod.style.display = "block";
    const iconMod = document.getElementById("icon_mod2do");
    if (iconMod) iconMod.textContent = "➖";
  } else {
    const boxMod = document.getElementById("box_modificadores_segundo_orden");
    if (boxMod) boxMod.style.display = "none";
    const iconMod = document.getElementById("icon_mod2do");
    if (iconMod) iconMod.textContent = "➕";
  }
  if (inputs["check_pediatrico"]) {
    const boxPed = document.getElementById("box_pediatrico_detalles");
    if (boxPed) boxPed.style.display = "block";
  }
  if (inputs["check_gestante"]) {
    const boxGest = document.getElementById("box_gestante");
    if (boxGest) boxGest.style.display = "block";
  }
  ["apariencia", "respiracion", "circulacion"].forEach(lado => {
    const card = document.getElementById(`card_tep_${lado}`);
    if (card) {
      if (inputs[`chk_tep_${lado}`]) card.classList.add("checked");
      else card.classList.remove("checked");
    }
  });
  ["infarto", "ictus", "sepsis"].forEach(cod => {
    const card = document.getElementById(`card_cod_${cod}`);
    if (card) {
      if (inputs[`check_cod_${cod}`]) card.classList.add("checked");
      else card.classList.remove("checked");
    }
  });
}

function guardarEstadoPacienteActivo() {
  if (!pacienteActivoId) return;
  const p = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
  if (!p) return;

  p.stateSnapshot = JSON.parse(JSON.stringify(STATE));
  p.formSnapshot = capturarFormularioActual();
  p.prioridad = STATE.prioridad;
  const inputIdent = document.getElementById("ident_full");
  const rawIdent = inputIdent ? inputIdent.value.trim() : "";
  p.identificador = STATE.identificador || rawIdent || p.identificador;
  p.nombre = STATE.nombreReniec || (rawIdent && !rawIdent.startsWith("Ticket") ? rawIdent : null) || p.nombre;
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

function limpiarFormularioCompletoState() {
  if (typeof limpiarCamposParaNuevaAtencion === "function") {
    limpiarCamposParaNuevaAtencion();
  }
  if (typeof cerrarTodosLosModulos === "function") cerrarTodosLosModulos();
  if (typeof resetearModificadoresYSubsecciones === "function") resetearModificadoresYSubsecciones();
  if (typeof STATE !== "undefined" && STATE) {
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
  }
  if (typeof renderizarTablaKardexEnfermeria === "function") {
    renderizarTablaKardexEnfermeria();
  }
  if (typeof STATE !== "undefined" && STATE) {
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
    STATE.esNN = false;
    STATE.grupoSanguineo = "";
    STATE.factorRh = "";
  }

  const inputsIds = [
    "ident_full", "dni_reniec_input", "dni_mod1", "dni_mod4", "motivo_full", "spo2_full", "fc_full",
    "pas_full", "pad_full", "fr_full", "temp_full", "glasgow_full", "glucosa_full",
    "eva_full", "eva_range", "edad_full", "sexo_full", "fecha_nac_full", "alergias_full", "alergias_mod1",
    "cie10_select", "cie10_input", "enfermero_triaje_select", "medico_responsable_select",
    "select_ipress_publica", "select_plan_privado", "sel_consentimiento_medico",
    "sel_condicion_consentimiento", "sel_procedimiento_consentimiento",
    "select_grupo_sanguineo", "select_factor_rh"
  ];
  inputsIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const checkIds = [
    "check_cod_infarto", "check_cod_ictus", "check_cod_sepsis",
    "chk_gestante_full", "chk_pediatrico_full", "chk_consentimiento_datos",
    "chk_evento_fuga", "chk_exclusion_eps", "chk_consentimiento_firmado"
  ];
  checkIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });

  const elSexo = document.getElementById("sexo_full");
  if (elSexo) elSexo.value = "M";
  const elGsan = document.getElementById("gsan_full");
  if (elGsan) elGsan.value = "Desconocido";
  const elClave = document.getElementById("clave_obstetrica_sel");
  if (elClave) elClave.value = "";
  if (typeof STATE !== "undefined" && STATE) STATE.grupoSanguineo = "Desconocido";

  if (typeof limpiarIdentificacionPaciente === "function") {
    limpiarIdentificacionPaciente();
  }
  if (typeof actualizarEVA === "function") actualizarEVA(0);
  if (typeof actualizarIndicadorVisualAlergias === "function") actualizarIndicadorVisualAlergias("");

  const elPrioridadDisplay = document.getElementById("prioridad_display");
  if (elPrioridadDisplay) {
    elPrioridadDisplay.textContent = "Sin clasificar";
    elPrioridadDisplay.style.background = "#f1f5f9";
    elPrioridadDisplay.style.color = "#64748b";
  }

  const news2Disp = document.getElementById("news2_score_display");
  if (news2Disp) news2Disp.textContent = "—";
  const auditNews = document.getElementById("audit_news2_val");
  if (auditNews) auditNews.textContent = "—";
  const auditEsi = document.getElementById("audit_esi_val");
  if (auditEsi) auditEsi.textContent = "—";
  const hcDisp = document.getElementById("hc_code_display");
  if (hcDisp) hcDisp.textContent = "—";
  const hcBadge = document.getElementById("hc_badge_estado");
  if (hcBadge) {
    hcBadge.textContent = "Por confirmar";
    hcBadge.className = "badge-estado badge-conf";
  }
}
window.limpiarFormularioCompletoState = limpiarFormularioCompletoState;

// ===========================================================================
// CARRUSEL SLIDE PRE-TRIAJE: PACIENTES EN ESPERA (DOOR-TO-TRIAGE CTAS & MINSA)
// Ubicación normativa: Inmediatamente antes del Módulo 1 (Triaje)
// Sustento: NTS N° 042-MINSA (Acceso y flujo oportuno), Ley N° 27408 (Atención
// Preferente gestante/niños/ancianos) y CTAS Door-to-Triage (Meta <= 10-15 min)
// ===========================================================================

function esPacientePendienteDeTriaje(p) {
  if (!p) return false;
  if (p.terminoFlujo === true || p.altaClinicaConcluida === true) return false;
  const ef = p.estadoFlujo || "";
  if (ef === "CERRADO_FACTURADO" || ef === "ALTA_CLINICA" || ef === "ADMISION" || ef === "EN_ATENCION_MEDICA" || ef === "PENDIENTE_CAJA") return false;
  const ea = p.estadoAtencion || "";
  if (ea === "Atendido" || ea === "Alta" || ea === "Cerrado" || ea.includes("Alta")) return false;
  if (p.triajeConcluido === true) return false;
  if (p.prioridad && p.prioridad !== "" && ef !== "PENDIENTE_TRIAJE") return false;
  return true;
}

function renderizarCarruselPreTriaje() {
  const wrapper = document.getElementById("cockpit_pretriage_queue_wrapper");
  if (!wrapper) return;

  const pacientesPreTriaje = (Array.isArray(PACIENTES_COLA) ? PACIENTES_COLA : [])
    .filter(p => esPacientePendienteDeTriaje(p))
    .sort((a, b) => (a.timestampLlegada || 0) - (b.timestampLlegada || 0));

  const total = pacientesPreTriaje.length;

  let maxEsperaMs = 0;
  const ahora = Date.now();
  if (total > 0) {
    pacientesPreTriaje.forEach(p => {
      const diff = ahora - (p.timestampLlegada || ahora);
      if (diff > maxEsperaMs) maxEsperaMs = diff;
    });
  }
  const maxMinutos = Math.floor(maxEsperaMs / 60000);
  const maxSegundos = Math.floor((maxEsperaMs % 60000) / 1000);
  const maxEsperaStr = `${String(maxMinutos).padStart(2, '0')}:${String(maxSegundos).padStart(2, '0')}`;

  let kpiSlaClass = "kpi-normal";
  if (maxMinutos >= 15) {
    kpiSlaClass = "kpi-danger";
  } else if (maxMinutos >= 10) {
    kpiSlaClass = "kpi-warning";
  }

  const headerHtml = `
    <div class="pretriage-header">
      <div class="pretriage-title-group">
        <span class="pretriage-icon" aria-hidden="true">🩺</span>
        <div>
          <div class="pretriage-main-title">
            <span>Cola de Espera Pre-Triaje</span>
            <span class="pretriage-norma-tag" title="Sustento normativo de acceso rápido">NTS N° 042-MINSA · CTAS Door-to-Triage</span>
          </div>
          <div class="pretriage-subtitle">Pacientes en sala de espera antes del ingreso a Módulo 1 (Orden cronológico de llegada FIFO)</div>
        </div>
      </div>

      <div class="pretriage-kpi-group">
        <div class="pretriage-kpi-pill kpi-count" id="kpi_pretriage_count" title="Total de pacientes esperando evaluación inicial de triaje">
          <span class="kpi-dot"></span>
          <strong id="lbl_pretriage_total">${total}</strong> ${total === 1 ? 'en espera' : 'en espera'}
        </div>
        <div class="pretriage-kpi-pill kpi-wait ${kpiSlaClass}" id="kpi_pretriage_max_wait" title="Tiempo de espera más prolongado en sala">
          ⏱️ Máx: <strong id="lbl_pretriage_max_wait">${maxEsperaStr} min</strong>
        </div>
        <div class="pretriage-kpi-pill kpi-target" title="Estándar Canadiense CTAS y MINSA: Clasificación inicial <= 10-15 minutos">
          🎯 SLA: ≤ 10m
        </div>
        <div class="pretriage-nav-btns">
          <button type="button" class="btn-slide-nav" onclick="deslizarCarruselPreTriaje('prev')" title="Deslizar pacientes anteriores" aria-label="Anterior">‹</button>
          <button type="button" class="btn-slide-nav" onclick="deslizarCarruselPreTriaje('next')" title="Deslizar siguientes pacientes" aria-label="Siguiente">›</button>
          <button type="button" class="btn-pretriage-add" onclick="registrarPacienteEnEspera()" title="Registrar nuevo paciente en sala de espera (+ Espera)">
            ➕ + Espera
          </button>
        </div>
      </div>
    </div>
  `;

  let cardsHtml = "";
  if (total === 0) {
    cardsHtml = `
      <div class="pretriage-empty-banner">
        <div class="pretriage-empty-icon">🟢</div>
        <div class="pretriage-empty-info">
          <strong>Sala de Espera de Triaje Despejada:</strong> No hay pacientes en cola pendientes de evaluación inicial. Puerta de entrada con 100% de cumplimiento en tiempo de acceso.
        </div>
        <button type="button" class="btn-pretriage-empty-add" onclick="registrarPacienteEnEspera()">
          ➕ Registrar Llegada (+ Espera)
        </button>
      </div>
    `;
  } else {
    cardsHtml = pacientesPreTriaje.map((p, idx) => {
      const esActivo = (p.id === pacienteActivoId);
      const diffMs = ahora - (p.timestampLlegada || ahora);
      const mins = Math.floor(diffMs / 60000);
      const segs = Math.floor((diffMs % 60000) / 1000);
      const tiempoStr = `${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;

      let timerClass = "timer-ok";
      let alertaDesc = "En tiempo";
      let cardBorderClass = "border-ok";
      if (mins >= 15) {
        timerClass = "timer-danger";
        alertaDesc = "Excede SLA";
        cardBorderClass = "border-danger";
      } else if (mins >= 10) {
        timerClass = "timer-warning";
        alertaDesc = "Alerta CTAS";
        cardBorderClass = "border-warning";
      }

      let badgeVuln = `<span class="badge-vuln vuln-adulto" title="Adulto general">👤 Adulto</span>`;
      const snap = p.stateSnapshot || {};
      const edadVal = (p.edad !== null && p.edad !== undefined) ? p.edad : snap.edad;
      const esGest = Boolean(p.esGestante || snap.esGestante || p.chk_gestante);
      const esPed = Boolean(p.esPediatrico || snap.esPediatrico || (edadVal !== null && edadVal !== undefined && edadVal < 14));
      const esSen = Boolean(edadVal !== null && edadVal !== undefined && edadVal >= 60);

      if (esGest) {
        badgeVuln = `<span class="badge-vuln vuln-gestante" title="Atención Preferente Ley N° 27408 / Claves Obstétricas MINSA">🤰 Gestante · Preferente</span>`;
      } else if (esPed) {
        const subPed = (edadVal !== null && edadVal <= 1) ? "Lactante" : "Pediátrico";
        badgeVuln = `<span class="badge-vuln vuln-pediatrico" title="PaedCTAS - Algoritmo pediátrico canadiense">👶 ${subPed} (<14a)</span>`;
      } else if (esSen) {
        badgeVuln = `<span class="badge-vuln vuln-senior" title="Atención Preferente Ley N° 27408 (Adulto Mayor >= 60 años)">🧓 Adulto Mayor · Preferente</span>`;
      } else if (p.esNN) {
        badgeVuln = `<span class="badge-vuln vuln-nn" title="Paciente NN Indocumentado / Identificación OMS">👤 Paciente NN</span>`;
      }

      const mod = p.modalidad || "A pie";
      let modIcon = "🚶";
      const modLow = mod.toLowerCase();
      if (modLow.includes("samu") || modLow.includes("ambulancia") || modLow.includes("bombero")) modIcon = "🚑";
      else if (modLow.includes("polic") || modLow.includes("serenazgo") || modLow.includes("pnp") || modLow.includes("patrullero")) modIcon = "🚓";
      else if (modLow.includes("particular") || modLow.includes("taxi")) modIcon = "🚗";
      else if (modLow.includes("silla")) modIcon = "🦽";
      else if (modLow.includes("camilla")) modIcon = "🛏️";

      const ticketText = p.identificador || `Ticket T-${String(p.numero || idx + 1).padStart(3, '0')}`;
      const nombreText = (p.nombre && !p.nombre.includes("Paciente #")) ? p.nombre : "";

      const motivoTexto = p.motivo || snap.motivo || "Sin queja registrada aún";
      const motivoTruncado = motivoTexto.length > 38 ? (motivoTexto.substring(0, 35) + "...") : motivoTexto;

      return `
        <div class="pretriage-card ${esActivo ? 'active-px' : ''} ${cardBorderClass}" id="card_pretriage_${p.id}" onclick="seleccionarPacientePreTriaje('${p.id}')">
          <div class="pretriage-card-header">
            <span class="pretriage-pos-badge">#${idx + 1} en Fila</span>
            <span class="pretriage-status-pill ${esActivo ? 'status-active' : 'status-waiting'}">
              ${esActivo ? '🩺 Evaluando' : '⏳ En Espera'}
            </span>
          </div>

          <div class="pretriage-card-body">
            <div class="pretriage-ticket-row">
              <span class="pretriage-ticket-code">${ticketText}</span>
              <span class="pretriage-time-tag" title="Hora de registro de llegada">🕒 ${p.horaLlegada || '--:--'}</span>
            </div>
            ${nombreText ? `<div class="pretriage-name-sub" title="${p.nombre}">${p.nombre}</div>` : ''}

            <div class="pretriage-timer-box ${timerClass}">
              <span class="timer-clock-icon">⏱️</span>
              <strong id="timer_pretriage_${p.id}" class="timer-clock-digits">${tiempoStr} min</strong>
              <span class="timer-clock-desc">(${alertaDesc})</span>
            </div>

            <div class="pretriage-tags-row">
              ${badgeVuln}
              <span class="badge-modalidad" title="Modalidad de arribo">${modIcon} ${mod}</span>
            </div>

            <div class="pretriage-motivo-preview" title="${motivoTexto}">
              <span class="motivo-label">Motivo:</span> <span class="motivo-text">${motivoTruncado}</span>
            </div>
          </div>

          <div class="pretriage-card-footer">
            ${esActivo 
              ? `<div class="pretriage-btn-active">▶️ En Evaluación Actual</div>` 
              : `<button type="button" class="btn-pretriage-select" onclick="event.stopPropagation(); seleccionarPacientePreTriaje('${p.id}')">
                   📥 Iniciar Triaje
                 </button>`
            }
          </div>
        </div>
      `;
    }).join("");
  }

  wrapper.innerHTML = `
    ${headerHtml}
    <div class="pretriage-cards-track" id="pretriage_cards_track">
      ${cardsHtml}
    </div>
  `;
}

function actualizarCronometrosPreTriaje() {
  const track = document.getElementById("pretriage_cards_track");
  if (!track) return;

  const pacientesPreTriaje = (Array.isArray(PACIENTES_COLA) ? PACIENTES_COLA : [])
    .filter(p => esPacientePendienteDeTriaje(p));

  const ahora = Date.now();
  let maxEsperaMs = 0;

  pacientesPreTriaje.forEach(p => {
    const diff = ahora - (p.timestampLlegada || ahora);
    if (diff > maxEsperaMs) maxEsperaMs = diff;

    const elTimer = document.getElementById(`timer_pretriage_${p.id}`);
    if (elTimer) {
      const mins = Math.floor(diff / 60000);
      const segs = Math.floor((diff % 60000) / 1000);
      elTimer.textContent = `${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')} min`;

      const box = elTimer.closest(".pretriage-timer-box");
      const card = document.getElementById(`card_pretriage_${p.id}`);
      if (box) {
        box.classList.remove("timer-ok", "timer-warning", "timer-danger");
        if (card) card.classList.remove("border-ok", "border-warning", "border-danger");

        const desc = box.querySelector(".timer-clock-desc");
        if (mins >= 15) {
          box.classList.add("timer-danger");
          if (card) card.classList.add("border-danger");
          if (desc) desc.textContent = "(Excede SLA)";
        } else if (mins >= 10) {
          box.classList.add("timer-warning");
          if (card) card.classList.add("border-warning");
          if (desc) desc.textContent = "(Alerta CTAS)";
        } else {
          box.classList.add("timer-ok");
          if (card) card.classList.add("border-ok");
          if (desc) desc.textContent = "(En tiempo)";
        }
      }
    }
  });

  const lblMax = document.getElementById("lbl_pretriage_max_wait");
  const kpiWait = document.getElementById("kpi_pretriage_max_wait");
  if (lblMax && pacientesPreTriaje.length > 0) {
    const maxMins = Math.floor(maxEsperaMs / 60000);
    const maxSegs = Math.floor((maxEsperaMs % 60000) / 1000);
    lblMax.textContent = `${String(maxMins).padStart(2, '0')}:${String(maxSegs).padStart(2, '0')} min`;

    if (kpiWait) {
      kpiWait.classList.remove("kpi-normal", "kpi-warning", "kpi-danger");
      if (maxMins >= 15) kpiWait.classList.add("kpi-danger");
      else if (maxMins >= 10) kpiWait.classList.add("kpi-warning");
      else kpiWait.classList.add("kpi-normal");
    }
  }
}

function deslizarCarruselPreTriaje(direccion) {
  const track = document.getElementById("pretriage_cards_track");
  if (!track) return;
  const desplazamiento = 280;
  if (direccion === "prev") {
    track.scrollBy({ left: -desplazamiento, behavior: "smooth" });
  } else {
    track.scrollBy({ left: desplazamiento, behavior: "smooth" });
  }
}

function seleccionarPacientePreTriaje(id) {
  if (!id) return;
  if (typeof guardarEstadoPacienteActivo === "function") {
    guardarEstadoPacienteActivo();
  }
  if (typeof cambiarPacienteActivo === "function") {
    cambiarPacienteActivo(id);
  } else if (typeof window.seleccionarExpediente === "function") {
    window.seleccionarExpediente(id);
  }
  if (typeof irAModulo === "function") {
    irAModulo(1);
  }
  if (window.COCKPIT && typeof window.COCKPIT.irAFase === "function") {
    window.COCKPIT.irAFase(1);
  }
  renderizarCarruselPreTriaje();
  const elFoco = document.getElementById("motivo_full") || document.getElementById("dni_mod1") || document.getElementById("fc_full");
  if (elFoco) setTimeout(() => elFoco.focus(), 150);
}

window.renderizarCarruselPreTriaje = renderizarCarruselPreTriaje;
window.actualizarCronometrosPreTriaje = actualizarCronometrosPreTriaje;
window.deslizarCarruselPreTriaje = deslizarCarruselPreTriaje;
window.seleccionarPacientePreTriaje = seleccionarPacientePreTriaje;
window.esPacientePendienteDeTriaje = esPacientePendienteDeTriaje;

let filtroTableroPrioridad = "TODAS";
let filtroTableroFlujo = "TODOS";

function aplicarFiltrosTableroCola() {
  const selPrio = document.getElementById("filtro_tablero_prioridad");
  const selFlujo = document.getElementById("filtro_tablero_flujo");
  filtroTableroPrioridad = selPrio ? selPrio.value : "TODAS";
  filtroTableroFlujo = selFlujo ? selFlujo.value : "TODOS";
  renderizarTableroColaPacientes();
}

function limpiarFiltrosTableroCola() {
  filtroTableroPrioridad = "TODAS";
  filtroTableroFlujo = "TODOS";
  const selPrio = document.getElementById("filtro_tablero_prioridad");
  const selFlujo = document.getElementById("filtro_tablero_flujo");
  if (selPrio) selPrio.value = "TODAS";
  if (selFlujo) selFlujo.value = "TODOS";
  renderizarTableroColaPacientes();
}
window.aplicarFiltrosTableroCola = aplicarFiltrosTableroCola;
window.limpiarFiltrosTableroCola = limpiarFiltrosTableroCola;

function renderizarTableroColaPacientes() {
  const container = document.getElementById("activePatientsCardsList");
  const countBadge = document.getElementById("lbl_total_px_activos");
  if (!container) return;

  ordenarColaPacientes();

  const fnFinalizado = (typeof window.esPacienteFinalizado === "function")
    ? window.esPacienteFinalizado
    : (p => {
        if (!p) return false;
        const ef = p.estadoFlujo || "";
        const ea = p.estadoAtencion || "";
        return p.terminoFlujo === true || p.altaClinicaConcluida === true || ef === "CERRADO_FACTURADO" || ef === "ALTA_CLINICA" || ea === "Atendido" || ea === "Alta" || ea === "Cerrado" || ea.includes("Alta");
      });

  // FILTRO CLAVE: Solo mostrar pacientes que están en proceso de atención activa
  // Cuando se les da de alta médica o cierre, desaparecen de aquí (pero se conservan en la Bandeja de Posta para trazabilidad)
  const pacientesActivosEnCurso = (PACIENTES_COLA || []).filter(p => !fnFinalizado(p));

  const hayFiltro = (filtroTableroPrioridad !== "TODAS" || filtroTableroFlujo !== "TODOS");
  const btnLimpiar = document.getElementById("btn_limpiar_filtros_tablero");
  if (btnLimpiar) btnLimpiar.style.display = hayFiltro ? "inline-flex" : "none";

  const pacientesFiltrados = pacientesActivosEnCurso.filter(p => {
    if (filtroTableroPrioridad !== "TODAS") {
      if (filtroTableroPrioridad === "SIN_EVALUAR") {
        if (p.prioridad && String(p.prioridad).trim() !== "") return false;
      } else if (p.prioridad !== filtroTableroPrioridad) {
        return false;
      }
    }
    if (filtroTableroFlujo !== "TODOS") {
      const ef = p.estadoFlujo || "PENDIENTE_TRIAJE";
      const efNorm = (ef === "TRIAJE_COMPLETO" || ef === "PENDIENTE_ADMISION") ? "ADMISION" : (ef === "ATENCIÓN_MÉDICA" ? "EN_ATENCION_MEDICA" : ef);
      if (efNorm !== filtroTableroFlujo) return false;
    }
    return true;
  });

  if (countBadge) {
    if (hayFiltro && pacientesActivosEnCurso.length > 0) {
      countBadge.textContent = `${pacientesFiltrados.length} de ${pacientesActivosEnCurso.length} pacientes (filtrado)`;
      countBadge.style.background = "#e0f2fe";
      countBadge.style.color = "#0369a1";
    } else if (esLlegadaSimultanea && pacientesActivosEnCurso.length > 1) {
      countBadge.textContent = `${pacientesActivosEnCurso.length} Pacientes en atención simultánea (Desempate Activo)`;
      countBadge.style.background = "#eef2ff";
      countBadge.style.color = "#4338ca";
    } else {
      countBadge.textContent = `${pacientesActivosEnCurso.length} ${pacientesActivosEnCurso.length === 1 ? 'Paciente en atención activa' : 'Pacientes en atención activa'}`;
      countBadge.style.background = "";
      countBadge.style.color = "";
    }
  }

  if (pacientesActivosEnCurso.length === 0) {
    if (countBadge) {
      countBadge.textContent = "0 Pacientes en atención activa";
      countBadge.style.background = "#f1f5f9";
      countBadge.style.color = "#64748b";
    }
    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:10px; color:#64748b; font-size:0.78rem; width:100%;">
        <span style="font-size:1.2rem;">⏳</span>
        <div>
          <strong>Sin pacientes en atención activa:</strong> Los pacientes que reciben alta médica o liquidación formal se archivan en la Bandeja de Posta para trazabilidad histórica. Registre nuevos pacientes en espera o de atención rápida con los botones superiores.
        </div>
      </div>
    `;
    return;
  }

  if (pacientesFiltrados.length === 0) {
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 14px; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:10px; color:#64748b; font-size:0.78rem; width:100%;">
        <div>🔎 <strong>Sin coincidencias:</strong> Ningún paciente activo coincide con el filtro actual.</div>
        <button type="button" onclick="limpiarFiltrosTableroCola()" style="font-size:0.74rem; font-weight:700; padding:4px 10px; border:1px solid #0284c7; border-radius:6px; background:#eff6ff; color:#0369a1; cursor:pointer;">Ver todos</button>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  const badgesFlujo = {
    "PENDIENTE_TRIAJE": { bg: "#fef3c7", text: "#92400e", label: "⏳ Triaje Pendiente" },
    "ADMISION": { bg: "#e0f2fe", text: "#0369a1", label: "📋 Admisión" },
    "EN_ATENCION_MEDICA": { bg: "#f0fdf4", text: "#166534", label: "👨‍⚕️ Atención Médica" },
    "PENDIENTE_CAJA": { bg: "#fdf4ff", text: "#86198f", label: "💳 Pendiente Caja" },
    "CERRADO_FACTURADO": { bg: "#f1f5f9", text: "#475569", label: "🏁 Cerrado" },
    "ALTA_CLINICA": { bg: "#dcfce7", text: "#166534", label: "🏁 Alta Médica" }
  };

  pacientesFiltrados.forEach(p => {
    const esActivo = (p.id === pacienteActivoId);
    const tiempoEspera = formatearTiempoEspera(p.timestampLlegada);

    // Prioridad clínica: NUNCA asignar Prioridad 1 a un paciente en espera no evaluado
    let badgePrioHtml = "";
    let borderPrioColor = "#cbd5e1";

    if (p.prioridad && COLORES_PRIORIDAD[p.prioridad]) {
      const cfg = COLORES_PRIORIDAD[p.prioridad];
      borderPrioColor = cfg.border;
      badgePrioHtml = `<span class="card-prio-badge" style="background:${cfg.bg}; color:${cfg.text}; border:1px solid ${cfg.border}; font-weight:800; font-size:0.72rem; padding:2px 7px; border-radius:6px;">${cfg.label}</span>`;
    } else {
      borderPrioColor = "#cbd5e1";
      badgePrioHtml = `<span class="card-prio-badge" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-weight:700; font-size:0.72rem; padding:2px 7px; border-radius:6px;">⏳ Por Evaluar</span>`;
    }

    const estadoFlujoActual = p.estadoFlujo || "PENDIENTE_TRIAJE";
    const badgeFlujoCfg = badgesFlujo[estadoFlujoActual] || { bg: "#f1f5f9", text: "#475569", label: estadoFlujoActual };

    // Identificación concisa (solo datos importantes)
    const ticketStr = p.identificador || `Ticket T-${String(p.numero || 1).padStart(3, '0')}`;
    const nombreVisual = (p.nombre && !p.nombre.includes("Paciente #")) ? `${ticketStr} · ${p.nombre}` : (p.nombre || ticketStr);

    const card = document.createElement("div");
    card.className = `patient-queue-card ${esActivo ? 'active-card' : ''}`;
    card.style.borderLeft = `5px solid ${borderPrioColor}`;
    card.onclick = (e) => {
      // Si hizo clic en el botón de cerrar, no abrir detalle
      if (e.target.closest(".btn-close-card")) return;

      if (typeof window.seleccionarExpediente === "function") {
        window.seleccionarExpediente(p.id);
      } else {
        cambiarPacienteActivo(p.id);
      }
      // Al hacerle clic, mostrar todos los datos y su trazabilidad
      if (typeof abrirModalDetalleYTrazabilidad === "function") {
        abrirModalDetalleYTrazabilidad(p.id);
      }
    };

    card.innerHTML = `
      <div class="card-top-row" style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
        ${badgePrioHtml}
        <span class="card-timer" id="timer_px_${p.id}" style="font-size:0.72rem; font-weight:700; color:#64748b;" title="Tiempo desde su ingreso">⏱️ ${tiempoEspera}</span>
      </div>

      <div class="card-name" style="font-weight:800; font-size:0.83rem; color:#0f172a; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${nombreVisual}">
        ${p.esNN ? '🚨 ' : ''}${nombreVisual}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
        <span style="font-size:0.68rem; font-weight:700; background:${badgeFlujoCfg.bg}; color:${badgeFlujoCfg.text}; padding:2px 6px; border-radius:4px; border:1px solid rgba(0,0,0,0.06); display:inline-block;">
          ${badgeFlujoCfg.label}
        </span>
        <span style="font-size:0.70rem; color:#0284c7; font-weight:700; display:flex; align-items:center; gap:3px;">
          🔍 Clic: Trazabilidad ›
        </span>
      </div>

      <button type="button" class="btn-close-card" onclick="cerrarAtencionPaciente('${p.id}', event)" title="Finalizar atención activa / Dar de alta médica">&times;</button>
    `;

    container.appendChild(card);
  });

  if (typeof renderizarCarruselPreTriaje === "function") {
    renderizarCarruselPreTriaje();
  }
}

function sincronizarUIFinanciamientoPaciente(px) {
  if (!px) return;
  if (px.tipoSeguro) STATE.tipoSeguro = px.tipoSeguro;
  if (px.entornoOperativo) STATE.entornoOperativo = px.entornoOperativo;
  STATE.esClinicaPrivada = (STATE.entornoOperativo === "privado");
  if (px.planPrivado) STATE.planPrivado = px.planPrivado;
  if (px.planNivelEps) STATE.planNivelEps = px.planNivelEps;
  STATE.tipoIpressPublica = px.tipoIpressPublica || (STATE.tipoSeguro === "EsSalud" ? "ESSALUD" : (STATE.tipoSeguro === "Particular" ? "PARTICULAR" : "MINSA"));
  STATE.nroFua = px.nroFua || "";
  STATE.numerFua = px.nroFua || "";
  STATE.nroEssi = px.nroEssi || "";

  const selIpress = document.getElementById("select_ipress_publica");
  if (selIpress) selIpress.value = STATE.tipoIpressPublica;
  const selAsegPriv = document.getElementById("select_aseguradora_privada");
  if (selAsegPriv && (STATE.entornoOperativo === "privado" || String(STATE.tipoSeguro).includes("EPS"))) {
    const matchOpt = Array.from(selAsegPriv.options).find(o => o.value === STATE.tipoSeguro);
    if (matchOpt) selAsegPriv.value = STATE.tipoSeguro;
  }
  const selPlanPriv = document.getElementById("select_plan_privado");
  if (selPlanPriv && STATE.planPrivado) selPlanPriv.value = STATE.planPrivado;

  const boxIpress = document.getElementById("subselector_ipress_publica");
  const boxPlanPriv = document.getElementById("subselector_plan_privado");
  if (STATE.entornoOperativo === "privado") {
    if (boxIpress) boxIpress.style.display = "none";
    if (boxPlanPriv) boxPlanPriv.style.display = "flex";
  } else {
    if (boxIpress) boxIpress.style.display = "flex";
    if (boxPlanPriv) boxPlanPriv.style.display = "none";
  }
  if (typeof actualizarVisibilidadBotonesEntorno === "function") actualizarVisibilidadBotonesEntorno();
  if (typeof actualizarBotonesFormatoPublico === "function") actualizarBotonesFormatoPublico();
  if (typeof actualizarFactura === "function") actualizarFactura();
}
window.sincronizarUIFinanciamientoPaciente = sincronizarUIFinanciamientoPaciente;

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

  // 1. Restaurar STATE completo
  if (nuevoPx.stateSnapshot) {
    STATE = JSON.parse(JSON.stringify(nuevoPx.stateSnapshot));
    if (nuevoPx.coberturaValidada) STATE.coberturaValidada = true;
    if (nuevoPx.firmas) STATE.firmas = JSON.parse(JSON.stringify(nuevoPx.firmas));
    if (nuevoPx.estadoFlujo) STATE.estadoFlujo = nuevoPx.estadoFlujo;
    if (nuevoPx.estadoAtencion) STATE.estadoAtencion = nuevoPx.estadoAtencion;
    if (nuevoPx.terminoFlujo) STATE.terminoFlujo = nuevoPx.terminoFlujo;
  } else {
    limpiarFormularioCompletoState();
    STATE.identificador = nuevoPx.identificador;
    STATE.nombreReniec = nuevoPx.nombre;
    STATE.numDni = nuevoPx.dni;
    STATE.prioridad = nuevoPx.prioridad;
    STATE.colorPrioridad = nuevoPx.prioridad === 'I' ? 'ROJO' : nuevoPx.prioridad === 'II' ? 'NARANJA' : nuevoPx.prioridad === 'III' ? 'AMARILLO' : nuevoPx.prioridad === 'IV' ? 'VERDE' : nuevoPx.prioridad === 'V' ? 'AZUL' : null;
    STATE.coberturaValidada = Boolean(nuevoPx.coberturaValidada);
    STATE.estadoFlujo = nuevoPx.estadoFlujo || "PENDIENTE_TRIAJE";
    STATE.estadoAtencion = nuevoPx.estadoAtencion || "En Triaje";
  }

  // 2. Restaurar Inputs del Formulario DOM
  if (nuevoPx.formSnapshot && typeof aplicarFormulario === "function") {
    aplicarFormulario(nuevoPx.formSnapshot);
  }

  // Sincronizar seguro publico/privado (FUA, ESSI, EPS, Particular)
  sincronizarUIFinanciamientoPaciente(nuevoPx);

  // Sincronizar identificador y modalidad en Mod 1
  if (nuevoPx.modalidad) {
    STATE.modalidadIngreso = nuevoPx.modalidad;
    if (typeof selectModalidad === "function") selectModalidad(nuevoPx.modalidad);
  }
  const spanTkt = document.getElementById("lbl_ticket_mod1");
  if (spanTkt) spanTkt.textContent = nuevoPx.identificador || nuevoPx.nombre;

  // 3. Renderizar nuevamente el tablero para resaltar la tarjeta activa
  renderizarTableroColaPacientes();
  if (typeof renderizarTrackBoardLista === "function") renderizarTrackBoardLista();
  if (typeof renderizarTablaKardexEnfermeria === "function") renderizarTablaKardexEnfermeria();
  if (typeof actualizarTarjetaResumenMedico === "function") actualizarTarjetaResumenMedico();

  // 4. Navegar a la estación y fase asistencial correspondiente según el estado del paciente
  const flujoPx = nuevoPx.estadoFlujo || STATE.estadoFlujo || "PENDIENTE_TRIAJE";
  let targetFase = 1;
  let targetMod = 1;
  if (flujoPx === "PENDIENTE_TRIAJE") {
    targetFase = 1;
    targetMod = 1;
  } else if (flujoPx === "ADMISION" || flujoPx === "TRIAJE_COMPLETO" || flujoPx === "PENDIENTE_ADMISION") {
    targetFase = 2;
    targetMod = 3;
  } else if (flujoPx === "EN_ATENCION_MEDICA" || flujoPx === "ATENCIÓN_MÉDICA") {
    targetFase = 3;
    targetMod = 4;
  } else if (flujoPx === "PENDIENTE_CAJA" || flujoPx === "ALTA_CLINICA" || flujoPx === "CERRADO_FACTURADO") {
    targetFase = 4;
    targetMod = 8;
  }

  if (flujoPx === "PENDIENTE_TRIAJE" && !nuevoPx.triajeConcluido && !nuevoPx.formSnapshot) {
    if (typeof cerrarTodosLosModulos === "function") cerrarTodosLosModulos();
    if (typeof resetearModificadoresYSubsecciones === "function") resetearModificadoresYSubsecciones();
    moduloActivoActual = null;
    for (let i = 1; i <= 8; i++) {
      const btnTop = document.getElementById(`btnStepTop_${i}`);
      if (btnTop) btnTop.classList.remove("active");
    }
    if (window.COCKPIT && typeof window.COCKPIT.irAFase === "function") {
      window.COCKPIT.irAFase(1);
    }
  } else {
    if (window.COCKPIT && typeof window.COCKPIT.irAFase === "function") {
      window.COCKPIT.irAFase(targetFase);
    } else if (typeof irAModulo === "function") {
      irAModulo(targetMod);
    }
  }

  mostrarToastCola(`👤 Cambiado a: <strong>${nuevoPx.nombre}</strong> (${nuevoPx.identificador})`);
}

function crearNuevoPacienteEnBlanco() {
  guardarEstadoPacienteActivo();
  const nuevoPx = crearRegistroPaciente();
  PACIENTES_COLA.push(nuevoPx);
  pacienteActivoId = nuevoPx.id;
  limpiarFormularioCompletoState();
  if (typeof cerrarTodosLosModulos === "function") cerrarTodosLosModulos();
  if (typeof resetearModificadoresYSubsecciones === "function") resetearModificadoresYSubsecciones();
  moduloActivoActual = null;
  for (let i = 1; i <= 8; i++) {
    const btnTop = document.getElementById(`btnStepTop_${i}`);
    if (btnTop) btnTop.classList.remove("active");
  }
  renderizarTableroColaPacientes();
  mostrarToastCola(`➕ Ficha en blanco creada: <strong>${nuevoPx.nombre}</strong>`);
}

function cerrarAtencionPaciente(id, event) {
  if (event) event.stopPropagation();
  const px = (window.PACIENTES_COLA || []).find(x => x.id === id);
  if (!px) return;

  if (!confirm(`¿Desea dar alta médica y concluir atención de ${px.nombre}?\n\nEl paciente saldrá del carrusel activo pero se conservará en la Bandeja de Posta Clínica para trazabilidad y auditoría.`)) return;

  if (px.camaId && typeof liberarCamaRecurso === "function") {
    liberarCamaRecurso(px.camaId, "Alta de Emergencia");
  } else if (typeof liberarCamaTotalPaciente === "function") {
    liberarCamaTotalPaciente(id, "Alta de Emergencia / Cierre de Atención");
  }

  // Marcar formalmente como cerrado / alta (conservándose en la cola para la Bandeja de Posta)
  px.estadoFlujo = "CERRADO_FACTURADO";
  px.estadoAtencion = "Alta Médica / Cerrado";
  px.horaAlta = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  px.altaClinicaConcluida = true;
  px.terminoFlujo = true;
  px.camaId = null;
  px.camaNombre = null;

  const fnFinalizado = (typeof window.esPacienteFinalizado === "function")
    ? window.esPacienteFinalizado
    : (p => p && (p.terminoFlujo === true || p.altaClinicaConcluida === true || p.estadoFlujo === "CERRADO_FACTURADO" || p.estadoFlujo === "ALTA_CLINICA"));

  const pendientes = PACIENTES_COLA.filter(x => !fnFinalizado(x));
  if (pendientes.length === 0) {
    pacienteActivoId = null;
    limpiarFormularioCompletoState();
  } else if (pacienteActivoId === id) {
    pacienteActivoId = pendientes[0].id;
    cambiarPacienteActivo(pacienteActivoId);
  }

  try {
    localStorage.setItem("UPP_PACIENTES_COLA_SHARED", JSON.stringify(PACIENTES_COLA));
    localStorage.setItem("UPP_POSTA_LAST_EVENT", JSON.stringify({
      tipo: "EXPEDIENTE_ACTUALIZADO",
      idExpediente: id,
      estadoFlujo: "CERRADO_FACTURADO",
      timestamp: new Date().toISOString()
    }));
  } catch(e) {}

  renderizarTableroColaPacientes();
  if (typeof renderizarTrackBoardLista === "function") renderizarTrackBoardLista();
  if (typeof renderizarBandejaPosta === "function") renderizarBandejaPosta();
  if (typeof notificarCambioColaGlobal === "function") notificarCambioColaGlobal("ACTUALIZAR");
  mostrarToastCola(`✅ Alta médica procesada: <strong>${px.nombre}</strong> (archivado en Bandeja de Posta).`);
}

// ===========================================================================
// MODAL DE DETALLE CLÍNICO COMPLETO & TRAZABILIDAD (AL HACER CLIC EN EL TABLERO)
// Cumplimiento NTS N° 042-MINSA, Ley N° 29414, Ley N° 29733 y SUSALUD audit_logs
// ===========================================================================
function abrirModalDetalleYTrazabilidad(id) {
  const modal = document.getElementById("modal_detalle_trazabilidad_px");
  const body = document.getElementById("modal_detalle_trazabilidad_body");
  const title = document.getElementById("mod_trazabilidad_title");
  if (!modal || !body) return;

  const px = (PACIENTES_COLA || []).find(x => x.id === id);
  if (!px) return;

  const esActivo = (px.id === pacienteActivoId);
  const snap = (esActivo && STATE) ? STATE : (px.stateSnapshot || {});

  const identificador = px.identificador || `Ticket T-${String(px.numero || 1).padStart(3, '0')}`;
  const nombre = (esActivo && STATE.nombreReniec) ? STATE.nombreReniec : (px.nombre || "Desconocido");
  const dni = (esActivo && STATE.numDni) ? STATE.numDni : (px.dni || "Por registrar");
  const edad = (snap.edad !== null && snap.edad !== undefined) ? `${snap.edad} años` : (px.edad ? `${px.edad} años` : "Por registrar");
  const sexo = (snap.sexo === "F") ? "Femenino" : (snap.sexo === "M") ? "Masculino" : (px.sexo || "Desconocido");
  const seguro = snap.tipoSeguro || px.tipoSeguro || "SIS";
  const modalidad = px.modalidad || "A pie";

  // Prioridad y CTAS (NUNCA mostrar prioridad 1 si es un paciente en espera no clasificado)
  const prio = (esActivo && STATE.prioridad) ? STATE.prioridad : px.prioridad;
  let prioBadgeHtml = `<span style="background:#f1f5f9; color:#475569; padding:4px 10px; border-radius:6px; font-weight:800; border:1px solid #cbd5e1;">⏳ Sin Prioridad (Por evaluar en Módulo 1)</span>`;
  if (prio && COLORES_PRIORIDAD[prio]) {
    const c = COLORES_PRIORIDAD[prio];
    prioBadgeHtml = `<span style="background:${c.bg}; color:${c.text}; padding:4px 10px; border-radius:6px; font-weight:800; border:1px solid ${c.border};">Prioridad ${prio} · ${c.label}</span>`;
  }

  // Constantes fisiológicas
  const spo2 = (snap.spo2 !== null && snap.spo2 !== undefined) ? `${snap.spo2}%` : "--";
  const fc = (snap.fc !== null && snap.fc !== undefined) ? `${snap.fc} lpm` : "--";
  const pa = (snap.pasSistolica && snap.paDiastolica) ? `${snap.pasSistolica}/${snap.paDiastolica} mmHg` : "--";
  const fr = (snap.fr !== null && snap.fr !== undefined) ? `${snap.fr} rpm` : "--";
  const temp = (snap.temperatura !== null && snap.temperatura !== undefined) ? `${snap.temperatura} °C` : "--";
  const gcs = (snap.glasgow !== null && snap.glasgow !== undefined) ? `${snap.glasgow}/15` : "--";
  const gluc = (snap.glucosa !== null && snap.glucosa !== undefined) ? `${snap.glucosa} mg/dL` : "--";
  const eva = (snap.eva !== null && snap.eva !== undefined) ? `${snap.eva}/10` : "--";
  const motivo = snap.motivoConsulta || px.motivo || "Sin motivo registrado aún";
  const cie10 = snap.diagnosticoCIE10 || px.cie10 || "Pendiente de diagnóstico médico (Módulo 4)";
  const cama = snap.camaAsignada || px.camaNombre || "Sin cama física (En espera de evaluación médica)";
  const medico = snap.medicoTratante || px.medico || "Por asignar";

  // Trazabilidad de Timestamps
  const horaArribo = px.horaLlegada || (px.timestampLlegada ? new Date(px.timestampLlegada).toLocaleTimeString() : "--");
  const tiempoTranscurrido = formatearTiempoEspera(px.timestampLlegada);

  // Filtrar logs de auditoría para este paciente
  let logsHistorial = AUDIT_LOGS || [];
  try {
    const raw = localStorage.getItem("AUDIT_LOGS_HISTORIAL");
    if (raw) logsHistorial = JSON.parse(raw);
  } catch(e){}

  const logsPx = logsHistorial.filter(l => {
    return (l.dni && dni && l.dni === dni) || (l.detalle && (l.detalle.includes(identificador) || l.detalle.includes(px.id)));
  });

  if (title) title.textContent = `Expediente & Trazabilidad: ${identificador} (${nombre})`;

  body.innerHTML = `
    <!-- 1. Encabezado de Filiación Rápida -->
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
        <div>
          <div style="font-size:1.1rem; font-weight:800; color:#0f172a;">${identificador} · ${nombre}</div>
          <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">
            DNI: <strong style="color:#0284c7;">${dni}</strong> | Edad: <strong>${edad}</strong> | Sexo: <strong>${sexo}</strong> | Arribo: <strong>${modalidad}</strong>
          </div>
        </div>
        <div>
          ${prioBadgeHtml}
        </div>
      </div>
      <div style="display:flex; gap:12px; margin-top:8px; font-size:0.75rem; color:#475569; flex-wrap:wrap;">
        <span>Financiador: <strong style="color:#0f172a;">${seguro}</strong></span>
        <span>•</span>
        <span>Doc. Asistencial: <strong style="color:#0284c7;">${(seguro === "EsSalud" || snap.tipoIpressPublica === "ESSALUD") ? (snap.nroEssi || px.nroEssi || STATE.nroEssi || "ESSI-Pendiente") : (snap.nroFua || px.nroFua || STATE.nroFua || "FUA-Pendiente")}</strong></span>
        <span>•</span>
        <span>Ubicación/Cama: <strong style="color:#15803d;">${cama}</strong></span>
        <span>•</span>
        <span>Médico: <strong style="color:#0369a1;">${medico}</strong></span>
        <span>•</span>
        <span>Tiempo en Espera: <strong style="color:#b45309;">⏱️ ${tiempoTranscurrido}</strong></span>
      </div>
    </div>

    <!-- 2. Constantes Fisiológicas de Triaje CTAS -->
    <div style="margin-bottom:14px;">
      <div style="font-size:0.80rem; font-weight:800; color:#334155; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">
        🩺 Constantes Fisiológicas (Modificadores CTAS)
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(85px, 1fr)); gap:6px;">
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:0.68rem; color:#64748b; font-weight:700;">SpO2</div>
          <div style="font-size:0.95rem; font-weight:800; color:#0284c7;">${spo2}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:0.68rem; color:#64748b; font-weight:700;">FC</div>
          <div style="font-size:0.95rem; font-weight:800; color:#0f172a;">${fc}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:0.68rem; color:#64748b; font-weight:700;">PA Art.</div>
          <div style="font-size:0.95rem; font-weight:800; color:#0f172a;">${pa}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:0.68rem; color:#64748b; font-weight:700;">FR</div>
          <div style="font-size:0.95rem; font-weight:800; color:#0f172a;">${fr}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:0.68rem; color:#64748b; font-weight:700;">Temp.</div>
          <div style="font-size:0.95rem; font-weight:800; color:#0f172a;">${temp}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:0.68rem; color:#64748b; font-weight:700;">Glasgow</div>
          <div style="font-size:0.95rem; font-weight:800; color:#0f172a;">${gcs}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:0.68rem; color:#64748b; font-weight:700;">Glucemia</div>
          <div style="font-size:0.95rem; font-weight:800; color:#0f172a;">${gluc}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:0.68rem; color:#64748b; font-weight:700;">EVA Dolor</div>
          <div style="font-size:0.95rem; font-weight:800; color:#0f172a;">${eva}</div>
        </div>
      </div>
      <div style="margin-top:8px; font-size:0.75rem; background:#f8fafc; padding:8px 10px; border-radius:6px; border:1px solid #e2e8f0;">
        <strong>Motivo de Ingreso / Queja:</strong> ${motivo}
      </div>
    </div>

    <!-- 3. Línea de Tiempo de Fases Asistenciales (Timestamps) -->
    <div style="margin-bottom:14px;">
      <div style="font-size:0.80rem; font-weight:800; color:#334155; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">
        ⏱️ Línea de Tiempo &amp; Flujo Asistencial (NTS N° 042-MINSA)
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px;">
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-top:3px solid #0284c7; border-radius:8px; padding:8px;">
          <div style="font-size:0.70rem; font-weight:800; color:#0284c7;">1. Arribo Sala</div>
          <div style="font-size:0.76rem; font-weight:700; color:#0f172a; margin-top:2px;">🕒 ${horaArribo}</div>
          <div style="font-size:0.68rem; color:#64748b;">Registrado en espera</div>
        </div>
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-top:3px solid ${prio ? '#10b981' : '#cbd5e1'}; border-radius:8px; padding:8px;">
          <div style="font-size:0.70rem; font-weight:800; color:${prio ? '#059669' : '#64748b'};">2. Triaje CTAS</div>
          <div style="font-size:0.76rem; font-weight:700; color:#0f172a; margin-top:2px;">${prio ? '✓ Clasificado' : '⏳ Pendiente'}</div>
          <div style="font-size:0.68rem; color:#64748b;">${prio ? `Nivel P-${prio}` : 'En sala de espera'}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-top:3px solid ${snap.coberturaValidada ? '#10b981' : '#cbd5e1'}; border-radius:8px; padding:8px;">
          <div style="font-size:0.70rem; font-weight:800; color:${snap.coberturaValidada ? '#059669' : '#64748b'};">3. Admisión / Seguro</div>
          <div style="font-size:0.76rem; font-weight:700; color:#0f172a; margin-top:2px;">${snap.coberturaValidada ? '✓ Validado' : '⏳ Pendiente'}</div>
          <div style="font-size:0.68rem; color:#64748b;">${seguro}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-top:3px solid ${snap.cie10 || snap.diagnosticoCIE10 ? '#10b981' : '#cbd5e1'}; border-radius:8px; padding:8px;">
          <div style="font-size:0.70rem; font-weight:800; color:${snap.cie10 || snap.diagnosticoCIE10 ? '#059669' : '#64748b'};">4. Atención Médica</div>
          <div style="font-size:0.76rem; font-weight:700; color:#0f172a; margin-top:2px;">${snap.cie10 || snap.diagnosticoCIE10 ? '✓ Evaluado' : '⏳ En curso'}</div>
          <div style="font-size:0.68rem; color:#64748b;">${String(cie10).substring(0, 20)}...</div>
        </div>
      </div>
    </div>

    <!-- 4. Bitácora Inmutable de Auditoría SUSALUD (audit_logs) -->
    <div style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div style="font-size:0.80rem; font-weight:800; color:#334155; text-transform:uppercase; letter-spacing:0.5px;">
          🛡️ Bitácora Inmutable de Auditoría SUSALUD (audit_logs)
        </div>
        <span style="font-size:0.70rem; color:#64748b;">Ley N° 29733 &amp; NTS N° 139-MINSA</span>
      </div>
      <div style="max-height:160px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">
        ${logsPx.length > 0 ? `
          <table style="width:100%; border-collapse:collapse; font-size:0.72rem; text-align:left;">
            <thead>
              <tr style="background:#0f172a; color:#ffffff;">
                <th style="padding:6px 8px;">Hora</th>
                <th style="padding:6px 8px;">Rol</th>
                <th style="padding:6px 8px;">Evento</th>
                <th style="padding:6px 8px;">Detalle</th>
              </tr>
            </thead>
            <tbody>
              ${logsPx.map((l, i) => `
                <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'}; border-bottom:1px solid #e2e8f0;">
                  <td style="padding:5px 8px; font-family:monospace; color:#64748b;">${l.timestamp}</td>
                  <td style="padding:5px 8px; font-weight:700;">${l.rol}</td>
                  <td style="padding:5px 8px; font-weight:700; color:#0284c7;">${l.evento}</td>
                  <td style="padding:5px 8px; color:#334155;">${l.detalle}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `
          <div style="padding:14px; text-align:center; color:#94a3b8; font-size:0.75rem;">
            No se registran eventos críticos de auditoría previos para este paciente (Paciente recién ingresado).
          </div>
        `}
      </div>
    </div>

    <!-- 5. Acciones al pie -->
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:14px; border-top:1px solid #e2e8f0; padding-top:12px;">
      <div style="display:flex; gap:8px;">
        <button type="button" class="btn-full-secondary" style="padding:8px 14px; font-weight:700; font-size:0.78rem;" onclick="imprimirBrazaleteDirecto ? imprimirBrazaleteDirecto() : imprimirBrazalete()">
          🏷️ Imprimir Pulsera QR
        </button>
        <button type="button" class="btn-full-secondary" style="padding:8px 14px; font-weight:700; font-size:0.78rem; background:#f0fdf4; color:#166534; border:1px solid #bbf7d0;" onclick="imprimirFormatoPublicoSegunRegimen()">
          ${(seguro === "EsSalud" || snap.tipoIpressPublica === "ESSALUD") ? '📄 Formato ESSI (EsSalud)' : '📄 Formato FUA (MINSA/SIS)'}
        </button>
      </div>
      <div style="display:flex; gap:8px;">
        <button type="button" class="btn-full-secondary" style="padding:8px 16px; font-weight:700; font-size:0.78rem;" onclick="cerrarModalDetalleYTrazabilidad()">
          ✕ Cerrar
        </button>
        <button type="button" class="btn-full-primary" style="padding:8px 18px; font-weight:800; font-size:0.78rem;" onclick="irAAtencionDirectaPaciente('${px.id}')">
          🩺 Ir a Atender Paciente
        </button>
      </div>
    </div>
  `;

  modal.style.display = "flex";
}

function cerrarModalDetalleYTrazabilidad() {
  const m = document.getElementById("modal_detalle_trazabilidad_px");
  if (m) m.style.display = "none";
}

function irAAtencionDirectaPaciente(id) {
  cerrarModalDetalleYTrazabilidad();
  if (typeof cambiarPacienteActivo === "function") {
    cambiarPacienteActivo(id);
  }
}
window.abrirModalDetalleYTrazabilidad = abrirModalDetalleYTrazabilidad;
window.cerrarModalDetalleYTrazabilidad = cerrarModalDetalleYTrazabilidad;
window.irAAtencionDirectaPaciente = irAAtencionDirectaPaciente;

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

function obtenerModalidadIngresoVariada(num) {
  const modalidades = ["A pie", "Ambulancia", "Policía / Serenazgo", "Particular"];
  const idx = Math.abs((parseInt(num, 10) || 1) - 1) % modalidades.length;
  return modalidades[idx];
}
window.obtenerModalidadIngresoVariada = obtenerModalidadIngresoVariada;

function completarPreTriageSTART(prio, motivo) {
  cerrarModalPreTriageSTART();
  guardarEstadoPacienteActivo();

  const num = contadorSecuencialPx++;
  const ticket = `T-START-${String(num).padStart(3, '0')}`;
  const nombrePx = `Paciente ${ticket} (Pre-Triage Cola)`;
  const modalidadLlegada = obtenerModalidadIngresoVariada(num);
  const esInmediato = (prio === 'I');

  const px = crearRegistroPaciente({
    numero: num,
    identificador: ticket,
    nombre: nombrePx,
    prioridad: prio,
    motivo: `Pre-Triage START: ${motivo}`,
    modalidad: modalidadLlegada,
    estadoFlujo: esInmediato ? "EN_ATENCION_MEDICA" : "PENDIENTE_TRIAJE",
    estadoAtencion: esInmediato ? "Shock Trauma (Atención Inmediata)" : `En Espera de Triaje (Pre-Triage P-${prio})`
  });
  px.triajeConcluido = esInmediato;

  esLlegadaSimultanea = false;
  if (!Array.isArray(PACIENTES_COLA)) PACIENTES_COLA = [];
  PACIENTES_COLA.push(px);
  pacienteActivoId = px.id;
  window.pacienteActivoId = px.id;

  limpiarFormularioCompletoState();
  STATE.identificador = ticket;
  STATE.nombreReniec = nombrePx;
  STATE.prioridad = prio;
  STATE.motivoConsulta = `Pre-Triage START: ${motivo}`;
  STATE.modalidadIngreso = modalidadLlegada;
  STATE.estadoFlujo = px.estadoFlujo;
  STATE.estadoAtencion = px.estadoAtencion;
  STATE.historiaClinica = `HC-2026-${ticket}`;
  if (typeof sincronizarUIFinanciamientoPaciente === "function") {
    sincronizarUIFinanciamientoPaciente(px);
  }
  if (typeof selectModalidad === "function") {
    selectModalidad(modalidadLlegada);
  }

  const elIdent = document.getElementById("ident_full");
  if (elIdent) elIdent.value = ticket;
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = STATE.motivoConsulta;

  if (typeof mostrarPrioridad === "function") {
    mostrarPrioridad(prio, {
      tipo: PRIORIDADES[prio]?.nombre || `Prioridad P-${prio}`,
      desc: motivo,
      destino: esInmediato ? 'Shock Trauma (Inmediato)' : 'Cola de Espera para Triaje'
    });
  }

  px.prioridad = prio;
  px.stateSnapshot = JSON.parse(JSON.stringify(STATE));
  px.formSnapshot = capturarFormularioActual();

  if (typeof renderizarCarruselPreTriaje === "function") renderizarCarruselPreTriaje();
  if (typeof limpiarFiltrosTableroCola === "function") limpiarFiltrosTableroCola();
  else renderizarTableroColaPacientes();
  mostrarToastCola(
    esInmediato
      ? `🚨 <strong>Atención Inmediata (P-I):</strong> ${ticket} (${modalidadLlegada}) derivado directo a Shock Trauma.`
      : `⏳ <strong>Cola de Espera (P-${prio}):</strong> ${ticket} (${modalidadLlegada}) ingresado a la cola tras Pre-Triage.`
  );
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
    toast.style.cssText = "position:fixed; top:54px; right:20px; z-index:99999; background:#0f172a; color:#ffffff; padding:12px 18px; border-radius:10px; border-left:4px solid #0284c7; box-shadow:0 8px 24px rgba(0,0,0,0.3); font-size:0.85rem; max-width:360px; transition:all 0.3s ease;";
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

function registrarPacienteEnEspera(modalidadForzada) {
  // 1. Guardar de forma segura el paciente que estaba activo previamente
  guardarEstadoPacienteActivo();

  // 2. Generar ticket y registro único para el nuevo paciente en espera (variando forma de llegada)
  const num = contadorSecuencialPx++;
  const ticketStr = `Ticket T-${String(num).padStart(3, '0')}`;
  const nombrePx = `Paciente #${num} (En Espera)`;
  const idPx = `PX-ESP-${num}-${Date.now().toString(36).slice(-4)}`;
  const modalidadLlegada = (typeof modalidadForzada === "string" && modalidadForzada.trim())
    ? modalidadForzada.trim()
    : obtenerModalidadIngresoVariada(num);

  const nuevoPx = crearRegistroPaciente({
    numero: num,
    id: idPx,
    identificador: ticketStr,
    nombre: nombrePx,
    prioridad: null,
    estadoAtencion: "En Espera de Triaje",
    modalidad: modalidadLlegada
  });

  esLlegadaSimultanea = false;

  // 3. Añadir a la cola persistente (NUNCA pisar ni vaciar a los pacientes existentes)
  if (!Array.isArray(PACIENTES_COLA)) {
    PACIENTES_COLA = [];
  }
  PACIENTES_COLA.push(nuevoPx);

  // 4. Activar el nuevo paciente
  pacienteActivoId = nuevoPx.id;
  window.pacienteActivoId = nuevoPx.id;

  // 5. Limpiar completamente el formulario y preparar campos para ingreso manual
  limpiarFormularioCompletoState();
  STATE.identificador = ticketStr;
  STATE.nombreReniec = "";
  STATE.numDni = "";
  STATE.prioridad = null;
  STATE.prioridadCTAS = null;
  STATE.colorPrioridad = null;
  STATE.ctasNivel = null;
  STATE.resultadoTriajeEstandar = null;
  STATE.camaAsignada = null;
  STATE.camaAsignadaId = null;
  STATE.estadoFlujo = "PENDIENTE_TRIAJE";
  STATE.estadoAtencion = "En Espera de Triaje";
  STATE.historiaClinica = `HC-2026-${String(num).padStart(4, '0')}`;
  STATE.modalidadIngreso = modalidadLlegada;
  if (typeof selectModalidad === "function") {
    selectModalidad(modalidadLlegada);
  }
  if (typeof sincronizarUIFinanciamientoPaciente === "function") {
    sincronizarUIFinanciamientoPaciente(nuevoPx);
  }

  if (typeof limpiarPrioridadUI === "function") {
    limpiarPrioridadUI();
  }

  // Garantizar que ningún indicador visual muestre Prioridad 1 ni ninguna prioridad previa
  const chipLive = document.getElementById("chipPrioLive");
  if (chipLive) {
    chipLive.textContent = "Sin Prioridad (Por evaluar)";
    chipLive.className = "top-prio-chip";
    chipLive.style.background = "#f1f5f9";
    chipLive.style.color = "#64748b";
    chipLive.style.border = "1px solid #cbd5e1";
  }
  const miniPrio = document.getElementById("mini_prioridad_badge");
  if (miniPrio) {
    miniPrio.textContent = "🚦 Triaje: Por evaluar";
    miniPrio.style.background = "#f1f5f9";
    miniPrio.style.color = "#64748b";
  }
  const pxPrio = document.getElementById("cockpit_pill_prioridad");
  if (pxPrio) {
    pxPrio.className = "ui-badge-pill";
    pxPrio.textContent = "⏳ Sin Prioridad (Por evaluar)";
    pxPrio.style.background = "#f1f5f9";
    pxPrio.style.color = "#64748b";
    pxPrio.style.border = "1px solid #cbd5e1";
  }
  const elPrioDisplay = document.getElementById("prioridad_display");
  if (elPrioDisplay) elPrioDisplay.style.display = "none";
  const elPrioNum = document.getElementById("prio_numero");
  if (elPrioNum) elPrioNum.textContent = "--";
  const elPrioTipo = document.getElementById("prio_tipo");
  if (elPrioTipo) elPrioTipo.textContent = "PRIORIDAD --";
  const elPrioDest = document.getElementById("prio_destino");
  if (elPrioDest) elPrioDest.textContent = "Destino: Por evaluar";

  const elIdent = document.getElementById("ident_full");
  if (elIdent) elIdent.value = ticketStr;
  const elDni = document.getElementById("dni_mod1");
  if (elDni) { elDni.value = ""; elDni.focus(); }
  const elDniReniec = document.getElementById("dni_reniec_input");
  if (elDniReniec) elDniReniec.value = "";
  const elMotivo = document.getElementById("motivo_full");
  if (elMotivo) elMotivo.value = "";
  const hcCode = document.getElementById("hc_code_display");
  if (hcCode) hcCode.textContent = STATE.historiaClinica;
  const hcBadge = document.getElementById("hc_badge_estado");
  if (hcBadge) {
    hcBadge.textContent = "Nuevo Ingreso";
    hcBadge.className = "badge-estado";
  }

  if (typeof bloquearIdentificacionEnMod2 === "function") bloquearIdentificacionEnMod2(false);
  window._identificacionOrigen = null;

  // 6. Guardar snapshot inicial limpio del nuevo paciente
  nuevoPx.stateSnapshot = JSON.parse(JSON.stringify(STATE));
  nuevoPx.formSnapshot = capturarFormularioActual();

  // 7. Renderizar panel lateral de la izquierda y cola de espera con todos los pacientes
  renderizarTableroColaPacientes();
  if (typeof renderizarCarruselPreTriaje === "function") renderizarCarruselPreTriaje();
  if (typeof actualizarTarjetaResumenMedico === "function") actualizarTarjetaResumenMedico();

  // Al empezar nueva atención: todas las pestañas no desglosadas y modificadores cerrados
  if (typeof cerrarTodosLosModulos === "function") cerrarTodosLosModulos();
  if (typeof resetearModificadoresYSubsecciones === "function") resetearModificadoresYSubsecciones();
  moduloActivoActual = null;
  for (let i = 1; i <= 8; i++) {
    const btnTop = document.getElementById(`btnStepTop_${i}`);
    if (btnTop) btnTop.classList.remove("active");
  }
  mostrarToastCola(`👤 <strong>Nuevo Paciente en Espera:</strong> ${ticketStr} registrado. Seleccione o desglose el módulo para iniciar.`);
}
window.registrarPacienteEnEspera = registrarPacienteEnEspera;
window.crearRegistroPaciente = crearRegistroPaciente;

function inicializarTableroColaPacientes() {
  // Inicia 100% en blanco: NO coloca automáticamente ningún paciente en espera
  renderizarTableroColaPacientes();
  if (typeof renderizarCarruselPreTriaje === "function") {
    renderizarCarruselPreTriaje();
  }

  if (!intervalCronometrosCola) {
    intervalCronometrosCola = setInterval(() => {
      PACIENTES_COLA.forEach(p => {
        const elTimer = document.getElementById(`timer_px_${p.id}`);
        if (elTimer) {
          elTimer.textContent = `⏱️ ${formatearTiempoEspera(p.timestampLlegada)}`;
        }
      });
      if (typeof actualizarCronometrosPreTriaje === "function") {
        actualizarCronometrosPreTriaje();
      }
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

function migrarHistoriaClinicaTemporalADefinitiva(hcTemporal, numDni, nombre) {
  if (!numDni || !/^\d{8}$/.test(String(numDni).trim())) return STATE.historiaClinica;
  const dni = String(numDni).trim();
  const hcDef = (typeof BASE_DATOS_HC !== "undefined" && BASE_DATOS_HC[dni]) ? BASE_DATOS_HC[dni] : `HC-2026-${dni.slice(-4)}`;
  const nomFinal = (nombre || STATE.nombreReniec || `PACIENTE DNI ${dni}`).toUpperCase();

  try {
    const master = cargarPacientesMaster();
    const kTemp = hcTemporal ? normalizarClavePaciente(hcTemporal) : null;
    const kDef = normalizarClavePaciente(hcDef);
    const kDni = normalizarClavePaciente(dni);
    const regTemp = (kTemp && master[kTemp]) ? master[kTemp] : null;
    const regDef = master[kDni] || master[kDef] || {
      identificador: dni,
      dni: dni,
      historia_clinica: hcDef,
      nombre_completo: nomFinal,
      tipo_seguro: STATE.tipoSeguro || "Particular",
      episodios: []
    };

    if (regTemp && regTemp !== regDef) {
      if (Array.isArray(regTemp.episodios) && regTemp.episodios.length > 0) {
        regDef.episodios = [...regTemp.episodios, ...(regDef.episodios || [])];
      }
      if (regTemp.ultimo_episodio) {
        regTemp.ultimo_episodio.historia_clinica = hcDef;
        regTemp.ultimo_episodio.identificador = dni;
        regTemp.ultimo_episodio.nombre_completo = nomFinal;
        regTemp.ultimo_episodio.es_nn = false;
        regDef.ultimo_episodio = regTemp.ultimo_episodio;
      }
      if (regTemp.alergias && !regDef.alergias) regDef.alergias = regTemp.alergias;
      if (kTemp && kTemp !== kDef && kTemp !== kDni) delete master[kTemp];
    }

    regDef.identificador = dni;
    regDef.dni = dni;
    regDef.historia_clinica = hcDef;
    regDef.nombre_completo = nomFinal;
    master[kDni] = regDef;
    master[kDef] = regDef;
    guardarPacientesMaster(master);

    // Migrar también en historial global de episodios si existiera la HC temporal
    [STORAGE_KEY_HISTORIAL_EPISODIOS, "UPP_HISTORIAL_EPISODIOS"].forEach(kHist => {
      try {
        const arr = JSON.parse(localStorage.getItem(kHist) || "[]");
        if (Array.isArray(arr) && hcTemporal) {
          let changed = false;
          arr.forEach(ep => {
            if (ep.historia_clinica === hcTemporal) {
              ep.historia_clinica = hcDef;
              ep.identificador = dni;
              ep.nombre_completo = nomFinal;
              changed = true;
            }
          });
          if (changed) localStorage.setItem(kHist, JSON.stringify(arr));
        }
      } catch(e){}
    });

    if (typeof BASE_DATOS_HC !== "undefined") {
      BASE_DATOS_HC[dni] = hcDef;
      BASE_DATOS_HC[nomFinal.toLowerCase()] = hcDef;
      localStorage.setItem("UPP_BASE_DATOS_HC", JSON.stringify(BASE_DATOS_HC));
    }
  } catch (e) {}

  STATE.esNN = false;
  STATE.numDni = dni;
  STATE.nombreReniec = nomFinal;
  STATE.identificador = `${nomFinal} (DNI ${dni})`;
  STATE.historiaClinica = hcDef;

  if (typeof pacienteActivoId !== "undefined" && pacienteActivoId && Array.isArray(PACIENTES_COLA)) {
    const px = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
    if (px) {
      px.esNN = false;
      px.dni = dni;
      px.nombre = nomFinal;
      px.identificador = STATE.identificador;
      px.historiaClinica = hcDef;
      if (px.stateSnapshot) {
        px.stateSnapshot.esNN = false;
        px.stateSnapshot.numDni = dni;
        px.stateSnapshot.nombreReniec = nomFinal;
        px.stateSnapshot.identificador = STATE.identificador;
        px.stateSnapshot.historiaClinica = hcDef;
      }
    }
  }

  if (typeof autoGuardarCambioEnHistoriaClinica === "function") {
    autoGuardarCambioEnHistoriaClinica(`Identificación confirmada: ${hcTemporal || 'HC-TEMP'} -> ${hcDef}`);
  }
  return hcDef;
}
window.migrarHistoriaClinicaTemporalADefinitiva = migrarHistoriaClinicaTemporalADefinitiva;

function sincronizarDatosPacienteEnTodosLosModulos(datos = {}) {
  const dni = datos.dni || STATE.numDni || "";
  const nombre = (datos.nombre || STATE.nombreReniec || "").toUpperCase();
  const sexo = datos.sexo || STATE.sexo || "M";
  let hc = datos.hc || STATE.historiaClinica || "—";
  const tieneDniValido = /^\d{8}$/.test(String(dni).trim());
  if (tieneDniValido && (STATE.esNN || String(hc).includes("TEMP") || hc === "—")) {
    hc = migrarHistoriaClinicaTemporalADefinitiva(hc, dni, nombre);
  }
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

  // 4. Sincronizar con paciente activo en el Tablero de Atención Simultánea y Carrusel Superior
  if (pacienteActivoId && Array.isArray(PACIENTES_COLA)) {
    const px = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
    if (px && nombre) {
      px.nombre = nombre;
      px.dni = dni;
      px.identificador = `${nombre} (DNI ${dni})`;
      if (px.stateSnapshot) {
        px.stateSnapshot.nombreReniec = nombre;
        px.stateSnapshot.numDni = dni;
        px.stateSnapshot.identificador = `${nombre} (DNI ${dni})`;
      }
      renderizarTableroColaPacientes();
      if (typeof renderizarCarruselPacientesActivos === "function") {
        renderizarCarruselPacientesActivos();
      }
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
  let dni = elDni ? elDni.value.trim() : "";
  if (!dni || !dni.match(/\d{8}/)) {
    const elIdent = document.getElementById("ident_full");
    const mIdent = elIdent ? elIdent.value.replace(/[\s\.\-]/g, "").match(/\d{8}/) : null;
    if (mIdent) {
      dni = mIdent[0];
      if (elDni) elDni.value = dni;
    } else if (STATE.numDni && /^\d{8}$/.test(String(STATE.numDni).trim())) {
      dni = String(STATE.numDni).trim();
      if (elDni) elDni.value = dni;
    } else {
      const promptVal = prompt("Ingrese el número de DNI de 8 dígitos para consultar en RENIEC (Módulo 1):", "");
      if (promptVal) {
        const pMatch = promptVal.replace(/[\s\.\-]/g, "").match(/\d{8}/);
        if (pMatch) {
          dni = pMatch[0];
          if (elDni) elDni.value = dni;
        }
      }
    }
  }
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

    await consultarReniec(dni);

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
  // Simulación asíncrona de latencia de red SITEDS/SUSALUD (150ms)
  await new Promise(r => setTimeout(r, 150));

  const numDni = String(dni || "").replace(/\D/g, "");
  if (!numDni || numDni.length < 3) {
    return {
      dni: numDni,
      tipo_aseguramiento: "PARTICULAR",
      condicion_evento: "NORMAL",
      publico: { entidad: "PARTICULAR", regimen: "Sin seguro público registrado", estado: "INACTIVO", codigo: "SIN-FUA" },
      privado: { iafas_eps: "PARTICULAR", estado_poliza: "INACTIVA", copago_fijo: 100, coaseguro_pct: 1.0, plan_nivel: "Base", exclusiones: [] }
    };
  }

  // 1. Persistencia por DNI en memoria de sesión y localStorage (Cero aleatoriedad fluctuante)
  window._sitedsCache = window._sitedsCache || {};
  const cacheKey = "SITEDS_PADRON_DNI_" + numDni;
  if (window._sitedsCache[numDni]) {
    return window._sitedsCache[numDni];
  }
  try {
    const rawLocal = localStorage.getItem(cacheKey);
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      window._sitedsCache[numDni] = parsed;
      return parsed;
    }
  } catch (e) {}

  // 2. Determinismo criptográfico por hash numérico del DNI para asignar 1 de los 8 perfiles
  let hash = 0;
  for (let i = 0; i < numDni.length; i++) {
    hash = (hash * 31 + numDni.charCodeAt(i)) % 1000000;
  }
  const perfilIdx = hash % 8; // 0 a 7 exactos

  const rndCode = 1000 + (hash % 8999);
  const rndPoliza = 100000 + (hash % 899999);
  const planes = ["Base", "Intermedio", "VIP"];
  const planElegido = planes[hash % 3];

  let padron = null;

  switch (perfilIdx) {
    case 0:
      // 1. SIS (FUA)
      padron = {
        dni: numDni,
        tipo_aseguramiento: "SOLO_SIS",
        condicion_evento: "NORMAL",
        publico: {
          entidad: "SIS",
          regimen: "SIS Gratuito / Para Todos (NTS N° 042 / FUA)",
          estado: "ACTIVO",
          codigo: `FUA-2026-${rndCode}`
        },
        privado: {
          iafas_eps: "SIN COBERTURA PRIVADA (AFILIADO SIS)",
          estado_poliza: "INACTIVA",
          copago_fijo: 0,
          copago_fijo_urgencia: 0,
          copago_fijo_emergencia: 0,
          coaseguro_pct: 0,
          coaseguro_farmacia_pct: 0,
          coaseguro_procedimientos_pct: 0,
          plan_nivel: "Base",
          exclusiones: []
        }
      };
      break;

    case 1:
      // 2. EsSalud (ESSI)
      padron = {
        dni: numDni,
        tipo_aseguramiento: "SOLO_ESSALUD",
        condicion_evento: "NORMAL",
        publico: {
          entidad: "ESSALUD",
          regimen: "EsSalud Regular Titular (Acreditación ESSI)",
          estado: "ACTIVO",
          codigo: `AUT-ESSI-${rndCode}`
        },
        privado: {
          iafas_eps: "SIN COBERTURA EPS (SOLO ESSALUD)",
          estado_poliza: "INACTIVA",
          copago_fijo: 0,
          copago_fijo_urgencia: 0,
          copago_fijo_emergencia: 0,
          coaseguro_pct: 0,
          coaseguro_farmacia_pct: 0,
          coaseguro_procedimientos_pct: 0,
          plan_nivel: "Base",
          exclusiones: []
        }
      };
      break;

    case 2:
      // 3. Particular (Sin seguro)
      padron = {
        dni: numDni,
        tipo_aseguramiento: "PARTICULAR",
        condicion_evento: "NORMAL",
        publico: {
          entidad: "PARTICULAR",
          regimen: "Sin cobertura pública vigente",
          estado: "INACTIVO",
          codigo: "SIN-FUA"
        },
        privado: {
          iafas_eps: "PARTICULAR",
          estado_poliza: "INACTIVA",
          copago_fijo: 0,
          copago_fijo_urgencia: 0,
          copago_fijo_emergencia: 0,
          coaseguro_pct: 1.0,
          coaseguro_farmacia_pct: 1.0,
          coaseguro_procedimientos_pct: 1.0,
          plan_nivel: "Base",
          exclusiones: []
        }
      };
      break;

    case 3:
      // 4. Pacífico EPS
      padron = crearPerfilEPS("Pacífico EPS", numDni, rndCode, rndPoliza, planElegido, hash);
      break;

    case 4:
      // 5. Rímac EPS
      padron = crearPerfilEPS("Rímac EPS", numDni, rndCode, rndPoliza, planElegido, hash);
      break;

    case 5:
      // 6. Mapfre EPS
      padron = crearPerfilEPS("Mapfre EPS", numDni, rndCode, rndPoliza, planElegido, hash);
      break;

    case 6:
      // 7. Sanitas EPS
      padron = crearPerfilEPS("Sanitas EPS", numDni, rndCode, rndPoliza, planElegido, hash);
      break;

    case 7:
    default:
      // 8. La Positiva
      padron = crearPerfilEPS("La Positiva", numDni, rndCode, rndPoliza, planElegido, hash);
      break;
  }

  // Guardar en caché y localStorage para persistencia inmutable
  window._sitedsCache[numDni] = padron;
  try {
    localStorage.setItem(cacheKey, JSON.stringify(padron));
  } catch (e) {}

  return padron;
}

function crearPerfilEPS(nombreAseguradora, numDni, rndCode, rndPoliza, planNivel, hash) {
  // Matriz exacta de planes CTAS:
  // Base: urg 75, emerg 120, farm 30% coaseg (70% cob), proc 25% coaseg (75% cob)
  // Intermedio: urg 55, emerg 80, farm 20% coaseg (80% cob), proc 15% coaseg (85% cob)
  // VIP: urg 35, emerg 0, farm 10% coaseg (90% cob), proc 5% coaseg (95% cob)
  let copagoUrg = 75, copagoEmerg = 120, coasFarm = 0.30, coasProc = 0.25;
  if (planNivel === "Intermedio") {
    copagoUrg = 55; copagoEmerg = 80; coasFarm = 0.20; coasProc = 0.15;
  } else if (planNivel === "VIP") {
    copagoUrg = 35; copagoEmerg = 0; coasFarm = 0.10; coasProc = 0.05;
  }

  const exclusionesPool = ["Tratamientos Estéticos", "Lesiones por Deporte Extremo no declarado"];
  const tieneExcl = (hash % 5 === 0);

  return {
    dni: numDni,
    tipo_aseguramiento: "EPS_Y_ESSALUD",
    condicion_evento: "NORMAL",
    publico: {
      entidad: "ESSALUD",
      regimen: "EsSalud Activo (Capa Simple EPS + Capa Completa EsSalud)",
      estado: "ACTIVO",
      codigo: `AUT-ESSI-${rndCode}`
    },
    privado: {
      iafas_eps: nombreAseguradora,
      poliza: `POL-${rndPoliza}`,
      estado_poliza: "ACTIVA",
      plan_nivel: planNivel,
      copago_fijo_urgencia: copagoUrg,
      copago_fijo_emergencia: copagoEmerg,
      copago_fijo: copagoUrg,
      coaseguro_farmacia_pct: coasFarm,
      coaseguro_procedimientos_pct: coasProc,
      coaseguro_pct: coasProc,
      exclusiones: tieneExcl ? [exclusionesPool[hash % exclusionesPool.length]] : []
    }
  };
}

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
    return null;
  }
  const numDni = String(dni).replace(/\D/g, "");
  if (numDni.length !== 8) return null;

  const badgePersistencia = document.getElementById("badge_susalud_persistencia");

  // PASO 1: Verificar si ya existe una CONSULTA PREVIA GRABADA para este DNI
  const previa = (typeof obtenerConsultaPreviaDni === "function") ? obtenerConsultaPreviaDni(numDni) : null;
  if (previa && (previa.padron || previa.tipo_seguro)) {
    let padron = previa.padron;
    if (!padron && previa.tipo_seguro) {
      padron = crearPadronDesdeSeguroExistente(numDni, previa.tipo_seguro);
      guardarConsultaPreviaDni(numDni, { padron });
    }
    if (padron) {
      padron.origen_registro = "BD_HISTORICA";
      if (badgePersistencia) {
        badgePersistencia.style.display = "inline-block";
        badgePersistencia.style.background = "#dcfce7";
        badgePersistencia.style.color = "#15803d";
        badgePersistencia.style.border = "1px solid #86efac";
        badgePersistencia.textContent = "🔒 [BD HISTÓRICA: CONSULTA PREVIA RECUPERADA]";
      }
      console.log(`💾 Consulta Previa Recuperada (DNI ${numDni}) — Seguro Inmutable:`, previa.tipo_seguro || padron);
      return padron;
    }
  }

  // PASO 2: Si no existía en memoria local, buscar en Supabase historias_clinicas
  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.eq.${encodeURIComponent(numDni)},identificador.ilike.*${encodeURIComponent(numDni)}*)&select=padron_susalud,tipo_seguro&order=id.desc&limit=1`, {
        headers: { "apikey": SUPABASE_CONFIG.key, "Authorization": `Bearer ${SUPABASE_CONFIG.key}` }
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0) {
          const rowSeguro = rows[0].tipo_seguro;
          const rowPadron = rows[0].padron_susalud ? (typeof rows[0].padron_susalud === "string" ? JSON.parse(rows[0].padron_susalud) : rows[0].padron_susalud) : null;
          if (rowPadron || (rowSeguro && rowSeguro !== "None" && rowSeguro !== "Seguro por confirmar")) {
            const padronFinal = rowPadron || crearPadronDesdeSeguroExistente(numDni, rowSeguro);
            guardarConsultaPreviaDni(numDni, {
              tipo_seguro: rowSeguro || (padronFinal.tipo_aseguramiento === "SOLO_SIS" ? "SIS" : "EsSalud"),
              padron: padronFinal
            });
            if (badgePersistencia) {
              badgePersistencia.style.display = "inline-block";
              badgePersistencia.style.background = "#dcfce7";
              badgePersistencia.style.color = "#15803d";
              badgePersistencia.style.border = "1px solid #86efac";
              badgePersistencia.textContent = "🔒 [CLOUD SUPABASE: CONSULTA PREVIA RECUPERADA]";
            }
            return padronFinal;
          }
        }
      }
    } catch(e) {}
  }

  // PASO 3: Si ES LA PRIMERA VEZ QUE SE CONSULTA -> Sortear UNA ÚNICA VEZ y GRABAR PERMANENTEMENTE
  const nuevoPadron = await fetch_padron_susalud_siteds(numDni);
  nuevoPadron.origen_registro = "NUEVA_CONSULTA";

  const seguroTexto = nuevoPadron.tipo_aseguramiento === "SOLO_SIS" ? "SIS" :
                      nuevoPadron.tipo_aseguramiento === "SOLO_ESSALUD" ? "EsSalud" :
                      nuevoPadron.tipo_aseguramiento === "EPS_Y_ESSALUD" ? (STATE.entornoOperativo === "privado" ? (nuevoPadron.privado?.iafas_eps || "Pacífico EPS") : "EsSalud") :
                      nuevoPadron.tipo_aseguramiento === "SOLO_PRIVADO" ? (nuevoPadron.privado?.iafas_eps || "Seguro Privado") : "Particular";

  guardarConsultaPreviaDni(numDni, {
    tipo_seguro: seguroTexto,
    padron: nuevoPadron
  });

  if (badgePersistencia) {
    badgePersistencia.style.display = "inline-block";
    badgePersistencia.style.background = "#e0f2fe";
    badgePersistencia.style.color = "#0369a1";
    badgePersistencia.style.border = "1px solid #bae6fd";
    badgePersistencia.textContent = "✨ [PRIMERA CONSULTA: ASIGNADO Y GRABADO EN BD]";
  }

  console.log(`✨ Primer resultado grabado para DNI ${numDni} (${seguroTexto}) — Queda inmutable:`, nuevoPadron);
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

  const numDni = String(dni).replace(/\D/g, "");
  const padron = await obtenerOGenerarPadronSusalud(numDni || dni);
  STATE.padronSusalud = padron;

  if (padron) {
    if (padron.condicion_evento === "ACCIDENTE_TRANSITO_FUGA") {
      STATE.eventoFugaTransversal = true;
      const chkFuga = document.getElementById("chk_evento_fuga");
      if (chkFuga) chkFuga.checked = true;
    }

    // Verificar si hay consulta previa grabada para respetar rigurosamente el seguro previo
    const previa = (typeof obtenerConsultaPreviaDni === "function") ? obtenerConsultaPreviaDni(numDni) : null;
    let seguroTexto = previa?.tipo_seguro;
    if (!seguroTexto) {
      seguroTexto = padron.tipo_aseguramiento === "SOLO_SIS" ? "SIS" :
                    padron.tipo_aseguramiento === "SOLO_ESSALUD" ? "EsSalud" :
                    padron.tipo_aseguramiento === "EPS_Y_ESSALUD" ? (STATE.entornoOperativo === "privado" ? (padron.privado?.iafas_eps || "Pacífico EPS") : "EsSalud") :
                    padron.tipo_aseguramiento === "SOLO_PRIVADO" ? (padron.privado?.iafas_eps || "Seguro Privado") : "Particular";
    }

    STATE.tipoSeguro = seguroTexto;
    if (typeof aplicarSeleccionSeguroYEntorno === "function") {
      aplicarSeleccionSeguroYEntorno(seguroTexto, false, true);
    }

    // Guardar para garantizar inmutabilidad
    guardarConsultaPreviaDni(numDni, {
      tipo_seguro: seguroTexto,
      padron: padron
    });

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

  const numDni = STATE.numDni || (padron.dni ? String(padron.dni) : null);
  const previa = numDni ? (typeof obtenerConsultaPreviaDni === "function" ? obtenerConsultaPreviaDni(numDni) : null) : null;

  if (previa && previa.tipo_seguro) {
    if (modo === "publico" && (previa.tipo_seguro !== "SIS" && previa.tipo_seguro !== "EsSalud")) {
      STATE.tipoSeguro = padron.publico?.entidad === "SIS" ? "SIS" : "EsSalud";
    } else {
      STATE.tipoSeguro = previa.tipo_seguro;
    }
  } else if (modo === "publico") {
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
  if (typeof tienePacienteActivoValido === "function" && !tienePacienteActivoValido()) {
    alert("⚠️ Acción no permitida: No hay ningún paciente asignado ni datos registrados para emitir constancia de sepelio.");
    return;
  }
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
  if (typeof tienePacienteActivoValido === "function" && !tienePacienteActivoValido()) {
    console.warn("⚠️ sincronizarFacturacionYExportar omitida: No hay paciente asignado ni datos registrados.");
    return false;
  }
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
  if (typeof tienePacienteActivoValido === "function" && !tienePacienteActivoValido()) {
    alert("⚠️ Acción no permitida: No hay ningún paciente asignado ni datos de atención registrados para facturar. Por favor registre o seleccione un paciente antes de ingresar a facturación.");
    return false;
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
    <div class="wristband-strip" style="width:760px; max-width:880px; min-height:140px; height:auto; box-sizing:border-box; background:#ffffff; border:2px solid #94a3b8; border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,0.12); display:flex; position:relative; overflow:visible; font-family:Arial, Helvetica, sans-serif; margin:auto;">
      
      <!-- 1. BANDA LATERAL CON COLOR DE TRIAJE -->
      <div class="band-triage" style="width:55px; min-width:55px; background:${colorBanda}; color:#ffffff; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; text-align:center; padding:4px; box-sizing:border-box; border-right:2px solid rgba(0,0,0,0.15);">
        <div class="prio-code" style="font-size:22px; line-height:1;">P-${prio}</div>
        <div class="prio-desc" style="font-size:8px; writing-mode:vertical-rl; transform:rotate(180deg); letter-spacing:1px; margin-top:5px; text-transform:uppercase;">${nombrePrio}</div>
      </div>

      <!-- 2. CUERPO CENTRAL DE IDENTIFICACIÓN -->
      <div class="wristband-body" style="flex:1; padding:6px 10px; display:flex; flex-direction:column; justify-content:space-between; border-right:2px dashed #cbd5e1; box-sizing:border-box; overflow:visible;">
        
        <!-- HEADER INSTITUCIONAL -->
        <div class="inst-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #cbd5e1; padding-bottom:3px; height:18px;">
          <span class="inst-name" style="font-size:10.5px; font-weight:800; color:#0f172a; letter-spacing:0.4px;">HOSPITAL REGIONAL DOCENTE UPP</span>
          <div style="display:flex; align-items:center; gap:6px;">
            ${esRealmenteTemporal ? '<span style="background:#dc2626; color:#ffffff; font-size:8.5px; font-weight:900; padding:1px 5px; border-radius:3px; letter-spacing:0.3px;">🏷️ BRAZALETE TEMPORAL</span>' : '<span style="background:#16a34a; color:#ffffff; font-size:8.5px; font-weight:900; padding:1px 5px; border-radius:3px; letter-spacing:0.3px;">✓ OFICIAL IDENTIFICADO</span>'}
            <span class="service-name" style="font-size:9px; font-weight:700; color:#0284c7;">EMERGENCIA · NIVEL III-1</span>
          </div>
        </div>

        <!-- DATOS DEL PACIENTE: NOMBRE Y UBICACIÓN -->
        <div class="patient-main" style="margin:2px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
            <div class="patient-name" style="font-size:13.5px; font-weight:900; color:#0f172a; line-height:1.2; letter-spacing:0.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:320px;">
              ${STATE.esNN ? (STATE.esNNInconsciente ? '🚨 ' : '👤 ') : ''}${nombrePaciente}
            </div>
            <div style="font-size:9px; font-weight:800; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; padding:1px 6px; border-radius:4px; white-space:nowrap;">
              🛏️ ${ubicacion}
            </div>
          </div>

          <!-- LÍNEA COMPACTA DE FILIACIÓN CLÍNICA -->
          <div class="patient-details" style="display:flex; gap:8px; font-size:9.5px; color:#334155; margin-top:3px; font-weight:600; flex-wrap:wrap; line-height:1.25;">
            <span><strong>HC:</strong> <span class="hc-badge" style="background:#0f172a; color:#ffffff; padding:1px 4px; border-radius:3px; font-family:monospace; font-size:9.5px; font-weight:800;">${hcPaciente}</span></span>
            <span><strong>DOC:</strong> ${docPaciente}</span>
            <span><strong>EDAD:</strong> ${edadDisplay}</span>
            <span><strong>SEXO:</strong> ${generoDisplay}</span>
            <span><strong>GS:</strong> <span style="background:#fee2e2; color:#991b1b; padding:1px 4px; border-radius:3px; font-weight:800;">${gsanDisplay}</span></span>
            <span><strong>ING:</strong> <span style="font-family:monospace; font-weight:700;">${fechaActual} ${horaActual}</span></span>
          </div>
        </div>

        <!-- 3. FOOTER EXCLUSIVO: ALERGIAS Y ALERTAS CRÍTICAS - PERMANENTEMENTE VISIBLE -->
        <div class="risk-bars" style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #cbd5e1; padding-top:3px; margin-top:4px;">
          <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
            <div class="bar-allergy" style="padding:2px 8px; border-radius:4px; font-size:9px; font-weight:900; letter-spacing:0.3px; text-transform:uppercase; ${alergiaBadgeStyle}">
              ${alergiasDisplay}
            </div>
            ${esRealmenteTemporal ? '<div style="background:#7f1d1d; color:#fecaca; font-size:8.5px; font-weight:900; padding:1px 5px; border-radius:3px;">🚨 LEY N° 27604</div>' : ''}
            ${STATE.esAccidenteTransito ? '<div style="background:#ea580c; color:#fff; font-size:8.5px; font-weight:900; padding:1px 5px; border-radius:3px;">🚗 SOAT</div>' : ''}
          </div>
          <div style="font-size:8px; font-weight:800; color:#64748b; letter-spacing:0.3px;">
            NTS N° 042 / NTS N° 139-MINSA
          </div>
        </div>

      </div>

      <!-- 3. CÓDIGO DE BARRAS DE TRAZABILIDAD (ANTES DE CIERRE) -->
      <div class="wristband-barcode-area" style="width:115px; min-width:115px; padding:4px 6px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fafafa; box-sizing:border-box; border-right:2px dashed #94a3b8;">
        <div class="barcode-lines" style="width:98px; height:42px; background:repeating-linear-gradient(90deg, #000 0, #000 2px, #fff 2px, #fff 4px, #000 4px, #000 7px, #fff 7px, #fff 9px, #000 9px, #000 13px, #fff 13px, #fff 15px); border-radius:2px;"></div>
        <div class="barcode-text" style="font-family:monospace; font-size:8.5px; color:#334155; margin-top:2px; font-weight:700;">*${hcPaciente}*</div>
        <div class="seal-minsa" style="font-size:7px; color:#64748b; text-align:center; margin-top:2px; font-weight:700;">MINSA · SEGURIDAD</div>
      </div>

      <!-- 4. ZONA DE TRASLAPE Y CIERRE ADHESIVO (NO CUBRE CÓDIGO DE BARRAS) -->
      <div class="wristband-closure-area" style="width:130px; min-width:130px; background:#f8fafc; padding:6px 8px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; box-sizing:border-box;">
        <div style="font-size:8.5px; font-weight:900; color:#334155; text-transform:uppercase; letter-spacing:0.4px; display:flex; align-items:center; gap:3px;">
          <span>🔒</span> <span>ÁREA DE TRASLAPE</span>
        </div>
        <div style="font-size:7.5px; font-weight:700; color:#64748b; margin-top:2px; line-height:1.1;">
          CIERRE ADHESIVO
        </div>
        <div style="margin-top:4px; border:1.5px dashed #0284c7; background:#e0f2fe; border-radius:4px; padding:2px 6px; font-size:7.5px; font-weight:800; color:#0369a1;">
          ✂️ PEGAR AQUÍ
        </div>
        <div style="font-size:7px; color:#94a3b8; margin-top:3px; line-height:1.1;">
          [ NO CUBRE CÓDIGO ]
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
        @page { size: landscape; margin: 4mm; }
        *, *:before, *:after { box-sizing: border-box; }
        html, body {
          font-family: Arial, Helvetica, sans-serif;
          margin: 0;
          padding: 10px;
          background: #e2e8f0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .instruction-box {
          margin-bottom: 12px;
          font-size: 11.5px;
          color: #475569;
          text-align: center;
          max-width: 780px;
        }
        .btn-print-action {
          margin-bottom: 12px;
          background: #0284c7;
          color: #ffffff;
          border: none;
          padding: 8px 18px;
          border-radius: 6px;
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        .wristband-strip {
          box-sizing: border-box !important;
          width: 760px !important;
          max-width: 100% !important;
          min-height: 140px !important;
          height: auto !important;
          margin: 0 auto !important;
          overflow: visible !important;
        }
        @media print {
          html, body {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            min-height: auto !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .instruction-box, .btn-print-action { display: none !important; }
          .wristband-strip {
            box-shadow: none !important;
            border: 1.5px solid #000000 !important;
            width: 760px !important;
            max-width: 100% !important;
            min-height: 140px !important;
            height: auto !important;
            margin: 3mm auto !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: visible !important;
          }
        }
      </style>
    </head>
    <body>
      <button type="button" class="btn-print-action" onclick="window.print()">🖨️ Mandar a Imprimir Pulsera (Landscape / Apaisado)</button>
      <div class="instruction-box">
        <strong>PULSERA TÉRMICA OFICIAL DE IDENTIFICACIÓN DE PACIENTE — NTS N° 042 / NTS N° 139-MINSA</strong><br>
        Imprima y coloque en la muñeca dominante del paciente. El código de barras y área de traslape están milimétricamente calibrados sin cortes.
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
    const hcAnterior = STATE.historiaClinica;
    const hcDefinitiva = migrarHistoriaClinicaTemporalADefinitiva(hcAnterior, numDni, nombre);

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
      if (typeof renderizarTablaKardexEnfermeria === 'function') renderizarTablaKardexEnfermeria();
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
  const vinoDeSelector = !med;
  med = med || (selMedEl ? selMedEl.value : '');
  if (!med) {
    alert('Por favor seleccione un medicamento o solución de emergencia.');
    return false;
  }
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
  if (Array.isArray(STATE.kardexItems)) {
    const itemKardex = STATE.kardexItems.find(x => x.nombre === med);
    if (itemKardex) {
      itemKardex.dosis = dosis;
      itemKardex.via = via;
      itemKardex.frecuencia = horario;
    }
  }
  renderizarTablaKardexEnfermeria();
  if (vinoDeSelector && selMedEl) selMedEl.value = '';
  if (typeof renderizarFarmacia === 'function') renderizarFarmacia();
  if (typeof actualizarFactura === 'function') actualizarFactura();
  if (typeof guardarEstadoPacienteActivo === 'function') guardarEstadoPacienteActivo();
  if (typeof autoGuardarCambioEnHistoriaClinica === 'function') autoGuardarCambioEnHistoriaClinica(`Kardex: ${med}`);
  if (typeof mostrarToastCola === 'function') {
    mostrarToastCola(`💊 Agregado al Kardex: <strong>${med}</strong>`);
  }
  return true;
}

function renderizarTablaKardexEnfermeria() {
  const tbody = document.getElementById('kardex_items_body');
  if (!tbody) return;
  const st = (typeof window !== 'undefined' && window.STATE) ? window.STATE : ((typeof STATE !== 'undefined') ? STATE : {});
  const items = Array.isArray(st.kardexItems) ? st.kardexItems : [];
  const administrados = Array.isArray(st.kardexAdministrados) ? st.kardexAdministrados : [];

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="padding:10px; text-align:center; color:#64748b; font-style:italic;">Sin medicamentos prescritos en el Kardex aún.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map((item, idx) => {
    const yaAdm = administrados.includes(item.nombre);
    const nombreEsc = String(item.nombre).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const nombreArg = String(item.nombre).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const costo = Number(item.costo || 25.00);
    const btnBg = yaAdm ? '#15803d' : '#e0f2fe';
    const btnCol = yaAdm ? '#ffffff' : '#0369a1';
    const btnTxt = yaAdm ? '✅ Administrado (Kardex)' : '[ ✓ Administrado por Enf. ]';

    return `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px; font-weight:700; color:#0f172a;">💊 ${nombreEsc}${item.cum ? ` <span style="font-size:10px; color:#64748b; font-weight:600;">(${item.cum})</span>` : ''}</td>
        <td style="padding:8px 10px; font-size:11px; color:#334155;">${item.dosis || 'Según protocolo STAT'} · <strong>${item.frecuencia || 'STAT'}</strong></td>
        <td style="padding:8px 10px; text-align:center;">
          <button type="button" class="btn-kardex-admin${yaAdm ? ' administrado' : ''}" data-administrado="${yaAdm ? 'true' : 'false'}" style="background:${btnBg}; color:${btnCol}; padding:5px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; border:1px solid #bae6fd;" onclick="administrarKardexItem(${idx}, '${nombreArg}', ${costo}, 'Farmacia', this)">
            ${btnTxt}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderizarTablaKardexEnfermeria = renderizarTablaKardexEnfermeria;
window.prescribirMedicamentoCatalogo = function() { return agregarMedicamentoAKardex(); };

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
  if (typeof autoGuardarCambioEnHistoriaClinica === 'function') autoGuardarCambioEnHistoriaClinica(`Imagen: ${tipo}`);
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
  if (typeof autoGuardarCambioEnHistoriaClinica === 'function') autoGuardarCambioEnHistoriaClinica(`Laboratorio: ${nombre}`);
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

const orig_grabarAtencionCompleta = typeof grabarAtencionCompleta === 'function' ? grabarAtencionCompleta : null;
window.grabarAtencionCompleta = async function() {
  if (STATE.camaAsignadaId && typeof liberarCamaRecurso === 'function') {
    liberarCamaRecurso(STATE.camaAsignadaId);
  }
  if (typeof orig_grabarAtencionCompleta === 'function') {
    await orig_grabarAtencionCompleta();
  }
  if (typeof actualizarWidgetFlotanteCamas === 'function') actualizarWidgetFlotanteCamas();
  if (typeof renderizarTableroColaPacientes === 'function') renderizarTableroColaPacientes();

  // Bloqueo de Historia Clínica Cerrada e Inmutable (NTS N° 139-MINSA)
  const lockBanner = document.getElementById('banner_hc_inmutable_lock');
  if (lockBanner) lockBanner.style.display = 'flex';
  STATE.atencionCerrada = true;
  registrarLogAuditoria("Módulo 8", "CIERRE_HC_INMUTABLE", `Atención cerrada. Historia Clínica cerrada e inmutable: ${STATE.historiaClinica}`);
};

// --- 7. PADRÓN ÚNICO SUSALUD BD Y PERSISTENCIA POR DNI (BLOQUE 3.1 & 3.2) ---
// # TODO: REEMPLAZAR POR ENDPOINT REAL SITEDS / SUSALUD
// Unificación completa: delegar al motor centralizado de consultas previas
window.obtenerOGenerarPadronSusalud = obtenerOGenerarPadronSusalud;

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
  // Si la función canónica de liquidación ya calcula las 4 líneas contables oficiales, usarla prioritariamente
  if (typeof orig_calcularLiquidacionSeguro === "function" && (STATE.esClinicaPrivada || !STATE.padronSusalud)) {
    const liqCanonica = orig_calcularLiquidacionSeguro();
    if (liqCanonica && Array.isArray(liqCanonica.lineasContables) && liqCanonica.lineasContables.length === 4) {
      return liqCanonica;
    }
  }
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
var esLlegadaSimultanea = false;
var PACIENTES_DESEMPATE_TEMP = [];

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

let modoDesempateActual = "precargados";

function cambiarModoDesempate(modo) {
  modoDesempateActual = (modo === "manual") ? "manual" : "precargados";
  const btnPre = document.getElementById("btn_desempate_modo_precargados");
  const btnMan = document.getElementById("btn_desempate_modo_manual");
  const boxPre = document.getElementById("box_desempate_precargados");
  const boxMan = document.getElementById("box_desempate_ingreso_manual");

  if (modoDesempateActual === "precargados") {
    if (btnPre) {
      btnPre.style.background = "#4f46e5";
      btnPre.style.color = "#ffffff";
      btnPre.style.borderColor = "#4338ca";
    }
    if (btnMan) {
      btnMan.style.background = "#ffffff";
      btnMan.style.color = "#4338ca";
      btnMan.style.borderColor = "#6366f1";
    }
    if (boxPre) boxPre.style.display = "flex";
    if (boxMan) boxMan.style.display = "none";
    generarPacientesLlegadaSimultanea();
  } else {
    if (btnMan) {
      btnMan.style.background = "#4f46e5";
      btnMan.style.color = "#ffffff";
      btnMan.style.borderColor = "#4338ca";
    }
    if (btnPre) {
      btnPre.style.background = "#ffffff";
      btnPre.style.color = "#4338ca";
      btnPre.style.borderColor = "#6366f1";
    }
    if (boxPre) boxPre.style.display = "none";
    if (boxMan) boxMan.style.display = "block";
    PACIENTES_DESEMPATE_TEMP = [];
    renderizarListaPacientesDesempate();
  }
}
window.cambiarModoDesempate = cambiarModoDesempate;

function agregarPacienteManualDesempate() {
  const nomEl = document.getElementById("des_man_nombre");
  const motEl = document.getElementById("des_man_motivo");
  const nombreRaw = (nomEl?.value || "").trim();
  const motivoRaw = (motEl?.value || "").trim();
  const idxNum = PACIENTES_DESEMPATE_TEMP.length + 1;
  const nombre = nombreRaw || `Paciente Ingresado #${idxNum}`;
  const motivo = motivoRaw || "Evaluación de emergencia por ingreso simultáneo";

  const edad = parseInt(document.getElementById("des_man_edad")?.value, 10) || 40;
  const sexo = document.getElementById("des_man_sexo")?.value || "M";
  const modalidad = document.getElementById("des_man_modalidad")?.value || "Ambulancia";
  const prioridad = document.getElementById("des_man_prioridad")?.value || "II";
  const vitals = {
    spo2: parseFloat(document.getElementById("des_man_spo2")?.value) || 94,
    fc: parseFloat(document.getElementById("des_man_fc")?.value) || 100,
    pas: parseFloat(document.getElementById("des_man_pas")?.value) || 110,
    pad: parseFloat(document.getElementById("des_man_pad")?.value) || 70,
    fr: parseFloat(document.getElementById("des_man_fr")?.value) || 20,
    temp: 36.8,
    glasgow: parseFloat(document.getElementById("des_man_glasgow")?.value) || 15,
    glucosa: 100,
    eva: parseFloat(document.getElementById("des_man_eva")?.value) || 5
  };
  const esGestante = Boolean(document.getElementById("des_man_gestante")?.checked);
  const tieneCodigo = Boolean(document.getElementById("des_man_codigo")?.checked);

  const nuevoCaso = {
    identificador: `PX-MAN-${String(idxNum).padStart(2, "0")}`,
    nombre: nombre.toUpperCase(),
    dni: "",
    edad,
    sexo,
    esNN: nombre.toUpperCase().includes("NN"),
    motivo,
    modalidad,
    vitals,
    esGestante,
    tieneCodigo,
    prioridad,
    camaAsignadaId: null,
    camaAsignadaNombre: null
  };
  nuevoCaso.scorePrelacion = calcularScorePrelacionParaCaso(nuevoCaso);

  PACIENTES_DESEMPATE_TEMP.push(nuevoCaso);
  PACIENTES_DESEMPATE_TEMP.sort((a, b) => b.scorePrelacion - a.scorePrelacion);
  renderizarListaPacientesDesempate();

  if (nomEl) nomEl.value = "";
  if (motEl) motEl.value = "";
  const chkG = document.getElementById("des_man_gestante");
  if (chkG) chkG.checked = false;
  const chkC = document.getElementById("des_man_codigo");
  if (chkC) chkC.checked = false;
  if (nomEl) nomEl.focus();
}
window.agregarPacienteManualDesempate = agregarPacienteManualDesempate;

function limpiarListaManualDesempate() {
  PACIENTES_DESEMPATE_TEMP = [];
  renderizarListaPacientesDesempate();
}
window.limpiarListaManualDesempate = limpiarListaManualDesempate;

function abrirModalLlegadasSimultaneasDesempate() {
  const modal = document.getElementById("modalLlegadasSimultaneasDesempate");
  if (!modal) return;

  actualizarUIRecursosDesempate();
  cambiarModoDesempate("precargados");

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

  if (!Array.isArray(PACIENTES_DESEMPATE_TEMP) || PACIENTES_DESEMPATE_TEMP.length === 0) {
    cont.innerHTML = `
      <div style="padding:14px; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:8px; text-align:center; color:#64748b; font-size:0.8rem;">
        ✍️ Sin pacientes en disputa aún. Ingrese los datos arriba y pulse <strong>➕ Agregar a la Disputa</strong>, o elija <strong>📋 Datos precargados</strong>.
      </div>
    `;
    return;
  }

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

  // 6. Refrescar visor de consentimiento informado si se encuentra abierto
  const mConsent = document.getElementById("modal_consentimiento_informado");
  if (mConsent && (mConsent.classList.contains("open") || mConsent.style.display === "flex" || mConsent.style.display === "block")) {
    const cont = document.getElementById("consentimiento_modal_preview");
    if (cont && typeof construirHTMLDocumentoConsentimiento === "function") {
      cont.innerHTML = construirHTMLDocumentoConsentimiento();
    }
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
  } else if (cond === "no_requerido_clinico") {
    banner.style.background = "#ecfdf5";
    banner.style.borderColor = "#6ee7b7";
    banner.style.color = "#065f46";
    banner.innerHTML = `<strong>✅ NO REQUIERE FORMATO ESCRITO (NTS N° 139-MINSA / Art. 24° D.S. N° 027-2015-SA):</strong> En urgencias o emergencias de manejo puramente clínico (sin intervención quirúrgica, procedimiento invasivo, sedación mayor ni alto riesgo), no es obligatorio llenar el Consentimiento Informado Médico-Quirúrgico escrito. Rige el consentimiento verbal consignado en la Historia Clínica.`;
  } else {
    banner.style.background = "#eff6ff";
    banner.style.borderColor = "#bfdbfe";
    banner.style.color = "#1e40af";
    banner.innerHTML = `<strong>ℹ️ RÉGIMEN ORDINARIO (Cirugía / Procedimiento Invasivo o de Riesgo):</strong> Paciente lúcido y consciente (≥18 años) en pleno uso de sus facultades mentales. Suscribe el consentimiento escrito tras comprender objetivos, riesgos y alternativas.`;
  }

  const badgeLegal = document.getElementById("badge_consentimiento_legal");
  if (badgeLegal) {
    if (cond === "no_requerido_clinico") {
      badgeLegal.textContent = "✅ Exento de Formato Escrito (Manejo Clínico)";
      badgeLegal.style.background = "#ecfdf5";
      badgeLegal.style.color = "#065f46";
      badgeLegal.style.borderColor = "#6ee7b7";
    } else if (cond === "exonerado_emergencia") {
      badgeLegal.textContent = "⚡ Exonerado por Emergencia Vital (Art. 4°)";
      badgeLegal.style.background = "#fff1f2";
      badgeLegal.style.color = "#9f1239";
      badgeLegal.style.borderColor = "#fecdd3";
    } else {
      badgeLegal.textContent = "⚖️ Obligatorio solo en Cirugía / Proc. Invasivo";
      badgeLegal.style.background = "#e0f2fe";
      badgeLegal.style.color = "#0369a1";
      badgeLegal.style.borderColor = "#bae6fd";
    }
  }

  // Bloquear o desbloquear la sección de acciones del consentimiento si es consulta/tratamiento no invasivo
  const bloquearConsent = (cond === "no_requerido_clinico");
  const boxAcciones = document.getElementById("consentimiento_acciones_box");
  const btnVerCons = document.getElementById("btn_ver_consentimiento_legal");
  const btnImpCons = document.getElementById("btn_imprimir_consentimiento_firma");
  const chkCons = document.getElementById("chk_consentimiento_firmado");
  if (boxAcciones) {
    boxAcciones.style.opacity = bloquearConsent ? "0.45" : "1";
    boxAcciones.style.pointerEvents = bloquearConsent ? "none" : "auto";
    boxAcciones.title = bloquearConsent ? "Bloqueado: No requiere consentimiento escrito en consulta o tratamiento no invasivo." : "";
  }
  if (btnVerCons) btnVerCons.disabled = bloquearConsent;
  if (btnImpCons) btnImpCons.disabled = bloquearConsent;
  if (chkCons) {
    chkCons.disabled = bloquearConsent;
    if (bloquearConsent) {
      chkCons.checked = false;
      STATE.consentimientoAdjuntoHC = false;
    }
  }

  registrarLogAuditoria("Módulo 4", "CAMBIO_REGIMEN_CONSENTIMIENTO", `Régimen: ${cond}`);

  // Refrescar visor de consentimiento informado si se encuentra abierto
  const mConsent = document.getElementById("modal_consentimiento_informado");
  if (mConsent && (mConsent.classList.contains("open") || mConsent.style.display === "flex" || mConsent.style.display === "block")) {
    const cont = document.getElementById("consentimiento_modal_preview");
    if (cont && typeof construirHTMLDocumentoConsentimiento === "function") {
      cont.innerHTML = construirHTMLDocumentoConsentimiento();
    }
  }
}
window.actualizarCondicionConsentimiento = actualizarCondicionConsentimiento;

function actualizarProcedimientoConsentimiento(proc) {
  const selCond = document.getElementById("sel_condicion_consentimiento");
  if (!selCond) return;
  if ((proc || "").includes("sin Cirugía ni Procedimiento Invasivo")) {
    if (selCond.value !== "exonerado_emergencia" && selCond.value !== "disentimiento_rechazo") {
      selCond.value = "no_requerido_clinico";
      actualizarCondicionConsentimiento("no_requerido_clinico");
    }
  } else if (selCond.value === "no_requerido_clinico") {
    selCond.value = "paciente_lucido";
    actualizarCondicionConsentimiento("paciente_lucido");
  }
}
window.actualizarProcedimientoConsentimiento = actualizarProcedimientoConsentimiento;

function actualizarGrupoYFactorRh() {
  const gs = document.getElementById("select_grupo_sanguineo")?.value || "";
  const rh = document.getElementById("select_factor_rh")?.value || "";
  if (typeof STATE !== "undefined" && STATE) {
    STATE.grupoSanguineo = gs;
    STATE.factorRh = rh;
  }
  const badge = document.getElementById("badge_gs_rh_estado");
  if (badge) {
    badge.textContent = (gs || rh) ? `${gs || "?"} ${rh || "Rh por tipificar"}`.trim() : "Por tipificar / Confirmar";
  }
  const alerta = document.getElementById("alerta_rh_negativo");
  if (alerta) {
    alerta.style.display = rh.includes("Negativo") ? "block" : "none";
  }
  if (typeof PACIENTES_COLA !== "undefined" && Array.isArray(PACIENTES_COLA) && typeof pacienteActivoId !== "undefined") {
    const pxActivo = PACIENTES_COLA.find(x => x.id === pacienteActivoId);
    if (pxActivo && pxActivo.stateSnapshot) {
      pxActivo.stateSnapshot.grupoSanguineo = gs;
      pxActivo.stateSnapshot.factorRh = rh;
    }
  }
  const ident = STATE?.numDni || STATE?.identificador || "";
  const hc = STATE?.historiaClinica || "";
  if ((ident || hc) && typeof cargarPacientesMaster === "function" && typeof guardarPacientesMaster === "function") {
    const allM = cargarPacientesMaster();
    const key = (ident && !String(ident).startsWith("NN-")) ? String(ident).trim().toUpperCase() : String(hc).trim().toUpperCase();
    if (key && allM[key]) {
      allM[key].grupo_sanguineo = gs || "—";
      allM[key].factor_rh = rh || "—";
      guardarPacientesMaster(allM);
    }
  }
  if (typeof registrarLogAuditoria === "function" && (gs || rh)) {
    registrarLogAuditoria("Módulo 4", "INMUNOHEMATOLOGIA_GS_RH", `Grupo Sanguíneo: ${gs || "—"} | Factor Rh: ${rh || "—"}`);
  }
}
window.actualizarGrupoYFactorRh = actualizarGrupoYFactorRh;

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
  
  // Médico responsable dinámico según el médico asistencial de guardia asignado en el Módulo 4
  const selMed = document.getElementById("medico_responsable_select");
  const medResponsable = (selMed && selMed.value) ? selMed.value : (STATE.medicoTratante || "Médico de Turno 1 (Emergenciólogo / CMP 0001)");
  
  const procedimientoSel = document.getElementById("sel_procedimiento_consentimiento")?.value || "Atención Médica y Reanimación en Emergencia";
  const condicionSel = document.getElementById("sel_condicion_consentimiento")?.value || "paciente_lucido";
  const fechaHoy = new Date().toLocaleDateString('es-PE');
  const horaHoy = STATE.horaLlegada || new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  // Resolver datos facultativos del médico de guardia según su asignación (NTS N° 139-MINSA / Ley N° 27269)
  function resolverDatosMedicoTratante(medStr) {
    const t = medStr || "";
    if (t.includes("Turno 1") || t.includes("Emergenciólogo") || t.includes("0001")) {
      return {
        nombre: "Dr. Carlos Valdivia Mendoza",
        especialidad: "Especialista en Medicina de Emergencias y Desastres",
        cmp: "CMP 48291",
        rne: "RNE 24105",
        token: "MINSA-PKI-48291-MED1",
        colorFirma: "#0f2b5c"
      };
    } else if (t.includes("Turno 2") || t.includes("Cirujano") || t.includes("0002")) {
      return {
        nombre: "Dr. Alejandro Morales Prado",
        especialidad: "Especialista en Cirugía General y Laparoscópica",
        cmp: "CMP 39512",
        rne: "RNE 18420",
        token: "MINSA-PKI-39512-SOP2",
        colorFirma: "#1e3a8a"
      };
    } else if (t.includes("Turno 3") || t.includes("Internista") || t.includes("0003")) {
      return {
        nombre: "Dra. Patricia Huamán Silva",
        especialidad: "Especialista en Medicina Interna y Cuidados Críticos",
        cmp: "CMP 52104",
        rne: "RNE 27890",
        token: "MINSA-PKI-52104-MED3",
        colorFirma: "#1e40af"
      };
    } else if (t.includes("Turno 4") || t.includes("Pediatra") || t.includes("0004")) {
      return {
        nombre: "Dr. Fernando Ruiz Barcellos",
        especialidad: "Especialista en Pediatría de Emergencia",
        cmp: "CMP 44876",
        rne: "RNE 22134",
        token: "MINSA-PKI-44876-PED4",
        colorFirma: "#0369a1"
      };
    } else if (t.includes("Turno 5") || t.includes("Ginecólogo") || t.includes("0005")) {
      return {
        nombre: "Dra. Carmen Salazar Vega",
        especialidad: "Especialista en Ginecología y Obstetricia",
        cmp: "CMP 41359",
        rne: "RNE 20987",
        token: "MINSA-PKI-41359-GIN5",
        colorFirma: "#0284c7"
      };
    } else if (t.includes("Turno 6") || t.includes("Traumatólogo") || t.includes("0006")) {
      return {
        nombre: "Dr. Gustavo Alarcón Peña",
        especialidad: "Especialista en Ortopedia y Traumatología de Urgencia",
        cmp: "CMP 46720",
        rne: "RNE 23511",
        token: "MINSA-PKI-46720-TRA6",
        colorFirma: "#0c4a6e"
      };
    } else {
      const matchCmp = t.match(/CMP\s*\d+/i);
      const nombreLimpio = t.split("(")[0]?.trim() || t;
      return {
        nombre: nombreLimpio.startsWith("Dr") ? nombreLimpio : `Dr. ${nombreLimpio}`,
        especialidad: "Médico de Guardia en Emergencia",
        cmp: matchCmp ? matchCmp[0] : "CMP 48291",
        rne: "RNE 24105",
        token: "MINSA-PKI-00000-GEN",
        colorFirma: "#0f2b5c"
      };
    }
  }

  const datosMed = resolverDatosMedicoTratante(medResponsable);

  // Tokens criptográficos de trazabilidad digital
  const hashToken = Math.abs((dniPx + nomPx + fechaHoy).split("").reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0) | 0, 0)).toString(16).toUpperCase().padStart(8, '0');
  const docHashToken = Math.abs((medResponsable + fechaHoy).split("").reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0) | 0, 0)).toString(16).toUpperCase().padStart(8, '0');

  // Firma del paciente: En blanco (RENIEC aún no implementa el sistema de firma digital ciudadana para pacientes)
  const svgFirmaPaciente = `
    <div style="height:50px; display:flex; flex-direction:column; align-items:center; justify-content:center; border:1px dashed #cbd5e1; background:#ffffff; border-radius:4px; margin-bottom:4px;">
      <span style="font-size:7.8px; color:#94a3b8; font-style:italic;">(Espacio en blanco para firma manuscrita física)</span>
      <span style="font-size:6.8px; color:#cbd5e1; font-family:monospace;">RENIEC: Sistema no implementado</span>
    </div>
  `;

  // Trazo caligráfico digitalizado del médico tratante (Personal de Salud con firma digital simulada)
  const svgFirmaMedico = `
    <div style="height:50px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
      <svg width="190" height="48" viewBox="0 0 190 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 14 38 C 24 8, 40 44, 54 14 C 66 2, 80 36, 94 12 C 106 2, 118 30, 132 10 C 144 4, 160 26, 174 8 M 28 42 C 75 45, 125 40, 182 32" stroke="${datosMed.colorFirma || '#0369a1'}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="180" cy="12" r="2.5" fill="${datosMed.colorFirma || '#0369a1'}"/>
      </svg>
    </div>
  `;

  // Huella dactilar física en blanco para impresión
  const svgHuellaBiometrica = `
    <div style="height:50px; display:flex; flex-direction:column; align-items:center; justify-content:center; border:1px dashed #cbd5e1; background:#ffffff; border-radius:4px;">
      <span style="font-size:7px; color:#94a3b8; text-align:center;">Huella dactilar<br>(en blanco)</span>
    </div>
  `;

  let textoDeclaracion = "";
  let bloqueFirmaPaciente = "";

  if (condicionSel === "no_requerido_clinico") {
    textoDeclaracion = `
      <div style="background:#ecfdf5; border:1.5px solid #6ee7b7; padding:12px; border-radius:6px; font-size:11px; color:#065f46; margin-bottom:14px; line-height:1.45;">
        <strong>CONSTANCIA DE EXENCIÓN DE CONSENTIMIENTO INFORMADO ESCRITO (NTS N° 139-MINSA / ART. 24° D.S. N° 027-2015-SA):</strong><br>
        La presente atención corresponde a una urgencia o emergencia de manejo clínico no invasivo (sin intervención quirúrgica, procedimiento invasivo, sedación mayor ni riesgo elevado). De conformidad con la normativa vigente, <strong>no requiere suscripción de formato escrito médico-quirúrgico</strong>, rigiendo el consentimiento verbal consignado en la Historia Clínica.
      </div>
    `;
    bloqueFirmaPaciente = `
      <td style="width:37%; vertical-align:middle; padding:8px 10px; border:1.5px solid #6ee7b7; background:#ecfdf5; border-radius:8px;">
        <div style="font-size:9.5px; font-weight:900; color:#065f46; margin-bottom:4px; letter-spacing:0.3px;">
          ✅ NO REQUIERE FIRMA ESCRITA
        </div>
        <div style="font-size:8px; color:#047857; line-height:1.35; font-style:italic;">
          NTS N° 139-MINSA &amp; D.S. N° 027-2015-SA.<br>
          Manejo clínico / urgencia sin procedimiento invasivo ni quirúrgico. Consentimiento verbal registrado en Historia Clínica.
        </div>
      </td>
    `;
  } else if (condicionSel === "exonerado_emergencia") {
    textoDeclaracion = `
      <div style="background:#fff1f2; border:1.5px solid #fecdd3; padding:12px; border-radius:6px; font-size:11px; color:#9f1239; margin-bottom:14px; line-height:1.45;">
        <strong>CERTIFICACIÓN MÉDICA DE EXCEPCIÓN LEGAL POR EMERGENCIA VITAL (ART. 4° LEY N° 26842 & LEY N° 27604):</strong><br>
        Se deja constancia expresa de que el/la paciente ingresa en estado de riesgo vital inminente / alteración del sensorio sin presencia de familiar responsable. En estricto cumplimiento de la Ley General de Salud, el equipo médico asistencial procede de oficio a ejecutar las maniobras médico-quirúrgicas y de soporte vital indispensable para preservar la vida, exonerando la suscripción previa de consentimiento.
      </div>
    `;
    bloqueFirmaPaciente = `
      <td style="width:37%; vertical-align:middle; padding:8px 10px; border:1.5px solid #fecdd3; background:#fff1f2; border-radius:8px;">
        <div style="font-size:9.5px; font-weight:900; color:#9f1239; margin-bottom:4px; letter-spacing:0.3px;">
          ⚡ EXONERADO POR EMERGENCIA VITAL
        </div>
        <div style="font-size:8px; color:#be123c; line-height:1.35; font-style:italic;">
          Art. 4° Ley N° 26842 &amp; Ley N° 27604.<br>
          Paciente inconsciente / riesgo vital severo sin familiar presente. Actuación médica inmediata de oficio certificada en Historia Clínica.
        </div>
        <div style="margin-top:6px; font-size:7.2px; color:#64748b; font-family:monospace; font-weight:700;">
          CERTIFICACIÓN DE OFICIO · REGISTRO AUDIT_LOGS
        </div>
      </td>
    `;
  } else if (condicionSel === "representante_legal") {
    textoDeclaracion = `
      <div style="font-size:11px; color:#1e293b; line-height:1.5; margin-bottom:14px;">
        Yo, en calidad de <strong>REPRESENTANTE LEGAL / FAMILIAR DIRECTO</strong> del paciente antes identificado, declaro que el Médico Tratante me ha explicado en lenguaje claro y comprensible el diagnóstico presuntivo, la naturaleza del procedimiento propuesto, sus objetivos, beneficios esperados, riesgos potenciales y alternativas terapéuticas. En consecuencia, <strong>OTORGO MI CONSENTIMIENTO LIBRE E INFORMADO</strong> para la realización de dicho procedimiento en el Servicio de Emergencia.
      </div>
    `;
    bloqueFirmaPaciente = `
      <td style="width:37%; vertical-align:bottom; padding:8px 10px; border:1px solid #bfdbfe; background:#f0f9ff; border-radius:8px; box-shadow:0 1px 3px rgba(2,132,199,0.06);">
        ${svgFirmaPaciente}
        <div style="border-bottom:1.5px solid #0284c7; margin-top:2px;"></div>
        <div style="margin-top:4px; font-weight:800; font-size:9.5px; color:#0369a1; letter-spacing:0.3px;">
          ✍️ FIRMA REPRESENTANTE LEGAL (MANUSCRITA EN BLANCO)
        </div>
        <div style="font-size:9px; color:#0f172a; font-weight:800;">Representante de: ${nomPx}</div>
        <div style="font-size:7.8px; color:#475569;">DNI: <strong>${dniPx !== "S/D (INDOCUMENTADO)" ? dniPx : "Acreditado"}</strong> · Parentesco Directo</div>
        <div style="font-size:7.2px; color:#64748b; font-family:monospace; margin-top:2px; font-weight:700;">
          Firma en blanco · RENIEC no implementa firma digital ciudadana
        </div>
      </td>
    `;
  } else if (condicionSel === "disentimiento_rechazo") {
    textoDeclaracion = `
      <div style="background:#fef2f2; border:1.5px solid #ef4444; padding:12px; border-radius:6px; font-size:11px; color:#b91c1c; margin-bottom:14px; line-height:1.45;">
        <strong>ACTA DE DISENTIMIENTO Y RECHAZO EXPRESO DE TRATAMIENTO MÉDICO (ART. 15° LEY N° 26842):</strong><br>
        Habiendo sido plenamente advertido(a) sobre la gravedad del cuadro clínico y los riesgos inminentes (incluido el desenlace fatal o secuelas irreversibles) que conlleva rechazar el procedimiento indicado, <strong>DECLARO MI DECISIÓN DE NO AUTORIZAR</strong> su realización, asumiendo de manera exclusiva toda responsabilidad legal y clínica, y exonerando al personal médico y al hospital.
      </div>
    `;
    bloqueFirmaPaciente = `
      <td style="width:37%; vertical-align:bottom; padding:8px 10px; border:1px solid #fecaca; background:#fff5f5; border-radius:8px; box-shadow:0 1px 3px rgba(220,38,38,0.06);">
        ${svgFirmaPaciente}
        <div style="border-bottom:1.5px solid #dc2626; margin-top:2px;"></div>
        <div style="margin-top:4px; font-weight:800; font-size:9.5px; color:#991b1b; letter-spacing:0.3px;">
          ✍️ FIRMA DE DISENTIMIENTO (MANUSCRITA EN BLANCO)
        </div>
        <div style="font-size:9px; color:#0f172a; font-weight:800;">${nomPx}</div>
        <div style="font-size:7.8px; color:#475569;">DNI: <strong>${dniPx}</strong> · Titular en Pleno Uso de Facultades</div>
        <div style="font-size:7.2px; color:#64748b; font-family:monospace; margin-top:2px; font-weight:700;">
          Firma en blanco · RENIEC no implementa firma digital ciudadana
        </div>
      </td>
    `;
  } else {
    textoDeclaracion = `
      <div style="font-size:11px; color:#1e293b; line-height:1.5; margin-bottom:14px;">
        Yo, <strong>${nomPx}</strong>, identificado(a) con DNI N° <strong>${dniPx}</strong>, en pleno uso de mis facultades mentales, declaro que el Médico Tratante me ha informado satisfactoriamente sobre mi estado de salud, el diagnóstico, la necesidad de la intervención propuesta, los beneficios esperados, riesgos frecuentes y complicaciones graves posibles. Habiendo absuelto todas mis dudas, <strong>OTORGO VOLUNTARIAMENTE MI CONSENTIMIENTO INFORMADO</strong> para su realización.
      </div>
    `;
    bloqueFirmaPaciente = `
      <td style="width:37%; vertical-align:bottom; padding:8px 10px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        ${svgFirmaPaciente}
        <div style="border-bottom:1.5px solid #0f2b5c; margin-top:2px;"></div>
        <div style="margin-top:4px; font-weight:800; font-size:9.5px; color:#0f2b5c; letter-spacing:0.3px;">
          ✍️ FIRMA DEL PACIENTE (MANUSCRITA EN BLANCO)
        </div>
        <div style="font-size:9px; color:#0f172a; font-weight:800;">${nomPx}</div>
        <div style="font-size:7.8px; color:#334155;">DNI: <strong>${dniPx}</strong> · Paciente Titular Consciente</div>
        <div style="font-size:7.2px; color:#64748b; font-family:monospace; margin-top:2px; font-weight:700;">
          Firma en blanco · RENIEC no implementa firma digital ciudadana
        </div>
      </td>
    `;
  }

  return `
    <div class="consentimiento-doc" style="width:700px; max-width:100%; margin:auto; background:#ffffff; border:1px solid #000; padding:26px 32px; font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#0f172a; box-sizing:border-box;">
      <!-- CABECERA OFICIAL MINSA -->
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px;">
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

      <div style="text-align:center; font-size:12.5px; font-weight:900; text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
        FORMATO DE CONSENTIMIENTO INFORMADO MÉDICO-QUIRÚRGICO DE EMERGENCIA
      </div>

      <!-- DATOS DE FILIACIÓN DEL PACIENTE -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:10px;">
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
          <td style="padding:4px; border:1px solid #94a3b8; font-weight:700;" colspan="3">${datosMed.nombre} (${datosMed.cmp} · ${datosMed.rne}) — ${datosMed.especialidad}</td>
        </tr>
      </table>

      <!-- CUERPO DE DECLARACIÓN -->
      ${textoDeclaracion}

      <!-- FUNDAMENTO LEGAL -->
      <div style="font-size:9px; color:#475569; border-top:1px dashed #cbd5e1; padding-top:6px; margin-bottom:14px; line-height:1.35;">
        <strong>BASE LEGAL:</strong> Ley General de Salud N° 26842 (Artículos 4° y 15°), Ley N° 29414 (Derechos de los Usuarios en Salud), D.S. N° 027-2015-SA, y Ley N° 27604 (Atención Médica de Emergencia). Toda información se encuentra amparada por el secreto profesional y la Ley N° 29733 de Protección de Datos Personales.
      </div>

      <!-- SECCIÓN DE FIRMAS DIGITALIZADAS Y HUELLA DACTILAR -->
      <table style="width:100%; border-collapse:separate; border-spacing:8px 0; margin-top:12px; text-align:center; font-size:10px;">
        <tr>
          ${bloqueFirmaPaciente}

          <td style="width:26%; vertical-align:middle; padding:8px 6px; border:1px solid #cbd5e1; background:#ffffff; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            ${svgHuellaBiometrica}
            <div style="font-size:8px; font-weight:800; color:#1e3a8a; margin-top:3px; letter-spacing:0.3px;">
              HUELLA DIGITALIZADA
            </div>
            <div style="font-size:7.5px; color:#475569;">
              Índice Derecho · Biometría DNIe
            </div>
            <div style="font-size:7px; color:#64748b; font-weight:700; margin-top:2px;">
              Toma Dactilar Física (En blanco)
            </div>
          </td>

          <td style="width:37%; vertical-align:bottom; padding:8px 10px; border:1px solid #bfdbfe; background:#f0f9ff; border-radius:8px; box-shadow:0 1px 3px rgba(2,132,199,0.06);">
            ${svgFirmaMedico}
            <div style="border-bottom:1.5px solid #0284c7; margin-top:2px;"></div>
            <div style="margin-top:4px; font-weight:800; font-size:9.5px; color:#0369a1; letter-spacing:0.3px;">
              🔏 FIRMA DIGITAL SIMULADA PERSONAL DE SALUD (LEY N° 27269)
            </div>
            <div style="font-size:9px; color:#0f172a; font-weight:800; margin-top:1px;">${datosMed.nombre}</div>
            <div style="font-size:7.8px; color:#0284c7; font-weight:700;">${datosMed.especialidad}</div>
            <div style="font-size:7.8px; color:#334155; margin-top:1px;"><strong>${datosMed.cmp}</strong> · <strong>${datosMed.rne}</strong></div>
            <div style="font-size:7.2px; color:#15803d; font-family:monospace; margin-top:2px; font-weight:700;">
              ✓ PKI-MINSA VÁLIDO · ${datosMed.token}-${docHashToken}
            </div>
          </td>
        </tr>
      </table>

      <!-- CERTIFICACIÓN LEGAL DE FIRMA DIGITAL Y DIGITALIZADA -->
      <div style="margin-top:14px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 12px; font-size:8px; color:#334155; line-height:1.45; text-align:left;">
        <div style="font-weight:800; color:#0f172a; margin-bottom:2px; display:flex; align-items:center; gap:6px;">
          <span>⚖️</span>
          <span>VALIDEZ LEGAL Y EFICACIA JURÍDICA DE FIRMA DIGITAL Y DIGITALIZADA (MARCO NORMATIVO PERUANO):</span>
        </div>
        El presente Consentimiento Informado cuenta con la <strong>Firma Digital Simulada del Personal de Salud</strong> (Médico Asistencial Tratante) respaldada con certificado digital acreditado bajo la <strong>Ley N° 27269</strong> (Ley de Firmas y Certificados Digitales), y la <strong>Firma Manuscrita en blanco del Paciente / Representante Legal</strong> para suscripción física debido a que el sistema de firma digital ciudadana para pacientes aún no ha sido implementado por RENIEC (Art. 4° y 15° de la Ley N° 26842 &amp; NTS N° 139-MINSA).
      </div>

      <div style="margin-top:10px; text-align:center; font-size:8px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:4px;">
        ESTE DOCUMENTO FORMA PARTE INTEGRANTE DE LA HISTORIA CLÍNICA (NTS N° 139-MINSA) · ARCHIVO INMUTABLE EN AUDIT_LOGS SUSALUD
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
  const chk = document.getElementById("chk_consentimiento_firmado");
  if (chk && !chk.checked) {
    chk.checked = true;
    if (typeof toggleConsentimientoFirmado === "function") {
      toggleConsentimientoFirmado(true);
    }
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

  const chk = document.getElementById("chk_consentimiento_firmado");
  if (chk && !chk.checked) {
    chk.checked = true;
    if (typeof toggleConsentimientoFirmado === "function") {
      toggleConsentimientoFirmado(true);
    }
  }

  const w = window.open('', '_blank');
  if (!w) { alert("Permita las ventanas emergentes para imprimir el consentimiento."); return; }

  w.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Consentimiento Informado — ${nomPx} (${hcPx})</title>
      <style>
        @page { size: portrait; margin: 12mm; }
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
function actualizarVisibilidadBotonHC(rol) {
  const rolActual = rol || rolActivoActual || document.getElementById("selector_rol_sistema")?.value || "ADMIN";
  const permitido = (rolActual === "ADMIN" || rolActual === "MEDICO");
  const btnHeader = document.getElementById("btn_header_historia_clinica");
  if (btnHeader) {
    btnHeader.style.setProperty("display", permitido ? "inline-flex" : "none", "important");
  }
  const btnMod2 = document.getElementById("btn_mod2_catalogo_hc");
  if (btnMod2) {
    btnMod2.style.setProperty("display", permitido ? "inline-flex" : "none", "important");
  }
}
window.actualizarVisibilidadBotonHC = actualizarVisibilidadBotonHC;
document.addEventListener("DOMContentLoaded", () => {
  const selRol = document.getElementById("selector_rol_sistema");
  actualizarVisibilidadBotonHC(selRol ? selRol.value : rolActivoActual);
});

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

  // Control de visibilidad del botón de búsqueda de Historia Clínica (Solo Auditor [ADMIN] y Médico [MEDICO])
  actualizarVisibilidadBotonHC(rolActivoActual);

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
    if (typeof RECURSOS_HOSPITALARIOS !== 'undefined') {
      if (RECURSOS_HOSPITALARIOS['ST-01'] && RECURSOS_HOSPITALARIOS['ST-01'].estado === 'disponible') return 'ST-01';
      if (RECURSOS_HOSPITALARIOS['ST-02'] && RECURSOS_HOSPITALARIOS['ST-02'].estado === 'disponible') return 'ST-02';
    }
    return 'ST-01';
  } else {
    // REGLA CLÍNICA Y NORMATIVA CTAS / NTS N° 042-MINSA:
    // Triaje asigna 0 camas físicas para CTAS 2, 3, 4 y 5 (pasa a cola priorizada / tópico ambulatorio).
    // Las camas de observación, hospitalización, SOP o UCI son asignadas exclusivamente por el Médico tratante.
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
    STATE.tipoSeguro = "SIS";
    STATE.nroFua = STATE.nroFua || `FUA-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    STATE.numerFua = STATE.nroFua;
    STATE.estadoFua = STATE.estadoFua || "ABIERTO";
  } else if (valor === "ESSALUD") {
    STATE.tipoSeguro = "EsSalud";
    STATE.nroEssi = STATE.nroEssi || `ESSI-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    STATE.estadoEssi = STATE.estadoEssi || "ABIERTO";
    STATE.acreditadoEsSalud = true;
  } else if (valor === "PARTICULAR") {
    STATE.tipoSeguro = "Particular";
    STATE.nroFua = "";
    STATE.numerFua = "";
    STATE.nroEssi = "";
    STATE.acreditadoEsSalud = false;
  }
  const pxActivo = (PACIENTES_COLA || []).find(p => p.id === pacienteActivoId);
  if (pxActivo) {
    pxActivo.tipoSeguro = STATE.tipoSeguro;
    pxActivo.tipoIpressPublica = STATE.tipoIpressPublica;
    pxActivo.nroFua = STATE.nroFua;
    pxActivo.nroEssi = STATE.nroEssi;
  }
  actualizarFactura();
  if (typeof actualizarBotonesFormatoPublico === "function") {
    actualizarBotonesFormatoPublico();
  }
  if (window.COCKPIT && typeof window.COCKPIT.actualizarTarjetaResumenTriaje === "function") {
    window.COCKPIT.actualizarTarjetaResumenTriaje();
  }
}
window.cambiarIpressPublica = cambiarIpressPublica;

function cambiarPlanPrivado(plan) {
  STATE.planPrivado = plan || "base_80_20";
  STATE.planNivelEps = (plan === "vip_100") ? "VIP" : ((plan === "integral_90_10") ? "Intermedio" : "Base");
  const pxActivo = (PACIENTES_COLA || []).find(p => p.id === pacienteActivoId);
  if (pxActivo) {
    pxActivo.planPrivado = STATE.planPrivado;
    pxActivo.planNivelEps = STATE.planNivelEps;
  }
  actualizarFactura();
}
window.cambiarPlanPrivado = cambiarPlanPrivado;

function cambiarAseguradoraPrivada(aseg) {
  STATE.tipoSeguro = aseg || "Pacífico EPS";
  const pxActivo = (PACIENTES_COLA || []).find(p => p.id === pacienteActivoId);
  if (pxActivo) {
    pxActivo.tipoSeguro = STATE.tipoSeguro;
  }
  actualizarFactura();
  if (window.COCKPIT && typeof window.COCKPIT.actualizarTarjetaResumenTriaje === "function") {
    window.COCKPIT.actualizarTarjetaResumenTriaje();
  }
}
window.cambiarAseguradoraPrivada = cambiarAseguradoraPrivada;

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
      el.addEventListener("blur", () => {
        const param = el.id.replace("_full", "");
        if (typeof validarAlertaVitalEnVivo === "function") validarAlertaVitalEnVivo(param, el.value);
        if (typeof validarSignosVitalesEnVivo === "function") validarSignosVitalesEnVivo();
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


// ==============================================================================
// BLOQUES 3, 4 Y 5: PROTOCOLOS MÉDICOS, JUNTA NTS N° 139 Y SINCRONIZACIÓN
// ==============================================================================

// --- ACTUALIZAR TARJETA RESUMEN RENIEC EN MÓDULO 4 (SOLO LECTURA MÉDICO) ---
function actualizarTarjetaResumenMedico() {
  const lblNombre = document.getElementById("m4_disp_nombre");
  const lblDni = document.getElementById("m4_disp_dni");
  const lblEdadSexo = document.getElementById("m4_disp_edad_sexo");
  const lblHc = document.getElementById("m4_disp_hc");
  const badge = document.getElementById("m4_badge_sincronizado");
  const bannerLegal = document.getElementById("m4_banner_identificacion_legal");

  if (!lblNombre) return;

  const dniReal = STATE.numDni || STATE.dni || document.getElementById("dni_mod1")?.value || document.getElementById("dni_full")?.value || "";
  const nomReal = STATE.nombreReniec || "";
  const esTicketOProvisional = !nomReal || nomReal.includes("(En espera)") || nomReal.includes("(En Espera)") || nomReal.includes("Pre-Triage");
  const pendienteIdentificacion = Boolean(STATE.esNN || STATE.regularizacionDiferida || !dniReal || esTicketOProvisional);

  if (STATE.esNN) {
    const aliasNN = STATE.identificador || "NN-001";
    lblNombre.textContent = `Paciente NN (${aliasNN})`;
    if (lblDni) lblDni.textContent = "NN (Pendiente en Admisión)";
    const edadEst = STATE.edad ? `${STATE.edad}a (est.)` : "Edad est. pendiente";
    const sexoEst = STATE.sexo || "No det.";
    if (lblEdadSexo) lblEdadSexo.textContent = `${edadEst} / ${sexoEst}`;
    if (lblHc) lblHc.textContent = STATE.historiaClinica || "HC-TEMP-EMG-001";
  } else {
    lblNombre.textContent = nomReal || STATE.identificador || "Paciente en Atención Rápida";
    if (lblDni) lblDni.textContent = dniReal || "Pendiente (Admisión)";
    const edad = STATE.edad || document.getElementById("edad_full")?.value || "—";
    const sexo = STATE.sexo || document.getElementById("sexo_full")?.value || "—";
    if (lblEdadSexo) lblEdadSexo.textContent = `${edad} años / ${sexo}`;
    if (lblHc) lblHc.textContent = STATE.historiaClinica || "—";
  }

  if (badge) {
    if (pendienteIdentificacion) {
      badge.textContent = "🟡 Pendiente de Identificación en Módulo 2 (Admisión) — Atención Habilitada (Ley N° 27604)";
      badge.style.background = "#fef3c7";
      badge.style.color = "#92400e";
      badge.style.borderColor = "#fcd34d";
    } else {
      badge.textContent = "✅ Validado en Triaje / Admisión (Solo Lectura — Sin revalidación)";
      badge.style.background = "#f0fdf4";
      badge.style.color = "#166534";
      badge.style.borderColor = "#bbf7d0";
    }
  }
  if (bannerLegal) {
    bannerLegal.style.display = pendienteIdentificacion ? "block" : "none";
  }
}
window.actualizarTarjetaResumenMedico = actualizarTarjetaResumenMedico;

// --- BLOQUE 3.1: EVALUACIÓN MÉDICA PROTOCOLIZADA ---
function ejecutarEvaluacionMedicaProtocolizada() {
  // Ocultar y limpiar acta de Junta Médica si estaba visible (evitar que quede pegada)
  const boxActa = document.getElementById("box_acta_junta_medica");
  if (boxActa) {
    boxActa.style.display = "none";
    boxActa.innerHTML = "";
  }
  const btnEval = document.getElementById("btn_protocolo_eval_medica");
  const btnJunta = document.getElementById("btn_protocolo_junta_medica");
  if (btnEval) {
    btnEval.style.background = "#e0f2fe";
    btnEval.style.borderColor = "#0284c7";
    btnEval.style.color = "#0369a1";
  }
  if (btnJunta) {
    btnJunta.style.background = "";
    btnJunta.style.borderColor = "#6366f1";
    btnJunta.style.color = "#4338ca";
  }

  if (!STATE.identificador) {
    alert("⚠️ Por favor ingrese o seleccione un paciente antes de iniciar la Evaluación Médica.");
    irAModulo(1);
    return;
  }

  const ctas = STATE.prioridadCTAS || (STATE.prioridad === "I" ? 1 : (STATE.prioridad === "II" ? 2 : (STATE.prioridad === "III" ? 3 : (STATE.prioridad === "IV" ? 4 : 5))));
  const motivo = (document.getElementById("motivo_cedis_select")?.value || document.getElementById("motivo_full")?.value || "").toLowerCase();
  const fc = parseFloat(document.getElementById("fc_full")?.value) || 75;
  const fr = parseFloat(document.getElementById("fr_full")?.value) || 16;
  const spo2 = parseFloat(document.getElementById("spo2_full")?.value) || 98;
  const pas = parseFloat(document.getElementById("pas_full")?.value) || 120;
  const glucosa = parseFloat(document.getElementById("glucosa_full")?.value) || null;
  const alergias = (STATE.alergias || document.getElementById("alergias_full")?.value || "").toLowerCase();

  let cie10 = "";
  let destinoSugerido = "observacion";
  let medicamentoSugerido = "";
  let estudioImgSugerido = "";
  let indicacionImg = "";
  let panelLab = [];

  // 1. Diagnóstico CIE-10 y Terapéutica cruzada con motivos CEDIS y signos vitales
  if (motivo.includes("torac") || motivo.includes("corazon") || fc > 120 || pas > 180) {
    cie10 = "I21.9 — Infarto agudo del miocardio sin otra especificación";
    destinoSugerido = ctas === 1 ? "quirofano" : "observacion";
    medicamentoSugerido = "Cloruro de Sodio 0.9% (Suero Fisiológico) 1000ml EV";
    estudioImgSugerido = "Rx Tórax AP y Lateral (Bipedestación / Portátil)";
    indicacionImg = "Evaluación de Silueta Cardíaca y Congestión Pulmonar (ICC)";
    panelLab = ["Hemograma Completo + Plaquetas + Leucocitos", "Troponina T / I Cuantitativa (Marcador Cardíaco STAT)"];
  } else if (motivo.includes("respir") || motivo.includes("disnea") || spo2 < 93 || fr > 24) {
    cie10 = "J45.9 — Asma, no especificada (Crisis asmática)";
    destinoSugerido = ctas <= 2 ? "observacion" : "alta_directa";
    medicamentoSugerido = "Salbutamol 0.5% Solución para Nebulización";
    estudioImgSugerido = "Rx Tórax AP y Lateral (Bipedestación / Portátil)";
    indicacionImg = "Descarte de Neumotórax / Hemotórax / Derrame Pleural";
    panelLab = ["Gases Arteriales (AGA) + Electrolitos Séricos (Na, K, Cl)"];
  } else if (motivo.includes("trauma") || motivo.includes("accidente") || STATE.esAccidenteTransito) {
    cie10 = "T14.9 — Traumatismo no especificado por accidente de tránsito";
    destinoSugerido = ctas === 1 ? "quirofano" : "observacion";
    medicamentoSugerido = "Lactato de Ringer (Hartmann) 1000ml EV";
    estudioImgSugerido = "Ecografía FAST (Trauma / Detección Líquido Libre)";
    indicacionImg = "Ecografía FAST de Trauma Abdominal Cerrado (Hemoperitoneo)";
    panelLab = ["Hemograma Completo + Plaquetas + Leucocitos", "Grupo Sanguíneo y Factor Rh (Prueba Cruzada STAT)"];
  } else if (motivo.includes("abdom") || motivo.includes("apendic")) {
    cie10 = "K35.8 — Apendicitis aguda";
    destinoSugerido = "quirofano";
    medicamentoSugerido = "Cloruro de Sodio 0.9% (Suero Fisiológico) 1000ml EV";
    estudioImgSugerido = "Ecografía Abdominal Completa y Vías Biliares";
    indicacionImg = "Descarte de Abdomen Agudo Quirúrgico / Apendicitis / Obstrucción";
    panelLab = ["Hemograma Completo + Plaquetas + Leucocitos", "Proteína C Reactiva (PCR) Cuantitativa Ultrasensible"];
  } else if (motivo.includes("neuro") || motivo.includes("convuls") || (STATE.glasgow && STATE.glasgow < 14)) {
    cie10 = "I64.X — Accidente vascular encefálico agudo (Ictus)";
    destinoSugerido = ctas === 1 ? "uci" : "observacion";
    medicamentoSugerido = "Cloruro de Sodio 0.9% (Suero Fisiológico) 1000ml EV";
    estudioImgSugerido = "TAC Cerebral Sin Contraste (Descarte ACV / TEC Agudo)";
    indicacionImg = "Descarte de Hemorragia Subaracnoidea / Ictus Isquémico Agudo (Protocolo Stroke)";
    panelLab = ["Glucosa, Urea y Creatinina Sérica", "Tiempo de Protrombina (TP) e INR"];
  } else if (glucosa && glucosa < 54) {
    cie10 = "E16.2 — Hipoglucemia severa sintomática";
    destinoSugerido = "observacion";
    medicamentoSugerido = "Dextrosa 33% Frasco Ampolla 20ml EV";
    estudioImgSugerido = "";
    panelLab = ["Glucosa, Urea y Creatinina Sérica"];
  } else if (ctas >= 4) {
    cie10 = "A09.0 — Gastroenteritis aguda con deshidratación severa";
    destinoSugerido = "alta_directa";
    medicamentoSugerido = "Cloruro de Sodio 0.9% (Suero Fisiológico) 1000ml EV";
    estudioImgSugerido = "";
    panelLab = ["Hemograma Completo + Plaquetas + Leucocitos"];
  } else {
    cie10 = "B34.9 — Síndrome febril agudo en estudio";
    destinoSugerido = ctas <= 2 ? "observacion" : "alta_directa";
    medicamentoSugerido = "Paracetamol 1g Frasco Solución para Infusión EV";
    panelLab = ["Hemograma Completo + Plaquetas + Leucocitos"];
  }

  // 2. Respetar alergias medicamentosas
  if (alergias.includes("penicil") || alergias.includes("beta-lact") || alergias.includes("cefalosp")) {
    if (medicamentoSugerido.toLowerCase().includes("ceftriax") || medicamentoSugerido.toLowerCase().includes("amoxi")) {
      medicamentoSugerido = "Ciprofloxacino 200mg/100ml Solución para Infusión EV";
    }
  }

  // 3. Aplicar en pantalla automáticamente
  const selCie = document.getElementById("cie10_select");
  if (selCie) {
    selCie.value = cie10;
    if (typeof seleccionarCIE10 === "function") seleccionarCIE10(cie10);
  }

  // 4. Prescribir medicamento en Kardex
  if (medicamentoSugerido && typeof prescribirMedicamentoCatalogo === "function") {
    const selMed = document.getElementById("select_farmacia_catalogo");
    if (selMed) selMed.value = medicamentoSugerido;
    prescribirMedicamentoCatalogo();
  }

  // 5. Solicitar estudio de imagen si aplica
  if (estudioImgSugerido && typeof solicitarEstudioImagen === "function") {
    const selImg = document.getElementById("select_imagenes_catalogo");
    const selInd = document.getElementById("input_indicacion_img");
    if (selImg) selImg.value = estudioImgSugerido;
    if (selInd && indicacionImg) selInd.value = indicacionImg;
    solicitarEstudioImagen();
  }

  // 6. Solicitar laboratorio si aplica
  if (panelLab.length > 0 && typeof agregarOrdenLaboratorio === "function") {
    panelLab.forEach(lab => agregarOrdenLaboratorio(lab));
  }

  // 7. Seleccionar Destino Clínico y Asignar Recurso Definitivo
  seleccionarDestinoPostTopico(destinoSugerido);

  // 8. Notificar al usuario
  alert(`🩺 EVALUACIÓN MÉDICA PROTOCOLIZADA APLICADA:
• Diagnóstico: ${cie10}
• Destino Asignado: ${destinoSugerido.toUpperCase()}
• Plan Inicial: Kardex, Laboratorio e Imágenes actualizados según guías.`);
}
window.ejecutarEvaluacionMedicaProtocolizada = ejecutarEvaluacionMedicaProtocolizada;

// --- BLOQUE 3.2: JUNTA MÉDICA (NTS N° 139-MINSA) ---
let contadorActasJunta = 1;
function ejecutarJuntaMedicaNTS139() {
  if (!STATE.identificador) {
    alert("⚠️ Por favor ingrese o seleccione un paciente antes de convocar a Junta Médica.");
    irAModulo(1);
    return;
  }

  const btnEval = document.getElementById("btn_protocolo_eval_medica");
  const btnJunta = document.getElementById("btn_protocolo_junta_medica");
  if (btnJunta) {
    btnJunta.style.background = "#e0e7ff";
    btnJunta.style.borderColor = "#4338ca";
    btnJunta.style.color = "#3730a3";
  }
  if (btnEval) {
    btnEval.style.background = "";
    btnEval.style.borderColor = "#0284c7";
    btnEval.style.color = "#0369a1";
  }

  const numActa = `JM-2026-${String(contadorActasJunta).padStart(3, "0")}`;
  contadorActasJunta++;
  const ahora = new Date();
  const fechaStr = ahora.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const horaStr = ahora.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const ctas = STATE.prioridadCTAS || (STATE.prioridad === "I" ? 1 : 2);
  const cie10 = document.getElementById("cie10_select")?.value || "I21.9 — Infarto agudo del miocardio sin otra especificación";
  const paciente = STATE.nombreReniec || STATE.identificador;
  const hc = STATE.historiaClinica || "HC-2026-0001";

  // Destino colegiado de Junta Médica
  let destinoJunta = "uci";
  let recursoCama = "UCI-01";
  if (ctas === 1) {
    destinoJunta = "quirofano";
    recursoCama = "SOP-01";
  } else if (ctas === 2) {
    destinoJunta = "hospitalizacion";
    recursoCama = "OBS-03";
  }

  // Registrar en audit_logs inmutable
  registrarLogAuditoria("Módulo 4", "ACTA_JUNTA_MEDICA_NTS139", `Acta ${numActa} suscrita colegiadamente para ${paciente} (${hc}): Consenso ${cie10} -> ${recursoCama} [Firmado electrónicamente por los 3 facultativos]`);

  // Capturar datos clínicos observados y decisiones para vista e impresión
  const vitalesObs = {
    spo2: document.getElementById("spo2_full")?.value || STATE.spo2 || "—",
    fc: document.getElementById("fc_full")?.value || STATE.fc || "—",
    pas: document.getElementById("pas_full")?.value || STATE.pasSistolica || "—",
    pad: document.getElementById("pad_full")?.value || STATE.paDiastolica || "—",
    fr: document.getElementById("fr_full")?.value || STATE.fr || "—",
    temp: document.getElementById("temp_full")?.value || STATE.temperatura || "—",
    glasgow: document.getElementById("glasgow_full")?.value || STATE.glasgow || "—",
    glucosa: document.getElementById("glucosa_full")?.value || STATE.glucosa || "—",
    eva: document.getElementById("eva_full")?.value || STATE.eva || "0"
  };
  const motivoObs = document.getElementById("motivo_full")?.value || STATE.motivoConsulta || "Cuadro clínico de alta complejidad / riesgo vital inminente";
  const alergiasObs = document.getElementById("alergias_full")?.value || STATE.alergias || "Niega / Por confirmar";
  const dniObs = STATE.esNN ? "NN (Regularización Diferida Ley N° 27604)" : (STATE.numDni || document.getElementById("dni_mod1")?.value || "Pendiente en Admisión");
  const kardexObs = (Array.isArray(STATE.kardexItems) && STATE.kardexItems.length > 0)
    ? STATE.kardexItems.map(k => `${k.nombre} (${k.dosis || 'STAT'} · ${k.frecuencia || 'STAT'})`)
    : ["Soporte hemodinámico y estabilización avanzada en curso"];
  const labObs = (Array.isArray(STATE.ordenesLaboratorio) && STATE.ordenesLaboratorio.length > 0)
    ? STATE.ordenesLaboratorio.map(l => l.nombre)
    : ["Panel analítico crítico de emergencia STAT"];
  const imgObs = (Array.isArray(STATE.ordenesImagenes) && STATE.ordenesImagenes.length > 0)
    ? STATE.ordenesImagenes.map(im => im.nombre)
    : ["Evaluación imagenológica prioritaria según protocolo"];

  // Renderizar Acta en #box_acta_junta_medica con firmas digitalizadas de todos los miembros
  const box = document.getElementById("box_acta_junta_medica");
  if (box) {
    const hashDoc1 = Math.abs((paciente + "45210" + fechaStr).split("").reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0) | 0, 0)).toString(16).toUpperCase().padStart(8, '0');
    const hashDoc2 = Math.abs((paciente + "51892" + fechaStr).split("").reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0) | 0, 0)).toString(16).toUpperCase().padStart(8, '0');
    const hashDoc3 = Math.abs((paciente + "32187" + fechaStr).split("").reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0) | 0, 0)).toString(16).toUpperCase().padStart(8, '0');

    const svgFirmaMendoza = `
      <div style="height:48px; display:flex; align-items:center; justify-content:center; overflow:hidden; margin:4px 0;">
        <svg width="180" height="44" viewBox="0 0 180 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 12 32 C 24 8, 38 40, 52 14 C 64 2, 76 34, 90 10 C 102 4, 114 26, 128 8 M 20 36 C 65 39, 118 36, 172 26" stroke="#0369a1" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="168" cy="12" r="2.3" fill="#0369a1"/>
        </svg>
      </div>
    `;

    const svgFirmaParedes = `
      <div style="height:48px; display:flex; align-items:center; justify-content:center; overflow:hidden; margin:4px 0;">
        <svg width="180" height="44" viewBox="0 0 180 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 14 28 C 22 10, 32 38, 46 16 C 58 4, 68 36, 82 12 C 94 6, 104 30, 120 10 C 132 2, 146 26, 162 8 M 38 36 C 75 38, 120 34, 168 24" stroke="#0f766e" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M 156 16 L 168 32" stroke="#0f766e" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    `;

    const svgFirmaZevallos = `
      <div style="height:48px; display:flex; align-items:center; justify-content:center; overflow:hidden; margin:4px 0;">
        <svg width="180" height="44" viewBox="0 0 180 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 14 20 C 26 6, 40 34, 56 10 C 68 4, 78 38, 94 16 C 108 4, 120 30, 136 12 C 146 6, 156 22, 166 8 M 20 38 C 60 40, 110 37, 166 30" stroke="#4338ca" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="158" cy="10" r="2.3" fill="#4338ca"/>
          <circle cx="166" cy="16" r="2.1" fill="#4338ca"/>
        </svg>
      </div>
    `;

    box.style.display = "block";
    box.innerHTML = `
      <div class="acta-junta-card" style="background:#ffffff; border:2px solid #6366f1; border-radius:12px; padding:18px; margin-top:12px; box-shadow:0 4px 14px rgba(99,102,241,0.12);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e0e7ff; padding-bottom:10px; margin-bottom:12px;">
          <div>
            <div style="font-size:0.75rem; font-weight:800; color:#4338ca; text-transform:uppercase;">NTS N° 139-MINSA · Art. 6.4 · Junta Médica Extraordinaria</div>
            <div style="font-size:1.05rem; font-weight:900; color:#1e1b4b;">ACTA OFICIAL DE JUNTA MÉDICA N° ${numActa}</div>
          </div>
          <span style="font-size:0.75rem; padding:4px 10px; border-radius:9999px; background:#e0e7ff; color:#3730a3; font-weight:800;">
            📅 ${fechaStr} · 🕒 ${horaStr}
          </span>
        </div>

        <div style="font-size:0.82rem; color:#334155; line-height:1.5; margin-bottom:14px;">
          Reunidos los facultativos de guardia para evaluar el caso de alta complejidad de <strong>${paciente}</strong> (HC: <strong>${hc}</strong>), tras analizar paraclínicos, evolución hemodinámica y riesgo vital inminente, <strong>ACUERDAN POR UNANIMIDAD:</strong>
          <ul style="margin:8px 0; padding-left:20px;">
            <li><strong>Diagnóstico Colegiado Definitivo:</strong> ${cie10}</li>
            <li><strong>Resolución Asistencial:</strong> Traslado inmediato e internamiento en <strong>${recursoCama} (${destinoJunta.toUpperCase()})</strong>.</li>
            <li><strong>Disposición Legal:</strong> Cobertura amparada en Ley N° 27604 y emisión prioritaria de Carta de Garantía / FUA.</li>
          </ul>
        </div>

        <!-- MIEMBROS FIRMANTES CON FIRMAS DIGITALIZADAS INDIVIDUALES -->
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-bottom:14px;">
          <div style="font-size:0.72rem; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            <span>Miembros Firmantes de la Junta Médica (Ley N° 27269):</span>
            <span style="color:#16a34a; font-weight:800; font-size:0.70rem;">✓ 3 de 3 Firmas Digitalizadas Suscritas</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; font-size:0.76rem;">
            
            <!-- Miembro 1 -->
            <div style="border-left:3px solid #0284c7; background:#ffffff; padding:10px 12px; border-radius:0 6px 6px 0; border-top:1px solid #e2e8f0; border-right:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <strong style="color:#0f172a; font-size:0.80rem;">Dr. Carlos Mendoza Alva</strong><br>
                <span style="color:#64748b; font-size:0.71rem;">Emergenciólogo Tratante · CMP 45210 · RNE 23901</span>
              </div>
              ${svgFirmaMendoza}
              <div style="border-bottom:1.5px solid #0284c7; margin-bottom:6px;"></div>
              <div style="font-size:0.67rem; color:#0369a1; font-weight:800; display:flex; align-items:center; justify-content:space-between; background:#f0f9ff; padding:3px 6px; border-radius:4px; border:1px solid #bae6fd;">
                <span>✍️ Firma Digitalizada</span>
                <span style="font-family:monospace;">SHA256-${hashDoc1}</span>
              </div>
            </div>

            <!-- Miembro 2 -->
            <div style="border-left:3px solid #0d9488; background:#ffffff; padding:10px 12px; border-radius:0 6px 6px 0; border-top:1px solid #e2e8f0; border-right:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <strong style="color:#0f172a; font-size:0.80rem;">Dr. Juan Manuel Paredes</strong><br>
                <span style="color:#64748b; font-size:0.71rem;">Especialista Quirúrgico · CMP 51892 · RNE 27415</span>
              </div>
              ${svgFirmaParedes}
              <div style="border-bottom:1.5px solid #0d9488; margin-bottom:6px;"></div>
              <div style="font-size:0.67rem; color:#0f766e; font-weight:800; display:flex; align-items:center; justify-content:space-between; background:#f0fdfa; padding:3px 6px; border-radius:4px; border:1px solid #99f6e4;">
                <span>✍️ Firma Digitalizada</span>
                <span style="font-family:monospace;">SHA256-${hashDoc2}</span>
              </div>
            </div>

            <!-- Miembro 3 -->
            <div style="border-left:3px solid #4f46e5; background:#ffffff; padding:10px 12px; border-radius:0 6px 6px 0; border-top:1px solid #e2e8f0; border-right:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <strong style="color:#0f172a; font-size:0.80rem;">Dra. Mariana Zevallos Ríos</strong><br>
                <span style="color:#64748b; font-size:0.71rem;">Jefa de Guardia / Auditora · CMP 32187 · RNE 18452</span>
              </div>
              ${svgFirmaZevallos}
              <div style="border-bottom:1.5px solid #4f46e5; margin-bottom:6px;"></div>
              <div style="font-size:0.67rem; color:#4338ca; font-weight:800; display:flex; align-items:center; justify-content:space-between; background:#eef2ff; padding:3px 6px; border-radius:4px; border:1px solid #c7d2fe;">
                <span>✍️ Firma Digitalizada</span>
                <span style="font-family:monospace;">SHA256-${hashDoc3}</span>
              </div>
            </div>

          </div>
        </div>

        <!-- CHECK Y CERTIFICACIÓN OFICIAL DE FIRMA ELECTRÓNICA ENTRE TODOS LOS INVOLUCRADOS -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#f0fdf4; border:1.5px solid #86efac; border-radius:8px; padding:10px 14px; margin-bottom:12px;">
          <div style="display:flex; align-items:flex-start; gap:8px;">
            <span style="font-size:1.1rem; line-height:1;">✅</span>
            <div>
              <div style="font-size:0.76rem; color:#15803d; font-weight:800;">
                Acta registrada inmutablemente en audit_logs de SUSALUD y firmada electrónicamente entre todos los involucrados.
              </div>
              <div style="font-size:0.69rem; color:#166534; margin-top:2px;">
                Conforme a la Ley N° 27269 (Ley de Firmas y Certificados Digitales) y Art. 6.4 de la NTS N° 139-MINSA. Certificación colegiada unánime acreditada.
              </div>
            </div>
          </div>
          <span style="background:#16a34a; color:#ffffff; font-size:0.68rem; font-weight:800; padding:3px 8px; border-radius:9999px;">
            🔏 100% FIRMADO
          </span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <button type="button" id="btn_imprimir_acta_junta" class="btn-full-secondary" style="border:1.5px solid #4338ca; color:#3730a3; background:#eef2ff; padding:7px 16px; font-size:0.80rem; font-weight:800; display:inline-flex; align-items:center; gap:6px; cursor:pointer;" onclick="imprimirActaJuntaMedicaNTS139()">
            <span>🖨️</span> <span>Imprimir Acta Detallada (Hallazgos, Decisiones y Firmas)</span>
          </button>
          <button type="button" class="btn-full-primary" style="background:#4338ca; padding:7px 18px; font-size:0.80rem; font-weight:800; display:inline-flex; align-items:center; gap:6px;" onclick="seleccionarDestinoPostTopico('${destinoJunta}')">
            <span>🚀</span> <span>Ejecutar Traslado Asignado a ${recursoCama}</span>
          </button>
        </div>
      </div>
    `;

    window._ultimaActaJuntaMedica = {
      numActa, fechaStr, horaStr, paciente, hc, dniObs, ctas, cie10,
      destinoJunta, recursoCama, motivoObs, alergiasObs, vitalesObs,
      kardexObs, labObs, imgObs, hashDoc1, hashDoc2, hashDoc3,
      svgFirmaMendoza, svgFirmaParedes, svgFirmaZevallos
    };
  }

  // Ejecutar asignación de recurso colegiado
  seleccionarDestinoPostTopico(destinoJunta);
  if (typeof autoGuardarCambioEnHistoriaClinica === "function") {
    autoGuardarCambioEnHistoriaClinica(`Junta Médica ${numActa}`);
  }
}

function imprimirActaJuntaMedicaNTS139() {
  const acta = window._ultimaActaJuntaMedica;
  if (!acta) {
    alert("⚠️ Primero debe generar el Acta de Junta Médica.");
    return;
  }
  const htmlDoc = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Acta de Junta Médica ${acta.numActa} — NTS N° 139-MINSA</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 24px; line-height: 1.45; font-size: 12px; }
  .header { border-bottom: 2.5px solid #1e1b4b; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start; }
  .title { font-size: 16px; font-weight: 900; color: #1e1b4b; margin: 2px 0; }
  .sub { font-size: 11px; color: #4338ca; font-weight: 700; text-transform: uppercase; }
  .section { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; page-break-inside: avoid; }
  .sec-title { font-size: 11px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
  .vitals-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 6px; }
  .vital-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px; text-align: center; }
  .firmas-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 10px; }
  .firma-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; text-align: center; }
  .no-print { margin-bottom: 14px; display: flex; gap: 8px; }
  @media print { .no-print { display: none !important; } body { margin: 12px; } }
</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:8px 16px; background:#4338ca; color:#fff; border:none; border-radius:6px; font-weight:700; cursor:pointer;">🖨️ Imprimir / Guardar PDF</button>
    <button onclick="window.close()" style="padding:8px 14px; background:#e2e8f0; color:#0f172a; border:none; border-radius:6px; font-weight:700; cursor:pointer;">Cerrar</button>
  </div>

  <div class="header">
    <div>
      <div class="sub">Ministerio de Salud · Servicio de Emergencia · NTS N° 139-MINSA Art. 6.4</div>
      <div class="title">ACTA OFICIAL DE JUNTA MÉDICA EXTRAORDINARIA N° ${acta.numActa}</div>
      <div>Documento Médico-Legal Colegiado · Ley N° 27604 · Ley N° 27269 (Firmas Digitales)</div>
    </div>
    <div style="text-align:right;">
      <strong>Fecha:</strong> ${acta.fechaStr}<br>
      <strong>Hora:</strong> ${acta.horaStr}<br>
      <strong>CTAS:</strong> Prioridad ${acta.ctas}
    </div>
  </div>

  <div class="section">
    <div class="sec-title">1. Identificación del Paciente y Contexto de Ingreso</div>
    <div class="grid-2">
      <div><strong>Paciente:</strong> ${acta.paciente}</div>
      <div><strong>Historia Clínica:</strong> ${acta.hc}</div>
      <div><strong>Documento / DNI:</strong> ${acta.dniObs}</div>
      <div><strong>Alergias Registradas:</strong> ${acta.alergiasObs}</div>
    </div>
    <div style="margin-top:6px;"><strong>Motivo / Cuadro de Ingreso:</strong> ${acta.motivoObs}</div>
  </div>

  <div class="section">
    <div class="sec-title">2. Hallazgos Clínicos Observados por la Junta Médica (Signos Vitales &amp; Paraclínicos)</div>
    <div class="vitals-grid">
      <div class="vital-box"><strong>SpO2</strong><br>${acta.vitalesObs.spo2}%</div>
      <div class="vital-box"><strong>FC</strong><br>${acta.vitalesObs.fc} lpm</div>
      <div class="vital-box"><strong>PA</strong><br>${acta.vitalesObs.pas}/${acta.vitalesObs.pad}</div>
      <div class="vital-box"><strong>FR</strong><br>${acta.vitalesObs.fr} rpm</div>
      <div class="vital-box"><strong>Temp</strong><br>${acta.vitalesObs.temp} °C</div>
      <div class="vital-box"><strong>Glasgow</strong><br>${acta.vitalesObs.glasgow}/15</div>
      <div class="vital-box"><strong>Glucemia</strong><br>${acta.vitalesObs.glucosa} mg/dL</div>
      <div class="vital-box"><strong>Dolor EVA</strong><br>${acta.vitalesObs.eva}/10</div>
    </div>
    <div style="margin-top:8px;"><strong>Laboratorio Evaluado / Solicitado:</strong> ${acta.labObs.join("; ")}</div>
    <div><strong>Imágenes Evaluadas / Solicitadas:</strong> ${acta.imgObs.join("; ")}</div>
    <div><strong>Esquema Farmacológico (Kardex):</strong> ${acta.kardexObs.join("; ")}</div>
  </div>

  <div class="section">
    <div class="sec-title">3. Deliberación y Decisiones Colegiadas Adoptadas por Unanimidad</div>
    <ul style="margin:4px 0 0 18px; padding:0;">
      <li><strong>Diagnóstico Colegiado Definitivo (CIE-10):</strong> ${acta.cie10}</li>
      <li><strong>Resolución Asistencial y Destino:</strong> Traslado e internamiento inmediato en <strong>${acta.recursoCama} (${acta.destinoJunta.toUpperCase()})</strong> bajo monitoreo médico continuo.</li>
      <li><strong>Disposición Administrativa y Financiera:</strong> Cobertura amparada conforme a Ley N° 27604 (Emergencia Vital) con emisión prioritaria de FUA / ESSI / Carta de Garantía según corresponda.</li>
      <li><strong>Consentimiento y Seguridad:</strong> Actuación multidisciplinaria urgente para preservación de la vida y mitigación de daño orgánico irreversible.</li>
    </ul>
  </div>

  <div class="section">
    <div class="sec-title">4. Firmas Electrónicas y Digitalizadas de los Miembros Participantes (Ley N° 27269)</div>
    <div class="firmas-grid">
      <div class="firma-card">
        <strong>Dr. Carlos Mendoza Alva</strong><br>
        <span style="font-size:10px;color:#475569;">Emergenciólogo Tratante · CMP 45210 · RNE 23901</span>
        ${acta.svgFirmaMendoza}
        <div style="border-top:1px solid #0284c7;padding-top:3px;font-size:10px;font-family:monospace;">SHA256-${acta.hashDoc1}</div>
      </div>
      <div class="firma-card">
        <strong>Dr. Juan Manuel Paredes</strong><br>
        <span style="font-size:10px;color:#475569;">Especialista Quirúrgico · CMP 51892 · RNE 27415</span>
        ${acta.svgFirmaParedes}
        <div style="border-top:1px solid #0d9488;padding-top:3px;font-size:10px;font-family:monospace;">SHA256-${acta.hashDoc2}</div>
      </div>
      <div class="firma-card">
        <strong>Dra. Mariana Zevallos Ríos</strong><br>
        <span style="font-size:10px;color:#475569;">Jefa de Guardia / Auditora · CMP 32187 · RNE 18452</span>
        ${acta.svgFirmaZevallos}
        <div style="border-top:1px solid #4f46e5;padding-top:3px;font-size:10px;font-family:monospace;">SHA256-${acta.hashDoc3}</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  window._ultimoHtmlActaJunta = htmlDoc;
  const win = window.open("", "_blank", "width=920,height=780");
  if (win) {
    win.document.open();
    win.document.write(htmlDoc);
    win.document.close();
  } else {
    alert("ℹ️ El navegador bloqueó la ventana emergente de impresión. Permite popups para imprimir el Acta.");
  }
}
window.imprimirActaJuntaMedicaNTS139 = imprimirActaJuntaMedicaNTS139;

function seleccionarDestinoPostTopico(ruta) {
  STATE.destinoPostTopico = ruta;

  // Actualizar radio buttons visuales
  const radios = document.querySelectorAll("input[name='destino_post_topico']");
  radios.forEach(r => {
    r.checked = (r.value === ruta);
  });

  const lblBadge = document.getElementById("lbl_recurso_cama_estado");

  // Identificar cama previa para liberación segura
  const camaPrevia = STATE.camaAsignadaId || (STATE.camaAsignada && typeof normalizarIdCamaClinica === "function" ? normalizarIdCamaClinica(STATE.camaAsignada) : null);

  if (ruta === "alta_directa" || ruta === "alta") {
    // 0 Camas físicas: Liberar explícitamente cualquier cama asignada
    if (camaPrevia && typeof RECURSOS_HOSPITALARIOS !== "undefined" && RECURSOS_HOSPITALARIOS[camaPrevia]) {
      RECURSOS_HOSPITALARIOS[camaPrevia].estado = "disponible";
      RECURSOS_HOSPITALARIOS[camaPrevia].paciente = null;
    }
    if (typeof RECURSOS_HOSPITALARIOS !== "undefined") {
      for (const k in RECURSOS_HOSPITALARIOS) {
        const r = RECURSOS_HOSPITALARIOS[k];
        const pac = r ? r.paciente : null;
        const esMismoPaciente = pac && (
          pac.identificador === STATE.identificador ||
          pac.nombre === STATE.nombreReniec ||
          pac.nombre === STATE.identificador ||
          (typeof pacienteActivoId !== "undefined" && (pac.id === pacienteActivoId || pac.pacienteId === pacienteActivoId)) ||
          (STATE.identificador && typeof pac.nombre === "string" && pac.nombre.includes(STATE.identificador)) ||
          (STATE.nombreReniec && typeof pac.nombre === "string" && pac.nombre.includes(STATE.nombreReniec))
        );
        if (esMismoPaciente || (camaPrevia && k === camaPrevia) || (STATE.camaAsignadaId && k === STATE.camaAsignadaId)) {
          r.estado = "disponible";
          r.paciente = null;
        }
      }
    }
    if (Array.isArray(window.PACIENTES_COLA)) {
      window.PACIENTES_COLA.forEach(px => {
        if (px.identificador === STATE.identificador || px.nombre === STATE.nombreReniec || (typeof pacienteActivoId !== "undefined" && px.id === pacienteActivoId)) {
          px.estadoFlujo = "ALTA_CLINICA";
          px.estadoAtencion = "Atendido";
          px.terminoFlujo = true;
          px.camaId = null;
          px.camaAsignada = null;
        }
      });
    }
    STATE.estadoFlujo = "ALTA_CLINICA";
    STATE.estadoAtencion = "Atendido";
    STATE.terminoFlujo = true;
    if (typeof renderizarBandejaPosta === "function") {
      renderizarBandejaPosta();
    }
    if (typeof renderizarTableroColaPacientes === "function") {
      renderizarTableroColaPacientes();
    }
    STATE.camaAsignadaId = null;
    STATE.camaAsignada = null;
    if (lblBadge) {
      lblBadge.textContent = "Recurso asignado: 0 camas (Alta Ambulatoria)";
      lblBadge.style.background = "#dcfce7";
      lblBadge.style.color = "#15803d";
      lblBadge.style.borderColor = "#bbf7d0";
    }
    if (typeof actualizarCamasMonitorEnTiempoReal === "function") {
      actualizarCamasMonitorEnTiempoReal();
    }
    return;
  } else if (ruta === "observacion") {
    if (camaPrevia && camaPrevia !== "OBS-01" && typeof RECURSOS_HOSPITALARIOS !== "undefined" && RECURSOS_HOSPITALARIOS[camaPrevia]) {
      RECURSOS_HOSPITALARIOS[camaPrevia].estado = "disponible";
      RECURSOS_HOSPITALARIOS[camaPrevia].paciente = null;
    }
    STATE.camaAsignadaId = "OBS-01";
    STATE.camaAsignada = "Cama Observación 1 (OBS-01)";
    if (lblBadge) {
      lblBadge.textContent = "Recurso asignado: Cama OBS-01";
      lblBadge.style.background = "#eff6ff";
      lblBadge.style.color = "#1d4ed8";
      lblBadge.style.borderColor = "#bfdbfe";
    }
  } else if (ruta === "hospitalizacion") {
    STATE.camaAsignadaId = "OBS-03";
    STATE.camaAsignada = "Cama Hospitalización (HOS-01)";
    if (lblBadge) {
      lblBadge.textContent = "Recurso asignado: Cama HOS-01 (Carta Requerida)";
      lblBadge.style.background = "#e0e7ff";
      lblBadge.style.color = "#3730a3";
      lblBadge.style.borderColor = "#c7d2fe";
    }
  } else if (ruta === "quirofano" || ruta === "quirofano_uci") {
    STATE.camaAsignadaId = "SOP-01";
    STATE.camaAsignada = "Quirófano 1 (SOP-01)";
    if (lblBadge) {
      lblBadge.textContent = "Recurso asignado: Quirófano SOP-01 (STAT)";
      lblBadge.style.background = "#fee2e2";
      lblBadge.style.color = "#991b1b";
      lblBadge.style.borderColor = "#fca5a5";
    }
  } else if (ruta === "uci") {
    STATE.camaAsignadaId = "UCI-01";
    STATE.camaAsignada = "Cama UCI 1 (UCI-01)";
    if (lblBadge) {
      lblBadge.textContent = "Recurso asignado: Cama UCI-01 (Soporte Crítico)";
      lblBadge.style.background = "#fee2e2";
      lblBadge.style.color = "#991b1b";
      lblBadge.style.borderColor = "#fca5a5";
    }
  } else if (ruta === "referencia") {
    STATE.camaAsignadaId = null;
    STATE.camaAsignada = "Referencia Externa (0 camas)";
    if (lblBadge) {
      lblBadge.textContent = "Recurso asignado: 0 camas (Ambulancia SAMU / Referencia)";
      lblBadge.style.background = "#ffedd5";
      lblBadge.style.color = "#c2410c";
      lblBadge.style.borderColor = "#fed7aa";
    }
  }

  // Reflejar inmediatamente en el monitor de 15 camas en tiempo real
  if (typeof actualizarCamasMonitorEnTiempoReal === "function") {
    actualizarCamasMonitorEnTiempoReal();
  }
}
window.seleccionarDestinoPostTopico = seleccionarDestinoPostTopico;

// Sincronizar tarjeta resumen al cargar o modificar estado
document.addEventListener("DOMContentLoaded", () => {
  actualizarTarjetaResumenMedico();
});


// ===========================================================================
// GESTIÓN DE HISTORIAL DIARIO (NTS N° 139-MINSA) & REINICIO DEMOSTRACIÓN [!]
// ===========================================================================

const STORAGE_HISTORIAL_KEY = "upp_historial_diario_v1";
const STORAGE_GUARDIA_ACTIVA_KEY = "upp_fecha_guardia_activa";

/**
 * Obtiene la fecha actual en formato local YYYY-MM-DD
 */
function obtenerFechaHoyISO() {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, "0");
  const d = String(ahora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Carga o inicializa el historial diario desde localStorage
 */
function obtenerHistorialDiarioTotal() {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORIAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {};
}

/**
 * Guarda el historial diario en localStorage
 */
function guardarHistorialDiarioTotal(datos) {
  try {
    localStorage.setItem(STORAGE_HISTORIAL_KEY, JSON.stringify(datos));
  } catch(e) {}
}

/**
 * Archiva un paciente en el historial del día correspondiente
 */
function archivarPacienteEnHistorialDiario(px) {
  if (!px) return;
  const fechaHoy = obtenerFechaHoyISO();
  const historial = obtenerHistorialDiarioTotal();
  if (!Array.isArray(historial[fechaHoy])) {
    historial[fechaHoy] = [];
  }

  // Evitar duplicados por ID
  const idx = historial[fechaHoy].findIndex(item => item.id === px.id);
  const registro = {
    id: px.id,
    numero: px.numero || 1,
    identificador: px.identificador || "Ticket S/N",
    nombre: px.nombre || "Paciente Sin Identificar",
    dni: px.dni || "S/D",
    prioridad: px.prioridad || "V",
    motivo: px.motivo || "Atención de Emergencia",
    cie10: (px.stateSnapshot && px.stateSnapshot.cie10Seleccionado) || (STATE && STATE.cie10Seleccionado) || "R69 — Diagnóstico provisional",
    medico: px.medico || (px.stateSnapshot && px.stateSnapshot.medicoTratante) || (STATE && STATE.medicoTratante) || "Dr. Ricardo Morales (CMP 48210)",
    enfermero: (STATE && STATE.enfermeroTriaje) || "Lic. Roxana Paredes (CEP 45892)",
    camaNombre: px.camaNombre || (px.stateSnapshot && px.stateSnapshot.camaAsignada) || "Alta / Ambulatorio",
    destino: (px.stateSnapshot && px.stateSnapshot.destinoPostTopico) || (STATE && STATE.destinoPostTopico) || "Alta Médica Directa",
    horaLlegada: px.horaLlegada || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    fechaAtencion: fechaHoy,
    timestamp: px.timestampLlegada || Date.now(),
    estadoAtencion: "Atendido / Concluido"
  };

  if (idx >= 0) {
    historial[fechaHoy][idx] = registro;
  } else {
    historial[fechaHoy].push(registro);
  }
  guardarHistorialDiarioTotal(historial);
}

/**
 * Precarga datos demostrativos de días anteriores para consulta inmediata
 */
function cargarDatosDemoDiasAnteriores() {
  const historial = obtenerHistorialDiarioTotal();
  const hoy = new Date();
  
  // Ayer
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const fechaAyer = ayer.toISOString().split("T")[0];

  // Anteayer
  const anteayer = new Date(hoy);
  anteayer.setDate(hoy.getDate() - 2);
  const fechaAnteayer = anteayer.toISOString().split("T")[0];

  if (!historial[fechaAyer] || historial[fechaAyer].length === 0) {
    historial[fechaAyer] = [
      {
        id: "PX-HIST-01",
        numero: 1,
        identificador: "Ticket T-014",
        nombre: "VÍCTOR RAÚL HAYA SILVA",
        dni: "09876543",
        prioridad: "I",
        motivo: "Dolor torácico opresivo irradiado a mandíbula (Código Infarto)",
        cie10: "I21.9 — Infarto agudo del miocardio, sin otra especificación",
        medico: "Dr. Ricardo Morales (CMP 48210)",
        enfermero: "Lic. Maria Elena Ramos (CEP 38910)",
        camaNombre: "Trauma Shock ST-01",
        destino: "UCI / Quirófano Hemodinámica",
        horaLlegada: "08:15",
        fechaAtencion: fechaAyer,
        estadoAtencion: "Atendido / Concluido"
      },
      {
        id: "PX-HIST-02",
        numero: 2,
        identificador: "Ticket T-015",
        nombre: "GLORIA MARÍA ESTEFAN RÍOS",
        dni: "41258963",
        prioridad: "II",
        motivo: "Crisis asmática severa con sibilancias audibles y tirajes",
        cie10: "J45.9 — Asma, no especificada (Crisis Moderada-Severa)",
        medico: "Dra. Patricia Wong (CMP 51920)",
        enfermero: "Lic. Roxana Paredes (CEP 45892)",
        camaNombre: "Cama Observación 1 (OBS-01)",
        destino: "Pase a Observación de Emergencia",
        horaLlegada: "09:40",
        fechaAtencion: fechaAyer,
        estadoAtencion: "Atendido / Concluido"
      },
      {
        id: "PX-HIST-03",
        numero: 3,
        identificador: "Ticket T-016",
        nombre: "LUIS ALBERTO CÓRDOVA PÉREZ",
        dni: "10254789",
        prioridad: "III",
        motivo: "Dolor abdominal en fosa ilíaca derecha compatible con apendicitis",
        cie10: "K35.8 — Otras apendicitis agudas y las no especificadas",
        medico: "Dr. Carlos Santillán (CMP 39402)",
        enfermero: "Lic. Carlos Vega (CEP 52140)",
        camaNombre: "Quirófano 1 (SOP-01)",
        destino: "Quirófano de Emergencia SOP",
        horaLlegada: "11:20",
        fechaAtencion: fechaAyer,
        estadoAtencion: "Atendido / Concluido"
      },
      {
        id: "PX-HIST-04",
        numero: 4,
        identificador: "Ticket T-017",
        nombre: "CARMEN ROSA BENÍTEZ LÓPEZ",
        dni: "70451236",
        prioridad: "IV",
        motivo: "Faringoamigdalitis aguda febril con odinofagia",
        cie10: "J03.9 — Amigdalitis aguda, no especificada",
        medico: "Dra. Patricia Wong (CMP 51920)",
        enfermero: "Lic. Fernando Torres (CEP 61045)",
        camaNombre: "Cola Priorizada / Tópico",
        destino: "Alta Médica Directa con Receta",
        horaLlegada: "14:05",
        fechaAtencion: fechaAyer,
        estadoAtencion: "Atendido / Concluido"
      }
    ];
  }

  if (!historial[fechaAnteayer] || historial[fechaAnteayer].length === 0) {
    historial[fechaAnteayer] = [
      {
        id: "PX-HIST-05",
        numero: 1,
        identificador: "Ticket T-009",
        nombre: "MIGUEL ÁNGEL BAZÁN FLORES",
        dni: "08963251",
        prioridad: "I",
        motivo: "Traumatismo encéfalo craneano severo por caída de altura (Glasgow 7)",
        cie10: "S06.9 — Traumatismo intracraneal, no especificado",
        medico: "Dr. Ricardo Morales (CMP 48210)",
        enfermero: "Lic. Maria Elena Ramos (CEP 38910)",
        camaNombre: "Trauma Shock ST-02",
        destino: "UCI Críticos",
        horaLlegada: "07:30",
        fechaAtencion: fechaAnteayer,
        estadoAtencion: "Atendido / Concluido"
      },
      {
        id: "PX-HIST-06",
        numero: 2,
        identificador: "Ticket T-010",
        nombre: "ESTHER LILIANA ZAPATA CHÁVEZ",
        dni: "45879632",
        prioridad: "III",
        motivo: "Cólico nefrítico agudo con hematuria microscópica",
        cie10: "N23 — Cólico renal, no especificado",
        medico: "Dr. Carlos Santillán (CMP 39402)",
        enfermero: "Lic. Roxana Paredes (CEP 45892)",
        camaNombre: "Cama Observación 2 (OBS-02)",
        destino: "Observación / Alta Directa",
        horaLlegada: "10:15",
        fechaAtencion: fechaAnteayer,
        estadoAtencion: "Atendido / Concluido"
      }
    ];
  }

  guardarHistorialDiarioTotal(historial);
}

/**
 * Control de Inicio de Guardia Diaria:
 * Si es un día nuevo, el sistema empieza desde cero automáticamente.
 */
function gestionarInicioDiarioGuardia() {
  cargarDatosDemoDiasAnteriores();
  const fechaHoy = obtenerFechaHoyISO();
  const ultimaGuardia = localStorage.getItem(STORAGE_GUARDIA_ACTIVA_KEY);

  if (ultimaGuardia && ultimaGuardia !== fechaHoy) {
    // Si la fecha cambió, archivar los pacientes activos de ayer y resetear la cola de hoy
    if (Array.isArray(PACIENTES_COLA) && PACIENTES_COLA.length > 0) {
      PACIENTES_COLA.forEach(p => archivarPacienteEnHistorialDiario(p));
    }
    PACIENTES_COLA = [];
    pacienteActivoId = null;
    window.pacienteActivoId = null;
    if (typeof RECURSOS_HOSPITALARIOS !== "undefined") {
      Object.values(RECURSOS_HOSPITALARIOS).forEach(r => {
        r.estado = "disponible";
        r.paciente = null;
      });
    }
    localStorage.setItem(STORAGE_GUARDIA_ACTIVA_KEY, fechaHoy);
  } else if (!ultimaGuardia) {
    localStorage.setItem(STORAGE_GUARDIA_ACTIVA_KEY, fechaHoy);
  }
}

/**
 * Botón con signo ! para reiniciar la demostración desde cero
 */
function confirmarReinicioDemostracion() {
  const msg = "🔄 MODO DEMO — REINICIAR TODO A CERO\n\n" +
              "¿Desea restablecer todo el sistema a cero?\n" +
              "• Se borrarán todos los datos de los flujos, pacientes, expedientes y auditoría.\n" +
              "• Se vaciarán la cola de espera, el tablero, el Kardex, laboratorio, imágenes y facturación.\n" +
              "• Se liberarán las 15 camas hospitalarias y las pestañas volverán a estar sin desglosar.";

  if (confirm(msg)) {
    ejecutarReinicioDemostracion();
  }
}

function ejecutarReinicioDemostracion() {
  // 1. Limpiar todas las estructuras de cola y expedientes en memoria
  PACIENTES_COLA = [];
  window.PACIENTES_COLA = [];
  pacienteActivoId = null;
  window.pacienteActivoId = null;
  contadorSecuencialPx = 1;
  if (typeof contadorActasJunta !== "undefined") contadorActasJunta = 1;
  if (typeof window.expedientesStore !== "undefined") window.expedientesStore = {};
  window._ultimaActaJuntaMedica = null;
  window._ultimoHtmlActaJunta = null;
  window._identificacionOrigen = null;

  // 2. Borrar todos los datos de flujos en localStorage (preservando solo token y modo oscuro)
  try {
    const preservar = new Set(["apisperu_token", "triaje_dark_mode"]);
    const keysABorrar = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !preservar.has(k)) keysABorrar.push(k);
    }
    keysABorrar.forEach(k => localStorage.removeItem(k));
    localStorage.setItem("UPP_CONTADOR_HC", "1");
  } catch (e) {}

  // 3. Liberar al 100% las camas y recursos hospitalarios (15/15 disponibles)
  if (typeof RECURSOS_HOSPITALARIOS !== "undefined") {
    Object.keys(RECURSOS_HOSPITALARIOS).forEach(k => {
      RECURSOS_HOSPITALARIOS[k].estado = "disponible";
      RECURSOS_HOSPITALARIOS[k].paciente = null;
    });
  }

  // 4. Limpiar estado, formulario, módulos plegados y modificadores
  limpiarFormularioCompletoState();
  if (typeof limpiarPrioridadUI === "function") limpiarPrioridadUI();

  // Limpiar tablas y vistas de flujos clínicos
  const boxActa = document.getElementById("box_acta_junta_medica");
  if (boxActa) { boxActa.style.display = "none"; boxActa.innerHTML = ""; }
  const pideBox = document.getElementById("pide_acreditacion_box");
  if (pideBox) pideBox.style.display = "none";
  if (typeof renderizarTablaKardexEnfermeria === "function") renderizarTablaKardexEnfermeria();
  if (typeof renderizarTablaOrdenesLaboratorio === "function") renderizarTablaOrdenesLaboratorio();
  if (typeof renderizarTablaOrdenesImagenes === "function") renderizarTablaOrdenesImagenes();
  if (typeof actualizarTarjetaResumenMedico === "function") actualizarTarjetaResumenMedico();

  // 5. Actualizar tablero, carrusel pre-triaje, camas y facturación a cero
  if (typeof renderizarTableroCamasYQuirofanos === "function") renderizarTableroCamasYQuirofanos();
  if (typeof actualizarWidgetFlotanteCamas === "function") actualizarWidgetFlotanteCamas();
  if (typeof actualizarResumenCamasNavbar === "function") actualizarResumenCamasNavbar();
  if (typeof renderizarCarruselPreTriaje === "function") renderizarCarruselPreTriaje();
  if (typeof limpiarFiltrosTableroCola === "function") limpiarFiltrosTableroCola();
  else renderizarTableroColaPacientes();
  if (typeof actualizarFactura === "function") actualizarFactura();

  mostrarToastCola("🔄 <strong>Demo Reiniciada:</strong> Todos los flujos y datos restablecidos a cero (15/15 Camas Libres).");
}

/**
 * Modal de Consulta de Atenciones de Días Anteriores
 */
function abrirModalHistorialDiasAnteriores() {
  gestionarInicioDiarioGuardia();
  const m = document.getElementById("modal_historial_dias_anteriores");
  if (!m) return;

  const selFecha = document.getElementById("sel_fecha_historico_dias");
  const historial = obtenerHistorialDiarioTotal();
  const fechas = Object.keys(historial).sort().reverse();
  const fechaHoy = obtenerFechaHoyISO();

  if (selFecha) {
    selFecha.innerHTML = "";
    if (fechas.length === 0) {
      selFecha.innerHTML = `<option value="${fechaHoy}">Hoy (${fechaHoy})</option>`;
    } else {
      fechas.forEach(f => {
        const count = historial[f].length;
        const etiqueta = (f === fechaHoy) ? `Hoy (${f}) — ${count} atenciones` : `Guardia ${f} — ${count} atenciones`;
        const opt = document.createElement("option");
        opt.value = f;
        opt.textContent = etiqueta;
        selFecha.appendChild(opt);
      });
    }
    // Seleccionar la fecha activa o la primera disponible
    renderizarTablaHistorialDia(selFecha.value);
  }

  m.style.display = "flex";
}

function cerrarModalHistorialDiasAnteriores() {
  const m = document.getElementById("modal_historial_dias_anteriores");
  if (m) m.style.display = "none";
}

function cambiarFechaConsultaHistorico(fecha) {
  renderizarTablaHistorialDia(fecha);
}

function renderizarTablaHistorialDia(fecha) {
  const cont = document.getElementById("contenedor_tabla_historico_dias");
  const badgeResumen = document.getElementById("badge_resumen_historico_dia");
  if (!cont) return;

  const historial = obtenerHistorialDiarioTotal();
  const lista = (historial && historial[fecha]) ? historial[fecha] : [];

  if (badgeResumen) {
    badgeResumen.textContent = `${lista.length} Atenciones registradas el ${fecha}`;
  }

  if (lista.length === 0) {
    cont.innerHTML = `
      <div style="padding:28px 16px; text-align:center; color:#64748b;">
        <div style="font-size:2rem; margin-bottom:8px;">📁</div>
        <strong>No hay registros de atención para la fecha ${fecha}.</strong>
        <div style="font-size:0.8rem; margin-top:4px;">Seleccione otra fecha del selector o atienda pacientes hoy para ver su registro histórico.</div>
      </div>
    `;
    return;
  }

  let html = `
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:left;">
        <thead>
          <tr style="background:#f1f5f9; color:#334155; border-bottom:2px solid #cbd5e1;">
            <th style="padding:8px 10px;">Hora / Ticket</th>
            <th style="padding:8px 10px;">Paciente & DNI</th>
            <th style="padding:8px 10px;">Prioridad Triaje</th>
            <th style="padding:8px 10px;">Motivo / Diagnóstico CIE-10</th>
            <th style="padding:8px 10px;">Médico Tratante</th>
            <th style="padding:8px 10px;">Destino Clínico</th>
            <th style="padding:8px 10px; text-align:center;">Acción</th>
          </tr>
        </thead>
        <tbody>
  `;

  lista.forEach(px => {
    const prio = px.prioridad || "V";
    const cfg = COLORES_PRIORIDAD[prio] || COLORES_PRIORIDAD[null];
    html += `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px; font-weight:700;">
          <div>${px.horaLlegada || "--:--"}</div>
          <small style="color:#64748b; font-family:monospace;">${px.identificador || ""}</small>
        </td>
        <td style="padding:8px 10px;">
          <div style="font-weight:800; color:#0f172a;">${px.nombre}</div>
          <small style="color:#475569;">DNI: ${px.dni || "S/D"}</small>
        </td>
        <td style="padding:8px 10px;">
          <span style="background:${cfg.bg}; color:${cfg.text}; border:1px solid ${cfg.border}; padding:3px 8px; border-radius:4px; font-weight:800; font-size:0.75rem; white-space:nowrap;">
            P-${prio}
          </span>
        </td>
        <td style="padding:8px 10px; max-width:240px;">
          <div style="font-weight:600; color:#334155; line-height:1.2;">${px.motivo}</div>
          <small style="color:#0284c7; font-weight:700;">${px.cie10 || ""}</small>
        </td>
        <td style="padding:8px 10px; font-size:0.75rem; color:#475569;">
          ${px.medico}
        </td>
        <td style="padding:8px 10px;">
          <span style="font-weight:700; color:#166534; background:#f0fdf4; border:1px solid #bbf7d0; padding:2px 6px; border-radius:4px; font-size:0.72rem;">
            ${px.destino || px.camaNombre || "Alta Médica"}
          </span>
        </td>
        <td style="padding:8px 10px; text-align:center;">
          <button type="button" class="btn-full-secondary" style="padding:3px 8px; font-size:0.72rem;" onclick="verDetallePacienteHistorico('${px.id}', '${fecha}')" title="Ver ficha clínica y brazalete">
            👁️ Ficha
          </button>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  cont.innerHTML = html;
}

function verDetallePacienteHistorico(id, fecha) {
  const historial = obtenerHistorialDiarioTotal();
  const px = (historial[fecha] || []).find(x => x.id === id);
  if (!px) return;

  alert(`📋 FICHA DE ATENCIÓN HISTÓRICA — ${fecha}\n\n` +
        `• Paciente: ${px.nombre} (DNI: ${px.dni})\n` +
        `• Ticket / HC: ${px.identificador}\n` +
        `• Prioridad Triaje: P-${px.prioridad}\n` +
        `• Motivo: ${px.motivo}\n` +
        `• Diagnóstico CIE-10: ${px.cie10}\n` +
        `• Médico Tratante: ${px.medico}\n` +
        `• Enfermero(a) Triaje: ${px.enfermero}\n` +
        `• Destino Clínico: ${px.destino}\n\n` +
        `Registro archivado bajo auditoría NTS N° 139-MINSA.`);
}

window.confirmarReinicioDemostracion = confirmarReinicioDemostracion;
window.ejecutarReinicioDemostracion = ejecutarReinicioDemostracion;
window.abrirModalHistorialDiasAnteriores = abrirModalHistorialDiasAnteriores;
window.cerrarModalHistorialDiasAnteriores = cerrarModalHistorialDiasAnteriores;
window.cambiarFechaConsultaHistorico = cambiarFechaConsultaHistorico;
window.gestionarInicioDiarioGuardia = gestionarInicioDiarioGuardia;
window.archivarPacienteEnHistorialDiario = archivarPacienteEnHistorialDiario;
window.verDetallePacienteHistorico = verDetallePacienteHistorico;


// ==============================================================================
// GESTIÓN OFICIAL DE FORMATOS PÚBLICOS: FUA (MINSA/SIS) & ESSI (EsSalud)
// ==============================================================================

/**
 * Actualiza dinámicamente las etiquetas y números de formato en los botones de M2, M3 (Médico) y M8 (Caja)
 */
function actualizarBotonesFormatoPublico() {
  const esEsSalud = (STATE.tipoSeguro === "EsSalud" || STATE.tipoIpressPublica === "ESSALUD");
  const docTipo = esEsSalud ? "ESSI" : "FUA";
  const numDoc = esEsSalud ? (STATE.nroEssi || "ESSI-2026-000000") : (STATE.nroFua || "FUA-2026-000000");

  const btnM2 = document.getElementById("btn_ver_formato_publico");
  if (btnM2) {
    btnM2.textContent = esEsSalud ? `📄 Ver Hoja ESSI (${numDoc})` : `📄 Ver Formato FUA (${numDoc})`;
    btnM2.title = esEsSalud ? "Hoja Oficial de Atención de Emergencia EsSalud (ESSI)" : "Formato Único de Atención Oficial MINSA/SIS (FUA)";
  }

  const lblMed = document.getElementById("lbl_btn_fua_essi_medico");
  if (lblMed) {
    lblMed.textContent = esEsSalud ? `Formato ESSI (${numDoc})` : `Formato FUA (${numDoc})`;
  }
  const btnMed = document.getElementById("btn_fua_essi_medico");
  if (btnMed) {
    btnMed.title = esEsSalud ? "Hoja de Atención de Emergencia EsSalud (ESSI)" : "Formato Único de Atención MINSA/SIS (FUA)";
  }

  const btnM8 = document.getElementById("btn_imprimir_formato_m8");
  if (btnM8) {
    btnM8.textContent = esEsSalud ? `📄 Imprimir ESSI Cerrado (${numDoc})` : `📄 Imprimir FUA Cerrado (${numDoc})`;
    btnM8.title = esEsSalud ? "Liquidación y Cierre de Hoja ESSI EsSalud (Cero Copago)" : "Liquidación y Cierre de Formato FUA MINSA/SIS (100% Gratuidad)";
  }
}
window.actualizarBotonesFormatoPublico = actualizarBotonesFormatoPublico;

/**
 * Despachador principal que detecta si el paciente activo pertenece a EsSalud o a MINSA/SIS
 */
function imprimirFormatoPublicoSegunRegimen() {
  if (STATE.tipoSeguro === "EsSalud" || STATE.tipoIpressPublica === "ESSALUD") {
    imprimirFormatoESSI();
  } else {
    imprimirFormatoFUA();
  }
}
window.imprimirFormatoPublicoSegunRegimen = imprimirFormatoPublicoSegunRegimen;

/**
 * Genera e imprime el FORMATO ÚNICO DE ATENCIÓN (FUA) Oficial de MINSA / SIS
 * Normativa: R.J. N° 081-2014/SIS y modificatorias. Firma del paciente en blanco, firma digital simulada del personal de salud.
 */
function imprimirFormatoFUA() {
  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir el Formato FUA."); return; }

  const nroFua = STATE.nroFua || "FUA-2026-" + Math.floor(100000 + Math.random() * 900000);
  STATE.nroFua = nroFua;
  const nomPx = STATE.nombreReniec || STATE.identificador || "PACIENTE DESCONOCIDO (NN)";
  const dniPx = STATE.numDni || STATE.identificador || "POR REGISTRAR";
  const hcPx = STATE.historiaClinica || "HC-PROVISIONAL";
  const edadPx = (STATE.edad !== null && STATE.edad !== undefined) ? `${STATE.edad} años` : "Desconocida";
  const sexoPx = (STATE.sexo === "F") ? "FEMENINO" : (STATE.sexo === "M") ? "MASCULINO" : "DESCONOCIDO";
  const fechaHoy = new Date().toLocaleDateString("es-PE");
  const horaHoy = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const prio = STATE.prioridad || "PENDIENTE";
  const cie10 = STATE.diagnosticoCIE10 || STATE.cie10 || "R69 - CAUSAS DESCONOCIDAS DE MORBILIDAD";
  const destino = STATE.camaAsignada || "SALA DE OBSERVACIÓN / TÓPICO DE EMERGENCIA";
  const motivo = STATE.motivoConsulta || STATE.cedisCategoria || "Atención Médica de Emergencia";

  w.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>FUA - Formato ÚNICO de Atención MINSA/SIS - ${nroFua}</title>
      <style>
        @page { size: portrait; margin: 8mm; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.25; margin: 0; padding: 10px; color: #0f172a; }
        .fua-container { border: 2px solid #0f172a; padding: 8px; border-radius: 4px; max-width: 800px; margin: 0 auto; background: #fff; }
        .fua-header { border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 6px; }
        .fua-title-box { background: #0f172a; color: #fff; padding: 4px 8px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 3px; margin: 6px 0 4px 0; }
        .fua-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 9.5px; }
        .fua-table th, .fua-table td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; }
        .fua-table th { background: #f8fafc; font-weight: 700; color: #334155; }
        .fua-box-firmas { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; }
        .fua-firma-card { flex: 1; border: 1px solid #94a3b8; border-radius: 4px; padding: 6px; text-align: center; min-height: 105px; display: flex; flex-direction: column; justify-content: space-between; }
        @media print {
          body { padding: 0; }
          .fua-container { border: 1.5px solid #000; box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="fua-container">
        <!-- ENCABEZADO OFICIAL MINSA / SIS -->
        <div class="fua-header">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="width: 20%; vertical-align: middle;">
                <div style="font-weight: 900; font-size: 12px; color: #dc2626;">MINSA</div>
                <div style="font-size: 8px; color: #64748b;">Ministerio de Salud</div>
              </td>
              <td style="width: 55%; text-align: center; vertical-align: middle;">
                <div style="font-weight: 900; font-size: 13px; color: #0f172a; letter-spacing: 0.5px;">FORMATO ÚNICO DE ATENCIÓN - FUA</div>
                <div style="font-size: 8.5px; font-weight: 700; color: #0284c7;">SEGURO INTEGRAL DE SALUD (SIS) · FISSAL</div>
                <div style="font-size: 7.5px; color: #64748b;">R.J. N° 081-2014/SIS · NTS N° 042-MINSA/DGSP · ATENCIÓN DE EMERGENCIA</div>
              </td>
              <td style="width: 25%; text-align: right; vertical-align: middle;">
                <div style="border: 1.5px solid #dc2626; padding: 4px; border-radius: 4px; background: #fef2f2; display: inline-block; text-align: center;">
                  <div style="font-size: 7px; font-weight: 800; color: #dc2626;">NÚMERO DE FUA</div>
                  <div style="font-size: 11px; font-weight: 900; color: #991b1b; font-family: monospace;">${nroFua}</div>
                </div>
              </td>
            </tr>
          </table>
          <div style="display: flex; justify-content: space-between; font-size: 8px; color: #475569; margin-top: 4px; border-top: 1px dotted #cbd5e1; padding-top: 2px;">
            <span><strong>IPRESS:</strong> 00014522 - HOSPITAL REGIONAL DOCENTE UPP</span>
            <span><strong>DISA / GERESA:</strong> LIMA METROPOLITANA</span>
            <span><strong>NIVEL:</strong> III-E ESPECIALIZADO</span>
          </div>
        </div>

        <!-- I. DATOS DEL ASEGURADO -->
        <div class="fua-title-box">I. DATOS DE FILIACIÓN DEL ASEGURADO</div>
        <table class="fua-table">
          <tr>
            <th style="width: 15%;">Tipo Doc. Identidad:</th>
            <td style="width: 35%;">DNI / CE: <strong>${dniPx}</strong></td>
            <th style="width: 15%;">Historia Clínica:</th>
            <td style="width: 35%;"><strong>${hcPx}</strong></td>
          </tr>
          <tr>
            <th>Apellidos y Nombres:</th>
            <td colspan="3"><strong style="font-size: 10px; color: #0f172a;">${nomPx}</strong></td>
          </tr>
          <tr>
            <th>Edad / Sexo:</th>
            <td>${edadPx} | ${sexoPx}</td>
            <th>Régimen Aseguramiento:</th>
            <td><strong style="color: #15803d;">SIS GRATUITO (SUBSIDIADO AL 100%)</strong></td>
          </tr>
          <tr>
            <th>Fecha / Hora Ingreso:</th>
            <td>${fechaHoy} a las ${horaHoy}</td>
            <th>Modalidad Ingreso:</th>
            <td>Emergencia / Triaje Rápido CTAS</td>
          </tr>
        </table>

        <!-- II. MODIFICADORES TRIAJE CTAS (CANADÁ / MINSA) -->
        <div class="fua-title-box">II. EVALUACIÓN DE TRIAJE CTAS / PAEDCTAS (NTS N° 042-MINSA)</div>
        <table class="fua-table">
          <tr>
            <th style="width: 18%;">Nivel Prioridad CTAS:</th>
            <td style="width: 32%;"><strong style="color: #dc2626; font-size: 10px;">PRIORIDAD P-${prio}</strong> (${prio === 1 ? 'Resucitación 0 min' : prio === 2 ? 'Emergencia ≤ 15 min' : prio === 3 ? 'Urgencia ≤ 30 min' : prio === 4 ? 'Urgencia Menor ≤ 60 min' : 'No Urgente ≤ 120 min'})</td>
            <th style="width: 18%;">Categoría CEDIS / Motivo:</th>
            <td style="width: 32%;">${motivo}</td>
          </tr>
        </table>
        <table class="fua-table" style="text-align: center;">
          <tr style="background: #f1f5f9; font-weight: 700; font-size: 8.5px;">
            <td>FC (lpm)</td><td>FR (rpm)</td><td>PA (mmHg)</td><td>SpO2 (%)</td><td>Temp (°C)</td><td>Glasgow</td><td>Dolor (EVA)</td><td>Glucemia</td>
          </tr>
          <tr style="font-weight: 800; font-size: 9.5px; color: #0f172a;">
            <td>${STATE.fc || '--'}</td>
            <td>${STATE.fr || '--'}</td>
            <td>${(STATE.pasSistolica && STATE.paDiastolica) ? STATE.pasSistolica + '/' + STATE.paDiastolica : '--'}</td>
            <td>${STATE.spo2 || '--'}%</td>
            <td>${STATE.temperatura || '--'} °C</td>
            <td>${STATE.glasgow || '--'}/15</td>
            <td>${STATE.eva || '--'}/10</td>
            <td>${STATE.glucosa ? STATE.glucosa + ' mg/dL' : 'No requirió'}</td>
          </tr>
        </table>

        <!-- III. ACTO MÉDICO Y DESTINO -->
        <div class="fua-title-box">III. ATENCIÓN MÉDICA, DIAGNÓSTICO CIE-10 Y COBERTURA</div>
        <table class="fua-table">
          <tr>
            <th style="width: 20%;">Diagnóstico Principal (CIE-10):</th>
            <td colspan="3"><strong style="color: #0369a1; font-size: 10px;">${cie10}</strong></td>
          </tr>
          <tr>
            <th>Ubicación / Cama Destino:</th>
            <td><strong style="color: #15803d;">${destino}</strong></td>
            <th>Médico Tratante:</th>
            <td>${STATE.medicoTratante || "Dr. Carlos Mendoza Paredes (CMP 68421 - RNE 34512)"}</td>
          </tr>
          <tr>
            <th>Liquidación SIS:</th>
            <td colspan="3">
              <strong style="color: #15803d;">COBERTURA 100% CUBIERTA POR EL SIS (PAGO CERO · S/. 0.00 COPAGO)</strong> — Garantía Financiera Ley N° 29414 y Ley N° 27604.
            </td>
          </tr>
        </table>

        <!-- IV. BASE LEGAL -->
        <div style="font-size: 7.5px; color: #475569; border: 1px dotted #cbd5e1; padding: 4px; border-radius: 4px; margin-bottom: 6px; line-height: 1.3;">
          <strong>BASE LEGAL:</strong> R.J. N° 081-2014/SIS, Ley General de Salud N° 26842, D.S. N° 007-2012-SA, NTS N° 139-MINSA (Gestión de Historias Clínicas) y Ley N° 29733 de Protección de Datos Personales. El contenido tiene valor legal para auditoría médico-financiera de SUSALUD y el SIS.
        </div>

        <!-- V. FIRMAS Y HUELLA -->
        <div class="fua-box-firmas">
          <div class="fua-firma-card" style="background: #ffffff;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Asegurado / Apoderado</div>
            <div style="height: 48px; border-bottom: 1.5px solid #0f172a; margin: 12px 10px 4px 10px;"></div>
            <div>
              <div style="font-size: 8.5px; font-weight: 700; color: #0f172a;">${nomPx}</div>
              <div style="font-size: 7px; color: #64748b;">Firma Física del Paciente (En blanco — RENIEC no implementa firma digitalizada aún)</div>
            </div>
          </div>

          <div class="fua-firma-card" style="width: 130px; flex: none; background: #ffffff;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Huella Dactilar</div>
            <div style="width: 50px; height: 50px; border: 1.5px dashed #94a3b8; border-radius: 4px; margin: 4px auto;"></div>
            <div style="font-size: 7px; color: #64748b;">Índice Derecho (Toma Física)</div>
          </div>

          <div class="fua-firma-card" style="background: #f0fdf4; border-color: #86efac;">
            <div style="font-size: 8px; font-weight: 800; color: #166534; text-transform: uppercase;">Médico Responsable / Auditor</div>
            <div style="height: 42px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
              <svg width="170" height="40" viewBox="0 0 190 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 14 38 C 24 8, 40 44, 54 14 C 66 2, 80 36, 94 12 C 106 2, 118 30, 132 10 C 144 4, 160 26, 174 8 M 28 42 C 75 45, 125 40, 182 32" stroke="#15803d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="180" cy="12" r="2.5" fill="#15803d"/>
              </svg>
            </div>
            <div style="border-top: 1px solid #16a34a; padding-top: 3px;">
              <div style="font-size: 8.5px; font-weight: 800; color: #166534;">DR. CARLOS MENDOZA PAREDES</div>
              <div style="font-size: 7.5px; color: #334155;">CMP 68421 · RNE 34512 · Emergentología</div>
              <div style="font-size: 7px; color: #15803d; font-weight: 700;">🔏 Firma Digital Válida · Ley N° 27269</div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 250);
}
window.imprimirFormatoFUA = imprimirFormatoFUA;

/**
 * Genera e imprime la HOJA DE ATENCIÓN DE EMERGENCIA Y ACREDITACIÓN ESSI de EsSalud
 * Normativa: Res. N° 458-GG-ESSALUD. Firma del paciente en blanco, firma digital simulada del personal de salud.
 */
function imprimirFormatoESSI() {
  const w = window.open("", "_blank");
  if (!w) { alert("Permita las ventanas emergentes para imprimir la Hoja de Atención ESSI."); return; }

  const nroEssi = STATE.nroEssi || "ESSI-2026-" + Math.floor(100000 + Math.random() * 900000);
  STATE.nroEssi = nroEssi;
  const nomPx = STATE.nombreReniec || STATE.identificador || "PACIENTE DESCONOCIDO (NN)";
  const dniPx = STATE.numDni || STATE.identificador || "POR REGISTRAR";
  const hcPx = STATE.historiaClinica || "HC-PROVISIONAL";
  const edadPx = (STATE.edad !== null && STATE.edad !== undefined) ? `${STATE.edad} años` : "Desconocida";
  const sexoPx = (STATE.sexo === "F") ? "FEMENINO" : (STATE.sexo === "M") ? "MASCULINO" : "DESCONOCIDO";
  const fechaHoy = new Date().toLocaleDateString("es-PE");
  const horaHoy = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const prio = STATE.prioridad || "PENDIENTE";
  const cie10 = STATE.diagnosticoCIE10 || STATE.cie10 || "R69 - CAUSAS DESCONOCIDAS DE MORBILIDAD";
  const destino = STATE.camaAsignada || "TÓPICO DE EMERGENCIA ADULTOS ESSALUD";
  const motivo = STATE.motivoConsulta || STATE.cedisCategoria || "Atención Médica de Emergencia";
  const autogenerado = (nomPx.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "PAC") + (dniPx.slice(0, 5) || "99999") + "M001";

  w.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>ESSI - Hoja de Atención de Emergencia EsSalud - ${nroEssi}</title>
      <style>
        @page { size: portrait; margin: 8mm; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.25; margin: 0; padding: 10px; color: #0f172a; }
        .essi-container { border: 2px solid #0369a1; padding: 8px; border-radius: 4px; max-width: 800px; margin: 0 auto; background: #fff; }
        .essi-header { border-bottom: 2px solid #0369a1; padding-bottom: 6px; margin-bottom: 6px; }
        .essi-title-box { background: #0284c7; color: #fff; padding: 4px 8px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 3px; margin: 6px 0 4px 0; }
        .essi-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 9.5px; }
        .essi-table th, .essi-table td { border: 1px solid #bae6fd; padding: 3px 5px; text-align: left; }
        .essi-table th { background: #f0f9ff; font-weight: 700; color: #0369a1; }
        .essi-box-firmas { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; }
        .essi-firma-card { flex: 1; border: 1px solid #7dd3fc; border-radius: 4px; padding: 6px; text-align: center; min-height: 105px; display: flex; flex-direction: column; justify-content: space-between; }
        @media print {
          body { padding: 0; }
          .essi-container { border: 1.5px solid #0369a1; box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="essi-container">
        <!-- ENCABEZADO OFICIAL ESSALUD -->
        <div class="essi-header">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="width: 20%; vertical-align: middle;">
                <div style="font-weight: 900; font-size: 13px; color: #0284c7;">EsSalud</div>
                <div style="font-size: 8px; color: #0369a1; font-weight: 700;">Seguro Social de Salud</div>
              </td>
              <td style="width: 55%; text-align: center; vertical-align: middle;">
                <div style="font-weight: 900; font-size: 13px; color: #0369a1; letter-spacing: 0.5px;">HOJA DE ATENCIÓN DE EMERGENCIA Y ACREDITACIÓN ESSI</div>
                <div style="font-size: 8.5px; font-weight: 700; color: #0c4a6e;">SISTEMA DE GESTIÓN HOSPITALARIA ESSI · SERVICIO DE EMERGENCIA</div>
                <div style="font-size: 7.5px; color: #475569;">RESOLUCIÓN DE GERENCIA GENERAL N° 458-GG-ESSALUD · LEY N° 26790</div>
              </td>
              <td style="width: 25%; text-align: right; vertical-align: middle;">
                <div style="border: 1.5px solid #0284c7; padding: 4px; border-radius: 4px; background: #f0f9ff; display: inline-block; text-align: center;">
                  <div style="font-size: 7px; font-weight: 800; color: #0369a1;">NÚMERO ESSI</div>
                  <div style="font-size: 11px; font-weight: 900; color: #075985; font-family: monospace;">${nroEssi}</div>
                </div>
              </td>
            </tr>
          </table>
          <div style="display: flex; justify-content: space-between; font-size: 8px; color: #475569; margin-top: 4px; border-top: 1px dotted #bae6fd; padding-top: 2px;">
            <span><strong>CENTRO ASISTENCIAL:</strong> 00002104 - HOSPITAL NACIONAL GUILLERMO ALMENARA IRIGOYEN / UPP</span>
            <span><strong>RED ASISTENCIAL:</strong> ALMENARA</span>
            <span><strong>TIPO SEGURO:</strong> REGULAR (TITULAR / DERECHOHABIENTE)</span>
          </div>
        </div>

        <!-- I. FILIACIÓN Y ACREDITACIÓN -->
        <div class="essi-title-box">I. FILIACIÓN Y ACREDITACIÓN DEL ASEGURADO ESSALUD</div>
        <table class="essi-table">
          <tr>
            <th style="width: 15%;">DNI / CE:</th>
            <td style="width: 35%;"><strong>${dniPx}</strong></td>
            <th style="width: 15%;">Autogenerado ESSI:</th>
            <td style="width: 35%;"><strong style="color: #0369a1; font-family: monospace;">${autogenerado}</strong></td>
          </tr>
          <tr>
            <th>Apellidos y Nombres:</th>
            <td colspan="3"><strong style="font-size: 10px; color: #0f172a;">${nomPx}</strong></td>
          </tr>
          <tr>
            <th>Edad / Sexo:</th>
            <td>${edadPx} | ${sexoPx}</td>
            <th>Estado Acreditación:</th>
            <td><strong style="color: #15803d;">✔ ACREDITADO ACTIVO (VIGENTE)</strong></td>
          </tr>
          <tr>
            <th>Historia Clínica:</th>
            <td><strong>${hcPx}</strong></td>
            <th>Fecha / Hora Ingreso:</th>
            <td>${fechaHoy} a las ${horaHoy}</td>
          </tr>
        </table>

        <!-- II. TRIAJE CTAS ESSALUD -->
        <div class="essi-title-box">II. VALORACIÓN DE TRIAJE CTAS (DIRECTIVA ESSALUD)</div>
        <table class="essi-table">
          <tr>
            <th style="width: 18%;">Nivel Prioridad CTAS:</th>
            <td style="width: 32%;"><strong style="color: #0284c7; font-size: 10px;">PRIORIDAD P-${prio}</strong> (${prio === 1 ? 'Resucitación Inmediata' : prio === 2 ? 'Emergencia Severa ≤ 15m' : prio === 3 ? 'Urgencia ≤ 30m' : prio === 4 ? 'Urgencia Menor ≤ 60m' : 'No Urgente ≤ 120m'})</td>
            <th style="width: 18%;">Motivo / Queja Principal:</th>
            <td style="width: 32%;">${motivo}</td>
          </tr>
        </table>
        <table class="essi-table" style="text-align: center;">
          <tr style="background: #f0f9ff; font-weight: 700; font-size: 8.5px;">
            <td>FC (lpm)</td><td>FR (rpm)</td><td>PA (mmHg)</td><td>SpO2 (%)</td><td>Temp (°C)</td><td>Glasgow</td><td>EVA Dolor</td><td>Glucosa Capilar</td>
          </tr>
          <tr style="font-weight: 800; font-size: 9.5px; color: #0f172a;">
            <td>${STATE.fc || '--'}</td>
            <td>${STATE.fr || '--'}</td>
            <td>${(STATE.pasSistolica && STATE.paDiastolica) ? STATE.pasSistolica + '/' + STATE.paDiastolica : '--'}</td>
            <td>${STATE.spo2 || '--'}%</td>
            <td>${STATE.temperatura || '--'} °C</td>
            <td>${STATE.glasgow || '--'}/15</td>
            <td>${STATE.eva || '--'}/10</td>
            <td>${STATE.glucosa ? STATE.glucosa + ' mg/dL' : 'No requerida'}</td>
          </tr>
        </table>

        <!-- III. EVALUACIÓN MÉDICA ESSALUD -->
        <div class="essi-title-box">III. ACTO MÉDICO DE EMERGENCIA Y COBERTURA INSTITUCIONAL</div>
        <table class="essi-table">
          <tr>
            <th style="width: 20%;">Diagnóstico Clínico (CIE-10):</th>
            <td colspan="3"><strong style="color: #0284c7; font-size: 10px;">${cie10}</strong></td>
          </tr>
          <tr>
            <th>Ubicación Asignada:</th>
            <td><strong style="color: #15803d;">${destino}</strong></td>
            <th>Médico Tratante de Turno:</th>
            <td>${STATE.medicoTratante || "Dra. Elena Ramos Morales (CMP 55198 - RNE 29014)"}</td>
          </tr>
          <tr>
            <th>Liquidación EsSalud:</th>
            <td colspan="3">
              <strong style="color: #15803d;">COBERTURA INTEGRAL 100% PRESTACIONAL (CERO COPAGO · S/. 0.00)</strong> — D.L. N° 688 y Ley N° 26790. Sin costo para el asegurado titular.
            </td>
          </tr>
        </table>

        <!-- IV. BASE LEGAL -->
        <div style="font-size: 7.5px; color: #475569; border: 1px dotted #bae6fd; padding: 4px; border-radius: 4px; margin-bottom: 6px; line-height: 1.3;">
          <strong>NORMATIVA:</strong> Ley N° 26790 (Ley de Modernización de la Seguridad Social en Salud), D.S. N° 009-97-SA, Directiva N° 003-GG-ESSALUD-2018 (Normas para la Atención en los Servicios de Emergencia) y Ley N° 29733 de Protección de Datos Personales.
        </div>

        <!-- V. FIRMAS Y HUELLA -->
        <div class="essi-box-firmas">
          <div class="essi-firma-card" style="background: #ffffff;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Asegurado / Titular EsSalud</div>
            <div style="height: 48px; border-bottom: 1.5px solid #0f172a; margin: 12px 10px 4px 10px;"></div>
            <div>
              <div style="font-size: 8.5px; font-weight: 700; color: #0f172a;">${nomPx}</div>
              <div style="font-size: 7px; color: #64748b;">Firma Física del Paciente (En blanco — RENIEC no implementa firma digitalizada aún)</div>
            </div>
          </div>

          <div class="essi-firma-card" style="width: 130px; flex: none; background: #ffffff;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Huella Dactilar</div>
            <div style="width: 50px; height: 50px; border: 1.5px dashed #7dd3fc; border-radius: 4px; margin: 4px auto;"></div>
            <div style="font-size: 7px; color: #64748b;">Índice Derecho (Toma Física)</div>
          </div>

          <div class="essi-firma-card" style="background: #f0f9ff; border-color: #7dd3fc;">
            <div style="font-size: 8px; font-weight: 800; color: #0369a1; text-transform: uppercase;">Médico Asistencial EsSalud</div>
            <div style="height: 42px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
              <svg width="170" height="40" viewBox="0 0 190 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 12 36 C 22 10, 38 42, 52 16 C 64 4, 78 34, 92 14 C 104 4, 116 28, 130 12 C 142 6, 158 24, 172 10 M 26 40 C 72 43, 122 38, 178 30" stroke="#0284c7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="176" cy="14" r="2.5" fill="#0284c7"/>
              </svg>
            </div>
            <div style="border-top: 1px solid #0284c7; padding-top: 3px;">
              <div style="font-size: 8.5px; font-weight: 800; color: #0369a1;">DRA. ELENA RAMOS MORALES</div>
              <div style="font-size: 7.5px; color: #334155;">CMP 55198 · RNE 29014 · Medicina de Emergencias</div>
              <div style="font-size: 7px; color: #0284c7; font-weight: 700;">🔏 Firma Digital Válida · Ley N° 27269</div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 250);
}
window.imprimirFormatoESSI = imprimirFormatoESSI;
