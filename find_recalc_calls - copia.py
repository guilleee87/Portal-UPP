with open('app_full.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
for m in re.finditer(r'recalcularPrioridad\s*\(', text):
    start = max(0, m.start()-50)
    print(ascii(text[start:start+120]))
    print('---')
