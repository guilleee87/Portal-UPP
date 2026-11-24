import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('app_full.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function renderizarTableroColaPacientes()')
print(text[idx+3000:idx+6500])
