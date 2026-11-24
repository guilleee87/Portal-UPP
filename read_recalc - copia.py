with open('app_full.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function recalcularPrioridad')
print(text[idx:idx+2500])
