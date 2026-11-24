with open('app_full.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(17415, min(len(lines), 17565)):
    print(f"{i+1}: {ascii(lines[i].rstrip())}")
