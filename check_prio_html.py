with open('triaje_full.html', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = list(re.finditer(r'prioridad.*1|prioridad.*i\b', text, re.IGNORECASE))
print("Matches:", len(matches))
for m in matches[:10]:
    start = max(0, m.start()-40)
    print(repr(text[start:start+120]))
    print('---')
