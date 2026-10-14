/**
 * ==============================================================================
 * SISTEMA DE PRIORIDAD DE ATENCIÓN (TRIAJE) - CASO 6 OFICIAL
 * Curso: Pensamiento Algorítmico - Ciclo II (Trabajo Parcial UPP)
 * Facultad de Ciencias de la Salud — Enfermería
 * Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
 * ==============================================================================
 * Módulos Integrados:
 *   1. Enfermería 1: Detección automática de ID, Búsqueda en BD y Creación de HC
 *   2. Enfermería 2: Ticket automático por hora de llegada y Cobertura/Seguro
 *   3. Triage Clínico: Decisiones 1 y 2 (SpO2, Antecedentes, Alerta Roja y Ámbar)
 * ==============================================================================
 */

// ---------------------------------------------------------------------------
// 1. BASE DE DATOS SIMULADA DEL HOSPITAL (DNI o Nombre Completo -> Nro de HC)
// ---------------------------------------------------------------------------
const BASE_DATOS_HC = {
  "px a": "HC-2025-089",
  "px b": "HC-2026-142",
  "10203040": "HC-2024-510",
  "70809010": "HC-2025-332",
  "carlos mendoza rojas": "HC-2023-115",
  "maria torres silva": "HC-2024-890",
};

let contadorHcNueva = 1;
let contadorHcTemp = 1;

// ---------------------------------------------------------------------------
// 2. MODELO DE DATOS Y CLASES
// ---------------------------------------------------------------------------
class Paciente {
  constructor(identificador, horaLlegada, estadoRegistrado, historiaClinica, accionHc) {
    // Enfermería 1: Registro y gestión automática de HC
    this.identificador = identificador;
    this.horaLlegada = horaLlegada;
    this.estadoRegistrado = estadoRegistrado; // "Si", "No" o "Por confirmar"
    this.historiaClinica = historiaClinica;
    this.accionHc = accionHc;

    // Enfermería 2: Atención administrativa
    this.turno = null; // "T-01" o "T-02"
    this.datosAdministrativos = null; // "Asegurado", "Particular", "SIS", etc.

    // Triage Clínico: Datos críticos y decisiones
    this.spo2 = null;
    this.antecedentesRegistrados = false;
    this.prioridad = null; // 1 (Crítico) o 3 (Moderado)
  }

  horaEnMinutos() {
    if (!this.horaLlegada || !this.horaLlegada.includes(":")) return 0;
    const [h, m] = this.horaLlegada.split(":").map(Number);
    return h * 60 + m;
  }
}

// ---------------------------------------------------------------------------
// 3. REGLAS DE VALIDACIÓN Y BÚSQUEDA AUTOMÁTICA EN BD
// ---------------------------------------------------------------------------
function validarIdentificador(valor) {
  if (valor === null || valor === undefined || !String(valor).trim()) {
    throw new Error("El identificador no puede estar vacío.");
  }
  const limpio = String(valor).trim();
  const patron = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\.\-]+$/;
  if (!patron.test(limpio) || limpio.length < 2) {
    throw new Error("Identificador inválido. Use DNI, Nombres, un nombre o NN.");
  }
  return limpio;
}

function clasificarYBuscarEnBD(identificador) {
  const limpio = String(identificador || "").trim().replace(/\s+/g, " ");
  const clave = limpio.toLowerCase();

  // Caso especial para los identificadores del Caso 6 Oficial (Demo)
  const esCasoDemo = (clave === "px a" || clave === "px b");

  // 1. Verificar si es DNI (exactamente 8 dígitos numéricos)
  const esDni = /^\d{8}$/.test(limpio);

  // 2. Verificar si son Nombres y Apellidos (2 o más palabras alfabéticas, no NN)
  const palabras = limpio.split(" ");
  const soloLetras = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/.test(limpio);
  const esNn = palabras[0].toLowerCase() === "nn";
  const esNombreCompleto = (palabras.length >= 2 && soloLetras && !esNn);

  let estado, nroHc, accion;

  // SI ES DNI O NOMBRE COMPLETO -> BUSCAR EN BD
  if (esDni || esNombreCompleto || esCasoDemo) {
    if (clave in BASE_DATOS_HC) {
      nroHc = BASE_DATOS_HC[clave];
      estado = "Si";
      accion = `Encontrado en BD (${nroHc} recuperada)`;
    } else {
      nroHc = `HC-NUEVA-${String(contadorHcNueva).padStart(3, "0")}`;
      contadorHcNueva++;
      BASE_DATOS_HC[clave] = nroHc;
      estado = "No";
      accion = `No figura en BD -> Se crea ${nroHc}`;
    }
  } else {
    // CUALQUIER OTRA ALTERNATIVA (1 solo nombre o código parcial/NN)
    nroHc = `HC-TEMP-EMG-${String(contadorHcTemp).padStart(3, "0")}`;
    contadorHcTemp++;
    estado = "Por confirmar";
    accion = `Identidad parcial/NN -> Se abre ${nroHc}`;
  }

  return { estado, nroHc, accion };
}

function validarHora(valor) {
  if (!valor || typeof valor !== "string") {
    throw new Error("La hora de llegada es obligatoria.");
  }
  const v = valor.trim();
  const regex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  if (!regex.test(v)) {
    throw new Error(`Hora '${v}' inválida. Use formato HH:MM (ej. 07:15).`);
  }
  const [h, m] = v.split(":").map(Number);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function horaEnMinutosTexto(hora) {
  try {
    const [h, m] = hora.split(":").map(Number);
    return h * 60 + m;
  } catch {
    return 0;
  }
}

function validarSpo2(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") {
    throw new Error("El valor de SpO2 es obligatorio.");
  }
  const num = parseFloat(valor);
  if (isNaN(num)) {
    throw new Error("SpO2 inválido. Solo se admiten números.");
  }
  if (num < 0 || num > 100) {
    throw new Error(`SpO2 = ${num}% fuera de rango (0-100%). Verifique el oxímetro.`);
  }
  return num;
}

function validarDatosAdmin(valor) {
  if (!valor || !String(valor).trim()) {
    throw new Error("El dato administrativo es obligatorio.");
  }
  const v = String(valor).trim();
  const low = v.toLowerCase();
  if (["si", "sí", "s", "asegurado"].includes(low)) return "Asegurado";
  if (["no", "n", "particular", "no asegurado", "no asegurado (particular)"].includes(low)) return "No asegurado (Particular)";
  return v;
}

// ---------------------------------------------------------------------------
// 4. FUNCIONES DE CADA ETAPA DEL ALGORITMO
// ---------------------------------------------------------------------------
function enfermeria1Registro(datosPx) {
  return new Paciente(
    datosPx.identificador,
    datosPx.horaLlegada,
    datosPx.estadoRegistrado,
    datosPx.historiaClinica,
    datosPx.accionHc
  );
}

function asignarTurnosPorLlegada(pxA, pxB) {
  if (pxA.horaEnMinutos() <= pxB.horaEnMinutos()) {
    pxA.turno = "T-01";
    pxB.turno = "T-02";
  } else {
    pxB.turno = "T-01";
    pxA.turno = "T-02";
  }
}

function enfermeria2Atencion(paciente, seguro) {
  paciente.datosAdministrativos = validarDatosAdmin(seguro);
}

function evaluarTriage(paciente, spo2, antecedentes) {
  paciente.spo2 = validarSpo2(spo2);
  paciente.antecedentesRegistrados = Boolean(antecedentes);
}

function decision1Prioridad(paciente) {
  if (paciente.spo2 < 92 || paciente.antecedentesRegistrados) {
    paciente.prioridad = 1; // Crítico
  } else {
    paciente.prioridad = 3; // Moderado
  }
  return paciente.prioridad;
}

function decision2AsignarCama(pxA, pxB) {
  if (pxA.prioridad < pxB.prioridad) {
    return { asignado: pxA, espera: pxB, desempate: false };
  } else if (pxB.prioridad < pxA.prioridad) {
    return { asignado: pxB, espera: pxA, desempate: false };
  } else {
    // Empate de prioridad: desempata orden de llegada (Turno T-01)
    if (pxA.horaEnMinutos() <= pxB.horaEnMinutos()) {
      return { asignado: pxA, espera: pxB, desempate: true };
    }
    return { asignado: pxB, espera: pxA, desempate: true };
  }
}

function obtenerEspecialidadAsignado(prioridad) {
  return prioridad === 1 ? "Cardiología / Unidad de Trauma Shock" : "Medicina General";
}

function obtenerDerivacionEspera(prioridad) {
  return prioridad === 1 ? "Área de Observación / Monitoreo Continuo" : "Sala de Espera Regular (Medicina General)";
}

// ---------------------------------------------------------------------------
// 5. BANCO DE CASOS PREDEFINIDOS (PRESETS)
// ---------------------------------------------------------------------------
const PRESETS = {
  caso6: {
    nombre: "⭐ Caso 6 Oficial (Demo)",
    pxA: { ident: "Px A", hora: "07:15", seguro: "Asegurado", spo2: 99, ant: false },
    pxB: { ident: "Px B", hora: "07:19", seguro: "Asegurado", spo2: 91, ant: true }
  },
  dniRegistrado: {
    nombre: "🪪 Pacientes BD (10203040 vs 70809010)",
    pxA: { ident: "10203040", hora: "08:00", seguro: "Asegurado", spo2: 98, ant: false },
    pxB: { ident: "70809010", hora: "08:15", seguro: "EsSalud", spo2: 89, ant: true }
  },
  pacienteNuevo: {
    nombre: "🆕 Paciente Nuevo (DNI no registrado)",
    pxA: { ident: "45678912", hora: "09:00", seguro: "No asegurado (Particular)", spo2: 90, ant: false },
    pxB: { ident: "carlos mendoza rojas", hora: "09:10", seguro: "Asegurado", spo2: 96, ant: false }
  },
  pacienteNN: {
    nombre: "🚑 Paciente NN (Emergencia Temporal)",
    pxA: { ident: "NN Accidente 01", hora: "06:45", seguro: "SIS", spo2: 88, ant: true },
    pxB: { ident: "maria torres silva", hora: "07:00", seguro: "Asegurado", spo2: 95, ant: false }
  },
  empateCritico: {
    nombre: "⚖️ Empate Crítico (P1 vs P1)",
    pxA: { ident: "Carlos Mendoza", hora: "08:10", seguro: "Asegurado", spo2: 89, ant: false },
    pxB: { ident: "María Torres", hora: "08:25", seguro: "Asegurado", spo2: 88, ant: true }
  },
  empateModerado: {
    nombre: "⏱️ Empate Moderado (P3 vs P3)",
    pxA: { ident: "Juan Pérez", hora: "09:40", seguro: "SIS", spo2: 97, ant: false },
    pxB: { ident: "Elena Gómez", hora: "09:15", seguro: "Asegurado", spo2: 96, ant: false }
  },
  umbralSpo2: {
    nombre: "🎯 Umbral SpO2 (91% vs 92%)",
    pxA: { ident: "Roberto Soto", hora: "10:00", seguro: "Asegurado", spo2: 92, ant: false },
    pxB: { ident: "Sofía Díaz", hora: "10:05", seguro: "Asegurado", spo2: 91, ant: false }
  },
  spo2Invalido: {
    nombre: "⚠️ Probar SpO2 Inválido (120%)",
    pxA: { ident: "Px Alerta", hora: "07:15", seguro: "Asegurado", spo2: 120, ant: false },
    pxB: { ident: "Px B", hora: "07:19", seguro: "Asegurado", spo2: 91, ant: true }
  }
};

let animacionEnCurso = false;
let servidorPythonDisponible = false;

// ---------------------------------------------------------------------------
// 6. CONTROLADORES DE INTERFAZ DE USUARIO Y REACTIVIDAD
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  verificarServidorPython();
  inicializarEventos();
  cargarPreset("caso6", false);
});

function verificarServidorPython() {
  const badge = document.getElementById("serverStatusBadge");
  const text = document.getElementById("serverStatusText");

  if (!badge || !text) return;

  if (window.location.protocol === "file:") {
    badge.className = "server-badge offline";
    text.textContent = "Modo Local Autónomo (Navegador)";
    return;
  }

  fetch("/api/health")
    .then(res => res.json())
    .then(data => {
      if (data.status === "ok") {
        servidorPythonDisponible = true;
        badge.classList.remove("offline");
        text.textContent = "Servidor Python Activo (API REST)";
      }
    })
    .catch(() => {
      servidorPythonDisponible = false;
      badge.classList.add("offline");
      text.textContent = "Modo Local Autónomo (Navegador)";
    });
}

function inicializarEventos() {
  // Enlaces de campos en vivo
  vincularIdentificador("a");
  vincularIdentificador("b");
  vincularHora("a");
  vincularHora("b");
  vincularSpo2("a");
  vincularSpo2("b");

  ["a", "b"].forEach(id => {
    const elAnt = document.getElementById(`ant_${id}`);
    if (elAnt) {
      elAnt.addEventListener("change", () => actualizarPreviewEnVivo(id));
    }
  });

  // Botón evaluar
  const btnEvaluar = document.getElementById("btnEvaluar");
  if (btnEvaluar) btnEvaluar.addEventListener("click", ejecutarEvaluacion);

  // Botones de limpiar
  const btnLimpiar = document.getElementById("btnLimpiarDesdeCero");
  const btnLimpiarAccion = document.getElementById("btnLimpiarAccion");
  if (btnLimpiar) btnLimpiar.addEventListener("click", limpiarFormularioDesdeCero);
  if (btnLimpiarAccion) btnLimpiarAccion.addEventListener("click", limpiarFormularioDesdeCero);

  // Presets
  document.querySelectorAll("[data-preset]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const presetKey = e.currentTarget.getAttribute("data-preset");
      cargarPreset(presetKey, presetKey !== "spo2Invalido");
    });
  });

  // Modal de reporte clínico
  const btnReporte = document.getElementById("btnReporte");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const btnImprimir = document.getElementById("btnImprimir");

  if (btnReporte) btnReporte.addEventListener("click", abrirModalReporte);
  if (btnCloseModal) btnCloseModal.addEventListener("click", cerrarModalReporte);
  if (btnImprimir) btnImprimir.addEventListener("click", () => window.print());

  // Alternador de modo (animado / instantáneo)
  document.querySelectorAll(".mode-option").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".mode-option").forEach(b => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
    });
  });
}

function vincularIdentificador(id) {
  const input = document.getElementById(`nombre_${id}`);
  if (!input) return;

  input.addEventListener("input", () => {
    actualizarIdentificadorEnVivo(id);
  });
}

function actualizarIdentificadorEnVivo(id) {
  const input = document.getElementById(`nombre_${id}`);
  const title = document.getElementById(`title_nombre_${id}`);
  const badgeEstado = document.getElementById(`badge_estado_${id}`);
  const valHc = document.getElementById(`val_hc_${id}`);
  const valAccion = document.getElementById(`val_accion_${id}`);

  if (!input) return;

  const raw = input.value.trim();
  const identMostrado = raw || `Paciente ${id.toUpperCase()}`;
  if (title) title.textContent = identMostrado;

  if (raw.length < 2) {
    if (badgeEstado) {
      badgeEstado.className = "badge-status badge-status-conf";
      badgeEstado.textContent = "Por confirmar";
    }
    if (valHc) valHc.textContent = "--";
    if (valAccion) valAccion.textContent = "Ingrese al menos 2 caracteres...";
    return;
  }

  const { estado, nroHc, accion } = clasificarYBuscarEnBD(raw);

  if (badgeEstado) {
    if (estado === "Si") {
      badgeEstado.className = "badge-status badge-status-si";
      badgeEstado.textContent = "Si (En BD)";
    } else if (estado === "No") {
      badgeEstado.className = "badge-status badge-status-no";
      badgeEstado.textContent = "No (Nuevo)";
    } else {
      badgeEstado.className = "badge-status badge-status-conf";
      badgeEstado.textContent = "Por confirmar";
    }
  }

  if (valHc) valHc.textContent = nroHc;
  if (valAccion) valAccion.textContent = accion;
}

function vincularHora(id) {
  const elHora = document.getElementById(`hora_${id}`);
  if (!elHora) return;

  elHora.addEventListener("input", () => {
    validarHoraEnVivo(id);
    actualizarTicketsEnVivo();
  });
}

function validarHoraEnVivo(id) {
  const elHora = document.getElementById(`hora_${id}`);
  const errorEl = document.getElementById(`error_hora_${id}`);

  if (!elHora || !errorEl) return true;

  const raw = elHora.value.trim();
  const regex = /^([01]?\d|2[0-3]):([0-5]\d)$/;

  if (!regex.test(raw)) {
    elHora.classList.add("is-invalid");
    errorEl.style.display = "flex";
    errorEl.innerHTML = `<span>⚠️</span> <span><strong>Error de formato:</strong> Hora '${raw}' inválida. Use formato HH:MM (ej. 07:15).</span>`;
    return false;
  }

  elHora.classList.remove("is-invalid");
  errorEl.style.display = "none";
  ocultarAlertaGeneral();
  return true;
}

function actualizarTicketsEnVivo() {
  const horaAEl = document.getElementById("hora_a");
  const horaBEl = document.getElementById("hora_b");
  const ticketAEl = document.getElementById("badge_ticket_a");
  const ticketBEl = document.getElementById("badge_ticket_b");

  if (!horaAEl || !horaBEl || !ticketAEl || !ticketBEl) return;

  const minA = horaEnMinutosTexto(horaAEl.value.trim());
  const minB = horaEnMinutosTexto(horaBEl.value.trim());

  if (minA <= minB) {
    ticketAEl.textContent = "🎫 Turno: T-01";
    ticketBEl.textContent = "🎫 Turno: T-02";
  } else {
    ticketBEl.textContent = "🎫 Turno: T-01";
    ticketAEl.textContent = "🎫 Turno: T-02";
  }
}

function vincularSpo2(id) {
  const number = document.getElementById(`spo2_num_${id}`);
  if (!number) return;

  number.addEventListener("input", () => {
    validarSpo2EnVivo(id);
  });
}

function validarSpo2EnVivo(id) {
  const number = document.getElementById(`spo2_num_${id}`);
  const errorEl = document.getElementById(`error_spo2_${id}`);
  const badge = document.getElementById(`badge_live_${id}`);

  if (!number || !errorEl) return true;

  const raw = number.value.trim();
  const val = parseFloat(raw);

  if (raw === "" || isNaN(val)) {
    number.classList.add("is-invalid");
    errorEl.style.display = "flex";
    errorEl.innerHTML = `<span>⚠️</span> <span><strong>Error:</strong> SpO2 debe ser un número. Valor recibido: '${raw}'.</span>`;
    if (badge) {
      badge.className = "live-badge badge-invalido";
      badge.innerHTML = `<span class="status-dot"></span> ❌ SpO2 Inválido`;
    }
    return false;
  }

  if (val < 0 || val > 100) {
    number.classList.add("is-invalid");
    errorEl.style.display = "flex";
    errorEl.innerHTML = `<span>⚠️</span> <span><strong>Error de Oxímetro:</strong> SpO2 = ${val}% fuera de rango permitido (0 a 100%).</span>`;
    if (badge) {
      badge.className = "live-badge badge-invalido";
      badge.innerHTML = `<span class="status-dot"></span> ❌ Fuera de Rango (${val}%)`;
    }
    return false;
  }

  number.classList.remove("is-invalid");
  errorEl.style.display = "none";
  actualizarPreviewEnVivo(id);
  ocultarAlertaGeneral();
  return true;
}

function actualizarPreviewEnVivo(id) {
  const elNum = document.getElementById(`spo2_num_${id}`);
  const elAnt = document.getElementById(`ant_${id}`);
  const badge = document.getElementById(`badge_live_${id}`);

  if (!elNum || !elAnt || !badge) return;

  const raw = elNum.value.trim();
  if (raw === "") {
    badge.className = "live-badge badge-neutral";
    badge.innerHTML = `<span class="status-dot" style="background-color: #94a3b8;"></span> Pendiente`;
    return;
  }

  const spo2 = parseFloat(raw);
  if (isNaN(spo2) || spo2 < 0 || spo2 > 100) return;

  const ant = elAnt.checked;

  if (spo2 < 92 || ant) {
    badge.className = "live-badge badge-critico";
    badge.innerHTML = `<span class="status-dot"></span> P1 - Crítico`;
  } else {
    badge.className = "live-badge badge-moderado";
    badge.innerHTML = `<span class="status-dot"></span> P3 - Moderado`;
  }
}

function ocultarAlertaGeneral() {
  const banner = document.getElementById("bannerAlerta");
  if (banner) banner.style.display = "none";
}

function mostrarAlertaGeneral(mensaje) {
  const banner = document.getElementById("bannerAlerta");
  const texto = document.getElementById("bannerAlertaTexto");
  if (banner && texto) {
    texto.innerHTML = mensaje;
    banner.style.display = "flex";
    banner.classList.remove("shake");
    void banner.offsetWidth;
    banner.classList.add("shake");
    banner.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function limpiarFormularioDesdeCero() {
  ocultarAlertaGeneral();

  ["a", "b"].forEach((id, idx) => {
    const nom = document.getElementById(`nombre_${id}`);
    const tit = document.getElementById(`title_nombre_${id}`);
    const hor = document.getElementById(`hora_${id}`);
    const spo2 = document.getElementById(`spo2_num_${id}`);
    const ant = document.getElementById(`ant_${id}`);
    const badge = document.getElementById(`badge_live_${id}`);
    const errSpo2 = document.getElementById(`error_spo2_${id}`);
    const errHor = document.getElementById(`error_hora_${id}`);
    const seg = document.getElementById(`seguro_${id}`);

    if (nom) {
      nom.value = "";
      nom.placeholder = idx === 0 ? "Ej. 10203040 o Carlos Mendoza" : "Ej. 70809010 o Maria Torres";
    }
    if (tit) tit.textContent = `Paciente ${id.toUpperCase()}`;
    if (hor) {
      hor.value = "";
      hor.placeholder = idx === 0 ? "08:00" : "08:05";
      hor.classList.remove("is-invalid");
    }
    if (errHor) errHor.style.display = "none";
    if (spo2) {
      spo2.value = "";
      spo2.placeholder = "0 a 100";
      spo2.classList.remove("is-invalid");
    }
    if (errSpo2) errSpo2.style.display = "none";
    if (ant) ant.checked = false;
    if (seg) seg.value = "Asegurado";
    if (badge) {
      badge.className = "live-badge badge-neutral";
      badge.innerHTML = `<span class="status-dot" style="background-color: #94a3b8;"></span> Pendiente`;
    }
    actualizarIdentificadorEnVivo(id);
  });

  actualizarTicketsEnVivo();
  resetPipelineSteps();

  // Reset resultados
  document.getElementById("winnerName").textContent = "Pendiente de Evaluación";
  document.getElementById("winnerPriorityBadge").textContent = "PRIORIDAD: --";
  document.getElementById("winnerHcBadge").textContent = "HC: --";
  document.getElementById("winnerTicketHora").textContent = "Ticket: -- | Llegada: --";
  document.getElementById("winnerSeguro").textContent = "Seguro: --";
  document.getElementById("winnerSpo2").textContent = "SpO2: -- | Antecedentes: --";
  document.getElementById("winnerEspecialidad").textContent = "Especialidad: --";
  document.getElementById("winnerRationale").textContent = "Complete los datos de admisión y triage de ambos pacientes y presione '⚡ Evaluar Triage y Asignar Cama'.";

  document.getElementById("waitingName").textContent = "Pendiente";
  document.getElementById("waitingSpecs").textContent = "HC: -- | Ticket: -- | Llegada: -- | Seguro: --";
  document.getElementById("waitingPriority").textContent = "PRIORIDAD: --";
  document.getElementById("waitingDatosCriticos").textContent = "SpO2: -- | Antecedentes: --";
  document.getElementById("waitingDestino").textContent = "A la espera de la resolución algorítmica de triaje.";

  // Reset tabla
  ["A", "B"].forEach(p => {
    document.getElementById(`compNombre${p}`).textContent = "--";
    document.getElementById(`compEstado${p}`).textContent = "--";
    document.getElementById(`compHc${p}`).textContent = "--";
    document.getElementById(`compTicket${p}`).textContent = "--";
    document.getElementById(`compHora${p}`).textContent = "--";
    document.getElementById(`compSeguro${p}`).textContent = "--";
    document.getElementById(`compSpo2${p}`).textContent = "--";
    document.getElementById(`compAnt${p}`).textContent = "--";
    document.getElementById(`compPrio${p}`).textContent = "--";
    document.getElementById(`compDest${p}`).textContent = "En espera";
    document.getElementById(`compEsp${p}`).textContent = "--";
  });

  document.querySelectorAll("[data-preset]").forEach(b => b.classList.remove("highlight"));
  const btnCero = document.getElementById("btnLimpiarDesdeCero");
  if (btnCero) btnCero.classList.add("highlight");

  window.ultimaEvaluacion = null;
  const nomA = document.getElementById("nombre_a");
  if (nomA) nomA.focus();
}

function cargarPreset(key, autoevaluar = false) {
  const data = PRESETS[key];
  if (!data) return;

  ocultarAlertaGeneral();

  const btnCero = document.getElementById("btnLimpiarDesdeCero");
  if (btnCero) btnCero.classList.remove("highlight");

  // Paciente A
  document.getElementById("nombre_a").value = data.pxA.ident;
  document.getElementById("hora_a").value = data.pxA.hora;
  document.getElementById("seguro_a").value = data.pxA.seguro;
  document.getElementById("spo2_num_a").value = data.pxA.spo2;
  document.getElementById("ant_a").checked = data.pxA.ant;

  // Paciente B
  document.getElementById("nombre_b").value = data.pxB.ident;
  document.getElementById("hora_b").value = data.pxB.hora;
  document.getElementById("seguro_b").value = data.pxB.seguro;
  document.getElementById("spo2_num_b").value = data.pxB.spo2;
  document.getElementById("ant_b").checked = data.pxB.ant;

  actualizarIdentificadorEnVivo("a");
  actualizarIdentificadorEnVivo("b");
  actualizarTicketsEnVivo();

  validarHoraEnVivo("a");
  validarHoraEnVivo("b");
  const spo2AValido = validarSpo2EnVivo("a");
  const spo2BValido = validarSpo2EnVivo("b");

  document.querySelectorAll("[data-preset]").forEach(b => {
    if (b.getAttribute("data-preset") === key) {
      b.classList.add("highlight");
    } else {
      b.classList.remove("highlight");
    }
  });

  resetPipelineSteps();

  if (autoevaluar && spo2AValido && spo2BValido) {
    ejecutarSecuenciaInstantanea(obtenerDatosFormulario("a"), obtenerDatosFormulario("b"));
  }
}

function obtenerDatosFormulario(id) {
  const ident = document.getElementById(`nombre_${id}`).value.trim() || `Paciente ${id.toUpperCase()}`;
  const hora = document.getElementById(`hora_${id}`).value.trim();
  const seguro = document.getElementById(`seguro_${id}`).value;
  const spo2 = parseFloat(document.getElementById(`spo2_num_${id}`).value);
  const ant = document.getElementById(`ant_${id}`).checked;
  const { estado, nroHc, accion } = clasificarYBuscarEnBD(ident);

  return {
    identificador: ident,
    horaLlegada: hora,
    estadoRegistrado: estado,
    historiaClinica: nroHc,
    accionHc: accion,
    datosAdministrativos: seguro,
    spo2: spo2,
    antecedentesRegistrados: ant
  };
}

function resetPipelineSteps() {
  document.querySelectorAll(".pipeline-step").forEach((step, idx) => {
    step.className = "pipeline-step";
    const detail = document.getElementById(`step_detail_${idx + 1}`);
    if (detail) detail.textContent = "Pendiente";
  });
  document.getElementById("card_paciente_a").className = "patient-card patient-a";
  document.getElementById("card_paciente_b").className = "patient-card patient-b";
}

// ---------------------------------------------------------------------------
// 7. MOTOR DE EVALUACIÓN
// ---------------------------------------------------------------------------
async function ejecutarEvaluacion() {
  if (animacionEnCurso) return;

  const horaAOk = validarHoraEnVivo("a");
  const horaBOk = validarHoraEnVivo("b");
  const spo2AOk = validarSpo2EnVivo("a");
  const spo2BOk = validarSpo2EnVivo("b");

  if (!horaAOk || !horaBOk || !spo2AOk || !spo2BOk) {
    mostrarAlertaGeneral("<strong>No se puede procesar el triaje:</strong> Existen datos con errores o fuera de rango (como SpO2 fuera del rango 0 a 100). Por favor revise los campos señalados en rojo.");
    return;
  }

  ocultarAlertaGeneral();

  const datosA = obtenerDatosFormulario("a");
  const datosB = obtenerDatosFormulario("b");

  const modeAnimadoEl = document.getElementById("modeAnimado");
  const esAnimado = modeAnimadoEl && modeAnimadoEl.classList.contains("active");

  if (esAnimado) {
    animacionEnCurso = true;
    const btn = document.getElementById("btnEvaluar");
    if (btn) btn.disabled = true;
    await ejecutarSecuenciaAnimada(datosA, datosB);
    if (btn) btn.disabled = false;
    animacionEnCurso = false;
  } else {
    ejecutarSecuenciaInstantanea(datosA, datosB);
  }
}

function procesarLogicaAlgoritmo(datosA, datosB) {
  // 1. Enfermería 1: Registro e HC
  const pxA = enfermeria1Registro(datosA);
  const pxB = enfermeria1Registro(datosB);

  // 2. Enfermería 2: Asignación automática de Ticket y Seguro
  asignarTurnosPorLlegada(pxA, pxB);
  enfermeria2Atencion(pxA, datosA.datosAdministrativos);
  enfermeria2Atencion(pxB, datosB.datosAdministrativos);

  // 3. Triage Clínico: SpO2 y Antecedentes
  evaluarTriage(pxA, datosA.spo2, datosA.antecedentesRegistrados);
  evaluarTriage(pxB, datosB.spo2, datosB.antecedentesRegistrados);

  // 4. Decisión 1: Prioridad de Urgencia
  decision1Prioridad(pxA);
  decision1Prioridad(pxB);

  // 5. Decisión 2: Asignación de la única cama disponible
  const { asignado, espera, desempate } = decision2AsignarCama(pxA, pxB);

  let motivo;
  if (!desempate) {
    motivo = `Mayor severidad clínica: Prioridad ${asignado.prioridad} vs Prioridad ${espera.prioridad} (independiente del orden de llegada).`;
  } else {
    motivo = `Empate de prioridad (ambos P${asignado.prioridad}). Desempate por orden de llegada (${asignado.turno}: ${asignado.horaLlegada} vs ${espera.horaLlegada}).`;
  }

  const espAsignado = obtenerEspecialidadAsignado(asignado.prioridad);
  const espEspera = obtenerDerivacionEspera(espera.prioridad);

  return { pxA, pxB, asignado, espera, desempate, motivo, espAsignado, espEspera };
}

function ejecutarSecuenciaInstantanea(datosA, datosB) {
  resetPipelineSteps();

  const res = procesarLogicaAlgoritmo(datosA, datosB);

  document.getElementById("step_detail_1").textContent = `HC: ${res.pxA.historiaClinica} | ${res.pxB.historiaClinica}`;
  document.getElementById("step_detail_2").textContent = `Tickets: ${res.pxA.turno} vs ${res.pxB.turno}`;
  document.getElementById("step_detail_3").textContent = `SpO2: ${res.pxA.spo2}% vs ${res.pxB.spo2}%`;
  document.getElementById("step_detail_4").textContent = `P${res.pxA.prioridad} vs P${res.pxB.prioridad}`;
  document.getElementById("step_detail_5").textContent = `Cama -> ${res.asignado.identificador}`;

  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step_${i}`);
    if (el) el.className = "pipeline-step completed";
  }

  mostrarResultadosFinales(res);
}

async function ejecutarSecuenciaAnimada(datosA, datosB) {
  resetPipelineSteps();
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const res = procesarLogicaAlgoritmo(datosA, datosB);

  // Paso 1: Enfermería 1
  activarPaso(1);
  document.getElementById("step_detail_1").textContent = `HC: ${res.pxA.historiaClinica} | ${res.pxB.historiaClinica}`;
  await sleep(600);
  completarPaso(1);

  // Paso 2: Enfermería 2
  activarPaso(2);
  document.getElementById("step_detail_2").textContent = `Tickets: ${res.pxA.turno} vs ${res.pxB.turno}`;
  await sleep(600);
  completarPaso(2);

  // Paso 3: Triage Clínico
  activarPaso(3);
  document.getElementById("step_detail_3").textContent = `SpO2: ${res.pxA.spo2}% vs ${res.pxB.spo2}%`;
  await sleep(600);
  completarPaso(3);

  // Paso 4: Decisión 1
  activarPaso(4);
  document.getElementById("step_detail_4").textContent = `P${res.pxA.prioridad} vs P${res.pxB.prioridad}`;
  await sleep(600);
  completarPaso(4);

  // Paso 5: Decisión 2 y Destino
  activarPaso(5);
  document.getElementById("step_detail_5").textContent = `Cama -> ${res.asignado.identificador}`;
  await sleep(600);
  completarPaso(5);

  mostrarResultadosFinales(res);
}

function activarPaso(num) {
  document.querySelectorAll(".pipeline-step").forEach((step, idx) => {
    if (idx + 1 === num) {
      step.className = "pipeline-step active";
    }
  });
}

function completarPaso(num) {
  const step = document.getElementById(`step_${num}`);
  if (step) step.className = "pipeline-step completed";
}

// ---------------------------------------------------------------------------
// 8. RENDERIZADO DE RESULTADOS (ALERTA ROJA Y ALERTA ÁMBAR)
// ---------------------------------------------------------------------------
function mostrarResultadosFinales(res) {
  const { pxA, pxB, asignado, espera, motivo, espAsignado, espEspera } = res;
  const esAWinner = (asignado.identificador === pxA.identificador);

  // Resaltado de tarjetas en el formulario
  document.getElementById("card_paciente_a").className = esAWinner ? "patient-card patient-a winner" : "patient-card patient-a waiting";
  document.getElementById("card_paciente_b").className = !esAWinner ? "patient-card patient-b winner" : "patient-card patient-b waiting";

  // Alerta Roja: Cama Asignada
  const pAsigTipo = asignado.prioridad === 1 ? "CRÍTICO" : "MODERADO";
  document.getElementById("winnerName").textContent = asignado.identificador;
  document.getElementById("winnerPriorityBadge").textContent = `PRIORIDAD ${asignado.prioridad} (${pAsigTipo})`;
  document.getElementById("winnerHcBadge").textContent = `HC: ${asignado.historiaClinica} (${asignado.estadoRegistrado})`;
  document.getElementById("winnerTicketHora").textContent = `Ticket: ${asignado.turno} | Llegada: ${asignado.horaLlegada}`;
  document.getElementById("winnerSeguro").textContent = `Seguro: ${asignado.datosAdministrativos}`;
  document.getElementById("winnerSpo2").textContent = `SpO2: ${asignado.spo2}% | Antecedentes: ${asignado.antecedentesRegistrados ? "Sí" : "No"}`;
  document.getElementById("winnerEspecialidad").textContent = `Especialidad: ${espAsignado}`;
  document.getElementById("winnerRationale").textContent = motivo;

  // Alerta Ámbar: Paciente en Espera
  const pEspTipo = espera.prioridad === 1 ? "CRÍTICO" : "MODERADO";
  document.getElementById("waitingName").textContent = espera.identificador;
  document.getElementById("waitingSpecs").textContent = `HC: ${espera.historiaClinica} (${espera.estadoRegistrado}) | Ticket: ${espera.turno} | Llegada: ${espera.horaLlegada} | Seguro: ${espera.datosAdministrativos}`;
  document.getElementById("waitingPriority").textContent = `PRIORIDAD ${espera.prioridad} (${pEspTipo})`;
  document.getElementById("waitingDatosCriticos").textContent = `SpO2: ${espera.spo2}% | Antecedentes: ${espera.antecedentesRegistrados ? "Sí" : "No"}`;
  document.getElementById("waitingDestino").textContent = `Derivación: ${espEspera}`;

  // Tabla comparativa formal de 11 variables
  document.getElementById("compNombreA").textContent = pxA.identificador;
  document.getElementById("compEstadoA").textContent = pxA.estadoRegistrado;
  document.getElementById("compHcA").textContent = pxA.historiaClinica;
  document.getElementById("compTicketA").textContent = pxA.turno;
  document.getElementById("compHoraA").textContent = pxA.horaLlegada;
  document.getElementById("compSeguroA").textContent = pxA.datosAdministrativos;
  document.getElementById("compSpo2A").textContent = `${pxA.spo2}%`;
  document.getElementById("compAntA").textContent = pxA.antecedentesRegistrados ? "Sí" : "No";
  document.getElementById("compPrioA").textContent = `Prioridad ${pxA.prioridad} (${pxA.prioridad === 1 ? "Crítico" : "Moderado"})`;
  document.getElementById("compDestA").textContent = esAWinner ? "ALERTA ROJA: CAMA ASIGNADA" : "ALERTA ÁMBAR: EN ESPERA";
  document.getElementById("compEspA").textContent = esAWinner ? espAsignado : espEspera;

  document.getElementById("compNombreB").textContent = pxB.identificador;
  document.getElementById("compEstadoB").textContent = pxB.estadoRegistrado;
  document.getElementById("compHcB").textContent = pxB.historiaClinica;
  document.getElementById("compTicketB").textContent = pxB.turno;
  document.getElementById("compHoraB").textContent = pxB.horaLlegada;
  document.getElementById("compSeguroB").textContent = pxB.datosAdministrativos;
  document.getElementById("compSpo2B").textContent = `${pxB.spo2}%`;
  document.getElementById("compAntB").textContent = pxB.antecedentesRegistrados ? "Sí" : "No";
  document.getElementById("compPrioB").textContent = `Prioridad ${pxB.prioridad} (${pxB.prioridad === 1 ? "Crítico" : "Moderado"})`;
  document.getElementById("compDestB").textContent = !esAWinner ? "ALERTA ROJA: CAMA ASIGNADA" : "ALERTA ÁMBAR: EN ESPERA";
  document.getElementById("compEspB").textContent = !esAWinner ? espAsignado : espEspera;

  window.ultimaEvaluacion = res;
}

// ---------------------------------------------------------------------------
// 9. MODAL DE REPORTE CLÍNICO OFICIAL DE AUDITORÍA
// ---------------------------------------------------------------------------
function abrirModalReporte() {
  if (!window.ultimaEvaluacion) {
    ejecutarSecuenciaInstantanea(obtenerDatosFormulario("a"), obtenerDatosFormulario("b"));
  }

  const { pxA, pxB, asignado, espera, motivo, espAsignado, espEspera } = window.ultimaEvaluacion;
  const fecha = new Date().toLocaleString();

  const reportHtml = `
    <div class="printable-report">
      <div class="report-header-doc">
        <h2>UNIVERSIDAD POLITÉCNICA DEL PERÚ (UPP)</h2>
        <p>FACULTAD DE CIENCIAS DE LA SALUD — ENFERMERÍA</p>
        <p><strong>INFORME DE AUDITORÍA Y RESOLUCIÓN DE TRIAJE CLÍNICO DE EMERGENCIA</strong></p>
        <p style="font-size: 0.8rem; margin-top: 4px;">Fecha y hora de emisión: ${fecha} | Protocolo de Atención Caso #06</p>
      </div>

      <div class="report-section-doc">
        <h4>1. Contexto Clínico y Restricción de Recursos</h4>
        <p>
          Se presentaron dos pacientes simultáneos al servicio de urgencias bajo condiciones de saturación hospitalaria,
          contando con la <strong>disponibilidad inmediata para una (1) sola cama / evaluación médica especializada</strong>.
        </p>
      </div>

      <div class="report-section-doc">
        <h4>2. Cuadro Comparativo Integral de Admisión y Triage (3 Módulos)</h4>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.88rem;" border="1" cellpadding="6">
          <tr style="background: #f1f5f9;">
            <th>Parámetro Evaluado</th>
            <th>${pxA.identificador}</th>
            <th>${pxB.identificador}</th>
          </tr>
          <tr>
            <td><strong>Módulo 1: Estado en BD / Historia Clínica</strong></td>
            <td>${pxA.estadoRegistrado} (${pxA.historiaClinica})</td>
            <td>${pxB.estadoRegistrado} (${pxB.historiaClinica})</td>
          </tr>
          <tr>
            <td><strong>Módulo 2: Ticket / Hora / Cobertura</strong></td>
            <td>${pxA.turno} | ${pxA.horaLlegada} | ${pxA.datosAdministrativos}</td>
            <td>${pxB.turno} | ${pxB.horaLlegada} | ${pxB.datosAdministrativos}</td>
          </tr>
          <tr>
            <td><strong>Módulo 3: Saturación SpO2 (%)</strong></td>
            <td>${pxA.spo2}% ${pxA.spo2 < 92 ? "(Hipoxemia severa <92%)" : "(Normal >=92%)"}</td>
            <td>${pxB.spo2}% ${pxB.spo2 < 92 ? "(Hipoxemia severa <92%)" : "(Normal >=92%)"}</td>
          </tr>
          <tr>
            <td><strong>Módulo 3: Antecedentes Relevantes</strong></td>
            <td>${pxA.antecedentesRegistrados ? "SÍ (Factor de riesgo)" : "NO"}</td>
            <td>${pxB.antecedentesRegistrados ? "SÍ (Factor de riesgo)" : "NO"}</td>
          </tr>
          <tr>
            <td><strong>Decisión 1: Nivel de Prioridad</strong></td>
            <td><strong>Prioridad ${pxA.prioridad}</strong> (${pxA.prioridad === 1 ? "Crítico" : "Moderado"})</td>
            <td><strong>Prioridad ${pxB.prioridad}</strong> (${pxB.prioridad === 1 ? "Crítico" : "Moderado"})</td>
          </tr>
        </table>
      </div>

      <div class="report-section-doc">
        <h4>3. Resolución Algorítmica y Asignación de Recursos (Decisión 2)</h4>
        
        <div style="background: #fff1f2; border: 1.5px solid #f43f5e; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
          <p style="color: #9f1239; font-weight: 800; font-size: 1rem; margin-bottom: 4px;">
            🚨 [!] ALERTA ROJA: CAMA ASIGNADA
          </p>
          <p><strong>Paciente Asignado:</strong> ${asignado.identificador} (Prioridad ${asignado.prioridad})</p>
          <p><strong>Historia Clínica / Ticket:</strong> ${asignado.historiaClinica} | ${asignado.turno}</p>
          <p><strong>Especialidad de Destino:</strong> ${espAsignado}</p>
          <p><strong>Fundamento / Criterio:</strong> ${motivo}</p>
        </div>

        <div style="background: #fffbeb; border: 1.5px solid #f59e0b; padding: 12px; border-radius: 6px;">
          <p style="color: #b45309; font-weight: 800; font-size: 1rem; margin-bottom: 4px;">
            ⚠️ [!] ALERTA ÁMBAR: PACIENTE EN ESPERA
          </p>
          <p><strong>Paciente en Espera:</strong> ${espera.identificador} (Prioridad ${espera.prioridad})</p>
          <p><strong>Historia Clínica / Ticket:</strong> ${espera.historiaClinica} | ${espera.turno}</p>
          <p><strong>Derivación Clínica:</strong> ${espEspera}</p>
        </div>
      </div>

      <div class="report-signatures">
        <div class="signature-box">
          <p><strong>Luis Guillermo Vásquez Valdivieso</strong></p>
          <p>Desarrollador — UPP</p>
        </div>
        <div class="signature-box">
          <p><strong>Rodrigo Alonso Añazgo Farro</strong></p>
          <p>Desarrollador — UPP</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById("modalBodyContent").innerHTML = reportHtml;
  document.getElementById("modalReporte").classList.add("open");
}

function cerrarModalReporte() {
  document.getElementById("modalReporte").classList.remove("open");
}
