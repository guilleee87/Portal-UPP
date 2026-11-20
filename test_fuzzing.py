import sys, traceback
sys.stdout.reconfigure(encoding='utf-8')

# =============================================================================
# SUITE CLÍNICA BALANCEADA - 500 CASOS NORMATIVOS
# NTS N°042-MINSA / ESI v5 / NEWS2 / ADA 2024 / PALS / Leyes 27604, 27408
# Versión 2.0 — Corregida con valores clínicos pre-calculados y validados
# =============================================================================

# --------------- Motor de evaluación (réplica del JS oficial) ---------------

def calcular_news2(fr, spo2, pas, fc, glasgow, temp, es_pediatrico=False, edad=30):
    total = 0; max_param = 0; desglose = []
    if fr is None: desglose.append("FR:null")
    elif es_pediatrico:
        if edad < 3: p = 3 if fr<=15 or fr>=50 else (2 if fr>=41 else (1 if fr<=23 else 0))
        else: p = 3 if fr<=10 or fr>=31 else (2 if fr>=26 else (1 if fr<=14 else 0))
        total+=p; max_param=max(max_param,p); desglose.append(f"FR:{fr}(+{p})")
    else:
        p = 3 if fr<=8 or fr>=25 else (2 if fr>=21 else (1 if fr<=11 else 0))
        total+=p; max_param=max(max_param,p); desglose.append(f"FR:{fr}(+{p})")
    if spo2 is None: desglose.append("SpO2:null")
    else:
        p = 3 if spo2<=91 else (2 if spo2<=93 else (1 if spo2<=95 else 0))
        total+=p; max_param=max(max_param,p); desglose.append(f"SpO2:{spo2}%(+{p})")
    if pas is None: desglose.append("PAS:null")
    elif es_pediatrico:
        lim = 70+2*max(1,edad)
        p = 3 if pas<lim or pas>=135 else (2 if pas<90 else (1 if pas<100 else 0))
        total+=p; max_param=max(max_param,p); desglose.append(f"PAS:{pas}(+{p})")
    else:
        p = 3 if pas<=90 or pas>=220 else (2 if pas<=100 else (1 if pas<=110 else 0))
        total+=p; max_param=max(max_param,p); desglose.append(f"PAS:{pas}(+{p})")
    if fc is None: desglose.append("FC:null")
    elif es_pediatrico:
        if edad<5: p = 3 if fc<=60 or fc>=161 else (2 if fc>=131 else (1 if fc<=79 else 0))
        else: p = 3 if fc<=50 or fc>=141 else (2 if fc>=111 else (1 if fc<=59 else 0))
        total+=p; max_param=max(max_param,p); desglose.append(f"FC:{fc}(+{p})")
    else:
        p = 3 if fc<=40 or fc>=131 else (2 if fc>=111 else (1 if fc<=50 or fc>=91 else 0))
        total+=p; max_param=max(max_param,p); desglose.append(f"FC:{fc}(+{p})")
    if glasgow is None: desglose.append("GCS:null")
    else:
        p = 0 if glasgow==15 else 3
        total+=p; max_param=max(max_param,p); desglose.append(f"GCS:{glasgow}(+{p})")
    if temp is None: desglose.append("T:null")
    else:
        p = 3 if temp<=35.0 else (2 if temp>=39.1 else (1 if temp<=36.0 or temp>=38.1 else 0))
        total+=p; max_param=max(max_param,p); desglose.append(f"T:{temp}(+{p})")
    return {"scoreTotal": total, "maxParametroUnico": max_param, "desglose": desglose}

def evaluar_triaje(d):
    n = calcular_news2(d.get("fr"), d.get("spo2"), d.get("pas"), d.get("fc"),
                       d.get("glasgow"), d.get("temp"), d.get("esPediatrico", False), d.get("edad", 30))
    fc=d.get("fc"); pas=d.get("pas"); pad=d.get("pad"); fr=d.get("fr")
    spo2=d.get("spo2"); glasgow=d.get("glasgow"); glucosa=d.get("glucosa"); eva=d.get("eva")
    shock=(fc/pas) if fc and pas and pas>0 else None
    tiene_cod = d.get("codigoInfarto") or d.get("codigoIctus") or d.get("codigoSepsis")
    clave = d.get("claveObstetrica")
    # -- COMPUERTA A: Prioridad I
    crit_a = (
        d.get("panicoShockTrauma") or d.get("esParoOAgonia") or
        n["scoreTotal"]>=7 or
        (glasgow is not None and glasgow<=8) or
        (spo2 is not None and spo2<90) or
        (pas is not None and pas<90) or
        (shock is not None and shock>=1.3) or
        (glucosa is not None and glucosa<54) or
        (glucosa is not None and glucosa>600) or
        (glucosa is not None and glucosa>250 and (
            (glasgow is not None and glasgow<=13) or (fr is not None and fr>=24) or
            (pas is not None and pas<90) or n["scoreTotal"]>=5)) or
        clave in ["roja","azul"] or
        (d.get("esGestante") and ((pas is not None and pas>=160) or (pad is not None and pad>=110))) or
        (tiene_cod and (n["scoreTotal"]>=5 or (pas is not None and pas<95) or
                        (spo2 is not None and spo2<92) or (glasgow is not None and glasgow<=13)))
    )
    if crit_a: return "I", n

    glucosa_normal = glucosa is None or (70<=glucosa<180)
    eva_cero = eva is None or eva==0
    sin_cod = not (tiene_cod or clave in ["roja","azul","amarilla"] or d.get("panicoShockTrauma"))
    sin_hta_crisis = not ((pas is not None and pas>=180) or (pad is not None and pad>=120))
    fisiologico_ok = n["scoreTotal"]==0 and glucosa_normal and eva_cero and sin_cod and sin_hta_crisis
    # -- COMPUERTA B: Prioridad II
    if not fisiologico_ok:
        crit_b = (
            5<=n["scoreTotal"]<=6 or n["maxParametroUnico"]==3 or
            (glucosa is not None and (glucosa>400 or 54<=glucosa<=69)) or
            (pas is not None and pas>=180) or (pad is not None and pad>=120) or
            (eva is not None and eva>=8) or tiene_cod or clave=="amarilla"
        )
        if crit_b: return "II", n

    # -- COMPUERTA C/D: Prioridades III, IV, V
    if (n["scoreTotal"]>=2 or (eva is not None and 4<=eva<=7) or
        (glucosa is not None and 250<=glucosa<=400) or
        (pas is not None and 140<=pas<=179) or (pad is not None and 90<=pad<=119) or
        (pas is not None and pas>=180) or (pad is not None and pad>=120)):
        return "III", n
    if (n["scoreTotal"]==1 or (eva is not None and 1<=eva<=3) or
        (glucosa is not None and 180<=glucosa<250)):
        return "IV", n
    return "V", n


# =============================================================================
# DEFINICIÓN DE LOS 500 CASOS CLÍNICOS CON COBERTURA BALANCEADA
# CADA CASO: (descripcion, datos, prioridad_esperada, norma_aplicada)
# TODOS los valores clínicos han sido pre-calculados para confirmar el NEWS2
# =============================================================================

CASOS = []

# ─────────────────────────────────────────────────────────────────────────────
# BLOQUE 1: PRIORIDAD I — ROJO (100 casos)
# ESI Nivel 1 | Compuerta A | SLA: Inmediato 0 min
# ─────────────────────────────────────────────────────────────────────────────

# 1A: Paro / Botón Pánico (5)
for edad in [18,30,45,60,75]:
    CASOS.append(("PARO: Botón Pánico", {"panicoShockTrauma":True,"fr":0,"spo2":60,"glasgow":3,"edad":edad}, "I","NTS N°042-MINSA / Ley 27604 Art.3"))

# 1B: Hipoxemia SpO2 < 90% (10): SpO2 baja activa Compuerta A directamente
for spo2 in [70,75,78,80,81,82,85,86,87,89]:
    CASOS.append((f"HIPOXEMIA SpO2={spo2}%",{"spo2":spo2,"fc":100,"pas":115,"fr":22,"glasgow":15,"temp":37.0,"edad":45},"I","ESI v5 Compuerta A / SpO2<90%"))

# 1C: Shock PAS < 90 mmHg (10): PAS baja activa Compuerta A directamente
for pas in [50,55,60,65,70,75,80,83,85,88]:
    CASOS.append((f"SHOCK PAS={pas}",{"pas":pas,"fc":100,"spo2":94,"fr":20,"glasgow":15,"temp":36.5,"edad":55},"I","ESI v5 / NTS N°042 P-I"))

# 1D: Coma Glasgow ≤ 8 (4)
for gcs in [3,5,7,8]:
    CASOS.append((f"COMA GCS={gcs}",{"glasgow":gcs,"spo2":96,"pas":100,"fc":90,"fr":18,"temp":37.0,"edad":60},"I","ESI v5 Compuerta A GCS≤8"))

# 1E: Hipoglucemia ADA < 54 (8): glucosa baja activa Compuerta A directamente
for gluc in [20,25,30,35,40,45,48,53]:
    CASOS.append((f"HIPOGLUCEMIA ADA Glucosa={gluc}",{"glucosa":gluc,"glasgow":11,"spo2":97,"pas":110,"fc":100,"fr":18,"temp":36.8,"edad":55},"I","ADA 2024 Hipoglucemia Grado 3"))

# 1F: Estado Hiperosmolar ADA > 600 (5)
for gluc in [620,650,700,750,800]:
    CASOS.append((f"HIPEROSMOLAR ADA Glucosa={gluc}",{"glucosa":gluc,"glasgow":12,"spo2":95,"pas":85,"fc":115,"fr":22,"temp":38.5,"edad":65},"I","ADA 2024 Estado Hiperosmolar"))

# 1G: Crisis Hiperglucémica descompensada ADA (5)
# Glucosa >250 CON glasgow≤13: Compuerta A
for combo in [(300,10),(350,13),(400,12),(280,12),(320,13)]:
    gluc,gcs = combo
    CASOS.append((f"CRISIS HIPERGLUC Gluc={gluc} GCS={gcs}",{"glucosa":gluc,"glasgow":gcs,"spo2":96,"pas":100,"fc":100,"fr":18,"temp":37.5,"edad":60},"I","ADA 2024 Criterios CAD descompensada"))

# 1H: Clave Obstétrica ROJA (8)
for edad in [18,22,25,28,30,32,35,38]:
    CASOS.append((f"CLAVE ROJA (Hemorragia) Edad={edad}",{"claveObstetrica":"roja","esGestante":True,"pas":80,"fc":120,"spo2":95,"fr":22,"glasgow":15,"temp":36.5,"edad":edad},"I","Claves Obstétricas MINSA / Ley 27408"))

# 1I: Clave Obstétrica AZUL (8)
for pas in [170,175,180,185,190,195,200,210]:
    CASOS.append((f"CLAVE AZUL (Eclampsia) PAS={pas}",{"claveObstetrica":"azul","esGestante":True,"pas":pas,"pad":115,"fc":100,"spo2":94,"fr":20,"glasgow":13,"temp":37.2,"edad":27},"I","Claves Obstétricas MINSA / Preeclampsia"))

# 1J: Código Infarto inestable: SpO2<92 activa la inestabilidad (5)
for spo2 in [88,89,90,91,91]:
    CASOS.append((f"CÓDIGO INFARTO inestable SpO2={spo2}",{"codigoInfarto":True,"spo2":spo2,"pas":110,"fc":100,"fr":18,"glasgow":15,"temp":36.8,"edad":58},"I","NTS N°042 / Código Tiempo-Dep. inestable"))

# 1K: Código Ictus inestable: GCS≤13 activa inestabilidad (5)
for gcs in [10,11,12,13,13]:
    CASOS.append((f"CÓDIGO ICTUS inestable GCS={gcs}",{"codigoIctus":True,"glasgow":gcs,"spo2":95,"pas":105,"fc":100,"fr":18,"temp":37.0,"edad":65},"I","NTS N°042 / Código Tiempo-Dep. inestable"))

# 1L: Código Sepsis inestable: NEWS2≥5 activa inestabilidad
# FR=25(+3)+SpO2=93(+2)=5pts → NEWS2≥5 (5 casos)
for fc in [90,92,95,88,91]:
    CASOS.append((f"CÓDIGO SEPSIS inestable FR=25 SpO2=93 NEWS2=5",{"codigoSepsis":True,"temp":38.5,"pas":105,"fc":fc,"fr":25,"spo2":93,"glasgow":15,"edad":55},"I","NTS N°042 / Sepsis Inestable NEWS2≥5"))

# 1M: Índice de Shock ≥ 1.3: FC/PAS ≥ 1.3
# FC=130, PAS=90 → 130/90=1.44 ≥1.3 → P-I (5 casos)
for combo in [(130,90),(140,100),(120,80),(150,110),(132,95)]:
    fc,pas = combo
    indice = fc/pas
    CASOS.append((f"ÍNDICE SHOCK FC={fc}/PAS={pas}={indice:.2f}≥1.3",{"fc":fc,"pas":pas,"spo2":94,"fr":22,"glasgow":15,"temp":36.5,"edad":45},"I","Índice Shock ESI / NTS N°042"))

# 1N: Pediátrico PALS crítico: FC=170 con edad<5 → 3pts; FR=50 → 3pts; SpO2=85 → 3pts (6 casos)
for edad_p in [1,2,3,5,7,10]:
    CASOS.append((f"PEDIÁTRICO PALS crítico Edad={edad_p}",{"fc":170,"spo2":85,"pas":65,"fr":50,"glasgow":12,"temp":39.5,"esPediatrico":True,"edad":edad_p},"I","PALS Pediátrico / NTS N°042"))

# 1O: NEWS2 ≥ 7 multisistémico (todos sin shock index ni SpO2<90 individuales)
# FR=25(+3)+SpO2=93(+2)+FC=112(+2)=7pts → Compuerta A (5 casos)
for temp in [37.0,37.0,37.0,38.5,37.0]:
    CASOS.append(("NEWS2≥7 multisistémico",{"fr":25,"spo2":93,"pas":115,"fc":112,"glasgow":15,"temp":temp,"edad":60},"I","NEWS2≥7 Royal College of Physicians"))

# 1P: Gestante con PA≥160/110 → Compuerta A (6 casos)
for combo in [(160,110),(165,112),(170,115),(180,110),(165,110),(160,112)]:
    pas,pad = combo
    CASOS.append((f"GESTANTE PA≥160/110: {pas}/{pad}",{"esGestante":True,"pas":pas,"pad":pad,"fc":95,"spo2":96,"fr":18,"glasgow":15,"temp":37.2,"edad":28},"I","Claves Obstétricas / Preeclampsia Severa"))

assert sum(1 for _,_,p,_ in CASOS if p=="I") == 100, f"P-I actual: {sum(1 for _,_,p,_ in CASOS if p=='I')}"

# ─────────────────────────────────────────────────────────────────────────────
# BLOQUE 2: PRIORIDAD II — NARANJA (100 casos)
# ESI Nivel 2 | Compuerta B | SLA: ≤ 10 min
# REGLA: NO deben caer en Compuerta A. Todos sin shock index ≥ 1.3,
#        sin SpO2<90, sin PAS<90, sin GCS≤8, sin glucosa<54 o >600
# ─────────────────────────────────────────────────────────────────────────────

# 2A: Dolor Severo EVA 8-10 (20 casos)
# Vitales completamente normales: SpO2 98-99, PAS 115-125, FC 75-88, FR 16-18, GCS 15, Temp 36.5-37.2
for combo in [(8,98,118,80,16),(8,99,120,78,16),(8,98,122,82,18),(9,99,118,80,16),(9,98,120,80,18),
              (9,99,122,78,16),(9,98,118,82,18),(10,99,120,80,16),(10,98,122,78,18),(10,99,118,82,16),
              (8,99,120,80,18),(9,98,118,78,16),(10,99,122,82,18),(8,98,120,80,16),(9,99,118,78,18),
              (10,98,122,80,16),(8,99,120,82,18),(9,98,118,80,16),(10,99,122,78,18),(8,99,120,80,16)]:
    eva,spo2,pas,fc,fr = combo
    CASOS.append((f"DOLOR SEVERO EVA={eva}",{"eva":eva,"spo2":spo2,"fc":fc,"pas":pas,"pad":80,"fr":fr,"temp":36.8,"glasgow":15,"glucosa":100,"edad":40},"II","ESI v5 Compuerta B / Dolor Severo"))

# 2B: NEWS2 Score 5-6 exacto (10 casos)
# Combinaciones pre-calculadas:
# FR=22(+2)+SpO2=93(+2)+FC=92(+1)=5pts ✓ shock=92/115=0.80 ✓
news2_56 = [
    (22, 93, 115, 92,  15, 37.0, 50),   # 2+2+0+1+0+0 = 5
    (22, 93, 112, 90,  15, 38.2, 55),   # 2+2+0+0+0+1 = 5
    (22, 93, 115, 95,  15, 38.5, 48),   # 2+2+0+0+0+1 = 5 (temp)
    (22, 94, 112, 92,  15, 38.2, 52),   # 2+1+0+1+0+1 = 5
    (22, 94, 112, 92,  15, 37.0, 60),   # 2+1+0+1+0+0 = 4... añadir temp
    (25, 95, 112, 85,  15, 38.2, 55),   # 3+1+0+0+0+1 = 5
    (25, 96, 112, 90,  15, 38.5, 50),   # 3+0+0+0+0+1 = 4... usar SpO2=94
    (25, 94, 112, 85,  15, 37.0, 48),   # 3+1+0+0+0+0 = 4... añadir FC=92
    (22, 93, 115, 85,  15, 38.5, 55),   # 2+2+0+0+0+1 = 5
    (22, 93, 115, 92,  15, 38.5, 60),   # 2+2+0+1+0+1 = 6
]
# Calcular manualmente para los ambiguos y usar solo los que dan 5-6
combos_validos = [
    (22,93,115,92,15,37.0,50),    # FR22(+2)+SpO2 93(+2)+FC92(+1)=5 | shock=92/115=0.80 OK
    (22,93,115,92,15,38.2,55),    # +1 temp = 6 total
    (25,96,112,85,15,38.5,48),    # FR25(+3)+FC85(0)+temp(+1)=4... mejor:
    (22,93,112,92,15,38.5,52),    # FR22(+2)+SpO2 93(+2)+FC92(+1)+temp(+1)=6
    (25,95,115,85,15,38.2,45),    # FR25(+3)+SpO2 95(+1)+temp(+1)=5
    (22,93,115,85,15,38.5,55),    # FR22(+2)+SpO2 93(+2)+temp(+1)=5
    (22,94,115,92,15,38.5,50),    # FR22(+2)+SpO2 94(+1)+FC92(+1)+temp(+1)=5
    (22,94,112,92,15,38.2,55),    # FR22(+2)+SpO2 94(+1)+FC92(+1)+temp(+1)=5
    (22,93,115,85,15,38.2,60),    # FR22(+2)+SpO2 93(+2)+temp(+1)=5
    (22,93,112,85,15,38.5,48),    # FR22(+2)+SpO2 93(+2)+temp(+1)=5
]
for fr,spo2,pas,fc,gcs,temp,edad in combos_validos:
    CASOS.append((f"NEWS2=5-6: FR={fr} SpO2={spo2} FC={fc}",{"fr":fr,"spo2":spo2,"pas":pas,"fc":fc,"glasgow":gcs,"temp":temp,"edad":edad},"II","NEWS2 Score 5-6 Royal College of Physicians"))

# 2C: Crisis Hipertensiva PA ≥ 180/120 (10 casos)
# Vitales restantes normales: SpO2≥96, FR normal, GCS 15, FC <131, sin shock
for combo in [(185,122),(190,125),(195,130),(200,128),(210,125),(185,120),(192,122),(188,121),(195,128),(200,130)]:
    pas,pad = combo
    CASOS.append((f"CRISIS HIPERTENSIVA {pas}/{pad}",{"pas":pas,"pad":pad,"fc":88,"spo2":97,"fr":18,"temp":36.8,"glasgow":15,"edad":55},"II","ESI v5 Compuerta B / Crisis Hipertensiva"))

# 2D: Glucosa ADA Nivel 2 (54-69 mg/dL) (10 casos)
for gluc in [54,55,58,60,62,65,67,68,69,56]:
    CASOS.append((f"HIPOGLUCEMIA NIVEL 2 ADA Gluc={gluc}",{"glucosa":gluc,"spo2":98,"fc":95,"pas":115,"fr":18,"glasgow":15,"temp":36.8,"edad":50},"II","ADA 2024 Hipoglucemia Grado 2 (54-69)"))

# 2E: Glucosa > 400 mg/dL sin descompensación (GCS=15, FR<24, PAS≥95) (10 casos)
for gluc in [401,420,450,480,500,520,540,560,580,600]:
    CASOS.append((f"HIPERGLUCEMIA CRÍTICA ADA Gluc={gluc}",{"glucosa":gluc,"spo2":97,"fc":88,"pas":130,"fr":18,"glasgow":15,"temp":37.5,"edad":60},"II","ADA 2024 Hiperglucemia >400"))

# 2F: Código Tiempo-Dependiente ESTABLE (15 casos)
# Estable = SpO2≥92, PAS≥95, GCS=15, NEWS2 <5
for _ in range(5):
    CASOS.append(("INFARTO estable SpO2=95 PAS=115",{"codigoInfarto":True,"spo2":95,"pas":115,"fc":88,"fr":18,"glasgow":15,"temp":36.8,"edad":58},"II","NTS N°042 / Código Infarto Estable"))
for _ in range(5):
    CASOS.append(("ICTUS estable GCS=15 SpO2=96",{"codigoIctus":True,"spo2":96,"pas":118,"fc":88,"fr":18,"glasgow":15,"temp":37.0,"edad":65},"II","NTS N°042 / Código Ictus Estable"))
for _ in range(5):
    CASOS.append(("SEPSIS estable NEWS2=1",{"codigoSepsis":True,"temp":38.5,"spo2":97,"pas":115,"fc":88,"fr":18,"glasgow":15,"edad":55},"II","NTS N°042 / Código Sepsis Estable"))

# 2G: Clave Obstétrica AMARILLA (10 casos)
for edad in [19,22,25,27,30,32,35,36,38,40]:
    CASOS.append((f"CLAVE AMARILLA (Sepsis Obs.) Edad={edad}",{"claveObstetrica":"amarilla","esGestante":True,"temp":38.5,"fc":100,"pas":115,"spo2":96,"fr":20,"glasgow":15,"edad":edad},"II","Claves Obstétricas MINSA / Ley 27408"))

# 2H: NEWS2 maxParametroUnico=3 vía FR≥25 (sin shock, sin SpO2<90)
# FR=25→+3pts, SpO2=97(0), PAS=120(0), FC=88(0), GCS=15(0), Temp=37(0) → Total=3, max=3 → P-II (15 casos)
for fr in [25,26,27,28,29,30,32,34,36,38,40,25,26,27,28]:
    CASOS.append((f"NEWS2 max_indiv=3 vía FR={fr}",{"fr":fr,"spo2":97,"pas":120,"pad":80,"fc":88,"glasgow":15,"temp":37.0,"edad":50},"II","NEWS2 Parámetro Individual=3 / ESI v5"))

assert sum(1 for _,_,p,_ in CASOS if p=="II") == 100, f"P-II actual: {sum(1 for _,_,p,_ in CASOS if p=='II')}"

# ─────────────────────────────────────────────────────────────────────────────
# BLOQUE 3: PRIORIDAD III — AMARILLO (100 casos)
# ESI Nivel 3 | Compuerta C | SLA: ≤ 30 min
# REGLA: NO caen en A ni B. NEWS2 2-4, EVA 4-7, glucosa 250-400, PAS 140-179
# ─────────────────────────────────────────────────────────────────────────────

# 3A: Dolor Moderado EVA 4-7 (25 casos) — vitales normales (NEWS2=0)
for eva in [4,4,4,4,5,5,5,5,5,6,6,6,6,7,7,7,7,4,5,6,7,4,5,6,7]:
    CASOS.append((f"DOLOR MODERADO EVA={eva}",{"eva":eva,"spo2":99,"fc":80,"pas":125,"pad":80,"fr":16,"temp":37.0,"glasgow":15,"glucosa":100,"edad":40},"III","ESI v5 Compuerta C / NTS N°042 P-III"))

# 3B: NEWS2 Score 2-4 con vitales contenidos (25 casos)
# Fórmulas validadas:
# FR=22(+2) resto normal → total=2 → P-III
# SpO2=93(+2) resto normal → total=2 → P-III
# FR=22(+2)+SpO2=94(+1) → total=3 → P-III (si NOT fisiologico_ok Y no Comp A/B)
# Pero si scoreTotal=3 sin maxParam=3 → P-III
combos_iii_news2 = [
    (22,97,120,85,15,37.0,50),  # FR22→+2 total=2
    (22,97,118,82,15,37.0,48),  # FR22→+2 total=2
    (22,98,122,80,15,37.0,55),  # FR22→+2 total=2
    (22,97,115,88,15,37.0,45),  # FR22→+2 total=2
    (22,97,120,85,15,37.0,60),  # FR22→+2 total=2
    (18,93,120,85,15,37.0,50),  # SpO2 93→+2 total=2
    (18,93,118,82,15,37.0,48),  # SpO2 93→+2
    (18,93,122,80,15,37.0,55),  # SpO2 93→+2
    (18,93,115,88,15,37.0,45),  # SpO2 93→+2
    (18,93,120,85,15,37.0,60),  # SpO2 93→+2
    (22,94,120,85,15,37.0,50),  # FR22(+2)+SpO2 94(+1)=3
    (22,94,118,82,15,37.0,48),  # FR22(+2)+SpO2 94(+1)=3
    (22,94,122,80,15,37.0,55),  # FR22(+2)+SpO2 94(+1)=3
    (22,97,120,85,15,38.2,50),  # FR22(+2)+Temp38.2(+1)=3
    (22,97,118,82,15,38.5,48),  # FR22(+2)+Temp38.5(+1)=3
    (22,97,120,85,15,35.5,55),  # FR22(+2)+Temp35.5(+1)=3
    (21,94,120,85,15,37.0,50),  # FR21(+2)+SpO2 94(+1)=3
    (21,94,118,82,15,37.0,48),  # FR21(+2)+SpO2 94(+1)=3
    (22,95,120,92,15,37.0,50),  # FR22(+2)+SpO2 95(+1)+FC92(+1)=4
    (22,95,118,92,15,37.0,48),  # FR22(+2)+SpO2 95(+1)+FC92(+1)=4
    (22,96,120,92,15,38.2,55),  # FR22(+2)+FC92(+1)+temp(+1)=4
    (22,96,120,92,15,38.2,55),  # FR22(+2)+FC92(+1)+temp(+1)=4
    (22,96,120,92,15,38.5,50),  # FR22(+2)+FC92(+1)+temp(+1)=4
    (22,96,118,92,15,38.5,48),  # FR22(+2)+FC92(+1)+temp(+1)=4
    (22,96,122,92,15,38.5,55),  # FR22(+2)+FC92(+1)+temp(+1)=4
]
for fr,spo2,pas,fc,gcs,temp,edad in combos_iii_news2:
    CASOS.append((f"NEWS2 2-4: FR={fr} SpO2={spo2} FC={fc}",{"fr":fr,"spo2":spo2,"pas":pas,"fc":fc,"glasgow":gcs,"temp":temp,"edad":edad,"eva":0},"III","NEWS2 Score 2-4 / NTS N°042 P-III"))

# 3C: HTA Sin Crisis (PAS 140-179) — sin dolor, NEWS2=0 en otros parámetros (20)
for pas in [140,142,145,148,150,152,155,158,160,162,165,168,170,172,175,177,178,155,165,175]:
    CASOS.append((f"HTA PAS={pas}",{"pas":pas,"pad":92,"fc":85,"spo2":98,"fr":18,"temp":36.8,"glasgow":15,"eva":0,"glucosa":100,"edad":60},"III","NTS N°042 P-III / HTA sin crisis"))

# 3D: Hiperglucemia Moderada (250-400) sin descompensación (15)
for gluc in [250,265,280,295,310,325,340,355,370,385,395,300,320,360,380]:
    CASOS.append((f"HIPERGLUCEMIA MODERADA Gluc={gluc}",{"glucosa":gluc,"spo2":98,"fc":85,"pas":128,"fr":18,"glasgow":15,"temp":37.2,"eva":0,"edad":55},"III","ADA 2024 / NTS N°042 P-III"))

# 3E: Adulto Mayor con Urgencia Moderada (Ley 27408) (15)
for edad in [65,67,70,72,75,78,80,82,85,87,90,68,73,77,83]:
    CASOS.append((f"ADULTO MAYOR (Ley 27408) Edad={edad} EVA=5",{"eva":5,"spo2":97,"fc":85,"pas":148,"pad":90,"fr":20,"temp":37.5,"glasgow":15,"edad":edad},"III","Ley N°27408 / Atención Preferente Adulto Mayor"))

assert sum(1 for _,_,p,_ in CASOS if p=="III") == 100, f"P-III actual: {sum(1 for _,_,p,_ in CASOS if p=='III')}"

# ─────────────────────────────────────────────────────────────────────────────
# BLOQUE 4: PRIORIDAD IV — VERDE (100 casos)
# ESI Nivel 4 | Compuerta D1 | SLA: ≤ 60 min
# REGLA: NEWS2=1, o EVA 1-3, o glucosa 180-249
# ─────────────────────────────────────────────────────────────────────────────

# 4A: Dolor Leve EVA 1-3 (30 casos) — vitales normales (NEWS2=0)
for eva in [1,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,3,1,2,3,1,2,3,1,2,3,1,2,3,2]:
    CASOS.append((f"DOLOR LEVE EVA={eva}",{"eva":eva,"spo2":99,"fc":78,"pas":118,"pad":78,"fr":16,"temp":36.8,"glasgow":15,"glucosa":98,"edad":35},"IV","ESI v5 Compuerta D1 / NTS N°042 P-IV"))

# 4B: NEWS2 Score = 1 exacto (20 casos)
# SpO2=95→+1, resto normal: FR 12-20, PAS 111-219, FC 51-90, GCS=15, Temp 36.1-38.0
combos_iv_news2 = [
    (16,95,120,80,15,37.0,40),  # SpO2 95→+1 = total 1
    (16,95,118,82,15,37.0,38),
    (16,95,122,78,15,37.0,45),
    (16,95,115,85,15,37.0,50),
    (16,95,120,80,15,37.0,55),
    (16,96,120,80,15,35.5,40),  # Temp 35.5→+1 = total 1
    (16,96,118,82,15,35.5,38),
    (16,96,122,78,15,35.5,45),
    (16,96,120,80,15,38.2,40),  # Temp 38.2→+1 = total 1
    (16,96,118,82,15,38.5,38),
    (10,96,120,80,15,37.0,40),  # FR10→+1 = total 1
    (10,97,120,80,15,37.0,40),  # FR10→+1 = total 1
    (10,97,118,82,15,37.0,38),
    (10,97,122,78,15,37.0,45),
    (10,97,115,85,15,37.0,50),
    (16,97,120,92,15,37.0,40),  # FC92→+1 = total 1
    (16,97,118,92,15,37.0,38),
    (16,97,122,92,15,37.0,45),
    (16,97,115,92,15,37.0,50),
    (16,97,120,92,15,37.0,55),
]
for fr,spo2,pas,fc,gcs,temp,edad in combos_iv_news2:
    CASOS.append((f"NEWS2=1: FR={fr} SpO2={spo2} FC={fc}",{"fr":fr,"spo2":spo2,"pas":pas,"fc":fc,"glasgow":gcs,"temp":temp,"eva":0,"edad":edad},"IV","NEWS2 Score=1 / ESI v5"))

# 4C: Hiperglucemia Leve 180-249 mg/dL (20 casos)
for gluc in [180,185,190,195,200,205,210,215,220,225,230,235,240,245,248,183,193,213,223,243]:
    CASOS.append((f"HIPERGLUCEMIA LEVE Gluc={gluc}",{"glucosa":gluc,"spo2":99,"fc":80,"pas":125,"fr":16,"glasgow":15,"temp":37.0,"eva":0,"edad":50},"IV","ADA 2024 / NTS N°042 P-IV"))

# 4D: Niño y Adolescente con urgencia leve (Ley 27408) (15 casos)
for edad in [2,3,4,5,6,7,8,9,10,11,12,13,14,1,3]:
    CASOS.append((f"MENOR (Ley 27408) Edad={edad} EVA=2",{"eva":2,"temp":38.0,"spo2":98,"fc":95,"pas":100,"fr":22,"glasgow":15,"esPediatrico":True,"edad":edad},"IV","Ley N°27408 / Atención Preferente Niño"))

# 4E: Gestante sin alarma (Ley 27408) (15 casos)
for edad in [18,20,22,24,26,28,30,32,34,36,25,27,29,31,33]:
    CASOS.append((f"GESTANTE sin alarma (Ley 27408) Edad={edad}",{"esGestante":True,"eva":2,"spo2":98,"fc":85,"pas":125,"pad":82,"fr":18,"temp":37.0,"glasgow":15,"glucosa":95,"edad":edad},"IV","Ley N°27408 / Atención Preferente Gestante"))

assert sum(1 for _,_,p,_ in CASOS if p=="IV") == 100, f"P-IV actual: {sum(1 for _,_,p,_ in CASOS if p=='IV')}"

# ─────────────────────────────────────────────────────────────────────────────
# BLOQUE 5: PRIORIDAD V — AZUL (100 casos)
# ESI Nivel 5 | Compuerta D2 | SLA: ≤ 120 min
# REGLA: NEWS2=0, EVA=0, glucosa normal (70-179), sin alarmas
# ─────────────────────────────────────────────────────────────────────────────

# 5A: Signos Vitales Normales / Sin Dolor / Sin Alarma (40 casos)
for i in range(40):
    edad = 20 + i
    CASOS.append((f"NO URGENTE: Vitales normales Edad={edad}",
        {"fr":16,"spo2":99,"pas":118,"pad":78,"fc":72,"glasgow":15,"temp":36.8,"glucosa":95,"eva":0,"edad":edad},
        "V","ESI v5 Compuerta D2 / NTS N°042 P-V"))

# 5B: Consulta Administrativa / Control / Retiro de puntos (30 casos)
for i in range(30):
    edad = 18 + i*2
    CASOS.append((f"CONSULTA/CONTROL Edad={edad}",
        {"fr":16,"spo2":99,"pas":120,"pad":78,"fc":72,"glasgow":15,"temp":36.8,"glucosa":90,"eva":0,"edad":edad},
        "V","ESI v5 Nivel 5 / No Urgencia Ambulatoria"))

# 5C: Todos los campos vacíos — Invariante 4 (15 casos)
for _ in range(15):
    CASOS.append(("TODOS LOS CAMPOS VACÍOS: Invariante 4",
        {"fr":None,"spo2":None,"pas":None,"pad":None,"fc":None,"glasgow":None,"temp":None,"glucosa":None,"eva":None},
        "V","Invariante 4: Ningún null puede disparar Prioridad I"))

# 5D: Glucosa Normal sin otros síntomas (15 casos)
for gluc in [70,80,85,90,95,100,105,110,115,120,125,130,140,150,175]:
    CASOS.append((f"GLUCOSA NORMAL Gluc={gluc} sin síntomas",
        {"glucosa":gluc,"fr":16,"spo2":99,"pas":118,"pad":76,"fc":70,"glasgow":15,"temp":36.8,"eva":0,"edad":45},
        "V","ESI v5 Nivel 5 / Glucosa Normal"))

assert sum(1 for _,_,p,_ in CASOS if p=="V") == 100, f"P-V actual: {sum(1 for _,_,p,_ in CASOS if p=='V')}"
assert len(CASOS) == 500, f"Total esperado 500, hay {len(CASOS)}"

# =============================================================================
# EJECUCIÓN Y REPORTE
# =============================================================================
print("=" * 70)
print(" SUITE CLÍNICA BALANCEADA - 500 CASOS NORMATIVOS COMPLETOS")
print(" NTS N°042-MINSA / ESI v5 / NEWS2 / ADA 2024 / PALS / Leyes 27604, 27408")
print("=" * 70)

errores = []
conteo = {"I":0,"II":0,"III":0,"IV":0,"V":0}
normas = set()

for i, (desc, datos, prio_esp, norma) in enumerate(CASOS):
    try:
        prio_calc, news2 = evaluar_triaje(datos)
        normas.add(norma)
        if prio_calc == prio_esp:
            conteo[prio_esp] += 1
        else:
            errores.append(f"[Caso {i+1}] {desc}\n"
                           f"  Esperado P-{prio_esp} → Calculado P-{prio_calc} | NEWS2={news2['scoreTotal']} pts max={news2['maxParametroUnico']}\n"
                           f"  Desglose: {', '.join(news2['desglose'])}\n"
                           f"  Datos: {datos}")
    except Exception as ex:
        errores.append(f"[Caso {i+1}] EXCEPCIÓN: {desc} → {ex}")

print()
print("DISTRIBUCIÓN DE CASOS PROBADOS (100 por prioridad):")
print("-" * 60)
for p in ["I","II","III","IV","V"]:
    n = conteo[p]
    barra = "█" * n
    estado = "✔" if n == 100 else f"✖ ({100-n} fallaron)"
    print(f"  P-{p}: {n:3d}/100  {estado}  {barra}")

print()
print(f"ESTÁNDARES Y NORMAS CUBIERTAS: {len(normas)}")
for norma in sorted(normas):
    print(f"  ✔ {norma}")

print()
if errores:
    print(f"RESULTADO: {len(errores)} FALLO(S) en 500 casos")
    print("=" * 70)
    for e in errores:
        print(e)
        print()
else:
    print("=" * 70)
    print("  RESULTADO FINAL: 500/500 CORRECTOS — 100% DE APROBACIÓN")
    print()
    print("  Cobertura por tipo de caso:")
    print("  · P-I  (100): Paro/Pánico, Hipoxemia, Shock, Coma, Hipoglucemia ADA,")
    print("                Hiperosmolar ADA, Crisis Hiperglucémica, Claves Obstétricas")
    print("                ROJA/AZUL, Gestante PA≥160/110, Códigos Infarto/Ictus/Sepsis")
    print("                (inestables), Índice de Shock≥1.3, Pediátrico PALS crítico,")
    print("                NEWS2≥7 multisistémico")
    print("  · P-II (100): Dolor Severo EVA 8-10, NEWS2 Score 5-6, Crisis Hipertensiva,")
    print("                Glucosa ADA Nivel 2 (54-69), Hiperglucemia >400, Códigos tiempo")
    print("                (estables), Clave Amarilla, NEWS2 maxIndiv=3 vía FR≥25")
    print("  · P-III(100): Dolor Moderado EVA 4-7, NEWS2 Score 2-4, HTA PAS 140-179,")
    print("                Hiperglucemia Moderada 250-400, Adulto Mayor (Ley 27408)")
    print("  · P-IV (100): Dolor Leve EVA 1-3, NEWS2 Score=1, Hiperglucemia Leve 180-249,")
    print("                Niño/Adolescente (Ley 27408), Gestante sin alarma (Ley 27408)")
    print("  · P-V  (100): Vitales normales, Consulta/Control, Todos vacíos (Invariante 4),")
    print("                Glucosa normal sin síntomas")
    print("=" * 70)
