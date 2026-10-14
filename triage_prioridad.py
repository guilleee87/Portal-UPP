# =============================================================================
# SISTEMA DE PRIORIDAD DE ATENCION EN URGENCIAS - CASO 6
# Modulos:
#   - Enfermeria 1: Deteccion automatica de ID, Busqueda en BD y Creacion de HC
#   - Enfermeria 2: Ticket automatico por hora de llegada y Cobertura/Seguro
#   - Triage Clinico: Decisiones 1 y 2 (SpO2 y Antecedentes)
# =============================================================================

from dataclasses import dataclass
from datetime import datetime
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROJO = "\033[91m"
AMARILLO = "\033[93m"
VERDE = "\033[92m"
AZUL = "\033[94m"
CIAN = "\033[96m"
NEGRITA = "\033[1m"
RESET = "\033[0m"

# -----------------------------------------------------------------------------
# BASE DE DATOS SIMULADA DEL HOSPITAL (DNI o Nombre Completo -> Nro de HC)
# -----------------------------------------------------------------------------
BASE_DATOS_HC = {
    "px a": "HC-2025-089",
    "px b": "HC-2026-142",
    "10203040": "HC-2024-510",
    "70809010": "HC-2025-332",
    "carlos mendoza rojas": "HC-2023-115",
    "maria torres silva": "HC-2024-890",
}

CONTADOR_HC_NUEVA = 1
CONTADOR_HC_TEMP = 1


@dataclass
class Paciente:
    # Enfermeria 1: Registro y gestion automatica de HC
    identificador: str
    hora_llegada: str
    estado_registrado: str                 # "Si", "No" o "Por confirmar"
    historia_clinica: str                  # Codigo de HC recuperado o creado
    accion_hc: str                         # Explicacion de que hizo el sistema
    # Enfermeria 2: Atencion administrativa no clinica
    turno: str = None
    datos_administrativos: str = None
    # Triage Clinico: Datos criticos y decision
    spo2: float = None
    antecedentes_registrados: bool = None
    prioridad: int = None

    def hora_como_tiempo(self):
        return datetime.strptime(self.hora_llegada, "%H:%M").time()


class ErrorDeValidacion(Exception):
    """Excepcion cuando un dato no cumple las reglas de validacion."""
    pass


# -----------------------------------------------------------------------------
# 1. REGLAS DE VALIDACION Y DETECCION AUTOMATICA DE IDENTIDAD
# -----------------------------------------------------------------------------
def validar_identificador(valor):
    if valor is None or not str(valor).strip():
        raise ErrorDeValidacion("El identificador no puede estar vacio.")
    valor = str(valor).strip()
    patron = r"^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\.\-]+$"
    if not re.match(patron, valor) or len(valor) < 2:
        msg = "Identificador invalido. Use DNI, Nombres, un nombre o NN."
        raise ErrorDeValidacion(msg)
    return valor


def clasificar_y_buscar_en_bd(identificador):
    """
    Evalua el identificador ingresado:
    - Si es DNI (8 digitos) o Nombre y Apellido (2+ palabras alfabeticas):
      busca en BASE_DATOS_HC y devuelve "Si" o "No" (creando nueva HC).
    - Cualquier otra alternativa (1 solo nombre, NN, codigo incompleto):
      devuelve "Por confirmar" (creando HC temporal de emergencia).
    """
    global CONTADOR_HC_NUEVA, CONTADOR_HC_TEMP

    limpio = " ".join(identificador.strip().split())
    clave = limpio.lower()

    # Caso especial para los identificadores del Caso 6 Oficial (Demo)
    es_caso_demo = clave in ("px a", "px b")

    # 1. Verificar si es DNI (exactamente 8 digitos numericos)
    es_dni = bool(re.match(r"^\d{8}$", limpio))

    # 2. Verificar si son Nombres y Apellidos (2 o mas palabras solo de letras,
    #    excluyendo codigos que empiecen con "nn")
    palabras = limpio.split()
    solo_letras = bool(
        re.match(r"^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$", limpio)
    )
    es_nn = palabras[0].lower() == "nn"
    es_nombre_completo = (len(palabras) >= 2 and solo_letras and not es_nn)

    # SI ES DNI O NOMBRE COMPLETO -> BUSCAR EN BASE DE DATOS
    if es_dni or es_nombre_completo or es_caso_demo:
        if clave in BASE_DATOS_HC:
            nro_hc = BASE_DATOS_HC[clave]
            estado = "Si"
            accion = f"Encontrado en BD ({nro_hc} recuperada)"
        else:
            nro_hc = f"HC-NUEVA-{CONTADOR_HC_NUEVA:03d}"
            CONTADOR_HC_NUEVA += 1
            # Se guarda en la BD para futuras consultas en la misma sesion
            BASE_DATOS_HC[clave] = nro_hc
            estado = "No"
            accion = f"No figura en BD -> Se crea {nro_hc}"
    else:
        # CUALQUIER OTRA ALTERNATIVA (1 solo nombre como 'guillermo', 'NN', etc)
        nro_hc = f"HC-TEMP-EMG-{CONTADOR_HC_TEMP:03d}"
        CONTADOR_HC_TEMP += 1
        estado = "Por confirmar"
        accion = f"Identidad parcial/NN -> Se abre {nro_hc}"

    return estado, nro_hc, accion


def validar_hora(valor):
    if valor is None or not str(valor).strip():
        raise ErrorDeValidacion("La hora de llegada es obligatoria.")
    valor = str(valor).strip()
    if not re.match(r"^\d{1,2}:\d{2}$", valor):
        msg = f"Hora '{valor}' invalida. Use formato HH:MM (ej. 07:15)."
        raise ErrorDeValidacion(msg)
    try:
        dt = datetime.strptime(valor, "%H:%M")
        return dt.strftime("%H:%M")
    except ValueError:
        raise ErrorDeValidacion("Hora fuera de rango (00:00 a 23:59).")


def validar_booleano(valor):
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, str):
        v = valor.strip().lower()
        if v in ("si", "sí", "s", "true", "1"):
            return True
        if v in ("no", "n", "false", "0"):
            return False
    raise ErrorDeValidacion("Respuesta invalida. Ingrese 'si' o 'no'.")


def validar_datos_admin(valor):
    if valor is None or not str(valor).strip():
        raise ErrorDeValidacion("El dato administrativo es obligatorio.")
    v = str(valor).strip()
    v_low = v.lower()
    if v_low in ("si", "sí", "s", "asegurado"):
        return "Asegurado"
    if v_low in (
        "no", "n", "particular", "no asegurado", "no asegurado (particular)"
    ):
        return "No asegurado (Particular)"
    patron = r"^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\.\-\/\(\)]+$"
    if not re.match(patron, v) or len(v) < 2:
        msg = "Dato invalido. Ingrese 'si', 'no', 'Asegurado', 'SIS', etc."
        raise ErrorDeValidacion(msg)
    return v


def validar_spo2(valor):
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        raise ErrorDeValidacion("El valor de SpO2 es obligatorio.")
    try:
        num = float(valor)
    except (TypeError, ValueError):
        raise ErrorDeValidacion("SpO2 invalido. Solo se admiten numeros.")
    if not (0 <= num <= 100):
        msg = f"SpO2 = {num}% fuera de rango (0-100%). Verifique el oximetro."
        raise ErrorDeValidacion(msg)
    return num


# -----------------------------------------------------------------------------
# 2. FUNCIONES DE CADA ETAPA DEL ALGORITMO
# -----------------------------------------------------------------------------
def enfermeria_1_registro(datos_px):
    ident = datos_px["identificador"]
    hora = datos_px["hora_llegada"]
    estado = datos_px["estado_registrado"]
    hc = datos_px["historia_clinica"]
    accion = datos_px["accion_hc"]

    print(
        f"  [Enfermeria 1] ID: {ident} | Hora: {hora} | "
        f"Registrado: {NEGRITA}{estado}{RESET} -> {accion}"
    )
    return Paciente(
        identificador=ident,
        hora_llegada=hora,
        estado_registrado=estado,
        historia_clinica=hc,
        accion_hc=accion
    )


def asignar_turnos_por_llegada(px_a, px_b):
    if px_a.hora_como_tiempo() <= px_b.hora_como_tiempo():
        px_a.turno = "T-01"
        px_b.turno = "T-02"
    else:
        px_b.turno = "T-01"
        px_a.turno = "T-02"


def enfermeria_2_atencion(paciente, datos_admin):
    paciente.datos_administrativos = validar_datos_admin(datos_admin)
    print(
        f"  [Enfermeria 2] {paciente.identificador} -> "
        f"Ticket auto: {paciente.turno} | "
        f"Admin: {paciente.datos_administrativos}"
    )


def evaluar_triage(paciente, spo2, antecedentes):
    paciente.spo2 = validar_spo2(spo2)
    paciente.antecedentes_registrados = validar_booleano(antecedentes)
    print(
        f"  [Triage]       {paciente.identificador} ({paciente.historia_clinica})"
        f" -> SpO2: {paciente.spo2}% | "
        f"Antecedentes: {paciente.antecedentes_registrados}"
    )


def decision_1_prioridad(paciente):
    if paciente.spo2 < 92 or paciente.antecedentes_registrados:
        paciente.prioridad = 1
        print(
            f"  [Decision 1]   {paciente.identificador} -> "
            f"PRIORIDAD 1 (CRITICO)"
        )
    else:
        paciente.prioridad = 3
        print(
            f"  [Decision 1]   {paciente.identificador} -> "
            f"PRIORIDAD 3 (MODERADO)"
        )
    return paciente.prioridad


def decision_2_asignar_cama(px_a, px_b):
    if px_a.prioridad < px_b.prioridad:
        return px_a, px_b, False
    elif px_b.prioridad < px_a.prioridad:
        return px_b, px_a, False
    else:
        if px_a.hora_como_tiempo() <= px_b.hora_como_tiempo():
            return px_a, px_b, True
        return px_b, px_a, True


# -----------------------------------------------------------------------------
# 3. FLUJO PRINCIPAL Y REPORTE DE RESULTADOS
# -----------------------------------------------------------------------------
def ejecutar_triage(px_a_datos, px_b_datos):
    print("\n" + "=" * 74)
    print(" INICIO DEL PROTOCOLO DE TRIAGE: 2 Pacientes - 1 Cama Disponible")
    print("=" * 74)

    # 1. Enfermeria 1: Registro automatico y HC
    px_a = enfermeria_1_registro(px_a_datos)
    px_b = enfermeria_1_registro(px_b_datos)
    print()

    # 2. Enfermeria 2: Ticket automatico por llegada + Datos administrativos
    asignar_turnos_por_llegada(px_a, px_b)
    enfermeria_2_atencion(px_a, px_a_datos["datos_administrativos"])
    enfermeria_2_atencion(px_b, px_b_datos["datos_administrativos"])
    print()

    # 3. Triage Clinico y Decision 1
    for px, d in ((px_a, px_a_datos), (px_b, px_b_datos)):
        evaluar_triage(px, d["spo2"], d["antecedentes_registrados"])
        decision_1_prioridad(px)
        print()

    # 4. Decision 2: Asignacion de la unica cama disponible
    asignado, espera, desempate = decision_2_asignar_cama(px_a, px_b)

    if asignado.prioridad == 1:
        esp_asig = "Cardiologia / Unidad de Trauma Shock"
    else:
        esp_asig = "Medicina General"

    if espera.prioridad == 1:
        esp_esp = "Area de Observacion / Monitoreo Continuo"
    else:
        esp_esp = "Sala de Espera Regular (Medicina General)"

    if not desempate:
        motivo = (
            f"Mayor severidad clinica: "
            f"Prioridad {asignado.prioridad} vs Prioridad {espera.prioridad} "
            f"(independiente del orden de llegada)."
        )
    else:
        motivo = (
            f"Empate de prioridad (ambos P{asignado.prioridad}). "
            f"Desempate por orden de llegada ({asignado.turno}: "
            f"{asignado.hora_llegada} vs {espera.hora_llegada})."
        )

    p_asig = "CRITICO" if asignado.prioridad == 1 else "MODERADO"
    a_asig = "Si" if asignado.antecedentes_registrados else "No"

    print("=" * 74)
    print(f"{ROJO}{NEGRITA} [!] ALERTA ROJA: CAMA ASIGNADA{RESET}")
    print("=" * 74)
    print(
        f"  Paciente (ID):      {NEGRITA}{asignado.identificador}{RESET}"
    )
    print(
        f"  Estado Registrado:  {asignado.estado_registrado} "
        f"({asignado.accion_hc})"
    )
    print(
        f"  Datos Admin.:       Ticket: {asignado.turno} | "
        f"Seguro: {asignado.datos_administrativos} | "
        f"Llegada: {asignado.hora_llegada}"
    )
    print(
        f"  Prioridad:          {ROJO}{NEGRITA}"
        f"PRIORIDAD {asignado.prioridad} ({p_asig}){RESET}"
    )
    print(f"  Especialidad:       {esp_asig}")
    print(
        f"  Datos Criticos:     SpO2: {asignado.spo2}% | "
        f"Antecedentes: {a_asig}"
    )
    print(f"  Motivo Decision:    {motivo}")

    p_esp = "CRITICO" if espera.prioridad == 1 else "MODERADO"
    a_esp = "Si" if espera.antecedentes_registrados else "No"

    print("\n" + "-" * 74)
    print(f"{AMARILLO}{NEGRITA} [!] ALERTA AMBAR: PACIENTE EN ESPERA{RESET}")
    print("-" * 74)
    print(
        f"  Paciente (ID):      {NEGRITA}{espera.identificador}{RESET}"
    )
    print(
        f"  Estado Registrado:  {espera.estado_registrado} "
        f"({espera.accion_hc})"
    )
    print(
        f"  Datos Admin.:       Ticket: {espera.turno} | "
        f"Seguro: {espera.datos_administrativos} | "
        f"Llegada: {espera.hora_llegada}"
    )
    print(
        f"  Prioridad:          {AMARILLO}{NEGRITA}"
        f"PRIORIDAD {espera.prioridad} ({p_esp}){RESET}"
    )
    print(f"  Derivacion:         {esp_esp}")
    print(
        f"  Datos Criticos:     SpO2: {espera.spo2}% | "
        f"Antecedentes: {a_esp}"
    )
    print("=" * 74 + "\n")


# -----------------------------------------------------------------------------
# 4. CAPTURA INTERACTIVA Y MENU
# -----------------------------------------------------------------------------
def pedir_dato(prompt, validador, guia):
    while True:
        try:
            valor = input(f"  {prompt} ({guia}): ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  [!] Entrada finalizada.")
            sys.exit(0)
        try:
            return validador(valor)
        except ErrorDeValidacion as err:
            print(f"    {ROJO}[X] ERROR: {err}{RESET}")


def capturar_paciente(etiqueta):
    print(f"\n{AZUL}{NEGRITA}=== INGRESO DE DATOS: {etiqueta} ==={RESET}")
    print(f"{CIAN}  --- Enfermeria 1: Registro ---{RESET}")
    identificador = pedir_dato(
        "Identificador",
        validar_identificador,
        "DNI 8 digitos, Nombre Completo, un solo nombre o NN"
    )
    estado, hc, accion = clasificar_y_buscar_en_bd(identificador)
    print(
        f"  {VERDE}[Sistema BD]{RESET} Estado registrado: "
        f"{NEGRITA}{estado}{RESET} -> {accion}"
    )

    hora = pedir_dato("Hora de llegada", validar_hora, "HH:MM, ej. 07:15")

    print(f"{CIAN}  --- Enfermeria 2: Atencion Administrativa ---{RESET}")
    print("  [*] El Turno/Ticket se asignara automaticamente segun la hora.")
    admin = pedir_dato(
        "Paciente asegurado / Cobertura",
        validar_datos_admin,
        "si/no, SIS, EsSalud, etc."
    )

    print(f"{CIAN}  --- Triage Clinico ---{RESET}")
    spo2 = pedir_dato("Saturacion SpO2 %", validar_spo2, "0 a 100")
    ant = pedir_dato("Antecedentes de riesgo?", validar_booleano, "si/no")

    return {
        "identificador": identificador,
        "hora_llegada": hora,
        "estado_registrado": estado,
        "historia_clinica": hc,
        "accion_hc": accion,
        "datos_administrativos": admin,
        "spo2": spo2,
        "antecedentes_registrados": ant
    }


def modo_demo():
    print(f"\n{NEGRITA}>>> EJECUTANDO CASO 6 OFICIAL (DEMO) <<<{RESET}")
    est_a, hc_a, acc_a = clasificar_y_buscar_en_bd("Px A")
    est_b, hc_b, acc_b = clasificar_y_buscar_en_bd("Px B")

    datos_a = {
        "identificador": "Px A",
        "hora_llegada": "07:15",
        "estado_registrado": est_a,
        "historia_clinica": hc_a,
        "accion_hc": acc_a,
        "datos_administrativos": "Asegurado",
        "spo2": 99,
        "antecedentes_registrados": False
    }
    datos_b = {
        "identificador": "Px B",
        "hora_llegada": "07:19",
        "estado_registrado": est_b,
        "historia_clinica": hc_b,
        "accion_hc": acc_b,
        "datos_administrativos": "Asegurado",
        "spo2": 91,
        "antecedentes_registrados": True
    }
    ejecutar_triage(datos_a, datos_b)


def main():
    while True:
        print("\n" + "=" * 74)
        print(" SISTEMA DE PRIORIDAD DE ATENCION EN URGENCIAS - CASO 6")
        print("=" * 74)
        print("  1) Ejecutar Caso 6 Oficial (Demo automatica)")
        print("  2) Ingresar datos manualmente (Enfermeria 1, 2 y Triage)")
        print("  3) Salir")

        try:
            op = input("\n  Seleccione una opcion (1, 2 o 3): ").strip()
        except (EOFError, KeyboardInterrupt):
            modo_demo()
            break

        if op == "1":
            modo_demo()
        elif op == "2":
            print(
                "\n  [Nota BD] Pacientes ya registrados en la BD del hospital "
                "para probar el 'Si':"
            )
            print(
                "            DNI: 10203040, 70809010 | "
                "Nombres: Carlos Mendoza Rojas, Maria Torres Silva"
            )
            datos_a = capturar_paciente("PACIENTE A")
            datos_b = capturar_paciente("PACIENTE B")
            ejecutar_triage(datos_a, datos_b)
        elif op == "3":
            print("\nFinalizando programa.\n")
            break
        else:
            print(f"\n  {ROJO}Opcion no valida. Elija 1, 2 o 3.{RESET}")

        try:
            rep = input("\n¿Otra evaluacion? (s/n): ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            break
        if rep not in ("s", "si", "sí"):
            break


if __name__ == "__main__":
    main()
# Fin del programa
