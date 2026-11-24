with open('triaje_full.html', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = list(re.finditer(r'tablero.*cola|cola.*tablero|active-patients|track-board|tablero_cola', text, re.IGNORECASE))
print("HTML matches:", len(matches))
for m in matches[:10]:
    start = max(0, m.start()-40)
    print(ascii(text[start:start+120]))
    print('---')
