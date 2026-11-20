/**
 * ==============================================================================
 * REDESIGN COCKPIT CLÍNICO — UPP FCS
 * redesign_cockpit.js
 * Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
 * Estándares: WCAG 2.1 AA · IEC 62366-1 · NTS N° 042-MINSA · NTS N° 139-MINSA
 * ==============================================================================
 */

(function () {
  "use strict";

  let faseActiva = 1;

  // ----------------------------------------------------------------------------
  // 1. CONSTRUCCIÓN DE LA CABINA CLÍNICA EN 3 ZONAS
  // ----------------------------------------------------------------------------
  function inicializarCockpit() {
    if (document.getElementById("cockpit_layout")) return;

    const mainContainer = document.querySelector(".main-app-container");
    if (!mainContainer) return;

    // 1.1 Inyectar Barra Superior Fija (64px)
    construirBarraSuperiorCockpit();

    // 1.2 Crear Layout Principal
    const cockpitLayout = document.createElement("div");
    cockpitLayout.id = "cockpit_layout";

    // 1.3 Columna Izquierda (Stepper 4 Fases + Posta)
    const sidebarLeft = document.createElement("aside");
    sidebarLeft.id = "cockpit_sidebar_left";
    sidebarLeft.innerHTML = `
      <div class="cockpit-stepper-card">
        <div class="cockpit-stepper-title">Fases Asistenciales (HIS)</div>
        <div class="cockpit-step-item active" id="cockpit_step_1" onclick="window.COCKPIT.irAFase(1)">
          <div class="cockpit-step-num">1</div>
          <div class="cockpit-step-info">
            <div class="cockpit-step-name">Triaje &amp; Filiación</div>
            <div class="cockpit-step-sub">Signos, ESI/NEWS2 &amp; Alergias</div>
            <span class="cockpit-step-status in-progress" id="step_status_1">En curso</span>
          </div>
        </div>
        <div class="cockpit-step-item" id="cockpit_step_2" onclick="window.COCKPIT.irAFase(2)">
          <div class="cockpit-step-num">2</div>
          <div class="cockpit-step-info">
            <div class="cockpit-step-name">Cobertura &amp; Camas</div>
            <div class="cockpit-step-sub">SUSALUD, SOAT &amp; Pulsera</div>
            <span class="cockpit-step-status" id="step_status_2">Pendiente</span>
          </div>
        </div>
        <div class="cockpit-step-item" id="cockpit_step_3" onclick="window.COCKPIT.irAFase(3)">
          <div class="cockpit-step-num">3</div>
          <div class="cockpit-step-info">
            <div class="cockpit-step-name">Atención &amp; Alta</div>
            <div class="cockpit-step-sub">CIE-10, Kardex, SOP &amp; Egreso</div>
            <span class="cockpit-step-status" id="step_status_3">Pendiente</span>
          </div>
        </div>
        <div class="cockpit-step-item" id="cockpit_step_4" onclick="window.COCKPIT.irAFase(4)">
          <div class="cockpit-step-num">4</div>
          <div class="cockpit-step-info">
            <div class="cockpit-step-name">Liquidación &amp; Auditoría</div>
            <div class="cockpit-step-sub">Caja, Cierre Ley 29414 &amp; Bitácora</div>
            <span class="cockpit-step-status" id="step_status_4">Pendiente</span>
          </div>
        </div>
      </div>

      <div id="cockpit_posta_wrapper">
        <!-- Contenedor donde se aloja la bandeja de posta clínica -->
      </div>
    `;

    // 1.4 Columna Central (Espacio de Trabajo Enfocado)
    const workspaceCenter = document.createElement("main");
    workspaceCenter.id = "cockpit_workspace_center";

    // Barra Táctica de Ingresos Rápidos
    const tacticalBar = document.createElement("div");
    tacticalBar.className = "cockpit-tactical-bar";
    tacticalBar.innerHTML = `
      <div class="cockpit-tactical-group">
        <button type="button" class="cockpit-tactical-btn btn-p1-danger" onclick="activarPanicoShockTrauma()" title="Admisión Inmediata de Emergencia a Shock Trauma (Ley N° 27604)">
          🚨 Trauma Shock P-I
        </button>
        <button type="button" class="cockpit-tactical-btn" onclick="activarIngresoDirectoQuirofano()" title="Admisión Directa a Quirófano SOP">
          🏥 Quirófano SOP
        </button>
        <button type="button" class="cockpit-tactical-btn" onclick="admitirEmergenciaNN()" title="Admisión de Paciente Indocumentado NN">
          🚨 Paciente NN
        </button>
      </div>
      <div class="cockpit-tactical-group">
        <button type="button" class="cockpit-tactical-btn" onclick="abrirModalPreTriageSTART()" title="Pre-Triage START de Cola (15s)">
          ⚡ Pre-Triage (15s)
        </button>
        <button type="button" class="cockpit-tactical-btn" onclick="registrarPacienteEnEspera()" title="Registrar llegada a sala de espera">
          ➕ En Espera
        </button>
        <button type="button" class="cockpit-tactical-btn" onclick="abrirModalLlegadasSimultaneasDesempate()" title="Protocolo de Desempate ante Llegadas Simultáneas (NTS N° 042-MINSA)">
          ⚖️ Desempate
        </button>
      </div>
    `;
    workspaceCenter.appendChild(tacticalBar);

    // Contenedores de las 4 Fases
    const phase1 = document.createElement("div");
    phase1.id = "cockpit_phase_1";
    phase1.className = "cockpit-phase-container cockpit-phase-active";

    const phase2 = document.createElement("div");
    phase2.id = "cockpit_phase_2";
    phase2.className = "cockpit-phase-container";

    const phase3 = document.createElement("div");
    phase3.id = "cockpit_phase_3";
    phase3.className = "cockpit-phase-container";

    const phase4 = document.createElement("div");
    phase4.id = "cockpit_phase_4";
    phase4.className = "cockpit-phase-container";

    workspaceCenter.appendChild(phase1);
    workspaceCenter.appendChild(phase2);
    workspaceCenter.appendChild(phase3);
    workspaceCenter.appendChild(phase4);

    // 1.5 Columna Derecha (Monitor Fisiológico + Acción Única)
    const sidebarRight = document.createElement("aside");
    sidebarRight.id = "cockpit_sidebar_right";
    sidebarRight.innerHTML = `
      <div class="cockpit-monitor-card">
        <div class="cockpit-monitor-header">
          <div class="cockpit-monitor-title">
            <span class="cockpit-pulse-dot"></span>
            Monitor Fisiológico en Vivo
          </div>
          <span style="font-size:10px; font-weight:800; color:#10B981;" id="lbl_monitor_ritmo">SINUSAL</span>
        </div>

        <div class="cockpit-monitor-vitals-row">
          <div class="cockpit-monitor-item">
            <div class="cockpit-m-label">SpO2 (Sat. O2)</div>
            <div class="cockpit-m-val"><span id="mon_spo2">--</span><span class="cockpit-m-unit">%</span></div>
          </div>
          <div class="cockpit-monitor-item">
            <div class="cockpit-m-label">FC (Cardiaca)</div>
            <div class="cockpit-m-val"><span id="mon_fc">--</span><span class="cockpit-m-unit">lpm</span></div>
          </div>
          <div class="cockpit-monitor-item">
            <div class="cockpit-m-label">PA (Sist / Diast)</div>
            <div class="cockpit-m-val"><span id="mon_pa">--/--</span><span class="cockpit-m-unit">mmHg</span></div>
          </div>
          <div class="cockpit-monitor-item">
            <div class="cockpit-m-label">FR (Respiratoria)</div>
            <div class="cockpit-m-val"><span id="mon_fr">--</span><span class="cockpit-m-unit">rpm</span></div>
          </div>
          <div class="cockpit-monitor-item">
            <div class="cockpit-m-label">Temperatura</div>
            <div class="cockpit-m-val"><span id="mon_temp">--</span><span class="cockpit-m-unit">°C</span></div>
          </div>
          <div class="cockpit-monitor-item">
            <div class="cockpit-m-label">Glasgow / Glucosa</div>
            <div class="cockpit-m-val"><span id="mon_glasgow">15</span><span class="cockpit-m-unit">/15</span></div>
          </div>
        </div>

        <div class="cockpit-monitor-scores">
          <div class="cockpit-score-box">
            <div class="cockpit-score-num" id="mon_news2_score" style="color:#38BDF8;">0 pts</div>
            <div class="cockpit-score-sub">NEWS2 Score</div>
          </div>
          <div class="cockpit-score-box">
            <div class="cockpit-score-num" id="mon_esi_level" style="color:#A7F3D0;">Nivel --</div>
            <div class="cockpit-score-sub">ESI v5 Compuerta</div>
          </div>
        </div>

        <div class="cockpit-beds-summary">
          <span>🛏️ Camas &amp; Quirófano:</span>
          <strong id="mon_beds_free" style="color:#F8FAFC;">15/15 Libres</strong>
        </div>
      </div>

      <div class="cockpit-action-card">
        <button type="button" class="cockpit-primary-action-btn" id="cockpit_primary_btn" onclick="window.COCKPIT.ejecutarAccionPrincipal()">
          Evaluar y Sellar Triaje
        </button>
        <div class="cockpit-action-meta" id="cockpit_action_meta">
          Pase asistencial normativo · NTS N° 139-MINSA
        </div>
      </div>
    `;

    // 1.6 Ensamblar Layout e Insertar antes del main antiguo
    cockpitLayout.appendChild(sidebarLeft);
    cockpitLayout.appendChild(workspaceCenter);
    cockpitLayout.appendChild(sidebarRight);

    mainContainer.parentNode.insertBefore(cockpitLayout, mainContainer);

    // 1.7 Mover secciones de los módulos a sus Fases correspondientes sin recrear el DOM
    const sec1 = document.getElementById("sec_mod1");
    const sec2 = document.getElementById("sec_mod2");
    const sec3 = document.getElementById("sec_mod3");
    const sec4 = document.getElementById("sec_mod4");
    const sec5 = document.getElementById("sec_mod5");
    const sec6 = document.getElementById("sec_mod6");
    const sec7 = document.getElementById("sec_mod7");
    const sec8 = document.getElementById("sec_mod8");

    if (sec1) phase1.appendChild(sec1);
    if (sec2) phase1.appendChild(sec2);
    if (sec3) phase2.appendChild(sec3);
    if (sec5) phase2.appendChild(sec5);
    if (sec4) phase3.appendChild(sec4);
    if (sec6) phase3.appendChild(sec6);
    if (sec7) phase3.appendChild(sec7);
    if (sec8) phase4.appendChild(sec8);

    // Mover la bandeja de posta al sidebar izquierdo
    const bandejaPosta = document.getElementById("bandeja_posta_container");
    const postaWrapper = document.getElementById("cockpit_posta_wrapper");
    if (bandejaPosta && postaWrapper) {
      postaWrapper.appendChild(bandejaPosta);
    }

    // Ocultar main contenedor viejo
    mainContainer.style.display = "none";

    // 1.8 Escuchar cambios de signos vitales para refrescar monitor
    engancharEventosMonitor();

    // 1.9 Refrescar estado y contexto
    actualizarContextoCockpit();
    setInterval(actualizarContextoCockpit, 1500);
  }

  // ----------------------------------------------------------------------------
  // 2. CONSTRUCCIÓN DE LA BARRA SUPERIOR FIJA (64px)
  // ----------------------------------------------------------------------------
  function construirBarraSuperiorCockpit() {
    if (document.getElementById("cockpit_top_bar")) return;

    const topBar = document.createElement("header");
    topBar.id = "cockpit_top_bar";
    topBar.innerHTML = `
      <div class="cockpit-top-left">
        <a href="#" class="cockpit-logo-badge">
          <div class="cockpit-logo-icon">🏥</div>
          <div>
            <div>HIS Triaje III-1</div>
            <div style="font-size:10px; color:#64748B; font-weight:600;">UPP Facultad de Ciencias de la Salud</div>
          </div>
        </a>

        <div class="cockpit-sector-segment">
          <button type="button" class="cockpit-sector-btn active" id="btn_sector_publico" onclick="window.COCKPIT.seleccionarSector('publico')">
            🏛️ Público (MINSA/SIS)
          </button>
          <button type="button" class="cockpit-sector-btn" id="btn_sector_privado" onclick="window.COCKPIT.seleccionarSector('privado')">
            🏥 Privado (EPS)
          </button>
        </div>
      </div>

      <div class="cockpit-top-center">
        <div class="cockpit-patient-pill">
          <span>👤</span>
          <div class="cockpit-px-name" id="cockpit_pill_px_nombre">Sin paciente seleccionado</div>
          <span class="ui-badge-pill ui-badge-p5" id="cockpit_pill_prioridad">P-V · No Urgente</span>
          <div class="cockpit-px-bed" id="cockpit_pill_cama">🛏️ Sin cama</div>
        </div>
      </div>

      <div class="cockpit-top-right">
        <span class="cockpit-role-badge" id="cockpit_top_rol_badge">
          🛡️ Rol: AUDITOR
        </span>

        <!-- Selector Rápido de Simulación en Modo Auditor -->
        <select class="cockpit-sim-select" id="cockpit_sim_role_select" onchange="window.COCKPIT.cambiarVistaSimulada(this.value)">
          <option value="AUDITOR" selected>Vista: Auditor Full</option>
          <option value="TRIAJE">Vista: Enfermería Triaje</option>
          <option value="ADMISION">Vista: Admisión &amp; Seguros</option>
          <option value="MEDICO">Vista: Médico Emergencia</option>
          <option value="CAJA">Vista: Facturación / Caja</option>
        </select>

        <button type="button" class="cockpit-btn-login" onclick="abrirModalLoginRBAC()">
          👤 Cambiar Rol
        </button>
      </div>
    `;

    document.body.insertBefore(topBar, document.body.firstChild);
  }

  // ----------------------------------------------------------------------------
  // 3. NAVEGACIÓN Y CONTROL DE FASES (1 A 4)
  // ----------------------------------------------------------------------------
  function irAFase(numeroFase) {
    faseActiva = Number(numeroFase);

    for (let f = 1; f <= 4; f++) {
      const stepEl = document.getElementById(`cockpit_step_${f}`);
      const phaseEl = document.getElementById(`cockpit_phase_${f}`);

      if (f === faseActiva) {
        if (stepEl) stepEl.classList.add("active");
        if (phaseEl) phaseEl.classList.add("cockpit-phase-active");
      } else {
        if (stepEl) stepEl.classList.remove("active");
        if (phaseEl) phaseEl.classList.remove("cockpit-phase-active");
      }
    }

    actualizarBotonAccionPrincipal();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ----------------------------------------------------------------------------
  // 4. MONITOR FISIOLÓGICO Y CONTEXTO EN VIVO
  // ----------------------------------------------------------------------------
  function engancharEventosMonitor() {
    const ids = ["spo2_full", "fc_full", "pas_full", "pad_full", "fr_full", "temp_full", "glasgow_full", "glucosa_full"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", refrescarValoresMonitor);
        el.addEventListener("change", refrescarValoresMonitor);
      }
    });
  }

  function refrescarValoresMonitor() {
    const spo2 = document.getElementById("spo2_full")?.value || "--";
    const fc = document.getElementById("fc_full")?.value || "--";
    const pas = document.getElementById("pas_full")?.value || "--";
    const pad = document.getElementById("pad_full")?.value || "--";
    const fr = document.getElementById("fr_full")?.value || "--";
    const temp = document.getElementById("temp_full")?.value || "--";
    const glasgow = document.getElementById("glasgow_full")?.value || "15";

    const elSpo2 = document.getElementById("mon_spo2");
    if (elSpo2) elSpo2.textContent = spo2;

    const elFc = document.getElementById("mon_fc");
    if (elFc) elFc.textContent = fc;

    const elPa = document.getElementById("mon_pa");
    if (elPa) elPa.textContent = `${pas}/${pad}`;

    const elFr = document.getElementById("mon_fr");
    if (elFr) elFr.textContent = fr;

    const elTemp = document.getElementById("mon_temp");
    if (elTemp) elTemp.textContent = temp;

    const elG = document.getElementById("mon_glasgow");
    if (elG) elG.textContent = glasgow;

    // Ritmo cardíaco referencial
    const elRitmo = document.getElementById("lbl_monitor_ritmo");
    if (elRitmo) {
      const numFc = Number(fc);
      if (!isNaN(numFc) && numFc > 130) {
        elRitmo.textContent = "TAQUICARDIA";
        elRitmo.style.color = "#EF4444";
      } else if (!isNaN(numFc) && numFc < 50 && numFc > 0) {
        elRitmo.textContent = "BRADICARDIA";
        elRitmo.style.color = "#F59E0B";
      } else {
        elRitmo.textContent = "SINUSAL";
        elRitmo.style.color = "#10B981";
      }
    }

    // NEWS2 y ESI
    const state = window.STATE;
    if (state) {
      const monNews2 = document.getElementById("mon_news2_score");
      if (monNews2) {
        const score = state.news2Score !== undefined ? state.news2Score : (window.calcularNEWS2 ? window.calcularNEWS2().total : 0);
        monNews2.textContent = `${score} pts`;
        monNews2.style.color = score >= 7 ? "#EF4444" : score >= 5 ? "#F97316" : score >= 1 ? "#F59E0B" : "#38BDF8";
      }

      const monEsi = document.getElementById("mon_esi_level");
      if (monEsi && state.prioridad) {
        monEsi.textContent = `Nivel ${state.prioridad}`;
        monEsi.style.color = state.prioridad === "I" ? "#EF4444" : state.prioridad === "II" ? "#F97316" : "#A7F3D0";
      }
    }

    // Camas libres
    const monBeds = document.getElementById("mon_beds_free");
    const navBeds = document.getElementById("lbl_navbar_dispo_resumen");
    if (monBeds && navBeds) {
      monBeds.textContent = navBeds.textContent || "15/15 Libres";
    }
  }

  function actualizarContextoCockpit() {
    refrescarValoresMonitor();

    const state = window.STATE;
    const pxNombre = document.getElementById("cockpit_pill_px_nombre");
    const pxPrio = document.getElementById("cockpit_pill_prioridad");
    const pxCama = document.getElementById("cockpit_pill_cama");

    if (state && pxNombre) {
      const nombre = state.nombreReniec || state.identificador || (state.esNN ? "Paciente NN (Crítico)" : "Sin paciente seleccionado");
      pxNombre.textContent = nombre;

      const prio = state.prioridad || "V";
      if (pxPrio) {
        pxPrio.className = `ui-badge-pill ui-badge-p${prio.toLowerCase()}`;
        pxPrio.textContent = `P-${prio} · ${prio === "I" ? "Emergencia Vital" : prio === "II" ? "Emergencia" : prio === "III" ? "Urgencia" : "No Urgente"}`;
      }

      if (pxCama) {
        pxCama.innerHTML = state.camaAsignada ? `🛏️ <strong>${state.camaAsignada}</strong>` : "🛏️ Sin cama";
      }
    }

    // Sincronizar badge de rol
    const rolActual = window.RBAC_FLUJO ? window.RBAC_FLUJO.obtenerRolActivo() : "AUDITOR";
    const rolBadge = document.getElementById("cockpit_top_rol_badge");
    if (rolBadge) {
      const nombres = {
        "AUDITOR": "🛡️ Rol: AUDITOR (Supervisión)",
        "ADMIN": "🛡️ Rol: AUDITOR (Supervisión)",
        "TRIAJE": "👩‍⚕️ Rol: TRIAJE",
        "ADMISION": "📋 Rol: ADMISIÓN",
        "MEDICO": "🩺 Rol: MÉDICO",
        "CAJA": "💳 Rol: CAJA"
      };
      rolBadge.textContent = nombres[rolActual] || `Rol: ${rolActual}`;
    }

    // Mostrar u ocultar selector de simulación
    const simSelect = document.getElementById("cockpit_sim_role_select");
    if (simSelect) {
      const esAuditor = rolActual === "AUDITOR" || rolActual === "ADMIN" || (window.RBAC_FLUJO && window.RBAC_FLUJO.obtenerModoOperacion() === "DEMO");
      simSelect.style.display = esAuditor ? "inline-block" : "none";
    }

    actualizarBotonAccionPrincipal();
  }

  // ----------------------------------------------------------------------------
  // 5. ACCIÓN PRINCIPAL DE POSTA CLÍNICA
  // ----------------------------------------------------------------------------
  function actualizarBotonAccionPrincipal() {
    const btn = document.getElementById("cockpit_primary_btn");
    const meta = document.getElementById("cockpit_action_meta");
    if (!btn || !meta) return;

    const rol = window.RBAC_FLUJO ? window.RBAC_FLUJO.obtenerRolActivo() : "AUDITOR";

    if (rol === "TRIAJE") {
      btn.textContent = "📤 Sellar Triaje y Derivar a Médico";
      meta.textContent = "Sello inmutable de enfermería · NTS N° 139-MINSA";
    } else if (rol === "ADMISION") {
      btn.textContent = "✅ Validar Cobertura y Notificar";
      meta.textContent = "Acreditación Padrón SUSALUD / SOAT en paralelo";
    } else if (rol === "MEDICO") {
      btn.textContent = "📤 Firmar Alta Clínica y Enviar a Caja";
      meta.textContent = "Estampa CMP y pase a cierre administrativo";
    } else if (rol === "CAJA") {
      btn.textContent = "💳 Emitir Liquidación y Cierre";
      meta.textContent = "Cierre formal de cuenta · Ley N° 29414";
    } else {
      // Rol AUDITOR / DEMO: Navegación continua de fases o acción de la fase activa
      if (faseActiva === 1) {
        btn.textContent = "Continuar a Cobertura & Camas (Fase 2) →";
        meta.textContent = "Auditoría integral · Pase a validación de seguro";
      } else if (faseActiva === 2) {
        btn.textContent = "Continuar a Atención Médica (Fase 3) →";
        meta.textContent = "Auditoría integral · Pase a evaluación clínica";
      } else if (faseActiva === 3) {
        btn.textContent = "Continuar a Liquidación & Caja (Fase 4) →";
        meta.textContent = "Auditoría integral · Pase a cierre financiero";
      } else {
        btn.textContent = "📋 Ver Bitácora Inmutable SUSALUD";
        meta.textContent = "Historial inmutable de auditoría (audit_logs)";
      }
    }
  }

  function ejecutarAccionPrincipal() {
    const rol = window.RBAC_FLUJO ? window.RBAC_FLUJO.obtenerRolActivo() : "AUDITOR";

    if (rol === "TRIAJE") {
      if (typeof window.sellarTriajeYDerivar === "function") {
        window.sellarTriajeYDerivar();
      }
    } else if (rol === "ADMISION") {
      if (typeof window.validarCoberturaYNotificar === "function") {
        window.validarCoberturaYNotificar();
      }
    } else if (rol === "MEDICO") {
      if (typeof window.firmarAltaMedicaYEnviarCaja === "function") {
        window.firmarAltaMedicaYEnviarCaja();
      }
    } else if (rol === "CAJA") {
      if (typeof window.emitirLiquidacionYCierre === "function") {
        window.emitirLiquidacionYCierre();
      }
    } else {
      // AUDITOR: avanzar de fase o abrir bitácora
      if (faseActiva < 4) {
        irAFase(faseActiva + 1);
      } else {
        if (typeof window.abrirModalAuditLogSusalud === "function") {
          window.abrirModalAuditLogSusalud();
        }
      }
    }
  }

  // ----------------------------------------------------------------------------
  // 6. SELECCIÓN DE ENTORNO (PÚBLICO / PRIVADO)
  // ----------------------------------------------------------------------------
  function seleccionarSector(tipo) {
    const btnPub = document.getElementById("btn_sector_publico");
    const btnPriv = document.getElementById("btn_sector_privado");

    if (tipo === "publico") {
      btnPub?.classList.add("active");
      btnPriv?.classList.remove("active");
      if (typeof window.cambiarEntornoOperativo === "function") {
        window.cambiarEntornoOperativo("publico");
      }
    } else {
      btnPriv?.classList.add("active");
      btnPub?.classList.remove("active");
      if (typeof window.cambiarEntornoOperativo === "function") {
        window.cambiarEntornoOperativo("privado");
      }
    }
  }

  // ----------------------------------------------------------------------------
  // 7. SIMULACIÓN RÁPIDA DE VISTAS (MODO AUDITOR)
  // ----------------------------------------------------------------------------
  function cambiarVistaSimulada(rolDestino) {
    if (window.RBAC_FLUJO && typeof window.RBAC_FLUJO.aplicarPermisosYEnmascaramiento === "function") {
      window.RBAC_FLUJO.aplicarPermisosYEnmascaramiento(rolDestino, "DEMO");
    }

    // Auto-ajustar fase sugerida según la vista simulada
    if (rolDestino === "TRIAJE") irAFase(1);
    else if (rolDestino === "ADMISION") irAFase(2);
    else if (rolDestino === "MEDICO") irAFase(3);
    else if (rolDestino === "CAJA") irAFase(4);
    else irAFase(1);

    actualizarContextoCockpit();

    if (typeof window.mostrarToast === "function") {
      window.mostrarToast("info", "Vista Simulada", `Mostrando permisos y bloqueos según rol: ${rolDestino}`);
    }
  }

  // ----------------------------------------------------------------------------
  // 8. INICIALIZACIÓN
  // ----------------------------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarCockpit);
  } else {
    inicializarCockpit();
  }

  // API pública
  window.COCKPIT = {
    irAFase,
    ejecutarAccionPrincipal,
    seleccionarSector,
    cambiarVistaSimulada,
    actualizarContextoCockpit,
    refrescarValoresMonitor
  };

})();
