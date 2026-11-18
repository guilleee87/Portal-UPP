# 🏥 Sistema de Prioridad de Atención — Caso 6: Triaje Hospitalario

**Universidad Politécnica del Perú (UPP)**  
**Facultad de Ingeniería**  
**Evaluación:** Trabajo Parcial  

---

## 📌 Descripción del Proyecto

Este proyecto implementa la solución computacional completa para el **Caso 6: "Prioridad de atención"**, donde dos pacientes acuden casi simultáneamente al servicio de emergencias médicas en una situación de saturación hospitalaria con **disponibilidad inmediata para una (1) sola cama / evaluación médica**.

El sistema modela el pseudocódigo y diagrama de flujo clínico:
1. **Paso 1 y 2 (Registro):** Admisión del paciente y emisión de ticket con hora de llegada (`HH:MM`).
2. **Paso 3, 4 y 5 (Triaje Clínico):** Toma de signos vitales: Saturación de Oxígeno (`SpO2` entre 0 y 100%) y registro de antecedentes médicos relevantes (booleano).
3. **Decisión 1 (Clasificación Clínica):**
   - **Prioridad 1 (Crítico):** Si `SpO2 < 92%` O presenta antecedentes relevantes registrados.
   - **Prioridad 3 (Moderado):** En cualquier otro caso.
4. **Decisión 2 (Asignación de Cama):**
   - Menor valor numérico de prioridad tiene preferencia (`P1` prevalece sobre `P3`).
   - En caso de **empate de prioridad**, se aplica desempate por hora de llegada más temprana (`hora_llegada`).
5. **Inicio de Atención Médica:**
   - Paciente asignado ingresa a la especialidad correspondiente (`Cardiología / Trauma Shock` para P1 o `Medicina General` para P3).
   - Paciente no asignado pasa a sala de espera y monitoreo continuo.

---

## 🚀 Formas de Ejecución

### Opción 1: Ejecución Inmediata en Navegador (Recomendada - Sin Dependencias)
No requiere instalar nada. Puedes abrir la web directamente:
1. Ve a la carpeta `Triaje`.
2. Haz **doble clic en `index.html`** (se abrirá en tu navegador predeterminado: Chrome, Edge, Firefox, Opera, etc.).
3. ¡Listo! Todo el algoritmo, validaciones, visualizador de flujo y reporte clínico funcionan de forma nativa e interactiva.

### Opción 2: Ejecución con Servidor en Python (API REST)
Si deseas ejecutarlo mediante un servidor backend en Python:
1. Abre una terminal o PowerShell en la carpeta `Triaje`:
   ```bash
   python server.py
   ```
2. Abre tu navegador en:
   ```
   http://localhost:8000
   ```
*(Nota: `server.py` utiliza exclusivamente la librería estándar de Python `http.server`, por lo que **no** requiere instalar librerías externas como Flask o FastAPI con `pip`).*

### Opción 3: Ejecución por Consola de Python (Script Original)
Para ejecutar la versión de consola interactiva o la demo por terminal:
```bash
python triage_prioridad.py
```

---

## 🧪 Casos de Estudio y Demostración Rápida

La aplicación web incluye botones de acceso directo a los siguientes casos de prueba:

| Caso de Prueba | Paciente A | Paciente B | Resultado Esperado | Justificación Algorítmica |
| :--- | :--- | :--- | :--- | :--- |
| **⭐ Caso 6 Oficial (Demo)** | 07:15, SpO2 99%, Sin Antecedentes (`P3`) | 07:19, SpO2 91%, Con Antecedentes (`P1`) | **Cama a Paciente B** | Mayor urgencia clínica (`P1` vs `P3`). |
| **⚖️ Empate Crítico** | 08:10, SpO2 89% (`P1`) | 08:25, SpO2 88% (`P1`) | **Cama a Paciente A** | Empate en P1: desempata hora de llegada (08:10 llegó antes). |
| **⏱️ Empate Moderado** | 09:40, SpO2 97% (`P3`) | 09:15, SpO2 96% (`P3`) | **Cama a Paciente B** | Empate en P3: desempata hora de llegada (09:15 llegó antes). |
| **🎯 Sensibilidad SpO2** | 10:00, SpO2 92% (`P3`) | 10:05, SpO2 91% (`P1`) | **Cama a Paciente B** | Prueba de frontera: 91% activa hipoxemia crítica; 92% es normal. |
| **🧬 Impacto de Antecedentes** | 11:00, SpO2 96%, Con Antecedentes (`P1`) | 10:50, SpO2 95%, Sin Antecedentes (`P3`) | **Cama a Paciente A** | El antecedente eleva a P1 a pesar de saturación normal. |

---

## 📁 Estructura del Proyecto

```text
Triaje/
├── index.html            # Interfaz web interactiva del simulador de triaje
├── styles.css            # Estilos clínicos modernos, badges y hoja de impresión
├── app.js                # Lógica del algoritmo, validaciones, visualizador y reportes
├── server.py             # Servidor HTTP y API REST en Python (sin librerías externas)
├── triage_prioridad.py   # Script original del modelo de datos y flujo por consola
└── README.md             # Guía académica del proyecto
```

---

## 📄 Generación de Reporte Clínico
La aplicación cuenta con el botón **"📄 Generar Reporte Clínico Oficial"**, el cual emite un informe médico formal con:
- Membrete institucional de la UPP.
- Resumen de signos vitales evaluados.
- Dictamen de las Decisiones 1 y 2 con su fundamentación clínica y algorítmica.
- Formato optimizado para exportar a **PDF** o imprimir directamente.
