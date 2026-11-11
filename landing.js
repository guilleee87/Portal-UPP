/**
 * PORTAL TECNOLÓGICO UPP — CONTROLADOR DE TELEMETRÍA Y SISTEMAS
 * Universidad Politécnica del Perú | Facultad de Ciencias de la Salud — Enfermería
 * Autores (Desarrolladores): Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
 */

const SUPABASE_CONFIG = {
  url: "https://fvgogdgxfmxupyegeuzp.supabase.co",
  key: "sb_publishable_mFaj4X5VLMkI3hkBZvA9Zw_TeeNFbFm"
};

document.addEventListener("DOMContentLoaded", () => {
  initDropdownMenu();
  initLiveClock();
  initSupabaseTelemetry();
  initMinsaMatrixTabs();
  initModals();
});

/* --------------------------------------------------------------------------
   1. MENÚ DESPLEGABLE SUPERIOR IZQUIERDO
   -------------------------------------------------------------------------- */
function initDropdownMenu() {
  const triggerBtn = document.getElementById("dropdownTrigger");
  const dropdownMenu = document.getElementById("dropdownMenu");

  if (!triggerBtn || !dropdownMenu) return;

  triggerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isExpanded = triggerBtn.getAttribute("aria-expanded") === "true";
    toggleMenu(!isExpanded);
  });

  document.addEventListener("click", (e) => {
    if (!dropdownMenu.contains(e.target) && !triggerBtn.contains(e.target)) {
      toggleMenu(false);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      toggleMenu(false);
      closeAllModals();
    }
  });

  function toggleMenu(show) {
    if (show) {
      dropdownMenu.classList.add("show");
      triggerBtn.classList.add("active");
      triggerBtn.setAttribute("aria-expanded", "true");
    } else {
      dropdownMenu.classList.remove("show");
      triggerBtn.classList.remove("active");
      triggerBtn.setAttribute("aria-expanded", "false");
    }
  }
}

/* --------------------------------------------------------------------------
   2. RELOJ DIGITAL EN VIVO (HORA LIMA UTC-5)
   -------------------------------------------------------------------------- */
function initLiveClock() {
  const clockEl = document.getElementById("liveNavClock");
  function updateClock() {
    const now = new Date();
    const options = {
      timeZone: "America/Lima",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    };
    const timeStr = new Intl.DateTimeFormat("es-PE", options).format(now);
    if (clockEl) {
      clockEl.textContent = `${timeStr} (UTC-5)`;
    }
  }
  updateClock();
  setInterval(updateClock, 1000);
}

/* --------------------------------------------------------------------------
   3. TELEMETRÍA SUPABASE CLOUD (PING EN VIVO Y CONTEO DE PACIENTES)
   -------------------------------------------------------------------------- */
async function initSupabaseTelemetry() {
  const pillStatus = document.getElementById("supabasePillText");
  const countEl = document.getElementById("kpiHcCount");
  const pingEl = document.getElementById("kpiLatency");
  const dotEl = document.getElementById("supabaseDot");

  const start = performance.now();
  try {
    const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?select=id,nombre_completo,identificador,historia_clinica,tipo_seguro,prioridad`, {
      method: "GET",
      headers: {
        "apikey": SUPABASE_CONFIG.key,
        "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
        "Content-Type": "application/json"
      }
    });

    const latency = Math.round(performance.now() - start);

    if (res.ok) {
      const records = await res.json();
      window.__SUPABASE_CACHE = records;

      if (pillStatus) pillStatus.textContent = `Supabase Online (${latency}ms)`;
      if (pingEl) pingEl.textContent = `${latency} ms`;
      if (countEl) countEl.textContent = `${records.length} Reg.`;
      if (dotEl) {
        dotEl.style.backgroundColor = "var(--accent-emerald)";
        dotEl.style.boxShadow = "0 0 10px var(--accent-emerald)";
      }
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("Supabase Cloud offline or unreachable:", err);
    if (pillStatus) pillStatus.textContent = "Supabase Standby (Local Sync)";
    if (pingEl) pingEl.textContent = "Local";
    if (countEl) countEl.textContent = "7+ Demo";
    if (dotEl) {
      dotEl.style.backgroundColor = "var(--accent-amber)";
      dotEl.style.boxShadow = "0 0 8px var(--accent-amber)";
    }
  }
}

/* --------------------------------------------------------------------------
   4. MODALES: BÚSQUEDA RÁPIDA DE HISTORIAS CLÍNICAS & MATRIZ MINSA
   -------------------------------------------------------------------------- */
function initModals() {
  // Modal HC
  const btnOpenHc = document.getElementById("btnOpenHcSearch");
  const modalHc = document.getElementById("modalHcSearch");
  const btnCloseHc = document.getElementById("btnCloseHcSearch");
  const searchInput = document.getElementById("inputSearchModal");

  if (btnOpenHc && modalHc) {
    btnOpenHc.addEventListener("click", () => {
      modalHc.classList.add("show");
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
        renderSearchResults("");
      }
    });
  }

  if (btnCloseHc) {
    btnCloseHc.addEventListener("click", () => modalHc.classList.remove("show"));
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      renderSearchResults(e.target.value.trim().toLowerCase());
    });
  }

  // Modal MINSA
  const btnOpenMinsa = document.getElementById("btnOpenMinsaMatrix");
  const modalMinsa = document.getElementById("modalMinsaMatrix");
  const btnCloseMinsa = document.getElementById("btnCloseMinsaMatrix");

  if (btnOpenMinsa && modalMinsa) {
    btnOpenMinsa.addEventListener("click", () => modalMinsa.classList.add("show"));
  }
  if (btnCloseMinsa) {
    btnCloseMinsa.addEventListener("click", () => modalMinsa.classList.remove("show"));
  }

  // Cerrar al clickear backdrop
  [modalHc, modalMinsa].forEach(modal => {
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("show");
      });
    }
  });
}

function closeAllModals() {
  document.querySelectorAll(".tech-modal-overlay").forEach(m => m.classList.remove("show"));
}

/* Renderizado del Buscador Rápido */
function renderSearchResults(query) {
  const container = document.getElementById("modalSearchResults");
  if (!container) return;

  const records = window.__SUPABASE_CACHE || [
    { identificador: "72948512", nombre_completo: "Carlos Mendoza Ramos", historia_clinica: "HC-2024-00891", tipo_seguro: "SIS", prioridad: "Prioridad I" },
    { identificador: "48291054", nombre_completo: "María Elena Paredes Ríos", historia_clinica: "HC-2024-00892", tipo_seguro: "EPS Pacífico", prioridad: "Prioridad II" },
    { identificador: "10938475", nombre_completo: "Juan Alberto Quispe Huamán", historia_clinica: "HC-2024-00893", tipo_seguro: "EsSalud", prioridad: "Prioridad III" },
    { identificador: "08392174", nombre_completo: "Rosa Angélica Chávez Soto", historia_clinica: "HC-2024-00894", tipo_seguro: "SOAT", prioridad: "Prioridad II" },
    { identificador: "NN-449102", nombre_completo: "PACIENTE NO IDENTIFICADO NN", historia_clinica: "HC-TEMP-EMG-001", tipo_seguro: "Ley de Emergencia", prioridad: "Prioridad I" }
  ];

  const filtered = records.filter(p => {
    if (!query) return true;
    const dni = String(p.identificador || "").toLowerCase();
    const hc = String(p.historia_clinica || "").toLowerCase();
    const nom = String(p.nombre_completo || "").toLowerCase();
    return dni.includes(query) || hc.includes(query) || nom.includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
        No se encontraron historias clínicas que coincidan con "<strong>${query}</strong>".
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="patient-result-card">
      <div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <strong style="color: #ffffff; font-size: 0.95rem;">${item.nombre_completo}</strong>
          <span style="font-size: 0.7rem; font-family: var(--font-mono); background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 6px; border-radius: 4px;">${item.historia_clinica || 'HC-PEND'}</span>
        </div>
        <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 14px;">
          <span>DNI/ID: <strong style="color: #cbd5e1;">${item.identificador}</strong></span>
          <span>Seguro: <strong style="color: #cbd5e1;">${item.tipo_seguro || 'SIS'}</strong></span>
          <span>Prioridad: <strong style="color: #34d399;">${item.prioridad || 'P1'}</strong></span>
        </div>
      </div>
      <div>
        <a href="triaje_full.html" class="btn-launch-secondary" style="padding: 6px 14px; font-size: 0.78rem;">
          Abrir en HIS →
        </a>
      </div>
    </div>
  `).join("");
}

/* --------------------------------------------------------------------------
   5. TABS INTERACTIVAS MATRIZ MINSA
   -------------------------------------------------------------------------- */
const MINSA_DATA = {
  1: {
    title: "Prioridad I — Resucitación (Rojo)",
    tiempo: "Atención Inmediata (0 minutos)",
    condiciones: "Paro cardiorrespiratorio, politraumatismo severo, shock hipovolémico/séptico, insuficiencia respiratoria aguda catastrófica, coma profundo (Glasgow < 8).",
    destino: "Unidad de Shock Trauma / Reanimación Inmediata."
  },
  2: {
    title: "Prioridad II — Emergencia Crítica (Naranja)",
    tiempo: "Tiempo máximo de espera: < 10 minutos",
    condiciones: "Dolor torácico isquémico sugestivo de IAM, sepsis con signos de alarma, ACV agudo en ventana de trombolisis, disnea severa (SpO2 < 88%), crisis asmática severa.",
    destino: "Tópico de Emergencia de Alta Complejidad / Vigilancia Crítica."
  },
  3: {
    title: "Prioridad III — Urgencia Mayor (Amarillo)",
    tiempo: "Tiempo máximo de espera: < 30 minutos",
    condiciones: "Abdomen agudo quirúrgico sospechoso, cólico nefrítico intratable, fracturas cerradas sin compromiso neurovascular, hipertensión arterial sintomática con cefalea severa.",
    destino: "Tópico de Medicina / Cirugía de Urgencia."
  },
  4: {
    title: "Prioridad IV — Urgencia Menor (Verde)",
    tiempo: "Tiempo máximo de espera: < 60 minutos",
    condiciones: "Heridas superficiales que requieren sutura simple, esguinces de extremidades, fiebre sin foco de descompensación hemodinámica, diarrea sin deshidratación severa.",
    destino: "Consulta Rápida de Urgencias Menores."
  },
  5: {
    title: "Prioridad V — No Urgente (Azul / Blanco)",
    tiempo: "Tiempo máximo de espera: < 120 minutos",
    condiciones: "Cuadros respiratorios altos leves, dolor crónico sin variación aguda, retiro de puntos, solicitud de certificados o recetas no urgentes.",
    destino: "Triaje Derivado a Consulta Externa Ambulatoria."
  }
};

function initMinsaMatrixTabs() {
  const tabBtns = document.querySelectorAll(".minsa-tab-btn");
  const contentBox = document.getElementById("minsaTabContent");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const pNum = btn.getAttribute("data-p");
      const info = MINSA_DATA[pNum];
      if (info && contentBox) {
        contentBox.innerHTML = `
          <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <strong style="font-size: 1.1rem; color: #ffffff;">${info.title}</strong>
            <span style="font-family: var(--font-mono); font-size: 0.78rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 4px 10px; border-radius: 4px;">⏱️ ${info.tiempo}</span>
          </div>
          <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 12px;">
            <strong style="color: #cbd5e1;">Criterios Clínicos:</strong> ${info.condiciones}
          </div>
          <div style="font-size: 0.88rem; color: var(--accent-emerald);">
            <strong style="color: #cbd5e1;">Área Destino:</strong> ${info.destino}
          </div>
        `;
      }
    });
  });
}
