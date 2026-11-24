with open('app_full.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('claveObstetrica')
while idx != -1:
    print(text[idx-50:idx+150])
    print('---')
    idx = text.find('claveObstetrica', idx+1)
