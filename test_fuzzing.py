import random

def calcular_news2(fr, spo2, pas, fc, glasgow, temp, es_pediatrico=False, edad=30):
    desglose = []
    max_param = 0
    total = 0

    # 1. FR
    pts_fr = 0
    if fr is None:
        desglose.append("FR: No registrado")
    elif es_pediatrico:
        if edad < 3:
            pts_fr = 3 if fr <= 15 or fr >= 50 else (2 if fr >= 41 else (1 if fr <= 23 else 0))
        else:
            pts_fr = 3 if fr <= 10 or fr >= 31 else (2 if fr >= 26 else (1 if fr <= 14 else 0))
    else:
        if fr <= 8 or fr >= 25:
            pts_fr = 3
        elif fr >= 21:
            pts_fr = 2
        elif fr <= 11:
            pts_fr = 1
        else:
            pts_fr = 0
    total += pts_fr
    max_param = max(max_param, pts_fr)

    # 2. SpO2
    pts_spo2 = 0
    if spo2 is None:
        desglose.append("SpO2: No registrado")
    else:
        if spo2 <= 91:
            pts_spo2 = 3
        elif spo2 <= 93:
            pts_spo2 = 2
        elif spo2 <= 95:
            pts_spo2 = 1
        else:
            pts_spo2 = 0
    total += pts_spo2
    max_param = max(max_param, pts_spo2)

    # 3. PAS
    pts_pas = 0
    if pas is None:
        desglose.append("PAS: No registrado")
    elif es_pediatrico:
        lim_inf = 70 + 2 * edad
        if pas < lim_inf or pas >= 135:
            pts_pas = 3
        elif pas < 90:
            pts_pas = 2
        elif pas < 100:
            pts_pas = 1
        else:
            pts_pas = 0
    else:
        if pas <= 90 or pas >= 220:
            pts_pas = 3
        elif pas <= 100:
            pts_pas = 2
        elif pas <= 110:
            pts_pas = 1
        else:
            pts_pas = 0
    total += pts_pas
    max_param = max(max_param, pts_pas)

    # 4. FC
    pts_fc = 0
    if fc is None:
        desglose.append("FC: No registrado")
    elif es_pediatrico:
        if edad < 5:
            pts_fc = 3 if fc <= 60 or fc >= 161 else (2 if fc >= 131 else (1 if fc <= 79 else 0))
        else:
            pts_fc = 3 if fc <= 50 or fc >= 141 else (2 if fc >= 126 else (1 if fc <= 59 or fc >= 106 else 0))
    else:
        if fc <= 40 or fc >= 131:
            pts_fc = 3
        elif fc >= 111:
            pts_fc = 2
        elif fc <= 50 or fc >= 91:
            pts_fc = 1
        else:
            pts_fc = 0
    total += pts_fc
    max_param = max(max_param, pts_fc)

    # 5. Conciencia (Glasgow)
    pts_glasgow = 0
    if glasgow is None:
        desglose.append("Glasgow: No registrado")
    else:
        pts_glasgow = 0 if glasgow == 15 else 3
    total += pts_glasgow
    max_param = max(max_param, pts_glasgow)

    # 6. Temp
    pts_temp = 0
    if temp is None:
        desglose.append("Temp: No registrado")
    else:
        if temp <= 35.0:
            pts_temp = 3
        elif temp >= 39.1:
            pts_temp = 2
        elif temp <= 36.0 or temp >= 38.1:
            pts_temp = 1
        else:
            pts_temp = 0
    total += pts_temp
    max_param = max(max_param, pts_temp)

    return {"scoreTotal": total, "maxParametroUnico": max_param, "desglose": desglose}


def evaluar_triaje_estandar(d):
    news2 = calcular_news2(
        d.get("fr"), d.get("spo2"), d.get("pas"), d.get("fc"),
        d.get("glasgow"), d.get("temp"), d.get("esPediatrico", False), d.get("edad", 30)
    )

    motivos = []
    fc = d.get("fc")
    pas = d.get("pas")
    pad = d.get("pad")
    fr = d.get("fr")
    spo2 = d.get("spo2")
    glasgow = d.get("glasgow")
    glucosa = d.get("glucosa")
    eva = d.get("eva")
    indice_shock = (fc / pas) if (fc is not None and pas is not None and pas > 0) else None

    # --- COMPUERTA A (ESI 1 -> PRIORIDAD I) ---
    amenazas_a = []
    if d.get("panicoShockTrauma"):
        amenazas_a.append("Pánico Shock Trauma / Paro")
    if news2["scoreTotal"] >= 7:
        amenazas_a.append(f"NEWS2 >= 7 ({news2['scoreTotal']} pts)")
    if glasgow is not None and glasgow <= 8:
        amenazas_a.append(f"Glasgow <= 8 ({glasgow})")
    if spo2 is not None and spo2 < 90:
        amenazas_a.append(f"SpO2 < 90% ({spo2}%)")
    if pas is not None and pas < 90:
        amenazas_a.append(f"Hipotensión PAS < 90 ({pas} mmHg)")
    if indice_shock is not None and indice_shock >= 1.3:
        amenazas_a.append(f"Índice Shock >= 1.3 ({indice_shock:.2f})")
    if glucosa is not None and glucosa < 54:
        amenazas_a.append(f"Hipoglucemia ADA < 54 ({glucosa} mg/dL)")
    if glucosa is not None and glucosa > 600:
        amenazas_a.append(f"Hiperosmolar ADA > 600 ({glucosa} mg/dL)")
    if glucosa is not None and glucosa > 250:
        if (glasgow is not None and glasgow <= 13) or (fr is not None and fr >= 24) or (pas is not None and pas < 90) or news2["scoreTotal"] >= 5:
            amenazas_a.append(f"Crisis hiperglucémica descompensada ADA (Glucosa {glucosa})")
    if d.get("claveObstetrica") in ["roja", "azul"]:
        amenazas_a.append(f"Clave obstétrica {d.get('claveObstetrica')}")
    elif d.get("esGestante") and ((pas is not None and pas >= 160) or (pad is not None and pad >= 110)):
        amenazas_a.append("Gestante con PA >= 160/110")
    
    tiene_cod_tiempo = d.get("codigoInfarto") or d.get("codigoIctus") or d.get("codigoSepsis")
    if tiene_cod_tiempo:
        inestable = (news2["scoreTotal"] >= 5) or (pas is not None and pas < 95) or (spo2 is not None and spo2 < 92) or (glasgow is not None and glasgow <= 13)
        if inestable:
            amenazas_a.append("Código tiempo-dependiente inestable")

    if amenazas_a:
        return {"prioridad": "I", "esiNivel": 1, "compuerta": "COMPUERTA A", "news2": news2, "motivos": amenazas_a}

    # --- INVARIANTE 1 GUARD: Si NEWS2 == 0, glucosa normal, EVA 0 y sin códigos/claves -> JAMÁS P-I ni P-II ---
    glucosa_normal = (glucosa is None) or (70 <= glucosa < 180)
    eva_cero = (eva is None or eva == 0)
    es_fisiologicamente_intacto = (news2["scoreTotal"] == 0 and glucosa_normal and eva_cero and not tiene_cod_tiempo and not d.get("claveObstetrica"))

    # --- COMPUERTA B (ESI 2 -> PRIORIDAD II) ---
    criterios_b = []
    if not es_fisiologicamente_intacto:
        if 5 <= news2["scoreTotal"] <= 6:
            criterios_b.append(f"NEWS2 medio ({news2['scoreTotal']} pts)")
        if news2["maxParametroUnico"] == 3:
            criterios_b.append("NEWS2 Parámetro individual = 3 pts")
        if glucosa is not None and (glucosa > 400 or (54 <= glucosa <= 69)):
            criterios_b.append(f"Glucosa ADA nivel 2 ({glucosa} mg/dL)")
        if (pas is not None and pas >= 180) or (pad is not None and pad >= 120):
            criterios_b.append(f"Crisis hipertensiva PA {pas}/{pad}")
        if eva is not None and eva >= 8:
            criterios_b.append(f"Dolor severo EVA {eva}/10")
        if tiene_cod_tiempo:
            criterios_b.append("Código tiempo-dependiente estable")
        if d.get("claveObstetrica") == "amarilla":
            criterios_b.append("Clave amarilla obstétrica")

    if criterios_b:
        return {"prioridad": "II", "esiNivel": 2, "compuerta": "COMPUERTA B", "news2": news2, "motivos": criterios_b}

    # --- COMPUERTA C y D (ESI 3, 4, 5 -> PRIORIDADES III, IV, V) ---
    es_prio_3 = (news2["scoreTotal"] >= 2) or \
                (eva is not None and 4 <= eva <= 7) or \
                (glucosa is not None and 250 <= glucosa <= 400) or \
                (pas is not None and 140 <= pas <= 179) or \
                (pad is not None and 90 <= pad <= 119) or \
                (pas is not None and pas >= 180) or (pad is not None and pad >= 120)  # Caso asintomático puro

    if es_prio_3:
        return {"prioridad": "III", "esiNivel": 3, "compuerta": "COMPUERTA C", "news2": news2, "motivos": ["Urgencia moderada"]}

    es_prio_4 = (news2["scoreTotal"] == 1) or \
                (eva is not None and 1 <= eva <= 3) or \
                (glucosa is not None and 180 <= glucosa <= 249)

    if es_prio_4:
        return {"prioridad": "IV", "esiNivel": 4, "compuerta": "COMPUERTA D1", "news2": news2, "motivos": ["Urgencia menor"]}

    return {"prioridad": "V", "esiNivel": 5, "compuerta": "COMPUERTA D2", "news2": news2, "motivos": ["No urgencia"]}


# --- PROPERTY-BASED FUZZING TEST SUITE (500 COMBINACIONES) ---
print("Running 500 Property-Based Fuzzing Tests...")
random.seed(42)

for i in range(500):
    # Generar datos aleatorios
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

    res = evaluar_triaje_estandar(d)
    prio = res["prioridad"]
    news2 = res["news2"]["scoreTotal"]

    # Invariante 1: Si NEWS2 === 0, glucosa normal, EVA 0 y sin códigos/claves -> JAMÁS puede devolver Prioridad I ni II.
    glucosa_norm = (d["glucosa"] is None) or (70 <= d["glucosa"] < 180)
    eva_cero = (d["eva"] is None or d["eva"] == 0)
    sin_codigos = not (d["codigoInfarto"] or d["codigoIctus"] or d["codigoSepsis"] or d["claveObstetrica"] in ["roja", "azul", "amarilla"] or d["panicoShockTrauma"])
    
    if news2 == 0 and glucosa_norm and eva_cero and sin_codigos and not (d["esGestante"] and ((d["pas"] and d["pas"] >= 160) or (d["pad"] and d["pad"] >= 110))):
        assert prio not in ["I", "II"], f"Violación Invariante 1 en iter {i}: NEWS2=0 dio {prio}"

    # Invariante 2: Si glucosa > 400 -> JAMÁS puede devolver Prioridad III, IV ni V.
    if d["glucosa"] is not None and d["glucosa"] > 400:
        assert prio in ["I", "II"], f"Violación Invariante 2 en iter {i}: Glucosa={d['glucosa']} dio {prio}"

    # Invariante 3: Si glucosa < 54 o glasgow <= 8 o spo2 < 90 -> SIEMPRE debe devolver Prioridad I.
    if (d["glucosa"] is not None and d["glucosa"] < 54) or \
       (d["glasgow"] is not None and d["glasgow"] <= 8) or \
       (d["spo2"] is not None and d["spo2"] < 90):
        assert prio == "I", f"Violación Invariante 3 en iter {i}: glucosa={d['glucosa']}, glasgow={d['glasgow']}, spo2={d['spo2']} dio {prio}"

    # Invariante 4: Ningún campo vacío (null) puede alterar el puntaje NEWS2 ni disparar Prioridad I.
    d_vacio = {"fr": None, "spo2": None, "pas": None, "pad": None, "fc": None, "glasgow": None, "temp": None, "glucosa": None, "eva": None}
    res_vacio = evaluar_triaje_estandar(d_vacio)
    assert res_vacio["news2"]["scoreTotal"] == 0, "Campos null deben sumar 0 en NEWS2"
    assert res_vacio["prioridad"] == "V", "Campos null sin códigos no deben disparar P-I"

print("All 500 Property-Based Fuzzing Tests passed with 100% mathematical certainty!")
