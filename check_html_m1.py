with open('triaje_full.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(2750, 2850):
    if i < len(lines):
        print(f"{i+1}: {ascii(lines[i].strip())}")
