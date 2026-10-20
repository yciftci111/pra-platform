---
title: IHCKWANT
---

# IHCKWANT

IHCKWANT rekent voor één object de instandhoudingskosten en de prestaties door:
onderhoudskosten per jaar en over de looptijd, de storingsfrequentie, de kans op een
storingsvrije inzet en de niet-beschikbaarheid — ook per functie.

[Rekenblad downloaden (xlsx)](../downloads/IHCKWANT_Fiets_v4.xlsx){ .md-button .md-button--primary }
[Invulhandleiding (pdf)](../downloads/Invulhandleiding_IHCKWANT_Fiets.pdf){ .md-button }

## Opbouw

| Tabblad | Invullen? | Waarvoor |
|---|---|---|
| Managementrapportage | Nee | Zes kerncijfers en vier grafieken; rekent automatisch mee |
| Invoer | Ja — alles | Object, uurtarieven, functies, onderhoudsregels en de controle |
| PO / TAO / SAO | Nee | Werklijsten per onderhoudssoort; vullen zichzelf vanuit Invoer |
| Algemeen | Nee | Het rekenblad waar alle totalen worden berekend |
| Overzicht en Rapportdata | Nee | Resultaten en de rekenbladen achter de grafieken |

## In vijf stappen

1. **Object en gebruik** — aantallen, inzetten per jaar, dagen per inzet, looptijd.
2. **Uurtarieven** — het tarief per uitvoerende partij.
3. **Functies** — de prestaties waarop je rapporteert.
4. **Onderhoudsregels** — per regel één onderhoudsactie op één component, met
   frequentie, uren, kosten, storingsgegevens, tijden en voorraad.
5. **Controle** — blijf binnen het aantal beschikbare regels en bekijk de rapportage.

## Grenzen

- Twintig onderhoudsregels, waarvan maximaal elf periodiek, negen toestandsafhankelijk
  en dertien correctief.
- Tien functies.
- Op het tabblad PO zet je de kolommen *In TTO1?*, *In TTO2?* en *In MJO?* zelf; die
  formules kijken of de cel echt leeg is.

!!! tip "Decompositie en namen"

    Gebruik voor componenten de namen uit de [deltatabellen](../deltatabellen/index.md).
    De rapportage telt kosten per componentnaam bij elkaar op, dus consistente namen
    zijn het verschil tussen een kloppend en een misleidend overzicht.
