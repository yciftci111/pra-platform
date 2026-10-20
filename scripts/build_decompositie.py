#!/usr/bin/env python3
"""Bouwt één gegevensbestand voor de decompositietool.

Uit de CSV's van de deltatabellen wordt de hele keten samengevoegd:

    beheerobject → element → bouwdeel → materiaal → gebrek → gebreksoort

De elementen worden gegroepeerd op hun lead werkgroep; de deltatabellen bevatten
geen koppeling element → elementgroep (die kolom is in de bron leeg).

Resultaat: docs/data/decompositie.json
"""
from __future__ import annotations

import csv
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data" / "deltatabellen"
UIT = ROOT / "docs" / "data" / "decompositie.json"

WERKGROEPEN = {
    "CGR": "Civiel, groen en reiniging",
    "WB": "Waterbouw",
    "KW": "Kunstwerken",
    "E/W": "Elektrotechniek en werktuigbouw",
    "WN": "Wegen en netwerk",
    "DV": "Diensten en voorzieningen",
    "IA": "Industriële automatisering",
}


def lees(pad: Path) -> list[dict]:
    with pad.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def tekst(rij: dict, *namen: str) -> str:
    for n in namen:
        v = (rij.get(n) or "").strip()
        if v:
            return v
    return ""


def lijst(waarde: str) -> list[str]:
    return [d.strip() for d in (waarde or "").split(",") if d.strip()]


def voeg_toe(lijstje: list[dict], index: dict[str, int], item: dict) -> None:
    """Zet een item in de lijst; komt de naam al voor (een code die in de delta
    twee keer staat, vervallen én nieuw), houd dan de actuele regel aan en vul
    lege velden aan uit de andere."""
    naam = item["n"]
    if naam not in index:
        index[naam] = len(lijstje)
        lijstje.append(item)
        return
    bestaand = lijstje[index[naam]]
    oud, nieuw = (bestaand, item) if bestaand.get("st") == "Vervallen" else (item, bestaand)
    for sleutel, waarde in oud.items():
        if waarde and not nieuw.get(sleutel):
            nieuw[sleutel] = waarde
    lijstje[index[naam]] = nieuw


def main() -> None:
    # ---------------------------------------------------------------- bronnen
    bo_rijen = lees(DATA / "beheerobjecten" / "beheerobjecten.csv")
    bo_el = lees(DATA / "beheerobjecten" / "elementen.csv")
    el_rijen = lees(DATA / "elementen" / "elementen.csv")
    el_bd = lees(DATA / "elementen" / "bouwdelen.csv")
    bd_rijen = lees(DATA / "bouwdelen" / "bouwdelen.csv")
    bd_mat = lees(DATA / "bouwdelen" / "materialen.csv")
    gb_rijen = lees(DATA / "gebreken" / "gebreken.csv")
    gb_mat = lees(DATA / "gebreken" / "materiaalsoorten.csv")
    gs_rijen = lees(DATA / "gebreksoorten" / "gebreksoorten.csv")

    # ---------------------------------------------------------------- gebreken
    gebreken = []
    gebrek_index: dict[str, int] = {}
    for r in gb_rijen:
        naam = tekst(r, "Gebrek")
        if not naam:
            continue
        voeg_toe(gebreken, gebrek_index, {
            "c": tekst(r, "Code"),
            "n": naam,
            "st": tekst(r, "Gebrekstatus"),
            "srt": tekst(r, "Gebreksoort"),
            "grp": tekst(r, "Gebrekgroep"),
            "eh": tekst(r, "Eenheid"),
            "typ": tekst(r, "Type"),
            "oms": tekst(r, "Omschrijving"),
            "wd": tekst(r, "Werkdefinitie"),
            "tl": tekst(r, "Toelichting"),
        })

    # materiaalsoort -> gebreken
    mat_gebrek: dict[str, set[int]] = defaultdict(set)
    for r in gb_mat:
        mat = tekst(r, "Materiaalsoort (nieuw)")
        naam = tekst(r, "Gebrek")
        if mat and naam in gebrek_index:
            mat_gebrek[mat].add(gebrek_index[naam])

    # ---------------------------------------------------------------- gebreksoorten
    gebreksoorten = [{
        "a": tekst(r, "Afkorting"),
        "n": tekst(r, "Gebreksoort"),
        "belang": tekst(r, "Belang"),
        "tl": tekst(r, "Toelichting"),
    } for r in gs_rijen if tekst(r, "Gebreksoort")]

    # ---------------------------------------------------------------- bouwdelen
    bouwdelen = []
    bouwdeel_index: dict[str, int] = {}
    for r in bd_rijen:
        naam = tekst(r, "Bouwdeel")
        if not naam:
            continue
        voeg_toe(bouwdelen, bouwdeel_index, {
            "c": tekst(r, "Code"),
            "n": naam,
            "st": tekst(r, "Bouwdeelstatus"),
            "wd": tekst(r, "Werkdefinitie"),
            "tl": tekst(r, "Toelichting"),
            "oms": tekst(r, "Omschrijving"),
            "mat": lijst(tekst(r, "Materialen")),
            "gb": [],
        })

    # materialen per bouwdeel aanvullen uit het koppelblad
    extra_mat: dict[str, set[str]] = defaultdict(set)
    for r in bd_mat:
        naam = tekst(r, "Bouwdeel")
        mat = tekst(r, "Materiaal (nieuw)")
        if naam in bouwdeel_index and mat:
            extra_mat[naam].add(mat)
    for naam, mats in extra_mat.items():
        b = bouwdelen[bouwdeel_index[naam]]
        b["mat"] = sorted(set(b["mat"]) | mats)

    # gebreken per bouwdeel, via de materiaalsoorten
    for b in bouwdelen:
        gevonden: set[int] = set()
        for mat in b["mat"]:
            gevonden |= mat_gebrek.get(mat, set())
        b["gb"] = sorted(gevonden)

    # ---------------------------------------------------------------- elementen
    elementen = []
    element_index: dict[str, int] = {}
    for r in el_rijen:
        naam = tekst(r, "Element")
        if not naam:
            continue
        voeg_toe(elementen, element_index, {
            "c": tekst(r, "Code"),
            "n": naam,
            "st": tekst(r, "Elementstatus"),
            "wg": tekst(r, "Lead werkgroep") or "Overig",
            "wgx": lijst(tekst(r, "Extra werkgroepen")),
            "vd": lijst(tekst(r, "Vakdisciplines")),
            "wd": tekst(r, "Werkdefinitie"),
            "tl": tekst(r, "Toelichting"),
            "oms": tekst(r, "Omschrijving"),
            "bd": [],
        })

    el_bouwdelen: dict[str, set[int]] = defaultdict(set)
    for r in el_bd:
        el = tekst(r, "Element")
        bd = tekst(r, "Bouwdeel (nieuw)")
        if el in element_index and bd in bouwdeel_index:
            el_bouwdelen[el].add(bouwdeel_index[bd])
    for naam, bds in el_bouwdelen.items():
        elementen[element_index[naam]]["bd"] = sorted(bds)

    # ---------------------------------------------------------------- beheerobjecten
    bo_elementen: dict[str, set[int]] = defaultdict(set)
    for r in bo_el:
        bo = tekst(r, "Beheerobject")
        el = tekst(r, "Element (nieuw)")
        if el in element_index:
            bo_elementen[bo].add(element_index[el])

    beheerobjecten = []
    for r in bo_rijen:
        naam = tekst(r, "Beheerobject")
        if not naam:
            continue
        beheerobjecten.append({
            "c": tekst(r, "Code"),
            "n": naam,
            "wd": tekst(r, "Werkdefinitie"),
            "tl": tekst(r, "Toelichting"),
            "syn": tekst(r, "Omschrijving / synoniemen"),
            "wg": lijst(tekst(r, "Werkgroep(en)")),
            "el": sorted(bo_elementen.get(naam, set())),
        })

    pakket = {
        "gegenereerd": dt.datetime.now().strftime("%Y-%m-%d"),
        "werkgroepen": WERKGROEPEN,
        "beheerobjecten": beheerobjecten,
        "elementen": elementen,
        "bouwdelen": bouwdelen,
        "gebreken": gebreken,
        "gebreksoorten": gebreksoorten,
    }
    UIT.parent.mkdir(parents=True, exist_ok=True)
    UIT.write_text(json.dumps(pakket, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    zonder_el = [b["n"] for b in beheerobjecten if not b["el"]]
    zonder_bd = sum(1 for e in elementen if not e["bd"])
    zonder_gb = sum(1 for b in bouwdelen if not b["gb"])
    print(f"decompositie.json: {UIT.stat().st_size // 1024} kB")
    print(f"  beheerobjecten {len(beheerobjecten)} (zonder elementen: {len(zonder_el)})")
    print(f"  elementen      {len(elementen)} (zonder bouwdelen: {zonder_bd})")
    print(f"  bouwdelen      {len(bouwdelen)} (zonder gebreken: {zonder_gb})")
    print(f"  gebreken       {len(gebreken)} · gebreksoorten {len(gebreksoorten)}")
    if zonder_el:
        print("  let op, geen elementen gekoppeld bij:", ", ".join(zonder_el[:6]))


if __name__ == "__main__":
    main()
