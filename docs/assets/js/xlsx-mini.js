/* Minimale xlsx-schrijver: maakt een echt Excel-bestand zonder externe bibliotheken.
   Gebruik: maakXlsx([{naam: "Blad", rijen: [["Kop"], ["waarde", 12]]}]) -> Blob */
(function (global) {
  "use strict";

  var crcTabel = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = crcTabel[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function bytes(tekst) {
    return new TextEncoder().encode(tekst);
  }

  function esc(v) {
    return String(v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      // tekens die xml niet toestaat
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  }

  function kolomletter(i) {
    var s = "";
    i += 1;
    while (i > 0) {
      var rest = (i - 1) % 26;
      s = String.fromCharCode(65 + rest) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  function bladXml(rijen) {
    var uit = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
      "<sheetData>"];
    for (var r = 0; r < rijen.length; r++) {
      var cellen = rijen[r] || [];
      uit.push('<row r="' + (r + 1) + '">');
      for (var c = 0; c < cellen.length; c++) {
        var v = cellen[c];
        if (v === null || v === undefined || v === "") continue;
        var ref = kolomletter(c) + (r + 1);
        var stijl = r === 0 ? ' s="1"' : "";
        if (typeof v === "number" && isFinite(v)) {
          uit.push('<c r="' + ref + '"' + stijl + "><v>" + v + "</v></c>");
        } else {
          uit.push('<c r="' + ref + '"' + stijl + ' t="inlineStr"><is><t xml:space="preserve">' +
            esc(v) + "</t></is></c>");
        }
      }
      uit.push("</row>");
    }
    uit.push("</sheetData>");
    // automatisch filter op de kopregel
    if (rijen.length && rijen[0].length) {
      uit.push('<autoFilter ref="A1:' + kolomletter(rijen[0].length - 1) + rijen.length + '"/>');
    }
    uit.push("</worksheet>");
    return uit.join("");
  }

  function zip(bestanden) {
    var delen = [], centraal = [], offset = 0;
    bestanden.forEach(function (b) {
      var naam = bytes(b.naam), data = b.data;
      var crc = crc32(data);
      var kop = new Uint8Array(30 + naam.length);
      var dv = new DataView(kop.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(8, 0, true);              // geen compressie
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, naam.length, true);
      kop.set(naam, 30);
      delen.push(kop, data);

      var cd = new Uint8Array(46 + naam.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(10, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, naam.length, true);
      cv.setUint32(42, offset, true);
      cd.set(naam, 46);
      centraal.push(cd);
      offset += kop.length + data.length;
    });
    var centraalLengte = centraal.reduce(function (s, c) { return s + c.length; }, 0);
    var eind = new Uint8Array(22);
    var ev = new DataView(eind.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, bestanden.length, true);
    ev.setUint16(10, bestanden.length, true);
    ev.setUint32(12, centraalLengte, true);
    ev.setUint32(16, offset, true);
    return new Blob(delen.concat(centraal, [eind]),
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function maakXlsx(bladen) {
    var namen = bladen.map(function (b, i) {
      return (b.naam || "Blad" + (i + 1)).replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31);
    });
    var bestanden = [];

    bestanden.push({
      naam: "[Content_Types].xml",
      data: bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        bladen.map(function (_, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType=' +
            '"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join("") + "</Types>")
    });

    bestanden.push({
      naam: "_rels/.rels",
      data: bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>")
    });

    bestanden.push({
      naam: "xl/workbook.xml",
      data: bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        namen.map(function (n, i) {
          return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join("") + "</sheets></workbook>")
    });

    bestanden.push({
      naam: "xl/_rels/workbook.xml.rels",
      data: bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        bladen.map(function (_, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/' +
            'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join("") +
        '<Relationship Id="rId' + (bladen.length + 1) + '" Type="http://schemas.openxmlformats.org/' +
        'officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>")
    });

    bestanden.push({
      naam: "xl/styles.xml",
      data: bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF154273"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf xfId="0"/>' +
        '<xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        "</styleSheet>")
    });

    bladen.forEach(function (b, i) {
      bestanden.push({
        naam: "xl/worksheets/sheet" + (i + 1) + ".xml",
        data: bytes(bladXml(b.rijen || []))
      });
    });

    return zip(bestanden);
  }

  global.maakXlsx = maakXlsx;
})(window);
