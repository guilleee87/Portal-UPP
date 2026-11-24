with open('triaje_full.html', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('.active-patients-cards-wrapper')
print(text[idx-50:idx+1500])
