#!/usr/bin/env python3
"""
Servidor Web para Sistema de Prioridad de Atencion (Triaje) - Caso 6
Universidad Politecnica del Peru (UPP)
Facultad de Ciencias de la Salud - Enfermeria
Autores: Luis Guillermo Vasquez Valdivieso & Rodrigo Alonso Anazgo Farro
-------------------------------------------------------------------------
Servidor ligero que utiliza unicamente la libreria estandar de Python
(sin dependencias externas). Sirve los archivos estaticos de la interfaz web
y expone una API REST para procesar la evaluacion de triaje utilizando la
logica exacta de triage_prioridad.py (Enfermeria 1, 2 y Triage Clinico).
"""

import json
import os
import sqlite3
import random
import re
import sys
import time
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# Importar la logica algoritmica del script oficial
try:
    import triage_prioridad as triage
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    import triage_prioridad as triage

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Almacén de sesiones de CAPTCHA activas para consulta de seguros
CAPTCHA_SESSIONS = {}

DB_PATH = os.path.join(DIRECTORY, "triaje_hospitalario.db")

def inicializar_bd_sqlite():
    """Inicializa la base de datos relacional SQLite local con tablas para HC y pacientes."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS historias_clinicas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                identificador TEXT UNIQUE,
                historia_clinica TEXT,
                nombre_completo TEXT,
                tipo_seguro TEXT,
                estado_bd TEXT,
                ticket TEXT,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Registros base del caso de estudio UPP
        iniciales = [
            ("px a", "HC-2025-089", "Paciente Demo A", "EsSalud", "Si", "T-01"),
            ("px b", "HC-2026-142", "Paciente Demo B", "SIS Gratuito", "Si", "T-02"),
            ("10203040", "HC-2024-510", "Carlos Mendoza Rojas", "EsSalud", "Si", "T-03"),
            ("70809010", "HC-2025-332", "Maria Torres Silva", "SIS Gratuito", "Si", "T-04"),
            ("carlos mendoza rojas", "HC-2023-115", "Carlos Mendoza Rojas", "EsSalud", "Si", "T-05"),
            ("maria torres silva", "HC-2024-890", "Maria Torres Silva", "SIS Gratuito", "Si", "T-06"),
        ]
        for ident, hc, nom, seg, est, tck in iniciales:
            cur.execute("""
                INSERT OR IGNORE INTO historias_clinicas (identificador, historia_clinica, nombre_completo, tipo_seguro, estado_bd, ticket)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (ident.lower(), hc, nom, seg, est, tck))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error inicializando SQLite: {e}")


def buscar_coincidencias_sqlite(termino):
    """Busca coincidencias parciales por DNI, nombres, apellidos o N° de HC."""
    inicializar_bd_sqlite()
    term = f"%{str(termino or '').strip().lower()}%"
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM historias_clinicas 
        WHERE LOWER(identificador) LIKE ? 
           OR LOWER(nombre_completo) LIKE ? 
           OR LOWER(historia_clinica) LIKE ?
        ORDER BY id DESC LIMIT 20
    """, (term, term, term))
    filas = [dict(r) for r in cur.fetchall()]
    conn.close()
    return filas

def buscar_o_crear_hc_sqlite(identificador, nombre=""):
    """Busca un paciente en SQLite. Si no existe, genera nueva HC y la registra."""
    inicializar_bd_sqlite()
    limpio = str(identificador or "").strip().lower()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM historias_clinicas WHERE identificador = ?", (limpio,))
    fila = cur.fetchone()

    if fila:
        res = {
            "encontrado": True,
            "estado": "Si",
            "historia_clinica": fila["historia_clinica"],
            "nombre": fila["nombre_completo"],
            "tipo_seguro": fila["tipo_seguro"],
            "ticket": fila["ticket"],
            "accion": f"Encontrado en Base de Datos ({fila['historia_clinica']} recuperada)"
        }
        conn.close()
        return res

    # Si no existe, contar cuántas HC nuevas existen para autogenerar consecutivo
    cur.execute("SELECT COUNT(*) FROM historias_clinicas")
    total = cur.fetchone()[0] + 1
    nueva_hc = f"HC-NUEVA-{str(total).rjust(3, '0')}"
    cur.execute("""
        INSERT INTO historias_clinicas (identificador, historia_clinica, nombre_completo, estado_bd)
        VALUES (?, ?, ?, 'No')
    """, (limpio, nueva_hc, nombre or limpio.upper()))
    conn.commit()
    conn.close()

    return {
        "encontrado": False,
        "estado": "No",
        "historia_clinica": nueva_hc,
        "nombre": nombre or limpio.upper(),
        "tipo_seguro": None,
        "ticket": None,
        "accion": f"No figura en BD → Creada y registrada en SQLite ({nueva_hc})"
    }


def generar_codigo_captcha(longitud=5):
    """Genera código alfanumérico legible descartando caracteres confusos."""
    chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(random.choice(chars) for _ in range(longitud))


def calcular_autogenerado_essalud(dni, nombre, fec_nac, sexo):
    """
    Calcula el autogenerado oficial de EsSalud (Resolución de Gerencia General N° 035-GG-ESSALUD):
    [AA][MM][DD][Sexo 1=M,0=F][Consonantes y vocales de apellidos y nombres][Sufijo DNI 3 dígitos]
    """
    dni_limpio = re.sub(r"\D", "", str(dni or ""))
    # Fecha de nacimiento o aproximación cronológica
    if fec_nac and len(fec_nac) == 10 and fec_nac[4] == "-" and fec_nac[7] == "-":
        aa = fec_nac[2:4]
        mm = fec_nac[5:7]
        dd = fec_nac[8:10]
    elif len(dni_limpio) >= 2:
        val = int(dni_limpio[:2])
        aa = f"{(val % 40 + 60):02d}"
        mm = "05"
        dd = "15"
    else:
        aa, mm, dd = "70", "01", "01"

    # Sexo: 0 femenino, 1 masculino
    s_cod = "0" if (sexo and str(sexo).upper().startswith("F")) else "1"

    # Letras según apellidos y nombre
    nom_limpio = re.sub(r"[^A-Za-z\s]", "", str(nombre or "")).strip().upper()
    partes = nom_limpio.split()
    if len(partes) >= 3:
        nom = partes[0]
        ap1 = partes[-2]
        ap2 = partes[-1]
    elif len(partes) == 2:
        nom = partes[0]
        ap1 = partes[1]
        ap2 = "Z"
    else:
        nom = partes[0] if partes else "PACIENTE"
        ap1 = "APELLIDO"
        ap2 = "MATERNO"

    c1 = ap1[0] if ap1 else "A"
    c2 = ap2[0] if ap2 else "M"
    c3 = ap1[1] if len(ap1) > 1 else "X"
    c4 = nom[0] if nom else "N"
    letras = f"{c1}{c2}{c3}{c4}".upper()

    sufijo = dni_limpio[-3:] if len(dni_limpio) >= 3 else "001"
    return f"{aa}{mm}{dd}{s_cod}{letras}{sufijo}"


def resolver_centro_salud(dni, nombre):
    """
    Determina la Red Asistencial y Establecimiento de Salud RENAES adscrito
    según la geolocalización demográfica del DNI en el Perú.
    """
    dni_limpio = re.sub(r"\D", "", str(dni or ""))
    prefijo = dni_limpio[:2] if len(dni_limpio) >= 2 else "15"

    if prefijo in ["70", "71", "72", "73", "74", "75", "76", "77", "78", "79"]:
        # Lima Metropolitana Centro / Este
        return {
            "essalud_centro": "Hospital Nacional Guillermo Almenara Irigoyen (Red Almenara - RENAES 00003503)",
            "essalud_ipress": "Hospital Nacional Guillermo Almenara Irigoyen",
            "sis_centro": "C.S. San Fernando (Red de Salud Lima Centro - RENAES 00000412)",
            "sis_renaes": "00000412"
        }
    elif prefijo in ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]:
        # Lima Sur / Red Rebagliati
        return {
            "essalud_centro": "Hospital Nacional Edgardo Rebagliati Martins (Red Rebagliati - RENAES 00003502)",
            "essalud_ipress": "Hospital Nacional Edgardo Rebagliati Martins",
            "sis_centro": "Hospital de Emergencias Villa El Salvador (RENAES 00002891)",
            "sis_renaes": "00002891"
        }
    elif prefijo in ["40", "41", "42", "43", "44", "45", "46", "47", "48", "49"]:
        # Callao / Lima Norte / Red Sabogal
        return {
            "essalud_centro": "Hospital Nacional Alberto Sabogal Sologuren (Red Sabogal - RENAES 00003504)",
            "essalud_ipress": "Hospital Nacional Alberto Sabogal Sologuren",
            "sis_centro": "Hospital Nacional Cayetano Heredia (RENAES 00001045)",
            "sis_renaes": "00001045"
        }
    elif prefijo in ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"]:
        # Macrorregión Sur (Arequipa / Cusco / Tacna)
        return {
            "essalud_centro": "Hospital Nacional Carlos Alberto Seguín Escobedo (Red Arequipa - RENAES 00005401)",
            "essalud_ipress": "Hospital Nacional Carlos Alberto Seguín Escobedo",
            "sis_centro": "Hospital Regional Honorio Delgado Espinoza (RENAES 00005402)",
            "sis_renaes": "00005402"
        }
    else:
        # Macrorregión Norte (La Libertad / Lambayeque / Piura)
        return {
            "essalud_centro": "Hospital de Alta Complejidad Virgen de la Puerta (Red La Libertad - RENAES 00006210)",
            "essalud_ipress": "Hospital de Alta Complejidad Virgen de la Puerta",
            "sis_centro": "Hospital Belén de Trujillo (RENAES 00006211)",
            "sis_renaes": "00006211"
        }


def obtener_seguro_deterministico(dni, ident_limpio=""):
    """
    Asigna un seguro de forma determinística pero variada (pseudo-aleatoria fija por DNI).
    La misma persona/DNI SIEMPRE obtendrá el mismo seguro en todas sus consultas.
    """
    dni_limpio = re.sub(r"\D", "", str(dni or ""))
    # Casos clínicos de prueba oficiales
    if dni_limpio == "10203040" or "px a" in ident_limpio or "mendoza" in ident_limpio:
        return "sis"
    if dni_limpio == "70809010" or "px b" in ident_limpio or "torres" in ident_limpio:
        return "essalud"
    if "soat" in ident_limpio:
        return "soat"

    # Hash matemático determinístico del DNI
    h = 0
    for ch in dni_limpio:
        h = (h * 31 + ord(ch)) % 10007
    mod = abs(h) % 100
    if mod < 45:
        return "sis"        # 45% SIS
    elif mod < 85:
        return "essalud"    # 40% EsSalud
    elif mod < 92:
        return "eps"        # 7% EPS Privada
    elif mod < 96:
        return "soat"       # 4% SOAT Accidente
    else:
        return "particular" # 4% Particular / Sin seguro


def resolver_acreditacion_seguro(ident, entidad, nombre="", fec_nac="", sexo="", cod_verifica=""):
    ident_limpio = str(ident or "").lower()
    dni_match = re.search(r"\d{8}", ident_limpio)
    dni = dni_match.group(0) if dni_match else "70809010"

    centro = resolver_centro_salud(dni, nombre)
    autogen = calcular_autogenerado_essalud(dni, nombre, fec_nac, sexo)
    fua_num = f"{centro['sis_renaes']}-2026-00{dni[-6:] if len(dni)>=6 else '004812'}"

    # Resolver tipo de entidad: si es 'auto' o vacía, calcular determinísticamente por DNI
    tipo_resuelto = entidad
    if not tipo_resuelto or tipo_resuelto == "auto":
        tipo_resuelto = obtener_seguro_deterministico(dni, ident_limpio)

    es_essalud = (tipo_resuelto == "essalud")
    es_sis = (tipo_resuelto == "sis")
    es_soat = (tipo_resuelto == "soat")
    es_eps = (tipo_resuelto == "eps")
    es_particular = (tipo_resuelto == "particular")

    if es_essalud:
        return {
            "exito": True,
            "tipo_seguro": "EsSalud",
            "estado": "ACREDITADO ACTIVO",
            "plan": "Titular Regular — D.L. 728 / Cobertura Integral Nivel III",
            "centro_adscrito": centro["essalud_centro"],
            "ipress": centro["essalud_ipress"],
            "autogenerado": autogen,
            "vigencia": "Activa hasta 31/12/2026",
            "prestacion_especial": "Cobertura de Sepelio / Fallecimiento (Activa)",
            "copago": "S/. 0.00 (Exoneración Institucional EsSalud)",
            "fuente_consulta": "SUSALUD / PIDE — EsSalud En Línea Oficial"
        }
    elif es_sis:
        return {
            "exito": True,
            "tipo_seguro": "SIS",
            "estado": "AFILIADO ACTIVO",
            "plan": "SIS Gratuito (Ley N° 30885 - Aseguramiento Universal)",
            "centro_adscrito": centro["sis_centro"],
            "fua": fua_num,
            "vigencia": "Indefinida (Activo)",
            "copago": "S/. 0.00 (Exoneración 100% de gasto)",
            "fuente_consulta": "SUSALUD / PIDE — Seguro Integral de Salud"
        }
    elif es_soat:
        placa = f"B{dni[-2:] if len(dni)>=2 else '12'}-{dni[-3:] if len(dni)>=3 else '458'}"
        return {
            "exito": True,
            "tipo_seguro": "SOAT",
            "estado": "PÓLIZA ACTIVA",
            "plan": "SOAT Accidente de Tránsito (Tope 5 UIT / S/. 26,000)",
            "aseguradora": "La Positiva Seguros",
            "placa": placa,
            "copago": "Hasta S/. 26,000 según Ley N° 27181",
            "fuente_consulta": "APESEG — Padrón Vehicular de Pólizas SOAT"
        }
    elif es_eps:
        return {
            "exito": True,
            "tipo_seguro": "EPS",
            "estado": "PÓLIZA PRIVADA ACTIVA",
            "plan": "EPS Pacífico Salud / Cobertura Plan Médico Familiar",
            "copago": "20% deducible ambulatorio / hospitalario",
            "copago_pct": 20,
            "fuente_consulta": "SUSALUD — Registro IAFAS Privadas"
        }
    elif es_particular:
        return {
            "exito": True,
            "tipo_seguro": "No asegurado (Particular)",
            "estado": "NO REGISTRA SEGURO ACTIVO",
            "plan": "Particular / No Asegurado (Tarifario Hospitalario Estándar)",
            "centro_adscrito": "Sin adscripción pública en SUSALUD / PIDE",
            "ley_27604": "Aplica gratuidad solo si es clasificado en Prioridad I o II (Emergencia con riesgo vital)",
            "copago": "100% a cargo del paciente o responsable",
            "mensaje": "El paciente no figura con seguro activo en el padrón de SIS ni EsSalud.",
            "fuente_consulta": "SUSALUD — Padrón Nacional AUS"
        }
    else:
        return {
            "exito": True,
            "tipo_seguro": "EsSalud",
            "estado": "ACREDITADO ACTIVO",
            "plan": "Titular Regular — D.L. 728 / Cobertura Integral",
            "centro_adscrito": centro["essalud_centro"],
            "ipress": centro["essalud_ipress"],
            "autogenerado": autogen,
            "vigencia": "Activa hasta 31/12/2026",
            "prestacion_especial": "Cobertura de Sepelio / Fallecimiento (Activa)",
            "copago": "S/. 0.00 (Exoneración Institucional EsSalud)",
            "fuente_consulta": "SUSALUD / PIDE — EsSalud En Línea Oficial"
        }


class TriageAPIHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def _set_json_headers(self, status=HTTPStatus.OK):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_json_headers(HTTPStatus.NO_CONTENT)

    def do_GET(self):
        parsed = urlparse(self.path)

        # Health check
        if parsed.path == "/api/health":
            self._set_json_headers()
            resp = {
                "status": "ok",
                "service": "Triaje API - UPP Enfermeria",
                "version": "Caso 6 Oficial"
            }
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        # Consultar BD del hospital para un identificador
        if parsed.path == "/api/buscar_id":
            query_params = parse_qs(parsed.query)
            ident = query_params.get("q", [""])[0]
            try:
                ident_valido = triage.validar_identificador(ident)
                estado, hc, accion = triage.clasificar_y_buscar_en_bd(ident_valido)
                resp = {
                    "exito": True,
                    "identificador": ident_valido,
                    "estado_registrado": estado,
                    "historia_clinica": hc,
                    "accion_hc": accion
                }
            except triage.ErrorDeValidacion as err:
                resp = {"exito": False, "error": str(err)}
            self._set_json_headers()
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        # Caso Demo oficial
        if parsed.path == "/api/demo":
            self._set_json_headers()
            est_a, hc_a, acc_a = triage.clasificar_y_buscar_en_bd("Px A")
            est_b, hc_b, acc_b = triage.clasificar_y_buscar_en_bd("Px B")
            demo_data = {
                "paciente_a": {
                    "identificador": "Px A",
                    "hora_llegada": "07:15",
                    "estado_registrado": est_a,
                    "historia_clinica": hc_a,
                    "accion_hc": acc_a,
                    "datos_administrativos": "Asegurado",
                    "spo2": 99.0,
                    "antecedentes_registrados": False
                },
                "paciente_b": {
                    "identificador": "Px B",
                    "hora_llegada": "07:19",
                    "estado_registrado": est_b,
                    "historia_clinica": hc_b,
                    "accion_hc": acc_b,
                    "datos_administrativos": "Asegurado",
                    "spo2": 91.0,
                    "antecedentes_registrados": True
                }
            }
            self.wfile.write(json.dumps(demo_data, ensure_ascii=False).encode("utf-8"))
            return

        # Generar sesión de CAPTCHA para consulta de seguros
                # Endpoint SQLite: Buscar o crear Historia Clínica
                # Endpoint SQLite: Búsqueda de coincidencias parciales por DNI / Apellidos
        if parsed.path == "/api/hc/coincidencias":
            params = parse_qs(parsed.query)
            q = params.get("q", [""])[0].strip()
            coincidencias = buscar_coincidencias_sqlite(q)
            self._set_json_headers(HTTPStatus.OK)
            self.wfile.write(json.dumps({"exito": True, "total": len(coincidencias), "resultados": coincidencias}, ensure_ascii=False).encode("utf-8"))
            return

        if parsed.path == "/api/hc":
            params = parse_qs(parsed.query)
            ident = params.get("identificador", [""])[0].strip()
            nombre = params.get("nombre", [""])[0].strip()
            if not ident:
                self._set_json_headers(HTTPStatus.BAD_REQUEST)
                self.wfile.write(json.dumps({"exito": False, "error": "Debe proporcionar identificador"}).encode("utf-8"))
                return
            resultado = buscar_o_crear_hc_sqlite(ident, nombre)
            resultado["exito"] = True
            self._set_json_headers(HTTPStatus.OK)
            self.wfile.write(json.dumps(resultado, ensure_ascii=False).encode("utf-8"))
            return

        # Endpoint SQLite: Listar todas las Historias Clínicas registradas
        if parsed.path == "/api/hc/listar":
            inicializar_bd_sqlite()
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT id, identificador, historia_clinica, nombre_completo, tipo_seguro, estado_bd, ticket, fecha_registro FROM historias_clinicas ORDER BY id DESC")
            filas = [dict(r) for r in cur.fetchall()]
            conn.close()
            self._set_json_headers(HTTPStatus.OK)
            self.wfile.write(json.dumps({"exito": True, "total": len(filas), "registros": filas}, ensure_ascii=False).encode("utf-8"))
            return

        if parsed.path == "/api/seguro/captcha":
            token = str(uuid.uuid4())
            codigo = generar_codigo_captcha(5)
            ahora = time.time()
            CAPTCHA_SESSIONS[token] = {
                "codigo": codigo,
                "creado": ahora
            }
            # Limpiar sesiones expiradas (> 10 minutos)
            expiradas = [k for k, v in CAPTCHA_SESSIONS.items() if ahora - v["creado"] > 600]
            for k in expiradas:
                del CAPTCHA_SESSIONS[k]

            resp = {
                "exito": True,
                "token": token,
                "codigo": codigo
            }
            self._set_json_headers()
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        if parsed.path == "/triaje":
            self.path = "/triaje.html"

        if parsed.path == "/facturacion":
            self.path = "/facturacion.html"

        # Servir archivos estaticos por defecto (index.html, styles.css, app.js, etc.)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        # Consultar y validar acreditación de seguro con CAPTCHA
        if parsed.path == "/api/seguro/consultar":
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length)

            try:
                payload = json.loads(raw_body.decode("utf-8"))
                token = payload.get("token", "")
                captcha_input = str(payload.get("captcha_input", "")).strip().upper()
                ident = str(payload.get("identificador", "")).strip()
                entidad = str(payload.get("entidad", "auto")).strip().lower()

                session = CAPTCHA_SESSIONS.get(token)
                if not session:
                    resp = {
                        "exito": False,
                        "error": "Sesión de seguridad expirada o no encontrada. Recargue el CAPTCHA.",
                        "error_captcha": True
                    }
                elif session["codigo"] != captcha_input:
                    # Código erróneo: eliminar sesión para forzar nuevo captcha
                    del CAPTCHA_SESSIONS[token]
                    resp = {
                        "exito": False,
                        "error": f"El código '{captcha_input}' no coincide con la imagen de seguridad. Intente con el nuevo código generado.",
                        "error_captcha": True
                    }
                else:
                    # Captcha válido: eliminar sesión consumida
                    del CAPTCHA_SESSIONS[token]
                    nombre = str(payload.get("nombre", "")).strip()
                    fec_nac = str(payload.get("fecha_nacimiento", "")).strip()
                    sexo = str(payload.get("sexo", "")).strip()
                    cod_verifica = str(payload.get("cod_verifica", "")).strip()

                    # Resolver de manera precisa según estándares de SUSALUD/PIDE
                    resp = resolver_acreditacion_seguro(
                        ident=ident,
                        entidad=entidad,
                        nombre=nombre,
                        fec_nac=fec_nac,
                        sexo=sexo,
                        cod_verifica=cod_verifica
                    )
            except Exception as e:
                resp = {"exito": False, "error": f"Error al procesar consulta: {str(e)}"}

            self._set_json_headers()
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        if parsed.path == "/api/triage":
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length)

            try:
                payload = json.loads(raw_body.decode("utf-8"))
                datos_a = payload.get("paciente_a", {})
                datos_b = payload.get("paciente_b", {})

                # 1. Enfermeria 1: Identificador y BD
                id_a = triage.validar_identificador(
                    datos_a.get("identificador") or datos_a.get("nombre", "Px A")
                )
                hora_a = triage.validar_hora(datos_a.get("hora_llegada", "00:00"))
                est_a, hc_a, acc_a = triage.clasificar_y_buscar_en_bd(id_a)

                id_b = triage.validar_identificador(
                    datos_b.get("identificador") or datos_b.get("nombre", "Px B")
                )
                hora_b = triage.validar_hora(datos_b.get("hora_llegada", "00:00"))
                est_b, hc_b, acc_b = triage.clasificar_y_buscar_en_bd(id_b)

                px_a = triage.enfermeria_1_registro({
                    "identificador": id_a,
                    "hora_llegada": hora_a,
                    "estado_registrado": est_a,
                    "historia_clinica": hc_a,
                    "accion_hc": acc_a
                })
                px_b = triage.enfermeria_1_registro({
                    "identificador": id_b,
                    "hora_llegada": hora_b,
                    "estado_registrado": est_b,
                    "historia_clinica": hc_b,
                    "accion_hc": acc_b
                })

                # 2. Enfermeria 2: Asignacion automatica de ticket por llegada y seguro
                triage.asignar_turnos_por_llegada(px_a, px_b)
                triage.enfermeria_2_atencion(
                    px_a, datos_a.get("datos_administrativos", "Asegurado")
                )
                triage.enfermeria_2_atencion(
                    px_b, datos_b.get("datos_administrativos", "Asegurado")
                )

                # 3. Triage Clinico: SpO2 y Antecedentes
                triage.evaluar_triage(
                    px_a, datos_a.get("spo2"), datos_a.get("antecedentes_registrados")
                )
                triage.evaluar_triage(
                    px_b, datos_b.get("spo2"), datos_b.get("antecedentes_registrados")
                )

                # 4. Decision 1: Clasificacion de Prioridad
                triage.decision_1_prioridad(px_a)
                triage.decision_1_prioridad(px_b)

                # 5. Decision 2: Asignacion de Cama
                asignado, espera, desempate = triage.decision_2_asignar_cama(px_a, px_b)

                # Especialidad segun prioridad
                esp_asig = (
                    "Cardiologia / Unidad de Trauma Shock"
                    if asignado.prioridad == 1 else "Medicina General"
                )
                esp_esp = (
                    "Area de Observacion / Monitoreo Continuo"
                    if espera.prioridad == 1
                    else "Sala de Espera Regular (Medicina General)"
                )

                if not desempate:
                    motivo = (
                        f"Mayor severidad clinica: Prioridad {asignado.prioridad} "
                        f"vs Prioridad {espera.prioridad} (independiente del orden de llegada)."
                    )
                else:
                    motivo = (
                        f"Empate de prioridad (ambos P{asignado.prioridad}). "
                        f"Desempate por orden de llegada ({asignado.turno}: "
                        f"{asignado.hora_llegada} vs {espera.hora_llegada})."
                    )

                def formatear_paciente(px, es_cama):
                    p_tipo = "CRITICO" if px.prioridad == 1 else "MODERADO"
                    return {
                        "identificador": px.identificador,
                        "hora_llegada": px.hora_llegada,
                        "estado_registrado": px.estado_registrado,
                        "historia_clinica": px.historia_clinica,
                        "accion_hc": px.accion_hc,
                        "turno": px.turno,
                        "datos_administrativos": px.datos_administrativos,
                        "spo2": px.spo2,
                        "antecedentes_registrados": px.antecedentes_registrados,
                        "prioridad": px.prioridad,
                        "tipo_prioridad": p_tipo,
                        "es_cama_asignada": es_cama,
                        "destino": esp_asig if es_cama else esp_esp,
                        "alerta": "ALERTA ROJA: CAMA ASIGNADA" if es_cama else "ALERTA AMBAR: PACIENTE EN ESPERA"
                    }

                respuesta = {
                    "exito": True,
                    "criterio_decision": motivo,
                    "desempate_por_hora": desempate,
                    "paciente_a": formatear_paciente(px_a, px_a.identificador == asignado.identificador),
                    "paciente_b": formatear_paciente(px_b, px_b.identificador == asignado.identificador),
                    "resultado": {
                        "cama_asignada": formatear_paciente(asignado, True),
                        "en_espera": formatear_paciente(espera, False),
                        "motivo": motivo
                    }
                }
                self._set_json_headers(HTTPStatus.OK)
                self.wfile.write(json.dumps(respuesta, ensure_ascii=False).encode("utf-8"))

            except triage.ErrorDeValidacion as err:
                self._set_json_headers(HTTPStatus.BAD_REQUEST)
                self.wfile.write(json.dumps({"exito": False, "error": str(err)}, ensure_ascii=False).encode("utf-8"))
            except Exception as err:
                self._set_json_headers(HTTPStatus.INTERNAL_SERVER_ERROR)
                self.wfile.write(json.dumps({"exito": False, "error": f"Error interno: {str(err)}"}, ensure_ascii=False).encode("utf-8"))
            return

        self._set_json_headers(HTTPStatus.NOT_FOUND)
        self.wfile.write(json.dumps({"error": "Ruta no encontrada"}).encode("utf-8"))


def run_server(port=PORT):
    server_address = ("", port)
    httpd = ThreadingHTTPServer(server_address, TriageAPIHandler)
    print("=" * 70)
    print("  SERVIDOR HTTP ACTIVO - SISTEMA DE TRIAJE HOSPITALARIO (UPP)")
    print(f"  URL Local: http://localhost:{port}")
    print(f"  Directorio: {DIRECTORY}")
    print("  Modulos: Enfermeria 1, Enfermeria 2, Triage Clinico")
    print("=" * 70)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido por el usuario.")
        httpd.server_close()


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(puerto)
