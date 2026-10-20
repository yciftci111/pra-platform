#!/usr/bin/env python3
"""Zet de deltatabel-Excels om naar CSV en genereert de bijbehorende sitepagina's.

De Excels in bron/deltatabellen zijn de bron van waarheid. Dit script draait bij
elke build (lokaal en in GitHub Actions) en schrijft:

    docs/data/deltatabellen/<tabel>/<werkblad>.csv   de gegevens, in git te volgen
    docs/data/manifest.json                          aantallen en mutaties per tabel
    docs/deltatabellen/<tabel>.md                    de gegenereerde pagina
    docs/deltatabellen/index.md                      het overzicht met tegels
    docs/includes/tegels.html                        de tegels voor de hoofdpagina
    docs/downloads/<bestand>.xlsx                    de Excels, om te downloaden

Niets in dit script is tabel-specifiek: zet een nieuwe <naam>_deltatabel.xlsx in
bron/deltatabellen, voeg de pagina toe aan de nav in mkdocs.yml en je bent klaar.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import re
import shutil
import unicodedata
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
BRON = ROOT / "bron" / "deltatabellen"
DOCS = ROOT / "docs"
DATA = DOCS / "data" / "deltatabellen"
PAGINAS = DOCS / "deltatabellen"
DOWNLOADS = DOCS / "downloads"
INCLUDES = DOCS / "includes"

# werkbladen die niet als tabel op de site komen
OVERSLAAN = {"toelichting", "delta tabel"}

# volgorde en presentatie van de tabellen op de site
VOLGORDE = [
    ("beheerobjecten", "Beheerobjecten", "domain",
     "Welke soorten objecten Rijkswaterstaat beheert, met de elementen die eronder vallen."),
    ("elementen", "Elementen", "account-tree",
     "De elementen waaruit beheerobjecten zijn opgebouwd, met hun koppelingen."),
    ("bouwdelen", "Bouwdelen", "widgets",
     "De bouwdelen onder de elementen, met materialen en werkdefinities."),
    ("gebreken", "Gebreken", "build",
     "De gebreken die op bouwdelen kunnen optreden, met materiaalsoorten."),
    ("gebreksoorten", "Gebreksoorten", "category",
     "De indeling van gebreken naar soort, met belang en toelichting."),
    ("gebrekgroepen", "Gebrekgroepen", "workspaces",
     "De groepering van gebreken, met de gebreken die eronder vallen."),
    ("elementgroepen", "Elementgroepen", "layers",
     "De groepering van elementen."),
]

MUTATIES = ["Toegevoegd", "Vervallen", "Gewijzigd", "Hernoemd"]
STATUS_NIEUW = {"nieuw", "toegevoegd"}
STATUS_WEG = {"vervallen"}
STATUS_WIJZ = {"gewijzigd", "hernoemd"}


def slug(tekst: str) -> str:
    t = unicodedata.normalize("NFKD", str(tekst)).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t or "blad"


def waarde(v) -> str:
    """Celwaarde naar tekst voor in de CSV."""
    if v is None:
        return ""
    if isinstance(v, str):
        if v.startswith("="):          # formule zonder bewaarde uitkomst
            return ""
        return v.replace("\r\n", "\n").strip()
    if isinstance(v, bool):
        return "ja" if v else "nee"
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def lees_blad(ws) -> tuple[list[str], list[list[str]]]:
    """Kop uit rij 1, daarna de gegevensrijen; lege rijen en lege kolommen eruit."""
    rijen = [[waarde(c) for c in rij] for rij in ws.iter_rows(values_only=True)]
    if not rijen:
        return [], []
    kop = rijen[0]
    houden = [i for i, k in enumerate(kop) if k.strip()]
    if not houden:
        return [], []
    kop = [kop[i] for i in houden]
    body = []
    for rij in rijen[1:]:
        cellen = [rij[i] if i < len(rij) else "" for i in houden]
        if any(c.strip() for c in cellen):
            body.append(cellen)
    return kop, body


def statuskolom(kop: list[str]) -> str | None:
    for k in kop:
        kl = k.lower()
        if kl == "mutatie" or kl == "status" or kl.endswith("status"):
            return k
    return None


def lees_toelichting(ws) -> dict:
    """Het blad Toelichting bevat label/waarde-paren in kolom B en C."""
    info: dict[str, str] = {}
    regels: list[str] = []
    for rij in ws.iter_rows(min_col=2, max_col=3, values_only=True):
        label, v = waarde(rij[0]), waarde(rij[1] if len(rij) > 1 else "")
        if label and v:
            info.setdefault(label, v)
        elif label:
            regels.append(label)
    info["_regels"] = regels
    return info


def tel_mutaties(kop: list[str], body: list[list[str]]) -> dict:
    kolom = statuskolom(kop)
    tellingen = {m: 0 for m in MUTATIES}
    if not kolom:
        return tellingen
    i = kop.index(kolom)
    for rij in body:
        v = rij[i].strip().lower()
        if v in STATUS_NIEUW:
            tellingen["Toegevoegd"] += 1
        elif v in STATUS_WEG:
            tellingen["Vervallen"] += 1
        elif v == "hernoemd":
            tellingen["Hernoemd"] += 1
        elif v in STATUS_WIJZ:
            tellingen["Gewijzigd"] += 1
    return tellingen


def schrijf_csv(pad: Path, kop: list[str], body: list[list[str]]) -> None:
    pad.parent.mkdir(parents=True, exist_ok=True)
    with pad.open("w", encoding="utf-8", newline="") as f:
        schrijver = csv.writer(f, lineterminator="\n")
        schrijver.writerow(kop)
        schrijver.writerows(body)


def verwerk(xlsx: Path) -> dict:
    naam = xlsx.stem.replace("_deltatabel", "")
    s = slug(naam)
    wb = openpyxl.load_workbook(xlsx, data_only=True)

    toelichting = {}
    if "Toelichting" in wb.sheetnames:
        toelichting = lees_toelichting(wb["Toelichting"])

    bladen = []
    hoofdblad = None
    for ws in wb.worksheets:
        if ws.title.lower() in OVERSLAAN:
            continue
        kop, body = lees_blad(ws)
        if not kop:
            continue
        bestand = DATA / s / f"{slug(ws.title)}.csv"
        schrijf_csv(bestand, kop, body)
        blad = {
            "titel": ws.title,
            "slug": slug(ws.title),
            "csv": f"{s}/{slug(ws.title)}.csv",
            "rijen": len(body),
            "kolommen": len(kop),
            "statuskolom": statuskolom(kop),
            "mutaties": tel_mutaties(kop, body),
        }
        bladen.append(blad)
        if slug(ws.title) == s and hoofdblad is None:
            hoofdblad = blad
    wb.close()

    if hoofdblad is None and bladen:
        hoofdblad = bladen[0]

    # mutaties op objectniveau komen uit de statuskolom van het hoofdblad;
    # het blad Wijzigingen telt ook mutaties in koppelingen en is daarom apart
    wijzigingen = next((b for b in bladen if b["slug"] == "wijzigingen"), None)
    mutaties = hoofdblad["mutaties"]

    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    shutil.copy(xlsx, DOWNLOADS / xlsx.name)

    return {
        "slug": s,
        "naam": naam,
        "bestand": xlsx.name,
        "grootte_kb": round(xlsx.stat().st_size / 1024),
        "bijgewerkt": dt.datetime.fromtimestamp(xlsx.stat().st_mtime).strftime("%d-%m-%Y"),
        "hoofdblad": hoofdblad,
        "bladen": bladen,
        "mutaties": mutaties,
        "wijzigingen_totaal": wijzigingen["rijen"] if wijzigingen else 0,
        "toelichting": toelichting,
    }


def kerncijfers_html(tabel: dict) -> str:
    m = tabel["mutaties"]
    delen = [f'<span class="cijfer"><b>{tabel["hoofdblad"]["rijen"]}</b> regels</span>']
    if m["Toegevoegd"]:
        delen.append(f'<span class="cijfer nieuw"><b>{m["Toegevoegd"]}</b> nieuw</span>')
    if m["Vervallen"]:
        delen.append(f'<span class="cijfer weg"><b>{m["Vervallen"]}</b> vervallen</span>')
    gewijzigd = m["Gewijzigd"] + m["Hernoemd"]
    if gewijzigd:
        delen.append(f'<span class="cijfer wijz"><b>{gewijzigd}</b> gewijzigd</span>')
    if tabel["wijzigingen_totaal"]:
        delen.append(
            f'<span class="cijfer"><b>{tabel["wijzigingen_totaal"]}</b> wijzigingen vastgelegd</span>'
        )
    return '<p class="kerncijfers">' + "".join(delen) + "</p>"


def pagina(tabel: dict, omschrijving: str) -> str:
    t = tabel
    titel = t["naam"]
    intro = t["toelichting"].get("_regels", [])
    ondertitel = omschrijving
    for regel in intro:
        if regel.lower().startswith("overzicht van"):
            ondertitel = regel
            break

    regels = [
        "---",
        f"title: {titel}",
        "hide:",
        "  - toc",
        "---",
        "",
        "<!-- Gegenereerd door scripts/build_data.py. Wijzig de Excel, niet deze pagina. -->",
        "",
        f"# {titel}",
        "",
        ondertitel,
        "",
        kerncijfers_html(t),
        "",
        # markdown-links rekent MkDocs vanaf het bronbestand: docs/deltatabellen/<pagina>.md
        f'[Excel downloaden ({t["grootte_kb"]} kB)](../downloads/{t["bestand"]})'
        "{ .md-button .md-button--primary }",
        "",
        "## Tabellen",
        "",
    ]

    for blad in t["bladen"]:
        regels.append(f'=== "{blad["titel"]} ({blad["rijen"]})"')
        regels.append("")
        status = blad["statuskolom"] or ""
        regels.append(
            f'    <div class="deltatabel" data-src="../../data/deltatabellen/{blad["csv"]}"'
            f' data-status="{status}" data-naam="{blad["titel"]}"></div>'
        )
        regels.append("")

    velden = [(k, v) for k, v in t["toelichting"].items() if not k.startswith("_")]
    if velden:
        regels += ['??? info "Over deze tabel — bron, legenda en aantallen"', ""]
        regels += ["    | Veld | Waarde |", "    |---|---|"]
        for label, v in velden:
            regels.append(f'    | {label} | {v.replace("|", "/")} |')
        regels.append("")

    regels += [
        "",
        "!!! tip \"Zo lees je de tabel\"",
        "",
        "    Klik op een regel om alle velden te zien. Met de knoppen boven de tabel filter je",
        "    op mutatie; met het zoekveld zoek je in alle kolommen tegelijk. Via **CSV** haal je",
        "    het getoonde werkblad als bestand op.",
    ]

    return "\n".join(regels) + "\n"


def tegel(href: str, icoon: str, titel: str, tekst: str, voet: str = "") -> str:
    voet_html = f'<span class="tegel-voet">{voet}</span>' if voet else ""
    return (
        f'<a class="tegel" href="{href}">'
        f'<span class="tegel-icoon">{icoon}</span>'
        f'<span class="tegel-titel">{titel}</span>'
        f'<span class="tegel-tekst">{tekst}</span>'
        f"{voet_html}</a>"
    )


ICONEN = {
    "beheerobjecten": "◻",
    "elementen": "◧",
    "bouwdelen": "▣",
    "gebreken": "⚠",
    "gebreksoorten": "⬡",
    "gebrekgroepen": "⬢",
    "elementgroepen": "▦",
}


def schrijf_overzicht(tabellen: dict) -> None:
    kaarten = []
    for s, titel, _icoon, tekst in VOLGORDE:
        t = tabellen.get(s)
        if not t:
            continue
        m = t["mutaties"]
        onderdelen = [f'{t["hoofdblad"]["rijen"]} regels']
        if m["Toegevoegd"]:
            onderdelen.append(f'{m["Toegevoegd"]} nieuw')
        if m["Vervallen"]:
            onderdelen.append(f'{m["Vervallen"]} vervallen')
        if m["Gewijzigd"] + m["Hernoemd"]:
            onderdelen.append(f'{m["Gewijzigd"] + m["Hernoemd"]} gewijzigd')
        if t["wijzigingen_totaal"]:
            onderdelen.append(f'{t["wijzigingen_totaal"]} wijzigingen')
        voet = " · ".join(onderdelen)
        kaarten.append(tegel(f"{s}/", ICONEN.get(s, "▦"), titel, tekst, voet))

    totaal_regels = sum(t["hoofdblad"]["rijen"] for t in tabellen.values())
    totaal_mut = sum(t["wijzigingen_totaal"] for t in tabellen.values())

    inhoud = f"""---
title: Deltatabellen
---

<!-- Gegenereerd door scripts/build_data.py. -->

# Deltatabellen

De deltatabellen laten per onderdeel zien wat er is veranderd ten opzichte van de
vorige versie: wat nieuw is, wat vervallen is en wat is gewijzigd. De Excels zijn
de bron; de tabellen hieronder zijn er rechtstreeks uit gegenereerd.

<p class="kerncijfers"><span class="cijfer"><b>{len(tabellen)}</b> tabellen</span>
<span class="cijfer"><b>{totaal_regels}</b> regels</span>
<span class="cijfer wijz"><b>{totaal_mut}</b> mutaties</span></p>

<div class="tegels">
{chr(10).join(kaarten)}
</div>
"""
    (PAGINAS / "index.md").write_text(inhoud, encoding="utf-8")


def schrijf_tegels(tabellen: dict) -> None:
    totaal_regels = sum(t["hoofdblad"]["rijen"] for t in tabellen.values())
    totaal_mut = sum(t["wijzigingen_totaal"] for t in tabellen.values())

    kaarten = [
        tegel(
            "decompositie/", "⌗", "Decompositie maken",
            "Kies een beheerobject en de elementen, bouwdelen en gebreken komen automatisch "
            "mee. Beoordeel kans en gevolg en exporteer naar Excel.",
            "Werkblad · risicomatrix · IHCKWANT",
        ),
        tegel(
            "deltatabellen/", "▣", "Deltatabellen",
            "Beheerobjecten, elementen, bouwdelen en gebreken, met alle wijzigingen "
            "ten opzichte van de vorige versie.",
            f"{len(tabellen)} tabellen · {totaal_regels} regels · {totaal_mut} mutaties",
        ),
        tegel(
            "leidraad/", "◎", "Leidraad PRA",
            "Prestatiegestuurde risicoanalyse: van beleidsdoel naar RAMSSHE€P-eis, "
            "risicomatrix en instandhoudingsplan.",
            "Handreiking Rijkswaterstaat, 2018",
        ),
        tegel(
            "rekentools/", "∑", "Rekentools",
            "Rekenbladen voor instandhoudingskosten en prestaties, met invulhandleiding "
            "en managementrapportage.",
            "IHCKWANT",
        ),
        tegel(
            "begrippen/", "¶", "Begrippen",
            "De termen uit de handreiking en de tabellen, in gewone taal uitgelegd.",
            "Begrippenlijst",
        ),
        tegel(
            "downloads/", "↓", "Downloads",
            "Alle bronbestanden bij elkaar: Excels, de handreiking en de rekentools.",
            "Bronbestanden",
        ),
    ]
    INCLUDES.mkdir(parents=True, exist_ok=True)
    (INCLUDES / "tegels.html").write_text(
        '<div class="tegels">\n' + "\n".join(kaarten) + "\n</div>\n", encoding="utf-8"
    )


def kopieer_overige_bronnen() -> None:
    """Handreiking en rekentools meenemen naar de downloadmap van de site."""
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    for map_ in ("leidraad", "rekentools"):
        bron = ROOT / "bron" / map_
        if not bron.exists():
            continue
        for bestand in sorted(bron.iterdir()):
            if bestand.is_file() and not bestand.name.startswith("~$"):
                shutil.copy(bestand, DOWNLOADS / bestand.name)


def main() -> None:
    PAGINAS.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    kopieer_overige_bronnen()

    tabellen: dict[str, dict] = {}
    for xlsx in sorted(BRON.glob("*_deltatabel.xlsx")):
        t = verwerk(xlsx)
        tabellen[t["slug"]] = t
        omschrijving = next((o for s, _n, _i, o in VOLGORDE if s == t["slug"]), "")
        (PAGINAS / f"{t['slug']}.md").write_text(pagina(t, omschrijving), encoding="utf-8")
        print(f"  {t['naam']:<16} {t['hoofdblad']['rijen']:>5} regels, "
              f"{len(t['bladen'])} werkbladen, {sum(t['mutaties'].values())} mutaties")

    schrijf_overzicht(tabellen)
    schrijf_tegels(tabellen)

    manifest = {
        "gegenereerd": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "tabellen": [tabellen[s] for s, *_ in VOLGORDE if s in tabellen],
    }
    (DOCS / "data" / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"klaar: {len(tabellen)} tabellen verwerkt")


if __name__ == "__main__":
    main()
