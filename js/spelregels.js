// js/spelregels.js — de spelregels van de fase-spellen (Dubbeltje en Triatlon) op ÉÉN plaats.
// Wil je een getal veranderen (een drempel, een maximum per beurt of het doel), dan doe je dat hier en nergens anders.
//
// Een fase-spel heeft drie fases (vrijspel, bandstoten, driebanden). Per fase:
//   drempel  = hoeveel punten een team in die fase moet maken om naar de volgende fase te gaan
//   limiet   = hoeveel punten een speler maximaal in één beurt mag maken (daarna is zijn partner aan de beurt; 99 = geen limiet)
// Het doel van het spel is de som van de drempels (Dubbeltje: 40 + 20 + 10 = 70).
(function() {
    const GEEN = 99;
    const SPELREGELS = Object.freeze({
        // Dubbeltje: het spel dat de club zelf uitgedacht heeft
        'dubbeltje':      Object.freeze({ drempels: Object.freeze({ vrijspel: 40, bandstoten: 20, driebanden: 10 }), limieten: Object.freeze({ vrijspel: 3, bandstoten: 2, driebanden: 1 }) }),
        'triatlon-small': Object.freeze({ drempels: Object.freeze({ vrijspel: 20, bandstoten: 10, driebanden: 5 }),  limieten: Object.freeze({ vrijspel: GEEN, bandstoten: GEEN, driebanden: GEEN }) }),
        'triatlon-large': Object.freeze({ drempels: Object.freeze({ vrijspel: 40, bandstoten: 20, driebanden: 10 }), limieten: Object.freeze({ vrijspel: GEEN, bandstoten: GEEN, driebanden: GEEN }) }),
        // Triatlon met 3 spelers
        'drie-spelers':   Object.freeze({ drempels: Object.freeze({ vrijspel: 40, bandstoten: 20, driebanden: 10 }), limieten: Object.freeze({ vrijspel: GEEN, bandstoten: GEEN, driebanden: GEEN }) }),
        // Gewone spellen (1 tegen 1): geen fases
        'standaard':      Object.freeze({ drempels: Object.freeze({ vrijspel: 999, bandstoten: 999, driebanden: 999 }), limieten: Object.freeze({ vrijspel: GEEN, bandstoten: GEEN, driebanden: GEEN }) }),
    });
    const FASESPELLEN = Object.freeze(['triatlon-small', 'triatlon-large', 'dubbeltje']);

    window.SPELREGELS = SPELREGELS;
    // Zijn dit spelregels met fases?
    window.isFaseSpel = function(spel) { return FASESPELLEN.includes(spel); };
    // De regels van een spel (onbekend spel = gewoon 1 tegen 1)
    window.spelregelsVan = function(spel) { return SPELREGELS[spel] || SPELREGELS.standaard; };
    // Het doel van een fase-spel: de som van de drempels (Dubbeltje: 70)
    window.spelDoel = function(spel) {
        const d = window.spelregelsVan(spel).drempels;
        return d.vrijspel + d.bandstoten + d.driebanden;
    };
})();
