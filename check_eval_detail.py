import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('app_full.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function evaluarTriajeEstandar(')
print(text[idx+1000:idx+3500])
