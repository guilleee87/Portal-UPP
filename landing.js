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
