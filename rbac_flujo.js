// ==============================================================================
// SISTEMA DE CONTROL DE ACCESO BASADO EN ROLES (RBAC), PRIVACIDAD (LEY N° 29733)
// Y POSTA CLÍNICA EN TIEMPO REAL MULTI-PESTAÑA (NTS N° 042 / LEY N° 27604 / 29414)
// Archivo: rbac_flujo.js (Módulo no invasivo desacoplado)
// Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
// ==============================================================================

(function() {
  "use strict";

  // ----------------------------------------------------------------------------
  // 1. USUARIOS Y CREDENCIALES OFICIALES DEL SISTEMA
  // ----------------------------------------------------------------------------
  const USUARIOS_SISTEMA = {
    "triaje@upp.pe": {
      password: "triaje123",
      nombre: "Lic. Ana Torres",
      rol: "TRIAJE",
      colegiatura: "CEP 92410",
      cargo: "Enfermera de Triaje y Emergencias"
    },
    "admision@upp.pe": {
      password: "admision123",
      nombre: "Srta. Sofía Quispe",
      rol: "ADMISION",
      colegiatura: "ADM-042",
      cargo: "Responsable de Admisión y Seguros"
    },
    "medico@upp.pe": {
      password: "medico123",
      nombre: "Dr. Carlos Vega",
      rol: "MEDICO",
      colegiatura: "CMP 58321",
      cargo: "Médico Emergenciólogo de Guardia"
    },
    "caja@upp.pe": {
      password: "caja123",
      nombre: "Sr. Luis Paredes",
      rol: "CAJA",
      colegiatura: "FACT-882",
      cargo: "Cajero y Liquidador Hospitalario"
    },
    "auditor@upp.pe": {
      password: "auditor123",
      nombre: "Dra. Elena Ríos",
      rol: "AUDITOR",
      colegiatura: "CMP 41209 / RNE 18230",
      cargo: "Directora de Emergencia / Auditora SUSALUD"
    },
    "admin@upp.pe": {
      password: "admin123",
      nombre: "Dra. Elena Ríos",
      rol: "AUDITOR",
      colegiatura: "CMP 41209 / RNE 18230",
      cargo: "Directora de Emergencia / Auditora SUSALUD"
    }
  };

  // ----------------------------------------------------------------------------
  // 2. GESTIÓN DE SESIÓN POR PESTAÑA (sessionStorage AISLADO)
  // ----------------------------------------------------------------------------
  function obtenerModoOperacion() {
    return sessionStorage.getItem("UPP_MODO_OPERACION") || "DEMO";
  }

  function guardarModoOperacion(modo) {
    sessionStorage.setItem("UPP_MODO_OPERACION", modo);
  }

  function obtenerSesionActiva() {
    try {
      return JSON.parse(sessionStorage.getItem("UPP_SESION_ACTIVA") || "null");
    } catch(e) {
      return null;
    }
  }

  function guardarSesionActiva(sesion) {
    if (sesion) {
      sessionStorage.setItem("UPP_SESION_ACTIVA", JSON.stringify(sesion));
    } else {
      sessionStorage.removeItem("UPP_SESION_ACTIVA");
    }
  }

  function obtenerRolActivo() {
    const sesion = obtenerSesionActiva();
    if (obtenerModoOperacion() === "REAL" && sesion) {
      return sesion.rol;
    }
    return sessionStorage.getItem("UPP_ROL_DEMO_ACTIVO") || "AUDITOR";
  }

  function guardarRolDemoActivo(rol) {
    sessionStorage.setItem("UPP_ROL_DEMO_ACTIVO", rol);
  }

  // ----------------------------------------------------------------------------
  // 3. SINCRONIZACIÓN MULTI-PESTAÑA EN TIEMPO REAL (BroadcastChannel + localStorage)
  // ----------------------------------------------------------------------------
  let postaCanal = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      postaCanal = new BroadcastChannel("triaje_posta_canal");
      postaCanal.onmessage = function(ev) {
        if (ev.data && ev.data.tipo === "ACTUALIZAR_COLA") {
          recargarColaCompartidaDesdeStorage();
        }
      };
    } catch(e) {
      console.warn("[RBAC] BroadcastChannel no soportado:", e);
    }
  }

  window.addEventListener("storage", function(ev) {
    if (ev.key === "UPP_PACIENTES_COLA_SHARED" || ev.key === "UPP_POSTA_LAST_EVENT") {
      recargarColaCompartidaDesdeStorage();
    }
  });

  function notificarCambioColaGlobal(accion = "ACTUALIZAR") {
    try {
      if (Array.isArray(window.PACIENTES_COLA)) {
        localStorage.setItem("UPP_PACIENTES_COLA_SHARED", JSON.stringify(window.PACIENTES_COLA));
      }
      localStorage.setItem("UPP_POSTA_LAST_EVENT", JSON.stringify({
        accion: accion,
        pacienteActivoId: window.pacienteActivoId,
        timestamp: Date.now()
      }));

      if (postaCanal) {
        postaCanal.postMessage({
          tipo: "ACTUALIZAR_COLA",
          accion: accion,
          pacienteActivoId: window.pacienteActivoId,
          timestamp: Date.now()
        });
      }
    } catch(e) {}
  }

  function recargarColaCompartidaDesdeStorage() {
    try {
      const raw = localStorage.getItem("UPP_PACIENTES_COLA_SHARED");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        window.PACIENTES_COLA = parsed;
        if (window.pacienteActivoId && typeof window.STATE !== "undefined") {
          const px = window.PACIENTES_COLA.find(x => x.id === window.pacienteActivoId);
          if (px) {
            window.STATE.estadoFlujo = px.estadoFlujo || "PENDIENTE_TRIAJE";
            window.STATE.coberturaValidada = Boolean(px.coberturaValidada);
            window.STATE.firmas = px.firmas || {};
            window.STATE.alertaPrioridad1 = Boolean(px.alertaPrioridad1 || px.prioridad === "I");
          }
        }
        if (typeof window.renderizarTableroColaPacientes === "function") {
          window.renderizarTableroColaPacientes();
        }
        renderizarBandejaPosta();
        actualizarBarraAccionPosta();
        aplicarPermisosYEnmascaramiento(obtenerRolActivo(), obtenerModoOperacion());
      }
    } catch(e) {
      console.warn("[RBAC] Error al sincronizar cola multi-pestaña:", e);
    }
  }

  // ----------------------------------------------------------------------------
  // 4. INYECCIÓN DEL MODAL DE LOGIN RBAC Y BARRA DE CONTROL
  // ----------------------------------------------------------------------------
  function inyectarEstilosRBAC() {
    if (document.getElementById("rbac_custom_styles")) return;
    const style = document.createElement("style");
    style.id = "rbac_custom_styles";
    style.textContent = `
      .rbac-badge-mode {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 0.74rem;
        font-weight: 800;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .rbac-mode-demo { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
      .rbac-mode-real { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
      .rbac-badge-mode:hover { transform: translateY(-1px); filter: brightness(0.96); }

      /* Bandeja de Posta Clínica */
      .bandeja-posta-card {
        background: #ffffff;
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        padding: 14px 18px;
        margin: 14px auto 18px;
        max-width: 1350px;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
      }
      .bandeja-tabs-wrapper {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 6px;
        margin-bottom: 12px;
        border-bottom: 1.5px solid #f1f5f9;
      }
      .bandeja-tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: 8px;
        font-size: 0.78rem;
        font-weight: 700;
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        color: #475569;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.15s ease;
      }
      .bandeja-tab-btn:hover { background: #e2e8f0; }
      .bandeja-tab-btn.active {
        background: #0284c7;
        color: #ffffff;
        border-color: #0369a1;
        box-shadow: 0 2px 6px rgba(2, 132, 199, 0.3);
      }
      .bandeja-tab-btn.p1-alert {
        background: #fee2e2;
        color: #b91c1c;
        border-color: #fca5a5;
        animation: pulseAlert 1.5s infinite;
      }
      .bandeja-tab-btn.p1-alert.active {
        background: #dc2626;
        color: #ffffff;
      }
      @keyframes pulseAlert {
        0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
        50% { box-shadow: 0 0 0 5px rgba(220, 38, 38, 0.15); }
      }

      /* Barra de Acción Posta del Paciente Activo */
      .posta-action-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border: 1.5px solid #cbd5e1;
        border-radius: 10px;
        padding: 10px 14px;
        margin-top: 10px;
      }
      .posta-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 16px;
        border-radius: 8px;
        font-size: 0.84rem;
        font-weight: 800;
        color: #ffffff;
        cursor: pointer;
        border: none;
        box-shadow: 0 2px 6px rgba(0,0,0,0.12);
        transition: all 0.2s ease;
      }
      .posta-action-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }
      .btn-posta-triaje { background: #0284c7; }
      .btn-posta-admision { background: #15803d; }
      .btn-posta-medico { background: #7c3aed; }
      .btn-posta-caja { background: #059669; }

      /* Estampas de Firma */
      .firmas-container {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 6px;
      }
      .firma-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 0.72rem;
        font-weight: 700;
        background: #ecfdf5;
        color: #065f46;
        border: 1px solid #a7f3d0;
      }

      /* Enmascaramiento de confidencialidad */
      .campo-enmascarado {
        background-color: #f1f5f9 !important;
        color: #475569 !important;
        font-style: italic !important;
        font-weight: 700 !important;
        border-color: #cbd5e1 !important;
        cursor: not-allowed !important;
      }
    `;
    document.head.appendChild(style);
  }

  function inyectarModalLogin() {
    if (document.getElementById("modal_login_rbac")) return;

    const modalHtml = `
      <div id="modal_login_rbac" style="display:none; position:fixed; inset:0; z-index:99999; background:rgba(15,23,42,0.75); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:16px;">
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:14px; max-width:520px; width:100%; box-shadow:0 20px 25px -5px rgba(0,0,0,0.25); overflow:hidden;">
          
          <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#ffffff; padding:20px; border-bottom:3px solid #0284c7;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <h3 style="font-size:1.15rem; font-weight:800; margin:0 0 4px 0;">🏥 Acceso Asistencial por Roles (RBAC)</h3>
                <p style="font-size:0.78rem; color:#94a3b8; margin:0;">Autenticación de Estaciones de Emergencia · NTS N° 042-MINSA</p>
              </div>
              <button type="button" onclick="cerrarModalLoginRBAC()" style="background:transparent; border:none; color:#cbd5e1; font-size:1.25rem; cursor:pointer;">✕</button>
            </div>
          </div>

          <div style="padding:20px;">
            
            <!-- Selector de Modo -->
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:16px;">
              <span style="display:block; font-size:0.75rem; font-weight:800; color:#475569; text-transform:uppercase; margin-bottom:6px;">Seleccione Modo de Operación:</span>
              <div style="display:flex; gap:10px;">
                <label style="flex:1; display:flex; align-items:center; gap:6px; font-size:0.82rem; font-weight:700; cursor:pointer; background:#ffffff; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px;">
                  <input type="radio" name="rb_modo_op" value="DEMO" checked onchange="toggleModoOpSeleccion(this.value)">
                  <span>🧪 Modo Demo (8 pasos fluidos)</span>
                </label>
                <label style="flex:1; display:flex; align-items:center; gap:6px; font-size:0.82rem; font-weight:700; cursor:pointer; background:#ffffff; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px;">
                  <input type="radio" name="rb_modo_op" value="REAL" onchange="toggleModoOpSeleccion(this.value)">
                  <span>🏥 Modo Real Hospitalario</span>
                </label>
              </div>
            </div>

            <!-- Accesos rápidos pre-configurados -->
            <div id="box_accesos_rapidos" style="margin-bottom:16px;">
              <span style="display:block; font-size:0.75rem; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:8px;">Credenciales Oficiales (Acceso Rápido 1 Clic):</span>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <button type="button" onclick="rellenarCredencialRBAC('triaje@upp.pe', 'triaje123')" style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:8px 10px; text-align:left; cursor:pointer;">
                  <div style="font-size:0.78rem; font-weight:800; color:#15803d;">👩‍⚕️ Enf. Triaje</div>
                  <div style="font-size:0.68rem; color:#475569;">Lic. Ana Torres · CEP 92410</div>
                </button>
                <button type="button" onclick="rellenarCredencialRBAC('admision@upp.pe', 'admision123')" style="background:#eff6ff; border:1px solid #93c5fd; border-radius:8px; padding:8px 10px; text-align:left; cursor:pointer;">
                  <div style="font-size:0.78rem; font-weight:800; color:#1d4ed8;">📋 Admisión / Seguros</div>
                  <div style="font-size:0.68rem; color:#475569;">Srta. Sofía Quispe</div>
                </button>
                <button type="button" onclick="rellenarCredencialRBAC('medico@upp.pe', 'medico123')" style="background:#faf5ff; border:1px solid #d8b4fe; border-radius:8px; padding:8px 10px; text-align:left; cursor:pointer;">
                  <div style="font-size:0.78rem; font-weight:800; color:#6b21a8;">🩺 Médico Emergencia</div>
                  <div style="font-size:0.68rem; color:#475569;">Dr. Carlos Vega · CMP 58321</div>
                </button>
                <button type="button" onclick="rellenarCredencialRBAC('caja@upp.pe', 'caja123')" style="background:#ecfdf5; border:1px solid #6ee7b7; border-radius:8px; padding:8px 10px; text-align:left; cursor:pointer;">
                  <div style="font-size:0.78rem; font-weight:800; color:#047857;">💳 Facturación / Caja</div>
                  <div style="font-size:0.68rem; color:#475569;">Sr. Luis Paredes</div>
                </button>
              </div>
              <button type="button" onclick="rellenarCredencialRBAC('auditor@upp.pe', 'auditor123')" style="margin-top:10px; width:100%; background:linear-gradient(135deg, #0e7490 0%, #155e75 100%); border:none; border-radius:8px; padding:10px 14px; text-align:center; font-size:0.82rem; font-weight:800; color:#ffffff; cursor:pointer; box-shadow:0 2px 6px rgba(14,116,144,0.3);">
                ▶ Entrar como Auditor — Demo Completa de 8 Pasos
              </button>
            </div>

            <!-- Formulario de Login -->
            <form id="form_login_rbac" onsubmit="ejecutarLoginRBAC(event)">
              <div style="margin-bottom:12px;">
                <label style="display:block; font-size:0.78rem; font-weight:700; color:#334155; margin-bottom:4px;">Correo Institucional:</label>
                <input type="email" id="input_rbac_email" required value="medico@upp.pe" style="width:100%; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.88rem; box-sizing:border-box;">
              </div>
              <div style="margin-bottom:14px;">
                <label style="display:block; font-size:0.78rem; font-weight:700; color:#334155; margin-bottom:4px;">Contraseña:</label>
                <input type="password" id="input_rbac_pass" required value="medico123" style="width:100%; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.88rem; box-sizing:border-box;">
              </div>

              <!-- Mensaje discreto de simulación académica -->
              <div style="font-size:0.72rem; color:#64748b; background:#f1f5f9; padding:8px 10px; border-radius:6px; margin-bottom:14px; line-height:1.35;">
                🔒 <em>Entorno de simulación académica — en producción las credenciales se autentican en servidor (Ley N° 29733 de Protección de Datos Personales en Salud).</em>
              </div>

              <div style="display:flex; gap:10px; justify-content:space-between; align-items:center;">
                <button type="button" onclick="iniciarComoDemoDirecto()" class="btn-full-secondary" style="font-size:0.82rem; padding:9px 14px; background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:8px; font-weight:700; cursor:pointer;">
                  🧪 Continuar en Modo Demo
                </button>
                <button type="submit" class="btn-full-primary" style="font-size:0.84rem; padding:9px 20px; background:#0284c7; border:none; border-radius:8px; font-weight:800; color:#ffffff; cursor:pointer;">
                  🔑 Iniciar Sesión en Estación
                </button>
              </div>
            </form>

          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  function inyectarBarraControlHeader() {
    const headerContainer = document.querySelector("header .header-content") || document.querySelector("header > div");
    if (!headerContainer || document.getElementById("barra_control_rbac")) return;

    const controlHtml = `
      <div id="barra_control_rbac" style="display:inline-flex; align-items:center; gap:8px; margin-left:8px;">
        
        <!-- Botón Conmutador de Modo -->
        <button type="button" id="btn_toggle_modo_op" onclick="abrirModalLoginRBAC()" class="rbac-badge-mode rbac-mode-demo" title="Haga clic para cambiar entre Modo Demo (Fluido) y Modo Real (Multi-estación por roles)">
          <span id="txt_modo_badge">🧪 Modo: DEMO</span>
        </button>

        <!-- Selector Rápido de Vista Demo (Solo en Modo Demo) -->
        <div id="box_selector_demo_rapido" style="display:inline-flex; align-items:center; gap:4px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:3px 8px; font-size:0.74rem;">
          <strong style="color:#0369a1;">Vista Demo:</strong>
          <select id="sel_vista_demo_rbac" onchange="cambiarVistaDemoRapida(this.value)" style="border:none; background:transparent; font-weight:800; color:#0f172a; font-size:0.74rem; cursor:pointer;">
            <option value="ADMIN">Full (8 pasos)</option>
            <option value="TRIAJE">Triaje (Mód. 1, 2, 5)</option>
            <option value="ADMISION">Admisión (Enmascarado Ley 29733)</option>
            <option value="MEDICO">Médico (Mód. 4, 6, 7)</option>
            <option value="CAJA">Caja (Solo Mód. 8 Contable)</option>
          </select>
        </div>

        <!-- Chip de Usuario en Modo Real -->
        <div id="box_usuario_real_chip" style="display:none; align-items:center; gap:6px; background:#eff6ff; border:1px solid #93c5fd; border-radius:8px; padding:3px 8px; font-size:0.74rem;">
          <span style="font-weight:800; color:#1e40af;" id="lbl_nombre_usuario_real">—</span>
          <button type="button" onclick="cerrarSesionRBAC()" style="background:#fee2e2; border:1px solid #fca5a5; border-radius:4px; font-size:0.68rem; font-weight:800; color:#991b1b; padding:2px 6px; cursor:pointer;" title="Cerrar sesión de esta pestaña">
            🚪 Salir
          </button>
        </div>

      </div>
    `;

    const clock = document.getElementById("limaClockDisplay");
    if (clock && clock.parentElement) {
      clock.parentElement.parentElement.insertBefore(
        document.createRange().createContextualFragment(controlHtml),
        clock.parentElement
      );
    } else {
      headerContainer.insertAdjacentHTML("beforeend", controlHtml);
    }
  }

  function inyectarBandejaPostaClinica() {
    if (document.getElementById("bandeja_posta_container")) return;

    const cardsWrapper = document.getElementById("activePatientsCardsList");
    const parent = cardsWrapper ? cardsWrapper.parentElement : document.querySelector("main");
    if (!parent) return;

    const bandejaHtml = `
      <section class="bandeja-posta-card" id="bandeja_posta_container">
        
        <!-- Cabecera de la Bandeja -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.15rem;">📮</span>
            <div>
              <strong style="font-size:0.92rem; color:#0f172a;">Bandeja de Posta Clínica en Tiempo Real</strong>
              <div style="font-size:0.72rem; color:#64748b;">Flujo Asistencial Integrado · Ley N° 27604 (Emergencia Vital) &amp; NTS N° 139-MINSA</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span id="badge_p1_urgente" style="display:none; background:#fee2e2; color:#b91c1c; border:1.5px solid #f87171; border-radius:9999px; font-size:0.72rem; font-weight:900; padding:3px 10px; animation:pulseAlert 1.5s infinite;">
              🚨 ALERTA P-I: RIESGO VITAL ACTIVO
            </span>
            <button type="button" onclick="recargarColaCompartidaDesdeStorage()" class="btn-full-secondary" style="font-size:0.72rem; padding:4px 8px; border-radius:6px; cursor:pointer;" title="Sincronizar bandeja con otras pestañas">
              🔄 Sincronizar
            </button>
          </div>
        </div>

        <!-- Pestañas de Estaciones / Estado de Flujo -->
        <div class="bandeja-tabs-wrapper" id="bandeja_tabs_list">
          <button type="button" class="bandeja-tab-btn active" data-estado="TODOS" onclick="filtrarBandejaPosta('TODOS')">
            🌐 Todos (<span id="count_posta_todos">0</span>)
          </button>
          <button type="button" class="bandeja-tab-btn" data-estado="PENDIENTE_TRIAJE" onclick="filtrarBandejaPosta('PENDIENTE_TRIAJE')">
            🩺 1. Triaje Pendiente (<span id="count_posta_triaje">0</span>)
          </button>
          <button type="button" class="bandeja-tab-btn" data-estado="ADMISION" onclick="filtrarBandejaPosta('ADMISION')">
            📋 2. Admisión &amp; Seguros (<span id="count_posta_admision">0</span>)
          </button>
          <button type="button" class="bandeja-tab-btn" data-estado="EN_ATENCION_MEDICA" onclick="filtrarBandejaPosta('EN_ATENCION_MEDICA')">
            👨‍⚕️ 3. Atención Médica (<span id="count_posta_medico">0</span>)
          </button>
          <button type="button" class="bandeja-tab-btn" data-estado="PENDIENTE_CAJA" onclick="filtrarBandejaPosta('PENDIENTE_CAJA')">
            💳 4. Pendiente Caja (<span id="count_posta_caja">0</span>)
          </button>
          <button type="button" class="bandeja-tab-btn" data-estado="CERRADO_FACTURADO" onclick="filtrarBandejaPosta('CERRADO_FACTURADO')">
            🏁 5. Cerrados (<span id="count_posta_cerrados">0</span>)
          </button>
        </div>

        <!-- Barra de Acción Posta del Paciente Activo -->
        <div class="posta-action-bar" id="barra_accion_posta_activo">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="font-size:0.84rem; color:#0f172a;">
              Paciente Activo: <strong id="lbl_posta_px_nombre">—</strong> 
              <span id="lbl_posta_px_dni" style="color:#64748b; font-size:0.75rem;">(Sin DNI)</span>
            </div>
            <span id="badge_posta_estado_actual" style="font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:4px; background:#e2e8f0; color:#334155;">
              Por iniciar
            </span>
          </div>

          <!-- Botonera de Transición de Posta según rol y estado -->
          <div id="contenedor_botones_transicion_posta" style="display:flex; gap:8px; align-items:center;">
            <!-- Inyectado dinámicamente -->
          </div>
        </div>

        <!-- Estampas de Firmas de Auditoría del Paciente Activo -->
        <div class="firmas-container" id="contenedor_firmas_selladas">
          <!-- Inyectado dinámicamente -->
        </div>

      </section>
    `;

    if (cardsWrapper) {
      cardsWrapper.parentElement.insertBefore(
        document.createRange().createContextualFragment(bandejaHtml),
        cardsWrapper
      );
    }
  }

  // ----------------------------------------------------------------------------
  // 5. RENDERIZADO DE LA BANDEJA Y CONTADORES
  // ----------------------------------------------------------------------------
  let filtroBandejaActual = "TODOS";

  function renderizarBandejaPosta() {
    const cola = window.PACIENTES_COLA || [];
    
    // Contadores
    let cTodos = cola.length;
    let cTriaje = 0;
    let cAdmision = 0;
    let cMedico = 0;
    let cCaja = 0;
    let cCerrados = 0;
    let hayP1Urgente = false;

    cola.forEach(p => {
      const ef = p.estadoFlujo || "PENDIENTE_TRIAJE";
      if (p.prioridad === "I" || p.alertaPrioridad1 || p.ingresoDirectoCritico) {
        hayP1Urgente = true;
      }
      if (ef === "PENDIENTE_TRIAJE") cTriaje++;
      if (!p.coberturaValidada && ef !== "CERRADO_FACTURADO") cAdmision++;
      if (ef === "EN_ATENCION_MEDICA") cMedico++;
      if (ef === "PENDIENTE_CAJA") cCaja++;
      if (ef === "CERRADO_FACTURADO") cCerrados++;
    });

    const elTodos = document.getElementById("count_posta_todos");
    if (elTodos) elTodos.textContent = cTodos;
    const elTriaje = document.getElementById("count_posta_triaje");
    if (elTriaje) elTriaje.textContent = cTriaje;
    const elAdm = document.getElementById("count_posta_admision");
    if (elAdm) elAdm.textContent = cAdmision;
    const elMed = document.getElementById("count_posta_medico");
    if (elMed) elMed.textContent = cMedico;
    const elCaja = document.getElementById("count_posta_caja");
    if (elCaja) elCaja.textContent = cCaja;
    const elCer = document.getElementById("count_posta_cerrados");
    if (elCer) elCer.textContent = cCerrados;

    const badgeP1 = document.getElementById("badge_p1_urgente");
    if (badgeP1) {
      badgeP1.style.display = hayP1Urgente ? "inline-block" : "none";
    }

    // Actualizar botones de tabs
    document.querySelectorAll(".bandeja-tab-btn").forEach(btn => {
      if (btn.getAttribute("data-estado") === filtroBandejaActual) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    actualizarBarraAccionPosta();
  }

  function filtrarBandejaPosta(estado) {
    filtroBandejaActual = estado;
    renderizarBandejaPosta();

    const cola = window.PACIENTES_COLA || [];
    let candidato = null;
    if (estado === "TODOS") {
      candidato = cola[0];
    } else if (estado === "ADMISION") {
      candidato = cola.find(p => !p.coberturaValidada && p.estadoFlujo !== "CERRADO_FACTURADO");
    } else {
      candidato = cola.find(p => p.estadoFlujo === estado);
    }

    if (candidato && candidato.id !== window.pacienteActivoId) {
      if (typeof window.cambiarPacienteActivo === "function") {
        window.cambiarPacienteActivo(candidato.id);
      }
    }
  }

  function actualizarBarraAccionPosta() {
    const cola = window.PACIENTES_COLA || [];
    let px = cola.find(x => x.id === window.pacienteActivoId);
    if (!px && cola.length > 0) {
      px = cola[0];
    }
    const contBotones = document.getElementById("contenedor_botones_transicion_posta");
    const contFirmas = document.getElementById("contenedor_firmas_selladas");
    const lblNombre = document.getElementById("lbl_posta_px_nombre");
    const lblDni = document.getElementById("lbl_posta_px_dni");
    const badgeEstado = document.getElementById("badge_posta_estado_actual");

    if (!px) {
      if (lblNombre) lblNombre.textContent = "Ningún paciente activo";
      if (lblDni) lblDni.textContent = "";
      if (badgeEstado) badgeEstado.textContent = "—";
      if (contBotones) contBotones.innerHTML = "";
      if (contFirmas) contFirmas.innerHTML = "";
      return;
    }

    if (lblNombre) lblNombre.textContent = px.nombre || "Paciente en Atención";
    if (lblDni) lblDni.textContent = px.dni ? `(DNI ${px.dni})` : "(Indocumentado/NN)";

    const ef = px.estadoFlujo || "PENDIENTE_TRIAJE";
    const nombresEstado = {
      "PENDIENTE_TRIAJE": "🩺 1. Triaje Pendiente",
      "EN_ATENCION_MEDICA": "👨‍⚕️ 2. En Atención Médica",
      "PENDIENTE_CAJA": "💳 3. Pendiente de Caja",
      "CERRADO_FACTURADO": "🏁 4. Cerrado / Facturado"
    };

    if (badgeEstado) {
      badgeEstado.textContent = nombresEstado[ef] || ef;
      if (ef === "PENDIENTE_TRIAJE") {
        badgeEstado.style.background = "#fef3c7"; badgeEstado.style.color = "#92400e";
      } else if (ef === "EN_ATENCION_MEDICA") {
        badgeEstado.style.background = "#dbeafe"; badgeEstado.style.color = "#1e40af";
      } else if (ef === "PENDIENTE_CAJA") {
        badgeEstado.style.background = "#fae8ff"; badgeEstado.style.color = "#86198f";
      } else {
        badgeEstado.style.background = "#dcfce7"; badgeEstado.style.color = "#166534";
      }
    }

    // Renderizar botones según rol y estado actual
    const rol = obtenerRolActivo();
    const modo = obtenerModoOperacion();
    let botonesHtml = "";

    // BOTÓN TRIAJE: Sellar Triaje y Derivar a Médico
    if ((rol === "TRIAJE" || rol === "ADMIN" || modo === "DEMO") && ef === "PENDIENTE_TRIAJE") {
      botonesHtml += `
        <button type="button" onclick="sellarTriajeYDerivar()" class="posta-action-btn btn-posta-triaje" title="Sella el registro de triaje (NTS 139-MINSA) y deriva automáticamente a la bandeja médica">
          📤 Sellar Triaje y Derivar a Médico
        </button>
      `;
    }

    // BOTÓN ADMISIÓN: Validar Cobertura (En paralelo, nunca bloquea)
    if (!px.coberturaValidada && (rol === "ADMISION" || rol === "ADMIN" || modo === "DEMO") && ef !== "CERRADO_FACTURADO") {
      botonesHtml += `
        <button type="button" onclick="validarCoberturaYNotificar()" class="posta-action-btn btn-posta-admision" title="Valida SUSALUD/SOAT y notifica al médico en tiempo real sin interrumpir la atención">
          ✅ Validar Cobertura y Notificar
        </button>
      `;
    }

    // BOTÓN MÉDICO: Firmar Alta Clínica y Enviar a Caja
    if ((rol === "MEDICO" || rol === "ADMIN" || modo === "DEMO") && ef === "EN_ATENCION_MEDICA") {
      botonesHtml += `
        <button type="button" onclick="firmarAltaMedicaYEnviarCaja()" class="posta-action-btn btn-posta-medico" title="Estampa firma médica CMP y envía el expediente a Caja para liquidación">
          📤 Firmar Alta Clínica y Enviar a Cierre Administrativo
        </button>
      `;
    }

    // BOTÓN CAJA: Emitir Liquidación y Cierre Administrativo
    if ((rol === "CAJA" || rol === "ADMIN" || modo === "DEMO") && ef === "PENDIENTE_CAJA") {
      botonesHtml += `
        <button type="button" onclick="emitirLiquidacionYCierre()" class="posta-action-btn btn-posta-caja" title="Emite liquidación según Ley N° 29414 y libera el recurso hospitalario">
          💳 Emitir Liquidación y Cierre Administrativo
        </button>
      `;
    }

    if (ef === "CERRADO_FACTURADO") {
      botonesHtml += `
        <span style="font-size:0.78rem; font-weight:800; color:#15803d; background:#dcfce7; padding:6px 12px; border-radius:6px; border:1px solid #86efac;">
          ✅ Expediente Completado y Cerrado (Ley N° 29414)
        </span>
      `;
    }

    if (contBotones) contBotones.innerHTML = botonesHtml;

    // Renderizar firmas estampadas
    if (contFirmas) {
      let firmasHtml = "";
      const f = px.firmas || {};
      if (f.triaje) {
        firmasHtml += `<span class="firma-chip">✍️ Triaje: ${f.triaje.usuario} (${f.triaje.colegiatura}) · ${new Date(f.triaje.fecha).toLocaleTimeString()}</span>`;
      }
      if (f.admision) {
        firmasHtml += `<span class="firma-chip">✍️ Admisión: ${f.admision.usuario} · Cobertura Validada</span>`;
      }
      if (f.medico) {
        firmasHtml += `<span class="firma-chip">✍️ Médico: ${f.medico.usuario} (${f.medico.colegiatura}) · Alta Clínica</span>`;
      }
      if (f.caja) {
        firmasHtml += `<span class="firma-chip">✍️ Caja: ${f.caja.usuario} · Liquidación y Cierre</span>`;
      }
      contFirmas.innerHTML = firmasHtml;
    }
  }

  // ----------------------------------------------------------------------------
  // 6. ACCIONES DE POSTA CLÍNICA (TRANSICIÓN DE ESTADO Y FIRMAS)
  // ----------------------------------------------------------------------------
  function obtenerIdentidadFirmante(rol) {
    const sesion = obtenerSesionActiva();
    if (sesion && sesion.rol === rol) {
      return { usuario: sesion.nombre, colegiatura: sesion.colegiatura || "—" };
    }
    const defs = {
      "TRIAJE": { usuario: "Lic. Ana Torres", colegiatura: "CEP 92410" },
      "ADMISION": { usuario: "Srta. Sofía Quispe", colegiatura: "ADM-042" },
      "MEDICO": { usuario: "Dr. Carlos Vega", colegiatura: "CMP 58321" },
      "CAJA": { usuario: "Sr. Luis Paredes", colegiatura: "FACT-882" },
      "ADMIN": { usuario: "Dra. Elena Ríos", colegiatura: "CMP 41209" },
      "AUDITOR": { usuario: "Dra. Elena Ríos", colegiatura: "CMP 41209" }
    };
    return defs[rol] || { usuario: "Profesional UPP", colegiatura: "COL-000" };
  }

  window.sellarTriajeYDerivar = function() {
    const cola = window.PACIENTES_COLA || [];
    let px = cola.find(x => x.id === window.pacienteActivoId);
    if (!px && cola.length > 0) {
      px = cola[0];
      window.pacienteActivoId = px.id;
    }
    if (!px) { if (typeof mostrarToast === "function") mostrarToast("warning", "Revisión Requerida", "Seleccione un paciente activo en la bandeja."); else alert("Seleccione un paciente activo."); return; }

    const ident = obtenerIdentidadFirmante("TRIAJE");
    px.estadoFlujo = "EN_ATENCION_MEDICA";
    px.firmas = px.firmas || {};
    px.firmas.triaje = {
      usuario: ident.usuario,
      colegiatura: ident.colegiatura,
      fecha: new Date().toISOString()
    };

    if (window.STATE) {
      window.STATE.estadoFlujo = "EN_ATENCION_MEDICA";
      window.STATE.firmas = px.firmas;
    }

    if (typeof window.registrarLogAuditoria === "function") {
      window.registrarLogAuditoria("Módulo 1", "SELLAR_TRIAJE", `Triaje sellado por ${ident.usuario} (${ident.colegiatura}) y derivado a Médico`);
    }

    if (typeof window.mostrarToastCola === "function") {
      window.mostrarToastCola(`📤 Triaje sellado. Paciente <strong>${px.nombre}</strong> derivado a la bandeja médica.`);
    }

    notificarCambioColaGlobal("SELLAR_TRIAJE");
    renderizarBandejaPosta();
    aplicarPermisosYEnmascaramiento(obtenerRolActivo(), obtenerModoOperacion());
  };

  window.validarCoberturaYNotificar = function() {
    const cola = window.PACIENTES_COLA || [];
    let px = cola.find(x => x.id === window.pacienteActivoId);
    if (!px && cola.length > 0) {
      px = cola[0];
      window.pacienteActivoId = px.id;
    }
    if (!px) { if (typeof mostrarToast === "function") mostrarToast("warning", "Revisión Requerida", "Seleccione un paciente activo en la bandeja."); else alert("Seleccione un paciente activo."); return; }

    const ident = obtenerIdentidadFirmante("ADMISION");
    px.coberturaValidada = true;
    px.firmas = px.firmas || {};
    px.firmas.admision = {
      usuario: ident.usuario,
      fecha: new Date().toISOString()
    };

    if (window.STATE) {
      window.STATE.coberturaValidada = true;
      window.STATE.firmas = px.firmas;
    }

    if (typeof window.registrarLogAuditoria === "function") {
      window.registrarLogAuditoria("Módulo 3", "VALIDAR_COBERTURA", `Cobertura y aseguramiento validados por ${ident.usuario}`);
    }

    if (typeof window.mostrarToastCola === "function") {
      window.mostrarToastCola(`✅ Cobertura validada para <strong>${px.nombre}</strong>. Notificado al médico en tiempo real.`);
    }

    notificarCambioColaGlobal("VALIDAR_COBERTURA");
    renderizarBandejaPosta();
  };

  window.firmarAltaMedicaYEnviarCaja = function() {
    const cola = window.PACIENTES_COLA || [];
    let px = cola.find(x => x.id === window.pacienteActivoId);
    if (!px && cola.length > 0) {
      px = cola[0];
      window.pacienteActivoId = px.id;
    }
    if (!px) { if (typeof mostrarToast === "function") mostrarToast("warning", "Revisión Requerida", "Seleccione un paciente activo en la bandeja."); else alert("Seleccione un paciente activo."); return; }

    const ident = obtenerIdentidadFirmante("MEDICO");
    px.estadoFlujo = "PENDIENTE_CAJA";
    px.firmas = px.firmas || {};
    px.firmas.medico = {
      usuario: ident.usuario,
      colegiatura: ident.colegiatura,
      fecha: new Date().toISOString()
    };

    if (window.STATE) {
      window.STATE.estadoFlujo = "PENDIENTE_CAJA";
      window.STATE.firmas = px.firmas;
    }

    if (typeof window.sincronizarFacturacionYExportar === "function") {
      window.sincronizarFacturacionYExportar(true);
    }

    if (typeof window.registrarLogAuditoria === "function") {
      window.registrarLogAuditoria("Módulo 7", "ALTA_MEDICA", `Alta médica firmada por ${ident.usuario} (${ident.colegiatura}) y enviada a Caja`);
    }

    if (typeof window.mostrarToastCola === "function") {
      window.mostrarToastCola(`📤 Alta médica firmada para <strong>${px.nombre}</strong>. Expediente enviado a Caja.`);
    }

    notificarCambioColaGlobal("ALTA_MEDICA");
    renderizarBandejaPosta();
    aplicarPermisosYEnmascaramiento(obtenerRolActivo(), obtenerModoOperacion());
  };

  window.emitirLiquidacionYCierre = function() {
    const cola = window.PACIENTES_COLA || [];
    let px = cola.find(x => x.id === window.pacienteActivoId);
    if (!px && cola.length > 0) {
      px = cola[0];
      window.pacienteActivoId = px.id;
    }
    if (!px) { if (typeof mostrarToast === "function") mostrarToast("warning", "Revisión Requerida", "Seleccione un paciente activo en la bandeja."); else alert("Seleccione un paciente activo."); return; }

    const ident = obtenerIdentidadFirmante("CAJA");
    px.estadoFlujo = "CERRADO_FACTURADO";
    px.firmas = px.firmas || {};
    px.firmas.caja = {
      usuario: ident.usuario,
      fecha: new Date().toISOString()
    };

    if (window.STATE) {
      window.STATE.estadoFlujo = "CERRADO_FACTURADO";
      window.STATE.firmas = px.firmas;
    }

    // Liberar recurso de cama si aplica
    if (px.camaId && typeof window.liberarRecursoHospitalarioOperativo === "function") {
      window.liberarRecursoHospitalarioOperativo(px.camaId);
    } else if (px.camaId && typeof window.RECURSOS_HOSPITALARIOS !== "undefined" && window.RECURSOS_HOSPITALARIOS[px.camaId]) {
      window.RECURSOS_HOSPITALARIOS[px.camaId].estado = "disponible";
      window.RECURSOS_HOSPITALARIOS[px.camaId].pacienteId = null;
      window.RECURSOS_HOSPITALARIOS[px.camaId].pacienteNombre = null;
    }

    if (typeof window.actualizarFactura === "function") {
      window.actualizarFactura();
    }
    if (typeof window.sincronizarFacturacionYExportar === "function") {
      window.sincronizarFacturacionYExportar(false);
    }

    if (typeof window.registrarLogAuditoria === "function") {
      window.registrarLogAuditoria("Módulo 8", "CIERRE_LIQUIDACION", `Liquidación oficial emitida y cuenta cerrada por ${ident.usuario} (Ley N° 29414)`);
    }

    if (typeof window.mostrarToastCola === "function") {
      window.mostrarToastCola(`💳 Cuenta liquidada para <strong>${px.nombre}</strong>. Cierre completado sin retención.`);
    }

    notificarCambioColaGlobal("CIERRE_LIQUIDACION");
    renderizarBandejaPosta();
    aplicarPermisosYEnmascaramiento(obtenerRolActivo(), obtenerModoOperacion());
  };

  // ----------------------------------------------------------------------------
  // 7. ENMASCARAMIENTO Y PRIVACIDAD (LEY N° 29733) & CONTROL DE MÓDULOS
  // ----------------------------------------------------------------------------
  function aplicarPermisosYEnmascaramiento(rol, modo) {
    rol = rol || "AUDITOR";
    modo = modo || "DEMO";

    const elMotivo = document.getElementById("motivo_full");
    const elAlergias = document.getElementById("alergias_full");
    const vitalesIds = ["spo2_full", "fc_full", "pas_full", "pad_full", "fr_full", "temp_full", "glasgow_full", "glucosa_full"];

    // A) Si es MODO DEMO en vista FULL: todo visible y editable
    if ((modo === "DEMO" && (rol === "ADMIN" || rol === "AUDITOR")) || rol === "AUDITOR" || rol === "ADMIN") {
      desenmascararCampo(elMotivo, window.STATE?.motivoConsulta);
      desenmascararCampo(elAlergias, window.STATE?.alergias);
      vitalesIds.forEach(id => {
        const el = document.getElementById(id);
        desenmascararCampo(el, window.STATE?.[id.replace("_full", "")]);
      });
      desbloquearTodosLosModulos(true);
      return;
    }

    // B) ENMASCARAMIENTO PARA ADMISIÓN: Motivo y Alergias protegidos
    if (rol === "ADMISION") {
      enmascararCampo(elMotivo, "🔒 [Confidencialidad Clínica — Ley N° 29733]");
      enmascararCampo(elAlergias, "🔒 [Confidencialidad Clínica — Ley N° 29733]");
      vitalesIds.forEach(id => {
        const el = document.getElementById(id);
        desenmascararCampo(el, window.STATE?.[id.replace("_full", "")]);
      });

      // Módulos permitidos en Admisión: 2 y 3. Otros bloqueados.
      bloquearModulo(1, true);
      bloquearModulo(2, false);
      bloquearModulo(3, false);
      bloquearModulo(4, true);
      bloquearModulo(5, true);
      bloquearModulo(6, true);
      bloquearModulo(7, true);
      bloquearModulo(8, true);
      return;
    }

    // C) ENMASCARAMIENTO PARA CAJA / FACTURACIÓN:
    // Motivo, Signos Vitales detallados, Alergias y notas protegidos
    if (rol === "CAJA" || rol === "FACTURACION") {
      enmascararCampo(elMotivo, "🔒 [Confidencialidad Clínica — Ley N° 29733]");
      enmascararCampo(elAlergias, "🔒 [Confidencialidad Clínica — Ley N° 29733]");
      vitalesIds.forEach(id => {
        const el = document.getElementById(id);
        enmascararCampo(el, "***");
      });

      // Módulos 1 al 7 bloqueados/solo lectura. Módulo 8 editable.
      for (let i = 1; i <= 7; i++) bloquearModulo(i, true);
      bloquearModulo(8, false);
      return;
    }

    // D) ENFERMERÍA DE TRIAJE:
    // Edita 1, 2, 5. Módulo 3 solo lectura. Módulos 4, 6, 7, 8 bloqueados.
    if (rol === "TRIAJE" || rol === "ENF_TRIAJE") {
      desenmascararCampo(elMotivo, window.STATE?.motivoConsulta);
      desenmascararCampo(elAlergias, window.STATE?.alergias);
      vitalesIds.forEach(id => {
        const el = document.getElementById(id);
        desenmascararCampo(el, window.STATE?.[id.replace("_full", "")]);
      });

      bloquearModulo(1, false);
      bloquearModulo(2, false);
      bloquearModulo(3, true);
      bloquearModulo(4, true);
      bloquearModulo(5, false);
      bloquearModulo(6, true);
      bloquearModulo(7, true);
      bloquearModulo(8, true);
      return;
    }

    // E) MÉDICO DE EMERGENCIA:
    // Módulo 1 sellado solo lectura. Módulos 4, 6, 7 editables. Módulo 8 solo lectura.
    if (rol === "MEDICO") {
      desenmascararCampo(elMotivo, window.STATE?.motivoConsulta);
      desenmascararCampo(elAlergias, window.STATE?.alergias);
      vitalesIds.forEach(id => {
        const el = document.getElementById(id);
        desenmascararCampo(el, window.STATE?.[id.replace("_full", "")]);
      });

      bloquearModulo(1, true); // Sellado NTS 139
      bloquearModulo(2, true);
      bloquearModulo(3, true);
      bloquearModulo(4, false);
      bloquearModulo(5, true);
      bloquearModulo(6, false);
      bloquearModulo(7, false);
      bloquearModulo(8, true); // Costos referenciales solo lectura
      return;
    }

    // F) ADMIN / SUPERVISOR: Todo accesible
    desenmascararCampo(elMotivo, window.STATE?.motivoConsulta);
    desenmascararCampo(elAlergias, window.STATE?.alergias);
    vitalesIds.forEach(id => {
      const el = document.getElementById(id);
      desenmascararCampo(el, window.STATE?.[id.replace("_full", "")]);
    });
    desbloquearTodosLosModulos(true);
  }

  function enmascararCampo(el, placeholderText) {
    if (!el) return;
    if (el.dataset.rbacOriginalValue === undefined) {
      el.dataset.rbacOriginalValue = el.value || "";
    }
    if (el.type === "number") {
      el.dataset.rbacOriginalType = "number";
      try { el.type = "text"; } catch(e){}
    }
    el.value = placeholderText;
    el.disabled = true;
    el.classList.add("campo-enmascarado");
    el.title = "🔒 Información médica protegida bajo la Ley N° 29733 de Protección de Datos Personales";
  }

  function desenmascararCampo(el, valorRealFallback) {
    if (!el) return;
    if (el.dataset.rbacOriginalType) {
      try { el.type = el.dataset.rbacOriginalType; } catch(e){}
      delete el.dataset.rbacOriginalType;
    }
    if (el.dataset.rbacOriginalValue !== undefined) {
      el.value = el.dataset.rbacOriginalValue;
      delete el.dataset.rbacOriginalValue;
    } else if (valorRealFallback !== undefined && valorRealFallback !== null) {
      el.value = valorRealFallback;
    }
    el.disabled = false;
    el.classList.remove("campo-enmascarado");
    el.title = "";
  }

  function bloquearModulo(num, bloquear) {
    const modEl = document.getElementById(`sec_mod${num}`) || document.getElementById(`body_mod${num}`);
    if (!modEl) return;
    const inputs = modEl.querySelectorAll("input:not(#chk_consentimiento_firmado), select:not(#sel_vista_demo_rbac):not(#selector_rol_sistema), textarea");
    inputs.forEach(inp => {
      inp.disabled = Boolean(bloquear);
      if (bloquear) {
        inp.style.backgroundColor = "#f8fafc";
        inp.style.cursor = "not-allowed";
      } else {
        inp.style.backgroundColor = "";
        inp.style.cursor = "";
      }
    });
  }

  function desbloquearTodosLosModulos(editable = true) {
    for (let i = 1; i <= 8; i++) {
      bloquearModulo(i, !editable);
    }
  }

  // ----------------------------------------------------------------------------
  // 8. FUNCIONES DE MODAL DE LOGIN Y TRANSICIÓN DE VISTAS
  // ----------------------------------------------------------------------------
  window.abrirModalLoginRBAC = function() {
    const modal = document.getElementById("modal_login_rbac");
    if (modal) {
      modal.style.display = "flex";
      const modo = obtenerModoOperacion();
      const rb = document.querySelector(`input[name="rb_modo_op"][value="${modo}"]`);
      if (rb) rb.checked = true;
      toggleModoOpSeleccion(modo);
    }
  };

  window.cerrarModalLoginRBAC = function() {
    const modal = document.getElementById("modal_login_rbac");
    if (modal) modal.style.display = "none";
  };

  window.toggleModoOpSeleccion = function(modo) {
    const boxAcc = document.getElementById("box_accesos_rapidos");
    if (boxAcc) {
      boxAcc.style.opacity = modo === "DEMO" ? "0.6" : "1";
    }
  };

  window.rellenarCredencialRBAC = function(email, pass) {
    const inEmail = document.getElementById("input_rbac_email");
    const inPass = document.getElementById("input_rbac_pass");
    if (inEmail) inEmail.value = email;
    if (inPass) inPass.value = pass;
    const rbReal = document.querySelector('input[name="rb_modo_op"][value="REAL"]');
    if (rbReal) rbReal.checked = true;
    toggleModoOpSeleccion("REAL");
  };

  window.ejecutarLoginRBAC = function(ev) {
    if (ev) ev.preventDefault();
    const inEmail = document.getElementById("input_rbac_email");
    const inPass = document.getElementById("input_rbac_pass");
    const email = inEmail ? inEmail.value.trim().toLowerCase() : "";
    const pass = inPass ? inPass.value : "";
    const rbs = document.getElementsByName("rb_modo_op");
    let modoElegido = "REAL";
    for (let r of rbs) { if (r.checked) { modoElegido = r.value; break; } }

    const usr = USUARIOS_SISTEMA[email];
    if (!usr || usr.password !== pass) {
      if (typeof window.UI_FEEDBACK?.mostrarModalClinico === "function") {
        window.UI_FEEDBACK.mostrarModalClinico({
          titulo: "Credenciales Incorrectas",
          mensaje: "Las credenciales ingresadas no corresponden a ningún perfil institucional.\nPuede utilizar los botones de acceso rápido pre-configurados.",
          icono: "danger",
          textoConfirmar: "Reintentar"
        });
      } else {
        alert("❌ Credenciales incorrectas.\n\nPuede utilizar cualquiera de los botones de acceso rápido pre-configurados.");
      }
      return;
    }

    // Iniciar sesión real para esta pestaña
    guardarModoOperacion("REAL");
    guardarSesionActiva({
      email: email,
      nombre: usr.nombre,
      rol: usr.rol,
      colegiatura: usr.colegiatura,
      cargo: usr.cargo
    });

    cerrarModalLoginRBAC();
    actualizarInterfazSegunModoYSesion();

    if (typeof window.mostrarToastCola === "function") {
      window.mostrarToastCola(`🔑 Sesión iniciada: <strong>${usr.nombre}</strong> (${usr.cargo})`);
    }

    // Redirigir al módulo principal del rol
    const modDestinos = { "TRIAJE": 1, "ADMISION": 2, "MEDICO": 4, "CAJA": 8, "ADMIN": 1 };
    if (typeof window.irAModulo === "function") {
      window.irAModulo(modDestinos[usr.rol] || 1);
    }
  };

  window.iniciarComoDemoDirecto = function() {
    guardarModoOperacion("DEMO");
    guardarSesionActiva(null);
    guardarRolDemoActivo("ADMIN");
    cerrarModalLoginRBAC();
    actualizarInterfazSegunModoYSesion();
    if (typeof window.mostrarToastCola === "function") {
      window.mostrarToastCola("🧪 Modo Demo / Simulación Integral activo (8 pasos fluidos).");
    }
  };

  window.cerrarSesionRBAC = function() {
    guardarSesionActiva(null);
    guardarModoOperacion("REAL");
    actualizarInterfazSegunModoYSesion();
    abrirModalLoginRBAC();
  };

  window.cambiarVistaDemoRapida = function(rol) {
    guardarRolDemoActivo(rol);
    aplicarPermisosYEnmascaramiento(rol, "DEMO");
    actualizarBarraAccionPosta();

    const nombres = {
      "ADMIN": "Full (8 pasos accesibles)",
      "TRIAJE": "Enfermería de Triaje",
      "ADMISION": "Admisión (Datos clínicos enmascarados)",
      "MEDICO": "Médico de Emergencia (Triaje sellado)",
      "CAJA": "Caja / Facturación (Solo Módulo 8)"
    };
    if (typeof window.mostrarToastCola === "function") {
      window.mostrarToastCola(`👁️ Vista Demo: <strong>${nombres[rol] || rol}</strong>`);
    }

    const modDestinos = { "TRIAJE": 1, "ADMISION": 2, "MEDICO": 4, "CAJA": 8, "ADMIN": 1 };
    if (typeof window.irAModulo === "function") {
      window.irAModulo(modDestinos[rol] || 1);
    }
  };

  function actualizarInterfazSegunModoYSesion() {
    const modo = obtenerModoOperacion();
    const sesion = obtenerSesionActiva();
    const btnModo = document.getElementById("btn_toggle_modo_op");
    const txtBadge = document.getElementById("txt_modo_badge");
    const boxDemo = document.getElementById("box_selector_demo_rapido");
    const boxReal = document.getElementById("box_usuario_real_chip");
    const lblUser = document.getElementById("lbl_nombre_usuario_real");
    const selDemo = document.getElementById("sel_vista_demo_rbac");

    if (modo === "REAL" && sesion) {
      if (btnModo) { btnModo.className = "rbac-badge-mode rbac-mode-real"; }
      if (txtBadge) { txtBadge.textContent = `🏥 Modo: REAL (${sesion.rol})`; }
      if (boxDemo) { boxDemo.style.display = "none"; }
      if (boxReal) { boxReal.style.display = "inline-flex"; }
      if (lblUser) { lblUser.textContent = `${sesion.nombre} (${sesion.colegiatura || sesion.rol})`; }
      aplicarPermisosYEnmascaramiento(sesion.rol, "REAL");
    } else {
      if (btnModo) { btnModo.className = "rbac-badge-mode rbac-mode-demo"; }
      if (txtBadge) { txtBadge.textContent = "🧪 Modo: DEMO"; }
      if (boxDemo) { boxDemo.style.display = "inline-flex"; }
      if (boxReal) { boxReal.style.display = "none"; }
      const rolDemo = sessionStorage.getItem("UPP_ROL_DEMO_ACTIVO") || "AUDITOR";
      if (selDemo) selDemo.value = rolDemo;
      aplicarPermisosYEnmascaramiento(rolDemo, "DEMO");
    }

    renderizarBandejaPosta();
    actualizarBarraAccionPosta();
  }

  // ----------------------------------------------------------------------------
  // 9. INICIALIZACIÓN GLOBAL AL CARGAR EL DOM
  // ----------------------------------------------------------------------------
  function initRBAC() {
    // Interceptar renderizarTableroColaPacientes para mantener la bandeja de posta siempre al día
    const origRenderizarCola = window.renderizarTableroColaPacientes;
    if (typeof origRenderizarCola === 'function' && !window._colaHookeadaRBAC) {
      window._colaHookeadaRBAC = true;
      window.renderizarTableroColaPacientes = function() {
        origRenderizarCola.apply(this, arguments);
        renderizarBandejaPosta();
      };
    }
    inyectarEstilosRBAC();
    inyectarModalLogin();
    inyectarBarraControlHeader();
    inyectarBandejaPostaClinica();

    // Sincronizar cola inicial si existe en storage
    recargarColaCompartidaDesdeStorage();

    // Actualizar interfaz
    actualizarInterfazSegunModoYSesion();

    // Si está en Modo Real pero no tiene sesión, abrir login
    if (obtenerModoOperacion() === "REAL" && !obtenerSesionActiva()) {
      abrirModalLoginRBAC();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRBAC);
  } else {
    initRBAC();
  }

  // Exponer API en window para interoperabilidad
  window.RBAC_FLUJO = {
    obtenerModoOperacion,
    guardarModoOperacion,
    obtenerSesionActiva,
    obtenerRolActivo,
    renderizarBandejaPosta,
    actualizarBarraAccionPosta,
    aplicarPermisosYEnmascaramiento,
    notificarCambioColaGlobal
  };

  window.actualizarBandejaPostaUI = function() {
    renderizarBandejaPosta();
    actualizarBarraAccionPosta();
  };

})();
