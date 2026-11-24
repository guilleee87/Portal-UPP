import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('triaje_full.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(2635, 2715):
    if i < len(lines):
        print(f"{i+1}: {lines[i].rstrip()}")
