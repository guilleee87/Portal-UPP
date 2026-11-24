with open('app_full.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re

# Where is registrarPacienteEnEspera called or defined?
for m in re.finditer(r'registrarPacienteEnEspera', text):
    start = max(0, m.start()-100)
    print("Match at", m.start(), ":", text[start:start+250])
