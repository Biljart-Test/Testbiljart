// js/verbinding.js — verbinding met de planner via het lokale Pi-programma (vervangt lock.js)
//
// Hoe het werkt:
//  * Het lokale programma op de Pi (http://localhost:5000) kent het serveradres, de geheime sleutel van dit toestel
//    en weet of de planner het toestel heeft goedgekeurd.
//  * Zolang het toestel niet goedgekeurd of niet verbonden is, staat er een blokscherm over de app
//    (met de koppelcode die in de planner getypt moet worden). Er wordt dan NIET gespeeld.
//  * Alle aanroepen naar de planner lopen via serverFetch(): die wacht tot alles in orde is en stuurt de sleutel mee.
//  * Er worden geen spelers of matchen op de Pi bewaard om offline te spelen: geen verbinding = op papier noteren.
(function() {
    const LOKAAL = 'http://localhost:5000';
    window.LOKAAL_URL = LOKAAL;

    let serverUrl = '';
    let sleutel = '';
    let klaar, maakKlaar;
    function nieuweBelofte() { klaar = new Promise(function(r) { maakKlaar = r; }); }
    nieuweBelofte();
    let isKlaar = false;
    let controleBezig = false;
    let overlay = null;

    // ---- blokscherm
    function toon(icoon, titel, tekst, code) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'verbindingScherm';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1a1a2e;color:#fff;display:flex;flex-direction:column;' +
                'align-items:center;justify-content:center;gap:24px;text-align:center;padding:24px;font-family:inherit;';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = '<div style="font-size:4rem;">' + icoon + '</div>' +
            '<h1 style="margin:0;">' + titel + '</h1>' +
            (code ? '<div style="font-size:5rem;font-weight:900;letter-spacing:12px;color:#00d2d3;">' + code + '</div>' : '') +
            '<p style="color:#cbd5e1;margin:0;max-width:640px;font-size:1.25rem;line-height:1.5;">' + tekst + '</p>';
        overlay.style.display = 'flex';
    }
    function verberg() { if (overlay) overlay.style.display = 'none'; }

    // Zolang het scherm er staat, mogen de toetsen van de presenter niets in de app doen.
    document.addEventListener('keydown', function(e) {
        if (overlay && overlay.style.display !== 'none') { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);

    // ---- het lokale programma
    async function lokaalJson(pad) {
        const r = await fetch(LOKAAL + pad, { cache: 'no-store' });
        if (!r.ok) throw new Error('lokaal ' + r.status);
        return r.json();
    }

    function ietsActiefBezig() {
        // Midden in een match nooit een blokscherm: de uitslag komt in de wachtrij en gaat later alsnog weg.
        return typeof state !== 'undefined' && state && state.currentMatch && !state.matchEnded;
    }

    async function controle() {
        if (controleBezig) return;
        controleBezig = true;
        try {
            for (;;) {
                let st;
                try {
                    st = await lokaalJson('/status');
                } catch (e) {
                    toon('🛠️', 'Het toestel is nog niet klaar', 'Het lokale programma op dit toestel antwoordt niet. Wacht even of herstart het toestel. Lukt het niet, vraag het bestuur.');
                    await wacht(3000); continue;
                }
                if (st.status === 'goedgekeurd') {
                    sleutel = (await lokaalJson('/sleutel')).sleutel;
                    serverUrl = st.server_url;
                    verberg(); isKlaar = true; maakKlaar();
                    laadClubnaam();
                    return;
                }
                if (st.status === 'wacht' && st.koppelcode) {
                    toon('🔗', 'Nieuw toestel koppelen', 'Open in de planner de pagina <b>Toestellen</b> en typ daar deze code in, samen met een naam voor dit toestel (bv. Tafel 1).', st.koppelcode);
                } else if (st.status === 'uitgeschakeld') {
                    toon('⛔', 'Dit toestel is uitgeschakeld', 'Het bestuur heeft dit toestel uitgeschakeld in de planner. Vraag het bestuur om het weer in te schakelen.');
                } else if (st.status === 'geen_verbinding') {
                    toon('📡', 'Geen verbinding met de planner', 'Er wordt niet gespeeld zonder verbinding, zodat dezelfde match nooit op twee tafels wordt gespeeld. Noteer de match op papier. Zodra de verbinding terug is, gaat dit scherm vanzelf weg.');
                } else if (st.status === 'geen_config') {
                    toon('⚙️', 'Instellingen ontbreken', 'Dit toestel weet nog niet bij welke club het hoort. Vraag het bestuur om het instellingenbestand <b>biljart.txt</b> in te vullen.');
                } else {
                    toon('⏳', 'Bezig met verbinden…', 'Een ogenblik geduld.');
                }
                await wacht(2000);
            }
        } finally {
            controleBezig = false;
        }
    }
    function wacht(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    // ---- aanroepen naar de planner
    window.serverFetch = async function(pad, opties) {
        await klaar;
        const o = Object.assign({}, opties || {});
        o.headers = Object.assign({}, o.headers || {}, { 'X-Toestel-Sleutel': sleutel });
        const r = await fetch(serverUrl + pad, o);
        if (r.status === 401 && isKlaar) {
            // de planner kent dit toestel niet (meer): terug naar het koppelscherm, tenzij er een match bezig is
            if (!ietsActiefBezig()) { isKlaar = false; nieuweBelofte(); controle(); }
        }
        return r;
    };
    // Adres op de planner voor een link of QR-code (de telefoonpagina van een vriendschappelijke match)
    window.serverUrl = function(pad) { return serverUrl + pad; };

    async function laadClubnaam() {
        try {
            const r = await window.serverFetch('/api/club');
            if (!r.ok) return;
            const d = await r.json();
            window.clubNaam = d.naam_voluit || d.naam_kort || '';
            // Codes van het bestuur (komen enkel naar een goedgekeurd toestel): Beheer Matchen en de speciale competities
            window.klassementVolgorde = Array.isArray(d.klassement_volgorde) ? d.klassement_volgorde : null;   // waarop het klassement gerangschikt wordt (van het bestuur)
            window.minDoelPerDiscipline = d.min_doel || {};   // kleinste doel per discipline (0 = geen)
            window.maxDaling = d.max_daling;   // procent dat een speler volgend seizoen hoogstens mag zakken
            window.puntenReferentie = d.referentiebeurten || null;   // referentiebeurten per discipline (puntentelling van het bestuur)
            if (typeof window.zetDisciplines === 'function') window.zetDisciplines(d.disciplines, d.koppelingen);   // de disciplines van de club
            window.beheerCode = d.beheer_code || '';
            if (typeof window.zetSpeciale === 'function') window.zetSpeciale(d.speciale_competities, d.speciale_regels);   // de speciale competities van de club (bv. Dames)
            window.speciaalCode = d.speciale_code || d.dames_code || '';             // één code voor alle speciale competities
            const speciaalKnop = document.getElementById('speciaalKnop'); if (speciaalKnop) speciaalKnop.style.display = (window.speciaalCode && window.speciaalLijst().length) ? '' : 'none';
            const beheer = document.querySelector('.header-buttons .upload-btn'); if (beheer) beheer.style.display = window.beheerCode ? '' : 'none';
            const kop = document.getElementById('clubNaamKop');
            if (kop) kop.textContent = window.clubNaam;
            if (d.naam_kort) document.title = d.naam_kort + ' Biljart';
        } catch (e) { /* de naam is niet kritiek */ }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', controle);
    else controle();
})();
