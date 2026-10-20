---
title: Decompositie
hide:
  - navigation
  - toc
---

# Decompositie maken

Kies een beheerobject: de elementen, bouwdelen en mogelijke gebreken komen automatisch mee.
Zet uit wat niet van toepassing is, kies per bouwdeel de realistische faalwijzen, geef kans
en gevolg, en exporteer het resultaat.

<div id="decompositie-app" class="dc-app">Gegevens laden…</div>

??? info "Hoe de tool is opgebouwd"

    **De keten** komt uit de deltatabellen: een beheerobject heeft elementen, een element
    heeft bouwdelen, en een bouwdeel heeft materialen. De gebreken horen bij die materialen —
    zo weet de tool welke faalwijzen bij een bouwdeel kunnen optreden.

    **Elementen en bouwdelen staan standaard aan**, want die horen bij het object. **Gebreken
    staan standaard uit**: welke faalwijzen realistisch zijn, is een keuze die je per bouwdeel
    maakt. Dat is stap 2 van de leidraad. Met de knop ⚠ kies je in één klik alle gebreken
    waarvan de gebreksoort als *ernstig* geldt.

    **De elementen zijn gegroepeerd op werkgroep** (CGR, WB, KW, E/W). De deltatabellen
    bevatten geen koppeling naar elementgroepen — die kolom is in de bron leeg.

    **Je werk wordt bewaard** in deze browser. Met *Opslaan* maak je er een bestand van dat je
    later met *Laden* weer inleest, bijvoorbeeld om het met een collega te delen.
