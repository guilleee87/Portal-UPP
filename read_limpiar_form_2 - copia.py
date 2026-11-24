import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('app_full.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function limpiarFormularioCompletoState')
print(text[idx+2000:idx+3500])
