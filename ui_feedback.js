/**
 * ==============================================================================
 * SISTEMA UNIFICADO DE FEEDBACK VISUAL CLÍNICO (HIS / EMERGENCIAS) - UPP FCS
 * ui_feedback.js
 * Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
 * Estándares: NTS N° 042-MINSA, NTS N° 139-MINSA, Ley N° 27604, Ley N° 29733, Ley N° 29414
 * ==============================================================================
 */

(function () {
  "use strict";

  // ----------------------------------------------------------------------------
  // 1. GESTOR DE TOASTS (Esquina Inferior Derecha - Máximo 3 simultáneos)
  // ----------------------------------------------------------------------------
  const MAX_TOASTS = 3;
  const TOAST_DURATION_MS = 3500;
  let toastContainer = null;

  function obtenerContenedorToasts() {
    if (!toastContainer || !document.body.contains(toastContainer)) {
      toastContainer = document.getElementById("ui_toast_container");
      if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "ui_toast_container";
        toastContainer.setAttribute("aria-live", "polite");
        document.body.appendChild(toastContainer);
      }
    }
    return toastContainer;
  }

  function sanitizarTexto(txt) {
    if (!txt) return "";
    const div = document.createElement("div");
    div.textContent = String(txt);
    return div.innerHTML;
  }

  /**
   * Muestra un Toast de confirmación o notificación en vivo.
   * Prohibido para errores graves, alergias o bloqueos legales.
   * @param {'success'|'info'|'warning'} tipo
   * @param {string} titulo
   * @param {string} detalle
   */
  function mostrarToast(tipo, titulo, detalle) {
    const contenedor = obtenerContenedorToasts();
    if (!contenedor) return;

    // Si ya hay 3 toasts, descartar el más antiguo
    const activos = contenedor.querySelectorAll(".ui-toast:not(.ui-toast-out)");
    if (activos.length >= MAX_TOASTS) {
      descartarToast(activos[0]);
    }

    const t = tipo === "info" ? "info" : tipo === "warning" ? "warning" : "success";

    const toastEl = document.createElement("div");
    toastEl.className = `ui-toast ui-toast-${t}`;
    toastEl.setAttribute("role", "status");

    let iconSvg = "";
    if (t === "success") {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (t === "info") {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    } else {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    }

    toastEl.innerHTML = `
      <div class="ui-toast-icon">${iconSvg}</div>
      <div class="ui-toast-content">
        <div class="ui-toast-title">${sanitizarTexto(titulo || "Notificación")}</div>
        ${detalle ? `<div class="ui-toast-detail">${detalle.includes("<") ? detalle : sanitizarTexto(detalle)}</div>` : ""}
      </div>
      <button type="button" class="ui-toast-close" title="Cerrar aviso" aria-label="Cerrar">&times;</button>
      <div class="ui-toast-progress">
        <div class="ui-toast-progress-bar" style="transition: transform ${TOAST_DURATION_MS}ms linear; transform: scaleX(0);"></div>
      </div>
    `;

    const btnCerrar = toastEl.querySelector(".ui-toast-close");
    btnCerrar.addEventListener("click", () => descartarToast(toastEl));

    contenedor.appendChild(toastEl);

    // Iniciar barra de progreso y auto-cierre
    requestAnimationFrame(() => {
      const bar = toastEl.querySelector(".ui-toast-progress-bar");
      if (bar) bar.style.transform = "scaleX(1)";
    });

    const timer = setTimeout(() => {
      descartarToast(toastEl);
    }, TOAST_DURATION_MS);

    toastEl._timer = timer;
  }

  function descartarToast(toastEl) {
    if (!toastEl || toastEl.classList.contains("ui-toast-out")) return;
    if (toastEl._timer) clearTimeout(toastEl._timer);
    toastEl.classList.add("ui-toast-out");
    setTimeout(() => {
      if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    }, 280);
  }

  // ----------------------------------------------------------------------------
  // 2. MODALES CLÍNICOS BLOQUEANTES (Nunca apilar uno encima de otro)
  // ----------------------------------------------------------------------------
  let backdropEl = null;
  let modalConfigActivo = null;

  function obtenerBackdropModal() {
    if (!backdropEl || !document.body.contains(backdropEl)) {
      backdropEl = document.getElementById("ui_modal_backdrop");
      if (!backdropEl) {
        backdropEl = document.createElement("div");
        backdropEl.id = "ui_modal_backdrop";
        backdropEl.setAttribute("role", "dialog");
        backdropEl.setAttribute("aria-modal", "true");
        backdropEl.innerHTML = `
          <div class="ui-modal-card">
            <div class="ui-modal-header">
              <div class="ui-modal-header-icon" id="ui_modal_icon"></div>
              <div class="ui-modal-title" id="ui_modal_title"></div>
            </div>
            <div class="ui-modal-body" id="ui_modal_body"></div>
            <div class="ui-modal-footer" id="ui_modal_footer"></div>
          </div>
        `;
        document.body.appendChild(backdropEl);

        // Manejar cierre con tecla Esc si no es decisión obligatoria
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && backdropEl.classList.contains("ui-modal-open")) {
            if (modalConfigActivo && !modalConfigActivo.esDecisionObligatoria) {
              cerrarModalClinico();
              if (typeof modalConfigActivo.enCancelar === "function") {
                modalConfigActivo.enCancelar();
              }
            }
          }
        });

        // Clic fuera del card (solo si no es obligatoria)
        backdropEl.addEventListener("click", (e) => {
          if (e.target === backdropEl) {
            if (modalConfigActivo && !modalConfigActivo.esDecisionObligatoria) {
              cerrarModalClinico();
              if (typeof modalConfigActivo.enCancelar === "function") {
                modalConfigActivo.enCancelar();
              }
            }
          }
        });
      }
    }
    return backdropEl;
  }

  /**
   * Muestra un modal bloqueante clínico o legal.
   * Regla: Nunca abrir un modal encima de otro modal.
   */
  function mostrarModalClinico(opciones) {
    const config = Object.assign(
      {
        titulo: "Atención Clínica",
        mensaje: "",
        icono: "warning", // 'danger' | 'warning' | 'info' | 'success'
        textoConfirmar: "Entendido / Aceptar",
        textoCancelar: null,
        esDecisionObligatoria: false,
        enConfirmar: null,
        enCancelar: null
      },
      opciones || {}
    );

    modalConfigActivo = config;
    const b = obtenerBackdropModal();

    const elIcon = b.querySelector("#ui_modal_icon");
    const elTitle = b.querySelector("#ui_modal_title");
    const elBody = b.querySelector("#ui_modal_body");
    const elFooter = b.querySelector("#ui_modal_footer");

    elIcon.className = `ui-modal-header-icon ${config.icono}`;
    let iconSvg = "";
    if (config.icono === "danger") {
      iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else if (config.icono === "warning") {
      iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else if (config.icono === "info") {
      iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    } else {
      iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    }
    elIcon.innerHTML = iconSvg;

    elTitle.textContent = config.titulo;
    elBody.textContent = config.mensaje;

    // Armar botones de footer
    elFooter.innerHTML = "";
    if (config.textoCancelar) {
      const btnCancel = document.createElement("button");
      btnCancel.type = "button";
      btnCancel.className = "ui-modal-btn ui-modal-btn-cancel";
      btnCancel.textContent = config.textoCancelar;
      btnCancel.addEventListener("click", () => {
        cerrarModalClinico();
        if (typeof config.enCancelar === "function") config.enCancelar();
      });
      elFooter.appendChild(btnCancel);
    }

    const btnConfirm = document.createElement("button");
    btnConfirm.type = "button";
    btnConfirm.className = `ui-modal-btn ${config.icono === "danger" ? "ui-modal-btn-danger" : "ui-modal-btn-confirm"}`;
    btnConfirm.textContent = config.textoConfirmar;
    btnConfirm.addEventListener("click", () => {
      cerrarModalClinico();
      if (typeof config.enConfirmar === "function") config.enConfirmar();
    });
    elFooter.appendChild(btnConfirm);

    b.classList.add("ui-modal-open");
    btnConfirm.focus();
  }

  function cerrarModalClinico() {
    if (backdropEl) {
      backdropEl.classList.remove("ui-modal-open");
    }
    modalConfigActivo = null;
  }

  // ----------------------------------------------------------------------------
  // 3. BANNERS Y ALERTAS INLINE (Fijos dentro del módulo correspondiente)
  // ----------------------------------------------------------------------------
  const BANNERS_REGISTRADOS = {};

  /**
   * Muestra o actualiza un banner inline sin bloquear el scroll ni los clics.
   * @param {string} contenedorId - ID del elemento donde se inserta el banner
   * @param {'p1'|'soat_tope'|'cie10_riesgo'|'sellado'|'confidencialidad'} tipo
   * @param {string} mensajeHtml
   */
  function mostrarBannerInline(contenedorId, tipo, mensajeHtml) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    const bannerId = `ui_banner_${contenedorId}_${tipo}`;
    let bannerEl = document.getElementById(bannerId);

    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.id = bannerId;
      contenedor.insertBefore(bannerEl, contenedor.firstChild);
    }

    let claseTipo = "ui-banner-p1-urgente";
    let iconStr = "🚨";
    if (tipo === "soat_tope") {
      claseTipo = "ui-banner-soat-tope";
      iconStr = "⚠️";
    } else if (tipo === "cie10_riesgo") {
      claseTipo = "ui-banner-cie10-riesgo";
      iconStr = "⛔";
    } else if (tipo === "sellado") {
      claseTipo = "ui-banner-sellado-nts";
      iconStr = "🔒";
    } else if (tipo === "confidencialidad") {
      claseTipo = "ui-banner-confidencialidad";
      iconStr = "🛡️";
    }

    bannerEl.className = `ui-banner-inline ${claseTipo}`;
    bannerEl.innerHTML = `
      <span class="ui-banner-icon">${iconStr}</span>
      <span class="ui-banner-text">${mensajeHtml}</span>
    `;
    bannerEl.style.display = "flex";
    BANNERS_REGISTRADOS[bannerId] = true;
  }

  function removerBannerInline(contenedorId, tipo) {
    const bannerId = `ui_banner_${contenedorId}_${tipo}`;
    const bannerEl = document.getElementById(bannerId);
    if (bannerEl) {
      bannerEl.style.display = "none";
      if (bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    }
    delete BANNERS_REGISTRADOS[bannerId];
  }

  // ----------------------------------------------------------------------------
  // 4. BADGES Y PILLS (Etiquetas de escaneo rápido)
  // ----------------------------------------------------------------------------
  function crearBadgePill(tipo, texto) {
    const span = document.createElement("span");
    span.className = `ui-badge-pill ui-badge-${tipo}`;
    span.textContent = texto;
    return span;
  }

  // ----------------------------------------------------------------------------
  // 5. TOOLTIPS CONTEXTUALES (Ícono ? con explicación accesible máx 2 líneas)
  // ----------------------------------------------------------------------------
  const DICCIONARIO_TOOLTIPS = {
    "NEWS2": "Escala de Alerta Temprana (Royal College of Physicians): evalúa riesgo de deterioro clínico con 7 parámetros fisiológicos.",
    "ESI v5": "Emergency Severity Index: categoriza la agudeza y necesidad de recursos desde Nivel 1 (Reanimación) a 5 (No urgente).",
    "ÍNDICE DE SHOCK": "Relación FC / PAS: valores ≥ 1.0 alertan sobre hipovolemia oculta o shock temprano.",
    "QSOFA": "quick SOFA (FR≥22, PAS≤100, Glasgow<15): tamizaje rápido de riesgo de sepsis fuera de cuidados intensivos.",
    "TOPE 5 UIT SOAT": "Límite legal obligatorio de cobertura médica por accidente de tránsito (S/ 25,750 según D.S. 024-2002-MTC).",
    "LEY N° 27604": "Ley de Emergencia Vital: atención médica y quirúrgica inmediata obligatoria sin condicionamiento administrativo ni pago previo.",
    "LEY N° 29733": "Ley de Protección de Datos Personales: protege la confidencialidad de la anamnesis y salud ante personal administrativo.",
    "ART. 195 CPP": "Código Procesal Penal: prohíbe certificar muerte violenta o sospechosa; exige necropsia de ley por Medicina Legal."
  };

  function inyectarTooltipsClinicos() {
    // Buscar elementos relevantes en la interfaz para anexar micro-tooltip si no existe
    const etiquetas = document.querySelectorAll("label, span, th, dt, h4, h5");
    etiquetas.forEach((el) => {
      if (el.dataset.tooltipInyectado) return;
      const tUpper = el.textContent.toUpperCase();

      for (const [clave, explicacion] of Object.entries(DICCIONARIO_TOOLTIPS)) {
        if (tUpper.includes(clave) && !el.querySelector(".ui-tooltip-btn")) {
          el.dataset.tooltipInyectado = "true";
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ui-tooltip-btn";
          btn.setAttribute("aria-label", `Ayuda sobre ${clave}`);
          btn.textContent = "?";

          const popover = document.createElement("span");
          popover.className = "ui-tooltip-popover";
          popover.textContent = explicacion;
          btn.appendChild(popover);

          // Soporte para tap en dispositivos móviles
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.classList.toggle("is-active");
          });

          el.appendChild(btn);
          break;
        }
      }
    });

    // Cerrar tooltips activos al hacer clic fuera
    document.addEventListener("click", () => {
      document.querySelectorAll(".ui-tooltip-btn.is-active").forEach((b) => b.classList.remove("is-active"));
    });
  }

  // ----------------------------------------------------------------------------
  // 6. SKELETON LOADERS (Carga localizada con shimmer sin congelar pantalla)
  // ----------------------------------------------------------------------------
  function mostrarSkeleton(contenedorId, opciones) {
    const cont = document.getElementById(contenedorId);
    if (!cont) return;

    const opt = Object.assign({ lineas: 3, altura: 20 }, opciones || {});
    const skelId = `ui_skeleton_${contenedorId}`;
    if (document.getElementById(skelId)) return;

    const box = document.createElement("div");
    box.id = skelId;
    box.className = "ui-skeleton-box";
    box.style.padding = "14px";
    box.style.marginBottom = "10px";

    for (let i = 0; i < opt.lineas; i++) {
      const line = document.createElement("div");
      line.className = "ui-skeleton-box ui-skeleton-line";
      line.style.height = `${opt.altura}px`;
      line.style.width = i === opt.lineas - 1 ? "60%" : "100%";
      box.appendChild(line);
    }

    cont.style.position = "relative";
    cont.insertBefore(box, cont.firstChild);
  }

  function ocultarSkeleton(contenedorId) {
    const skelId = `ui_skeleton_${contenedorId}`;
    const skel = document.getElementById(skelId);
    if (skel && skel.parentNode) {
      skel.parentNode.removeChild(skel);
    }
  }

  // ----------------------------------------------------------------------------
  // 7. EMPTY STATES (Estados vacíos claros con ícono y texto de una línea)
  // ----------------------------------------------------------------------------
  function renderizarEmptyState(contenedorId, config) {
    const cont = document.getElementById(contenedorId);
    if (!cont) return;

    const c = Object.assign(
      {
        icono: "📋",
        titulo: "Sin registros activos",
        descripcion: "No hay elementos pendientes en esta bandeja en este momento."
      },
      config || {}
    );

    cont.innerHTML = `
      <div class="ui-empty-state">
        <div class="ui-empty-state-icon">${c.icono}</div>
        <div class="ui-empty-state-title">${sanitizarTexto(c.titulo)}</div>
        <div class="ui-empty-state-desc">${sanitizarTexto(c.descripcion)}</div>
      </div>
    `;
  }

  // ----------------------------------------------------------------------------
  // 8. INTERCEPTOR INTELIGENTE DE ALERT Y CONFIRM NATIVOS
  // ----------------------------------------------------------------------------
  // Reemplaza los popups nativos grises del navegador por Toasts elegantes o Modales
  // clínicos según el peso legal y la gravedad del mensaje.
  const nativeAlert = window.alert;
  const nativeConfirm = window.confirm;

  window.alert = function (mensaje) {
    const str = String(mensaje || "");
    const strLower = str.toLowerCase();

    // Detección de mensajes de éxito, confirmación o notificación liviana -> TOAST
    const esExito =
      str.includes("✅") ||
      str.includes("🏷️") ||
      str.includes("📋") ||
      str.includes("🛌") ||
      str.includes("🔓") ||
      str.includes("🩺") ||
      strLower.includes("éxito") ||
      strLower.includes("exitosamente") ||
      strLower.includes("confirmad") ||
      strLower.includes("guardad") ||
      strLower.includes("asignad") ||
      strLower.includes("liberad") ||
      strLower.includes("notificación");

    // Detección de bloqueos severos, leyes o farmacovigilancia -> MODAL BLOQUEANTE
    const esBloqueoSevero =
      str.includes("🚨") ||
      str.includes("⛔") ||
      str.includes("❌") ||
      str.includes("🔒") ||
      strLower.includes("farmacovigilancia") ||
      strLower.includes("candado legal") ||
      strLower.includes("art. 195") ||
      strLower.includes("riesgo biológico") ||
      strLower.includes("prescripción bloqueada") ||
      strLower.includes("bloqueado");

    if (esBloqueoSevero) {
      mostrarModalClinico({
        titulo: str.includes("FARMACOVIGILANCIA")
          ? "Alerta Crítica de Farmacovigilancia (NTS N° 139-MINSA)"
          : str.includes("CANDADO LEGAL")
          ? "Bloqueo Médico-Legal (Art. 195/196 CPP)"
          : "Bloqueo Clínico-Administrativo",
        mensaje: str.replace(/^[🚨⛔❌🔒\s]+/, ""),
        icono: "danger",
        textoConfirmar: "Entendido",
        esDecisionObligatoria: false
      });
      return;
    }

    if (esExito) {
      const lineas = str.split("\n").filter((l) => l.trim().length > 0);
      const titulo = lineas[0] ? lineas[0].replace(/^[✅🏷️📋🛌🔓🩺\s]+/, "") : "Acción Confirmada";
      const detalle = lineas.slice(1).join(" ") || "";
      mostrarToast("success", titulo, detalle);
      return;
    }

    // Alerta estándar informativa / advertencia
    const esAdvertencia = str.includes("⚠️") || strLower.includes("ingrese") || strLower.includes("complete") || strLower.includes("seleccione");
    if (esAdvertencia) {
      mostrarToast("warning", "Revisión Requerida", str.replace(/^[⚠️\s]+/, ""));
      return;
    }

    // Modal informativo por defecto
    mostrarModalClinico({
      titulo: "Información Hospitalaria",
      mensaje: str,
      icono: "info",
      textoConfirmar: "Aceptar"
    });
  };

  /**
   * Diálogo de confirmación clínica asíncrono o modal bloqueante.
   */
  window.confirmarAccionClinica = function (opciones, enConfirmar, enCancelar) {
    let config = {
      titulo: "Confirmación Requerida",
      mensaje: typeof opciones === "string" ? opciones : opciones.mensaje,
      icono: "warning",
      textoConfirmar: "Confirmar",
      textoCancelar: "Cancelar",
      esDecisionObligatoria: true,
      enConfirmar: enConfirmar,
      enCancelar: enCancelar
    };

    if (typeof opciones === "object" && opciones !== null) {
      config = Object.assign(config, opciones);
    }

    mostrarModalClinico(config);
  };

  // ----------------------------------------------------------------------------
  // 9. MONITOR REACTIVO DE BANNERS CLÍNICOS EN CABECERA Y MÓDULOS
  // ----------------------------------------------------------------------------
  function actualizarBannersClinicos() {
    const state = window.STATE;
    if (!state) return;

    // A) Banner Emergencia Vital P-I (Ley N° 27604) en la cabecera
    const headerPaciente = document.querySelector(".header-paciente") || document.getElementById("barra_control_rbac") || document.body;
    const esP1 = state.prioridad === "I" || state.alertaPrioridad1 === true;

    if (esP1) {
      mostrarBannerInline(
        "sec_mod1",
        "p1",
        "<strong>🚨 EMERGENCIA VITAL P-I (Ley N° 27604):</strong> Paciente en Shock Trauma / Quirófano Directo. Atención médica inmediata sin condicionamiento administrativo ni pago previo."
      );
      mostrarBannerInline(
        "sec_mod4",
        "p1",
        "<strong>🚨 EMERGENCIA VITAL P-I (Ley N° 27604):</strong> Atención prioritaria sin detención por trámites administrativos."
      );
    } else {
      removerBannerInline("sec_mod1", "p1");
      removerBannerInline("sec_mod4", "p1");
    }

    // B) Banner SOAT Tope 5 UIT en Módulo 3 y 8
    const soatValido = state.soatActivo || false;
    const gastoActual = Number(state.totalGastosSOAT || state.costoTotalAcumulado || 0);
    const limite5UIT = 25750;
    if (soatValido && gastoActual >= limite5UIT) {
      mostrarBannerInline(
        "sec_mod3",
        "soat_tope",
        "<strong>⚠️ LÍMITE SOAT ALCANZADO (5 UIT - S/ 25,750):</strong> El monto consumido supera la cobertura obligatoria de ley. Active pase complementario a EPS o SIS."
      );
      mostrarBannerInline(
        "sec_mod8",
        "soat_tope",
        "<strong>⚠️ LÍMITE SOAT EXCEDIDO:</strong> Los cargos adicionales deben derivarse al seguro complementario o cuenta particular."
      );
    } else {
      removerBannerInline("sec_mod3", "soat_tope");
      removerBannerInline("sec_mod8", "soat_tope");
    }

    // C) Banner Riesgo de Glosa CIE-10 en Módulo 8
    const cie10 = state.cie10Principal || document.getElementById("cie10_codigo")?.value;
    if (!cie10 && state.estadoFlujo === "PENDIENTE_CAJA") {
      mostrarBannerInline(
        "sec_mod8",
        "cie10_riesgo",
        "<strong>⛔ ADVERTENCIA DE AUDITORÍA (Riesgo de Glosa):</strong> El expediente no cuenta con diagnóstico CIE-10 principal registrado por el médico tratante."
      );
    } else {
      removerBannerInline("sec_mod8", "cie10_riesgo");
    }

    actualizarEstadosVacios();
  }

  function actualizarEstadosVacios() {
    // 1. Órdenes de Kardex vacías
    const kb = document.getElementById("kardex_items_body");
    if (kb && kb.children.length === 0) {
      kb.innerHTML = `
        <tr class="ui-empty-kardex-row">
          <td colspan="3" style="padding:16px 0;">
            <div class="ui-empty-state" style="margin:4px 0; padding:18px 16px;">
              <div class="ui-empty-state-icon" style="font-size:22px;">💊</div>
              <div class="ui-empty-state-title">Sin órdenes farmacológicas prescritas</div>
              <div class="ui-empty-state-desc">Seleccione medicamentos del catálogo o ingrese una prescripción para iniciar el Kardex.</div>
            </div>
          </td>
        </tr>
      `;
    }
  }

  // ----------------------------------------------------------------------------
  // 10. INICIALIZACIÓN AL CARGAR EL DOM
  // ----------------------------------------------------------------------------
  function initUIFeedback() {
    obtenerContenedorToasts();
    obtenerBackdropModal();
    inyectarTooltipsClinicos();
    actualizarEstadosVacios();

    // Redirigir toast de cola a sistema unificado
    if (typeof window.mostrarToastCola === "function" && !window._toastColaHookeado) {
      window._toastColaHookeado = true;
      const prevToastCola = window.mostrarToastCola;
      window.mostrarToastCola = function(htmlMsg) {
        if (!htmlMsg) return;
        const plain = String(htmlMsg).replace(/<[^>]*>/g, " ");
        const tipo = htmlMsg.includes("🚨") || htmlMsg.includes("💥") ? "warning" : "info";
        const parts = plain.split(":");
        const titulo = parts[0] ? parts[0].trim() : "Notificación de Posta";
        const detalle = parts.slice(1).join(": ").trim() || plain;
        mostrarToast(tipo, titulo, detalle);
      };
    }

    // Actualizar banners cada 2 segundos y ante eventos de cambio
    setInterval(actualizarBannersClinicos, 2000);
    window.addEventListener("storage", actualizarBannersClinicos);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUIFeedback);
  } else {
    initUIFeedback();
  }

  // Exponer API pública en window
  window.UI_FEEDBACK = {
    mostrarToast,
    descartarToast,
    mostrarModalClinico,
    cerrarModalClinico,
    confirmarAccionClinica: window.confirmarAccionClinica,
    mostrarBannerInline,
    removerBannerInline,
    crearBadgePill,
    mostrarSkeleton,
    ocultarSkeleton,
    renderizarEmptyState,
    actualizarBannersClinicos,
    inyectarTooltipsClinicos
  };

  window.mostrarToast = mostrarToast;
})();
