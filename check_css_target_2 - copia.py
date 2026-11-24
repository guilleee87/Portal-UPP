with open('triaje_full.html', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('.patient-queue-card {')
print(text[idx:idx+600])
