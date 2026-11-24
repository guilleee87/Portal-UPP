# search_billing.py
with open("app_full.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "actualizarFactura" in line and "function" in line:
        print(f"actualizarFactura at line {i+1}")
    if "concluirAtencion" in line or "concluirAlta" in line or "darDeAlta" in line or "liquidarCuenta" in line:
        if "function" in line:
            print(f"Discharge/settlement func at line {i+1}: {line.strip()[:80]}")
    if "esNN" in line and ("0.00" in line or "monto" in line or "factura" in line or "cobro" in line or "caja" in line or "seguro" in line):
        print(f"NN billing at line {i+1}: {line.strip()[:100]}")
