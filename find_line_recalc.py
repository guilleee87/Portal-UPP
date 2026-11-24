with open('app_full.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'recalcularPrioridad()' in line:
        print(f"{i+1}: {line.strip()[:100]}")
