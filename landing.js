/**
 * Controlador de Interacción para la Landing Page
 * Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
 */

document.addEventListener("DOMContentLoaded", () => {
  const triggerBtn = document.getElementById("dropdownTrigger");
  const dropdownMenu = document.getElementById("dropdownMenu");

  if (triggerBtn && dropdownMenu) {
    // Abrir / Cerrar al hacer clic en el botón superior izquierdo
    triggerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isExpanded = triggerBtn.getAttribute("aria-expanded") === "true";
      toggleMenu(!isExpanded);
    });

    // Cerrar al hacer clic en cualquier parte fuera del menú
    document.addEventListener("click", (e) => {
      if (!dropdownMenu.contains(e.target) && !triggerBtn.contains(e.target)) {
        toggleMenu(false);
      }
    });

    // Cerrar con la tecla Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        toggleMenu(false);
      }
    });
  }

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
});
// Registra el Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

let promptInstalacion = null;
const btnInstalar = document.getElementById("btnInstalarApp");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  promptInstalacion = e;
});

if (btnInstalar) {
  btnInstalar.addEventListener("click", async () => {
    // Si el navegador es Android / Chrome y capturó el evento
    if (promptInstalacion) {
      promptInstalacion.prompt();
      const { outcome } = await promptInstalacion.userChoice;
      if (outcome === "accepted") {
        btnInstalar.innerHTML = "<span>✅ App Instalada</span>";
      }
      promptInstalacion = null;
    } else {
      // Si entra desde iPhone o el navegador requiere añadir a inicio manualmente
      const esIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
      if (esIOS) {
        alert("Para instalar en tu iPhone:\n1. Toca el botón Compartir (cuadrado con flecha ⎋ abajo).\n2. Selecciona 'Agregar a inicio' (Add to Home Screen).");
      } else {
        alert("Para instalar esta aplicación:\nToca el menú de 3 puntos (⋮) de tu navegador arriba a la derecha y selecciona 'Instalar aplicación' o 'Agregar a la pantalla principal'.");
      }
    }
  });
}
