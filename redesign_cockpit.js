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
  let rolActivoVista = "AUDITOR";

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
      <div class="cockpit-stepper-card" id="cockpit_stepper_card">
        <div class="cockpit-stepper-title" id="cockpit_stepper_title">Fases Asistenciales (HIS)</div>
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
            <div class="cockpit-step-name">Cobertura &amp; Admisión</div>
            <div class="cockpit-step-sub">SUSALUD, SOAT &amp; Regularización</div>
            <span class="cockpit-step-status" id="step_status_2">Pendiente</span>
          </div>
        </div>
        <div class="cockpit-step-item" id="cockpit_step_3" onclick="window.COCKPIT.irAFase(3)">
          <div class="cockpit-step-num">3</div>
          <div class="cockpit-step-info">
            <div class="cockpit-step-name">Atención &amp; Alta</div>
            <div class="cockpit-step-sub">CIE-10, Kardex, Camas/SOP &amp; Egreso</div>
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

      <div id="cockpit_active_patients_wrapper" style="display:flex; flex-direction:column; gap:8px;">
        <!-- Contenedor donde se aloja el Tablero de Atención y cola de emergencias -->
      </div>
    `;

    // 1.4 Columna Central (Espacio de Trabajo Enfocado)
    const workspaceCenter = document.createElement("main");
    workspaceCenter.id = "cockpit_workspace_center";

    // Barra Táctica de Ingresos Rápidos
    const tacticalBar = document.createElement("div");
    tacticalBar.id = "cockpit_tactical_bar";
    tacticalBar.className = "cockpit-tactical-bar";
    tacticalBar.innerHTML = `
      <div class="cockpit-tactical-group">
        <button type="button" class="cockpit-tactical-btn btn-p1-danger" onclick="activarPanicoShockTrauma()" title="Admisión Inmediata de Emergencia a Shock Trauma (Ley N° 27604)">
          🚨 Trauma Shock P-I
        </button>
        <button type="button" class="cockpit-tactical-btn" onclick="activarIngresoDirectoQuirofano()" title="Admisión Directa a Quirófano SOP">
          🏥 Quirófano SOP
        </button>
        <button type="button" id="btn_tactical_ingresar_nn" class="cockpit-tactical-btn" onclick="abrirModalIngresoNN()" style="border-left:3px solid #ea580c; font-weight:800;" title="Ingreso de Paciente NN / Indocumentado (Elegir estado de conciencia y prioridad)">
          👤 Ingresar Paciente NN
        </button>
        <button type="button" class="cockpit-tactical-btn" onclick="generarEImprimirPulseraInmediata()" style="background:#0f172a; color:#38bdf8; border:1.5px solid #0284c7; font-weight:800;" title="Generar e Imprimir Inmediatamente la Pulsera QR de Emergencia">
          🏷️ Imprimir Pulsera QR
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

    // Tarjeta Resumen Sellado de Triaje (Solo visible en Rol MÉDICO)
    const triageSealedCard = document.createElement("div");
    triageSealedCard.id = "cockpit_triage_sealed_card";
    triageSealedCard.className = "cockpit-summary-card";
    triageSealedCard.style.display = "none";
    triageSealedCard.innerHTML = `
      <div class="cockpit-summary-card-header">
        <div class="cockpit-summary-title">
          <span>🩺</span> Resumen Sellado de Triaje · Estándar Nacional IPRESS (NTS N° 139-MINSA) <span id="c_triage_regimen_badge" style="font-size:0.75rem; padding:2px 8px; border-radius:6px; font-weight:800; margin-left:8px;">[MINSA · FUA]</span>
        </div>
        <span class="ui-badge-pill ui-badge-p5" id="c_triage_prio_badge">P-V · No Urgente</span>
      </div>
      <div class="cockpit-summary-grid">
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">Paciente / Turno</div>
          <div class="cockpit-summary-val" id="c_triage_px_nombre">—</div>
        </div>
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">DNI / Filiación</div>
          <div class="cockpit-summary-val" id="c_triage_px_dni">—</div>
        </div>
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">Edad / Sexo</div>
          <div class="cockpit-summary-val" id="c_triage_px_edad_sexo">—</div>
        </div>
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">NEWS2 / ESI</div>
          <div class="cockpit-summary-val" id="c_triage_news2_score" style="color:#0284c7;">0 pts (Nivel —)</div>
        </div>
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">Signos Vitales</div>
          <div class="cockpit-summary-val" id="c_triage_vitals_resumen" style="font-size:0.78rem;">SpO2: --% | FC: -- | PA: --/--</div>
        </div>
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">Alergias Conocidas</div>
          <div class="cockpit-summary-val" id="c_triage_alergias" style="color:#dc2626;">Ninguna referida</div>
        </div>
      </div>
      <div class="cockpit-seal-box" id="c_triage_seal_box">
        <span>🔒 <strong>Triaje Sellado por Enfermería:</strong> <span id="c_triage_firmante">Lic. Ana Torres (CEP 92410)</span></span>
        <span id="c_triage_fecha_sello" style="font-weight:700;">Fecha: En curso</span>
      </div>
    `;
    workspaceCenter.appendChild(triageSealedCard);

    // Tarjeta Resumen Administrativo de Caja (Solo visible en Rol CAJA)
    const cajaAdminCard = document.createElement("div");
    cajaAdminCard.id = "cockpit_caja_admin_card";
    cajaAdminCard.className = "cockpit-summary-card";
    cajaAdminCard.style.display = "none";
    cajaAdminCard.innerHTML = `
      <div class="cockpit-summary-card-header">
        <div class="cockpit-summary-title">
          <span>💳</span> Liquidación Administrativa &amp; Cierre de Cuenta (Ley N° 29414)
        </div>
        <span class="ui-badge-pill ui-badge-p5" id="c_caja_seguro_badge">Seguro: Por validar</span>
      </div>
      <div class="cockpit-summary-grid">
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">Paciente / Turno</div>
          <div class="cockpit-summary-val" id="c_caja_px_nombre">—</div>
        </div>
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">Documento</div>
          <div class="cockpit-summary-val" id="c_caja_px_dni">—</div>
        </div>
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">Régimen / Financiador</div>
          <div class="cockpit-summary-val" id="c_caja_regimen_val">SIS Gratuito</div>
        </div>
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">Cama / Recurso</div>
          <div class="cockpit-summary-val" id="c_caja_cama_val">Sin cama</div>
        </div>
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">Alta Médica</div>
          <div class="cockpit-summary-val" id="c_caja_alta_status" style="color:#059669;">Firmada (CMP)</div>
        </div>
        <div class="cockpit-summary-item">
          <div class="cockpit-summary-label">Total a Liquidar</div>
          <div class="cockpit-summary-val" id="c_caja_monto_total" style="color:#0f172a; font-size:1.05rem;">S/ 0.00</div>
        </div>
      </div>
      <div style="margin-top:10px; font-size:0.75rem; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:6px; border:1px solid #e2e8f0;">
        🔒 <strong>Privacidad Médica (Ley N° 29733):</strong> Las notas clínicas, diagnósticos CIE-10 y evolución se encuentran enmascaradas por confidencialidad para personal administrativo.
      </div>
    `;
    workspaceCenter.appendChild(cajaAdminCard);

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

    // Carrusel Slide de Pacientes en Espera Pre-Triaje (Door-to-Triage NTS N° 042-MINSA & CTAS)
    let pretriageSlide = document.getElementById("cockpit_pretriage_queue_wrapper");
    if (!pretriageSlide) {
      pretriageSlide = document.createElement("div");
      pretriageSlide.id = "cockpit_pretriage_queue_wrapper";
      pretriageSlide.className = "pretriage-queue-wrapper";
    }
    phase1.appendChild(pretriageSlide);

    if (sec1) phase1.appendChild(sec1);
    if (sec2) phase1.appendChild(sec2);
    if (sec3) phase2.appendChild(sec3);
    if (sec5) phase2.appendChild(sec5);
    if (sec4) phase3.appendChild(sec4);
    if (sec6) phase3.appendChild(sec6);
    if (sec7) phase3.appendChild(sec7);
    if (sec8) phase4.appendChild(sec8);

    // Mover el Tablero de Atención y cola de emergencias al sidebar izquierdo
    const activePanel = document.getElementById("activePatientsPanel");
    const queueWrapper = document.getElementById("cockpit_active_patients_wrapper");
    if (activePanel && queueWrapper) {
      queueWrapper.appendChild(activePanel);
      activePanel.style.display = "block";
      activePanel.style.width = "100%";
    }

    // Eliminar la bandeja de posta clínica si existiese (reemplazada por Tablero de Atención y cola de emergencias)
    const bandejaPosta = document.getElementById("bandeja_posta_container");
    if (bandejaPosta) {
      bandejaPosta.remove();
    }

    // Ocultar main contenedor viejo
    mainContainer.style.display = "none";

    // 1.8 Escuchar eventos de monitor y tema
    engancharEventosMonitor();
    if (typeof window.poblarCatalogosModulo4 === 'function') window.poblarCatalogosModulo4();
    inicializarModoOscuro();

    // 1.9 Aplicar vista de rol inicial
    const rolActual = window.RBAC_FLUJO ? window.RBAC_FLUJO.obtenerRolActivo() : "AUDITOR";
    aplicarVistaYPermisosRol(rolActual);
    if (typeof window.renderizarCarruselPreTriaje === "function") {
      window.renderizarCarruselPreTriaje();
    }

    // 1.10 Refrescar contexto periódicamente
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
        <!-- Selector Rápido de Simulación en Modo Auditor -->
        <select class="cockpit-sim-select" id="cockpit_sim_role_select" onchange="window.COCKPIT.cambiarVistaSimulada(this.value)">
          <option value="AUDITOR" selected>Vista: Auditor Full</option>
          <option value="TRIAJE">Vista: Enfermería Triaje</option>
          <option value="ADMISION">Vista: Admisión &amp; Seguros</option>
          <option value="MEDICO">Vista: Médico Emergencia</option>
          <option value="CAJA">Vista: Facturación / Caja</option>
        </select>

        <span class="cockpit-role-badge" id="cockpit_top_rol_badge">
          🛡️ Rol: AUDITOR
        </span>

        <!-- Botón Historia Clínica (Solo Auditor y Médico) -->
        <button type="button" id="btn_cockpit_historia_clinica" onclick="abrirModalConsultaHC()" class="cockpit-btn-theme" style="background:#0284c7; color:#ffffff; border-color:#0369a1; font-weight:800; white-space:nowrap; display:inline-flex; align-items:center; gap:5px;" title="Consultar y visualizar la Historia Clínica completa de los pacientes (Solo Auditor y Médico)">
          📋 Historia Clínica
        </button>

        <!-- Botón Expandir/Contraer Todo (Modo Auditor) -->
        <button type="button" class="cockpit-btn-theme" id="btn_expand_all_modules" onclick="window.COCKPIT.toggleExpandirContraerTodo()" title="Expandir o contraer todas las fases y módulos de una sola vez">
          ⤢ Expandir Todo
        </button>

        <!-- Botón Modo Oscuro / Claro -->
        <button type="button" class="cockpit-btn-theme" id="btn_toggle_dark_mode" onclick="window.COCKPIT.toggleDarkMode()" title="Cambiar tema">
          ☀️ Claro
        </button>

        <button type="button" class="cockpit-btn-login" onclick="abrirModalLoginRBAC()">
          👤 Cambiar Rol
        </button>
      </div>
    `;

    document.body.insertBefore(topBar, document.body.firstChild);
  }

  // ----------------------------------------------------------------------------
  // 3. VISTAS FOCALIZADAS POR ROL (EPIC ASAP / CERNER FIRSTNET)
  // ----------------------------------------------------------------------------
  function aplicarVistaYPermisosRol(rol, modo) {
    rol = rol || (window.RBAC_FLUJO ? window.RBAC_FLUJO.obtenerRolActivo() : "AUDITOR");
    modo = modo || (window.RBAC_FLUJO ? window.RBAC_FLUJO.obtenerModoOperacion() : "DEMO");
    rolActivoVista = rol;

    // Visibilidad del botón Historia Clínica en la barra superior (Solo Auditor y Médico)
    const btnCockpitHC = document.getElementById("btn_cockpit_historia_clinica");
    if (btnCockpitHC) {
      const esPermHC = (rol === "AUDITOR" || rol === "ADMIN" || rol === "MEDICO");
      btnCockpitHC.style.setProperty("display", esPermHC ? "inline-flex" : "none", "important");
    }

    const step1 = document.getElementById("cockpit_step_1");
    const step2 = document.getElementById("cockpit_step_2");
    const step3 = document.getElementById("cockpit_step_3");
    const step4 = document.getElementById("cockpit_step_4");
    const tacticalBar = document.getElementById("cockpit_tactical_bar");
    const triageCard = document.getElementById("cockpit_triage_sealed_card");
    const cajaCard = document.getElementById("cockpit_caja_admin_card");

    const phase1 = document.getElementById("cockpit_phase_1");
    const phase2 = document.getElementById("cockpit_phase_2");
    const phase3 = document.getElementById("cockpit_phase_3");
    const phase4 = document.getElementById("cockpit_phase_4");

    const sec1 = document.getElementById("sec_mod1");
    const sec2 = document.getElementById("sec_mod2");
    const sec3 = document.getElementById("sec_mod3");
    const sec4 = document.getElementById("sec_mod4");
    const sec5 = document.getElementById("sec_mod5");
    const sec6 = document.getElementById("sec_mod6");
    const sec7 = document.getElementById("sec_mod7");
    const sec8 = document.getElementById("sec_mod8");

    // Desbloquear todos los módulos por defecto para prevenir casillas muertas
    document.querySelectorAll(".module-blocked-overlay").forEach(ov => ov.remove());
    for (let i = 1; i <= 8; i++) {
      const sec = document.getElementById(`sec_mod${i}`);
      if (sec) {
        sec.style.pointerEvents = "auto";
        sec.style.opacity = "1";
        sec.querySelectorAll("button, input, select, textarea").forEach(ctrl => {
          if (!ctrl.dataset.rbacHardDisabled) ctrl.disabled = false;
        });
      }
    }

    if (rol === "TRIAJE") {
      // TRIAJE: Ve Barra Táctica + Módulos 1, 2, 5. Ocultos 3, 4, 6, 7, 8
      if (tacticalBar) tacticalBar.style.display = "flex";
      if (triageCard) triageCard.style.display = "none";
      if (cajaCard) cajaCard.style.display = "none";

      if (step1) { step1.style.display = "flex"; step1.classList.add("active"); }
      if (step2) step2.style.display = "none";
      if (step3) step3.style.display = "none";
      if (step4) step4.style.display = "none";

      if (phase1) phase1.style.display = "block";
      if (phase2) phase2.style.display = "block";
      if (phase3) phase3.style.display = "none";
      if (phase4) phase4.style.display = "none";

      if (sec1) sec1.style.display = "block";
      if (sec2) sec2.style.display = "block";
      if (sec5) sec5.style.display = "block";
      if (sec3) sec3.style.display = "none";
      if (sec4) sec4.style.display = "none";
      if (sec6) sec6.style.display = "none";
      if (sec7) sec7.style.display = "none";
      if (sec8) sec8.style.display = "none";

    } else if (rol === "ADMISION") {
      // ADMISIÓN: Ve Módulos 2 y 3. Ocultos 1, 4, 5, 6, 7, 8
      if (tacticalBar) tacticalBar.style.display = "none";
      if (triageCard) triageCard.style.display = "none";
      if (cajaCard) cajaCard.style.display = "none";

      if (step1) step1.style.display = "none";
      if (step2) { step2.style.display = "flex"; step2.classList.add("active"); }
      if (step3) step3.style.display = "none";
      if (step4) step4.style.display = "none";

      if (phase1) phase1.style.display = "block";
      if (phase2) phase2.style.display = "block";
      if (phase3) phase3.style.display = "none";
      if (phase4) phase4.style.display = "none";

      if (sec2) sec2.style.display = "block";
      if (sec3) sec3.style.display = "block";
      if (sec1) sec1.style.display = "none";
      if (sec4) sec4.style.display = "none";
      if (sec5) sec5.style.display = "none";
      if (sec6) sec6.style.display = "none";
      if (sec7) sec7.style.display = "none";
      if (sec8) sec8.style.display = "none";

    } else if (rol === "MEDICO") {
      // MÉDICO: Ve Resumen Sellado de Triaje + Módulos 4, 6, 7. Ocultos 1, 2, 3, 5, 8
      if (tacticalBar) tacticalBar.style.display = "none";
      if (triageCard) {
        triageCard.style.display = "block";
        actualizarTarjetaResumenTriaje();
      }
      if (cajaCard) cajaCard.style.display = "none";

      if (step1) step1.style.display = "none";
      if (step2) step2.style.display = "none";
      if (step3) { step3.style.display = "flex"; step3.classList.add("active"); }
      if (step4) step4.style.display = "none";

      if (phase1) phase1.style.display = "none";
      if (phase2) phase2.style.display = "none";
      if (phase3) phase3.style.display = "block";
      if (phase4) phase4.style.display = "none";

      if (sec4) sec4.style.display = "block";
      if (sec6) sec6.style.display = "block";
      if (sec7) sec7.style.display = "block";
      if (sec1) sec1.style.display = "none";
      if (sec2) sec2.style.display = "none";
      if (sec3) sec3.style.display = "none";
      if (sec5) sec5.style.display = "none";
      if (sec8) sec8.style.display = "none";

    } else if (rol === "CAJA") {
      // CAJA: Ve Resumen Administrativo + Módulo 8. Ocultos 1 al 7
      if (tacticalBar) tacticalBar.style.display = "none";
      if (triageCard) triageCard.style.display = "none";
      if (cajaCard) {
        cajaCard.style.display = "block";
        actualizarTarjetaResumenCaja();
      }

      if (step1) step1.style.display = "none";
      if (step2) step2.style.display = "none";
      if (step3) step3.style.display = "none";
      if (step4) { step4.style.display = "flex"; step4.classList.add("active"); }

      if (phase1) phase1.style.display = "none";
      if (phase2) phase2.style.display = "none";
      if (phase3) phase3.style.display = "none";
      if (phase4) phase4.style.display = "block";

      if (sec8) sec8.style.display = "block";
      if (sec1) sec1.style.display = "none";
      if (sec2) sec2.style.display = "none";
      if (sec3) sec3.style.display = "none";
      if (sec4) sec4.style.display = "none";
      if (sec5) sec5.style.display = "none";
      if (sec6) sec6.style.display = "none";
      if (sec7) sec7.style.display = "none";

    } else {
      // AUDITOR / DEMO FULL: Todos los pasos y módulos habilitados
      if (tacticalBar) tacticalBar.style.display = "flex";
      if (triageCard) triageCard.style.display = "none";
      if (cajaCard) cajaCard.style.display = "none";

      if (step1) step1.style.display = "flex";
      if (step2) step2.style.display = "flex";
      if (step3) step3.style.display = "flex";
      if (step4) step4.style.display = "flex";

      // Restaurar visibilidad por fases
      irAFase(faseActiva);

      if (sec1) sec1.style.display = "block";
      if (sec2) sec2.style.display = "block";
      if (sec3) sec3.style.display = "block";
      if (sec4) sec4.style.display = "block";
      if (sec5) sec5.style.display = "block";
      if (sec6) sec6.style.display = "block";
      if (sec7) sec7.style.display = "block";
      if (sec8) sec8.style.display = "block";
    }

    actualizarBotonAccionPrincipal();
  }

  // ----------------------------------------------------------------------------
  // 4. CONTROL DE FASES (MODO AUDITOR / SUPERVISIÓN)
  // ----------------------------------------------------------------------------
  function irAFase(numeroFase) {
    faseActiva = Number(numeroFase);

    for (let f = 1; f <= 4; f++) {
      const stepEl = document.getElementById(`cockpit_step_${f}`);
      const phaseEl = document.getElementById(`cockpit_phase_${f}`);

      if (f === faseActiva) {
        if (stepEl) stepEl.classList.add("active");
        if (phaseEl) {
          phaseEl.style.display = "block";
          phaseEl.classList.add("cockpit-phase-active");
        }
      } else {
        if (stepEl) stepEl.classList.remove("active");
        if (phaseEl) {
          if (rolActivoVista === "AUDITOR" || rolActivoVista === "ADMIN") {
            phaseEl.style.display = "none";
          }
          phaseEl.classList.remove("cockpit-phase-active");
        }
      }
    }

    actualizarBotonAccionPrincipal();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ----------------------------------------------------------------------------
  // 5. TARJETAS RESUMEN INTERACTIVAS (MÉDICO & CAJA)
  // ----------------------------------------------------------------------------
  function actualizarTarjetaResumenTriaje() {
    const state = window.STATE || {};
    const cola = window.PACIENTES_COLA || [];
    const px = cola.find(x => x.id === window.pacienteActivoId) || {};

    const elPrioBadge = document.getElementById("c_triage_prio_badge");
    const elNombre = document.getElementById("c_triage_px_nombre");
    const elDni = document.getElementById("c_triage_px_dni");
    const elEdadSexo = document.getElementById("c_triage_px_edad_sexo");
    const elNews2 = document.getElementById("c_triage_news2_score");
    const elVitals = document.getElementById("c_triage_vitals_resumen");
    const elAlergias = document.getElementById("c_triage_alergias");
    const elFirmante = document.getElementById("c_triage_firmante");
    const elFecha = document.getElementById("c_triage_fecha_sello");

    const prio = px.prioridad || state.prioridad || "III";
    if (elPrioBadge) {
      elPrioBadge.className = `ui-badge-pill ui-badge-p${prio.toLowerCase()}`;
      elPrioBadge.textContent = `P-${prio} · ${prio === "I" ? "Emergencia Vital" : prio === "II" ? "Emergencia" : "Urgencia"}`;
    }

    const turno = px.turno || (state.identificador ? state.identificador.replace("CRITICO-", "") : "E-001");
    if (elNombre) elNombre.textContent = `${turno} · ${px.nombre || state.nombreReniec || state.identificador || "Paciente"}`;
    
    const esNN = Boolean(px.esNN || state.esNN || (px.dni && String(px.dni).startsWith("NN")));
    if (elDni) {
      if (esNN) {
        elDni.innerHTML = `<span style="color:#ea580c; font-weight:800;">Identidad: ${px.identificador || "NN-XXX"} (Desconocido) — Validación RENIEC pendiente por Admisión (Ley N° 27604)</span>`;
      } else {
        elDni.innerHTML = `<span style="color:#0f172a; font-weight:700;">${px.dni || state.numDni || "—"}</span> <span style="background:#dcfce7; color:#15803d; font-size:0.7rem; font-weight:800; padding:1px 6px; border-radius:4px; margin-left:6px;">✅ Validado en RENIEC</span>`;
      }
    }

    // Badge dinámico del régimen activo: [MINSA · FUA], [EsSalud · ESSI] o [Clínica Privada · SITEDS]
    const elRegimenBadge = document.getElementById("c_triage_regimen_badge");
    if (elRegimenBadge) {
      const entorno = state.entornoOperativo || "publico";
      const ipress = state.tipoIpressPublica || (document.getElementById("select_ipress_publica")?.value) || "MINSA";
      if (entorno === "privado") {
        elRegimenBadge.textContent = "[Clínica Privada · SITEDS]";
        elRegimenBadge.style.background = "#f5f3ff";
        elRegimenBadge.style.color = "#6d28d9";
        elRegimenBadge.style.border = "1px solid #ddd6fe";
      } else if (ipress === "ESSALUD" || state.tipoSeguro === "EsSalud") {
        elRegimenBadge.textContent = "[EsSalud · ESSI]";
        elRegimenBadge.style.background = "#eff6ff";
        elRegimenBadge.style.color = "#1e40af";
        elRegimenBadge.style.border = "1px solid #bfdbfe";
      } else {
        elRegimenBadge.textContent = "[MINSA · FUA]";
        elRegimenBadge.style.background = "#f0fdf4";
        elRegimenBadge.style.color = "#166534";
        elRegimenBadge.style.border = "1px solid #86efac";
      }
    }
    if (elEdadSexo) elEdadSexo.textContent = `${state.edad || "—"} años / ${state.sexo || "Desconocido"}`;

    const score = state.news2Score !== undefined ? state.news2Score : 0;
    if (elNews2) elNews2.textContent = `${score} pts (Nivel ${prio})`;

    const spo2 = document.getElementById("spo2_full")?.value || "--";
    const fc = document.getElementById("fc_full")?.value || "--";
    const pas = document.getElementById("pas_full")?.value || "--";
    const pad = document.getElementById("pad_full")?.value || "--";
    if (elVitals) elVitals.textContent = `SpO2: ${spo2}% | FC: ${fc} lpm | PA: ${pas}/${pad} mmHg`;

    if (elAlergias) elAlergias.textContent = state.alergias || "Ninguna referida";

    const firmaEnf = px.firmas?.triaje || state.firmas?.triaje;
    if (firmaEnf && elFirmante) {
      elFirmante.textContent = `${firmaEnf.usuario} (${firmaEnf.colegiatura || "CEP Oficial"})`;
    }
    if (firmaEnf && elFecha) {
      elFecha.textContent = `Sellado: ${new Date(firmaEnf.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  function actualizarTarjetaResumenCaja() {
    const state = window.STATE || {};
    const cola = window.PACIENTES_COLA || [];
    const px = cola.find(x => x.id === window.pacienteActivoId) || {};

    const elNombre = document.getElementById("c_caja_px_nombre");
    const elDni = document.getElementById("c_caja_px_dni");
    const elRegimen = document.getElementById("c_caja_regimen_val");
    const elCama = document.getElementById("c_caja_cama_val");
    const elAlta = document.getElementById("c_caja_alta_status");
    const elTotal = document.getElementById("c_caja_monto_total");
    const elBadgeSeguro = document.getElementById("c_caja_seguro_badge");

    const turno = px.turno || (state.identificador ? state.identificador.replace("CRITICO-", "") : "E-001");
    if (elNombre) elNombre.textContent = `${turno} · ${px.nombre || state.nombreReniec || "Paciente"}`;
    if (elDni) elDni.textContent = px.dni || state.numDni || "NN";

    const seguro = state.tipoSeguro || "SIS Gratuito";
    if (elRegimen) elRegimen.textContent = seguro;
    if (elBadgeSeguro) elBadgeSeguro.textContent = `Seguro: ${seguro.split(" ")[0]}`;

    if (elCama) elCama.textContent = state.camaAsignada || "Sin cama";

    const firmaMed = px.firmas?.medico || state.firmas?.medico;
    if (elAlta) {
      elAlta.textContent = firmaMed ? `Firmada por ${firmaMed.usuario} (${firmaMed.colegiatura || "CMP"})` : "Pendiente de firma médica";
      elAlta.style.color = firmaMed ? "#059669" : "#d97706";
    }

    const totalFactura = document.getElementById("factura_total_monto")?.textContent || "S/ 0.00";
    if (elTotal) elTotal.textContent = totalFactura;
  }

  // ----------------------------------------------------------------------------
  // 6. MONITOR FISIOLÓGICO EN VIVO
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

    function normalizarIdCamaClinica(val) {
    if (!val || typeof val !== "string") return null;
    const v = val.toUpperCase().trim();
    const match = v.match(/\b(ST-0[12]|SOP-0[1-3]|OBS-0[1-6]|URPA-0[12]|UCI-0[12]|SILLON-01)\b/);
    if (match) return match[1];
    if (v.includes("ST-01") || (v.includes("SHOCK") && v.includes("1"))) return "ST-01";
    if (v.includes("ST-02") || (v.includes("SHOCK") && v.includes("2"))) return "ST-02";
    if (v.includes("SOP-01") || (v.includes("QUIR") && v.includes("1"))) return "SOP-01";
    if (v.includes("SOP-02") || (v.includes("QUIR") && v.includes("2"))) return "SOP-02";
    if (v.includes("SOP-03") || (v.includes("QUIR") && v.includes("3"))) return "SOP-03";
    if (v.includes("OBS-01")) return "OBS-01";
    if (v.includes("OBS-02")) return "OBS-02";
    if (v.includes("OBS-03")) return "OBS-03";
    if (v.includes("OBS-04")) return "OBS-04";
    if (v.includes("OBS-05")) return "OBS-05";
    if (v.includes("OBS-06")) return "OBS-06";
    if (v.includes("URPA-01")) return "URPA-01";
    if (v.includes("URPA-02")) return "URPA-02";
    if (v.includes("UCI-01")) return "UCI-01";
    if (v.includes("UCI-02")) return "UCI-02";
    return null;
  }

  function actualizarCamasMonitorEnTiempoReal() {
    const monBeds = document.getElementById("mon_beds_free");
    const idsHospitalarios = [
      "ST-01", "ST-02", "SOP-01", "SOP-02", "SOP-03",
      "OBS-01", "OBS-02", "OBS-03", "OBS-04", "OBS-05", "OBS-06",
      "URPA-01", "URPA-02", "UCI-01", "UCI-02"
    ];

    const recursos = window.RECURSOS_HOSPITALARIOS || (typeof RECURSOS_HOSPITALARIOS !== 'undefined' ? RECURSOS_HOSPITALARIOS : null);
    const st = window.STATE || {};
    const camasOcupadas = new Set();

    // 1. Paciente activo en STATE (si no está dado de alta o liquidado)
    const flujoActivo = st.estadoFlujo || "";
    const estaAltaActivo = flujoActivo === "ALTA_CLINICA" || flujoActivo === "LIQUIDADO_CERRADO" || flujoActivo === "EGRESADO" || flujoActivo === "CERRADO_FACTURADO" || flujoActivo === "ALTA" || flujoActivo === "Atendido";
    const camaActivoNormalizada = (!estaAltaActivo) ? normalizarIdCamaClinica(st.camaAsignadaId || st.camaAsignada || "") : null;
    if (camaActivoNormalizada && idsHospitalarios.includes(camaActivoNormalizada)) {
      camasOcupadas.add(camaActivoNormalizada);
    }

    // 2. Pacientes en PACIENTES_COLA
    const cola = Array.isArray(window.PACIENTES_COLA) ? window.PACIENTES_COLA : [];
    cola.forEach(px => {
      const pxFlujo = px.estadoFlujo || "";
      if (pxFlujo !== "ALTA_CLINICA" && pxFlujo !== "LIQUIDADO_CERRADO" && pxFlujo !== "EGRESADO" && pxFlujo !== "CERRADO_FACTURADO" && pxFlujo !== "ALTA" && pxFlujo !== "Atendido") {
        const idCama = normalizarIdCamaClinica(px.camaId || px.camaAsignada || px.camaNombre || "");
        if (idCama && idsHospitalarios.includes(idCama)) {
          camasOcupadas.add(idCama);
        }
      }
    });

    // 3. Pacientes en expedientesStore
    if (typeof window.expedientesStore !== "undefined") {
      Object.keys(window.expedientesStore).forEach(k => {
        const exp = window.expedientesStore[k];
        const expFlujo = exp.estadoFlujo || "";
        if (expFlujo !== "ALTA_CLINICA" && expFlujo !== "LIQUIDADO_CERRADO" && expFlujo !== "EGRESADO" && expFlujo !== "CERRADO_FACTURADO" && expFlujo !== "ALTA" && expFlujo !== "Atendido") {
          const idCama = normalizarIdCamaClinica(exp.camaId || exp.camaAsignada || exp.camaNombre || "");
          if (idCama && idsHospitalarios.includes(idCama)) {
            camasOcupadas.add(idCama);
          }
        }
      });
    }

    // 4. Recursos hospitalarios con estado 'ocupada' explícito
    if (recursos) {
      idsHospitalarios.forEach(id => {
        const r = recursos[id];
        if (r && r.estado === "ocupada") {
          const pacFlujo = r.paciente?.estadoFlujo || "";
          if (pacFlujo === "ALTA_CLINICA" || pacFlujo === "LIQUIDADO_CERRADO" || pacFlujo === "CERRADO_FACTURADO" || pacFlujo === "ALTA" || pacFlujo === "Atendido") {
            r.estado = "disponible";
            r.paciente = null;
          } else {
            // Si la cama tiene un paciente registrado que no está de alta
            if (r.paciente) {
              camasOcupadas.add(id);
            }
          }
        }
      });

      // Sincronizar estado bidireccional
      idsHospitalarios.forEach(id => {
        if (camasOcupadas.has(id)) {
          if (recursos[id]) recursos[id].estado = "ocupada";
        } else {
          if (recursos[id]) {
            recursos[id].estado = "disponible";
            recursos[id].paciente = null;
          }
        }
      });
    }

    const total = idsHospitalarios.length; // 15
    const ocupadas = camasOcupadas.size;
    const libres = Math.max(0, total - ocupadas);

    if (monBeds) {
      monBeds.textContent = `${libres}/${total} Libres`;
      monBeds.style.color = libres === 0 ? "#EF4444" : libres <= 3 ? "#F59E0B" : "#10B981";
    }

    const pxCamaPill = document.getElementById("cockpit_pill_cama");
    if (pxCamaPill) {
      if (estaAltaActivo) {
        pxCamaPill.innerHTML = "🛏️ <em>Cama liberada (Alta)</em>";
      } else if (st.camaAsignada) {
        pxCamaPill.innerHTML = `🛏️ <strong>${st.camaAsignada}</strong>`;
      }
    }

    return { total, ocupadas, libres };
  }

  window.actualizarCamasMonitorEnTiempoReal = actualizarCamasMonitorEnTiempoReal;
  window.normalizarIdCamaClinica = normalizarIdCamaClinica;

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

    const state = window.STATE;
    if (state) {
      const monNews2 = document.getElementById("mon_news2_score");
      if (monNews2) {
        const score = state.news2Score !== undefined ? state.news2Score : (window.calcularNEWS2 ? window.calcularNEWS2().total : 0);
        monNews2.textContent = `${score} pts`;
        monNews2.style.color = score >= 7 ? "#EF4444" : score >= 5 ? "#F97316" : score >= 1 ? "#F59E0B" : "#38BDF8";
      }

      const monEsi = document.getElementById("mon_esi_level");
      if (monEsi) {
        if (state.prioridad) {
          monEsi.textContent = `Nivel ${state.prioridad}`;
          monEsi.style.color = state.prioridad === "I" ? "#EF4444" : state.prioridad === "II" ? "#F97316" : "#A7F3D0";
        } else {
          monEsi.textContent = "--";
          monEsi.style.color = "#94a3b8";
        }
      }
    }

    // --- CÁLCULO Y DESCUENTO DE CAMAS LIBRES EN TIEMPO REAL (MONITOR FISIOLÓGICO) ---
    actualizarCamasMonitorEnTiempoReal();
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

      if (pxPrio) {
        if (state.prioridad) {
          const prio = state.prioridad;
          pxPrio.className = `ui-badge-pill ui-badge-p${prio.toLowerCase()}`;
          pxPrio.style.background = "";
          pxPrio.style.color = "";
          pxPrio.style.border = "";
          pxPrio.textContent = `P-${prio} · ${prio === "I" ? "Emergencia Vital" : prio === "II" ? "Emergencia" : prio === "III" ? "Urgencia" : prio === "IV" ? "Urgencia Menor" : "No Urgente"}`;
        } else {
          pxPrio.className = "ui-badge-pill";
          pxPrio.textContent = "⏳ Sin Prioridad (Por evaluar)";
          pxPrio.style.background = "#f1f5f9";
          pxPrio.style.color = "#475569";
          pxPrio.style.border = "1px solid #cbd5e1";
        }
      }

      if (pxCama) {
        pxCama.innerHTML = state.camaAsignada ? `🛏️ <strong>${state.camaAsignada}</strong>` : "🛏️ Sin cama";
      }
    }

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

    const simSelect = document.getElementById("cockpit_sim_role_select");
    if (simSelect) {
      const esAuditor = rolActual === "AUDITOR" || rolActual === "ADMIN" || (window.RBAC_FLUJO && window.RBAC_FLUJO.obtenerModoOperacion() === "DEMO");
      simSelect.style.display = esAuditor ? "inline-block" : "none";
    }

    if (rolActual === "MEDICO") actualizarTarjetaResumenTriaje();
    if (rolActual === "CAJA") actualizarTarjetaResumenCaja();

    // Actualización dinámica de las 4 fases del Stepper y sombreado cuando está Atendido en tiempo real
    const colaActual = window.PACIENTES_COLA || [];
    const idActivo = window.pacienteActivoId;
    const pxActual = idActivo ? colaActual.find(x => x.id === idActivo) : null;
    
    // Si no hay paciente seleccionado o recién se está ingresando, TODO empieza limpio en Fase 1
    const efActual = pxActual ? (pxActual.estadoFlujo || "PENDIENTE_TRIAJE") : (state?.estadoFlujo || "PENDIENTE_TRIAJE");
    const fActual = (pxActual && pxActual.firmas) ? pxActual.firmas : (state?.firmas || {});
    const cobValActual = pxActual ? Boolean(pxActual.coberturaValidada) : Boolean(state?.coberturaValidada);

    const s1 = document.getElementById("step_status_1");
    const s2 = document.getElementById("step_status_2");
    const s3 = document.getElementById("step_status_3");
    const s4 = document.getElementById("step_status_4");
    const step1El = document.getElementById("cockpit_step_1");
    const step2El = document.getElementById("cockpit_step_2");
    const step3El = document.getElementById("cockpit_step_3");
    const step4El = document.getElementById("cockpit_step_4");

    const triajeSellado = Boolean(fActual.triaje) || efActual === "EN_ATENCION_MEDICA" || efActual === "PENDIENTE_CAJA" || efActual === "CERRADO_FACTURADO";
    const admisionValidada = cobValActual || Boolean(fActual.admision);
    const altaFirmada = Boolean(fActual.medico) || efActual === "PENDIENTE_CAJA" || efActual === "CERRADO_FACTURADO";
    const estaCerrado = efActual === "CERRADO_FACTURADO";

    // Paso 1: Triaje & Filiación
    if (triajeSellado) {
      if (s1) { s1.textContent = "✓ Sellado"; s1.className = "cockpit-step-status completed"; }
      if (step1El) step1El.classList.add("completed");
    } else {
      if (s1) { s1.textContent = "En curso"; s1.className = "cockpit-step-status in-progress"; }
      if (step1El) step1El.classList.remove("completed");
    }

    // Paso 2: Cobertura & Admisión
    if (admisionValidada) {
      if (s2) { s2.textContent = "✓ Validado"; s2.className = "cockpit-step-status completed"; }
      if (step2El) step2El.classList.add("completed");
    } else if (efActual !== "PENDIENTE_TRIAJE") {
      if (s2) { s2.textContent = "Pendiente"; s2.className = "cockpit-step-status in-progress"; }
      if (step2El) step2El.classList.remove("completed");
    } else {
      if (s2) { s2.textContent = "Pendiente"; s2.className = "cockpit-step-status"; }
      if (step2El) step2El.classList.remove("completed");
    }

    // Paso 3: Atención Médica & Alta
    if (altaFirmada) {
      if (s3) { s3.textContent = "✓ Alta Firmada"; s3.className = "cockpit-step-status completed"; }
      if (step3El) step3El.classList.add("completed");
    } else if (efActual === "EN_ATENCION_MEDICA") {
      if (s3) { s3.textContent = "En curso"; s3.className = "cockpit-step-status in-progress"; }
      if (step3El) step3El.classList.remove("completed");
    } else {
      if (s3) { s3.textContent = "Pendiente"; s3.className = "cockpit-step-status"; }
      if (step3El) step3El.classList.remove("completed");
    }

    // Paso 4: Liquidación & Auditoría (Caja)
    if (estaCerrado) {
      if (s4) { s4.textContent = "✓ Atendido"; s4.className = "cockpit-step-status completed"; }
      if (step4El) step4El.classList.add("completed");
    } else if (efActual === "PENDIENTE_CAJA") {
      if (s4) { s4.textContent = "Por liquidar"; s4.className = "cockpit-step-status in-progress"; }
      if (step4El) step4El.classList.remove("completed");
    } else {
      if (s4) { s4.textContent = "Pendiente"; s4.className = "cockpit-step-status"; }
      if (step4El) step4El.classList.remove("completed");
    }

    // Panel izquierdo: sombrear y cambiar a Atendido ÚNICAMENTE si realmente está cerrado y facturado
    const stepperCard = document.getElementById("cockpit_stepper_card");
    const stepperTitle = document.getElementById("cockpit_stepper_title");
    if (stepperCard && stepperTitle) {
      if (estaCerrado) {
        stepperCard.classList.add("atendido");
        const pxId = pxActual ? pxActual.id : (window.pacienteActivoId || "");
        stepperTitle.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
            <span>Fases Asistenciales</span>
            <span class="badge-atendido-pill" onclick="if(typeof window.abrirHistorialFlujoPaciente==='function'){event.stopPropagation();window.abrirHistorialFlujoPaciente('` + '${pxId}' + `');}" title="Ver Historial de lo que hizo cada rol con horas" style="cursor:pointer;">
              ✓ Atendido 📜
            </span>
          </div>
        `;
        stepperCard.setAttribute("title", "Paciente Atendido - Haga clic para ver historial de atención");
        stepperCard.onclick = function(e) {
          if (!e.target.closest(".cockpit-step-item") || e.target.closest(".badge-atendido-pill")) {
            if (typeof window.abrirHistorialFlujoPaciente === "function") {
              window.abrirHistorialFlujoPaciente(pxId);
            }
          }
        };
      } else {
        stepperCard.classList.remove("atendido");
        stepperTitle.textContent = "Fases Asistenciales (HIS)";
        stepperCard.removeAttribute("title");
        stepperCard.onclick = null;
      }
    }

    actualizarBotonAccionPrincipal();
  }

  // ----------------------------------------------------------------------------
  // 7. ACCIÓN PRINCIPAL DE POSTA CLÍNICA
  // ----------------------------------------------------------------------------
  function actualizarBotonAccionPrincipal() {
    const btn = document.getElementById("cockpit_primary_btn");
    const meta = document.getElementById("cockpit_action_meta");
    if (!btn || !meta) return;

    const rol = rolActivoVista;

    if (rol === "TRIAJE") {
      btn.textContent = "📤 Sellar Triaje y Derivar a Médico";
      meta.textContent = "Sello inmutable de enfermería · NTS N° 139-MINSA";
    } else if (rol === "ADMISION") {
      btn.textContent = "✅ Validar Cobertura y Notificar";
      meta.textContent = "Acreditación Padrón SUSALUD / SOAT en paralelo";
    } else if (rol === "MEDICO") {
      btn.textContent = "📤 Firmar Alta Clínica y Enviar a Caja";
      meta.textContent = "Estampa CMP y liberación de cama";
    } else if (rol === "CAJA") {
      btn.textContent = "💳 Emitir Liquidación y Cierre";
      meta.textContent = "Cierre formal de cuenta · Ley N° 29414";
    } else {
      if (faseActiva === 1) {
        btn.textContent = "Continuar a Cobertura & Admisión (Fase 2) →";
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
    const rol = rolActivoVista;

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
  // 8. SIMULADOR RÁPIDO DE VISTAS (MODO AUDITOR)
  // ----------------------------------------------------------------------------
  function cambiarVistaSimulada(rolDestino) {
    if (window.RBAC_FLUJO && typeof window.RBAC_FLUJO.aplicarPermisosYEnmascaramiento === "function") {
      window.RBAC_FLUJO.aplicarPermisosYEnmascaramiento(rolDestino, "DEMO");
    }

    aplicarVistaYPermisosRol(rolDestino, "DEMO");

    if (typeof window.mostrarToast === "function") {
      window.mostrarToast("info", "Vista Simulada", `Mostrando estación y módulos según rol: ${rolDestino}`);
    }
  }

  // ----------------------------------------------------------------------------
  // 9. MODO OSCURO / CLARO
  // ----------------------------------------------------------------------------
  function inicializarModoOscuro() {
    const tema = localStorage.getItem("upp_tema_ui") || "light";
    aplicarTema(tema);
  }

  function toggleDarkMode() {
    const actual = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const nuevo = actual === "dark" ? "light" : "dark";
    aplicarTema(nuevo);
  }

  function aplicarTema(tema) {
    if (tema === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.body.setAttribute("data-theme", "dark");
      const btn = document.getElementById("btn_toggle_dark_mode");
      if (btn) btn.innerHTML = "🌙 Oscuro";
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.body.removeAttribute("data-theme");
      const btn = document.getElementById("btn_toggle_dark_mode");
      if (btn) btn.innerHTML = "☀️ Claro";
    }
    localStorage.setItem("upp_tema_ui", tema);
  }

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
  // 10. INICIALIZACIÓN
  // ----------------------------------------------------------------------------
  
  function generarEImprimirPulseraInmediata() {
    if (typeof window.generarBrazaleteEmergencia === "function") {
      window.generarBrazaleteEmergencia("completo");
    }
    if (typeof window.imprimirBrazalete === "function") {
      window.imprimirBrazalete();
    } else if (typeof window.imprimirBrazaleteDirecto === "function") {
      window.imprimirBrazaleteDirecto();
    }
  }
  window.generarEImprimirPulseraInmediata = generarEImprimirPulseraInmediata;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarCockpit);
  } else {
    inicializarCockpit();
  }


  // ----------------------------------------------------------------------------
  // RESILIENCIA ANTI-CONGELAMIENTO (VISIBILITYCHANGE, FOCUS & DEBOUNCE RESIZE)
  // ----------------------------------------------------------------------------
  let todosModulosExpandidos = false;
  function toggleExpandirContraerTodo() {
    todosModulosExpandidos = !todosModulosExpandidos;
    const btn = document.getElementById("btn_expand_all_modules");
    if (btn) btn.textContent = todosModulosExpandidos ? "⤡ Contraer Todo" : "⤢ Expandir Todo";

    for (let i = 1; i <= 8; i++) {
      const body = document.getElementById("body_mod" + i);
      const arrow = document.getElementById("arrow_mod" + i);
      if (body) {
        body.style.display = todosModulosExpandidos ? "block" : (i === 1 ? "block" : "none");
        if (todosModulosExpandidos) body.classList.add("open");
        else if (i !== 1) body.classList.remove("open");
      }
      if (arrow) {
        if (todosModulosExpandidos) arrow.classList.add("open");
        else if (i !== 1) arrow.classList.remove("open");
      }
    }
    if (todosModulosExpandidos) {
      document.querySelectorAll(".cockpit-phase-container").forEach(p => { p.style.display = "block"; });
    } else {
      irAFase(faseActiva);
    }
  }

  function resincronizarSilenciosamenteAlReactivar() {
    if (document.hidden) return;
    try {
      if (typeof window.recargarColaCompartidaDesdeStorage === "function") {
        window.recargarColaCompartidaDesdeStorage();
      }
      if (typeof window.renderizarTrackBoardLista === "function") {
        window.renderizarTrackBoardLista();
      }
      if (typeof window.renderizarTableroColaPacientes === "function") {
        window.renderizarTableroColaPacientes();
      }
      if (typeof window.renderizarCarruselPreTriaje === "function") {
        window.renderizarCarruselPreTriaje();
      }
      if (typeof actualizarContextoCockpit === "function") {
        actualizarContextoCockpit();
      }
      if (typeof actualizarCamasMonitorEnTiempoReal === "function") {
        actualizarCamasMonitorEnTiempoReal();
      }
    } catch(e) {
      console.warn("Silent resync upon reactivation:", e);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resincronizarSilenciosamenteAlReactivar();
  });
  window.addEventListener("focus", resincronizarSilenciosamenteAlReactivar);

  let resizeDebounceTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      document.querySelectorAll(".modal-backdrop-orphan").forEach(el => el.remove());
      if (typeof actualizarCamasMonitorEnTiempoReal === "function") actualizarCamasMonitorEnTiempoReal();
    }, 150);
  });

  window.COCKPIT = {
    irAFase,
    ejecutarAccionPrincipal,
    seleccionarSector,
    cambiarVistaSimulada,
    aplicarVistaYPermisosRol,
    actualizarContextoCockpit,
    refrescarValoresMonitor,
    toggleDarkMode,
    toggleExpandirContraerTodo,
    resincronizarSilenciosamenteAlReactivar
  };

})();
