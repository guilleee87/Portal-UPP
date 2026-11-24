with open('app_full.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(3235, 3285):
    if i < len(lines):
        print(f"{i+1}: {ascii(lines[i].rstrip())}")
