with open('triaje_full.html', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('id="prioridad_display"')
print(ascii(text[idx-50:idx+1500]))
