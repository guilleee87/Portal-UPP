with open('redesign_cockpit.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function actualizarBotonAccionPrincipal()')
print(ascii(text[idx:idx+2000]))
