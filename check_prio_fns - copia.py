with open('app_full.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
print(re.findall(r'function\s+([a-zA-Z0-9_]*prioridad[a-zA-Z0-9_]*)', text, re.IGNORECASE))
