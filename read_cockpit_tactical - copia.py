with open('redesign_cockpit.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(104, 125):
    print(f"{i+1}: {ascii(lines[i].strip())}")
