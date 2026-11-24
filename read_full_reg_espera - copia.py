import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('app_full.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function registrarPacienteEnEspera()')
end_idx = text.find('window.registrarPacienteEnEspera', idx)
print(text[idx:end_idx+60])
