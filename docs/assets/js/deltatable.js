/* Doorzoekbare tabel vanuit een CSV-bestand.
   Gebruik: <div class="deltatabel" data-src="pad/naar.csv" data-status="Mutatie"></div>
   Geen externe bibliotheken: alles staat in dit bestand. */
(function () {
  "use strict";

  var PER_PAGINA = 50;
  var MAX_TEKST = 140;

  var KLEUREN = {
    nieuw: "nieuw", toegevoegd: "nieuw",
    vervallen: "weg",
    gewijzigd: "wijz", hernoemd: "wijz",
    bestaand: "neutraal", ongewijzigd: "neutraal"
  };

  /* --- CSV lezen (RFC 4180: aanhalingstekens, regeleinden in cellen) --- */
  function leesCsv(tekst) {
    var rijen = [], rij = [], cel = "", i = 0, inQuote = false;
    if (tekst.charCodeAt(0) === 0xfeff) tekst = tekst.slice(1);
    while (i < tekst.length) {
      var c = tekst[i];
      if (inQuote) {
        if (c === '"') {
          if (tekst[i + 1] === '"') { cel += '"'; i += 2; continue; }
          inQuote = false; i++; continue;
        }
        cel += c; i++; continue;
      }
      if (c === '"') { inQuote = true; i++; continue; }
      if (c === ",") { rij.push(cel); cel = ""; i++; continue; }
      if (c === "\n" || c === "\r") {
        if (c === "\r" && tekst[i + 1] === "\n") i++;
        rij.push(cel); rijen.push(rij); rij = []; cel = ""; i++; continue;
      }
      cel += c; i++;
    }
    if (cel.length || rij.length) { rij.push(cel); rijen.push(rij); }
    return rijen;
  }

  function el(tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst !== undefined) e.textContent = tekst;
    return e;
  }

  function statusKlasse(waarde) {
    return KLEUREN[String(waarde || "").trim().toLowerCase()] || "";
  }

  function bouw(houder, kop, rijen, statusIndex, naam, bron) {
    var zoek = "", filter = "", pagina = 0;

    var balk = el("div", "dt-balk");
    var invoer = el("input", "dt-zoek");
    invoer.type = "search";
    invoer.placeholder = "Zoeken in " + (naam || "tabel") + "…";
    invoer.setAttribute("aria-label", "Zoeken in de tabel");
    balk.appendChild(invoer);

    var chips = el("div", "dt-chips");
    if (statusIndex >= 0) {
      var waarden = {};
      rijen.forEach(function (r) {
        var v = (r[statusIndex] || "").trim();
        if (v) waarden[v] = (waarden[v] || 0) + 1;
      });
      var namen = Object.keys(waarden).sort(function (a, b) { return waarden[b] - waarden[a]; });
      namen.forEach(function (v) {
        var chip = el("button", "dt-chip " + statusKlasse(v), v + " " + waarden[v]);
        chip.type = "button";
        chip.addEventListener("click", function () {
          filter = (filter === v) ? "" : v;
          pagina = 0;
          chips.querySelectorAll(".dt-chip").forEach(function (c) { c.classList.remove("aan"); });
          if (filter) chip.classList.add("aan");
          teken();
        });
        chips.appendChild(chip);
      });
    }
    balk.appendChild(chips);

    var telling = el("span", "dt-telling");
    balk.appendChild(telling);

    if (bron) {
      var link = el("a", "dt-csv", "CSV");
      link.href = bron;
      link.download = "";
      link.title = "Deze tabel als CSV downloaden";
      balk.appendChild(link);
    }

    var scroll = el("div", "dt-scroll");
    var tabel = el("table", "dt-tabel");
    var thead = el("thead");
    var koprij = el("tr");
    kop.forEach(function (k) { koprij.appendChild(el("th", null, k)); });
    thead.appendChild(koprij);
    tabel.appendChild(thead);
    var tbody = el("tbody");
    tabel.appendChild(tbody);
    scroll.appendChild(tabel);

    var voet = el("div", "dt-voet");
    var vorige = el("button", "dt-knop", "Vorige");
    var volgende = el("button", "dt-knop", "Volgende");
    var positie = el("span", "dt-positie");
    vorige.type = volgende.type = "button";
    vorige.addEventListener("click", function () { if (pagina > 0) { pagina--; teken(); } });
    volgende.addEventListener("click", function () { pagina++; teken(); });
    voet.appendChild(vorige); voet.appendChild(positie); voet.appendChild(volgende);

    houder.textContent = "";
    houder.appendChild(balk);
    houder.appendChild(scroll);
    houder.appendChild(voet);

    var wacht = null;
    invoer.addEventListener("input", function () {
      clearTimeout(wacht);
      wacht = setTimeout(function () { zoek = invoer.value.toLowerCase().trim(); pagina = 0; teken(); }, 120);
    });

    function selectie() {
      return rijen.filter(function (r) {
        if (filter && (r[statusIndex] || "").trim() !== filter) return false;
        if (!zoek) return true;
        for (var i = 0; i < r.length; i++) {
          if (r[i] && r[i].toLowerCase().indexOf(zoek) !== -1) return true;
        }
        return false;
      });
    }

    function detailrij(r) {
      var tr = el("tr", "dt-detail");
      var td = el("td");
      td.colSpan = kop.length;
      var dl = el("dl");
      kop.forEach(function (k, i) {
        if (!r[i]) return;
        dl.appendChild(el("dt", null, k));
        dl.appendChild(el("dd", null, r[i]));
      });
      td.appendChild(dl);
      tr.appendChild(td);
      return tr;
    }

    function teken() {
      var gekozen = selectie();
      var paginas = Math.max(1, Math.ceil(gekozen.length / PER_PAGINA));
      if (pagina > paginas - 1) pagina = paginas - 1;
      var deel = gekozen.slice(pagina * PER_PAGINA, (pagina + 1) * PER_PAGINA);

      tbody.textContent = "";
      deel.forEach(function (r) {
        var tr = el("tr");
        if (statusIndex >= 0) {
          var k = statusKlasse(r[statusIndex]);
          if (k) tr.classList.add("rij-" + k);
        }
        kop.forEach(function (_, i) {
          var v = r[i] || "";
          var td = el("td", null, v.length > MAX_TEKST ? v.slice(0, MAX_TEKST) + "…" : v);
          if (v.length > MAX_TEKST) td.title = v;
          if (i === statusIndex) {
            td.textContent = "";
            var merk = el("span", "dt-merk " + statusKlasse(v), v);
            td.appendChild(merk);
          }
          tr.appendChild(td);
        });
        tr.addEventListener("click", function () {
          var volgend = tr.nextSibling;
          if (volgend && volgend.classList && volgend.classList.contains("dt-detail")) {
            volgend.remove();
            tr.classList.remove("open");
          } else {
            tbody.insertBefore(detailrij(r), tr.nextSibling);
            tr.classList.add("open");
          }
        });
        tbody.appendChild(tr);
      });

      telling.textContent = gekozen.length === rijen.length
        ? rijen.length + " regels"
        : gekozen.length + " van " + rijen.length + " regels";
      positie.textContent = "pagina " + (pagina + 1) + " van " + paginas;
      vorige.disabled = pagina === 0;
      volgende.disabled = pagina >= paginas - 1;
      voet.style.display = paginas > 1 ? "" : "none";
    }

    teken();
  }

  function start(houder) {
    if (houder.dataset.klaar) return;
    houder.dataset.klaar = "1";
    var bron = houder.dataset.src;
    houder.appendChild(el("p", "dt-laden", "Tabel laden…"));
    fetch(bron)
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + " " + r.statusText);
        return r.text();
      })
      .then(function (tekst) {
        var rijen = leesCsv(tekst).filter(function (r) {
          return r.some(function (c) { return c.trim() !== ""; });
        });
        if (!rijen.length) { houder.textContent = "Geen gegevens gevonden."; return; }
        var kop = rijen[0];
        var statusIndex = houder.dataset.status ? kop.indexOf(houder.dataset.status) : -1;
        bouw(houder, kop, rijen.slice(1), statusIndex, houder.dataset.naam, bron);
      })
      .catch(function (e) {
        houder.textContent = "De tabel kon niet worden geladen (" + e.message + ").";
      });
  }

  function init() {
    document.querySelectorAll(".deltatabel[data-src]").forEach(start);
  }

  if (typeof document$ !== "undefined" && document$.subscribe) {
    document$.subscribe(init);           // werkt mee met de instant-navigatie van Material
  } else if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
