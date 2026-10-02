/**
 * ==============================================================================
 * SISTEMA DE PRIORIDAD DE ATENCIÓN (TRIAJE) - CASO 6
 * Curso: Pensamiento Algorítmico - Ciclo II (Trabajo Parcial UPP)
 * ==============================================================================
 * Implementación fiel en JavaScript que replica exactamente el comportamiento,
 * reglas de validación y árboles de decisión de triage_prioridad.py.
 */

// ---------------------------------------------------------------------------
// 1. MODELO DE DATOS Y REGLAS DE VALIDACIÓN (Idéntico a Python)
// ---------------------------------------------------------------------------

class Paciente {
  constructor(nombre, horaLlegada, spo2 = null, antecedentesRegistrados = false) {
    this.nombre = nombre;
    this.horaLlegada = horaLlegada; // "HH:MM"
    this.spo2 = spo2; // float 0.0 - 100.0
    this.antecedentesRegistrados = Boolean(antecedentesRegistrados);
    this.prioridad = null; // 1 (crítico) o 3 (moderado)
  }

  // Convierte "HH:MM" a minutos transcurridos en el día para comparación
  horaEnMinutos() {
    const [h, m] = this.horaLlegada.split(":").map(Number);
    return h * 60 + m;
  }
}

function validarHora(valor) {
  if (!valor || typeof valor !== "string") {
    throw new Error("Formato de hora inválido. Debe ser HH:MM (ej. 07:15).");
  }
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!regex.test(valor.trim())) {
    throw new Error(`Hora '${valor}' inválida. Use formato HH:MM (24 horas).`);
  }
  return valor.trim();
}

function validarSpo2(valor) {
  const num = parseFloat(valor);
  if (isNaN(num)) {
    throw new Error(`SpO2 debe ser un número real. Recibido: ${valor}`);
  }
  if (num < 0 || num > 100) {
    throw new Error(`SpO2 (${num}%) fuera de rango permitido [0 - 100%].`);
  }
  return num;
}

function validarPrioridad(valor) {
  const num = parseInt(valor, 10);
  if (num !== 1 && num !== 3) {
    throw new Error(`Prioridad '${valor}' inválida. Solo se admite 1 (Crítico) o 3 (Moderado).`);
  }
  return num;
}

// ---------------------------------------------------------------------------
// 2. PASOS DEL ALGORITMO CLÍNICO
// ---------------------------------------------------------------------------

function registrarPaciente(nombre, horaLlegada) {
  const horaValida = validarHora(horaLlegada);
  return new Paciente(nombre || "Paciente", horaValida);
}

function evaluarTriage(paciente, spo2, antecedentes) {
  paciente.spo2 = validarSpo2(spo2);
  paciente.antecedentesRegistrados = Boolean(antecedentes);
}

/**
 * Decisión 1: Clasificación clínica de urgencia
 * Regla: Si SpO2 < 92% O tiene antecedentes relevantes registrados => Prioridad 1 (Crítico)
 *        De lo contrario => Prioridad 3 (Moderado)
 */
function decision1ClasificarPrioridad(paciente) {
  if (paciente.spo2 < 92 || paciente.antecedentesRegistrados) {
    paciente.prioridad = 1; // Crítico
  } else {
    paciente.prioridad = 3; // Moderado
  }
  validarPrioridad(paciente.prioridad);
  return paciente.prioridad;
}

/**
 * Decisión 2: Con 1 sola cama disponible, decide asignación
 * Criterio:
 *  - Menor número de prioridad tiene preferencia (Prioridad 1 > Prioridad 3)
 *  - En caso de empate de prioridad, desempata la hora de llegada más temprana
 */
function decision2AsignarCama(pxA, pxB) {
  let asignado, enEspera, justificacion;

  if (pxA.prioridad < pxB.prioridad) {
    asignado = pxA;
    enEspera = pxB;
    justificacion = `Mayor urgencia clínica: ${pxA.nombre} tiene Prioridad 1 (Crítico) frente a Prioridad 3 (Moderado) de ${pxB.nombre}.`;
  } else if (pxB.prioridad < pxA.prioridad) {
    asignado = pxB;
    enEspera = pxA;
    justificacion = `Mayor urgencia clínica: ${pxB.nombre} tiene Prioridad 1 (Crítico) frente a Prioridad 3 (Moderado) de ${pxA.nombre}.`;
  } else {
    // Empate en nivel de prioridad: desempate por hora de llegada
    const minA = pxA.horaEnMinutos();
    const minB = pxB.horaEnMinutos();

    if (minA <= minB) {
      asignado = pxA;
      enEspera = pxB;
      const dif = minB - minA;
      justificacion = `Empate en Prioridad ${pxA.prioridad} (${pxA.prioridad === 1 ? 'Crítico' : 'Moderado'}): se aplica criterio de desempate por hora de llegada. ${pxA.nombre} llegó a las ${pxA.horaLlegada} (${dif === 0 ? 'simultáneo/antes' : dif + ' min antes'} que ${pxB.nombre} a las ${pxB.horaLlegada}).`;
    } else {
      asignado = pxB;
      enEspera = pxA;
      const dif = minA - minB;
      justificacion = `Empate en Prioridad ${pxB.prioridad} (${pxB.prioridad === 1 ? 'Crítico' : 'Moderado'}): se aplica criterio de desempate por hora de llegada. ${pxB.nombre} llegó a las ${pxB.horaLlegada} (${dif} min antes que ${pxA.nombre} a las ${pxA.horaLlegada}).`;
    }
  }

  return { asignado, enEspera, justificacion };
}

function obtenerEspecialidad(prioridad) {
  return prioridad === 1 
    ? "Cardiología / Unidad de Trauma Shock" 
    : "Medicina General / Tópico de Urgencias";
}

// ---------------------------------------------------------------------------
// 3. ESTADO DE LA APLICACIÓN Y ELEMENTOS DEL DOM
// ---------------------------------------------------------------------------

const PRESETS = {
  caso6: {
    nombre: "Caso 6 Oficial (Demo)",
    desc: "Datos exactos del enunciado de la guía.",
    pxA: { nombre: "Px A", hora: "07:15", spo2: 99, antecedentes: false },
    pxB: { nombre: "Px B", hora: "07:19", spo2: 91, antecedentes: true }
  },
  empateCritico: {
    nombre: "Empate Crítico (P1 vs P1)",
    desc: "Ambos críticos, gana el que llegó primero.",
    pxA: { nombre: "Px Carlos", hora: "08:10", spo2: 89, antecedentes: false },
    pxB: { nombre: "Px María", hora: "08:25", spo2: 88, antecedentes: true }
  },
  empateModerado: {
    nombre: "Empate Moderado (P3 vs P3)",
    desc: "Ambos moderados, desempata la hora de llegada.",
    pxA: { nombre: "Px Juan", hora: "09:40", spo2: 97, antecedentes: false },
    pxB: { nombre: "Px Elena", hora: "09:15", spo2: 96, antecedentes: false }
  },
  umbralSpo2: {
    nombre: "Sensibilidad Umbral SpO2 (91% vs 92%)",
    desc: "91% detona prioridad 1; 92% permanece prioridad 3.",
    pxA: { nombre: "Px Roberto", hora: "10:00", spo2: 92, antecedentes: false },
    pxB: { nombre: "Px Sofia", hora: "10:05", spo2: 91, antecedentes: false }
  },
  factorAntecedente: {
    nombre: "Impacto del Antecedente Relevante",
    desc: "SpO2 normal (96%), pero con antecedentes se clasifica crítico.",
    pxA: { nombre: "Px Daniel", hora: "11:00", spo2: 96, antecedentes: true },
    pxB: { nombre: "Px Carmen", hora: "10:50", spo2: 95, antecedentes: false }
  },
  spo2Invalido: {
    nombre: "Prueba SpO2 Fuera de Rango (120%)",
    desc: "Demuestra la activación del mensaje de error según la Regla 1.",
    pxA: { nombre: "Px Alerta", hora: "07:15", spo2: 120, antecedentes: false },
    pxB: { nombre: "Px B", hora: "07:19", spo2: 91, antecedentes: true }
  }
};

let animacionEnCurso = false;
let servidorPythonDisponible = false;

// ---------------------------------------------------------------------------
// 4. CONTROLADORES DE INTERFAZ DE USUARIO
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  verificarServidorPython();
  inicializarEventos();
  cargarPreset("caso6", false); // Cargar sin alerta
});

function verificarServidorPython() {
  const badge = document.getElementById("serverStatusBadge");
  const text = document.getElementById("serverStatusText");

  if (!badge || !text) return;

  // Si se abre directo como archivo HTML en el navegador
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
  vincularSpo2("a");
  vincularSpo2("b");
  vincularHora("a");
  vincularHora("b");

  ["a", "b"].forEach(id => {
    const elAnt = document.getElementById(`ant_${id}`);
    const elNombre = document.getElementById(`nombre_${id}`);

    if (elAnt) elAnt.addEventListener("change", () => actualizarPreviewEnVivo(id));
    if (elNombre) {
      elNombre.addEventListener("input", () => {
        const titleEl = document.getElementById(`title_nombre_${id}`);
        if (titleEl) titleEl.textContent = elNombre.value || `Paciente ${id.toUpperCase()}`;
      });
    }
  });

  const btnEvaluar = document.getElementById("btnEvaluar");
  if (btnEvaluar) btnEvaluar.addEventListener("click", ejecutarEvaluacion);

  const btnLimpiar = document.getElementById("btnLimpiarDesdeCero");
  const btnLimpiarAccion = document.getElementById("btnLimpiarAccion");
  if (btnLimpiar) btnLimpiar.addEventListener("click", limpiarFormularioDesdeCero);
  if (btnLimpiarAccion) btnLimpiarAccion.addEventListener("click", limpiarFormularioDesdeCero);

  document.querySelectorAll("[data-preset]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const presetKey = e.currentTarget.getAttribute("data-preset");
      cargarPreset(presetKey, presetKey !== "spo2Invalido");
    });
  });

  const btnReporte = document.getElementById("btnReporte");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const btnImprimir = document.getElementById("btnImprimir");

  if (btnReporte) btnReporte.addEventListener("click", abrirModalReporte);
  if (btnCloseModal) btnCloseModal.addEventListener("click", cerrarModalReporte);
  if (btnImprimir) btnImprimir.addEventListener("click", () => window.print());

  document.querySelectorAll(".mode-option").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".mode-option").forEach(b => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
    });
  });
}

function vincularSpo2(id) {
  const number = document.getElementById(`spo2_num_${id}`);
  if (!number) return;

  // Al escribir libremente en el campo de entrada
  number.addEventListener("input", () => {
    validarSpo2EnVivo(id);
  });
}

function vincularHora(id) {
  const elHora = document.getElementById(`hora_${id}`);
  if (!elHora) return;

  elHora.addEventListener("input", () => {
    validarHoraEnVivo(id);
  });
}

function validarSpo2EnVivo(id) {
  const number = document.getElementById(`spo2_num_${id}`);
  const errorEl = document.getElementById(`error_spo2_${id}`);
  const badge = document.getElementById(`badge_live_${id}`);

  if (!number || !errorEl) return true;

  const raw = number.value.trim();
  const val = parseFloat(raw);

  // Validar si es un número real
  if (raw === "" || isNaN(val)) {
    number.classList.add("is-invalid");
    errorEl.style.display = "flex";
    errorEl.innerHTML = `<span>⚠️</span> <span><strong>Error Regla 1:</strong> SpO2 debe ser un número. Valor recibido: '${raw}'.</span>`;
    if (badge) {
      badge.className = "live-badge badge-invalido";
      badge.innerHTML = `<span class="status-dot"></span> ❌ SpO2 Inválido`;
    }
    return false;
  }

  // Validar Regla 1: Rango permitido [0 - 100]
  if (val < 0 || val > 100) {
    number.classList.add("is-invalid");
    errorEl.style.display = "flex";
    errorEl.innerHTML = `<span>⚠️</span> <span><strong>Error Regla 1:</strong> spo2 = ${val} fuera de rango permitido (0-100). Verifique el valor del oxímetro e ingrese nuevamente.</span>`;
    if (badge) {
      badge.className = "live-badge badge-invalido";
      badge.innerHTML = `<span class="status-dot"></span> ❌ Fuera de Rango (${val}%)`;
    }
    return false;
  }

  // Valor completamente válido
  number.classList.remove("is-invalid");
  errorEl.style.display = "none";

  actualizarPreviewEnVivo(id);
  ocultarAlertaGeneral();
  return true;
}

function validarHoraEnVivo(id) {
  const elHora = document.getElementById(`hora_${id}`);
  const errorEl = document.getElementById(`error_hora_${id}`);

  if (!elHora || !errorEl) return true;

  const raw = elHora.value.trim();
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!regex.test(raw)) {
    elHora.classList.add("is-invalid");
    errorEl.style.display = "flex";
    errorEl.innerHTML = `<span>⚠️</span> <span><strong>Error:</strong> hora_llegada = '${raw}' inválida. Use formato HH:MM (24h, ej. 07:15).</span>`;
    return false;
  }

  elHora.classList.remove("is-invalid");
  errorEl.style.display = "none";
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
    void banner.offsetWidth; // reiniciar animación CSS
    banner.classList.add("shake");
    banner.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function limpiarFormularioDesdeCero() {
  ocultarAlertaGeneral();

  // Paciente A
  const nomA = document.getElementById("nombre_a");
  const titA = document.getElementById("title_nombre_a");
  const horA = document.getElementById("hora_a");
  const spo2A = document.getElementById("spo2_num_a");
  const antA = document.getElementById("ant_a");
  const badgeA = document.getElementById("badge_live_a");
  const errSpo2A = document.getElementById("error_spo2_a");
  const errHorA = document.getElementById("error_hora_a");

  nomA.value = "";
  nomA.placeholder = "Ej. Juan Pérez (Paciente A)";
  titA.textContent = "Paciente A";
  horA.value = "";
  horA.placeholder = "HH:MM (ej. 08:00)";
  horA.classList.remove("is-invalid");
  errHorA.style.display = "none";
  spo2A.value = "";
  spo2A.placeholder = "0 a 100";
  spo2A.classList.remove("is-invalid");
  errSpo2A.style.display = "none";
  antA.checked = false;
  badgeA.className = "live-badge badge-neutral";
  badgeA.innerHTML = `<span class="status-dot" style="background-color: #94a3b8;"></span> Pendiente`;

  // Paciente B
  const nomB = document.getElementById("nombre_b");
  const titB = document.getElementById("title_nombre_b");
  const horB = document.getElementById("hora_b");
  const spo2B = document.getElementById("spo2_num_b");
  const antB = document.getElementById("ant_b");
  const badgeB = document.getElementById("badge_live_b");
  const errSpo2B = document.getElementById("error_spo2_b");
  const errHorB = document.getElementById("error_hora_b");

  nomB.value = "";
  nomB.placeholder = "Ej. María Gómez (Paciente B)";
  titB.textContent = "Paciente B";
  horB.value = "";
  horB.placeholder = "HH:MM (ej. 08:05)";
  horB.classList.remove("is-invalid");
  errHorB.style.display = "none";
  spo2B.value = "";
  spo2B.placeholder = "0 a 100";
  spo2B.classList.remove("is-invalid");
  errSpo2B.style.display = "none";
  antB.checked = false;
  badgeB.className = "live-badge badge-neutral";
  badgeB.innerHTML = `<span class="status-dot" style="background-color: #94a3b8;"></span> Pendiente`;

  // Desmarcar botones de presets y resaltar el de limpiar
  document.querySelectorAll("[data-preset]").forEach(b => b.classList.remove("highlight"));
  const btnCero = document.getElementById("btnLimpiarDesdeCero");
  if (btnCero) btnCero.classList.add("highlight");

  // Reiniciar pasos del diagrama de flujo
  resetPipelineSteps();

  // Reiniciar panel de resultados a estado de espera
  document.getElementById("winnerName").textContent = "Pendiente de Evaluación";
  document.getElementById("winnerPriorityBadge").textContent = "Prioridad: --";
  document.getElementById("winnerHora").textContent = "Hora: --";
  document.getElementById("winnerSpo2").textContent = "SpO2: --";
  document.getElementById("winnerEspecialidad").textContent = "Destino: --";
  document.getElementById("winnerRationale").textContent = "Formulario en blanco listo para ingreso manual. Complete los datos de ambos pacientes arriba y presione '⚡ Evaluar Triage y Asignar Cama' para ver la resolución algorítmica.";

  document.getElementById("waitingName").textContent = "Pendiente";
  document.getElementById("waitingPriority").textContent = "Prioridad: --";
  document.getElementById("waitingHora").textContent = "Llegada: -- | SpO2: --";
  document.getElementById("waitingDestino").textContent = "A la espera de que se ingresen y evalúen los pacientes.";

  // Reiniciar tabla comparativa
  ["A", "B"].forEach(p => {
    document.getElementById(`compNombre${p}`).textContent = `--`;
    document.getElementById(`compHora${p}`).textContent = `--`;
    document.getElementById(`compSpo2${p}`).textContent = `--`;
    document.getElementById(`compAnt${p}`).textContent = `--`;
    document.getElementById(`compPrio${p}`).textContent = `--`;
    document.getElementById(`compDest${p}`).textContent = `En espera`;
  });

  window.ultimaEvaluacion = null;

  // Enfocar el primer campo para empezar a escribir de inmediato
  nomA.focus();
}

function cargarPreset(key, autoevaluar = false) {
  const data = PRESETS[key];
  if (!data) return;

  ocultarAlertaGeneral();

  // Desmarcar botón de limpiar desde cero
  const btnCero = document.getElementById("btnLimpiarDesdeCero");
  if (btnCero) btnCero.classList.remove("highlight");

  // Paciente A
  document.getElementById("nombre_a").value = data.pxA.nombre;
  document.getElementById("title_nombre_a").textContent = data.pxA.nombre;
  document.getElementById("hora_a").value = data.pxA.hora;
  document.getElementById("spo2_num_a").value = data.pxA.spo2;
  document.getElementById("ant_a").checked = data.pxA.antecedentes;

  // Paciente B
  document.getElementById("nombre_b").value = data.pxB.nombre;
  document.getElementById("title_nombre_b").textContent = data.pxB.nombre;
  document.getElementById("hora_b").value = data.pxB.hora;
  document.getElementById("spo2_num_b").value = data.pxB.spo2;
  document.getElementById("ant_b").checked = data.pxB.antecedentes;

  // Validaciones en vivo
  validarHoraEnVivo("a");
  validarHoraEnVivo("b");
  const spo2AValido = validarSpo2EnVivo("a");
  const spo2BValido = validarSpo2EnVivo("b");

  // Resaltar botón activo
  document.querySelectorAll("[data-preset]").forEach(b => {
    if (b.getAttribute("data-preset") === key) {
      b.classList.add("highlight");
    } else {
      b.classList.remove("highlight");
    }
  });

  resetPipelineSteps();

  // Si es válido y se pide autoevaluar
  if (autoevaluar && spo2AValido && spo2BValido) {
    ejecutarSecuenciaInstantanea(
      { nombre: data.pxA.nombre, hora: data.pxA.hora, spo2: data.pxA.spo2, antecedentes: data.pxA.antecedentes },
      { nombre: data.pxB.nombre, hora: data.pxB.hora, spo2: data.pxB.spo2, antecedentes: data.pxB.antecedentes }
    );
  }
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
// 5. MOTOR DE EJECUCIÓN
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

  const datosA = {
    nombre: document.getElementById("nombre_a").value.trim() || "Paciente A",
    hora: document.getElementById("hora_a").value.trim(),
    spo2: parseFloat(document.getElementById("spo2_num_a").value),
    antecedentes: document.getElementById("ant_a").checked
  };

  const datosB = {
    nombre: document.getElementById("nombre_b").value.trim() || "Paciente B",
    hora: document.getElementById("hora_b").value.trim(),
    spo2: parseFloat(document.getElementById("spo2_num_b").value),
    antecedentes: document.getElementById("ant_b").checked
  };

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

function ejecutarSecuenciaInstantanea(datosA, datosB) {
  resetPipelineSteps();

  const pxA = registrarPaciente(datosA.nombre, datosA.hora);
  const pxB = registrarPaciente(datosB.nombre, datosB.hora);

  evaluarTriage(pxA, datosA.spo2, datosA.antecedentes);
  evaluarTriage(pxB, datosB.spo2, datosB.antecedentes);

  decision1ClasificarPrioridad(pxA);
  decision1ClasificarPrioridad(pxB);

  const { asignado, enEspera, justificacion } = decision2AsignarCama(pxA, pxB);

  document.getElementById("step_detail_1").textContent = `Tickets: ${pxA.nombre} y ${pxB.nombre}`;
  document.getElementById("step_detail_2").textContent = `SpO2: ${pxA.spo2}% vs ${pxB.spo2}%`;
  document.getElementById("step_detail_3").textContent = `P${pxA.prioridad} vs P${pxB.prioridad}`;
  document.getElementById("step_detail_4").textContent = `Cama -> ${asignado.nombre}`;
  document.getElementById("step_detail_5").textContent = obtenerEspecialidad(asignado.prioridad);

  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step_${i}`);
    if (el) el.className = "pipeline-step completed";
  }

  mostrarResultadosFinales(pxA, pxB, asignado, enEspera, justificacion);
}

async function ejecutarSecuenciaAnimada(datosA, datosB) {
  resetPipelineSteps();
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Paso 1: Registro
  activarPaso(1);
  const pxA = registrarPaciente(datosA.nombre, datosA.hora);
  const pxB = registrarPaciente(datosB.nombre, datosB.hora);
  document.getElementById("step_detail_1").textContent = `Tickets: ${pxA.nombre} (${pxA.horaLlegada}) | ${pxB.nombre} (${pxB.horaLlegada})`;
  await sleep(650);
  completarPaso(1);

  // Paso 2: Triage
  activarPaso(2);
  evaluarTriage(pxA, datosA.spo2, datosA.antecedentes);
  evaluarTriage(pxB, datosB.spo2, datosB.antecedentes);
  document.getElementById("step_detail_2").textContent = `SpO2: ${pxA.spo2}% vs ${pxB.spo2}%`;
  await sleep(650);
  completarPaso(2);

  // Paso 3: Decisión 1
  activarPaso(3);
  decision1ClasificarPrioridad(pxA);
  decision1ClasificarPrioridad(pxB);
  document.getElementById("step_detail_3").textContent = `${pxA.nombre}: P${pxA.prioridad} | ${pxB.nombre}: P${pxB.prioridad}`;
  await sleep(750);
  completarPaso(3);

  // Paso 4: Decisión 2
  activarPaso(4);
  const { asignado, enEspera, justificacion } = decision2AsignarCama(pxA, pxB);
  document.getElementById("step_detail_4").textContent = `Cama -> ${asignado.nombre}`;
  await sleep(750);
  completarPaso(4);

  // Paso 5: Atención
  activarPaso(5);
  const especialidad = obtenerEspecialidad(asignado.prioridad);
  document.getElementById("step_detail_5").textContent = `${especialidad}`;
  await sleep(500);
  completarPaso(5);

  mostrarResultadosFinales(pxA, pxB, asignado, enEspera, justificacion);
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
// 6. RENDERIZADO DE RESULTADOS
// ---------------------------------------------------------------------------

function mostrarResultadosFinales(pxA, pxB, asignado, enEspera, justificacion) {
  const esAWinner = (asignado.nombre === pxA.nombre);
  document.getElementById("card_paciente_a").className = esAWinner ? "patient-card patient-a winner" : "patient-card patient-a waiting";
  document.getElementById("card_paciente_b").className = !esAWinner ? "patient-card patient-b winner" : "patient-card patient-b waiting";

  document.getElementById("winnerName").textContent = asignado.nombre;
  document.getElementById("winnerPriorityBadge").textContent = `Prioridad ${asignado.prioridad} (${asignado.prioridad === 1 ? 'Crítico' : 'Moderado'})`;
  document.getElementById("winnerHora").textContent = `Hora: ${asignado.horaLlegada}`;
  document.getElementById("winnerSpo2").textContent = `SpO2: ${asignado.spo2}%`;
  document.getElementById("winnerEspecialidad").textContent = `Destino: ${obtenerEspecialidad(asignado.prioridad)}`;
  document.getElementById("winnerRationale").textContent = justificacion;

  document.getElementById("waitingName").textContent = enEspera.nombre;
  document.getElementById("waitingPriority").textContent = `Prioridad ${enEspera.prioridad} (${enEspera.prioridad === 1 ? 'Crítico' : 'Moderado'})`;
  document.getElementById("waitingHora").textContent = `Llegada: ${enEspera.horaLlegada} | SpO2: ${enEspera.spo2}%`;
  document.getElementById("waitingDestino").textContent = `Derivado a sala de espera y monitoreo continuo de ${obtenerEspecialidad(enEspera.prioridad)}.`;

  document.getElementById("compNombreA").textContent = pxA.nombre;
  document.getElementById("compHoraA").textContent = pxA.horaLlegada;
  document.getElementById("compSpo2A").textContent = `${pxA.spo2}%`;
  document.getElementById("compAntA").textContent = pxA.antecedentesRegistrados ? "Sí" : "No";
  document.getElementById("compPrioA").textContent = `Prioridad ${pxA.prioridad} (${pxA.prioridad === 1 ? 'Crítico' : 'Moderado'})`;
  document.getElementById("compDestA").textContent = esAWinner ? "CAMA ASIGNADA (Ingreso Inmediato)" : "Espera / Reevaluación";

  document.getElementById("compNombreB").textContent = pxB.nombre;
  document.getElementById("compHoraB").textContent = pxB.horaLlegada;
  document.getElementById("compSpo2B").textContent = `${pxB.spo2}%`;
  document.getElementById("compAntB").textContent = pxB.antecedentesRegistrados ? "Sí" : "No";
  document.getElementById("compPrioB").textContent = `Prioridad ${pxB.prioridad} (${pxB.prioridad === 1 ? 'Crítico' : 'Moderado'})`;
  document.getElementById("compDestB").textContent = !esAWinner ? "CAMA ASIGNADA (Ingreso Inmediato)" : "Espera / Reevaluación";

  window.ultimaEvaluacion = { pxA, pxB, asignado, enEspera, justificacion };
}

function abrirModalReporte() {
  if (!window.ultimaEvaluacion) {
    ejecutarSecuenciaInstantanea(
      {
        nombre: document.getElementById("nombre_a").value || "Paciente A",
        hora: document.getElementById("hora_a").value,
        spo2: parseFloat(document.getElementById("spo2_num_a").value),
        antecedentes: document.getElementById("ant_a").checked
      },
      {
        nombre: document.getElementById("nombre_b").value || "Paciente B",
        hora: document.getElementById("hora_b").value,
        spo2: parseFloat(document.getElementById("spo2_num_b").value),
        antecedentes: document.getElementById("ant_b").checked
      }
    );
  }

  const { pxA, pxB, asignado, enEspera, justificacion } = window.ultimaEvaluacion;
  const fecha = new Date().toLocaleString();

  const reportHtml = `
    <div class="printable-report">
      <div class="report-header-doc">
        <h2>UNIVERSIDAD POLITÉCNICA DEL PERÚ (UPP)</h2>
        <p>FACULTAD DE CIENCIAS DE LA SALUD — ENFERMERÍA</p>
        <p><strong>INFORME DE AUDITORÍA Y RESOLUCIÓN DE TRIAJE CLÍNICO DE EMERGENCIA</strong></p>
        <p style="font-size: 0.8rem; margin-top: 4px;">Fecha y hora de emisión: ${fecha} | Caso Clínico #06</p>
      </div>

      <div class="report-section-doc">
        <h4>1. Contexto del Caso y Disponibilidad de Recursos</h4>
        <p>Dos pacientes acuden casi simultáneamente al servicio de emergencias en un contexto de saturación hospitalaria con <strong>disponibilidad inmediata para una (1) sola cama / evaluación médica</strong>.</p>
      </div>

      <div class="report-section-doc">
        <h4>2. Cuadro Comparativo de Signos y Clasificación</h4>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.88rem;" border="1" cellpadding="6">
          <tr style="background: #f1f5f9;">
            <th>Variable Evaluada</th>
            <th>${pxA.nombre}</th>
            <th>${pxB.nombre}</th>
          </tr>
          <tr>
            <td><strong>Hora de Llegada (HH:MM)</strong></td>
            <td>${pxA.horaLlegada}</td>
            <td>${pxB.horaLlegada}</td>
          </tr>
          <tr>
            <td><strong>Saturación de Oxígeno (SpO2)</strong></td>
            <td>${pxA.spo2}% ${pxA.spo2 < 92 ? '(Hipoxemia severa <92%)' : '(Normal >=92%)'}</td>
            <td>${pxB.spo2}% ${pxB.spo2 < 92 ? '(Hipoxemia severa <92%)' : '(Normal >=92%)'}</td>
          </tr>
          <tr>
            <td><strong>Antecedentes Relevantes</strong></td>
            <td>${pxA.antecedentesRegistrados ? 'SÍ (Factor de riesgo)' : 'NO'}</td>
            <td>${pxB.antecedentesRegistrados ? 'SÍ (Factor de riesgo)' : 'NO'}</td>
          </tr>
          <tr>
            <td><strong>Prioridad Asignada (Decisión 1)</strong></td>
            <td><strong>Prioridad ${pxA.prioridad}</strong> (${pxA.prioridad === 1 ? 'Crítico' : 'Moderado'})</td>
            <td><strong>Prioridad ${pxB.prioridad}</strong> (${pxB.prioridad === 1 ? 'Crítico' : 'Moderado'})</td>
          </tr>
        </table>
      </div>

      <div class="report-section-doc">
        <h4>3. Resolución Algorítmica y Asignación de Cama (Decisión 2)</h4>
        <div style="background: #f8fafc; padding: 12px; border-left: 4px solid #0284c7; margin: 8px 0;">
          <p><strong>Cama Asignada a:</strong> ${asignado.nombre} (Prioridad ${asignado.prioridad})</p>
          <p><strong>Servicio de Destino:</strong> ${obtenerEspecialidad(asignado.prioridad)}</p>
          <p><strong>Fundamento de Decisión:</strong> ${justificacion}</p>
        </div>
        <p style="margin-top: 8px;"><strong>Paciente en Espera:</strong> ${enEspera.nombre} (Prioridad ${enEspera.prioridad}) derivado a área de monitoreo continuo y soporte mientras se gestiona cupo adicional.</p>
      </div>

      <div class="report-signatures">
        <div class="signature-box">
          <p><strong>Lic. / Médico de Triaje</strong></p>
          <p>Colegio Médico / Enfermeros</p>
        </div>
        <div class="signature-box">
          <p><strong>Estudiante / Evaluador UPP</strong></p>
          <p>Pensamiento Algorítmico - Ciclo II</p>
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
