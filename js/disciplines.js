// js/disciplines.js — de disciplines van de club op ÉÉN plaats.
//
// De planner bepaalt welke disciplines de club heeft (en hun volgorde): ze komen mee met /api/club en worden hier bewaard.
// Zolang de planner nog niet geantwoord heeft, geldt de standaard (Vrijspel, Bandstoten, Driebanden).
// Alles wat een naam, volgorde, kleur of afkorting van een discipline nodig heeft, vraagt het hier, nooit met een vaste lijst.
(function() {
    const STANDAARD = ['Vrijspel', 'Bandstoten', 'Driebanden'];
    const DAMES = 'Dames';
    // Bekende disciplines: afkorting, kleurklasse (badge) en kleur van de titel. Alles wat hier niet staat krijgt een neutrale stijl.
    const BEKEND = {
        vrijspel:   { afk: 'VS', badge: 'badge-vs', kleur: '#f39c12', icoon: '🎯', sub: 'Klassiek' },
        bandstoten: { afk: 'BS', badge: 'badge-bs', kleur: '#3498db', icoon: '📐', sub: '1 Band' },
        driebanden: { afk: 'DB', badge: 'badge-db', kleur: '#e74c3c', icoon: '💥', sub: '3 Banden' },
        dames:      { afk: 'D',  badge: 'badge-dames', kleur: '#e84393', icoon: '🌸', sub: '' }
    };
    const NEUTRAAL = { badge: 'badge-vs', kleur: '#95a5a6', icoon: '⚪', sub: '' };
    let lijst = STANDAARD.slice();
    let koppelingen = [];

    window.zetDisciplines = function(nieuweLijst, nieuweKoppelingen) {
        if (Array.isArray(nieuweLijst) && nieuweLijst.length > 0) {
            lijst = nieuweLijst.map(String).filter(function(d) { return d.trim() !== ''; });
            if (lijst.length === 0) lijst = STANDAARD.slice();
        }
        if (Array.isArray(nieuweKoppelingen)) koppelingen = nieuweKoppelingen;
        if (typeof window.bouwDisciplineKeuzes === 'function') window.bouwDisciplineKeuzes();
    };
    window.disciplineLijst = function() { return lijst.slice(); };
    window.disciplineKoppelingen = function() { return koppelingen.slice(); };

    function info(naam) { return BEKEND[String(naam || '').toLowerCase()] || NEUTRAAL; }
    // Afkorting voor een badge: bekende vaste, anders de eerste twee letters (hoofdletters)
    window.disciplineAfkorting = function(naam) {
        const b = BEKEND[String(naam || '').toLowerCase()];
        if (b) return b.afk;
        return String(naam || '??').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '??';
    };
    window.disciplineBadgeKlasse = function(naam) { return info(naam).badge; };
    window.disciplineKleur = function(naam) { return info(naam).kleur; };
    window.disciplineIcoon = function(naam) { return info(naam).icoon; };
    window.disciplineOndertitel = function(naam) { return info(naam).sub; };

    // Sleutel van het speltype (kleine letters) en weer terug naar de echte naam. Een onbekende naam blijft zoals ze is:
    // er wordt NOOIT stilzwijgend een andere discipline van gemaakt.
    window.disciplineSleutel = function(naam) { return String(naam || '').toLowerCase(); };
    window.disciplineVanSleutel = function(sleutel) {
        const s = String(sleutel || '').toLowerCase();
        const gevonden = lijst.find(function(d) { return d.toLowerCase() === s; });
        if (gevonden) return gevonden;
        if (s === DAMES.toLowerCase()) return DAMES;
        return String(sleutel || '');
    };
    // Is dit speltype een gewone 1-tegen-1 discipline van de club (met doel en gemiddelde)?
    window.isGewoneDiscipline = function(sleutel) {
        const s = String(sleutel || '').toLowerCase();
        return lijst.some(function(d) { return d.toLowerCase() === s; });
    };
    // Volgorde: eerst de volgorde van de club, dan onbekende (alfabetisch), Dames laatst
    function plaats(naam) {
        const i = lijst.findIndex(function(d) { return d.toLowerCase() === String(naam).toLowerCase(); });
        if (i >= 0) return i;
        return String(naam).toLowerCase() === DAMES.toLowerCase() ? 100000 : 50000;
    }
    window.disciplineVolgorde = function(a, b) {
        const d = plaats(a) - plaats(b);
        return d !== 0 ? d : String(a).localeCompare(String(b));
    };
    window.sorteerDisciplines = function(namen) { return namen.slice().sort(window.disciplineVolgorde); };

    // Categorieën: een getal blijft een getal (zoals altijd), letters of woorden blijven tekst (A, B, C)
    window.leesCategorie = function(waarde) {
        const t = String(waarde === null || waarde === undefined ? '' : waarde).trim();
        return /^\d+$/.test(t) ? parseInt(t, 10) : t;
    };
    window.heeftCategorie = function(c) { return c !== null && c !== undefined && String(c).trim() !== '' && !(typeof c === 'number' && isNaN(c)); };
    // Eerst de getallen (op waarde), dan de letters (alfabetisch)
    window.vergelijkCategorie = function(a, b) {
        const na = typeof a === 'number', nb = typeof b === 'number';
        if (na && nb) return a - b;
        if (na) return -1;
        if (nb) return 1;
        return String(a).localeCompare(String(b));
    };

    // De kaartjes voor een vriendschappelijke match: de speltypes van de club (Triatlon en Dubbeltje blijven staan)
    window.bouwDisciplineKeuzes = function() {
        const ouder = document.querySelector('#step2GameType .config-options');
        if (!ouder) return;
        const kaarten = Array.from(ouder.querySelectorAll('.config-card'));
        kaarten.forEach(function(k) { if (!window.isFaseSpel(k.getAttribute('data-gametype'))) k.remove(); });   // Triatlon en Dubbeltje (js/spelregels.js) blijven
        lijst.forEach(function(naam) {
            const k = document.createElement('div');
            k.className = 'config-card';
            k.setAttribute('data-gametype', window.disciplineSleutel(naam));
            k.setAttribute('data-discipline-kaart', '1');
            const ic = document.createElement('div'); ic.className = 'card-icon'; ic.textContent = window.disciplineIcoon(naam);
            const lb = document.createElement('div'); lb.className = 'card-label'; lb.textContent = naam;
            const sb = document.createElement('div'); sb.className = 'card-sublabel'; sb.textContent = window.disciplineOndertitel(naam);
            k.appendChild(ic); k.appendChild(lb); k.appendChild(sb);
            k.addEventListener('click', function() { window.selectGameType(window.disciplineSleutel(naam)); });
            ouder.appendChild(k);
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { window.bouwDisciplineKeuzes(); });
    else window.bouwDisciplineKeuzes();
})();
