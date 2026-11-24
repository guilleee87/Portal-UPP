with open('triaje_full.html', 'r', encoding='utf-8') as f:
    text = f.read()

import re
for m in re.finditer(r'\.active-patients-cards-wrapper|\.patient-queue-card', text):
    start = max(0, m.start()-20)
    print(text[start:start+180])
    print('---')
