# test_espera_cdp.py
import subprocess
import time
import json
import urllib.request
import websocket
import sys

sys.stdout.reconfigure(encoding='utf-8')

port = 9224
chrome_bin = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
proc = subprocess.Popen([
    chrome_bin,
    f"--remote-debugging-port={port}",
    "--headless=new",
    "--remote-allow-origins=*",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "http://localhost:8000/triaje.html"
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

time.sleep(2)

try:
    req = urllib.request.urlopen(f"http://localhost:{port}/json")
    targets = json.loads(req.read().decode())
    target = None
    for t in targets:
        if t.get("type") == "page":
            target = t
            break

    ws_url = target["webSocketDebuggerUrl"]
    ws = websocket.create_connection(ws_url)

    msg_id = 0
    def send_cmd(method, params=None):
        global msg_id
        msg_id += 1
        payload = {"id": msg_id, "method": method, "params": params or {}}
        ws.send(json.dumps(payload))
        while True:
            resp = json.loads(ws.recv())
            if resp.get("id") == msg_id:
                return resp

    time.sleep(1)

    res = send_cmd("Runtime.evaluate", {
        "expression": """
        (() => {
            window.registrarPacienteEnEspera();
            const px = window.PACIENTES_COLA.find(x => x.id === window.pacienteActivoId);
            const prioDisplay = document.getElementById("prioridad_display");
            const chipLive = document.getElementById("chipPrioLive");
            const pillPrio = document.getElementById("cockpit_pill_prioridad");
            const triBadge = document.getElementById("c_triage_prio_badge");
            return JSON.stringify({
                pxPrioridad: px ? px.prioridad : null,
                statePrioridad: window.STATE.prioridad,
                prioDisplayVisible: prioDisplay ? prioDisplay.style.display : null,
                prioDisplayText: prioDisplay ? prioDisplay.innerText : null,
                chipLiveText: chipLive ? chipLive.innerText : null,
                pillPrioText: pillPrio ? pillPrio.innerText : null,
                triBadgeText: triBadge ? triBadge.innerText : null,
                glasgowVal: document.getElementById("glasgow_full")?.value,
                motivoVal: document.getElementById("motivo_full")?.value,
                claveObsVal: document.getElementById("clave_obstetrica_sel")?.value,
                motivoMtsVal: document.getElementById("motivo_mts_select")?.value,
                camaId: px ? px.camaId : null
            });
        })()
        """,
        "returnByValue": True
    })
    data = json.loads(res["result"]["result"]["value"])
    print("Test Espera result:", data)

finally:
    ws.close()
    proc.terminate()
