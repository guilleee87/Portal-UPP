with open('triaje_full.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(195, 235):
    print(f"{i+1}: {ascii(lines[i].strip())}")
