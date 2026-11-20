import subprocess, json, time, urllib.request, sys, os
import urllib.parse
sys.stdout.reconfigure(encoding='utf-8')

chrome_paths = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Users\User\AppData\Local\Google\Chrome\Application\chrome.exe"
]

chrome_exe = None
for p in chrome_paths:
    if os.path.exists(p):
        chrome_exe = p
        break

if not chrome_exe:
    print("Chrome no encontrado")
    sys.exit(1)

port = 9228
user_data_dir = os.path.join(os.environ.get("TEMP", "C:\\temp"), f"chrome_dev_prof_{port}")
chrome_proc = subprocess.Popen([
    chrome_exe,
    f"--remote-debugging-port={port}",
    f"--user-data-dir={user_data_dir}",
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--remote-allow-origins=*"
])

time.sleep(2)

def cdp_eval(ws_url, expr):
    import urllib.request
    try:
        import websocket
    except ImportError:
        pass
    import socket
    # Usar websocket simple para CDP
    from urllib.request import urlopen
    import json

# Conectar via websocket client
import websocket

# Obtener ws url
targets_raw = urllib.request.urlopen(f"http://127.0.0.1:{port}/json").read()
targets = json.loads(targets_raw)
ws_url = targets[0]["webSocketDebuggerUrl"]

ws = websocket.create_connection(ws_url)

msg_id = 0
def send_cmd(method, params=None):
    global msg_id
    msg_id += 1
    req = {"id": msg_id, "method": method, "params": params or {}}
    ws.send(json.dumps(req))
    while True:
        resp = json.loads(ws.recv())
        if resp.get("id") == msg_id:
            return resp

# 1. Navegar a triaje_full.html en localhost:8000
send_cmd("Page.navigate", {"url": "http://127.0.0.1:8000/triaje_full.html"})
time.sleep(2)

# Silenciar alerts en CDP
send_cmd("Runtime.evaluate", {"expression": "window.alert = function(){}; window.confirm = function(){ return true; };"})

# 2. Test 1: Comprobar existencia del nuevo botón de desempate
resp1 = send_cmd("Runtime.evaluate", {
    "expression": "document.querySelector('.btn-desempate-action') !== null",
    "returnByValue": True
})
btn_exists = resp1.get("result", {}).get("result", {}).get("value")
print(f"Test 1 - Botón Desempate existe en el DOM: {btn_exists}")

# 3. Test 2: Caso Único - Activar Pánico Shock Trauma
resp2 = send_cmd("Runtime.evaluate", {
    "expression": """
    activarPanicoShockTrauma();
    ({
      totalCola: PACIENTES_COLA.length,
      esLlegadaSimultanea: esLlegadaSimultanea,
      camaAsignada: STATE.camaAsignada,
      badgeText: document.getElementById('lbl_total_px_activos').textContent.trim()
    })
    """,
    "returnByValue": True
})
r2 = resp2.get("result", {}).get("result", {}).get("value")
print(f"Test 2 - Caso Único Shock Trauma: {r2}")
assert r2["totalCola"] == 1, "Debe haber exactamente 1 paciente en la cola"
assert r2["esLlegadaSimultanea"] == False, "esLlegadaSimultanea debe ser False"

# 4. Test 3: Abrir modal de desempate y verificar parámetros de camas
resp3 = send_cmd("Runtime.evaluate", {
    "expression": """
    abrirModalLlegadasSimultaneasDesempate();
    const modal = document.getElementById('modalLlegadasSimultaneasDesempate');
    const resumen = obtenerResumenCamasDisponibles();
    ({
      modalVisible: modal.classList.contains('open'),
      totalCamas: resumen.totalCamas,
      camasLibres: resumen.totalLibres,
      cantGenerada: PACIENTES_DESEMPATE_TEMP.length
    })
    """,
    "returnByValue": True
})
r3 = resp3.get("result", {}).get("result", {}).get("value")
print(f"Test 3 - Modal de Desempate y Parámetros de Camas: {r3}")
assert r3["modalVisible"] == True, "El modal de desempate debe abrirse"
assert r3["totalCamas"] == 15, "El total de camas debe ser 15"
assert r3["cantGenerada"] >= 2, "Deben haberse generado los casos simultáneos"

# 5. Test 4: Asignar todas a cama automáticamente por criterio ABCDE
resp4 = send_cmd("Runtime.evaluate", {
    "expression": """
    asignarTodosACamaDesempate();
    PACIENTES_DESEMPATE_TEMP.map(p => ({
      nombre: p.nombre,
      prioridad: p.prioridad,
      score: p.scorePrelacion,
      camaAsignada: p.camaAsignadaNombre
    }))
    """,
    "returnByValue": True
})
r4 = resp4.get("result", {}).get("result", {}).get("value")
print(f"Test 4 - Asignación Automática ABCDE: {len(r4)} pacientes con camas:")
for p in r4:
    print(f"   · {p['nombre']}: {p['prioridad']} (Score {p['score']} pts) -> {p['camaAsignada']}")

# 6. Test 5: Confirmar llegada simultánea al tablero y verificar que muestra más de un registro en el flujo
resp5 = send_cmd("Runtime.evaluate", {
    "expression": """
    confirmarLlegadaSimultaneaAlTablero();
    const cards = document.querySelectorAll('.patient-queue-card');
    ({
      totalCola: PACIENTES_COLA.length,
      cardsRendered: cards.length,
      esLlegadaSimultanea: esLlegadaSimultanea,
      badgeText: document.getElementById('lbl_total_px_activos').textContent.trim()
    })
    """,
    "returnByValue": True
})
r5 = resp5.get("result", {}).get("result", {}).get("value")
print(f"Test 5 - Llegada Simultánea Confirmada en el Tablero: {r5}")
assert r5["totalCola"] > 1, "Debe haber más de 1 paciente en la cola"
assert r5["cardsRendered"] > 1, "Deben renderizarse múltiples tarjetas en el carrusel"
assert r5["esLlegadaSimultanea"] == True, "esLlegadaSimultanea debe ser True"

# 7. Test 6: Volver a un caso único (ej. Admitir NN) y verificar que vuelve a 1 solo registro
resp6 = send_cmd("Runtime.evaluate", {
    "expression": """
    (() => {
      ejecutarAdmisionRapidaNN();
      const cards = document.querySelectorAll('.patient-queue-card');
      return {
        totalCola: PACIENTES_COLA.length,
        cardsRendered: cards.length,
        esLlegadaSimultanea: esLlegadaSimultanea,
        nombreActivo: STATE.nombreReniec,
        badgeText: document.getElementById('lbl_total_px_activos').textContent.trim()
      };
    })()
    """,
    "returnByValue": True
})
r6 = resp6.get("result", {}).get("result", {}).get("value")
print(f"Test 6 - Regreso a Caso Único (NN): {r6}")
assert r6["totalCola"] == 1, "Debe volver a 1 solo paciente"
assert r6["cardsRendered"] == 1, "Debe haber 1 sola tarjeta"
assert r6["esLlegadaSimultanea"] == False, "esLlegadaSimultanea debe ser False"

ws.close()
chrome_proc.terminate()
print("\nTODOS LOS TESTS E2E EN NAVEGADOR PASARON AL 100% CON ÉXITO")
