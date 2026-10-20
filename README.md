# PRA-kennisplatform

Website met de deltatabellen, de handreiking prestatiegestuurde risicoanalyse (PRA) en
de rekentools. De Excels in `bron/` zijn de bron van waarheid; de site wordt er bij elke
wijziging automatisch uit gebouwd en gepubliceerd op GitHub Pages.

## Wat staat waar

```
bron/            de bronbestanden — hier wijzig je
  deltatabellen/   de zeven delta-Excels
  leidraad/        de handreiking (pdf)
  rekentools/      IHCKWANT en de invulhandleiding
scripts/
  build_data.py          zet de Excels om naar CSV en genereert de tabelpagina's
  build_decompositie.py  voegt de hele keten samen tot docs/data/decompositie.json
docs/            de site
  index.md         hoofdpagina met de tegels
  decompositie.md  de decompositietool (de app zelf staat in assets/js/decompositie.js)
  leidraad/        de hoofdstukken van de handreiking
  rekentools/      uitleg bij de rekentools
  data/            de gegenereerde CSV's (staan in git, zodat je per versie de diff ziet)
  deltatabellen/   gegenereerde pagina's (niet met de hand bewerken)
mkdocs.yml       instellingen, menu en thema
.github/workflows/deploy.yml   bouwt en publiceert de site
```

## Online zetten

De site is al ingesteld voor **yciftci111/pra-platform**. Staat je repo straks onder een andere
naam, pas dan `site_url` en `repo_url` in `mkdocs.yml` aan.

### Route 1 — met GitHub Desktop (geen commando's nodig)

1. Installeer **GitHub Desktop** en log in met je GitHub-account.
2. *File → New repository*. Naam: `pra-platform`. Kies een map op je computer, laat de rest leeg
   en klik op *Create repository*.
3. Open die map (*Repository → Show in Explorer*) en kopieer de **inhoud** van deze zip
   erin: de mappen `bron`, `docs`, `scripts`, `.github` en de losse bestanden
   `mkdocs.yml`, `requirements.txt`, `README.md`, `.gitignore`.
4. Terug in GitHub Desktop: typ links onderin een omschrijving (bijvoorbeeld
   "eerste versie") en klik op *Commit to main*.
5. Klik rechtsboven op *Publish repository*. **Haal het vinkje bij "Keep this code private"
   weg** en publiceer.
6. Ga op github.com naar de repo → *Settings* → *Pages* → zet **Source** op
   **GitHub Actions**.

Kijk daarna bij *Actions* of de workflow groen wordt (ongeveer een minuut). De site staat
dan op `https://yciftci111.github.io/pra-platform/`.

### Route 2 — via de website

1. Maak op github.com een nieuwe **publieke** repository `pra-platform`, zonder README.
2. Klik op *uploading an existing file* en sleep de inhoud van de zip in het venster.
   Let op: de map `.github` moet mee — die bevat de workflow die de site bouwt. Ziet
   je verkenner die map niet, zet dan "verborgen bestanden tonen" aan.
3. Klik onderaan op *Commit changes*.
4. *Settings* → *Pages* → **Source** op **GitHub Actions**.

### Route 3 — met git op de opdrachtregel

```bash
git init
git add .
git commit -m "Eerste versie van het PRA-kennisplatform"
git branch -M main
git remote add origin https://github.com/yciftci111/pra-platform.git
git push -u origin main
```

Daarna ook hier: *Settings* → *Pages* → **Source** op **GitHub Actions**.

### Werkt het niet?

| Wat je ziet | Wat eraan is |
|---|---|
| Geen tabblad *Actions* of geen workflow | De map `.github/workflows` is niet meegekomen bij het uploaden. |
| Workflow rood bij "Site bouwen" | Meestal een ontbrekend bestand in `bron/`; de foutmelding noemt het pad. |
| Pagina 404 na een groene workflow | *Settings → Pages*: staat **Source** echt op *GitHub Actions*? |
| Tabellen leeg, rest werkt | De map `docs/data` is niet meegeüpload. |

## Lokaal bekijken

```bash
pip install -r requirements.txt
python scripts/build_data.py          # Excels -> CSV + tabelpagina's
python scripts/build_decompositie.py  # CSV -> decompositie.json voor de tool
mkdocs serve                          # http://127.0.0.1:8000
```

`mkdocs serve` ververst de pagina zodra je iets opslaat. Wijzig je een Excel, draai dan
eerst `build_data.py` opnieuw.

## Dagelijks gebruik

**Een deltatabel bijwerken** — vervang het Excel-bestand in `bron/deltatabellen/`,
commit en push. De aantallen, de tabellen en de tegels gaan automatisch mee.

**Een nieuwe deltatabel toevoegen** — zet `<Naam>_deltatabel.xlsx` in
`bron/deltatabellen/`, voeg de tabel toe aan `VOLGORDE` in `scripts/build_data.py`
(slug, titel, icoon, omschrijving) en zet de pagina in de `nav` van `mkdocs.yml`.

**Tekst aanpassen** — de pagina's onder `docs/leidraad/`, `docs/rekentools/`,
`docs/begrippen.md` en `docs/index.md` zijn gewone markdown; die bewerk je direct.
De pagina's onder `docs/deltatabellen/` zijn gegenereerd: pas de Excel of het script aan.

## De decompositietool

De pagina **Decompositie** laat je een beheerobject kiezen; de elementen, bouwdelen en
mogelijke gebreken komen automatisch mee. De keten komt uit de deltatabellen:

```
beheerobject → element → bouwdeel → materiaal → gebrek → gebreksoort
```

`scripts/build_decompositie.py` bouwt daarvoor één bestand (`docs/data/decompositie.json`).
Draai dat script opnieuw zodra de Excels zijn bijgewerkt. De tool zelf is gewone JavaScript
in `docs/assets/js/decompositie.js`; de Excel-export wordt gemaakt door
`docs/assets/js/xlsx-mini.js`, zonder externe bibliotheken.

## Hoe het script de Excels leest

- Elk werkblad met een kop in rij 1 wordt een CSV; de bladen `Toelichting` en
  `Delta tabel` worden overgeslagen.
- De eerste kolom met een naam op `...status` of `Mutatie` wordt de mutatiekolom:
  daarop kun je op de site filteren en daar komen de kleuren vandaan.
- Het blad `Wijzigingen` levert het aantal vastgelegde wijzigingen.
- Het blad `Toelichting` vult het blok "Over deze tabel".

> **Let op bij formules.** Het script leest de uitkomsten die Excel heeft opgeslagen.
Bevat een bestand formules die nog nooit zijn doorgerekend, open het dan één keer in
Excel en sla het op; anders blijven die kolommen leeg op de site.

## Licentie en bronvermelding

Het bronmateriaal komt van Rijkswaterstaat. Deze site is een hulpmiddel voor intern
gebruik en geen formele uitgave; raadpleeg bij twijfel het originele document.
