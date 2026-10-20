/* Decompositietool: beheerobject -> werkgroep -> element -> bouwdeel -> gebrek,
   met automatische cascade, FMECA-scores, risicomatrix en export.
   Geen externe bibliotheken; xlsx-mini.js levert de Excel-export. */
(function () {
  "use strict";

  var BRON = "../data/decompositie.json";
  var OPSLAG = "pra-decompositie-v1";
  var DB = null;
  var soortIndex = {};
  var app = null;

  var KANS = ["", "zeer klein", "klein", "gemiddeld", "groot", "zeer groot"];
  var GEVOLG = ["", "verwaarloosbaar", "gering", "aanzienlijk", "ernstig", "zeer ernstig"];

  var staat = {
    naam: "Nieuwe decompositie",
    objecten: [],
    volgnummer: 1,
    actief: null,          // {soort, objId, el, bd, gb}
    tab: "info",
    zoek: "",
    toon: "alle"           // alle | aan | uit
  };

  /* ------------------------------------------------------------------ hulp */
  function el(tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst !== undefined && tekst !== null) e.textContent = tekst;
    return e;
  }

  function knop(label, klasse, actie, titel) {
    var b = el("button", "dc-knop " + (klasse || ""), label);
    b.type = "button";
    if (titel) b.title = titel;
    b.addEventListener("click", actie);
    return b;
  }

  function sleutelB(e, b) { return e + "|" + b; }
  function sleutelG(e, b, g) { return e + "|" + b + "|" + g; }

  function objectVan(id) {
    return staat.objecten.filter(function (o) { return o.id === id; })[0];
  }

  function elementAan(o, e) { return !o.uit.e[e]; }
  function bouwdeelAan(o, e, b) { return elementAan(o, e) && !o.uit.b[sleutelB(e, b)]; }
  function gebrekAan(o, e, b, g) { return bouwdeelAan(o, e, b) && !!o.aan.g[sleutelG(e, b, g)]; }

  // Welke gebreken bij een bouwdeel kunnen optreden volgt uit de materialen; welke
  // daarvan je meeneemt is een keuze (de FMEA-stap). Daarom staan gebreken standaard
  // uit en houden we de gekozen gebreken bij, niet de uitgezette.
  function belangVan(g) {
    var soort = DB.gebreken[g].srt;
    var s = soortIndex[soort];
    return s ? s.belang : "";
  }

  function bouwdelenVan(e) { return DB.elementen[e].bd || []; }
  function gebrekenVan(b) { return DB.bouwdelen[b].gb || []; }

  function werkgroepVan(e) { return DB.elementen[e].wg || "Overig"; }

  function groepen(o) {
    var map = {};
    DB.beheerobjecten[o.bo].el.forEach(function (e) {
      var w = werkgroepVan(e);
      (map[w] = map[w] || []).push(e);
    });
    return Object.keys(map).sort().map(function (w) {
      return { naam: w, omschrijving: DB.werkgroepen[w] || w, elementen: map[w] };
    });
  }

  /* --------------------------------------------------------------- tellingen */
  function tel(o) {
    var t = { e: 0, eT: 0, b: 0, bT: 0, g: 0, gT: 0, uniek: {} };
    DB.beheerobjecten[o.bo].el.forEach(function (e) {
      t.eT++;
      var eAan = elementAan(o, e);
      if (eAan) t.e++;
      bouwdelenVan(e).forEach(function (b) {
        t.bT++;
        var bAan = eAan && bouwdeelAan(o, e, b);
        if (bAan) t.b++;
        gebrekenVan(b).forEach(function (g) {
          t.gT++;
          if (bAan && gebrekAan(o, e, b, g)) {
            t.g++;
            t.uniek[g] = 1;
          }
        });
      });
    });
    t.unieke = Object.keys(t.uniek).length;
    return t;
  }

  function telElement(o, e) {
    var b = 0, bT = 0, g = 0, gT = 0;
    bouwdelenVan(e).forEach(function (bd) {
      bT++;
      var aan = bouwdeelAan(o, e, bd);
      if (aan) b++;
      gebrekenVan(bd).forEach(function (gb) {
        gT++;
        if (aan && gebrekAan(o, e, bd, gb)) g++;
      });
    });
    return { b: b, bT: bT, g: g, gT: gT };
  }

  function telBouwdeel(o, e, bd) {
    var g = 0, gT = 0;
    gebrekenVan(bd).forEach(function (gb) {
      gT++;
      if (gebrekAan(o, e, bd, gb)) g++;
    });
    return { g: g, gT: gT };
  }

  /* ------------------------------------------------------------- schakelen */
  function zetElement(o, e, aan) {
    if (aan) delete o.uit.e[e]; else o.uit.e[e] = 1;
  }

  function zetBouwdeel(o, e, b, aan) {
    if (aan) {
      delete o.uit.b[sleutelB(e, b)];
      delete o.uit.e[e];                      // bovenliggend element weer aan
    } else {
      o.uit.b[sleutelB(e, b)] = 1;
    }
  }

  function zetGebrek(o, e, b, g, aan) {
    if (aan) {
      o.aan.g[sleutelG(e, b, g)] = 1;
      delete o.uit.b[sleutelB(e, b)];
      delete o.uit.e[e];
    } else {
      delete o.aan.g[sleutelG(e, b, g)];
      delete o.fmeca[sleutelG(e, b, g)];
    }
  }

  function kiesGebreken(o, e, b, modus) {
    gebrekenVan(b).forEach(function (g) {
      var sleutel = sleutelG(e, b, g);
      if (modus === "geen") {
        delete o.aan.g[sleutel];
        delete o.fmeca[sleutel];
      } else if (modus === "alle" || belangVan(g) === "ernstig") {
        o.aan.g[sleutel] = 1;
      }
    });
    if (modus !== "geen") {
      delete o.uit.b[sleutelB(e, b)];
      delete o.uit.e[e];
    }
  }

  function zetGroep(o, groep, aan) {
    groep.elementen.forEach(function (e) {
      zetElement(o, e, aan);
      if (aan) {
        bouwdelenVan(e).forEach(function (b) { delete o.uit.b[sleutelB(e, b)]; });
      }
    });
  }

  function allesVanObject(o, aan) {
    if (aan) {
      o.uit = { e: {}, b: {} };
    } else {
      DB.beheerobjecten[o.bo].el.forEach(function (e) { o.uit.e[e] = 1; });
    }
  }

  /* ----------------------------------------------------------- object maken */
  function voegObjectToe(boIdx) {
    var bo = DB.beheerobjecten[boIdx];
    var o = {
      id: staat.volgnummer++,
      bo: boIdx,
      naam: bo.n,
      code: bo.c,
      maximo: "",
      notitie: "",
      uit: { e: {}, b: {} },
      aan: { g: {} },
      fmeca: {},
      open: {}
    };
    staat.objecten.push(o);
    staat.actief = { soort: "object", objId: o.id };
    bewaar();
    tekenAlles();
  }

  /* --------------------------------------------------------------- opslaan */
  function bewaar() {
    try {
      localStorage.setItem(OPSLAG, JSON.stringify(exportStaat()));
    } catch (e) { /* privévenster of vol: stilletjes overslaan */ }
  }

  function exportStaat() {
    return {
      versie: 1,
      naam: staat.naam,
      volgnummer: staat.volgnummer,
      objecten: staat.objecten.map(function (o) {
        return {
          id: o.id, bo: o.bo, naam: o.naam, code: o.code, maximo: o.maximo,
          notitie: o.notitie, uit: o.uit, aan: o.aan, fmeca: o.fmeca
        };
      })
    };
  }

  function laadStaat(data) {
    if (!data || !data.objecten) return false;
    staat.naam = data.naam || "Decompositie";
    staat.volgnummer = data.volgnummer || (data.objecten.length + 1);
    staat.objecten = data.objecten.map(function (o) {
      return {
        id: o.id, bo: o.bo, naam: o.naam, code: o.code, maximo: o.maximo || "",
        notitie: o.notitie || "", uit: o.uit || { e: {}, b: {} },
        aan: o.aan || { g: {} }, fmeca: o.fmeca || {}, open: {}
      };
    });
    staat.actief = staat.objecten.length ? { soort: "object", objId: staat.objecten[0].id } : null;
    return true;
  }

  function herstelUitOpslag() {
    try {
      var ruw = localStorage.getItem(OPSLAG);
      if (ruw) laadStaat(JSON.parse(ruw));
    } catch (e) { /* niets */ }
  }

  function downloaden(blob, naam) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = naam;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function bestandsnaam(achtervoegsel) {
    var basis = (staat.naam || "decompositie").replace(/[^\wÀ-ÿ -]+/g, "").trim() || "decompositie";
    return basis + " - " + achtervoegsel;
  }

  /* ------------------------------------------------------------ exporteren */
  function regels() {
    var uit = [];
    staat.objecten.forEach(function (o) {
      var bo = DB.beheerobjecten[o.bo];
      DB.beheerobjecten[o.bo].el.forEach(function (e) {
        if (!elementAan(o, e)) return;
        var E = DB.elementen[e];
        bouwdelenVan(e).forEach(function (b) {
          if (!bouwdeelAan(o, e, b)) return;
          var B = DB.bouwdelen[b];
          var gebreken = gebrekenVan(b).filter(function (g) { return gebrekAan(o, e, b, g); });
          if (!gebreken.length) {
            uit.push({ o: o, bo: bo, E: E, B: B, G: null, score: null });
            return;
          }
          gebreken.forEach(function (g) {
            uit.push({
              o: o, bo: bo, E: E, B: B, G: DB.gebreken[g],
              score: o.fmeca[sleutelG(e, b, g)] || null
            });
          });
        });
      });
    });
    return uit;
  }

  function exportExcel() {
    var r = regels();
    if (!r.length) { melding("Er is nog niets geselecteerd om te exporteren."); return; }

    var decompositie = [[
      "Object", "Beheerobject", "Code", "Maximo", "Werkgroep", "Element", "Elementcode",
      "Bouwdeel", "Bouwdeelcode", "Materialen", "Gebrek", "Gebrekcode", "Gebreksoort",
      "Gebrekgroep", "Eenheid", "Type", "Kans", "Gevolg", "Risico", "Risicoklasse", "Maatregel"
    ]];
    r.forEach(function (x) {
      var k = x.score && x.score.k ? x.score.k : "";
      var g = x.score && x.score.g ? x.score.g : "";
      var risico = k && g ? k * g : "";
      decompositie.push([
        x.o.naam, x.bo.n, x.bo.c, x.o.maximo, x.E.wg, x.E.n, x.E.c,
        x.B.n, x.B.c, (x.B.mat || []).join(", "),
        x.G ? x.G.n : "", x.G ? x.G.c : "", x.G ? x.G.srt : "", x.G ? x.G.grp : "",
        x.G ? x.G.eh : "", x.G ? x.G.typ : "",
        k, g, risico, risico ? klasseNaam(risico) : "",
        x.score && x.score.m ? x.score.m : ""
      ]);
    });

    var objecten = [["Object", "Beheerobject", "Code", "Maximo", "Elementen gekozen",
      "Elementen totaal", "Bouwdelen gekozen", "Bouwdelen totaal", "Gebreken gekozen",
      "Unieke gebreken", "Gebreken mogelijk", "Beoordeeld", "Notitie"]];
    staat.objecten.forEach(function (o) {
      var t = tel(o);
      objecten.push([o.naam, DB.beheerobjecten[o.bo].n, DB.beheerobjecten[o.bo].c, o.maximo,
        t.e, t.eT, t.b, t.bT, t.g, t.unieke, t.gT,
        Object.keys(o.fmeca).length, o.notitie]);
    });

    var matrix = [["", "Gevolg 1", "Gevolg 2", "Gevolg 3", "Gevolg 4", "Gevolg 5"]];
    var cel = matrixTelling();
    for (var k = 5; k >= 1; k--) {
      var rij = ["Kans " + k];
      for (var g2 = 1; g2 <= 5; g2++) rij.push(cel[k + "-" + g2] ? cel[k + "-" + g2].length : 0);
      matrix.push(rij);
    }

    downloaden(window.maakXlsx([
      { naam: "Decompositie", rijen: decompositie },
      { naam: "Objecten", rijen: objecten },
      { naam: "Risicomatrix", rijen: matrix }
    ]), bestandsnaam("decompositie.xlsx"));
  }

  function exportIhckwant() {
    var r = regels().filter(function (x) { return x.G; });
    if (!r.length) { melding("Er zijn nog geen gebreken geselecteerd."); return; }
    // één regel per bouwdeel + gebrek, in de kolomvolgorde van het invoerblad
    var kop = ["Component", "Aantal", "Soort onderhoud", "Omschrijving", "Frequentie", "Eenheid",
      "Gebrek", "Gebreksoort", "Risico", "Opmerking"];
    var rijen = [kop];
    var gezien = {};
    r.forEach(function (x) {
      var sleutel = x.B.n + "|" + x.G.n;
      if (gezien[sleutel]) return;
      gezien[sleutel] = 1;
      var risico = x.score && x.score.k && x.score.g ? x.score.k * x.score.g : "";
      rijen.push([x.B.n, 1, "", x.G.n + " verhelpen", "", "j", x.G.n, x.G.srt, risico,
        x.o.naam + " · " + x.E.n]);
    });
    var csv = rijen.map(function (rij) {
      return rij.map(function (v) {
        var s = String(v === null || v === undefined ? "" : v);
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(";");
    }).join("\r\n");
    downloaden(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
      bestandsnaam("ihckwant-regels.csv"));
  }

  function exportJson() {
    downloaden(new Blob([JSON.stringify(exportStaat(), null, 2)],
      { type: "application/json" }), bestandsnaam("opslag.json"));
  }

  function importJson(bestand) {
    var lezer = new FileReader();
    lezer.onload = function () {
      try {
        if (laadStaat(JSON.parse(lezer.result))) {
          bewaar();
          tekenAlles();
          melding("Decompositie geladen.");
        } else {
          melding("Dit bestand bevat geen decompositie.");
        }
      } catch (e) {
        melding("Het bestand kon niet worden gelezen.");
      }
    };
    lezer.readAsText(bestand);
  }

  /* -------------------------------------------------------------- risico's */
  function klasseNaam(risico) {
    if (risico >= 10) return "Hoog";
    if (risico >= 5) return "Matig";
    return "Laag";
  }

  function klasseKlasse(risico) {
    if (!risico) return "";
    return risico >= 10 ? "hoog" : risico >= 5 ? "matig" : "laag";
  }

  function matrixTelling() {
    var cel = {};
    staat.objecten.forEach(function (o) {
      Object.keys(o.fmeca).forEach(function (sleutel) {
        var s = o.fmeca[sleutel];
        if (!s || !s.k || !s.g) return;
        var delen = sleutel.split("|");
        var key = s.k + "-" + s.g;
        (cel[key] = cel[key] || []).push({
          o: o,
          e: +delen[0], b: +delen[1], g: +delen[2],
          score: s
        });
      });
    });
    return cel;
  }

  function melding(tekst) {
    var m = app.querySelector(".dc-melding");
    m.textContent = tekst;
    m.classList.add("zichtbaar");
    clearTimeout(m._t);
    m._t = setTimeout(function () { m.classList.remove("zichtbaar"); }, 3500);
  }

  /* ------------------------------------------------------------- onderdelen */
  function selectievakje(aan, half, actie) {
    var l = el("label", "dc-vink");
    var i = document.createElement("input");
    i.type = "checkbox";
    i.checked = aan;
    i.indeterminate = !!half && !aan;
    i.addEventListener("click", function (ev) {
      ev.stopPropagation();
      actie(i.checked);
    });
    l.appendChild(i);
    l.addEventListener("click", function (ev) { ev.stopPropagation(); });
    return l;
  }

  function snelKnop(titel, label, actie) {
    var b = el("button", "dc-snel", label);
    b.type = "button";
    b.title = titel;
    b.addEventListener("click", function (ev) { ev.stopPropagation(); actie(); });
    return b;
  }

  function telBadge(aan, totaal, label) {
    var s = el("span", "dc-badge" + (aan === 0 ? " leeg" : aan < totaal ? " deels" : ""));
    s.textContent = aan + "/" + totaal + " " + label;
    return s;
  }

  function statusMerk(status) {
    if (!status || status === "Bestaand" || status === "Ongewijzigd") return null;
    var k = status === "Nieuw" ? "nieuw" : status === "Vervallen" ? "weg" : "wijz";
    return el("span", "dc-merk " + k, status);
  }

  /* ---------------------------------------------------------- bibliotheek */
  function tekenBibliotheek() {
    var paneel = app.querySelector(".dc-bib-lijst");
    var zoek = (app.querySelector(".dc-bib-zoek").value || "").toLowerCase().trim();
    paneel.textContent = "";
    DB.beheerobjecten.forEach(function (bo, i) {
      if (zoek && (bo.n + " " + bo.c + " " + (bo.syn || "")).toLowerCase().indexOf(zoek) === -1) return;
      var rij = el("button", "dc-bib-rij");
      rij.type = "button";
      rij.appendChild(el("span", "dc-code", bo.c));
      rij.appendChild(el("span", "dc-bib-naam", bo.n));
      rij.appendChild(el("span", "dc-bib-aantal", bo.el.length + " el"));
      rij.title = bo.wd || bo.n;
      rij.addEventListener("click", function () { voegObjectToe(i); });
      paneel.appendChild(rij);
    });
  }

  /* ---------------------------------------------------------------- boom */
  function regelRij(klasse, inhoud) {
    return el("div", "dc-rij " + klasse);
  }

  function tekenBoom() {
    var houder = app.querySelector(".dc-boom");
    houder.textContent = "";

    if (!staat.objecten.length) {
      var leeg = el("div", "dc-leeg");
      leeg.appendChild(el("p", null, "Nog geen object gekozen."));
      leeg.appendChild(el("p", "zacht",
        "Kies links een beheerobject. De elementen, bouwdelen en gebreken komen dan automatisch mee; " +
        "daarna zet je uit wat niet van toepassing is."));
      houder.appendChild(leeg);
      return;
    }

    var zoek = staat.zoek.toLowerCase();

    staat.objecten.forEach(function (o) {
      var bo = DB.beheerobjecten[o.bo];
      var t = tel(o);
      var kaart = el("div", "dc-object" + (staat.actief && staat.actief.objId === o.id &&
        staat.actief.soort === "object" ? " actief" : ""));

      var kop = el("div", "dc-object-kop");
      kop.addEventListener("click", function () {
        staat.actief = { soort: "object", objId: o.id };
        tekenAlles();
      });
      var titel = el("div", "dc-object-titel");
      titel.appendChild(el("span", "dc-code groot", bo.c));
      var naamVeld = document.createElement("input");
      naamVeld.className = "dc-naam";
      naamVeld.value = o.naam;
      naamVeld.addEventListener("click", function (e) { e.stopPropagation(); });
      naamVeld.addEventListener("input", function () {
        o.naam = naamVeld.value;
        bewaar();
      });
      titel.appendChild(naamVeld);
      kop.appendChild(titel);

      var cijfers = el("div", "dc-object-cijfers");
      cijfers.appendChild(telBadge(t.e, t.eT, "elementen"));
      cijfers.appendChild(telBadge(t.b, t.bT, "bouwdelen"));
      cijfers.appendChild(el("span", "dc-badge" + (t.g ? " score" : " leeg"),
        t.g + " gebreken gekozen" + (t.unieke ? " (" + t.unieke + " uniek)" : "")));
      var beoordeeld = Object.keys(o.fmeca).length;
      if (beoordeeld) cijfers.appendChild(el("span", "dc-badge score", beoordeeld + " beoordeeld"));
      kop.appendChild(cijfers);

      var acties = el("div", "dc-object-acties");
      acties.appendChild(knop("Alles aan", "", function (e) {
        e.stopPropagation(); allesVanObject(o, true); bewaar(); tekenAlles();
      }));
      acties.appendChild(knop("Alles uit", "", function (e) {
        e.stopPropagation(); allesVanObject(o, false); bewaar(); tekenAlles();
      }));
      acties.appendChild(knop("×", "dc-weg", function (e) {
        e.stopPropagation();
        staat.objecten = staat.objecten.filter(function (x) { return x.id !== o.id; });
        if (staat.actief && staat.actief.objId === o.id) staat.actief = null;
        bewaar(); tekenAlles();
      }, "Object verwijderen"));
      kop.appendChild(acties);
      kaart.appendChild(kop);

      var lijst = el("div", "dc-groepen");
      groepen(o).forEach(function (groep) {
        var aantalAan = groep.elementen.filter(function (e) { return elementAan(o, e); }).length;
        var open = o.open["w:" + groep.naam] || !!zoek;

        var gr = el("div", "dc-groep");
        var grKop = el("div", "dc-rij niveau-1" + (open ? " open" : ""));
        grKop.appendChild(pijl(open));
        grKop.appendChild(selectievakje(aantalAan === groep.elementen.length,
          aantalAan > 0, function (aan) {
            zetGroep(o, groep, aan); bewaar(); tekenAlles();
          }));
        var grNaam = el("span", "dc-naam-tekst", groep.omschrijving);
        grKop.appendChild(grNaam);
        grKop.appendChild(el("span", "dc-wg", groep.naam));
        grKop.appendChild(telBadge(aantalAan, groep.elementen.length, "elementen"));
        grKop.addEventListener("click", function () {
          o.open["w:" + groep.naam] = !open;
          tekenBoom();
        });
        gr.appendChild(grKop);

        if (open) {
          var elHouder = el("div", "dc-kinderen");
          groep.elementen.forEach(function (e) {
            var E = DB.elementen[e];
            if (zoek && !pastBijZoek(o, e, zoek)) return;
            elHouder.appendChild(tekenElement(o, e, E, zoek));
          });
          gr.appendChild(elHouder);
        }
        lijst.appendChild(gr);
      });
      kaart.appendChild(lijst);
      houder.appendChild(kaart);
    });
  }

  function pastBijZoek(o, e, zoek) {
    var E = DB.elementen[e];
    if (E.n.toLowerCase().indexOf(zoek) !== -1) return true;
    return bouwdelenVan(e).some(function (b) {
      var B = DB.bouwdelen[b];
      if (B.n.toLowerCase().indexOf(zoek) !== -1) return true;
      return gebrekenVan(b).some(function (g) {
        return DB.gebreken[g].n.toLowerCase().indexOf(zoek) !== -1;
      });
    });
  }

  function pijl(open) {
    var s = el("span", "dc-pijl", open ? "▾" : "▸");
    return s;
  }

  function actiefIs(soort, o, e, b, g) {
    var a = staat.actief;
    return a && a.soort === soort && a.objId === o.id && a.el === e &&
      (b === undefined || a.bd === b) && (g === undefined || a.gb === g);
  }

  function tekenElement(o, e, E, zoek) {
    var aan = elementAan(o, e);
    var t = telElement(o, e);
    var open = o.open["e:" + e] || (!!zoek && aan);
    var wrap = el("div", "dc-element");

    var rij = el("div", "dc-rij niveau-2" + (aan ? "" : " uit") +
      (actiefIs("element", o, e) ? " actief" : ""));
    rij.appendChild(pijl(open));
    rij.appendChild(selectievakje(aan, false, function (val) {
      zetElement(o, e, val); bewaar(); tekenAlles();
    }));
    rij.appendChild(el("span", "dc-naam-tekst", E.n));
    var merk = statusMerk(E.st);
    if (merk) rij.appendChild(merk);
    rij.appendChild(telBadge(t.b, t.bT, "bouwdelen"));
    if (t.g) rij.appendChild(el("span", "dc-badge score", t.g + " gebreken"));
    rij.appendChild(snelKnop("ernstige gebreken kiezen voor alle bouwdelen van dit element",
      "⚠", function () {
        bouwdelenVan(e).forEach(function (b) {
          if (bouwdeelAan(o, e, b)) kiesGebreken(o, e, b, "ernstig");
        });
        bewaar(); tekenAlles();
      }));
    rij.addEventListener("click", function () {
      if (!o.open["e:" + e]) o.open["e:" + e] = true; else o.open["e:" + e] = false;
      staat.actief = { soort: "element", objId: o.id, el: e };
      tekenAlles();
    });
    wrap.appendChild(rij);

    if (open) {
      var kinderen = el("div", "dc-kinderen");
      bouwdelenVan(e).forEach(function (b) {
        var B = DB.bouwdelen[b];
        if (zoek && E.n.toLowerCase().indexOf(zoek) === -1 &&
          B.n.toLowerCase().indexOf(zoek) === -1 &&
          !gebrekenVan(b).some(function (g) {
            return DB.gebreken[g].n.toLowerCase().indexOf(zoek) !== -1;
          })) return;
        kinderen.appendChild(tekenBouwdeel(o, e, b, B, zoek));
      });
      if (!kinderen.children.length) {
        kinderen.appendChild(el("div", "dc-rij niveau-3 zacht", "Geen bouwdelen gekoppeld."));
      }
      wrap.appendChild(kinderen);
    }
    return wrap;
  }

  function tekenBouwdeel(o, e, b, B, zoek) {
    var aan = bouwdeelAan(o, e, b);
    var t = telBouwdeel(o, e, b);
    var open = o.open["b:" + e + "|" + b];
    var wrap = el("div", "dc-bouwdeel");

    var rij = el("div", "dc-rij niveau-3" + (aan ? "" : " uit") +
      (actiefIs("bouwdeel", o, e, b) ? " actief" : ""));
    rij.appendChild(pijl(open));
    rij.appendChild(selectievakje(aan, false, function (val) {
      zetBouwdeel(o, e, b, val); bewaar(); tekenAlles();
    }));
    rij.appendChild(el("span", "dc-naam-tekst", B.n));
    var merk = statusMerk(B.st);
    if (merk) rij.appendChild(merk);
    if ((B.mat || []).length) {
      rij.appendChild(el("span", "dc-mat", B.mat.slice(0, 3).join(", ") +
        (B.mat.length > 3 ? " +" + (B.mat.length - 3) : "")));
    }
    rij.appendChild(el("span", "dc-badge" + (t.g ? " score" : " leeg"),
      t.g + " van " + t.gT + " gebreken"));
    rij.appendChild(snelKnop("alle gebreken kiezen", "alle", function () {
      kiesGebreken(o, e, b, "alle"); bewaar(); tekenAlles();
    }));
    rij.appendChild(snelKnop("alleen de ernstige gebreksoorten kiezen", "⚠", function () {
      kiesGebreken(o, e, b, "ernstig"); bewaar(); tekenAlles();
    }));
    if (t.g) {
      rij.appendChild(snelKnop("gekozen gebreken wissen", "geen", function () {
        kiesGebreken(o, e, b, "geen"); bewaar(); tekenAlles();
      }));
    }
    rij.addEventListener("click", function () {
      o.open["b:" + e + "|" + b] = !open;
      staat.actief = { soort: "bouwdeel", objId: o.id, el: e, bd: b };
      tekenAlles();
    });
    wrap.appendChild(rij);

    if (open) {
      var kinderen = el("div", "dc-kinderen");
      gebrekenVan(b).forEach(function (g) {
        var G = DB.gebreken[g];
        if (zoek && B.n.toLowerCase().indexOf(zoek) === -1 &&
          G.n.toLowerCase().indexOf(zoek) === -1) return;
        var gAan = gebrekAan(o, e, b, g);
        var score = o.fmeca[sleutelG(e, b, g)];
        var risico = score && score.k && score.g ? score.k * score.g : 0;
        var rijG = el("div", "dc-rij niveau-4" + (gAan ? "" : " uit") +
          (actiefIs("gebrek", o, e, b, g) ? " actief" : ""));
        rijG.appendChild(el("span", "dc-pijl leeg", ""));
        rijG.appendChild(selectievakje(gAan, false, function (val) {
          zetGebrek(o, e, b, g, val); bewaar(); tekenAlles();
        }));
        rijG.appendChild(el("span", "dc-naam-tekst", G.n));
        rijG.appendChild(el("span", "dc-soort", G.srt || ""));
        var belang = belangVan(g);
        if (belang) rijG.appendChild(el("span", "dc-belang " + belang, belang));
        if (risico) {
          rijG.appendChild(el("span", "dc-risico " + klasseKlasse(risico),
            "K" + score.k + "×G" + score.g + " = " + risico));
        }
        rijG.addEventListener("click", function () {
          staat.actief = { soort: "gebrek", objId: o.id, el: e, bd: b, gb: g };
          staat.tab = "fmeca";
          tekenAlles();
        });
        kinderen.appendChild(rijG);
      });
      if (!kinderen.children.length) {
        kinderen.appendChild(el("div", "dc-rij niveau-4 zacht", "Geen gebreken gekoppeld."));
      }
      wrap.appendChild(kinderen);
    }
    return wrap;
  }

  /* ------------------------------------------------------------ detailpaneel */
  function veld(label, waarde) {
    if (!waarde) return null;
    var d = el("div", "dc-veld");
    d.appendChild(el("div", "dc-veld-label", label));
    d.appendChild(el("div", "dc-veld-waarde", waarde));
    return d;
  }

  function tekenDetail() {
    var paneel = app.querySelector(".dc-detail-inhoud");
    var titelBalk = app.querySelector(".dc-detail-titel");
    paneel.textContent = "";

    var a = staat.actief;
    if (!a) {
      titelBalk.textContent = "Niets geselecteerd";
      paneel.appendChild(el("p", "zacht", "Klik in de boom op een element, bouwdeel of gebrek."));
      return;
    }
    var o = objectVan(a.objId);
    if (!o) { staat.actief = null; return tekenDetail(); }

    if (staat.tab === "matrix") { titelBalk.textContent = "Risicomatrix"; return tekenMatrix(paneel); }

    if (a.soort === "object") {
      var bo = DB.beheerobjecten[o.bo];
      titelBalk.textContent = bo.c + " — " + o.naam;
      var t = tel(o);
      paneel.appendChild(cijferStrip([
        [t.e + "/" + t.eT, "elementen"], [t.b + "/" + t.bT, "bouwdelen"],
        [t.g + "/" + t.gT, "gebreken"], [String(t.unieke), "unieke gebreken"],
        [String(Object.keys(o.fmeca).length), "beoordeeld"]
      ]));
      paneel.appendChild(invoerVeld("Maximo-werkcode", o.maximo, function (v) {
        o.maximo = v; bewaar();
      }));
      paneel.appendChild(invoerVeld("Notitie", o.notitie, function (v) {
        o.notitie = v; bewaar();
      }, true));
      [veld("Werkdefinitie", bo.wd), veld("Toelichting", bo.tl),
        veld("Synoniemen", bo.syn), veld("Werkgroepen", (bo.wg || []).join(", "))]
        .forEach(function (v) { if (v) paneel.appendChild(v); });
      paneel.appendChild(bronLink("beheerobjecten", bo.n));
      return;
    }

    if (a.soort === "element") {
      var E = DB.elementen[a.el];
      titelBalk.textContent = E.n;
      var te = telElement(o, a.el);
      paneel.appendChild(cijferStrip([[te.b + "/" + te.bT, "bouwdelen"], [te.g + "/" + te.gT, "gebreken"]]));
      [veld("Code", E.c), veld("Status", E.st), veld("Lead werkgroep",
        (DB.werkgroepen[E.wg] || E.wg) + (E.wg ? " (" + E.wg + ")" : "")),
        veld("Extra werkgroepen", (E.wgx || []).join(", ")),
        veld("Vakdisciplines", (E.vd || []).join(", ")),
        veld("Werkdefinitie", E.wd), veld("Toelichting", E.tl), veld("Omschrijving", E.oms)]
        .forEach(function (v) { if (v) paneel.appendChild(v); });
      paneel.appendChild(bronLink("elementen", E.n));
      return;
    }

    if (a.soort === "bouwdeel") {
      var B = DB.bouwdelen[a.bd];
      titelBalk.textContent = B.n;
      var tb = telBouwdeel(o, a.el, a.bd);
      paneel.appendChild(cijferStrip([[tb.g + "/" + tb.gT, "gebreken"],
        [String((B.mat || []).length), "materialen"]]));
      [veld("Code", B.c), veld("Status", B.st), veld("Werkdefinitie", B.wd),
        veld("Toelichting", B.tl), veld("Omschrijving", B.oms),
        veld("Materialen", (B.mat || []).join(", "))]
        .forEach(function (v) { if (v) paneel.appendChild(v); });

      paneel.appendChild(el("h4", null, "Welke gebreken neem je mee?"));
      paneel.appendChild(el("p", "zacht",
        "Deze gebreken kunnen bij de materialen van dit bouwdeel optreden. Kies de " +
        "faalwijzen die hier realistisch zijn \u2014 dat is stap 2 van de leidraad."));

      var knoppen = el("div", "dc-kiesbalk");
      knoppen.appendChild(knop("Alle", "", function () {
        kiesGebreken(o, a.el, a.bd, "alle"); bewaar(); tekenAlles();
      }));
      knoppen.appendChild(knop("Alleen ernstig", "", function () {
        kiesGebreken(o, a.el, a.bd, "ernstig"); bewaar(); tekenAlles();
      }));
      knoppen.appendChild(knop("Wissen", "dc-weg", function () {
        kiesGebreken(o, a.el, a.bd, "geen"); bewaar(); tekenAlles();
      }));
      paneel.appendChild(knoppen);
      paneel.appendChild(gebrekKiezer(o, a.el, a.bd));

      var gekozen = gebrekenVan(a.bd).filter(function (g) {
        return gebrekAan(o, a.el, a.bd, g);
      });
      if (gekozen.length) {
        paneel.appendChild(el("h4", null, "Beoordeling (kans \u00d7 gevolg)"));
        gekozen.forEach(function (g) {
          paneel.appendChild(scoreRegel(o, a.el, a.bd, g));
        });
      }
      paneel.appendChild(bronLink("bouwdelen", B.n));
      return;
    }

    if (a.soort === "gebrek") {
      var G = DB.gebreken[a.gb];
      titelBalk.textContent = G.n;
      [veld("Code", G.c), veld("Status", G.st), veld("Gebreksoort", G.srt),
        veld("Gebrekgroep", G.grp), veld("Eenheid", G.eh), veld("Type", G.typ),
        veld("Omschrijving", G.oms), veld("Werkdefinitie", G.wd), veld("Toelichting", G.tl)]
        .forEach(function (v) { if (v) paneel.appendChild(v); });
      var soort = DB.gebreksoorten.filter(function (s) { return s.n === G.srt; })[0];
      if (soort) {
        paneel.appendChild(veld("Belang van de gebreksoort",
          soort.belang + (soort.tl ? " — " + soort.tl : "")));
      }
      paneel.appendChild(el("h4", null, "Beoordeling"));
      paneel.appendChild(scoreRegel(o, a.el, a.bd, a.gb));
      paneel.appendChild(bronLink("gebreken", G.n));
      return;
    }
  }

  var BELANG_ORDE = { ernstig: 0, serieus: 1, gering: 2, "": 3 };

  function gebrekKiezer(o, e, b) {
    var perSoort = {};
    gebrekenVan(b).forEach(function (g) {
      var soort = DB.gebreken[g].srt || "Overig";
      (perSoort[soort] = perSoort[soort] || []).push(g);
    });
    var soorten = Object.keys(perSoort).sort(function (x, y) {
      var bx = BELANG_ORDE[(soortIndex[x] || {}).belang || ""];
      var by = BELANG_ORDE[(soortIndex[y] || {}).belang || ""];
      return bx - by || x.localeCompare(y);
    });

    var houder = el("div", "dc-kiezer");
    soorten.forEach(function (soort) {
      var belang = (soortIndex[soort] || {}).belang || "";
      var kop = el("div", "dc-kiezer-kop");
      kop.appendChild(el("span", "dc-kiezer-soort", soort));
      if (belang) kop.appendChild(el("span", "dc-belang " + belang, belang));
      var soortInfo = soortIndex[soort];
      if (soortInfo && soortInfo.tl) kop.title = soortInfo.tl;
      houder.appendChild(kop);
      perSoort[soort].forEach(function (g) {
        var G = DB.gebreken[g];
        var aan = gebrekAan(o, e, b, g);
        var rij = el("label", "dc-kiezer-rij" + (aan ? " aan" : ""));
        var vink = document.createElement("input");
        vink.type = "checkbox";
        vink.checked = aan;
        vink.addEventListener("change", function () {
          zetGebrek(o, e, b, g, vink.checked);
          bewaar();
          tekenAlles();
        });
        rij.appendChild(vink);
        rij.appendChild(el("span", "dc-kiezer-naam", G.n));
        if (G.eh) rij.appendChild(el("span", "dc-kiezer-eh", G.eh));
        rij.title = G.oms || G.wd || G.n;
        houder.appendChild(rij);
      });
    });
    return houder;
  }

  function cijferStrip(paren) {
    var d = el("div", "dc-cijfers");
    paren.forEach(function (p) {
      var c = el("div", "dc-cijfer");
      c.appendChild(el("b", null, p[0]));
      c.appendChild(el("span", null, p[1]));
      d.appendChild(c);
    });
    return d;
  }

  function invoerVeld(label, waarde, actie, groot) {
    var d = el("div", "dc-veld");
    d.appendChild(el("div", "dc-veld-label", label));
    var i = document.createElement(groot ? "textarea" : "input");
    i.className = "dc-invoer";
    i.value = waarde || "";
    if (groot) i.rows = 3;
    i.addEventListener("input", function () { actie(i.value); });
    d.appendChild(i);
    return d;
  }

  function scoreRegel(o, e, b, g) {
    var G = DB.gebreken[g];
    var sleutel = sleutelG(e, b, g);
    var score = o.fmeca[sleutel] || { k: 0, g: 0, m: "" };
    var d = el("div", "dc-score");

    var kop = el("div", "dc-score-kop");
    kop.appendChild(el("span", "dc-score-naam", G.n));
    var uitslag = el("span", "dc-risico " + klasseKlasse(score.k * score.g),
      score.k && score.g ? klasseNaam(score.k * score.g) + " · " + (score.k * score.g) : "niet beoordeeld");
    kop.appendChild(uitslag);
    d.appendChild(kop);

    var rij = el("div", "dc-score-rij");
    rij.appendChild(keuze("Kans", KANS, score.k, function (v) {
      score.k = v; bewaarScore(o, sleutel, score); tekenAlles();
    }));
    rij.appendChild(keuze("Gevolg", GEVOLG, score.g, function (v) {
      score.g = v; bewaarScore(o, sleutel, score); tekenAlles();
    }));
    d.appendChild(rij);

    var maat = document.createElement("input");
    maat.className = "dc-invoer";
    maat.placeholder = "Beheersmaatregel…";
    maat.value = score.m || "";
    maat.addEventListener("input", function () {
      score.m = maat.value; bewaarScore(o, sleutel, score);
    });
    d.appendChild(maat);
    return d;
  }

  function bewaarScore(o, sleutel, score) {
    if (!score.k && !score.g && !score.m) delete o.fmeca[sleutel];
    else o.fmeca[sleutel] = score;
    bewaar();
  }

  function keuze(label, opties, waarde, actie) {
    var d = el("label", "dc-keuze");
    d.appendChild(el("span", null, label));
    var s = document.createElement("select");
    opties.forEach(function (tekst, i) {
      var opt = document.createElement("option");
      opt.value = i;
      opt.textContent = i === 0 ? "—" : i + " · " + tekst;
      if (i === waarde) opt.selected = true;
      s.appendChild(opt);
    });
    s.addEventListener("change", function () { actie(+s.value); });
    d.appendChild(s);
    return d;
  }

  function bronLink(tabel, naam) {
    var p = el("p", "dc-bron");
    var a = document.createElement("a");
    a.href = "../deltatabellen/" + tabel + "/";
    a.textContent = "Bekijk " + naam + " in de deltatabel " + tabel;
    p.appendChild(a);
    return p;
  }

  function tekenMatrix(paneel) {
    var cel = matrixTelling();
    var totaal = Object.keys(cel).reduce(function (s, k) { return s + cel[k].length; }, 0);
    paneel.appendChild(el("p", "zacht", totaal
      ? totaal + " beoordeelde gebreken. Klik op een vak om te zien welke dat zijn."
      : "Nog niets beoordeeld. Open een bouwdeel en geef kans en gevolg per gebrek."));

    var tabel = el("table", "dc-matrix");
    var kop = el("tr");
    kop.appendChild(el("th", "hoek", "kans ↓ gevolg →"));
    for (var g = 1; g <= 5; g++) kop.appendChild(el("th", null, String(g)));
    tabel.appendChild(kop);
    for (var k = 5; k >= 1; k--) {
      var rij = el("tr");
      rij.appendChild(el("th", null, String(k)));
      for (var g2 = 1; g2 <= 5; g2++) {
        var lijst = cel[k + "-" + g2] || [];
        var td = el("td", "vak " + klasseKlasse(k * g2) + (lijst.length ? " gevuld" : ""),
          lijst.length ? String(lijst.length) : "");
        (function (lijst, k, g2) {
          td.addEventListener("click", function () {
            if (!lijst.length) return;
            toonMatrixCel(paneel, lijst, k, g2);
          });
        })(lijst, k, g2);
        rij.appendChild(td);
      }
      tabel.appendChild(rij);
    }
    paneel.appendChild(tabel);

    var hoog = [];
    Object.keys(cel).forEach(function (sleutel) {
      var delen = sleutel.split("-");
      if (+delen[0] * +delen[1] >= 10) hoog = hoog.concat(cel[sleutel]);
    });
    if (hoog.length) {
      paneel.appendChild(el("h4", null, "Hoogste risico's"));
      var lijstEl = el("div", "dc-prio");
      hoog.sort(function (a, b) { return b.score.k * b.score.g - a.score.k * a.score.g; })
        .slice(0, 25).forEach(function (x) {
          lijstEl.appendChild(prioRegel(x));
        });
      paneel.appendChild(lijstEl);
    }
  }

  function toonMatrixCel(paneel, lijst, k, g) {
    var bestaand = paneel.querySelector(".dc-celinhoud");
    if (bestaand) bestaand.remove();
    var d = el("div", "dc-celinhoud");
    d.appendChild(el("h4", null, "Kans " + k + " × gevolg " + g + " = " + (k * g) +
      " (" + klasseNaam(k * g).toLowerCase() + ")"));
    lijst.forEach(function (x) { d.appendChild(prioRegel(x)); });
    paneel.appendChild(d);
  }

  function prioRegel(x) {
    var risico = x.score.k * x.score.g;
    var r = el("button", "dc-prio-rij");
    r.type = "button";
    r.appendChild(el("span", "dc-risico " + klasseKlasse(risico), String(risico)));
    r.appendChild(el("span", "dc-prio-naam", DB.gebreken[x.g].n));
    r.appendChild(el("span", "dc-prio-pad",
      DB.bouwdelen[x.b].n + " · " + DB.elementen[x.e].n + " · " + x.o.naam));
    r.addEventListener("click", function () {
      staat.actief = { soort: "gebrek", objId: x.o.id, el: x.e, bd: x.b, gb: x.g };
      staat.tab = "info";
      x.o.open["w:" + werkgroepVan(x.e)] = true;
      x.o.open["e:" + x.e] = true;
      x.o.open["b:" + x.e + "|" + x.b] = true;
      tekenAlles();
    });
    return r;
  }

  /* ------------------------------------------------------------ stappenbalk */
  var STAPPEN = [
    { naam: "1. Decompositie", link: "../leidraad/kwalitatieve-ora/",
      tekst: "Kies het beheerobject en bepaal welke elementen en bouwdelen van toepassing zijn." },
    { naam: "2. Faalwijzen", link: "../leidraad/kwalitatieve-ora/",
      tekst: "Loop per bouwdeel de gebreken langs: welke faalwijzen zijn hier echt mogelijk?" },
    { naam: "3. Kans en gevolg", link: "../leidraad/kwalitatieve-ora/",
      tekst: "Geef per gebrek een kans- en gevolgscore, op basis van expert judgement." },
    { naam: "4. Risicomatrix", link: "../leidraad/kwalitatieve-ora/",
      tekst: "Bekijk de matrix en bepaal welke risico's niet aanvaardbaar zijn." },
    { naam: "5. Maatregelen", link: "../leidraad/instandhoudingsplan/",
      tekst: "Leg per risico de maatregel vast en neem die op in het instandhoudingsplan." }
  ];

  function huidigeStap() {
    if (!staat.objecten.length) return 0;
    var scores = staat.objecten.reduce(function (s, o) { return s + Object.keys(o.fmeca).length; }, 0);
    var maatregelen = staat.objecten.reduce(function (s, o) {
      return s + Object.keys(o.fmeca).filter(function (k) { return o.fmeca[k].m; }).length;
    }, 0);
    if (maatregelen) return 4;
    if (scores) return 3;
    var gebreken = staat.objecten.reduce(function (s, o) { return s + tel(o).g; }, 0);
    return gebreken ? 1 : 1;
  }

  function tekenStappen() {
    var balk = app.querySelector(".dc-stappen");
    balk.textContent = "";
    var nu = huidigeStap();
    STAPPEN.forEach(function (s, i) {
      var d = el("a", "dc-stap" + (i < nu ? " klaar" : i === nu ? " nu" : ""));
      d.href = s.link;
      d.title = s.tekst + "  (opent de leidraad)";
      d.appendChild(el("span", "dc-stap-naam", s.naam));
      balk.appendChild(d);
    });
    app.querySelector(".dc-stap-tekst").textContent = STAPPEN[Math.min(nu, 4)].tekst;
  }

  /* ----------------------------------------------------------------- opbouw */
  function bouwUi() {
    app.textContent = "";
    app.className = "dc-app";

    var top = el("div", "dc-top");
    var naam = document.createElement("input");
    naam.className = "dc-projectnaam";
    naam.value = staat.naam;
    naam.placeholder = "Naam van deze decompositie…";
    naam.addEventListener("input", function () { staat.naam = naam.value; bewaar(); });
    top.appendChild(naam);

    var acties = el("div", "dc-top-acties");
    acties.appendChild(knop("Excel", "primair", exportExcel, "Decompositie als Excel-bestand"));
    acties.appendChild(knop("IHCKWANT", "", exportIhckwant, "Regels voor het rekenblad IHCKWANT"));
    acties.appendChild(knop("Opslaan", "", exportJson, "Als bestand opslaan"));
    var laadKnop = knop("Laden", "", function () { bestandKiezer.click(); }, "Eerder opgeslagen bestand laden");
    acties.appendChild(laadKnop);
    acties.appendChild(knop("Afdrukken", "", function () { window.print(); }, "Afdrukken of opslaan als pdf"));
    acties.appendChild(knop("Leegmaken", "dc-weg", function () {
      if (!staat.objecten.length || confirm("Alle objecten en beoordelingen wissen?")) {
        staat.objecten = []; staat.actief = null; staat.volgnummer = 1;
        bewaar(); tekenAlles();
      }
    }, "Alles wissen"));
    top.appendChild(acties);
    app.appendChild(top);

    var bestandKiezer = document.createElement("input");
    bestandKiezer.type = "file";
    bestandKiezer.accept = ".json,application/json";
    bestandKiezer.style.display = "none";
    bestandKiezer.addEventListener("change", function () {
      if (bestandKiezer.files[0]) importJson(bestandKiezer.files[0]);
      bestandKiezer.value = "";
    });
    app.appendChild(bestandKiezer);

    var stappenHouder = el("div", "dc-stappen-houder");
    stappenHouder.appendChild(el("div", "dc-stappen"));
    stappenHouder.appendChild(el("p", "dc-stap-tekst"));
    app.appendChild(stappenHouder);

    var raster = el("div", "dc-raster");

    // bibliotheek
    var bib = el("aside", "dc-bib");
    bib.appendChild(el("h3", null, "Bibliotheek"));
    var bz = document.createElement("input");
    bz.className = "dc-bib-zoek";
    bz.type = "search";
    bz.placeholder = "Zoek beheerobject…";
    bz.addEventListener("input", tekenBibliotheek);
    bib.appendChild(bz);
    bib.appendChild(el("div", "dc-bib-lijst"));
    raster.appendChild(bib);

    // boom
    var midden = el("section", "dc-midden");
    var mz = el("div", "dc-boom-balk");
    var zoekveld = document.createElement("input");
    zoekveld.className = "dc-boom-zoek";
    zoekveld.type = "search";
    zoekveld.placeholder = "Zoek in de boom: element, bouwdeel of gebrek…";
    var wacht;
    zoekveld.addEventListener("input", function () {
      clearTimeout(wacht);
      wacht = setTimeout(function () { staat.zoek = zoekveld.value.trim(); tekenBoom(); }, 150);
    });
    mz.appendChild(zoekveld);
    midden.appendChild(mz);
    midden.appendChild(el("div", "dc-boom"));
    raster.appendChild(midden);

    // detail
    var detail = el("aside", "dc-detail");
    var tabs = el("div", "dc-tabs");
    ["info", "matrix"].forEach(function (t) {
      var b = knop(t === "info" ? "Detail" : "Risicomatrix", "dc-tab", function () {
        staat.tab = t; tekenAlles();
      });
      b.dataset.tab = t;
      tabs.appendChild(b);
    });
    detail.appendChild(tabs);
    detail.appendChild(el("h3", "dc-detail-titel", "Niets geselecteerd"));
    detail.appendChild(el("div", "dc-detail-inhoud"));
    raster.appendChild(detail);

    app.appendChild(raster);
    app.appendChild(el("div", "dc-melding"));
  }

  function tekenAlles() {
    tekenStappen();
    tekenBibliotheek();
    tekenBoom();
    tekenDetail();
    app.querySelectorAll(".dc-tab").forEach(function (b) {
      b.classList.toggle("actief", b.dataset.tab === staat.tab);
    });
  }

  /* ------------------------------------------------------------------ start */
  function start() {
    app = document.getElementById("decompositie-app");
    if (!app || app.dataset.klaar) return;
    app.dataset.klaar = "1";
    app.textContent = "Gegevens laden…";

    fetch(BRON).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + r.statusText);
      return r.json();
    }).then(function (data) {
      DB = data;
      DB.gebreksoorten.forEach(function (s) { soortIndex[s.n] = s; });
      herstelUitOpslag();
      bouwUi();
      tekenAlles();
    }).catch(function (e) {
      app.textContent = "De gegevens konden niet worden geladen (" + e.message + ").";
    });
  }

  if (typeof document$ !== "undefined" && document$.subscribe) {
    document$.subscribe(start);
  } else if (document.readyState !== "loading") {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();
