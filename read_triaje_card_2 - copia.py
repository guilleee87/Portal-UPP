import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('redesign_cockpit.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function actualizarTarjetaResumenTriaje')
print(text[idx+1000:idx+2500])
