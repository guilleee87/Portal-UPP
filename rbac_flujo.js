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
        if (ev.data && (ev.data.tipo === "ACTUALIZAR_COLA" || ev.data.tipo === "EXPEDIENTE_ACTUALIZADO" || ev.data.tipo === "REINICIO_GUARDIA_DEMO")) {
          if (typeof window.refrescarTrackBoardYBandeja === "function") {
            window.refrescarTrackBoardYBandeja(ev.data);
          } else {
            recargarColaCompartidaDesdeStorage();
          }
        }
      };
    } catch(e) {
      console.warn("[RBAC] BroadcastChannel no soportado:", e);
    }
  }

  window.addEventListener("storage", function(ev) {
    if (ev.key === "UPP_PACIENTES_COLA_SHARED" || ev.key === "UPP_POSTA_LAST_EVENT" || ev.key === "upp_expedientes_v1") {
      let evData = null;
      try {
        if (ev.key === "UPP_POSTA_LAST_EVENT" && ev.newValue) evData = JSON.parse(ev.newValue);
      } catch(e){}
      if (typeof window.refrescarTrackBoardYBandeja === "function") {
        window.refrescarTrackBoardYBandeja(evData || { key: ev.key });
      } else {
        recargarColaCompartidaDesdeStorage();
      }
    }
  });

  function guardarExpedienteSincrono(px, nuevoEstadoFlujo, firmaObj, accionLog) {
    if (!px) return;
    if (typeof window.guardarEstadoPacienteActivo === "function") {
      window.guardarEstadoPacienteActivo();
    }

    // Captura exhaustiva de estado actual de inputs y datos clínicos del paciente (Corrección 1)
    const state = window.STATE || {};
    px.dni = (document.getElementById("dni_reniec_input")?.value || document.getElementById("dni_mod1")?.value || state.numDni || px.dni);
    px.nombre = (state.nombreReniec || px.nombre);
    px.edad = (document.getElementById("edad_full")?.value || state.edad || px.edad);
    px.sexo = (document.getElementById("sexo_full")?.value || state.sexo || px.sexo);
    px.prioridad = (state.prioridad || px.prioridad || "V");
    px.camaId = (state.camaAsignadaId || px.camaId);
    px.camaNombre = (state.camaAsignada || px.camaNombre);
    px.alergias = (document.getElementById("alergias_full")?.value || state.alergias || px.alergias || "");
    px.tipoSeguro = (state.tipoSeguro || px.tipoSeguro);
    px.nroFua = (state.nroFua || px.nroFua);
    px.estadoFua = (state.estadoFua || px.estadoFua);
    px.nroEssi = (state.nroEssi || px.nroEssi);
    px.estadoEssi = (state.estadoEssi || px.estadoEssi);
    px.cie10 = (state.cie10 || state.cie10Codigo || px.cie10);
    px.montos = {
      total: state.montoTotal || (typeof calcularLiquidacionSeguro === "function" ? calcularLiquidacionSeguro().totalBruto : 0),
      paciente: state.totalPaciente || (typeof calcularLiquidacionSeguro === "function" ? calcularLiquidacionSeguro().totalPaciente : 0)
    };

    if (nuevoEstadoFlujo) {
      px.estadoFlujo = nuevoEstadoFlujo;
      if (window.STATE) window.STATE.estadoFlujo = nuevoEstadoFlujo;
    }
    if (firmaObj) {
      px.firmas = px.firmas || {};
      const keyFirma = (firmaObj.rol || "auditor").toLowerCase();
      px.firmas[keyFirma] = firmaObj;
      if (window.STATE) {
        window.STATE.firmas = window.STATE.firmas || {};
        window.STATE.firmas[keyFirma] = firmaObj;
      }
    }

    // Persistir en expedientesStore (upp_expedientes_v1)
    try {
      const raw = localStorage.getItem("upp_expedientes_v1");
      const store = raw ? JSON.parse(raw) : {};
      store[px.id] = {
        id: px.id,
        paciente: JSON.parse(JSON.stringify(px)),
        state: window.STATE ? JSON.parse(JSON.stringify(window.STATE)) : null,
        form: typeof window.capturarFormularioActual === "function" ? window.capturarFormularioActual() : null,
        timestamp: Date.now()
      };
      localStorage.setItem("upp_expedientes_v1", JSON.stringify(store));
    } catch(e) {}

    // Sincronizar en cola compartida UPP_PACIENTES_COLA_SHARED
    try {
      if (Array.isArray(window.PACIENTES_COLA)) {
        localStorage.setItem("UPP_PACIENTES_COLA_SHARED", JSON.stringify(window.PACIENTES_COLA));
      }
      localStorage.setItem("UPP_POSTA_LAST_EVENT", JSON.stringify({
        tipo: "EXPEDIENTE_ACTUALIZADO",
        accion: accionLog || "ACTUALIZAR",
        idExpediente: px.id,
        estadoFlujo: px.estadoFlujo,
        pacienteActivoId: px.id,
        timestamp: Date.now()
      }));
    } catch(e) {}

    // Notificar por BroadcastChannel
    if (postaCanal) {
      try {
        postaCanal.postMessage({
          tipo: "EXPEDIENTE_ACTUALIZADO",
          accion: accionLog || "ACTUALIZAR",
          idExpediente: px.id,
          estadoFlujo: px.estadoFlujo,
          pacienteActivoId: px.id,
          timestamp: Date.now()
        });
      } catch(e) {}
    }

    // Sincronizar en Supabase si está disponible
    if (typeof window.SUPABASE_CONFIG !== "undefined" && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.key && window.STATE && window.STATE.identificador) {
      try {
        fetch(`${window.SUPABASE_CONFIG.url}/rest/v1/historias_clinicas?or=(identificador.eq.${encodeURIComponent(window.STATE.identificador)},identificador.ilike.*${encodeURIComponent(window.STATE.identificador)}*)`, {
          method: "PATCH",
          headers: {
            "apikey": window.SUPABASE_CONFIG.key,
            "Authorization": `Bearer ${window.SUPABASE_CONFIG.key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            estado_flujo: px.estadoFlujo,
            firmas: px.firmas,
            cobertura_validada: Boolean(px.coberturaValidada)
          })
        }).catch(() => {});
      } catch(e) {}
    }
  }

  function notificarCambioColaGlobal(accion = "ACTUALIZAR") {
    try {
      if (Array.isArray(window.PACIENTES_COLA)) {
        localStorage.setItem("UPP_PACIENTES_COLA_SHARED", JSON.stringify(window.PACIENTES_COLA));
      }
      localStorage.setItem("UPP_POSTA_LAST_EVENT", JSON.stringify({
        tipo: "EXPEDIENTE_ACTUALIZADO",
        accion: accion,
        pacienteActivoId: window.pacienteActivoId,
        timestamp: Date.now()
      }));

      if (postaCanal) {
        postaCanal.postMessage({
          tipo: "EXPEDIENTE_ACTUALIZADO",
          accion: accion,
          pacienteActivoId: window.pacienteActivoId,
          timestamp: Date.now()
        });
      }
    } catch(e) {}
  }

  window.refrescarTrackBoardYBandeja = function(evData) {
    recargarColaCompartidaDesdeStorage();
    const rol = (window.RBAC_FLUJO && typeof window.RBAC_FLUJO.obtenerRolActivo === 'function') ? window.RBAC_FLUJO.obtenerRolActivo() : (typeof obtenerRolActivo === 'function' ? obtenerRolActivo() : 'AUDITOR');
    const cola = window.PACIENTES_COLA || [];

    // Rehidratar si el paciente activo actual fue el actualizado desde otra pestaña/rol
    if (window.pacienteActivoId && evData && evData.idExpediente === window.pacienteActivoId) {
      if (typeof window.cambiarPacienteActivo === "function") {
        window.cambiarPacienteActivo(window.pacienteActivoId, true);
      }
    }

    if (cola.length > 0) {
      let pxPendiente = null;
      if (rol === "MEDICO") {
        pxPendiente = cola.find(p => p.estadoFlujo === "EN_ATENCION_MEDICA");
      } else if (rol === "ADMISION") {
        pxPendiente = cola.find(p => !p.coberturaValidada && p.estadoFlujo !== "CERRADO_FACTURADO");
      } else if (rol === "CAJA") {
        pxPendiente = cola.find(p => p.estadoFlujo === "PENDIENTE_CAJA");
      } else if (rol === "TRIAJE") {
        pxPendiente = cola.find(p => p.estadoFlujo === "PENDIENTE_TRIAJE");
      }

      // Auto-seleccionar si el rol no tiene paciente activo o el actual no corresponde a su bandeja
      const pxActual = cola.find(p => p.id === window.pacienteActivoId);
      const debeCargarPendiente = pxPendiente && (
        !window.pacienteActivoId ||
        !pxActual ||
        (rol === "MEDICO" && pxActual.estadoFlujo !== "EN_ATENCION_MEDICA") ||
        (rol === "CAJA" && pxActual.estadoFlujo !== "PENDIENTE_CAJA") ||
        (rol === "ADMISION" && pxActual.coberturaValidada && !pxPendiente.coberturaValidada)
      );

      if (debeCargarPendiente) {
        seleccionarExpediente(pxPendiente.id);
        if (typeof window.mostrarToastCola === "function") {
          window.mostrarToastCola(`📥 <strong>Bandeja ${rol}:</strong> Paciente <strong>${pxPendiente.nombre || 'Paciente'}</strong> listo para atención.`);
        }
      }
    }

    // Refrescar vistas del sistema inmediatamente
    renderizarBandejaPosta();
    actualizarBarraAccionPosta();
    renderizarTrackBoardLista();
    if (typeof window.renderizarTableroColaPacientes === "function") {
      window.renderizarTableroColaPacientes();
    }
    if (window.COCKPIT && typeof window.COCKPIT.actualizarTarjetaResumenTriaje === "function") {
      window.COCKPIT.actualizarTarjetaResumenTriaje();
    }
    if (window.COCKPIT && typeof window.COCKPIT.actualizarContextoCockpit === "function") {
      window.COCKPIT.actualizarContextoCockpit();
    }
  };

  function recargarColaCompartidaDesdeStorage() {
    try {
      const raw = localStorage.getItem("UPP_PACIENTES_COLA_SHARED");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        window.PACIENTES_COLA = parsed;

        // Mezclar snapshots completos desde expedientesStore (upp_expedientes_v1)
        try {
          const storeRaw = localStorage.getItem("upp_expedientes_v1");
          if (storeRaw) {
            const store = JSON.parse(storeRaw);
            window.PACIENTES_COLA.forEach(p => {
              if (store[p.id]) {
                if (store[p.id].state) p.stateSnapshot = store[p.id].state;
                if (store[p.id].form) p.formSnapshot = store[p.id].form;
                if (store[p.id].paciente) {
                  Object.assign(p, store[p.id].paciente);
                }
              }
            });
          }
        } catch(e){}

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
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.15rem;">📮</span>
            <div>
              <strong style="font-size:0.86rem; color:#0f172a;">Bandeja de Posta Clínica en Tiempo Real</strong>
              <div style="font-size:0.70rem; color:#64748b;">Flujo Asistencial Integrado · Ley N° 27604 &amp; NTS N° 139-MINSA</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button type="button" onclick="abrirModalHistoricoDiasAnteriores()" class="btn-full-secondary" style="font-size:0.68rem; height:26px; padding:2px 8px; border-radius:6px; cursor:pointer; background:#f0fdf4; color:#15803d; border:1px solid #86efac; font-weight:700; white-space:nowrap; display:inline-flex; align-items:center; gap:3px;" title="Consultar atenciones de días anteriores">
              <span>📅</span> <span>Histórico</span>
            </button>
            <button type="button" onclick="abrirModalReinicioSimulacion()" class="btn-full-secondary" style="font-size:0.68rem; height:26px; padding:2px 8px; border-radius:6px; cursor:pointer; background:#fff1f2; color:#be123c; border:1px solid #fda4af; font-weight:800; white-space:nowrap; display:inline-flex; align-items:center; gap:3px;" title="⚠️ Botón exclusivo de simulación y demostración: Reiniciar guardia">
              <span>⚠️</span> <span>Demo</span>
            </button>
            <button type="button" onclick="recargarColaCompartidaDesdeStorage()" class="btn-full-secondary" style="font-size:0.68rem; height:26px; padding:2px 8px; border-radius:6px; cursor:pointer; background:#ffffff; color:#334155; border:1px solid #cbd5e1; font-weight:700; white-space:nowrap; display:inline-flex; align-items:center; gap:3px;" title="Sincronizar bandeja con otras pestañas">
              <span>🔄</span> <span>Sync</span>
            </button>
          </div>
        </div>
        <div id="badge_p1_urgente" style="display:none; width:100%; box-sizing:border-box; background:#fee2e2; color:#b91c1c; border:1.5px solid #f87171; border-radius:6px; font-size:0.70rem; font-weight:900; padding:4px 10px; animation:pulseAlert 1.5s infinite; text-align:center; white-space:nowrap; margin-bottom:8px;">
          🚨 ALERTA P-I: RIESGO VITAL ACTIVO EN COLA
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

        <!-- ED Track Board (Tablero Priorizado de Pacientes) -->
        <div id="trackboard_pacientes_lista" style="display:flex; flex-direction:column; gap:6px; margin: 10px 0; max-height:220px; overflow-y:auto; padding-right:4px;">
          <!-- Filas de expedientes renderizadas dinámicamente -->
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

  window.renderizarBandejaPosta = function() { return renderizarBandejaPosta(); };
  function renderizarBandejaPosta() {
    if (!document.getElementById("bandeja_posta_container")) return;
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
      if ((p.prioridad === "I" || p.ingresoDirectoCritico) && p.prioridad === "I") {
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
      badgeP1.style.display = hayP1Urgente ? "block" : "none";
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
    if (typeof renderizarTrackBoardLista === "function") {
      renderizarTrackBoardLista();
    }
    if (typeof sincronizarExpedienteActivoEnStore === "function") {
      sincronizarExpedienteActivoEnStore();
    }
  }

  window.filtrarBandejaPosta = function(estado) { return filtrarBandejaPosta(estado); };
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
    const rol = (window.RBAC_FLUJO && typeof window.RBAC_FLUJO.obtenerRolActivo === 'function') ? window.RBAC_FLUJO.obtenerRolActivo() : (typeof obtenerRolActivo === 'function' ? obtenerRolActivo() : 'AUDITOR');
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

  
  // ----------------------------------------------------------------------------
  // VALIDACIÓN ESTRICTA: PREVENCIÓN DE CIERRE / FACTURACIÓN SIN PACIENTE NI DATOS
  // ----------------------------------------------------------------------------
  function validarPacienteYDatosParaFlujo(accionRequerida = "TRIAJE") {
    const cola = (typeof window.PACIENTES_COLA !== "undefined" && Array.isArray(window.PACIENTES_COLA)) ? window.PACIENTES_COLA : [];
    
    // 1. REGLA: Debe haber pacientes en la cola o en STATE activo
    if (cola.length === 0 && !(window.STATE && (window.STATE.numDni || window.STATE.nombreReniec || window.STATE.esNN || window.STATE.prioridad))) {
      const msg = "⚠️ ACCIÓN DENEGADA: No hay ningún paciente asignado ni en cola de atención. Registre o asigne un paciente antes de continuar.";
      if (typeof window.mostrarToast === "function") window.mostrarToast("warning", "Sin Pacientes", msg);
      else alert(msg);
      return { valido: false, px: null };
    }

    // 2. REGLA: Debe haber un paciente activo seleccionado (o STATE activo)
    let px = null;
    if (window.pacienteActivoId) {
      px = cola.find(x => x.id === window.pacienteActivoId);
    }
    if (!px && cola.length === 1) {
      px = cola[0];
      window.pacienteActivoId = px.id;
    }
    if (!px && window.STATE && (window.STATE.numDni || window.STATE.nombreReniec || window.STATE.esNN || window.STATE.prioridad)) {
      px = window.STATE;
    }

    if (!px) {
      const msg = "⚠️ ACCIÓN DENEGADA: Debe seleccionar un paciente activo de la bandeja para proceder.";
      if (typeof window.mostrarToast === "function") window.mostrarToast("warning", "Selección Requerida", msg);
      else alert(msg);
      return { valido: false, px: null };
    }

    // 3. REGLA: Verificar datos de filiación / identidad
    const nombre = (px.nombre || window.STATE?.nombreReniec || window.STATE?.identificador || "").trim();
    const dni = (px.numDni || px.dni || window.STATE?.numDni || document.getElementById("dni_reniec_input")?.value || document.getElementById("dni_mod1")?.value || document.getElementById("ident_full")?.value || "").trim();
    const esNN = Boolean(px.esNN || window.STATE?.esNN);
    
    const esGenerico = !nombre || nombre.startsWith("Paciente #") || nombre.startsWith("Ticket T-") || nombre === "PACIENTE POR IDENTIFICAR" || nombre === "—";
    const tieneDni = Boolean(dni && dni !== "—" && dni !== "NN" && dni.length >= 8);
    const tieneIdentidadValida = (!esGenerico && nombre.length >= 3) || tieneDni || esNN;

    // 4. REGLA: Verificar si hay signos vitales o prioridad evaluada
    const tienePrioridad = Boolean(px.prioridad || window.STATE?.prioridad);
    const tieneSignos = Boolean(
      (px.spo2 || window.STATE?.spo2) ||
      (px.fc || window.STATE?.fc) ||
      (px.pas || window.STATE?.pasSistolica) ||
      (px.fr || window.STATE?.fr) ||
      (px.temp || window.STATE?.temperatura)
    );

    // Si no se ha ingresado NINGÚN dato clínico ni de filiación
    if (!tieneIdentidadValida && !tieneSignos && !tienePrioridad) {
      const msg = "⚠️ ACCIÓN DENEGADA: No se ha ingresado ningún dato del paciente. Ingrese filiación y signos vitales en Triaje antes de avanzar o facturar.";
      if (typeof window.mostrarToast === "function") window.mostrarToast("warning", "Sin Datos Ingresados", msg);
      else alert(msg);
      return { valido: false, px: px };
    }

    // 5. VALIDACIONES ESPECÍFICAS SEGÚN LA ETAPA
    if (accionRequerida === "TRIAJE") {
      if (!tienePrioridad) {
        const msg = "⚠️ TRIAJE INCOMPLETO: Debe ingresar los signos vitales y categorizar la prioridad clínica (I a V) antes de sellar y derivar (NTS N° 042-MINSA).";
        if (typeof window.mostrarToast === "function") window.mostrarToast("warning", "Prioridad Requerida", msg);
        else alert(msg);
        return { valido: false, px: px };
      }
    }

    if (accionRequerida === "ADMISION") {
      if (!tieneIdentidadValida) {
        const msg = "⚠️ IDENTIFICACIÓN REQUERIDA: Ingrese la identidad del paciente (DNI/RENIEC o Protocolo NN Ley N° 27604) para validar cobertura.";
        if (typeof window.mostrarToast === "function") window.mostrarToast("warning", "Identidad Requerida", msg);
        else alert(msg);
        return { valido: false, px: px };
      }
    }

    if (accionRequerida === "MEDICO") {
      if (!tienePrioridad) {
        const msg = "⚠️ SIN EVALUACIÓN DE TRIAJE: El paciente no cuenta con categorización de Triaje. No es posible emitir el alta clínica.";
        if (typeof window.mostrarToast === "function") window.mostrarToast("warning", "Triaje Requerido", msg);
        else alert(msg);
        return { valido: false, px: px };
      }
      const cie10 = (window.STATE?.cie10 || document.getElementById("cie10_select")?.value || document.getElementById("cie10_input")?.value || px.diagnosticoCie10 || "").trim();
      if (!cie10 && !tieneSignos && !esNN) {
        const msg = "⚠️ ATENCIÓN INCOMPLETA: Debe registrar el diagnóstico médico (CIE-10) y la evaluación clínica antes de firmar el alta médica.";
        if (typeof window.mostrarToast === "function") window.mostrarToast("warning", "Diagnóstico Requerido", msg);
        else alert(msg);
        return { valido: false, px: px };
      }
    }

    if (accionRequerida === "CAJA" || accionRequerida === "FACTURACION") {
      if (!tienePrioridad) {
        const msg = "⚠️ FACTURACIÓN DENEGADA: No se puede facturar ni liquidar una cuenta sin evaluación ni prioridad de Triaje (NTS N° 042-MINSA).";
        if (typeof window.mostrarToast === "function") window.mostrarToast("danger", "Facturación Bloqueada", msg);
        else alert(msg);
        return { valido: false, px: px };
      }
      if (!tieneIdentidadValida && !esNN) {
        const msg = "⚠️ FACTURACIÓN DENEGADA: No se puede emitir liquidación sin identificación del paciente (DNI/RENIEC o Protocolo NN).";
        if (typeof window.mostrarToast === "function") window.mostrarToast("danger", "Sin Identificación", msg);
        else alert(msg);
        return { valido: false, px: px };
      }
      const estadoFlujo = px.estadoFlujo || window.STATE?.estadoFlujo || "";
      if (estadoFlujo === "PENDIENTE_TRIAJE" && !esNN && !tienePrioridad) {
        const msg = "⚠️ FACTURACIÓN DENEGADA: El paciente aún se encuentra en Triaje y no ha recibido atención médica. No se puede facturar.";
        if (typeof window.mostrarToast === "function") window.mostrarToast("danger", "Atención Pendiente", msg);
        else alert(msg);
        return { valido: false, px: px };
      }
    }

    return { valido: true, px: px };
  }
  window.validarPacienteYDatosParaFlujo = validarPacienteYDatosParaFlujo;

  window.sellarTriajeYDerivar = function() {
    const val = validarPacienteYDatosParaFlujo("TRIAJE");
    if (!val.valido) return;
    const px = val.px;

    const ident = obtenerIdentidadFirmante("TRIAJE");
    px.estadoFlujo = "EN_ATENCION_MEDICA";
    const _segTri = String(px.tipoSeguro || window.STATE?.tipoSeguro || "").toLowerCase();
    if (_segTri.includes("sis") || px.nroFua || window.STATE?.nroFua) {
      px.nroFua = px.nroFua || window.STATE?.nroFua || `FUA-0410-${String(Date.now()).slice(-6)}`;
      px.estadoFua = "TRIAJE_REGISTRADO";
      if (window.STATE) { window.STATE.nroFua = px.nroFua; window.STATE.estadoFua = px.estadoFua; }
    }
    if (_segTri.includes("essalud") || px.nroEssi || window.STATE?.nroEssi) {
      px.nroEssi = px.nroEssi || window.STATE?.nroEssi || `ESSI-${String(Date.now()).slice(-7)}`;
      px.estadoEssi = "TRIAJE_REGISTRADO";
      if (window.STATE) { window.STATE.nroEssi = px.nroEssi; window.STATE.estadoEssi = px.estadoEssi; }
    }
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

    guardarExpedienteSincrono(px, "EN_ATENCION_MEDICA", px.firmas.triaje, "SELLAR_TRIAJE");
    if (typeof window.registrarEpisodioEnHistoriaClinica === "function") window.registrarEpisodioEnHistoriaClinica(px, "Triaje y Filiación");
    if (typeof window.guardarEnHistoriaClinicaMaster === "function") window.guardarEnHistoriaClinicaMaster(px);
    if (typeof window.sincronizarDatosPacienteEnTodosLosModulos === "function") window.sincronizarDatosPacienteEnTodosLosModulos(px);
    if (typeof window.renderizarTableroColaPacientes === "function") window.renderizarTableroColaPacientes();
    if (typeof window.renderizarTrackBoardLista === "function") window.renderizarTrackBoardLista();
    renderizarBandejaPosta();
    aplicarPermisosYEnmascaramiento(obtenerRolActivo(), obtenerModoOperacion());
    if (window.COCKPIT && typeof window.COCKPIT.actualizarContextoCockpit === "function") {
      window.COCKPIT.actualizarContextoCockpit();
    }
  };

  window.validarCoberturaYNotificar = function() {
    const val = validarPacienteYDatosParaFlujo("ADMISION");
    if (!val.valido) return;
    const px = val.px;

    const ident = obtenerIdentidadFirmante("ADMISION");
    px.coberturaValidada = true;
    const _segAdm = String(px.tipoSeguro || window.STATE?.tipoSeguro || "").toLowerCase();
    if (_segAdm.includes("sis") && !px.esNN) {
      px.nroFua = px.nroFua || window.STATE?.nroFua || window.STATE?.numerFua || `FUA-0410-${String(Date.now()).slice(-6)}`;
      px.estadoFua = "APERTURA_ADMISION";
      if (window.STATE) { window.STATE.nroFua = px.nroFua; window.STATE.numerFua = px.nroFua; window.STATE.estadoFua = px.estadoFua; }
    } else if (_segAdm.includes("essalud") && !px.esNN) {
      px.nroEssi = px.nroEssi || window.STATE?.nroEssi || `ESSI-${String(Date.now()).slice(-7)}`;
      px.estadoEssi = "ACREDITADO_ADMISION";
      if (window.STATE) { window.STATE.nroEssi = px.nroEssi; window.STATE.estadoEssi = px.estadoEssi; }
    }
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

    guardarExpedienteSincrono(px, px.estadoFlujo, px.firmas.admision, "VALIDAR_COBERTURA");
    if (typeof window.sincronizarDatosPacienteEnTodosLosModulos === "function") window.sincronizarDatosPacienteEnTodosLosModulos(px);
    renderizarBandejaPosta();
  };

  window.firmarAltaMedicaYEnviarCaja = function() {
    const val = validarPacienteYDatosParaFlujo("MEDICO");
    if (!val.valido) return;
    const px = val.px;

    const ident = obtenerIdentidadFirmante("MEDICO");
    px.estadoFlujo = "PENDIENTE_CAJA";
    const horaIndicacion = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    px.estadoFua = "CON_SUSTENTO_MEDICO";
    px.estadoEssi = "CON_SUSTENTO_MEDICO";
    px.horaSustentoMedico = horaIndicacion;
    if (window.STATE) {
      window.STATE.estadoFua = "CON_SUSTENTO_MEDICO";
      window.STATE.estadoEssi = "CON_SUSTENTO_MEDICO";
      window.STATE.horaSustentoMedico = horaIndicacion;
    }
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

    // Liberación garantizada de cama al otorgar el Alta Médica (Bloque 5)
    if (typeof window.liberarRecursoHospitalarioOperativo === "function") {
      window.liberarRecursoHospitalarioOperativo(px.camaId, px.id);
    } else if (px.camaId && typeof window.RECURSOS_HOSPITALARIOS !== "undefined" && window.RECURSOS_HOSPITALARIOS[px.camaId]) {
      window.RECURSOS_HOSPITALARIOS[px.camaId].estado = "disponible";
      window.RECURSOS_HOSPITALARIOS[px.camaId].paciente = null;
    }
    px.camaLiberada = true;

    if (typeof window.sincronizarFacturacionYExportar === "function") {
      window.sincronizarFacturacionYExportar(true);
    }

    if (typeof window.registrarLogAuditoria === "function") {
      window.registrarLogAuditoria("Módulo 7", "ALTA_MEDICA", `Alta médica firmada por ${ident.usuario} (${ident.colegiatura}) y enviada a Caja`);
    }

    if (typeof window.mostrarToastCola === "function") {
      window.mostrarToastCola(`📤 Alta médica firmada para <strong>${px.nombre}</strong>. Expediente enviado a Caja.`);
    }

    guardarExpedienteSincrono(px, "PENDIENTE_CAJA", px.firmas.medico, "ALTA_MEDICA");
    if (typeof window.registrarEpisodioEnHistoriaClinica === "function") window.registrarEpisodioEnHistoriaClinica(px, "Atención Médica y Alta");
    if (typeof window.guardarEnHistoriaClinicaMaster === "function") window.guardarEnHistoriaClinicaMaster(px);
    if (typeof window.sincronizarDatosPacienteEnTodosLosModulos === "function") window.sincronizarDatosPacienteEnTodosLosModulos(px);
    if (typeof window.renderizarTableroColaPacientes === "function") window.renderizarTableroColaPacientes();
    if (typeof window.renderizarTrackBoardLista === "function") window.renderizarTrackBoardLista();
    renderizarBandejaPosta();
    aplicarPermisosYEnmascaramiento(obtenerRolActivo(), obtenerModoOperacion());
    if (window.COCKPIT && typeof window.COCKPIT.actualizarContextoCockpit === "function") {
      window.COCKPIT.actualizarContextoCockpit();
    }
  };

  window.emitirLiquidacionYCierre = function() {
    const val = validarPacienteYDatosParaFlujo("CAJA");
    if (!val.valido) return;
    const px = val.px;

    const ident = obtenerIdentidadFirmante("CAJA");
    px.estadoFlujo = "CERRADO_FACTURADO";
    px.estadoAtencion = "Alta";
    px.altaClinicaConcluida = true;
    px.horaAlta = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    px.estadoFua = "VALORIZADO_CERRADO";
    px.estadoEssi = "VALORIZADO_CERRADO";
    if (window.STATE) {
      window.STATE.estadoFua = "VALORIZADO_CERRADO";
      window.STATE.estadoEssi = "VALORIZADO_CERRADO";
      window.STATE.estadoAtencion = "Alta";
      window.STATE.altaClinicaConcluida = true;
    }
    px.firmas = px.firmas || {};
    px.firmas.caja = {
      usuario: ident.usuario,
      fecha: new Date().toISOString()
    };

    if (window.STATE) {
      window.STATE.estadoFlujo = "CERRADO_FACTURADO";
      window.STATE.firmas = px.firmas;
      if (px.esNN || window.STATE.esNN || px.ingresoDirectoCritico) {
        window.STATE.tipoSeguro = "Cuenta por Regularizar — Garantía Ley N° 27604 (Paciente NN)";
      }
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

    guardarExpedienteSincrono(px, "CERRADO_FACTURADO", px.firmas.caja, "CIERRE_LIQUIDACION");
    if (typeof window.registrarEpisodioEnHistoriaClinica === "function") window.registrarEpisodioEnHistoriaClinica(px, "Liquidación y Cierre Ley 29414");
    if (typeof window.guardarEnHistoriaClinicaMaster === "function") window.guardarEnHistoriaClinicaMaster(px);
    if (typeof window.sincronizarDatosPacienteEnTodosLosModulos === "function") window.sincronizarDatosPacienteEnTodosLosModulos(px);
    if (typeof window.renderizarTableroColaPacientes === "function") window.renderizarTableroColaPacientes();
    if (typeof window.renderizarTrackBoardLista === "function") window.renderizarTrackBoardLista();
    renderizarBandejaPosta();
    aplicarPermisosYEnmascaramiento(obtenerRolActivo(), obtenerModoOperacion());
    if (window.COCKPIT && typeof window.COCKPIT.actualizarContextoCockpit === "function") {
      window.COCKPIT.actualizarContextoCockpit();
    }

    // Al culminar todo el flujo, la página se refresca y empieza nuevamente
    if (typeof window.mostrarToastCola === "function") {
      window.mostrarToastCola(`🏁 Flujo culminado para <strong>${px.nombre}</strong>. Reiniciando página para nuevo paciente...`);
    }
    setTimeout(() => {
      window.location.reload();
    }, 1600);
  };

  // ----------------------------------------------------------------------------
  // 7. ENMASCARAMIENTO Y PRIVACIDAD (LEY N° 29733) & CONTROL DE MÓDULOS
  // ----------------------------------------------------------------------------
  function aplicarPermisosYEnmascaramiento(rol, modo) {
    rol = rol || "AUDITOR";
    modo = modo || "DEMO";

    // Sincronizar vista focalizada y módulos visibles en Cabina Cockpit
    if (window.COCKPIT && typeof window.COCKPIT.aplicarVistaYPermisosRol === "function") {
      window.COCKPIT.aplicarVistaYPermisosRol(rol, modo);
    }

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

      // CORRECCIÓN 2: El Médico ve datos DNI/RENIEC validados en su tarjeta resumen sin reingresar ni revalidar
      const elDni4 = document.getElementById("dni_mod4");
      const inputRowM4 = elDni4 ? elDni4.parentElement?.parentElement : null;
      const cardM4 = document.getElementById("m4_reniec_result_card");
      if (inputRowM4) inputRowM4.style.display = "none";
      if (cardM4) cardM4.style.display = "block";

      const colaPx = window.PACIENTES_COLA || [];
      const pxAct = colaPx.find(x => x.id === window.pacienteActivoId) || {};
      const esNN = Boolean(pxAct.esNN || window.STATE?.esNN || (pxAct.dni && String(pxAct.dni).startsWith("NN")));
      const m4Nombre = document.getElementById("m4_disp_nombre");
      const m4Dni = document.getElementById("m4_disp_dni");
      const m4Edad = document.getElementById("m4_disp_edad");
      const m4Sexo = document.getElementById("m4_disp_sexo");
      const m4Hc = document.getElementById("m4_disp_hc");
      const m4Badge = document.getElementById("m4_badge_sincronizado");

      if (esNN) {
        if (m4Nombre) m4Nombre.textContent = "Identidad: " + (pxAct.identificador || "NN-XXX") + " (Desconocido) — Validación RENIEC pendiente por Admisión (Ley N° 27604)";
        if (m4Dni) m4Dni.textContent = "NN (Pendiente)";
        if (m4Badge) {
          m4Badge.textContent = "🚨 Validación RENIEC pendiente por Admisión (Ley N° 27604)";
          m4Badge.style.background = "#fff7ed";
          m4Badge.style.color = "#c2410c";
        }
      } else {
        if (m4Nombre) m4Nombre.textContent = pxAct.nombre || window.STATE?.nombreReniec || "Paciente";
        if (m4Dni) m4Dni.textContent = pxAct.dni || window.STATE?.numDni || "—";
        if (m4Edad) m4Edad.textContent = (pxAct.edad || window.STATE?.edad) ? `${pxAct.edad || window.STATE?.edad} años` : "—";
        if (m4Sexo) m4Sexo.textContent = window.STATE?.sexo || "—";
        if (m4Hc) m4Hc.textContent = pxAct.historiaClinica || window.STATE?.historiaClinica || "—";
        if (m4Badge) {
          m4Badge.textContent = "✅ Validado en RENIEC (Solo Lectura)";
          m4Badge.style.background = "#dcfce7";
          m4Badge.style.color = "#15803d";
        }
        if (window.COCKPIT && typeof window.COCKPIT.actualizarTarjetaResumenTriaje === "function") {
          window.COCKPIT.actualizarTarjetaResumenTriaje();
        }
      }

      bloquearModulo(1, true); // Sellado NTS 139
      bloquearModulo(2, true);
      bloquearModulo(3, true);
      bloquearModulo(4, false);
      bloquearModulo(5, true);
      bloquearModulo(6, false);
      bloquearModulo(7, false);
      bloquearModulo(8, true); // Costos referenciales solo lectura
      return;
    } else {
      // Restaurar visibilidad normal del input DNI en Módulo 4 para otros roles
      const elDni4 = document.getElementById("dni_mod4");
      const inputRowM4 = elDni4 ? elDni4.parentElement?.parentElement : null;
      if (inputRowM4) inputRowM4.style.display = "flex";
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

    if (typeof window.refrescarTrackBoardYBandeja === "function") {
      window.refrescarTrackBoardYBandeja();
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
    const _oldBp = document.getElementById("bandeja_posta_container"); if (_oldBp) _oldBp.remove();

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
    cambiarRolActivo: guardarRolDemoActivo,
    renderizarBandejaPosta,
    actualizarBarraAccionPosta,
    aplicarPermisosYEnmascaramiento,
    notificarCambioColaGlobal
  };

  window.actualizarBandejaPostaUI = function() {
    renderizarBandejaPosta();
    actualizarBarraAccionPosta();
  };


  // ----------------------------------------------------------------------------
  // 8. ED TRACK BOARD (TABLERO PRIORIZADO Y AISLAMIENTO MULTI-PACIENTE)
  // ----------------------------------------------------------------------------
  const EXPEDIENTES_KEY = "upp_expedientes_v1";

  function sincronizarExpedienteActivoEnStore() {
    try {
      const raw = localStorage.getItem(EXPEDIENTES_KEY);
      const store = raw ? JSON.parse(raw) : {};
      if (window.pacienteActivoId && window.STATE) {
        store[window.pacienteActivoId] = {
          id: window.pacienteActivoId,
          state: JSON.parse(JSON.stringify(window.STATE)),
          timestamp: Date.now()
        };
        localStorage.setItem(EXPEDIENTES_KEY, JSON.stringify(store));
      }
    } catch(e) {}
  }

  function seleccionarExpedienteYVisualizarPorRol(id) {
    seleccionarExpediente(id);
    const rol = (window.RBAC_FLUJO && typeof window.RBAC_FLUJO.obtenerRolActivo === "function")
      ? window.RBAC_FLUJO.obtenerRolActivo()
      : (typeof obtenerRolActivo === "function" ? obtenerRolActivo() : "AUDITOR");

    const px = (window.PACIENTES_COLA || []).find(x => x.id === id);
    const ef = px ? (px.estadoFlujo || "PENDIENTE_TRIAJE") : "PENDIENTE_TRIAJE";

    // Si aún no termina el flujo, cargar la fase y estación clínica donde se encuentra actualmente
    let faseDestino = 1;
    let moduloDestino = 1;
    if (ef === "PENDIENTE_TRIAJE") {
      faseDestino = 1; moduloDestino = 1;
    } else if (ef === "ADMISION" || ef === "PENDIENTE_ADMISION") {
      faseDestino = 2; moduloDestino = 2;
    } else if (ef === "EN_ATENCION_MEDICA") {
      faseDestino = 3; moduloDestino = 4;
    } else if (ef === "PENDIENTE_CAJA") {
      faseDestino = 4; moduloDestino = 8;
    } else if (ef === "CERRADO_FACTURADO") {
      faseDestino = 4; moduloDestino = 8;
    }

    // Si el operador tiene un rol operativo congruente con la atención:
    if (rol === "TRIAJE" && ef === "PENDIENTE_TRIAJE") { faseDestino = 1; moduloDestino = 1; }
    else if (rol === "ADMISION" && (ef === "ADMISION" || ef === "PENDIENTE_ADMISION")) { faseDestino = 2; moduloDestino = 2; }
    else if (rol === "MEDICO" && ef === "EN_ATENCION_MEDICA") { faseDestino = 3; moduloDestino = 4; }
    else if (rol === "CAJA" && ef === "PENDIENTE_CAJA") { faseDestino = 4; moduloDestino = 8; }

    if (window.COCKPIT && typeof window.COCKPIT.irAFase === "function") {
      window.COCKPIT.irAFase(faseDestino);
    }
    if (typeof window.irAModulo === "function") {
      window.irAModulo(moduloDestino);
    }
    if (window.COCKPIT && typeof window.COCKPIT.actualizarContextoCockpit === "function") {
      window.COCKPIT.actualizarContextoCockpit();
    }
    if (window.COCKPIT && typeof window.COCKPIT.actualizarTarjetaResumenTriaje === "function") {
      window.COCKPIT.actualizarTarjetaResumenTriaje();
    }

    if (typeof window.mostrarToast === "function") {
      const nombre = px ? px.nombre : "Paciente";
      window.mostrarToast("info", "Paciente Seleccionado", `Cargada estación de ${nombre}: ${ef.replace(/_/g, " ")}.`);
    }
  }
  window.seleccionarExpedienteYVisualizarPorRol = seleccionarExpedienteYVisualizarPorRol;

  function seleccionarExpediente(id) {
    if (typeof window.cambiarPacienteActivo === "function") {
      window.cambiarPacienteActivo(id, true);
    } else {
      window.pacienteActivoId = id;
    }
    actualizarBarraAccionPosta();
    renderizarTrackBoardLista();
    if (typeof window.renderizarTableroColaPacientes === "function") {
      window.renderizarTableroColaPacientes();
    }
    if (window.COCKPIT && typeof window.COCKPIT.actualizarContextoCockpit === "function") {
      window.COCKPIT.actualizarContextoCockpit();
    }
  }
  window.seleccionarExpediente = seleccionarExpediente;
  window.renderizarTrackBoardLista = function() { return renderizarTrackBoardLista(); };

  function renderizarTrackBoardLista() {
    const contenedor = document.getElementById("trackboard_pacientes_lista");
    if (!contenedor) return;

    const cola = window.PACIENTES_COLA || [];
    if (cola.length === 0) {
      contenedor.innerHTML = `<div style="font-size:0.75rem; color:#94a3b8; text-align:center; padding:10px;">Sin pacientes en espera</div>`;
      return;
    }

    // Ordenar: Prioridad I -> V, luego llegada
    const prioOrder = { "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5 };
    const ordenada = [...cola].sort((a, b) => {
      const pA = prioOrder[a.prioridad] || 5;
      const pB = prioOrder[b.prioridad] || 5;
      if (pA !== pB) return pA - pB;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    const rol = (window.RBAC_FLUJO && typeof window.RBAC_FLUJO.obtenerRolActivo === 'function') ? window.RBAC_FLUJO.obtenerRolActivo() : (typeof obtenerRolActivo === 'function' ? obtenerRolActivo() : 'AUDITOR');
    let primerCandidatoMedico = ordenada.find(p => p.estadoFlujo === "EN_ATENCION_MEDICA");

    let html = "";
    ordenada.forEach((p, idx) => {
      if (filtroBandejaActual !== "TODOS") {
        if (filtroBandejaActual === "ADMISION" && (p.coberturaValidada || p.estadoFlujo === "CERRADO_FACTURADO")) return;
        if (filtroBandejaActual !== "ADMISION" && p.estadoFlujo !== filtroBandejaActual) return;
      }

      const turno = p.turno || `E-${String(idx + 1).padStart(3, "0")}`;
      p.turno = turno;
      const esActivo = p.id === window.pacienteActivoId;
      const esSiguienteMed = (rol === "MEDICO" && p === primerCandidatoMedico);

      const colorPrio = p.prioridad === "I" ? "#dc2626" : p.prioridad === "II" ? "#ea580c" : p.prioridad === "III" ? "#ca8a04" : p.prioridad === "IV" ? "#16a34a" : p.prioridad === "V" ? "#2563eb" : "#64748b";
      const esAtendido = p.estadoFlujo === "CERRADO_FACTURADO" || Boolean(p.altaClinicaConcluida) || (p.estadoAtencion || "").includes("Alta") || p.estadoAtencion === "Finalizado";
      const bgCard = esAtendido ? (esActivo ? "#ecfdf5" : "#f0fdf4") : (esActivo ? "#eff6ff" : "#ffffff");
      const borderCard = esAtendido ? (esActivo ? "2px solid #16a34a" : "1.5px solid #86efac") : (esActivo ? "2px solid #3b82f6" : esSiguienteMed ? "2px solid #f59e0b" : "1px solid #e2e8f0");
      const shadowCard = esAtendido ? "box-shadow: 0 2px 6px rgba(22, 101, 52, 0.06);" : "";

      // Normalizar textos largos para evitar descuadres
      const rawDest = (p.camaNombre || p.estadoAtencion || "En atención").trim();
      let destCorto = "🛏️ En atención";
      if (rawDest.includes("Shock") || rawDest.includes("ST-")) destCorto = "🚨 Shock Trauma";
      else if (rawDest.includes("Quirófano") || rawDest.includes("SOP")) destCorto = "🏥 Quirófano SOP";
      else if (rawDest.includes("Obs. Varones") || rawDest.includes("Observación Varones")) destCorto = "🛏️ Obs. Varones";
      else if (rawDest.includes("Obs. Mujeres") || rawDest.includes("Observación Mujeres")) destCorto = "🛏️ Obs. Mujeres";
      else if (rawDest.includes("Observación")) destCorto = "🛏️ Observación";
      else if (rawDest.includes("Tópico") || rawDest.includes("Topico")) destCorto = "🩺 Tópico";
      else if (rawDest.includes("Espera")) destCorto = "⏳ Sala Espera";
      else if (rawDest.length > 18) destCorto = rawDest.substring(0, 16) + "…";
      else destCorto = rawDest;

      const rawNombre = (p.nombre || "Paciente").trim();
      const nombreCorto = rawNombre.length > 22 ? rawNombre.substring(0, 20) + "…" : rawNombre;

      const badgeFlujoLabels = {
        "PENDIENTE_TRIAJE": "🩺 Triaje",
        "ADMISION": "📋 Admisión",
        "EN_ATENCION_MEDICA": "👨‍⚕️ Médico",
        "PENDIENTE_CAJA": "💳 Caja",
        "CERRADO_FACTURADO": "🏁 Finalizado"
      };
      const efKey = p.estadoFlujo || "PENDIENTE_TRIAJE";
      const flujoCorto = esAtendido ? "✓ Finalizado" : (badgeFlujoLabels[efKey] || efKey.replace(/_/g, " "));

      html += `
        <div onclick="seleccionarExpedienteYVisualizarPorRol('${p.id}')" style="display:flex; justify-content:space-between; align-items:center; background:${bgCard}; border:${borderCard}; border-radius:8px; padding:6px 10px; cursor:pointer; transition:all 0.15s ease; ${shadowCard} gap:8px; box-sizing:border-box; width:100%; min-height:46px;">
          
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
            <span style="background:${colorPrio}; color:#ffffff; font-size:0.68rem; font-weight:900; padding:2px 6px; border-radius:4px; font-variant-numeric:tabular-nums; flex-shrink:0;">
              ${p.prioridad ? "P-" + p.prioridad : "S/P"}
            </span>
            <div style="min-width:0; flex:1;">
              <div style="display:flex; align-items:center; gap:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                <span style="font-size:0.70rem; color:#64748b; font-weight:700;">${turno}</span>
                <span style="font-size:0.78rem; font-weight:800; color:#0f172a; overflow:hidden; text-overflow:ellipsis;" title="${rawNombre}">
                  ${nombreCorto}
                </span>
                ${esSiguienteMed ? `<span style="font-size:0.60rem; background:#fef3c7; color:#92400e; padding:1px 4px; border-radius:3px; flex-shrink:0;">👉 Sig.</span>` : ""}
                ${esActivo ? `<span style="font-size:0.60rem; background:#0284c7; color:#ffffff; padding:1px 5px; border-radius:3px; font-weight:800; flex-shrink:0;">ACTIVO</span>` : ""}
              </div>
              <div style="font-size:0.68rem; color:#64748b; display:flex; align-items:center; gap:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px;">
                <span style="color:#0369a1; font-weight:700;">${destCorto}</span>
                <span>·</span>
                <span>DNI: <strong>${p.dni || p.numDni || "NN"}</strong></span>
              </div>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <span style="font-size:0.66rem; font-weight:800; padding:2px 6px; border-radius:4px; white-space:nowrap; ${esAtendido ? 'color:#15803d; background:#dcfce7; border:1px solid #86efac;' : 'color:#0369a1; background:#e0f2fe; border:1px solid #bae6fd;'}">
              ${flujoCorto}
            </span>
            <button type="button" onclick="event.stopPropagation(); abrirHistorialFlujoPaciente('${p.id}');" class="btn-full-secondary" style="font-size:0.66rem; font-weight:700; padding:2px 6px; height:24px; border-radius:4px; cursor:pointer; background:#f8fafc; border:1px solid #cbd5e1; color:#0369a1; display:inline-flex; align-items:center; justify-content:center;" title="Consultar trazabilidad">
              👁️
            </button>
          </div>

        </div>
      `;
    });

    contenedor.innerHTML = html;
  }
// Direct renderizarTrackBoardLista already wired in renderizarBandejaPosta


  // ----------------------------------------------------------------------------
  // 8. MODAL DE HISTORIAL ASISTENCIAL CON CONTROL DE ROLES (RBAC)
  // ----------------------------------------------------------------------------
  window.cerrarModalHistorialFlujo = function() {
    const modal = document.getElementById("modal_historial_flujo_px");
    if (modal) modal.style.display = "none";
  };

  // ============================================================================
  // CONSULTA DE PACIENTE: DATOS INGRESADOS HASTA EL MOMENTO & TRAZABILIDAD (DÍA Y HORA)
  // Conforme a Ley N° 26842, Ley N° 29414 y NTS N° 139-MINSA
  // ============================================================================
  window.abrirHistorialFlujoPaciente = function(idExpediente) {
    const cola = window.PACIENTES_COLA || [];
    let px = cola.find(x => x.id === idExpediente);
    if (!px && window.pacienteActivoId) {
      px = cola.find(x => x.id === window.pacienteActivoId);
    }
    if (!px) {
      try {
        const storeRaw = localStorage.getItem("upp_expedientes_v1");
        if (storeRaw) {
          const store = JSON.parse(storeRaw);
          if (store[idExpediente] && store[idExpediente].paciente) {
            px = store[idExpediente].paciente;
          }
        }
      } catch(e){}
    }
    if (!px) {
      alert("No se encontró el registro del paciente.");
      return;
    }

    const rolActivo = (window.RBAC_FLUJO && typeof window.RBAC_FLUJO.obtenerRolActivo === 'function') 
      ? window.RBAC_FLUJO.obtenerRolActivo() 
      : (typeof obtenerRolActivo === 'function' ? obtenerRolActivo() : 'AUDITOR');
    const esAuditor = rolActivo === "AUDITOR" || rolActivo === "ADMIN";

    let modal = document.getElementById("modal_historial_flujo_px");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal_historial_flujo_px";
      modal.style.cssText = "display:none; position:fixed; inset:0; z-index:999999; background:rgba(15,23,42,0.7); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:16px;";
      modal.onclick = function(e) {
        if (e.target === modal) window.cerrarModalHistorialFlujo();
      };
      document.body.appendChild(modal);
    }

    // Reconstruir estado completo a partir de snapshots
    const state = window.STATE || {};
    const ss = px.stateSnapshot || {};
    const fs = px.formSnapshot || {};
    const f = px.firmas || ss.firmas || state.firmas || {};

    // Función robusta para formatear DÍA y HORA exactos
    function formatearDiaHora(fechaInput) {
      if (!fechaInput) return { dia: "Día no registrado", hora: "--:--:--", texto: "Sin fecha registrada" };
      try {
        const d = new Date(fechaInput);
        if (isNaN(d.getTime())) {
          return { dia: new Date().toLocaleDateString('es-PE'), hora: String(fechaInput), texto: String(fechaInput) };
        }
        const dia = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return { dia, hora, texto: `${dia} · ${hora}` };
      } catch(e) {
        return { dia: "--/--/----", hora: String(fechaInput), texto: String(fechaInput) };
      }
    }

    // 1. Datos de Identificación y Filiación
    const nombreCompleto = px.nombre || ss.nombreReniec || ss.identificador || state.nombreReniec || "PACIENTE POR IDENTIFICAR";
    const dni = px.numDni || px.dni || ss.numDni || state.numDni || "S/D";
    const edad = px.edad || ss.edad || state.edad || "—";
    const sexo = px.sexo || ss.sexo || state.sexo || "—";
    const historiaClinica = px.historiaClinica || ss.historiaClinica || state.historiaClinica || "HC-PROVISIONAL";
    const prioridad = px.prioridad || ss.prioridad || state.prioridad || null;
    const coloresPrioBadge = {
      "I": { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5", label: "P-I (Vital / Shock Trauma)" },
      "II": { bg: "#ffedd5", text: "#c2410c", border: "#fdba74", label: "P-II (Emergencia)" },
      "III": { bg: "#fef9c3", text: "#854d0e", border: "#fde047", label: "P-III (Urgencia)" },
      "IV": { bg: "#dcfce7", text: "#15803d", border: "#86efac", label: "P-IV (Urgencia Menor)" },
      "V": { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd", label: "P-V (No Urgente)" }
    };
    const prioCfg = prioridad ? (coloresPrioBadge[prioridad] || { bg:"#f1f5f9", text:"#334155", border:"#cbd5e1", label:`P-${prioridad}` }) : { bg:"#f1f5f9", text:"#64748b", border:"#cbd5e1", label:"Sin categorizar" };

    const cama = px.camaNombre || ss.camaAsignada || state.camaAsignada || "Sin Cama / Tópico";
    const alergias = px.alergias || ss.alergias || state.alergias || "— (Por indagar)";
    const motivo = px.motivo || ss.motivoConsulta || state.motivoConsulta || "—";
    const cie10 = px.diagnosticoCie10 || ss.diagnosticoCie10 || state.diagnosticoCie10 || "Por evaluar por médico";
    const seguro = (px.coberturaValidada && (px.tipoSeguro || ss.tipoSeguro || state.tipoSeguro)) ? (px.tipoSeguro || ss.tipoSeguro || state.tipoSeguro) : (px.esNN ? "Paciente NN — Sin seguro acreditado" : "Pendiente de acreditación");
    const docSeguro = px.nroFua || px.nroEssi || ss.nroFua || ss.nroEssi || state.nroFua || state.nroEssi || "Pendiente";

    // 2. Signos Vitales ingresados hasta el momento
    const spo2 = px.spo2 ?? ss.spo2 ?? state.spo2 ?? "—";
    const fc = px.fc ?? ss.fc ?? state.fc ?? "—";
    const pas = px.pas ?? px.pasSistolica ?? ss.pasSistolica ?? state.pasSistolica ?? "—";
    const pad = px.pad ?? px.paDiastolica ?? ss.paDiastolica ?? state.paDiastolica ?? "—";
    const fr = px.fr ?? ss.fr ?? state.fr ?? "—";
    const temp = px.temp ?? px.temperatura ?? ss.temperatura ?? state.temperatura ?? "—";
    const glasgow = px.glasgow ?? ss.glasgow ?? state.glasgow ?? "—";
    const glucosa = px.glucosa ?? ss.glucosa ?? state.glucosa ?? "—";
    const eva = px.eva ?? ss.eva ?? state.eva ?? "0";
    const news2 = px.news2Score ?? ss.news2Score ?? state.news2Score ?? 0;

    // 3. Fechas y Horas de cada paso de trazabilidad
    const tLlegada = formatearDiaHora(px.timestamp || px.fechaLlegada || ss.fechaLlegada);
    const tTriaje = f.triaje?.fecha ? formatearDiaHora(f.triaje.fecha) : null;
    const tAdmision = f.admision?.fecha ? formatearDiaHora(f.admision.fecha) : (px.coberturaValidada ? formatearDiaHora(px.timestamp || new Date()) : null);
    const tMedico = f.medico?.fecha ? formatearDiaHora(f.medico.fecha) : (px.estadoFlujo === "PENDIENTE_CAJA" || px.estadoFlujo === "CERRADO_FACTURADO" ? formatearDiaHora(px.timestamp || new Date()) : null);
    const tCaja = f.caja?.fecha ? formatearDiaHora(f.caja.fecha) : (px.estadoFlujo === "CERRADO_FACTURADO" ? formatearDiaHora(px.timestamp || new Date()) : null);
    const hizoTriajeReal = Boolean(f.triaje);
    const esAtencionRapida = Boolean(px.ingresoDirectoCritico || px.panicoShockTrauma);

    // 4. Bloques de Información de Trazabilidad (solo datos reales validados, sin inventar firmas/pasos)
    // PASO 1: TRIAJE
    const paso1Html = (esAuditor || rolActivo === "TRIAJE" || hizoTriajeReal) ? `
      <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:6px; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
          <strong style="color:#0f172a; font-size:0.84rem; display:flex; align-items:center; gap:6px;">
            <span>👩‍⚕️ Paso 1: Triaje Fisiológico &amp; Categorización (NTS N° 042-MINSA)</span>
            ${hizoTriajeReal ? `<span style="background:#16a34a; color:#fff; font-size:0.68rem; padding:1px 6px; border-radius:4px;">✓ Sellado</span>` : (esAtencionRapida ? `<span style="background:#fee2e2; color:#991b1b; font-size:0.68rem; padding:1px 6px; border-radius:4px;">⚡ Atención Rápida (Sin paso por Triaje)</span>` : `<span style="background:#fef3c7; color:#92400e; font-size:0.68rem; padding:1px 6px; border-radius:4px;">⏳ Pendiente de Triaje</span>`)}
          </strong>
          <div style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; color:#0284c7; font-weight:700;">
            📅 ${tTriaje ? tTriaje.dia : "--/--/----"} · 🕒 ${tTriaje ? tTriaje.hora : "Pendiente"}
          </div>
        </div>
        <div style="font-size:0.78rem; color:#334155; line-height:1.45;">
          <div><strong>Responsable:</strong> ${f.triaje?.usuario ? `${f.triaje.usuario} (${f.triaje.colegiatura || "CEP"})` : "— (Sin intervención de triaje aún)"}</div>
          <div><strong>Categorización:</strong> <span style="background:${prioCfg.bg}; color:${prioCfg.text}; font-weight:900; padding:1px 6px; border-radius:4px;">${prioCfg.label}</span> · <strong>Recurso:</strong> ${cama}</div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:6px 10px; border-radius:6px; margin:6px 0; font-family:'JetBrains Mono', monospace; font-size:0.75rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:4px;">
            <div>SpO2: <strong>${spo2}%</strong></div>
            <div>FC: <strong>${fc} lpm</strong></div>
            <div>PA: <strong>${pas}/${pad} mmHg</strong></div>
            <div>FR: <strong>${fr} rpm</strong></div>
            <div>T°: <strong>${temp} °C</strong></div>
            <div>NEWS2: <strong>${news2} pts</strong></div>
            <div>EVA: <strong>${eva}/10</strong></div>
            <div>Glucosa: <strong>${glucosa} mg/dL</strong></div>
          </div>
          <div><strong>Alergias Medicamentosas:</strong> <span style="color:#b91c1c; font-weight:700;">${alergias}</span></div>
        </div>
      </div>
    ` : `
      <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:10px 14px; margin-bottom:10px; color:#64748b; font-size:0.76rem; display:flex; justify-content:space-between; align-items:center;">
        <div><span>🔒</span> <strong>Paso 1: Triaje Fisiológico:</strong> Registro reservado a Enfermería / Auditoría.</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:0.72rem;">📅 ${tTriaje ? tTriaje.dia : tLlegada.dia} · 🕒 ${tTriaje ? tTriaje.hora : tLlegada.hora}</div>
      </div>
    `;

    // PASO 2: ADMISIÓN
    const paso2Html = (esAuditor || rolActivo === "ADMISION" || px.coberturaValidada) ? `
      <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:6px; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
          <strong style="color:#0f172a; font-size:0.84rem; display:flex; align-items:center; gap:6px;">
            <span>📋 Paso 2: Admisión, Filiación &amp; Cobertura de Seguros</span>
            ${px.coberturaValidada ? `<span style="background:#0284c7; color:#fff; font-size:0.68rem; padding:1px 6px; border-radius:4px;">✓ Acreditado</span>` : `<span style="background:#fef3c7; color:#92400e; font-size:0.68rem; padding:1px 6px; border-radius:4px;">⏳ En Verificación</span>`}
          </strong>
          <div style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; color:#0284c7; font-weight:700;">
            📅 ${tAdmision ? tAdmision.dia : tLlegada.dia} · 🕒 ${tAdmision ? tAdmision.hora : "En proceso"}
          </div>
        </div>
        <div style="font-size:0.78rem; color:#334155; line-height:1.45;">
          <div><strong>Operador de Admisión:</strong> ${f.admision?.usuario || (px.coberturaValidada ? "Admisión SUSALUD" : "— (Pendiente de admisión)")}</div>
          <div><strong>Régimen de Financiamiento:</strong> <strong style="color:#0369a1;">${seguro}</strong></div>
          <div><strong>Trámite / Póliza / FUA:</strong> <span style="font-family:'JetBrains Mono', monospace; font-weight:700;">${docSeguro}</span></div>
          <div style="color:#15803d; font-weight:700; margin-top:2px;">✓ Acreditación PIDE-SUSALUD validada sin condicionar la atención médica vital (Ley N° 27604).</div>
        </div>
      </div>
    ` : `
      <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:10px 14px; margin-bottom:10px; color:#64748b; font-size:0.76rem; display:flex; justify-content:space-between; align-items:center;">
        <div><span>🔒</span> <strong>Paso 2: Admisión &amp; Seguros:</strong> Registro reservado a Admisión / Auditoría.</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:0.72rem;">📅 ${tAdmision ? tAdmision.dia : "--/--/----"} · 🕒 ${tAdmision ? tAdmision.hora : "Pendiente"}</div>
      </div>
    `;

    // PASO 3: MÉDICO
    const paso3Html = (esAuditor || rolActivo === "MEDICO" || tMedico) ? `
      <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:6px; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
          <strong style="color:#0f172a; font-size:0.84rem; display:flex; align-items:center; gap:6px;">
            <span>👨‍⚕️ Paso 3: Atención Médica, Diagnóstico CIE-10 &amp; Alta Clínica</span>
            ${tMedico ? `<span style="background:#16a34a; color:#fff; font-size:0.68rem; padding:1px 6px; border-radius:4px;">✓ Alta Emitida</span>` : `<span style="background:#e0f2fe; color:#0369a1; font-size:0.68rem; padding:1px 6px; border-radius:4px;">👨‍⚕️ En Atención</span>`}
          </strong>
          <div style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; color:#0284c7; font-weight:700;">
            📅 ${tMedico ? tMedico.dia : "--/--/----"} · 🕒 ${tMedico ? tMedico.hora : "Atención en curso"}
          </div>
        </div>
        <div style="font-size:0.78rem; color:#334155; line-height:1.45;">
          <div><strong>Médico Tratante:</strong> ${f.medico?.usuario ? `${f.medico.usuario} (${f.medico.colegiatura || "CMP"})` : "— (Pendiente de evaluación médica)"}</div>
          <div><strong>Diagnóstico Definitivo / Presuntivo (CIE-10):</strong> <strong style="color:#0284c7;">${cie10}</strong></div>
          <div><strong>Destino de Egreso:</strong> ${px.destino || ss.destinoAlta || "Alta Médica a Domicilio con Indicaciones"}</div>
          <div style="color:#15803d; font-weight:700; margin-top:2px;">✓ Criterios de estabilización clínica y epicrisis conformes según NTS N° 042-MINSA.</div>
          ${(f.medico && typeof window.generarSelloFirmaDigitalHTML === "function") ? `<div style="margin-top:8px;">${window.generarSelloFirmaDigitalHTML("MEDICO", { nombre: f.medico.usuario, colegiatura: f.medico.colegiatura, fechaHora: tMedico ? tMedico.texto : "" })}</div>` : ""}
        </div>
      </div>
    ` : `
      <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:10px 14px; margin-bottom:10px; color:#64748b; font-size:0.76rem; display:flex; justify-content:space-between; align-items:center;">
        <div><span>🔒</span> <strong>Paso 3: Médico de Emergencia:</strong> Registro reservado al Cuerpo Médico / Auditoría.</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:0.72rem;">📅 ${tMedico ? tMedico.dia : "--/--/----"} · 🕒 ${tMedico ? tMedico.hora : "Pendiente"}</div>
      </div>
    `;

    // PASO 4: CAJA
    const totalLiq = px.montoTotal || ss.montoTotal || "0.00";
    const copago = px.copago || ss.copago || "0.00";
    const paso4Html = (esAuditor || rolActivo === "CAJA" || tCaja) ? `
      <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:6px; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
          <strong style="color:#0f172a; font-size:0.84rem; display:flex; align-items:center; gap:6px;">
            <span>💳 Paso 4: Liquidación, Facturación &amp; Cierre Administrativo</span>
            ${tCaja ? `<span style="background:#15803d; color:#fff; font-size:0.68rem; padding:1px 6px; border-radius:4px;">✓ Cerrado</span>` : `<span style="background:#fef3c7; color:#92400e; font-size:0.68rem; padding:1px 6px; border-radius:4px;">⏳ Pendiente Caja</span>`}
          </strong>
          <div style="font-family:'JetBrains Mono', monospace; font-size:0.75rem; color:#0284c7; font-weight:700;">
            📅 ${tCaja ? tCaja.dia : "--/--/----"} · 🕒 ${tCaja ? tCaja.hora : "Pendiente"}
          </div>
        </div>
        <div style="font-size:0.78rem; color:#334155; line-height:1.45;">
          <div><strong>Cajero / Liquidador:</strong> ${f.caja?.usuario || (tCaja ? "Caja Central UPP" : "— (Pendiente de liquidación)")}</div>
          <div style="display:flex; gap:16px; margin:4px 0; background:#f8fafc; border:1px solid #e2e8f0; padding:6px 10px; border-radius:6px; font-family:'JetBrains Mono', monospace; font-size:0.8rem;">
            <div>Total Liquidado: <strong style="color:#0f172a;">${String(totalLiq).startsWith('S/') ? totalLiq : 'S/ ' + Number(totalLiq).toFixed(2)}</strong></div>
            <div>Copago Paciente: <strong style="color:#15803d;">S/ ${Number(copago).toFixed(2)}</strong></div>
          </div>
          <div style="color:#15803d; font-weight:700;">✓ Comprobante emitido bajo Ley N° 29414 (Egreso garantizado sin retención del paciente).</div>
        </div>
      </div>
    ` : `
      <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:10px 14px; margin-bottom:10px; color:#64748b; font-size:0.76rem; display:flex; justify-content:space-between; align-items:center;">
        <div><span>🔒</span> <strong>Paso 4: Caja &amp; Cierre:</strong> Registro reservado a Personal de Caja / Auditoría.</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:0.72rem;">📅 ${tCaja ? tCaja.dia : "--/--/----"} · 🕒 ${tCaja ? tCaja.hora : "Pendiente"}</div>
      </div>
    `;

    let logsAuditoriaPx = [];
    try {
      const rawLogs = localStorage.getItem("AUDIT_LOGS_HISTORIAL");
      const allLogs = rawLogs ? JSON.parse(rawLogs) : (window.AUDIT_LOGS || []);
      const dniUp = String(dni || "").toUpperCase();
      const hcUp = String(historiaClinica || "").toUpperCase();
      const nomUp = String(nombreCompleto || "").toUpperCase();
      logsAuditoriaPx = allLogs.filter(l => {
        const det = String(l.detalle || "").toUpperCase();
        const ldni = String(l.dni || "").toUpperCase();
        return (dniUp && dniUp !== "S/D" && (ldni === dniUp || det.includes(dniUp)))
          || (hcUp && det.includes(hcUp))
          || (nomUp && nomUp.length > 4 && det.includes(nomUp))
          || ["SELLAR_TRIAJE", "VALIDAR_COBERTURA", "ALTA_MEDICA", "CIERRE_LIQUIDACION", "FIRMA_ELECTRONICA_MEDICA", "EVALUACION_MEDICA_PROTOCOLIZADA", "JUNTA_MEDICA_NTS139", "KARDEX_AGREGAR", "CIERRE_HC_INMUTABLE"].includes(l.evento);
      }).slice(0, 25);
    } catch(e) {}

    const medsHist = (px.kardexItems || ss.kardexItems || state.kardexItems || []).map(k => k.nombre).join(", ");
    const labsHist = (px.ordenesLaboratorio || ss.ordenesLaboratorio || state.ordenesLaboratorio || []).map(l => l.nombre).join(", ");
    const imgsHist = (px.ordenesImagenes || ss.ordenesImagenes || state.ordenesImagenes || []).map(i => i.nombre).join(", ");

    const bitacoraAuditorHtml = `
      <div style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:10px; padding:12px 14px; margin-top:10px;">
        <div style="font-size:0.80rem; font-weight:800; color:#0f172a; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
          <span>📜</span> <span>Auditoría Integral — Todo lo Realizado en el Episodio:</span>
        </div>
        <div style="font-size:0.75rem; color:#334155; margin-bottom:8px; display:grid; gap:3px;">
          <div><strong>Medicamentos / Kardex:</strong> ${medsHist || "—"}</div>
          <div><strong>Laboratorio:</strong> ${labsHist || "—"}</div>
          <div><strong>Imágenes:</strong> ${imgsHist || "—"}</div>
        </div>
        ${logsAuditoriaPx.length > 0 ? `
          <div style="max-height:170px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">
            <table style="width:100%; border-collapse:collapse; font-size:0.70rem;">
              <thead><tr style="background:#0f172a; color:#fff;"><th style="padding:4px 6px;">Hora</th><th style="padding:4px 6px;">Módulo</th><th style="padding:4px 6px;">Evento</th><th style="padding:4px 6px;">Detalle</th></tr></thead>
              <tbody>
                ${logsAuditoriaPx.map((l, i) => `<tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}; border-bottom:1px solid #e2e8f0;"><td style="padding:4px 6px; font-family:monospace; white-space:nowrap;">${l.timestamp || ""}</td><td style="padding:4px 6px; font-weight:700;">${l.modulo || ""}</td><td style="padding:4px 6px; font-weight:800; color:#0369a1;">${l.evento || ""}</td><td style="padding:4px 6px;">${l.detalle || ""}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        ` : `<div style="font-size:0.72rem; color:#64748b;">Sin eventos adicionales en bitácora.</div>`}
      </div>
    `;

    const badgePermisos = esAuditor 
      ? `<span style="background:#0284c7; color:#ffffff; font-size:0.72rem; font-weight:800; padding:3px 10px; border-radius:9999px;">🛡️ MODO AUDITOR: Vista Integral de Datos &amp; Trazabilidad Completa (100%)</span>`
      : `<span style="background:#fef3c7; color:#92400e; font-size:0.72rem; font-weight:800; padding:3px 10px; border-radius:9999px;">🔒 Estación: ${rolActivo} (Acceso Adaptado a su Rol)</span>`;

    modal.innerHTML = `
      <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:14px; max-width:740px; width:100%; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); overflow:hidden;">
        
        <!-- Header -->
        <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#ffffff; padding:14px 18px; border-bottom:3px solid #0284c7;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px;">
                <h3 style="font-size:1rem; font-weight:900; margin:0;">📋 Consulta de Paciente &amp; Trazabilidad Asistencial</h3>
                <span style="background:${prioCfg.bg}; color:${prioCfg.text}; font-size:0.68rem; font-weight:900; padding:2px 6px; border-radius:4px;">${prioCfg.label}</span>
              </div>
              <p style="font-size:0.78rem; color:#cbd5e1; margin:0;">
                Ticket: <strong>${px.ticket || px.turno || "T-001"}</strong> · <strong>${nombreCompleto}</strong> · DNI: <strong>${dni}</strong> · HC: <span style="font-family:'JetBrains Mono', monospace;">${historiaClinica}</span>
              </p>
            </div>
            <button type="button" onclick="window.cerrarModalHistorialFlujo()" style="background:transparent; border:none; color:#cbd5e1; font-size:1.4rem; cursor:pointer; line-height:1;">✕</button>
          </div>
          <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            ${badgePermisos}
            <span style="font-size:0.72rem; color:#94a3b8; font-family:'JetBrains Mono', monospace;">Ingreso: ${tLlegada.dia} · ${tLlegada.hora}</span>
          </div>
        </div>

        <!-- Body con Scroll -->
        <div style="padding:14px 18px; overflow-y:auto; max-height:calc(92vh - 140px); background:#f8fafc;">
          
          <!-- Tarjeta Resumen de Filiación y Datos Clínicos Ingresados -->
          <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px; margin-bottom:12px;">
            <div style="font-size:0.78rem; font-weight:800; color:#0f172a; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
              <span>🩺</span> <span>Resumen de Datos Clínicos Registrados al Momento:</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:6px; font-size:0.76rem; color:#334155;">
              <div><strong>Paciente:</strong> ${nombreCompleto} (${edad} a, ${sexo})</div>
              <div><strong>Cama Asignada:</strong> ${cama}</div>
              <div><strong>Seguro:</strong> ${seguro} (${docSeguro})</div>
              <div><strong>Diagnóstico Médico:</strong> <span style="color:#0284c7; font-weight:700;">${cie10}</span></div>
            </div>
          </div>

          <!-- Timeline de Trazabilidad Paso a Paso con Día y Hora -->
          <div style="font-size:0.80rem; font-weight:800; color:#0f172a; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
            <span>⏱️</span> <span>Línea de Trazabilidad Asistencial (Día y Hora en cada estación):</span>
          </div>

          ${paso1Html}
          ${paso2Html}
          ${paso3Html}
          ${paso4Html}
          ${bitacoraAuditorHtml}

        </div>

        <!-- Footer -->
        <div style="background:#ffffff; border-top:1px solid #e2e8f0; padding:12px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <button type="button" onclick="window.cerrarModalHistorialFlujo(); seleccionarExpedienteYVisualizarPorRol('${px.id}');" class="btn-full-primary" style="background:#0284c7; font-size:0.78rem; font-weight:800; padding:7px 14px; border-radius:6px; cursor:pointer;" title="Cargar y posicionar en pantalla para el rol ${rolActivo}">
            🎯 Seleccionar y Cargar en Pantalla (${rolActivo})
          </button>
          <button type="button" onclick="window.cerrarModalHistorialFlujo()" class="btn-full-secondary" style="font-size:0.78rem; padding:7px 14px; border-radius:6px; cursor:pointer;">
            ✕ Cerrar Consulta
          </button>
        </div>

      </div>
    `;

    modal.style.display = "flex";
  };
})();
