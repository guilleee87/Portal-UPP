import sys, random
sys.stdout.reconfigure(encoding='utf-8')

# Re-load the same logic from test_fuzzing.py for analysis
random.seed(42)

conteo = {"I": 0, "II": 0, "III": 0, "IV": 0, "V": 0}
tipos_escenario = {
    "panicoShockTrauma": 0,
    "codigoInfarto": 0,
    "codigoIctus": 0,
    "codigoSepsis": 0,
    "esGestante": 0,
    "claveRoja": 0,
    "claveAzul": 0,
    "claveAmarilla": 0,
    "esPediatrico": 0,
    "glucosaHipo": 0,     # glucosa < 54
    "glucosaHiper": 0,    # glucosa > 400
    "glucosaModerada": 0, # 180-400
    "glucosaNormal": 0,   # 70-179
    "glucosaNull": 0,
    "spo2Critico": 0,     # <90
    "spo2Leve": 0,        # 90-95
    "spo2Normal": 0,      # >=96
    "evaAlto": 0,         # >=8
    "evaModerado": 0,     # 4-7
    "evaLeve": 0,         # 1-3
    "evaCero": 0,         # 0 or null
    "todoNull": 0,
    "adultoMayor": 0,     # >= 65
    "nino": 0,            # <= 12
    "adultoJoven": 0,     # 13-64
}

def calcular_news2(fr, spo2, pas, fc, glasgow, temp, es_pediatrico=False, edad=30):
    total = 0; max_param = 0
    if fr is not None:
        p = 3 if fr<=8 or fr>=25 else (2 if fr>=21 else (1 if fr<=11 else 0))
        total += p; max_param = max(max_param, p)
    if spo2 is not None:
        p = 3 if spo2<=91 else (2 if spo2<=93 else (1 if spo2<=95 else 0))
        total += p; max_param = max(max_param, p)
    if pas is not None:
        if es_pediatrico:
            lim = 70+2*max(1,edad)
            p = 3 if pas<lim or pas>=135 else (2 if pas<90 else (1 if pas<100 else 0))
        else:
            p = 3 if pas<=90 or pas>=220 else (2 if pas<=100 else (1 if pas<=110 else 0))
        total += p; max_param = max(max_param, p)
    if fc is not None:
        p = 3 if fc<=40 or fc>=131 else (2 if fc>=111 else (1 if fc<=50 or fc>=91 else 0))
        total += p; max_param = max(max_param, p)
    if glasgow is not None:
        p = 0 if glasgow==15 else 3
        total += p; max_param = max(max_param, p)
    if temp is not None:
        p = 3 if temp<=35.0 else (2 if temp>=39.1 else (1 if temp<=36.0 or temp>=38.1 else 0))
        total += p; max_param = max(max_param, p)
    return {"scoreTotal": total, "maxParametroUnico": max_param}

def evaluar(d):
    n = calcular_news2(d.get("fr"), d.get("spo2"), d.get("pas"), d.get("fc"), d.get("glasgow"), d.get("temp"), d.get("esPediatrico", False), d.get("edad", 30))
    fc = d.get("fc"); pas = d.get("pas"); pad = d.get("pad"); fr = d.get("fr")
    spo2 = d.get("spo2"); glasgow = d.get("glasgow"); glucosa = d.get("glucosa"); eva = d.get("eva")
    shock = (fc/pas) if fc and pas and pas>0 else None

    if (d.get("panicoShockTrauma") or n["scoreTotal"]>=7 or (glasgow and glasgow<=8) or
        (spo2 and spo2<90) or (pas and pas<90) or (shock and shock>=1.3) or
        (glucosa and glucosa<54) or (glucosa and glucosa>600) or
        (glucosa and glucosa>250 and ((glasgow and glasgow<=13) or (fr and fr>=24) or (pas and pas<90) or n["scoreTotal"]>=5)) or
        d.get("claveObstetrica") in ["roja","azul"] or
        (d.get("esGestante") and ((pas and pas>=160) or (pad and pad>=110))) or
        (d.get("codigoInfarto") or d.get("codigoIctus") or d.get("codigoSepsis")) and
        (n["scoreTotal"]>=5 or (pas and pas<95) or (spo2 and spo2<92) or (glasgow and glasgow<=13))):
        return "I"

    glucosa_normal = (glucosa is None) or (70<=glucosa<180)
    eva_cero = (eva is None or eva==0)
    sin_cod = not (d.get("codigoInfarto") or d.get("codigoIctus") or d.get("codigoSepsis") or d.get("claveObstetrica") in ["roja","azul","amarilla"] or d.get("panicoShockTrauma"))
    fisiologico_ok = (n["scoreTotal"]==0 and glucosa_normal and eva_cero and sin_cod)

    if not fisiologico_ok:
        if (5<=n["scoreTotal"]<=6 or n["maxParametroUnico"]==3 or
            (glucosa and (glucosa>400 or 54<=glucosa<=69)) or
            (pas and pas>=180) or (pad and pad>=120) or
            (eva and eva>=8) or d.get("codigoInfarto") or d.get("codigoIctus") or d.get("codigoSepsis") or
            d.get("claveObstetrica")=="amarilla"):
            return "II"

    if (n["scoreTotal"]>=2 or (eva and 4<=eva<=7) or (glucosa and 250<=glucosa<=400) or
        (pas and 140<=pas<=179) or (pad and 90<=pad<=119) or (pas and pas>=180) or (pad and pad>=120)):
        return "III"
    if (n["scoreTotal"]==1 or (eva and 1<=eva<=3) or (glucosa and 180<=glucosa<250)):
        return "IV"
    return "V"

for i in range(500):
    d = {
        "fr": random.choice([None, random.randint(6, 45)]),
        "spo2": random.choice([None, random.randint(80, 100)]),
        "pas": random.choice([None, random.randint(60, 240)]),
        "pad": random.choice([None, random.randint(35, 130)]),
        "fc": random.choice([None, random.randint(30, 180)]),
        "glasgow": random.choice([None, random.randint(3, 15)]),
        "temp": random.choice([None, round(random.uniform(34.0, 41.0), 1)]),
        "glucosa": random.choice([None, random.randint(30, 700)]),
        "eva": random.choice([None, random.randint(0, 10)]),
        "esPediatrico": random.choice([False, True]),
        "edad": random.randint(1, 85),
        "codigoInfarto": random.random() < 0.1,
        "codigoIctus": random.random() < 0.1,
        "codigoSepsis": random.random() < 0.1,
        "esGestante": random.random() < 0.1,
        "claveObstetrica": random.choice([None, "ninguna", "roja", "azul", "amarilla"]),
        "panicoShockTrauma": random.random() < 0.05
    }
    prio = evaluar(d)
    conteo[prio] += 1

    if d.get("panicoShockTrauma"): tipos_escenario["panicoShockTrauma"]+=1
    if d.get("codigoInfarto"): tipos_escenario["codigoInfarto"]+=1
    if d.get("codigoIctus"): tipos_escenario["codigoIctus"]+=1
    if d.get("codigoSepsis"): tipos_escenario["codigoSepsis"]+=1
    if d.get("esGestante"): tipos_escenario["esGestante"]+=1
    if d.get("claveObstetrica")=="roja": tipos_escenario["claveRoja"]+=1
    if d.get("claveObstetrica")=="azul": tipos_escenario["claveAzul"]+=1
    if d.get("claveObstetrica")=="amarilla": tipos_escenario["claveAmarilla"]+=1
    if d.get("esPediatrico"): tipos_escenario["esPediatrico"]+=1
    g = d.get("glucosa")
    if g is None: tipos_escenario["glucosaNull"]+=1
    elif g<54: tipos_escenario["glucosaHipo"]+=1
    elif g>400: tipos_escenario["glucosaHiper"]+=1
    elif 180<=g<=400: tipos_escenario["glucosaModerada"]+=1
    else: tipos_escenario["glucosaNormal"]+=1
    s = d.get("spo2")
    if s is not None:
        if s<90: tipos_escenario["spo2Critico"]+=1
        elif s<=95: tipos_escenario["spo2Leve"]+=1
        else: tipos_escenario["spo2Normal"]+=1
    e = d.get("eva")
    if e is None or e==0: tipos_escenario["evaCero"]+=1
    elif e>=8: tipos_escenario["evaAlto"]+=1
    elif e>=4: tipos_escenario["evaModerado"]+=1
    else: tipos_escenario["evaLeve"]+=1
    edad = d.get("edad", 30)
    if edad>=65: tipos_escenario["adultoMayor"]+=1
    elif edad<=12: tipos_escenario["nino"]+=1
    else: tipos_escenario["adultoJoven"]+=1
    if all(d.get(k) is None for k in ["fr","spo2","pas","pad","fc","glasgow","temp","glucosa","eva"]): tipos_escenario["todoNull"]+=1

print("=" * 60)
print("DISTRIBUCIÓN DE PRIORIDADES EN 500 CASOS ALEATORIOS")
print("=" * 60)
for p, n in sorted(conteo.items()):
    barra = "#" * (n // 3)
    print(f"  P-{p}: {n:3d} casos ({n/5:.1f}%)  {barra}")

print()
print("=" * 60)
print("COBERTURA DE ESCENARIOS CLÍNICOS Y NORMATIVOS")
print("=" * 60)
print(f"  Pánico/Shock Trauma (Acceso Rápido)      : {tipos_escenario['panicoShockTrauma']}")
print(f"  Código Infarto (NTS)                      : {tipos_escenario['codigoInfarto']}")
print(f"  Código Ictus (NTS)                        : {tipos_escenario['codigoIctus']}")
print(f"  Código Sepsis (NTS)                       : {tipos_escenario['codigoSepsis']}")
print(f"  Gestante (Ley 27408)                      : {tipos_escenario['esGestante']}")
print(f"  Clave Obstétrica ROJA (Hemorragia)        : {tipos_escenario['claveRoja']}")
print(f"  Clave Obstétrica AZUL (Eclampsia)         : {tipos_escenario['claveAzul']}")
print(f"  Clave Obstétrica AMARILLA (Sepsis Obs.)   : {tipos_escenario['claveAmarilla']}")
print(f"  Pediátrico/PALS (< 14 años)               : {tipos_escenario['esPediatrico']}")
print(f"  Adulto Mayor (>= 65 años, Ley 27408)      : {tipos_escenario['adultoMayor']}")
print(f"  Niño (<= 12 años)                         : {tipos_escenario['nino']}")
print(f"  Adulto Joven (13-64 años)                 : {tipos_escenario['adultoJoven']}")
print(f"  Glucosa Hipoglucemia Severa (<54, ADA)    : {tipos_escenario['glucosaHipo']}")
print(f"  Glucosa Hiperglucemia Crítica (>400, ADA) : {tipos_escenario['glucosaHiper']}")
print(f"  Glucosa Hiperglucemia Moderada (180-400)  : {tipos_escenario['glucosaModerada']}")
print(f"  Glucosa Normal (70-179)                   : {tipos_escenario['glucosaNormal']}")
print(f"  Glucosa Sin Registrar (Null)              : {tipos_escenario['glucosaNull']}")
print(f"  SpO2 Crítico (<90%)                       : {tipos_escenario['spo2Critico']}")
print(f"  SpO2 Límite (90-95%)                      : {tipos_escenario['spo2Leve']}")
print(f"  SpO2 Normal (>=96%)                       : {tipos_escenario['spo2Normal']}")
print(f"  Dolor Severo EVA 8-10 (ESI)               : {tipos_escenario['evaAlto']}")
print(f"  Dolor Moderado EVA 4-7 (ESI)              : {tipos_escenario['evaModerado']}")
print(f"  Dolor Leve EVA 1-3 (ESI)                  : {tipos_escenario['evaLeve']}")
print(f"  Sin Dolor / Sin Registrar EVA 0           : {tipos_escenario['evaCero']}")
print(f"  Todos los campos vacíos (Invariante 4)    : {tipos_escenario['todoNull']}")

min_prio = min(conteo.values())
print()
if min_prio == 0:
    print("ADVERTENCIA: Hay prioridades con 0 casos cubiertos!")
elif min_prio < 20:
    print(f"ADVERTENCIA: La prioridad menos representada tiene solo {min_prio} casos.")
    print("Recomendado: al menos 50 por nivel para cobertura estadistica.")
else:
    print(f"OK: Todas las prioridades tienen al menos {min_prio} casos.")
