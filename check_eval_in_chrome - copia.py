# check_eval_in_chrome.py
import subprocess
import time
import json
import urllib.request
import websocket
import sys

sys.stdout.reconfigure(encoding='utf-8')

port = 9226
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
            const res = window.evaluarTriajeEstandar({
                fr: null, spo2: null, pas: null, pad: null, fc: null, glasgow: null, temp: null, glucosa: null, eva: null,
                claveObstetrica: "ninguna"
            });
            return JSON.stringify(res);
        })()
        """,
        "returnByValue": True
    })
    print("evaluarTriajeEstandar result:", res["result"]["result"]["value"])

finally:
    ws.close()
    proc.terminate()
