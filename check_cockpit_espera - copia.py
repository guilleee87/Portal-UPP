with open('redesign_cockpit.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
for m in re.finditer(r'registrarPacienteEnEspera', text):
    start = max(0, m.start()-50)
    print(text[start:start+120])
    print('---')
