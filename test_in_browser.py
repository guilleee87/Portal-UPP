import subprocess, json, time, urllib.request, sys, os
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
    print("Chrome not found on standard paths")
    sys.exit(1)

port = 9226
chrome_proc = subprocess.Popen([
    chrome_exe,
    "--headless",
    f"--remote-debugging-port={port}",
    "--remote-allow-origins=*",
    "--disable-gpu",
    "--no-sandbox",
    "about:blank"
])

time.sleep(2)

import websocket

# Open a new tab navigating to http://localhost:8000/triaje_full.html
new_tab_url = f"http://localhost:{port}/json/new?http://localhost:8000/triaje_full.html"
req = urllib.request.Request(new_tab_url, method='PUT')
tab_info = json.loads(urllib.request.urlopen(req).read().decode())
ws_url = tab_info["webSocketDebuggerUrl"]

time.sleep(1.5)
ws = websocket.create_connection(ws_url)

msg_id = 1
def send_cmd(method, params={}):
    global msg_id
    mid = msg_id
    msg_id += 1
    ws.send(json.dumps({"id": mid, "method": method, "params": params}))
    while True:
        res = json.loads(ws.recv())
        if res.get("id") == mid:
            return res.get("result", {})

def eval_js(expr):
    res = send_cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return res.get("result", {}).get("value")

print("Waiting for page load...")
time.sleep(1)

# 1. Test In-Browser 500 Property-Based Fuzzing Runner
print("\n--- TEST 1: IN-BROWSER 500 PROPERTY-BASED FUZZING RUNNER ---")
fuzz_result = eval_js("ejecutarFuzzingTriaje500()")
print("Fuzzing in browser result:", fuzz_result)
assert fuzz_result.get("ok") == True and fuzz_result.get("total") == 500, "Fuzzing failed in browser!"

# 2. Test Priority I in UI (SpO2 88% hypoxemia)
print("\n--- TEST 2: PRIORITY I (CRITICAL HYPOXEMIA SPO2 88%) ---")
eval_js("""
document.getElementById('spo2_full').value = '88';
document.getElementById('fc_full').value = '110';
document.getElementById('pas_full').value = '115';
document.getElementById('pad_full').value = '70';
document.getElementById('fr_full').value = '24';
document.getElementById('temp_full').value = '36.8';
document.getElementById('glasgow_full').value = '15';
recalcularPrioridad();
""")
prio1_val = eval_js("document.getElementById('prio_numero').textContent")
traza1_html = eval_js("document.getElementById('prio_trazabilidad_estandar').innerHTML")
print("Prio 1 Display Value:", prio1_val)
assert prio1_val == "I", f"Expected I, got {prio1_val}"
assert "COMPUERTA A" in traza1_html, "Compuerta A not found in trace"
assert "SpO2" in traza1_html, "SpO2 not in badges"

# 3. Test Priority II in UI (Severe pain EVA 9)
print("\n--- TEST 3: PRIORITY II (DOLOR SEVERO EVA 9) ---")
eval_js("""
document.getElementById('spo2_full').value = '98';
document.getElementById('fc_full').value = '82';
document.getElementById('pas_full').value = '120';
document.getElementById('pad_full').value = '80';
document.getElementById('fr_full').value = '16';
document.getElementById('temp_full').value = '36.6';
document.getElementById('glasgow_full').value = '15';
document.getElementById('eva_full').value = '9';
recalcularPrioridad();
""")
prio2_val = eval_js("document.getElementById('prio_numero').textContent")
traza2_html = eval_js("document.getElementById('prio_trazabilidad_estandar').innerHTML")
print("Prio 2 Display Value:", prio2_val)
assert prio2_val == "II", f"Expected II, got {prio2_val}"
assert "COMPUERTA B" in traza2_html, "Compuerta B not in trace"

# 4. Test Priority III in UI (Moderate pain EVA 5)
print("\n--- TEST 4: PRIORITY III (DOLOR MODERADO EVA 5) ---")
eval_js("""
document.getElementById('eva_full').value = '5';
recalcularPrioridad();
""")
prio3_val = eval_js("document.getElementById('prio_numero').textContent")
traza3_html = eval_js("document.getElementById('prio_trazabilidad_estandar').innerHTML")
print("Prio 3 Display Value:", prio3_val)
assert prio3_val == "III", f"Expected III, got {prio3_val}"
assert "COMPUERTA C" in traza3_html, "Compuerta C not in trace"

# 5. Test Priority IV in UI (Mild pain EVA 2)
print("\n--- TEST 5: PRIORITY IV (DOLOR LEVE EVA 2) ---")
eval_js("""
document.getElementById('eva_full').value = '2';
recalcularPrioridad();
""")
prio4_val = eval_js("document.getElementById('prio_numero').textContent")
traza4_html = eval_js("document.getElementById('prio_trazabilidad_estandar').innerHTML")
print("Prio 4 Display Value:", prio4_val)
assert prio4_val == "IV", f"Expected IV, got {prio4_val}"
assert "COMPUERTA D1" in traza4_html, "Compuerta D1 not in trace"

# 6. Test Priority V in UI (Completely normal, EVA 0)
print("\n--- TEST 6: PRIORITY V (CONTROL/NO URGENTE EVA 0) ---")
eval_js("""
document.getElementById('eva_full').value = '0';
document.getElementById('glucosa_full').value = '95';
recalcularPrioridad();
""")
prio5_val = eval_js("document.getElementById('prio_numero').textContent")
traza5_html = eval_js("document.getElementById('prio_trazabilidad_estandar').innerHTML")
print("Prio 5 Display Value:", prio5_val)
assert prio5_val == "V", f"Expected V, got {prio5_val}"
assert "COMPUERTA D2" in traza5_html, "Compuerta D2 not in trace"

# 7. Test Invariant 4 in UI (All vitals empty null)
print("\n--- TEST 7: INVARIANT 4 (ALL VITALS EMPTY NULL) ---")
eval_js("""
document.getElementById('spo2_full').value = '';
document.getElementById('fc_full').value = '';
document.getElementById('pas_full').value = '';
document.getElementById('pad_full').value = '';
document.getElementById('fr_full').value = '';
document.getElementById('temp_full').value = '';
document.getElementById('glasgow_full').value = '';
document.getElementById('glucosa_full').value = '';
document.getElementById('eva_full').value = '';
recalcularPrioridad();
""")
prio_empty = eval_js("document.getElementById('prio_numero').textContent")
print("Empty vitals prio:", prio_empty)
assert prio_empty == "V", f"Expected V for empty vitals, got {prio_empty}"

# 8. Test Pediatric NEWS2 / PALS
print("\n--- TEST 8: PEDIATRIC PALS EVALUATION ---")
eval_js("""
STATE.edad = 4;
const pRes = evaluarTriajeEstandar({
  fc: 165,
  fr: 45,
  pas: 85,
  esPediatrico: true,
  edad: 4
});
window.__pRes = pRes;
""")
p_res = eval_js("window.__pRes")
print("Pediatric evaluation result: NEWS2 =", p_res["news2"]["scoreTotal"], "Prio =", p_res["prioridad"])
assert p_res["news2"]["scoreTotal"] > 0, "Pediatric score must evaluate PALS"

print("\n=======================================================")
print(">>> ALL 8 CLINICAL TEST SUITES PASSED WITH 100% SUCCESS <<<")
print("=======================================================")

ws.close()
chrome_proc.terminate()
