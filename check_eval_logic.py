with open('app_full.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function evaluarTriajeEstandar(')
end = text.find('// 26. MOTOR DE ATENCIÓN SIMULTÁNEA', idx)
print("evaluarTriajeEstandar length:", end - idx)

# Let's inspect what happens in evaluarTriajeEstandar when vital signs are null
# and what priority it returns!
with open('eval_code.js', 'w', encoding='utf-8') as out:
    out.write(text[idx:end])
print("Written to eval_code.js")
