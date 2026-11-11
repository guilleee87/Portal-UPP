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

  const ident = paciente.identificador || "";
  const nom = paciente.nombre_completo || ident;
  const hc = paciente.historia_clinica || "";
  const seguro = paciente.tipo_seguro || "EsSalud";

  // Cargar en el input principal
  const inputIdent = document.getElementById("ident_full");
  if (inputIdent) inputIdent.value = ident;

  // Actualizar STATE
  STATE.identificador = `${nom} (ID ${ident})`;
  STATE.historiaClinica = hc;
  STATE.nombreReniec = nom;
  STATE.estadoRegistrado = "Si";
  STATE.accionHc = `Seleccionado desde BD: ${nom} (${hc})`;
  STATE.alertaPnpSs = false;

  // Actualizar indicadores visuales de HC
  const badgeEl = document.getElementById("hc_badge_estado");
  if (badgeEl) {
    badgeEl.textContent = "Si (En BD)";
    badgeEl.className = "badge-estado badge-si";
  }
  const codeEl = document.getElementById("hc_code_display");
  if (codeEl) codeEl.textContent = hc;
  const accEl = document.getElementById("hc_accion_display");
  if (accEl) accEl.textContent = `Paciente autenticado: ${nom} -> HC ${hc} recuperada de BD`;

  // Ocultar alerta NN
  const alertaNn = document.getElementById("alerta_nn");
  if (alertaNn) alertaNn.classList.remove("visible");

  // Mostrar panel de RENIEC con datos
  const panelReniec = document.getElementById("apisperu_panel");
  if (panelReniec) {
    panelReniec.innerHTML = `
      <div class="apisperu-title">✅ Paciente Seleccionado desde Base de Datos</div>
      <div class="apisperu-result" style="font-size:1.1rem;font-weight:800;color:#166534;">${nom}</div>
      <div style="font-size:0.8rem;color:#475569;margin-top:4px;">
        <strong>DNI/ID:</strong> ${ident} | <strong>Historia Clínica:</strong> ${hc} | <strong>Seguro Registrado:</strong> ${seguro}
      </div>
    `;
    panelReniec.classList.add("visible");
  }

  // Asignar seguro correspondiente si existe
  if (seguro) {
    actualizarSeguroConsolidado(seguro);
    STATE.tipoSeguro = seguro;
    if (seguro.toLowerCase().includes("essalud")) {
      activarTabSeguro("essalud", document.querySelectorAll(".seguro-tab")[1]);
    } else if (seguro.toLowerCase().includes("sis")) {
      activarTabSeguro("sis", document.querySelectorAll(".seguro-tab")[0]);
    } else if (seguro.toLowerCase().includes("soat")) {
      activarTabSeguro("soat", document.querySelectorAll(".seguro-tab")[2]);
    } else if (seguro.toLowerCase().includes("eps")) {
      activarTabSeguro("eps", document.querySelectorAll(".seguro-tab")[3]);
    }
  }

  // Asignar ticket y hora actual
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
  modal.style.display = "flex";

  const inputModal = document.getElementById("modal_search_hc_input");
  if (inputModal) {
    inputModal.value = "";
    inputModal.focus();
  }

  cargarTablaCatalogoHC("");
}

function cerrarModalConsultaHC() {
  const modal = document.getElementById("modal_consulta_hc");
  if (modal) modal.style.display = "none";
}

async function cargarTablaCatalogoHC(filtro = "") {
  const tbody = document.getElementById("modal_hc_table_body");
  const countEl = document.getElementById("modal_hc_total_count");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:18px;color:#64748b;">⏳ Cargando registros desde Supabase y base local...</td></tr>`;

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

  // 3. Fallback memoria
  if (registros.length === 0) {
    const fLow = filtro.toLowerCase();
    registros = Object.entries(BASE_DATOS_HC)
      .filter(([k, v]) => !filtro || k.includes(fLow) || v.toLowerCase().includes(fLow))
      .map(([k, v], idx) => ({
        id: idx + 1,
        identificador: k,
        nombre_completo: k.toUpperCase(),
        historia_clinica: v,
        tipo_seguro: "Asegurado",
        ticket: `T-0${idx + 1}`
      }));
  }

  catalogoHcCache = registros;
  if (countEl) countEl.textContent = `${registros.length} registros`;

  if (registros.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">No se encontraron coincidencias para "${filtro}".</td></tr>`;
    return;
  }

  let htmlRows = "";
  registros.forEach((r, idx) => {
    const ident = r.identificador || "—";
    const nom = r.nombre_completo || ident;
    const hc = r.historia_clinica || "—";
    const seg = r.tipo_seguro || "Sin seguro";
    const tck = r.ticket || "—";
    const pJson = encodeURIComponent(JSON.stringify(r));

    htmlRows += `
      <tr>
        <td style="font-weight:700;color:#64748b;">${idx + 1}</td>
        <td><strong style="color:#0f172a;">${nom}</strong></td>
        <td><code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;color:#0284c7;">${ident}</code></td>
        <td><span class="hc-pill-tag">${hc}</span></td>
        <td><span class="hc-pill-seguro">${seg}</span></td>
        <td><strong>${tck}</strong></td>
        <td style="white-space:nowrap; text-align:center;">
          <div style="display:flex; gap:6px; justify-content:center;">
            <button type="button" class="btn-full-primary" style="padding:5px 10px;font-size:0.75rem;background:#16a34a;border:none;border-radius:6px;cursor:pointer;"
              title="Cargar al simulador de triaje" onclick="seleccionarPacienteDeBusqueda('${pJson}')">
              ✓ Cargar
            </button>
            <button type="button" class="btn-full-secondary" style="padding:5px 10px;font-size:0.75rem;background:#f8fafc;border:1.5px solid #0284c7;color:#0284c7;border-radius:6px;cursor:pointer;"
              title="Visualizar expediente completo" onclick="visualizarHistoriaClinica('${pJson}')">
              👁️ Ver
            </button>
            <button type="button" class="btn-full-secondary" style="padding:5px 10px;font-size:0.75rem;background:#ffffff;border:1.5px solid #475569;color:#334155;border-radius:6px;cursor:pointer;"
              title="Imprimir ficha oficial de historia clínica" onclick="imprimirFichaHistoriaClinica('${pJson}')">
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

  const pacienteNN = {
    identificador: "NN PACIENTE DESCONOCIDO",
    nombre_completo: `NN DESCONOCIDO (${nroHcTemp})`,
    historia_clinica: nroHcTemp,
    tipo_seguro: "Por calificar (Ley 27604)",
    estado_bd: "Por confirmar",
    ticket: turnoTemp,
    hora_llegada: horaActual
  };

  const inputIdent = document.getElementById("ident_full");
  if (inputIdent) inputIdent.value = pacienteNN.identificador;

  const inputHora = document.getElementById("hora_full");
  if (inputHora) inputHora.value = horaActual;

  STATE.identificador = pacienteNN.identificador;
  STATE.historiaClinica = nroHcTemp;
  STATE.nombreReniec = pacienteNN.nombre_completo;
  STATE.estadoRegistrado = "Por confirmar";
  STATE.accionHc = `Identidad no confirmada → Se abre ${nroHcTemp} (Notificación emitida a PNP y Servicio Social)`;
  STATE.alertaPnpSs = true;
  STATE.turno = turnoTemp;
  STATE.horaLlegada = horaActual;

  // Actualizar indicadores
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

  const telHc = document.getElementById("telemetry_hc_val");
  if (telHc) telHc.textContent = nroHcTemp;
  const telId = document.getElementById("telemetry_ident_val");
  if (telId) telId.textContent = "NN DESCONOCIDO";

  // Registrar en memoria y sincronizar con base de datos
  BASE_DATOS_HC[pacienteNN.identificador.toLowerCase()] = nroHcTemp;
  try {
    persistirBaseDatosLocal(pacienteNN.identificador, nroHcTemp, pacienteNN.nombre_completo);
  } catch (e) {}

  alert(`🚨 ADMISIÓN DE PACIENTE NN REGISTRADA CON ÉXITO\n\n` +
        `• Historia Clínica Temporal: ${nroHcTemp}\n` +
        `• Ticket de Atención: ${turnoTemp}\n` +
        `• Alerta PNP/Servicio Social: Activa\n\n` +
        `Por mandato de la Ley N° 27604 de Emergencia, el sistema lo deriva inmediatamente a Triaje Clínico (Módulo 3) para salvaguardar su vida.`);
  
  irAModulo(3);
}

// ---------------------------------------------------------------------------
// VISUALIZACIÓN DETALLADA E IMPRESIÓN DE HISTORIAS CLÍNICAS DESDE CATÁLOGO
// ---------------------------------------------------------------------------
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
  const seg = p.tipo_seguro || "EsSalud / SIS / Particular";
  const tck = p.ticket || "T-01";
  const prio = p.prioridad || "Evaluada en Triaje Clínico";
  const fecha = p.fecha_registro ? new Date(p.fecha_registro).toLocaleString() : new Date().toLocaleDateString();

  body.innerHTML = `
    <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:18px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0284c7;padding-bottom:10px;margin-bottom:12px;">
        <div>
          <span style="font-size:0.75rem;font-weight:800;color:#0284c7;text-transform:uppercase;letter-spacing:1px;">EXPEDIENTE DE HISTORIA CLÍNICA</span>
          <h2 style="margin:2px 0 0;font-size:1.3rem;font-weight:900;color:#0f172a;">${nom}</h2>
        </div>
        <div style="text-align:right;">
          <span class="hc-pill-tag" style="font-size:1.05rem;padding:6px 14px;background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc;">${hc}</span>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px;">Folio Registrado en BD</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;font-size:0.84rem;">
        <div><strong>DNI / Identificador:</strong> <code style="background:#ffffff;padding:2px 6px;border-radius:4px;border:1px solid #e2e8f0;">${ident}</code></div>
        <div><strong>Seguro Acreditado:</strong> <span class="hc-pill-seguro">${seg}</span></div>
        <div><strong>Fecha de Alta/Registro:</strong> ${fecha}</div>
        <div><strong>Ticket Asignado:</strong> <strong>${tck}</strong></div>
        <div><strong>Prioridad Clínica:</strong> <span style="font-weight:800;color:#0284c7;">${prio}</span></div>
        <div><strong>Estado en Base de Datos:</strong> <span class="badge-estado badge-si">Autenticado / Activo</span></div>
      </div>
    </div>

    <!-- ANTECEDENTES Y RESUMEN ASISTENCIAL -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;font-size:0.82rem;">
        <h4 style="margin:0 0 6px;font-size:0.85rem;color:#1e293b;">📋 Antecedentes Médicos Registrados:</h4>
        <ul style="margin:0;padding-left:18px;color:#475569;line-height:1.5;">
          <li>Sin antecedentes de alergia severa a contraste.</li>
          <li>Cobertura médica validada en plataforma SUSALUD/PIDE.</li>
          <li>Historia Clínica digital disponible para interconsulta médica.</li>
        </ul>
      </div>

      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;font-size:0.82rem;">
        <h4 style="margin:0 0 6px;font-size:0.85rem;color:#1e293b;">🛡️ Protocolo y Derechos del Paciente:</h4>
        <div style="color:#475569;line-height:1.5;">
          Amparado por la <strong>Ley N° 27604</strong> y la <strong>Ley General de Salud N° 26842</strong>. Confidencialidad protegida según Ley N° 29733 de Protección de Datos Personales.
        </div>
      </div>
    </div>
  `;

  // Botón para cargar en el modal
  const btnCargar = document.getElementById("btn_modal_cargar_paciente");
  if (btnCargar) {
    btnCargar.onclick = () => {
      document.getElementById("modal_visualizar_hc").style.display = "none";
      seleccionarPacienteDeBusqueda(pacienteEncoded);
    };
  }

  const btnImprimir = document.getElementById("btn_modal_imprimir_hc");
  if (btnImprimir) {
    btnImprimir.onclick = () => {
      imprimirFichaHistoriaClinica(pacienteEncoded);
    };
  }

  modal.style.display = "flex";
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
  const seg = p.tipo_seguro || "EsSalud / SIS / Particular";
  const tck = p.ticket || "T-01";
  const fecha = p.fecha_registro ? new Date(p.fecha_registro).toLocaleString() : new Date().toLocaleString();

  const printHtml = `
    <html><head><title>Historia Clínica — ${hc}</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; padding: 35px; max-width: 800px; margin: auto; color: #0f172a; line-height: 1.5; font-size: 13px; }
      .header-hc { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #0284c7; padding-bottom: 14px; margin-bottom: 20px; }
      .inst-info h2 { margin: 0; font-size: 1.25rem; color: #0f172a; font-weight: 900; }
      .inst-info p { margin: 2px 0 0; font-size: 0.8rem; color: #64748b; font-weight: 600; }
      .hc-badge { border: 2px solid #0284c7; background: #e0f2fe; color: #0369a1; padding: 6px 16px; border-radius: 8px; font-size: 1.15rem; font-weight: 900; text-align: center; font-family: monospace; }
      .section-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
      .section-title { font-size: 0.85rem; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 10px; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
      .field label { font-size: 0.72rem; color: #64748b; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 2px; }
      .field span { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
      .firma-box { margin-top: 50px; display: flex; justify-content: space-around; text-align: center; }
      .firma-line { border-top: 1px solid #0f172a; width: 220px; padding-top: 6px; font-size: 0.78rem; font-weight: 700; }
    </style></head>
    <body>
      <div class="header-hc">
        <div class="inst-info">
          <h2>UNIVERSIDAD POLITÉCNICA DEL PERÚ — FCS</h2>
          <p>Departamento de Emergencia y Cuidados Críticos · Hospital Docente UPP</p>
          <p style="color:#0284c7;font-weight:700;">EXPEDIENTE CLÍNICO DE ADMISIÓN HOSPITALARIA</p>
        </div>
        <div>
          <div class="hc-badge">${hc}</div>
          <div style="font-size:0.75rem;text-align:center;color:#64748b;margin-top:4px;">N° REGISTRO HIS</div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-title">I. Filiación y Datos de Identificación</div>
        <div class="grid-3">
          <div class="field"><label>Apellidos y Nombres</label><span>${nom}</span></div>
          <div class="field"><label>Documento de Identidad</label><span>DNI ${ident}</span></div>
          <div class="field"><label>Ticket de Turno</label><span>${tck}</span></div>
          <div class="field"><label>Régimen de Aseguramiento</label><span>${seg}</span></div>
          <div class="field"><label>Fecha y Hora de Admisión</label><span>${fecha}</span></div>
          <div class="field"><label>Procedencia / Establecimiento</label><span>Servicio de Urgencias UPP</span></div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-title">II. Anamnesis y Evaluación Inicial de Triaje</div>
        <div class="grid-2">
          <div class="field"><label>Motivo de Ingreso</label><span>Atención de emergencia médica / Evaluación de signos vitales</span></div>
          <div class="field"><label>Prioridad Asignada</label><span style="color:#dc2626;">${p.prioridad || "Prioridad I / II / III (Evaluación Dinámica)"}</span></div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-title">III. Marco Legal y Derechos Asistenciales</div>
        <p style="font-size:0.78rem;color:#475569;margin:0;">
          Atención brindada en estricto cumplimiento de la <strong>Ley N° 27604</strong> (Atención médica de emergencia sin condicionamiento a pago ni acreditación previa). Paciente clasificado en el Sistema de Triaje Fisiológico según Resolución Ministerial N° 292-2006/MINSA.
        </p>
      </div>

      <div class="firma-box">
        <div>
          <div class="firma-line">Lic. Enfermería de Admisión / Triaje<br>Colegio de Enfermeros del Perú</div>
        </div>
        <div>
          <div class="firma-line">Médico Emergentólogo de Turno<br>Colegio Médico del Perú</div>
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
  // Módulo 1
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

  // Módulo 2
  tipoSeguro: null,
  validacionManual: null,
  numerFua: null,
  acreditadoEsSalud: null,
  porcentajeCopago: null,

  // Módulo 3
  spo2: null, fc: null, pasSistolica: null, paDiastolica: null,
  fr: null, temperatura: null, glucosa: null, glasgow: null, eva: 0,
  antecedentes: false,
  motivoConsulta: "",
  prioridad: null, // número romano: "I", "II", "III", "IV", "V"
  colorPrioridad: null,

  // Módulo 4
  camaAsignada: null,

  // Factura
  items_factura: [],

  // Módulo 7
  rutaActual: 0,
  estadoSalida: null,
  firmante: null,
  firmaTiempo: null,

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
  const rawInput = document.getElementById("ident_full") ? document.getElementById("ident_full").value.trim() : "";
  const token = (document.getElementById("apiToken") ? document.getElementById("apiToken").value.trim() : "") || DEFAULT_APISPERU_TOKEN;
  const panel = document.getElementById("apisperu_panel");

  if (!rawInput) {
    if (panel) {
      panel.innerHTML = `<div class="apisperu-title">⚠️ Por favor ingrese un número de DNI de 8 dígitos primero.</div>`;
      panel.classList.add("visible");
    }
    return;
  }

  // Extraer 8 dígitos continuos (permite espacios o guiones accidentales)
  const dniMatch = rawInput.replace(/[\s\.\-]/g, "").match(/\d{8}/);
  if (!dniMatch) {
    if (panel) {
      panel.innerHTML = `<div class="apisperu-title">⚠️ El valor ingresado no contiene un DNI válido de 8 dígitos.</div>`;
      panel.classList.add("visible");
    }
    return;
  }

  const ident = dniMatch[0];

  if (panel) {
    panel.innerHTML = `<div class="apisperu-title">⏳ Consultando RENIEC en tiempo real para DNI ${ident}...</div>`;
    panel.classList.add("visible");
  }

  try {
    const url = `https://dniruc.apisperu.com/api/v1/dni/${ident}?token=${token}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && (data.nombres || (data.data && data.data.nombres))) {
      const payload = data.data || data;
      const primerNombre = (payload.nombres || "").split(" ")[0].toUpperCase();
      const nombreCompleto = `${payload.nombres} ${payload.apellidoPaterno} ${payload.apellidoMaterno}`.trim();
      
      // Auto-detección inteligente de sexo biológico a partir del nombre
      const nombresFemeninos = ["MARIA", "ANA", "CARMEN", "ROSA", "LUZ", "ISABEL", "GLORIA", "HERMELINDA", "ALFONSINA", "TERESA", "JULIA", "ELENA", "PATRICIA", "SILVIA", "DIANA", "CLAUDIA", "PAOLA", "ANDREA", "CAROLINA", "RUTH", "LIDIA", "MIRIAM", "VERONICA", "BEATRIZ", "MONICA"];
      let sexoDetectado = "M";
      if (primerNombre.endsWith("A") || primerNombre.endsWith("IA") || nombresFemeninos.includes(primerNombre)) {
        sexoDetectado = "F";
      }
      
      // Actualizar estado del paciente
      STATE.nombreReniec = nombreCompleto;
      STATE.identificador = `${nombreCompleto} (DNI ${ident})`;
      STATE.sexo = sexoDetectado;

      // Autollenar campos en el cuadro de Datos Clínicos y Demográficos (100% EDITABLES)
      const elSexo = document.getElementById("sexo_full");
      if (elSexo) elSexo.value = sexoDetectado;

      // Si la API retorna fecha (o si ya el usuario digitó una), calcular edad real
      if (payload.fechaNacimiento || payload.fecha_nacimiento) {
        const fNac = payload.fechaNacimiento || payload.fecha_nacimiento;
        const elFechaNac = document.getElementById("fecha_nac_full");
        if (elFechaNac) {
          elFechaNac.value = fNac;
          calcularEdadDesdeFecha();
        }
      }

      // Despliegue de ficha oficial con lo que RENIEC realmente provee por ley
      panel.innerHTML = `
        <div class="apisperu-title">✅ Datos Oficiales RENIEC Verificados (APISPERU)</div>
        <div class="apisperu-result" style="font-size: 1.15rem; font-weight: 800; color: #166534; margin-bottom: 6px;">
          ${nombreCompleto}
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; font-size: 0.82rem; background: #ffffff; padding: 12px; border-radius: 8px; border: 1.5px solid #bbf7d0;">
          <div><strong style="color:#15803d;">DNI:</strong> ${ident}</div>
          <div><strong style="color:#15803d;">Dígito Verif.:</strong> ${payload.codVerifica || "-"} (${payload.codVerificaLetra || ""})</div>
          <div><strong style="color:#15803d;">Sexo transferido:</strong> ${sexoDetectado === "F" ? "Femenino (F)" : "Masculino (M)"}</div>
          <div><strong style="color:#15803d;">Estado RENIEC:</strong> Identidad autenticada</div>
          <div style="grid-column: 1 / -1; font-size: 0.76rem; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 6px; margin-top: 2px;">
            ℹ️ <em>Por Ley de Protección de Datos Personales, la API pública de RENIEC solo devuelve nombres y apellidos. La fecha de nacimiento y edad se ingresan o ajustan en el formulario de abajo y son 100% editables.</em>
          </div>
        </div>
      `;

      // Asociar a Base de Datos en sesión
      BASE_DATOS_HC[ident] = STATE.historiaClinica;
      BASE_DATOS_HC[nombreCompleto.toLowerCase()] = STATE.historiaClinica;
      
      document.getElementById("hc_accion_display").textContent = `DNI ${ident} autenticado en RENIEC -> ${STATE.historiaClinica} (${nombreCompleto})`;

      // El seguro queda pendiente hasta que el usuario resuelva el CAPTCHA en el Módulo 2
      actualizarSeguroConsolidado("Sin consultar (Pendiente de Acreditación con CAPTCHA)");
      STATE.tipoSeguro = null;
      const boxPideInit = document.getElementById("pide_acreditacion_box");
      if (boxPideInit) boxPideInit.style.display = "none";

      // Preservar la fluidez de entrada sin robar el foco del usuario
      const elFechaNacFocus = document.getElementById("fecha_nac_full");
    } else {
      throw new Error(data.message || "No se encontraron nombres asociados a este DNI en RENIEC.");
    }
  } catch (err) {
    if (err.name === "AbortError") {
      panel.innerHTML = `
        <div class="apisperu-title">⏱️ Tiempo de espera agotado — Fallback Offline</div>
        <div class="apisperu-result">DNI: ${ident} (Simulación activa)</div>
        <div style="font-size:0.75rem;color:#065f46;margin-top:4px;">
          El servidor tardó más de 6 segundos. Se continuó en modo autónomo sin bloquear la admisión.
        </div>
      `;
    } else {
      panel.innerHTML = `
        <div class="apisperu-title">❌ Error al consultar RENIEC</div>
        <div class="apisperu-error">${err.message}. Verifique su conexión a internet.</div>
      `;
    }
  }
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
  const ident = (elIdent ? elIdent.value.trim() : "");
  const elEntidad = document.getElementById("entidad_consulta_seguro");
  const entidad = (elEntidad ? elEntidad.value : "auto").toLowerCase();

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

  // 1. Si hay sesión activa con el servidor Python
  if (captchaSesionActual && captchaSesionActual.token !== "local") {
    try {
      const fNacInput = document.getElementById("fecha_nac_full");
      const sexoInput = document.getElementById("sexo_full");
      const resp = await fetch("/api/seguro/consultar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: captchaSesionActual.token,
          captcha_input: codigoIngresado,
          identificador: ident,
          entidad: entidad,
          nombre: STATE.nombreReniec || "",
          fecha_nacimiento: fNacInput ? fNacInput.value : "",
          sexo: sexoInput ? sexoInput.value : (STATE.sexo || "M"),
          cod_verifica: STATE.codVerifica || ""
        })
      });
      const data = await resp.json();
      if (!data.exito) {
        mostrarMensajeCaptcha(data.error, "error");
        refrescarCaptchaSeguro();
        return;
      }

      mostrarMensajeCaptcha(`✅ CAPTCHA Validado con éxito — Consulta Acreditada en ${data.tipo_seguro || "SUSALUD"}`, "success");
      procesarResultadoAcreditacion(data, ident);
      return;
    } catch (e) {
      // Fallback a modo local
    }
  }

  // 2. Validación en Modo Local Autónomo
  if (!captchaSesionActual || codigoIngresado !== captchaSesionActual.codigo.toUpperCase()) {
    mostrarMensajeCaptcha(`El código '${codigoIngresado}' no coincide con la imagen. Intente con el nuevo código generado.`, "error");
    refrescarCaptchaSeguro();
    return;
  }

  // Helper local para resolver centro de salud por prefijo DNI
  const resolverCentroLocal = (numDni) => {
    const prefijo = (numDni || "").slice(0, 2);
    if (["70", "71", "72", "73", "74", "75", "76", "77", "78", "79"].includes(prefijo)) {
      return {
        essalud: "Hospital Nacional Guillermo Almenara Irigoyen (Red Almenara - RENAES 00003503)",
        ipress: "Hospital Nacional Guillermo Almenara Irigoyen",
        sis: "C.S. San Fernando (Red de Salud Lima Centro - RENAES 00000412)",
        renaes: "00000412"
      };
    } else if (["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].includes(prefijo)) {
      return {
        essalud: "Hospital Nacional Edgardo Rebagliati Martins (Red Rebagliati - RENAES 00003502)",
        ipress: "Hospital Nacional Edgardo Rebagliati Martins",
        sis: "Hospital de Emergencias Villa El Salvador (RENAES 00002891)",
        renaes: "00002891"
      };
    } else if (["40", "41", "42", "43", "44", "45", "46", "47", "48", "49"].includes(prefijo)) {
      return {
        essalud: "Hospital Nacional Alberto Sabogal Sologuren (Red Sabogal - RENAES 00003504)",
        ipress: "Hospital Nacional Alberto Sabogal Sologuren",
        sis: "Hospital Nacional Cayetano Heredia (RENAES 00001045)",
        renaes: "00001045"
      };
    } else if (["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"].includes(prefijo)) {
      return {
        essalud: "Hospital Nacional Carlos Alberto Seguín Escobedo (Red Arequipa - RENAES 00005401)",
        ipress: "Hospital Nacional Carlos Alberto Seguín Escobedo",
        sis: "Hospital Regional Honorio Delgado Espinoza (RENAES 00005402)",
        renaes: "00005402"
      };
    }
    return {
      essalud: "Hospital de Alta Complejidad Virgen de la Puerta (Red La Libertad - RENAES 00006210)",
      ipress: "Hospital de Alta Complejidad Virgen de la Puerta",
      sis: "Hospital Belén de Trujillo (RENAES 00006211)",
      renaes: "00006211"
    };
  };

  // Helper local para autogenerado oficial EsSalud
  const calcularAutogenLocal = (numDni, nombre, fecNac, sexo) => {
    let aa = "70", mm = "05", dd = "15";
    if (fecNac && fecNac.length === 10) {
      aa = fecNac.slice(2, 4);
      mm = fecNac.slice(5, 7);
      dd = fecNac.slice(8, 10);
    } else if (numDni && numDni.length >= 2) {
      const val = parseInt(numDni.slice(0, 2), 10);
      aa = String((val % 40) + 60).padStart(2, "0");
    }
    const sCod = (sexo && sexo.toUpperCase().startsWith("F")) ? "0" : "1";
    const partes = (nombre || "PACIENTE APELLIDO MATERNO").trim().toUpperCase().split(/\s+/);
    const nom = partes[0] || "N";
    const ap1 = partes.length >= 2 ? partes[partes.length - 2] : "A";
    const ap2 = partes.length >= 3 ? partes[partes.length - 1] : "M";
    const c1 = ap1[0] || "A";
    const c2 = ap2[0] || "M";
    const c3 = ap1[1] || "X";
    const c4 = nom[0] || "N";
    const sufijo = numDni.length >= 3 ? numDni.slice(-3) : "001";
    return `${aa}${mm}${dd}${sCod}${c1}${c2}${c3}${c4}${sufijo}`;
  };

  // Helper local determinístico persistente para asignación de seguro
  const obtenerSeguroDeterministicoLocal = (dni, identTexto = "") => {
    const dniLimpio = String(dni || "").replace(/\D/g, "");
    const clave = "seguro_asignado_" + dniLimpio;
    try {
      const guardado = localStorage.getItem(clave);
      if (guardado) return guardado;
    } catch (e) {}

    // Casos clínicos de prueba oficiales
    if (dniLimpio === "10203040" || identTexto.includes("px a") || identTexto.includes("mendoza")) {
      try { localStorage.setItem(clave, "sis"); } catch (e) {}
      return "sis";
    }
    if (dniLimpio === "70809010" || identTexto.includes("px b") || identTexto.includes("torres")) {
      try { localStorage.setItem(clave, "essalud"); } catch (e) {}
      return "essalud";
    }
    if (identTexto.includes("soat")) {
      try { localStorage.setItem(clave, "soat"); } catch (e) {}
      return "soat";
    }

    // Hash matemático determinístico del DNI
    let h = 0;
    for (let i = 0; i < dniLimpio.length; i++) {
      h = (h * 31 + dniLimpio.charCodeAt(i)) % 10007;
    }
    const mod = Math.abs(h) % 100;
    let tipo = "essalud";
    if (mod < 45) {
      tipo = "sis";        // 45% SIS
    } else if (mod < 85) {
      tipo = "essalud";    // 40% EsSalud
    } else if (mod < 92) {
      tipo = "eps";        // 7% EPS Privada
    } else if (mod < 96) {
      tipo = "soat";       // 4% SOAT Accidente
    } else {
      tipo = "particular"; // 4% Particular
    }

    try { localStorage.setItem(clave, tipo); } catch (e) {}
    return tipo;
  };

  // Resolver acreditación según entidad seleccionada e identidad
  const identLimpio = ident.toLowerCase();
  const dniMatch = ident.match(/\d{8}/);
  const numDni = dniMatch ? dniMatch[0] : "70809010";
  const fNacVal = document.getElementById("fecha_nac_full") ? document.getElementById("fecha_nac_full").value : "";
  const sexoVal = document.getElementById("sexo_full") ? document.getElementById("sexo_full").value : (STATE.sexo || "M");
  const nombrePac = STATE.nombreReniec || "HERMELINDA ANTONIO VILLANUEVA";

  const centroLocal = resolverCentroLocal(numDni);
  const autogenLocal = calcularAutogenLocal(numDni, nombrePac, fNacVal, sexoVal);
  const fuaLocal = `${centroLocal.renaes}-2026-00${numDni.slice(-6)}`;

  let resultado = {};

  let tipoResuelto = entidad;
  if (!tipoResuelto || tipoResuelto === "auto") {
    tipoResuelto = obtenerSeguroDeterministicoLocal(numDni, identLimpio);
  }

  const esEsSalud = (tipoResuelto === "essalud");
  const esSis = (tipoResuelto === "sis");
  const esSoat = (tipoResuelto === "soat");
  const esEps = (tipoResuelto === "eps");
  const esParticular = (tipoResuelto === "particular");

  if (esEsSalud) {
    resultado = {
      tipo_seguro: "EsSalud",
      estado: "ACREDITADO ACTIVO",
      plan: "Titular Regular — D.L. 728 / Cobertura Integral Nivel III",
      centro_adscrito: centroLocal.essalud,
      ipress: centroLocal.ipress,
      autogenerado: autogenLocal,
      vigencia: "Activa hasta 31/12/2026",
      prestacion_especial: "Cobertura de Sepelio / Fallecimiento (Activa)",
      copago: "S/. 0.00 (Exoneración Institucional EsSalud)"
    };
  } else if (esSis) {
    resultado = {
      tipo_seguro: "SIS",
      estado: "AFILIADO ACTIVO",
      plan: "SIS Gratuito (Ley N° 30885 - Aseguramiento Universal)",
      centro_adscrito: centroLocal.sis,
      fua: fuaLocal,
      vigencia: "Indefinida (Activo)",
      copago: "S/. 0.00 (Exoneración 100% de gasto)"
    };
  } else if (esSoat) {
    resultado = {
      tipo_seguro: "SOAT",
      estado: "PÓLIZA ACTIVA",
      plan: "SOAT Accidente de Tránsito (Tope 5 UIT / S/. 26,000)",
      aseguradora: "La Positiva Seguros",
      placa: `B${numDni.slice(-2)}-${numDni.slice(-3)}`,
      copago: "Hasta S/. 26,000 según Ley N° 27181"
    };
  } else if (esEps) {
    resultado = {
      tipo_seguro: "EPS",
      estado: "PÓLIZA PRIVADA ACTIVA",
      plan: "EPS Pacífico Salud / Plan Integral Familiar",
      copago: "20% deducible ambulatorio / hospitalario",
      copago_pct: 20
    };
  } else if (esParticular) {
    resultado = {
      tipo_seguro: "No asegurado (Particular)",
      estado: "NO REGISTRA SEGURO ACTIVO",
      plan: "Particular / No Asegurado (Tarifario Hospitalario Estándar)",
      centro_adscrito: "Sin adscripción pública en SUSALUD / PIDE",
      ley_27604: "Aplica gratuidad solo si es clasificado en Prioridad I o II (Emergencia con riesgo vital)",
      copago: "100% a cargo del paciente o responsable",
      mensaje: "El paciente no figura afiliado en el padrón activo de SIS ni EsSalud."
    };
  } else {
    resultado = {
      tipo_seguro: "EsSalud",
      estado: "ACREDITADO ACTIVO",
      plan: "Titular Regular — D.L. 728 / Cobertura Integral Nivel III",
      centro_adscrito: centroLocal.essalud,
      ipress: centroLocal.ipress,
      autogenerado: autogenLocal,
      vigencia: "Activa hasta 31/12/2026",
      prestacion_especial: "Cobertura de Sepelio / Fallecimiento (Activa)",
      copago: "S/. 0.00 (Exoneración Institucional EsSalud)"
    };
  }

  mostrarMensajeCaptcha(`✅ CAPTCHA Validado con éxito — Consulta Acreditada en ${resultado.tipo_seguro}`, "success");
  procesarResultadoAcreditacion(resultado, ident);
}

function procesarResultadoAcreditacion(datos, ident) {
  const box = document.getElementById("pide_acreditacion_box");
  const grid = document.getElementById("pide_detalles_grid");
  const titulo = document.getElementById("pide_tipo_titulo");
  const badgeEstado = document.getElementById("pide_badge_estado");
  const bannerAuto = document.getElementById("banner_autollenado_seguro");

  if (!box || !grid) return;
  box.style.display = "block";
  if (bannerAuto) bannerAuto.style.display = "block";

  // Función auxiliar para resaltar inputs autollenados con borde y fondo verde de validación
  const marcarAutollenado = (el) => {
    if (!el) return;
    el.style.borderColor = "#10b981";
    el.style.backgroundColor = "#f0fdf4";
  };

  if (datos.tipo_seguro === "EsSalud") {
    STATE.tipoSeguro = "EsSalud";
    STATE.acreditadoEsSalud = true;
    titulo.textContent = "ACREDITACIÓN PIDE — EsSalud (Seguro Social de Salud)";
    badgeEstado.textContent = "ACREDITADO ACTIVO";
    badgeEstado.style.background = "#10b981";

    const centroMostrar = datos.centro_adscrito || "Hospital Nacional Guillermo Almenara Irigoyen";
    const autogenMostrar = datos.autogenerado || "9505150AVNH010";

    grid.innerHTML = `
      <div><strong>Asegurado:</strong> ${datos.plan || "Titular Regular"}</div>
      <div><strong>Centro Asistencial:</strong> ${centroMostrar}</div>
      <div><strong>Autogenerado:</strong> <span style="font-family:monospace;font-weight:800;color:#38bdf8;">${autogenMostrar}</span></div>
      <div><strong>Vigencia:</strong> ${datos.vigencia || "Activa hasta 31/12/2026"}</div>
      <div><strong style="color:#6ee7b7;">Prestación Especial:</strong> ${datos.prestacion_especial || "Cobertura de Sepelio Activa"}</div>
      <div><strong>Copago:</strong> ${datos.copago || "S/. 0.00"}</div>
    `;

    // 1. AUTOLLENAR AUTOMÁTICAMENTE TODAS LAS CELDAS DE ABAJO
    const elEstadoEsSalud = document.getElementById("estado_essalud");
    const elIpressEsSalud = document.getElementById("ipress_essalud");
    const elResEsSalud = document.getElementById("resultado_essalud");
    const elResSusalud = document.getElementById("res_susalud");
    const elDivSusalud = document.getElementById("resultado_susalud");

    if (elEstadoEsSalud) {
      elEstadoEsSalud.value = "Acreditado Activo";
      marcarAutollenado(elEstadoEsSalud);
    }
    if (elIpressEsSalud) {
      elIpressEsSalud.value = datos.ipress || centroMostrar;
      marcarAutollenado(elIpressEsSalud);
    }
    if (elResEsSalud) {
      elResEsSalud.innerHTML = `
        <strong>EsSalud — Acreditado Activo | ${datos.ipress || centroMostrar}</strong>
        <span class="seguro-badge seguro-badge-essalud">✓ Autollenado PIDE</span><br>
        <span style="font-size:0.75rem;color:#64748b;">Autogenerado: ${autogenMostrar} | Copago: S/. 0.00</span>
      `;
    }
    if (elResSusalud) {
      elResSusalud.value = "EsSalud";
      marcarAutollenado(elResSusalud);
    }
    if (elDivSusalud) {
      elDivSusalud.innerHTML = `
        <strong>EsSalud (Acreditado Activo)</strong> <span class="seguro-badge seguro-badge-essalud">✓ PIDE Oficial</span>
      `;
    }

    actualizarSeguroConsolidado(`EsSalud — Acreditado Activo (${datos.ipress || centroMostrar})`);
    activarTabSeguro("essalud", document.querySelectorAll(".seguro-tab")[2]);
    return;
  }

  if (datos.tipo_seguro === "SIS") {
    STATE.tipoSeguro = "SIS";
    const numFua = datos.fua || "00000412-2026-004812";
    STATE.numerFua = numFua;
    titulo.textContent = "ACREDITACIÓN PIDE — SIS (Seguro Integral de Salud)";
    badgeEstado.textContent = "AFILIADO ACTIVO";
    badgeEstado.style.background = "#10b981";

    const centroMostrar = datos.centro_adscrito || "C.S. San Fernando (RENAES 00000412)";

    grid.innerHTML = `
      <div><strong>Plan de Cobertura:</strong> ${datos.plan || "SIS Gratuito"}</div>
      <div><strong>N° de Formato FUA:</strong> <span style="font-family:monospace;font-weight:800;color:#38bdf8;">${numFua}</span></div>
      <div><strong>Establecimiento Adscrito:</strong> ${centroMostrar}</div>
      <div><strong>Vigencia de Derechos:</strong> ${datos.vigencia || "Indefinida (Activo)"}</div>
      <div><strong style="color:#6ee7b7;">Copago:</strong> ${datos.copago || "S/. 0.00 (Exoneración 100%)"}</div>
    `;

    // 1. AUTOLLENAR AUTOMÁTICAMENTE TODAS LAS CELDAS DE ABAJO
    const elEstadoSis = document.getElementById("estado_sis");
    const elFuaSis = document.getElementById("fua_sis");
    const elResSis = document.getElementById("resultado_sis");
    const elResSusalud = document.getElementById("res_susalud");
    const elDivSusalud = document.getElementById("resultado_susalud");

    if (elEstadoSis) {
      elEstadoSis.value = "Activo-Gratuito";
      marcarAutollenado(elEstadoSis);
    }
    if (elFuaSis) {
      elFuaSis.value = numFua;
      marcarAutollenado(elFuaSis);
    }
    if (elResSis) {
      elResSis.innerHTML = `
        <strong>SIS Gratuito — ${numFua}</strong> <span class="seguro-badge seguro-badge-sis">✓ Autollenado PIDE</span><br>
        <span style="font-size:0.75rem;color:#64748b;">Establecimiento: ${centroMostrar}</span>
      `;
    }
    if (elResSusalud) {
      elResSusalud.value = "SIS";
      marcarAutollenado(elResSusalud);
    }
    if (elDivSusalud) {
      elDivSusalud.innerHTML = `
        <strong>SIS Gratuito (Afiliado Activo)</strong> <span class="seguro-badge seguro-badge-sis">✓ PIDE Oficial</span>
      `;
    }

    actualizarSeguroConsolidado(`SIS Gratuito — ${numFua} (${centroMostrar})`);
    activarTabSeguro("sis", document.querySelectorAll(".seguro-tab")[1]);
    return;
  }

  if (datos.tipo_seguro === "SOAT") {
    STATE.tipoSeguro = "SOAT";
    titulo.textContent = "ACREDITACIÓN PIDE-APESEG — PÓLIZA SOAT DE VEHÍCULO";
    badgeEstado.textContent = "PÓLIZA ACTIVA (5 UIT)";
    badgeEstado.style.background = "#10b981";

    const placaMostrar = datos.placa || "B1C-458";
    const aseguradoraMostrar = datos.aseguradora || "La Positiva";

    grid.innerHTML = `
      <div><strong>Aseguradora:</strong> ${aseguradoraMostrar}</div>
      <div><strong>Placa Vehicular:</strong> <span style="font-family:monospace;font-weight:800;color:#38bdf8;">${placaMostrar}</span></div>
      <div><strong>Plan Cobertura:</strong> ${datos.plan || "SOAT Accidente de Tránsito"}</div>
      <div><strong>Monto Límite:</strong> Hasta 5 UIT (S/. 26,000) por persona</div>
      <div><strong style="color:#6ee7b7;">Copago:</strong> S/. 0.00 hasta agotar cobertura legal</div>
    `;

    // AUTOLLENAR CELDAS SOAT
    const elPlaca = document.getElementById("placa_soat");
    const elAseg = document.getElementById("aseg_soat");
    const elResSoat = document.getElementById("resultado_soat");
    const elResSusalud = document.getElementById("res_susalud");
    const elDivSusalud = document.getElementById("resultado_susalud");

    if (elPlaca) {
      elPlaca.value = placaMostrar;
      marcarAutollenado(elPlaca);
    }
    if (elAseg) {
      elAseg.value = aseguradoraMostrar;
      marcarAutollenado(elAseg);
    }
    if (elResSoat) {
      elResSoat.innerHTML = `
        <strong>SOAT — ${aseguradoraMostrar} | Placa: ${placaMostrar}</strong>
        <span class="seguro-badge seguro-badge-soat">✓ Póliza Activa</span><br>
        <span style="font-size:0.75rem;color:#64748b;">Tope máximo de cobertura: S/. 26,000 (5 UIT)</span>
      `;
    }
    if (elResSusalud) {
      elResSusalud.value = "No asegurado";
      marcarAutollenado(elResSusalud);
    }
    if (elDivSusalud) {
      elDivSusalud.innerHTML = `
        <strong>SOAT (Póliza de Tránsito Activa)</strong> <span class="seguro-badge seguro-badge-soat">✓ APESEG</span>
      `;
    }

    actualizarSeguroConsolidado(`SOAT — ${aseguradoraMostrar} | Placa ${placaMostrar}`);
    activarTabSeguro("soat", document.querySelectorAll(".seguro-tab")[3]);
    return;
  }

  if (datos.tipo_seguro === "EPS") {
    STATE.tipoSeguro = "EPS";
    const copagoPct = datos.copago_pct || 20;
    STATE.porcentajeCopago = parseFloat(copagoPct);
    titulo.textContent = "ACREDITACIÓN PIDE-SUSALUD — EPS PRIVADA";
    badgeEstado.textContent = "PÓLIZA PRIVADA ACTIVA";
    badgeEstado.style.background = "#10b981";

    grid.innerHTML = `
      <div><strong>Aseguradora EPS:</strong> ${datos.plan || "Pacífico Salud / Plan Familiar"}</div>
      <div><strong>Copago Paciente:</strong> <span style="font-family:monospace;font-weight:800;color:#38bdf8;">${copagoPct}% deducible</span></div>
      <div><strong>Vigencia:</strong> Activa (Acreditada en Registro IAFAS)</div>
      <div><strong style="color:#6ee7b7;">Red de Clínicas:</strong> Convenio Integral Hospitalario</div>
    `;

    // AUTOLLENAR CELDAS EPS
    const elTipoEps = document.getElementById("tipo_eps");
    const elCopago = document.getElementById("pct_copago");
    const elResEps = document.getElementById("resultado_eps");
    const elResSusalud = document.getElementById("res_susalud");
    const elDivSusalud = document.getElementById("resultado_susalud");

    if (elTipoEps) {
      elTipoEps.value = "EPS";
      marcarAutollenado(elTipoEps);
    }
    if (elCopago) {
      elCopago.value = copagoPct;
      marcarAutollenado(elCopago);
    }
    toggleCopago();
    if (elResEps) {
      elResEps.innerHTML = `
        <strong>EPS Privada (${copagoPct}% copago paciente)</strong>
        <span class="seguro-badge seguro-badge-eps">✓ Póliza Verificada</span>
      `;
    }
    if (elResSusalud) {
      elResSusalud.value = "EPS";
      marcarAutollenado(elResSusalud);
    }
    if (elDivSusalud) {
      elDivSusalud.innerHTML = `
        <strong>EPS Privada (Acreditado)</strong> <span class="seguro-badge seguro-badge-eps">✓ SUSALUD</span>
      `;
    }

    actualizarSeguroConsolidado(`EPS Privada — Pacífico Salud (Copago ${copagoPct}%)`);
    activarTabSeguro("eps", document.querySelectorAll(".seguro-tab")[4]);
    return;
  }

  // PACIENTE PARTICULAR / SIN SEGURO
  STATE.tipoSeguro = "No asegurado (Particular)";
  titulo.textContent = "CONSULTA PIDE-SUSALUD — NO FIGURA AFILIACIÓN PÚBLICA";
  badgeEstado.textContent = "SIN SEGURO ACTIVO (PARTICULAR)";
  badgeEstado.style.background = "#ef4444";

  grid.innerHTML = `
    <div><strong>Estado de Afiliación:</strong> <span style="color:#f87171;font-weight:700;">No figura en padrón activo de SIS ni EsSalud</span></div>
    <div><strong>Modalidad de Atención:</strong> Particular / Pago Directo</div>
    <div><strong>Amparo Legal:</strong> Ley N° 27604 (Gratuidad condicionada solo a Prioridad I y II)</div>
    <div><strong style="color:#fca5a5;">Copago / Depósito:</strong> 100% de la tarifa hospitalaria a cargo del paciente o responsable</div>
    <div><strong>Acción Administrativa:</strong> Derivar a Asistencia Social para evaluación socioeconómica o trámite SIS</div>
  `;

  // AUTOLLENAR CELDAS PARTICULAR
  const elTipoEps = document.getElementById("tipo_eps");
  const elResEps = document.getElementById("resultado_eps");
  const elResSusalud = document.getElementById("res_susalud");
  const elDivSusalud = document.getElementById("resultado_susalud");

  if (elTipoEps) {
    elTipoEps.value = "Particular";
    marcarAutollenado(elTipoEps);
  }
  toggleCopago();
  if (elResEps) {
    elResEps.innerHTML = `
      <strong>No asegurado (Particular)</strong>
      <span class="seguro-badge seguro-badge-particular">✓ Registrado</span>
    `;
  }
  if (elResSusalud) {
    elResSusalud.value = "No asegurado";
    marcarAutollenado(elResSusalud);
  }
  if (elDivSusalud) {
    elDivSusalud.innerHTML = `
      <strong>Sin seguro público ni privado registrado</strong> <span class="seguro-badge seguro-badge-particular">✓ Verificado</span>
    `;
  }

  actualizarSeguroConsolidado("No asegurado (Particular / Sin seguro activo)");
  activarTabSeguro("eps", document.querySelectorAll(".seguro-tab")[4]);
}

function calcularTicket() {
  const inputHora = document.getElementById("hora_full");
  let hora = inputHora ? inputHora.value.trim() : "";
  if (!hora || !/^([01]?\d|2[0-3]):([0-5]\d)$/.test(hora)) {
    const ahora = new Date();
    hora = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
    if (inputHora) inputHora.value = hora;
  }
  STATE.horaLlegada = hora;
  if (!STATE.turno || STATE.turno === "—") {
    STATE.turno = "T-" + String(contadorHcNueva).padStart(2, "0");
  }
  const ticketDisplay = document.getElementById("ticket_display");
  if (ticketDisplay) {
    ticketDisplay.textContent = `🎫 Ticket asignado: ${STATE.turno} (hora: ${hora})`;
  }
  registrarTimestamp("M1_hora");
}

function imprimirAlertaNN() {
  const html = `
    <html><head><title>Alerta Identidad NN</title></head><body style="font-family:Arial;padding:40px;max-width:600px;margin:auto;">
    <h2 style="color:#c2410c;">⚠️ ALERTA — PACIENTE SIN IDENTIFICACIÓN (NN)</h2>
    <hr>
    <p><strong>Historia Clínica Temporal:</strong> ${STATE.historiaClinica}</p>
    <p><strong>Hora de Ingreso:</strong> ${STATE.horaLlegada || new Date().toLocaleTimeString()}</p>
    <p><strong>Modalidad de Llegada:</strong> ${STATE.modalidadIngreso}</p>
    <p><strong>Fecha:</strong> ${new Date().toLocaleDateString()}</p>
    <hr>
    <p>Se solicita a <strong>Servicio Social</strong> y <strong>Policía Nacional del Perú (PNP)</strong> la identificación posterior del paciente.</p>
    <p>Favor comunicar al Departamento de Emergencias con el número de HC: <strong>${STATE.historiaClinica}</strong></p>
    <br><br>
    <p>_______________________________</p>
    <p>Enfermera de Turno</p>
    <p>Servicio de Emergencias — Hospital Regional UPP</p>
    </body></html>
  `;
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  w.print();
}

// ---------------------------------------------------------------------------
// 9. MÓDULO 2 — SEGUROS
// ---------------------------------------------------------------------------
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
    min: 20,
    max: 260,
    nombre: "Frecuencia Cardíaca",
    unidad: "bpm",
    elId: "fc_full",
    cardId: "card_fc",
    errId: "error_fc_full"
  },
  pas: {
    min: 40,
    max: 280,
    nombre: "PA Sistólica",
    unidad: "mmHg",
    elId: "pas_full",
    cardId: "card_pas",
    errId: "error_pas_full"
  },
  pad: {
    min: 20,
    max: 160,
    nombre: "PA Diastólica",
    unidad: "mmHg",
    elId: "pad_full",
    cardId: "card_pad",
    errId: "error_pad_full"
  },
  fr: {
    min: 4,
    max: 60,
    nombre: "Frecuencia Respiratoria",
    unidad: "rpm",
    elId: "fr_full",
    cardId: "card_fr",
    errId: "error_fr_full"
  },
  temp: {
    min: 32.0,
    max: 43.0,
    nombre: "Temperatura Corporal",
    unidad: "°C",
    elId: "temp_full",
    cardId: "card_temp",
    errId: "error_temp_full"
  },
  glucosa: {
    min: 20,
    max: 600,
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
 * Valida en tiempo real que ningún signo vital sobrepase los rangos biológicos.
 * Si algún valor está fuera de límites, lo resalta en rojo y bloquea el flujo.
 */
function validarSignosVitalesEnVivo() {
  const errores = [];
  let primerElementoInvalido = null;

  // 1. Validar cada parámetro individual
  for (const [clave, def] of Object.entries(RANGOS_BIOLOGICOS)) {
    const el = document.getElementById(def.elId);
    const card = document.getElementById(def.cardId);
    const errBox = document.getElementById(def.errId);

    if (!el) continue;

    const raw = String(el.value || "").trim();
    if (raw === "") {
      // Campo opcional no ingresado: limpiar error
      el.classList.remove("is-invalid");
      if (card) card.classList.remove("has-error");
      if (errBox) { errBox.style.display = "none"; errBox.innerHTML = ""; }
      continue;
    }

    const val = parseFloat(raw.replace(",", "."));

    if (isNaN(val)) {
      const msg = `${def.nombre}: Valor inválido (ingrese un número).`;
      marcarCampoError(el, card, errBox, msg);
      errores.push(msg);
      if (!primerElementoInvalido) primerElementoInvalido = el;
      continue;
    }

    if (val < def.min || val > def.max) {
      const msg = `${def.nombre} = ${val} ${def.unidad} fuera de rango biológico (${def.min} a ${def.max} ${def.unidad}).`;
      marcarCampoError(el, card, errBox, msg);
      errores.push(msg);
      if (!primerElementoInvalido) primerElementoInvalido = el;
      continue;
    }

    // Parámetro correcto
    el.classList.remove("is-invalid");
    if (card) card.classList.remove("has-error");
    if (errBox) { errBox.style.display = "none"; errBox.innerHTML = ""; }
  }

  // 2. Validación cruzada de Presión Arterial: PAD < PAS
  const elPas = document.getElementById("pas_full");
  const elPad = document.getElementById("pad_full");
  const cardPad = document.getElementById("card_pad");
  const errPad = document.getElementById("error_pad_full");

  if (elPas && elPad && elPas.value.trim() !== "" && elPad.value.trim() !== "") {
    const pas = parseFloat(elPas.value.trim().replace(",", "."));
    const pad = parseFloat(elPad.value.trim().replace(",", "."));
    if (!isNaN(pas) && !isNaN(pad) && pas >= 40 && pas <= 280 && pad >= 20 && pad <= 160) {
      if (pad >= pas) {
        const msg = `PA Diastólica (${pad} mmHg) no puede ser mayor o igual a la Sistólica (${pas} mmHg).`;
        marcarCampoError(elPad, cardPad, errPad, msg);
        errores.push(msg);
        if (!primerElementoInvalido) primerElementoInvalido = elPad;
      }
    }
  }

  // 3. Actualizar UI de banner superior y botón de evaluación
  const banner = document.getElementById("banner_error_vitales");
  const bannerDetalles = document.getElementById("banner_error_vitales_detalles");
  const btnEval = document.getElementById("btn_evaluar_full");

  const esValido = (errores.length === 0);

  if (!esValido) {
    if (banner) {
      banner.classList.add("visible");
      if (bannerDetalles) {
        bannerDetalles.innerHTML = `<ul style="margin:4px 0 0 16px;padding:0;color:#991b1b;font-weight:700;">` +
          errores.map(e => `<li>⚠️ ${e}</li>`).join("") + `</ul>`;
      }
    }
    if (btnEval) {
      btnEval.classList.add("blocked-by-error");
      btnEval.innerHTML = "⛔ Triaje Bloqueado (Valores Fuera de Rango)";
    }
  } else {
    if (banner) banner.classList.remove("visible");
    if (btnEval) {
      btnEval.classList.remove("blocked-by-error");
      btnEval.innerHTML = "⚡ Evaluar Triaje Completo";
    }
  }

  return { esValido, errores, primerCampoInvalido: primerElementoInvalido };
}

function marcarCampoError(el, card, errBox, mensaje) {
  if (el) el.classList.add("is-invalid");
  if (card) card.classList.add("has-error");
  if (errBox) {
    errBox.style.display = "flex";
    errBox.innerHTML = `<span>⚠️</span><span>${mensaje}</span>`;
  }
}

function mostrarErrorBiologicoEnPrioridad(errores) {
  const pd = document.getElementById("prioridad_display");
  if (!pd) return;
  pd.className = "prioridad-display visible";
  pd.style.background = "#fff1f2";
  pd.style.borderColor = "#ef4444";
  pd.style.borderWidth = "3px";

  document.getElementById("prio_numero").textContent = "❌";
  document.getElementById("prio_numero").className = "prioridad-numero";
  document.getElementById("prio_numero").style.color = "#dc2626";

  document.getElementById("prio_color_name").textContent = "PARÁMETRO INVÁLIDO";
  document.getElementById("prio_color_name").style.color = "#dc2626";

  document.getElementById("prio_tipo").textContent = "⛔ ERROR DE VALIDACIÓN BIOLÓGICA";
  document.getElementById("prio_tipo").style.color = "#dc2626";

  document.getElementById("prio_desc").innerHTML = `
    <strong>El flujo de triaje está bloqueado preventivamente por seguridad clínica.</strong><br>
    Se ingresaron valores fuera del rango fisiológico compatible con la vida o de medición de instrumentos:<br>
    <ul style="margin: 6px 0 0 18px; padding: 0; color: #991b1b; font-size: 0.85rem;">
      ${errores.map(e => `<li>${e}</li>`).join("")}
    </ul>
    <span style="display:inline-block; margin-top:6px; font-weight:700; color:#b91c1c;">
      Corrija los campos en rojo para desbloquear la asignación de prioridad, camas y facturación.
    </span>
  `;

  document.getElementById("prio_destino").textContent = "⛔ FLUJO HOSPITALARIO DETENIDO";
  document.getElementById("prio_destino").style.color = "#dc2626";

  const ley = document.getElementById("ley27604_banner");
  if (ley) ley.classList.remove("visible");

  STATE.prioridad = null;
  STATE.colorPrioridad = "Inválido";
}

function cargarPresetVitales(tipo) {
  if (tipo === "normal") {
    document.getElementById("spo2_full").value = "98";
    document.getElementById("fc_full").value = "76";
    document.getElementById("pas_full").value = "120";
    document.getElementById("pad_full").value = "80";
    document.getElementById("fr_full").value = "16";
    document.getElementById("temp_full").value = "36.6";
    document.getElementById("glucosa_full").value = "95";
    document.getElementById("glasgow_full").value = "15";
    syncEva(1);
    document.getElementById("motivo_full").value = "Cefalea leve matutina sin signos de alarma";
    document.getElementById("ant_cardio").checked = false;
    document.getElementById("ant_resp").checked = false;
    document.getElementById("ant_diab").checked = false;
    document.getElementById("ant_neuro").checked = false;
  } else if (tipo === "critico") {
    document.getElementById("spo2_full").value = "86";
    document.getElementById("fc_full").value = "142";
    document.getElementById("pas_full").value = "75";
    document.getElementById("pad_full").value = "45";
    document.getElementById("fr_full").value = "32";
    document.getElementById("temp_full").value = "39.8";
    document.getElementById("glucosa_full").value = "48";
    document.getElementById("glasgow_full").value = "10";
    syncEva(9);
    document.getElementById("motivo_full").value = "Insuficiencia respiratoria aguda y shock séptico";
    document.getElementById("ant_cardio").checked = true;
    document.getElementById("ant_resp").checked = true;
  } else if (tipo === "invalido") {
    // Caso de prueba docente para demostrar la detección de error biológico y bloqueo de flujo
    document.getElementById("spo2_full").value = "130";  // > 100%
    document.getElementById("fc_full").value = "350";    // > 260 bpm
    document.getElementById("pas_full").value = "110";
    document.getElementById("pad_full").value = "140";   // PAD > PAS
    document.getElementById("fr_full").value = "85";     // > 60 rpm
    document.getElementById("temp_full").value = "48.5"; // > 43.0 °C
    document.getElementById("glucosa_full").value = "850"; // > 600 mg/dL
    document.getElementById("glasgow_full").value = "20"; // > 15 pts
    syncEva(10);
    document.getElementById("motivo_full").value = "Simulación de artefacto y parámetros fuera de límites biológicos";
  }
  recalcularPrioridad();
}

function syncEva(val, fromNum = false) {
  document.getElementById("eva_range").value = val;
  document.getElementById("eva_full").value = val;
  const labels = ["Sin dolor", "Leve", "Leve", "Leve", "Moderado", "Moderado",
    "Moderado", "Severo", "Severo", "Severo", "Máximo"];
  document.getElementById("eva_label").textContent = labels[Math.round(val)] || "";
  STATE.eva = parseInt(val) || 0;
  recalcularPrioridad();
}

function recalcularPrioridad() {
  // 1. Validar estrictamente los signos vitales antes de cualquier cálculo clínico
  const validacion = validarSignosVitalesEnVivo();
  if (!validacion.esValido) {
    mostrarErrorBiologicoEnPrioridad(validacion.errores);
    return;
  }

  // Leer valores
  const spo2 = parseFloat(document.getElementById("spo2_full").value) || null;
  const fc = parseFloat(document.getElementById("fc_full").value) || null;
  const pas = parseFloat(document.getElementById("pas_full").value) || null;
  const pad = parseFloat(document.getElementById("pad_full").value) || null;
  const fr = parseFloat(document.getElementById("fr_full").value) || null;
  const temp = parseFloat(document.getElementById("temp_full").value) || null;
  const glucosa = parseFloat(document.getElementById("glucosa_full").value) || null;
  const glasgow = parseFloat(document.getElementById("glasgow_full").value) || null;
  const eva = parseInt(document.getElementById("eva_full").value) || 0;
  const motivo = document.getElementById("motivo_full").value.toLowerCase();

  const antCardio = document.getElementById("ant_cardio").checked;
  const antResp = document.getElementById("ant_resp").checked;
  const antDiab = document.getElementById("ant_diab").checked;
  const antNeuro = document.getElementById("ant_neuro").checked;
  const antecedentes = antCardio || antResp || antDiab || antNeuro;

  STATE.spo2 = spo2; STATE.fc = fc; STATE.pasSistolica = pas;
  STATE.paDiastolica = pad; STATE.fr = fr; STATE.temperatura = temp;
  STATE.glucosa = glucosa; STATE.glasgow = glasgow; STATE.eva = eva;
  STATE.antecedentes = antecedentes;
  STATE.motivoConsulta = document.getElementById("motivo_full").value;

  // Determinar prioridad (I → V en orden)
  let prio = null;

  const tieneDatos = spo2 !== null || fc !== null || pas !== null || glasgow !== null;

  if (tieneDatos || antecedentes) {
    // PRIORIDAD I — ROJO (Emergencia Vital)
    const esCritico = (
      (spo2 !== null && spo2 < 92) ||
      (fc !== null && (fc >= 130 || fc < 40)) ||
      (pas !== null && pas < 90) ||
      (pas !== null && pas >= 160 && (motivo.includes("torác") || motivo.includes("pecho"))) ||
      (glasgow !== null && glasgow <= 12) ||
      (glucosa !== null && glucosa < 50) ||
      (antecedentes && spo2 !== null && spo2 < 94) ||
      (antecedentes && fc !== null && fc > 110)
    );
    if (esCritico) { prio = "I"; }

    // PRIORIDAD II — NARANJA (Urgencia Mayor)
    if (!prio) {
      const esUrgente = (
        eva >= 8 ||
        (fr !== null && fr > 25) ||
        (temp !== null && temp > 39.5) ||
        (spo2 !== null && spo2 >= 92 && spo2 < 95) ||
        (pas !== null && pas >= 160) ||
        (glucosa !== null && glucosa < 70)
      );
      if (esUrgente) { prio = "II"; }
    }

    // PRIORIDAD III — AMARILLO (Urgencia Menor / Compatible con Caso 6)
    if (!prio) {
      const esModerado = (
        (spo2 !== null && spo2 >= 92) ||
        antecedentes ||
        (eva >= 4 && eva < 8) ||
        (motivo.includes("dolor") && motivo.length > 5)
      );
      if (esModerado) { prio = "III"; }
    }

    // PRIORIDAD IV — VERDE (Urgencia Leve)
    if (!prio) {
      const esLeve = (
        (spo2 !== null && spo2 >= 97) ||
        eva <= 4
      );
      if (esLeve) { prio = "IV"; }
    }
  }

  // Si no hay datos suficientes → PRIORIDAD V
  if (!prio) { prio = tieneDatos ? "IV" : "V"; }

  // Si hay datos básicos (spo2 y antecedentes) pero no hay más → mantener lógica base P1/P3
  if (!tieneDatos && antecedentes) { prio = "I"; }

  STATE.prioridad = prio;
  STATE.colorPrioridad = PRIORIDADES[prio].nombre;

  mostrarPrioridad(prio);
  renderizarRutaClinica(prio);
  registrarTimestamp("M3_triage");
}

function mostrarPrioridad(prio) {
  const pd = document.getElementById("prioridad_display");
  const def = PRIORIDADES[prio];
  pd.className = `prioridad-display visible prioridad-${prio}`;
  pd.style.background = "";
  pd.style.borderColor = "";
  pd.style.borderWidth = "";

  document.getElementById("prio_numero").textContent = prio;
  document.getElementById("prio_numero").className = `prioridad-numero ${def.clase}`;
  document.getElementById("prio_color_name").textContent = `● ${["Rojo","Naranja","Amarillo","Verde","Azul"][["I","II","III","IV","V"].indexOf(prio)]}`;
  document.getElementById("prio_color_name").style.color = def.hex;
  document.getElementById("prio_tipo").textContent = def.nombre;
  document.getElementById("prio_tipo").style.color = def.hex;
  document.getElementById("prio_desc").textContent = obtenerDescripcionPrioridad(prio);
  document.getElementById("prio_destino").textContent = `Destino: ${def.destino}`;
  document.getElementById("prio_destino").style.color = def.hex;

  // Ley 27604
  const ley = document.getElementById("ley27604_banner");
  ley.classList.toggle("visible", prio === "I" || prio === "II");

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
  const esPublico = seguro.includes("essalud") || seguro.includes("sis") || seguro.includes("soat");
  const esEpsPrivado = seguro.includes("eps") || seguro.includes("privad") || seguro.includes("rimac") || 
                       seguro.includes("pacifico") || seguro.includes("sanitas") || seguro.includes("mapfre") || 
                       seguro.includes("positiva");
  const esParticular = !esPublico && !esEpsPrivado;

  const esEmergencia = (STATE.prioridad === "I" || STATE.prioridad === "II");
  const esUrgencia = (STATE.prioridad === "III" || STATE.prioridad === "IV" || STATE.prioridad === "V");

  const totalBruto = STATE.items_factura.reduce((s, i) => s + (parseFloat(i.costo) || 0), 0);
  const subtotalFarmacia = STATE.items_factura
    .filter(i => (i.categoria || "").toLowerCase().includes("farmacia"))
    .reduce((s, i) => s + (parseFloat(i.costo) || 0), 0);
  const subtotalServicios = Math.max(0, totalBruto - subtotalFarmacia);

  let lugarAtencion = "Hospital Regional Docente UPP (Red Pública / MINSA / EsSalud)";
  let coberturaSeguro = 0;
  let coaseguroFarmacia = 0;
  let copagoUrgencia = 0;
  let totalPaciente = 0;
  let motivoLiquidacion = "";
  let etiquetaRegimen = "";

  if (esEpsPrivado) {
    lugarAtencion = "Clínica Privada Especializada (Red Prestacional Privada EPS / Seguro de Salud)";
    if (esEmergencia) {
      // Emergencia Vital: Atención médica 100% cubierta (S/. 0.00), Farmacia 10% coaseguro
      coaseguroFarmacia = subtotalFarmacia * 0.10;
      copagoUrgencia = 0;
      coberturaSeguro = subtotalServicios + (subtotalFarmacia * 0.90);
      totalPaciente = coaseguroFarmacia;
      etiquetaRegimen = "Clínica Privada EPS · Emergencia Vital (Ley 27604)";
      motivoLiquidacion = "EMERGENCIA CON RIESGO VITAL (P-I / P-II). En clínica privada EPS, la atención clínica, procedimientos, exámenes y estancia están cubiertos al 100% por la aseguradora (S/. 0.00). En medicamentos de farmacia, el paciente asume únicamente el 10% de coaseguro.";
    } else {
      // Urgencia o no emergencia: Copago fijo de S/. 80.00 + 10% coaseguro de farmacia
      copagoUrgencia = 80.00;
      coaseguroFarmacia = subtotalFarmacia * 0.10;
      totalPaciente = copagoUrgencia + coaseguroFarmacia;
      coberturaSeguro = Math.max(0, totalBruto - totalPaciente);
      etiquetaRegimen = "Clínica Privada EPS · Atención de Urgencia (P-III / IV / V)";
      motivoLiquidacion = "ATENCIÓN DE URGENCIA AMBULATORIA EN CLÍNICA PRIVADA EPS. Aplica deducible institucional fijo de S/. 80.00 por consulta de urgencia + coaseguro del 10% en farmacia. El excedente es cubierto por la póliza EPS.";
    }
  } else if (esPublico) {
    lugarAtencion = "Hospital Regional Docente UPP (Red Asistencial EsSalud / MINSA-SIS)";
    coberturaSeguro = totalBruto;
    coaseguroFarmacia = 0;
    copagoUrgencia = 0;
    totalPaciente = 0.00; // PAGO CERO ASUMIDO POR SEGURO
    etiquetaRegimen = seguro.includes("essalud") ? "EsSalud (Asegurado Regular)" : (seguro.includes("soat") ? "SOAT (Fondo Accidentes)" : "SIS Gratuito (MINSA)");
    motivoLiquidacion = "COBERTURA TOTAL INTEGRAL 100%. Por acreditación de seguro estatal vigente (EsSalud / SIS / SOAT), el seguro asume el 100% de los exámenes, estancia, procedimientos y medicinas. PAGO A CARGO DEL PACIENTE: S/. 0.00.";
  } else {
    // Particular
    lugarAtencion = "Hospital Regional Docente UPP — Atención Particular";
    coberturaSeguro = 0;
    coaseguroFarmacia = subtotalFarmacia;
    copagoUrgencia = 0;
    totalPaciente = totalBruto;
    etiquetaRegimen = "Particular (Sin Seguro Activo)";
    motivoLiquidacion = esEmergencia 
      ? "ATENCIÓN DE EMERGENCIA VITAL SIN PAGO PREVIO (Ley N° 27604). Atención médica inmediata garantizada sin condicionamiento económico. Liquidación de gastos diferida al egreso."
      : "Paciente no cuenta con cobertura aseguradora activa. Liquidación a tarifa hospitalaria particular completa.";
  }

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
    esEpsPrivado,
    esPublico,
    esParticular,
    esEmergencia,
    esUrgencia
  };
}

function confirmarFarmacia() {
  const checks = document.querySelectorAll("#farmaciaGrid input:checked");
  if (checks.length === 0) {
    alert("⚠️ Por favor seleccione al menos un medicamento del catálogo para despachar.");
    return;
  }
  let itemsAgregados = 0;
  checks.forEach(ch => {
    const nom = ch.getAttribute("data-nombre");
    const costo = parseFloat(ch.getAttribute("data-costo")) || 0;
    registrarFacturaItem(nom, costo, "Farmacia");
    itemsAgregados++;
  });
  alert(`✅ ${itemsAgregados} medicamento(s) confirmado(s) por el Servicio de Farmacia y cargado(s) formalmente a la cuenta del paciente.`);
  registrarTimestamp("M6_farmacia");
  avanzarRuta(1);
}

function actualizarFactura() {
  const container = document.getElementById("factura_items");
  const totalEl = document.getElementById("factura_total_num");
  const leyBanner = document.getElementById("factura_ley27604");
  if (!container) return;

  const liq = calcularLiquidacionSeguro();

  if (STATE.items_factura.length === 0) {
    container.innerHTML = `
      <div style="font-size:0.75rem;color:#0284c7;font-weight:700;margin-bottom:4px;">🏥 ${liq.lugarAtencion}</div>
      <div style="text-align:center;color:#64748b;font-size:0.8rem;padding:12px 0;">Sin servicios registrados aún en el episodio.</div>
    `;
    if (totalEl) totalEl.textContent = "0.00";
    return;
  }

  let htmlItems = `
    <div style="padding:6px 10px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;margin-bottom:8px;font-size:0.75rem;">
      <div style="font-weight:800;color:#166534;">🏥 ${liq.lugarAtencion}</div>
      <div style="color:#15803d;font-weight:600;margin-top:2px;">Régimen: ${liq.etiquetaRegimen}</div>
    </div>
  `;

  STATE.items_factura.forEach(item => {
    htmlItems += `
      <div class="factura-item" style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #e2e8f0;font-size:0.78rem;">
        <span class="factura-item-name" style="color:#334155;">${item.servicio} <em style="color:#64748b;font-size:0.7rem;">(${item.categoria})</em></span>
        <span class="factura-item-costo" style="font-weight:700;color:#0f172a;">S/. ${item.costo.toFixed(2)}</span>
      </div>
    `;
  });

  // Desglose de liquidación financiera
  htmlItems += `
    <div style="margin-top:10px;padding-top:8px;border-top:1.5px solid #cbd5e1;font-size:0.78rem;">
      <div style="display:flex;justify-content:space-between;color:#475569;margin-bottom:3px;">
        <span>Subtotal Facturado:</span>
        <span style="font-weight:700;">S/. ${liq.totalBruto.toFixed(2)}</span>
      </div>
  `;

  if (liq.esPublico) {
    htmlItems += `
      <div style="display:flex;justify-content:space-between;color:#15803d;font-weight:700;margin-bottom:3px;">
        <span>Cobertura Seguro Estatal (100%):</span>
        <span>- S/. ${liq.coberturaSeguro.toFixed(2)}</span>
      </div>
    `;
  } else if (liq.esEpsPrivado) {
    htmlItems += `
      <div style="display:flex;justify-content:space-between;color:#0284c7;font-weight:700;margin-bottom:3px;">
        <span>Cobertura Plan EPS:</span>
        <span>- S/. ${liq.coberturaSeguro.toFixed(2)}</span>
      </div>
    `;
    if (liq.copagoUrgencia > 0) {
      htmlItems += `
        <div style="display:flex;justify-content:space-between;color:#b45309;margin-bottom:3px;">
          <span>Copago Fijo Urgencia (P-III/IV/V):</span>
          <span style="font-weight:700;">+ S/. ${liq.copagoUrgencia.toFixed(2)}</span>
        </div>
      `;
    }
    if (liq.subtotalFarmacia > 0) {
      htmlItems += `
        <div style="display:flex;justify-content:space-between;color:#b45309;margin-bottom:3px;">
          <span>Coaseguro Farmacia EPS (10% de S/. ${liq.subtotalFarmacia.toFixed(2)}):</span>
          <span style="font-weight:700;">+ S/. ${liq.coaseguroFarmacia.toFixed(2)}</span>
        </div>
      `;
    }
  }

  htmlItems += `
      <div style="margin-top:6px;padding:6px 8px;background:${liq.totalPaciente === 0 ? "#dcfce7" : "#fef3c7"};border-radius:6px;font-size:0.72rem;line-height:1.4;color:${liq.totalPaciente === 0 ? "#14532d" : "#78350f"};">
        ℹ️ ${liq.motivoLiquidacion}
      </div>
    </div>
  `;

  container.innerHTML = htmlItems;

  if (totalEl) {
    if (liq.totalPaciente === 0) {
      totalEl.innerHTML = `<span style="color:#16a34a;font-weight:900;">0.00 (PAGO CERO)</span>`;
    } else {
      totalEl.innerHTML = `<span style="color:#0284c7;font-weight:900;">${liq.totalPaciente.toFixed(2)}</span>`;
    }
  }

  // Ley 27604 banner
  if (leyBanner) leyBanner.style.display = liq.esEmergencia ? "block" : "none";
}

function generarFacturaPDF() {
  const validacion = validarSignosVitalesEnVivo();
  if (!validacion.esValido) {
    alert("⛔ Facturación retenida: Se detectaron parámetros de signos vitales fuera de rango biológico en el triaje.");
    return;
  }
  const fecha = new Date().toLocaleString();
  const total = STATE.items_factura.reduce((s, i) => s + i.costo, 0);
  const filas = STATE.items_factura.map(i => `
    <tr>
      <td>${i.servicio}</td>
      <td>${i.categoria}</td>
      <td style="text-align:right;">${i.costo === 0 ? "—" : `S/. ${i.costo.toFixed(2)}`}</td>
    </tr>
  `).join("");

  const html = `
    <html><head><title>Factura — ${STATE.historiaClinica}</title><style>
      body { font-family: Arial; padding: 40px; max-width: 650px; margin: auto; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #e2e8f0; padding: 8px 12px; font-size: 0.9rem; }
      th { background: #f8fafc; font-weight: 700; }
      .total-row { font-weight: 900; font-size: 1.1rem; background: #f1f5f9; }
    </style></head>
    <body>
      <h2>HOSPITAL REGIONAL — SERVICIO DE EMERGENCIAS</h2>
      <p>Universidad Politécnica del Perú (UPP) — Facultad de Ciencias de la Salud</p>
      <hr>
      <p><strong>Paciente:</strong> ${STATE.identificador || "—"} &nbsp;|&nbsp; <strong>HC:</strong> ${STATE.historiaClinica || "—"}</p>
      <p><strong>Fecha/Hora:</strong> ${fecha} &nbsp;|&nbsp; <strong>Prioridad:</strong> P-${STATE.prioridad || "—"}</p>
      <p><strong>Cobertura:</strong> ${STATE.tipoSeguro || "Sin seguro registrado"}</p>
      <table>
        <thead><tr><th>Servicio</th><th>Categoría</th><th>Costo</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr class="total-row"><td colspan="2"><strong>TOTAL</strong></td><td style="text-align:right;"><strong>S/. ${total.toFixed(2)}</strong></td></tr>
        </tfoot>
      </table>
      ${(STATE.prioridad === "I" || STATE.prioridad === "II") ?
        '<p style="margin-top:16px;padding:12px;background:#f0fdf4;border:1px solid #22c55e;border-radius:8px;font-size:0.85rem;"><strong>⚖️ Ley N° 27604:</strong> Atención de emergencia prestada sin cobro previo. Liquidación posterior a la estabilización del paciente.</p>' : ""}
      <br><br>
      <div style="display:flex;justify-content:space-between;">
        <div>_______________________<br><small>Firma del Paciente/Responsable</small></div>
        <div>_______________________<br><small>Jefe de Caja — Emergencias</small></div>
      </div>
    </body></html>
  `;

  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  w.print();
}

// ---------------------------------------------------------------------------
// 16. MÓDULO 8 — REPORTE DE AUDITORÍA
// ---------------------------------------------------------------------------
function generarReporteAuditoria() {
  const validacion = validarSignosVitalesEnVivo();
  if (!validacion.esValido) {
    alert("⛔ Reporte de auditoría bloqueado: Existen signos vitales fuera del rango biológico compatible con la vida. Corrija los valores en rojo.");
    return;
  }
  const fecha = new Date().toLocaleString();
  const total = STATE.items_factura.reduce((s, i) => s + i.costo, 0);

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
          5. FACTURA ACUMULATIVA
        </h4>
        ${STATE.items_factura.length === 0 ? "<p style='color:#94a3b8;'>Sin servicios registrados</p>" :
          STATE.items_factura.map(i => `
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f8fafc;font-size:0.82rem;">
              <span>${i.servicio} <small style="color:#94a3b8;">(${i.categoria})</small></span>
              <span style="font-weight:600;">S/. ${i.costo.toFixed(2)}</span>
            </div>
          `).join("") + `
            <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:1rem;font-weight:900;">
              <span>TOTAL</span><span>S/. ${total.toFixed(2)}</span>
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
  alert(`✅ Evaluación completada con éxito.\nPrioridad asignada: P-${STATE.prioridad} (${STATE.prioridad ? PRIORIDADES[STATE.prioridad].nombre : "—"})`);
}

// ---------------------------------------------------------------------------
// 18. IMPRIMIR BRAZALETE
// ---------------------------------------------------------------------------
function imprimirBrazalete() {
  const tienePrio = Boolean(STATE.prioridad);
  const colores = { "I": "#dc2626", "II": "#ea580c", "III": "#ca8a04", "IV": "#16a34a", "V": "#2563eb" };
  const color = tienePrio ? (colores[STATE.prioridad] || "#0f172a") : "#0284c7";
  const nombres = { 
    "I": "ROJO (CRÍTICO - EMERGENCIA VITAL)", 
    "II": "NARANJA (EMERGENCIA - URGENCIA MAYOR)", 
    "III": "AMARILLO (URGENCIA MENOR)", 
    "IV": "VERDE (URGENCIA LEVE)", 
    "V": "AZUL (NO URGENTE)" 
  };

  const alergiasInput = document.getElementById("alergias_full")?.value?.trim() || STATE.alergias || "";
  const tieneAlergias = alergiasInput && !alergiasInput.toLowerCase().includes("niega") && !alergiasInput.toLowerCase().includes("ninguna");

  const spo2Val = document.getElementById("spo2_full")?.value || "—";
  const fcVal = document.getElementById("fc_full")?.value || "—";
  const paVal = (document.getElementById("pas_full") && document.getElementById("pad_full")) 
    ? `${document.getElementById("pas_full").value}/${document.getElementById("pad_full").value}` 
    : "—";

  const liq = calcularLiquidacionSeguro();

  const html = `
    <html><head><title>Brazalete Hospitalario — ${STATE.historiaClinica || "HC"}</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
      .brazalete { width: 360px; border: 5px solid ${color}; border-radius: 20px; padding: 22px; text-align: center; background: #ffffff; box-shadow: 0 12px 30px rgba(0,0,0,0.12); }
      .inst-title { font-size: 0.82rem; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid ${color}; padding-bottom: 6px; margin-bottom: 10px; }
      .prio-num { font-size: 4rem; font-weight: 900; color: ${color}; line-height: 1; }
      .prio-label { font-size: 1.05rem; font-weight: 800; color: ${color}; text-transform: uppercase; margin-bottom: 8px; }
      .paciente-nombre { font-size: 1.15rem; font-weight: 900; color: #0f172a; margin: 8px 0 4px; }
      .hc-tag { font-size: 0.95rem; color: #0369a1; font-family: monospace; font-weight: 900; background: #e0f2fe; padding: 4px 10px; border-radius: 6px; display: inline-block; margin-bottom: 8px; }
      .alergia-box { padding: 8px 10px; border-radius: 8px; font-weight: 900; font-size: 0.85rem; margin: 8px 0; text-transform: uppercase; }
      .alergia-danger { background: #fee2e2; border: 2px solid #ef4444; color: #991b1b; }
      .alergia-ok { background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
      .consideraciones-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; font-size: 0.74rem; color: #334155; margin: 8px 0; text-align: left; line-height: 1.4; }
      .meta-info { font-size: 0.76rem; color: #475569; line-height: 1.5; margin-top: 6px; }
      .barcode-fake { height: 35px; background: repeating-linear-gradient(90deg, #000, #000 2px, #fff 2px, #fff 4px, #000 4px, #000 7px, #fff 7px, #fff 9px); margin-top: 12px; border-radius: 4px; }
    </style></head>
    <body>
      <div class="brazalete">
        <div class="inst-title">PULSERA DE ATENCIÓN Y PRIORIDAD · EMERGENCIA</div>
        
        ${tienePrio 
          ? `<div class="prio-num">P-${STATE.prioridad}</div><div class="prio-label">${nombres[STATE.prioridad] || ""}</div>` 
          : `<div style="padding:10px 0;"><span style="background:#e0f2fe;color:#0369a1;padding:6px 14px;border-radius:9999px;font-weight:800;font-size:0.85rem;">ADMISIÓN &amp; IDENTIFICACIÓN</span></div>`}
        
        <div class="paciente-nombre">${STATE.nombreReniec || STATE.identificador || "PACIENTE POR IDENTIFICAR"}</div>
        <div class="hc-tag">${STATE.historiaClinica || "HC-PROVISIONAL"}</div>

        <!-- ALERGIAS -->
        <div class="alergia-box ${tieneAlergias ? "alergia-danger" : "alergia-ok"}">
          ${tieneAlergias ? `⚠️ ALERGIA: ${alergiasInput.toUpperCase()}` : `✓ ALERGIAS: NIEGA / NINGUNA REPORTADA`}
        </div>

        <!-- DATOS CLÍNICOS A CONSIDERAR -->
        <div class="consideraciones-box">
          <strong>📋 DATOS A CONSIDERAR EN ATENCIÓN:</strong><br>
          • <strong>Signos Vitales:</strong> SpO2: ${spo2Val}% | FC: ${fcVal} lpm | PA: ${paVal} mmHg<br>
          • <strong>Destino Clínico:</strong> ${tienePrio ? (PRIORIDADES[STATE.prioridad]?.destino || "Área Crítica") : "Triaje General"}<br>
          • <strong>Establecimiento:</strong> ${liq.lugarAtencion}
        </div>

        <div class="meta-info">
          <div><strong>Ticket:</strong> ${STATE.turno || "T-01"} | <strong>Hora:</strong> ${STATE.horaLlegada || new Date().toLocaleTimeString()}</div>
          <div><strong>Régimen:</strong> ${liq.etiquetaRegimen} | <strong>Modalidad:</strong> ${STATE.modalidadIngreso || "A pie"}</div>
        </div>

        <div class="barcode-fake"></div>
        <div style="font-size:0.66rem;color:#94a3b8;margin-top:4px;">BRAZALETE MÉDICO OFICIAL IDENTIFICADO EN HIS HOSPITALARIO</div>
      </div>
    </body></html>
  `;

  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  w.print();
}

// ---------------------------------------------------------------------------
// 17. GRABACIÓN COMPLETA Y VINCULACIÓN A HISTORIA CLÍNICA
// ---------------------------------------------------------------------------
async function grabarAtencionCompleta() {
  if (!STATE.identificador || STATE.identificador.length < 2) {
    alert("⚠️ Por favor ingrese o seleccione un paciente antes de grabar la atención.");
    irAModulo(1);
    return;
  }

  const fechaActual = new Date();
  const folioAtencion = `FOLIO-${fechaActual.getFullYear()}${(fechaActual.getMonth()+1).toString().padStart(2,"0")}${fechaActual.getDate().toString().padStart(2,"0")}-${Math.floor(1000 + Math.random()*9000)}`;
  const liq = calcularLiquidacionSeguro();

  const episodioCompleto = {
    folio: folioAtencion,
    fecha_hora: fechaActual.toLocaleString(),
    identificador: STATE.identificador,
    historia_clinica: STATE.historiaClinica,
    nombre_completo: STATE.nombreReniec || STATE.identificador,
    edad: STATE.edad,
    sexo: STATE.sexo,
    alergias: document.getElementById("alergias_full")?.value?.trim() || STATE.alergias || "Ninguna reportada",
    tipo_seguro: STATE.tipoSeguro || "Particular",
    lugar_atencion: liq.lugarAtencion,
    modalidad_ingreso: STATE.modalidadIngreso || "A pie",
    ticket: STATE.turno || "T-01",
    hora_llegada: STATE.horaLlegada || fechaActual.toLocaleTimeString(),
    prioridad: STATE.prioridad ? `P-${STATE.prioridad} (${PRIORIDADES[STATE.prioridad]?.nombre})` : "Por evaluar",
    destino_clinico: STATE.prioridad ? PRIORIDADES[STATE.prioridad]?.destino : "Por asignar",
    signos_vitales: {
      spo2: document.getElementById("spo2_full")?.value || "—",
      fc: document.getElementById("fc_full")?.value || "—",
      fr: document.getElementById("fr_full")?.value || "—",
      pas: document.getElementById("pas_full")?.value || "—",
      pad: document.getElementById("pad_full")?.value || "—",
      temp: document.getElementById("temp_full")?.value || "—",
      glasgow: document.getElementById("glasgow_full")?.value || "—",
      dolor: document.getElementById("eva_full")?.value || "—"
    },
    cama_asignada: STATE.camaAsignada || "Observación Adultos",
    examenes_realizados: STATE.items_factura.filter(i => i.categoria !== "Farmacia"),
    medicamentos_despachados: STATE.items_factura.filter(i => i.categoria === "Farmacia"),
    estado_salida: STATE.estadoSalida || "En observación hospitalaria",
    firmante: STATE.firmante || "Lic. Enfermería de Turno — UPP",
    liquidacion: liq
  };

  // 1. Guardar en memoria local (Historial de Episodios UPP)
  try {
    const historial = JSON.parse(localStorage.getItem("UPP_HISTORIAL_EPISODIOS") || "[]");
    historial.unshift(episodioCompleto);
    localStorage.setItem("UPP_HISTORIAL_EPISODIOS", JSON.stringify(historial));
  } catch (e) {}

  // 2. Sincronizar en la nube de Supabase
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

  // 3. Sincronizar en base de datos SQLite local
  try {
    fetch(`/api/hc?identificador=${encodeURIComponent(STATE.identificador)}&nombre=${encodeURIComponent(STATE.nombreReniec || STATE.identificador)}`).catch(() => {});
  } catch (e) {}

  // 4. Desplegar comprobante visual de atención guardada
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
        <div><strong>Alergias:</strong> <span style="color:#b91c1c;font-weight:800;">${ep.alergias}</span></div>
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

    <div style="text-align:center;font-size:0.75rem;color:#64748b;margin-bottom:12px;">
      ✓ Atención registrada y vinculada permanentemente a la Historia Clínica <strong>${ep.historia_clinica}</strong> en Supabase Cloud y servidor local.
    </div>
  `;

  modal.style.display = "flex";
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

  // 1. Actualizar estados de botones en Navbar Superior, Stepper de Drawer y Canvas
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

  // 2. Abrir el módulo correspondiente en el Drawer Operativo
  const targetBody = document.getElementById(`body_mod${num}`);
  const targetArrow = document.getElementById(`arrow_mod${num}`);
  if (targetBody) {
    targetBody.style.display = "";
    targetBody.classList.add("open");
    if (targetArrow) targetArrow.classList.add("open");

    // Desplazar el Drawer Operativo SUAVEMENTE hacia el módulo activo (SIN desorientar la pantalla)
    try {
      const headerEl = targetBody.previousElementSibling;
      if (headerEl) {
        headerEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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
