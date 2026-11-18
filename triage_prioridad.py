"""
Sistema de Prioridad de Atencion - Caso 6: "Prioridad de atencion"
-------------------------------------------------------------------
Dos pacientes llegan casi simultaneamente a emergencia y solo hay
disponibilidad inmediata para 1 evaluacion/cama. Este programa
implementa el algoritmo (pseudocodigo y diagrama de flujo) trabajados
previamente: registro, triage, clasificacion de prioridad (Decision 1)
y asignacion de la unica cama disponible (Decision 2), con desempate
por hora de llegada.

Variables del modelo de datos (ver analisis del caso):
    hora_llegada                -> str  "HH:MM"           (no critica, solo desempate)
    spo2                        -> float 0.0 - 100.0       (DATO CRITICO 1)
    antecedentes_registrados    -> bool                    (DATO CRITICO 2)
    prioridad                   -> int  {1, 3}              (calculada)

Reglas de validacion:
    Regla 1 -> spo2 debe estar en el rango [0, 100]
    Regla 2 -> prioridad solo puede ser 1 (critico) o 3 (moderado)
"""

from dataclasses import dataclass
from datetime import datetime


# ---------------------------------------------------------------------------
# Modelo de datos
# ---------------------------------------------------------------------------
@dataclass
class Paciente:
    nombre: str
    hora_llegada: str                      # "HH:MM"
    spo2: float = None                     # DATO CRITICO 1
    antecedentes_registrados: bool = None  # DATO CRITICO 2
    prioridad: int = None

    def hora_como_tiempo(self):
        return datetime.strptime(self.hora_llegada, "%H:%M").time()


class ErrorDeValidacion(Exception):
    """Se lanza cuando un dato no cumple una regla de validacion del sistema."""


# ---------------------------------------------------------------------------
# Reglas de validacion
# ---------------------------------------------------------------------------
def validar_spo2(valor):
    """Regla 1: spo2 debe ser un numero real entre 0 y 100."""
    try:
        valor = float(valor)
    except (TypeError, ValueError):
        raise ErrorDeValidacion(f"spo2 debe ser un numero. Valor recibido: {valor!r}")
    if not (0 <= valor <= 100):
        raise ErrorDeValidacion(
            f"spo2 = {valor} fuera de rango permitido (0-100). "
            "Verifique el valor del oximetro e ingrese nuevamente."
        )
    return valor


def validar_prioridad(valor):
    """Regla 2: prioridad solo puede ser 1 (critico) o 3 (moderado)."""
    try:
        valor = int(valor)
    except (TypeError, ValueError):
        raise ErrorDeValidacion(f"prioridad debe ser entero. Valor recibido: {valor!r}")
    if valor not in (1, 3):
        raise ErrorDeValidacion(f"Valor de prioridad no valido: {valor}. Solo se admite 1 o 3.")
    return valor


def validar_hora(valor):
    """hora_llegada debe tener formato HH:MM (24 horas)."""
    try:
        datetime.strptime(valor, "%H:%M")
    except (TypeError, ValueError):
        raise ErrorDeValidacion(f"hora_llegada = {valor!r} invalida. Use formato HH:MM (ej. 07:15).")
    return valor


def validar_antecedentes(valor):
    """antecedentes_registrados debe interpretarse como booleano."""
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, (int, float)):
        return bool(valor)
    if isinstance(valor, str):
        v = valor.strip().lower()
        if v in ("si", "sí", "s", "true", "verdadero", "1"):
            return True
        if v in ("no", "n", "false", "falso", "0"):
            return False
    raise ErrorDeValidacion(f"antecedentes_registrados debe ser si/no. Valor recibido: {valor!r}")


# ---------------------------------------------------------------------------
# Pasos del algoritmo (secuencia tomada del pseudocodigo / diagrama de flujo)
# ---------------------------------------------------------------------------
def registrar_paciente(nombre, hora_llegada):
    """Paso 2: registrar en sistema (verificar seguro, emitir ticket)."""
    hora_llegada = validar_hora(hora_llegada)
    print(f"[Registro] {nombre} registrado en sistema. Ticket de atencion emitido.")
    return Paciente(nombre=nombre, hora_llegada=hora_llegada)


def derivar_a_triage(paciente):
    """Paso 3: derivar a Triage."""
    print(f"[Triage]   {paciente.nombre} derivado a Triage.")


def evaluar_triage(paciente, spo2, antecedentes_registrados):
    """Paso 4-5: HC, entrevista, signos y sintomas, y signos vitales."""
    paciente.spo2 = validar_spo2(spo2)
    paciente.antecedentes_registrados = validar_antecedentes(antecedentes_registrados)
    print(f"[Triage]   {paciente.nombre}: spo2={paciente.spo2}% | "
          f"antecedentes_registrados={paciente.antecedentes_registrados}")


def decision_1_clasificar_prioridad(paciente):
    """Decision 1: clasificacion clinica de urgencia (los 2 datos criticos)."""
    if paciente.spo2 < 92 or paciente.antecedentes_registrados:
        prioridad = 1   # critico
    else:
        prioridad = 3   # moderado
    paciente.prioridad = validar_prioridad(prioridad)
    print(f"[Decision 1] {paciente.nombre} -> prioridad = {paciente.prioridad} "
          f"({'critico' if paciente.prioridad == 1 else 'moderado'})")
    return paciente.prioridad


def decision_2_asignar_cama(px_a, px_b):
    """Decision 2: con 1 sola cama disponible, decide a quien se asigna."""
    if px_a.prioridad < px_b.prioridad:
        asignado, en_espera = px_a, px_b
    elif px_b.prioridad < px_a.prioridad:
        asignado, en_espera = px_b, px_a
    else:
        # Empate de prioridad: se usa hora_llegada como criterio de desempate
        if px_a.hora_como_tiempo() <= px_b.hora_como_tiempo():
            asignado, en_espera = px_a, px_b
        else:
            asignado, en_espera = px_b, px_a
    return asignado, en_espera


def iniciar_atencion(paciente):
    """Paso final: inicio de atencion medica segun prioridad."""
    especialidad = "Cardiologia / unidad de trauma shock" if paciente.prioridad == 1 else "Medicina general"
    print(f"[Atencion] {paciente.nombre}: especialidad -> {especialidad}. "
          f"Se inician tratamiento y examenes complementarios.")


# ---------------------------------------------------------------------------
# Flujo principal (equivalente completo al diagrama de flujo)
# ---------------------------------------------------------------------------
def ejecutar_triage(px_a_datos, px_b_datos):
    """
    px_a_datos / px_b_datos: dict con llaves
        nombre, hora_llegada, spo2, antecedentes_registrados
    """
    print("=" * 72)
    print("INICIO: llegan 2 pacientes casi simultaneamente. Disponibilidad: 1 cama.")
    print("=" * 72)

    px_a = registrar_paciente(px_a_datos["nombre"], px_a_datos["hora_llegada"])
    px_b = registrar_paciente(px_b_datos["nombre"], px_b_datos["hora_llegada"])

    for paciente, datos in ((px_a, px_a_datos), (px_b, px_b_datos)):
        derivar_a_triage(paciente)
        evaluar_triage(paciente, datos["spo2"], datos["antecedentes_registrados"])
        decision_1_clasificar_prioridad(paciente)

    print("-" * 72)
    asignado, en_espera = decision_2_asignar_cama(px_a, px_b)
    print(f"[Decision 2] Unica cama disponible asignada a: {asignado.nombre} "
          f"(prioridad {asignado.prioridad}).")
    print(f"             {en_espera.nombre} es derivado a espera / otra area "
          f"(prioridad {en_espera.prioridad}).")
    print("-" * 72)

    iniciar_atencion(asignado)
    print("FIN")
    print("=" * 72)
    return asignado, en_espera


# ---------------------------------------------------------------------------
# Captura de datos por consola, con reintento ante datos invalidos
# (asi se comporta un sistema bien estructurado ante un error del usuario)
# ---------------------------------------------------------------------------
def pedir_hora():
    while True:
        valor = input("  Hora de llegada (HH:MM): ").strip()
        try:
            return validar_hora(valor)
        except ErrorDeValidacion as e:
            print(f"  [ERROR] {e}")


def pedir_spo2():
    while True:
        valor = input("  spo2 (%): ").strip()
        try:
            return validar_spo2(valor)
        except ErrorDeValidacion as e:
            print(f"  [ERROR] {e}")


def pedir_antecedentes():
    while True:
        valor = input("  Antecedentes relevantes registrados? (si/no): ").strip()
        try:
            return validar_antecedentes(valor)
        except ErrorDeValidacion as e:
            print(f"  [ERROR] {e}")


def capturar_paciente_interactivo(etiqueta):
    print(f"\n--- Datos de {etiqueta} ---")
    nombre = input("  Nombre / identificador: ").strip() or etiqueta
    hora_llegada = pedir_hora()
    spo2 = pedir_spo2()
    antecedentes = pedir_antecedentes()
    return {
        "nombre": nombre,
        "hora_llegada": hora_llegada,
        "spo2": spo2,
        "antecedentes_registrados": antecedentes,
    }


def modo_interactivo():
    datos_a = capturar_paciente_interactivo("Paciente A")
    datos_b = capturar_paciente_interactivo("Paciente B")
    print()
    ejecutar_triage(datos_a, datos_b)


def modo_demo():
    """Ejecuta el algoritmo con los datos exactos del Caso 6."""
    datos_a = {"nombre": "Px A", "hora_llegada": "07:15", "spo2": 99, "antecedentes_registrados": False}
    datos_b = {"nombre": "Px B", "hora_llegada": "07:19", "spo2": 91, "antecedentes_registrados": True}
    ejecutar_triage(datos_a, datos_b)


def main():
    print("SISTEMA DE PRIORIDAD DE ATENCION - Caso 6")
    print("1) Ejecutar con los datos del caso (demo)")
    print("2) Ingresar datos manualmente")
    opcion = input("Seleccione una opcion (1/2): ").strip()
    if opcion == "2":
        modo_interactivo()
    else:
        modo_demo()


if __name__ == "__main__":
    main()
