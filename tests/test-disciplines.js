// Andere disciplines en categorieën in de score-app: de lijst van de club komt van de planner (menu's, volgorde, namen),
// letters als categorie (A, B) blijven letters, en een match in een andere discipline wordt nooit een andere discipline.
// ECHTE testplanner + ECHT Pi-programma + de app. Verzonnen gegevens.
// Gebruik: TESTSERVER=<map Testserver> PYTHON=<python met Flask> node tests/test-disciplines.js <map van de score-app>
const { chromium } = require('playwright');
const path = require('path');
const { start, sleep, wacht } = require('./lib/omgeving.js');
const REPO = path.resolve(process.argv[2] || '.');
const res = []; const check = (n, ok, e) => { res.push(ok); console.log((ok ? '  OK   ' : '  FOUT ') + n + (e && !ok ? '  [' + String(e).slice(0, 260) + ']' : '')); };

// [club_id, voornaam, achternaam, discipline, categorie, doel, tsg]
const SPELERS = [
  ['5001', 'Anna', 'Libreaa', 'Libre', 'A', 30, '1,000'], ['5002', 'Bert', 'Libreab', 'Libre', 'A', 30, '0,900'], ['5003', 'Cor', 'Libreac', 'Libre', 'A', 30, '0,800'],
  ['5004', 'Dirk', 'Librebd', 'Libre', 'B', 20, '0,700'], ['5005', 'Eva', 'Libreb', 'Libre', 'B', 20, '0,600'],
  ['5006', 'Fien', 'Kaderfa', 'Kader 47/2', '1', 40, '1,500'], ['5007', 'Gust', 'Kaderga', 'Kader 47/2', '1', 40, '1,400'],
  ['5008', 'Hilde', 'Poolha', 'Pool', '1', 10, '0,500'], ['5009', 'Ine', 'Poolia', 'Pool', '1', 10, '0,400'],
];
const MATCHEN = [['5001', 30, 25, '5002', 20, 25, 'Libre', 'A'], ['5001', 30, 28, '5003', 12, 28, 'Libre', 'A'], ['5004', 20, 30, '5005', 15, 30, 'Libre', 'B'], ['5006', 40, 30, '5007', 22, 30, 'Kader 47/2', '1']];

(async () => {
  const o = await start(REPO); let browser;
  try {
    o.sql(`import json
for i, (cid, vn, an, disc, cat, doel, tsg) in enumerate(json.loads(${JSON.stringify(JSON.stringify(SPELERS))})):
    c.execute("INSERT INTO users (first_name,last_name,email,password_hash) VALUES (?,?,?,'x')", (vn, an, f'u{i}@voorbeeld.test'))
    uid = c.execute("SELECT last_insert_rowid()").fetchone()[0]
    c.execute("INSERT INTO player_stats (user_id,club_id,player_number,discipline,category,points,coeff,mode) VALUES (?,?,?,?,?,?,?,?)", (uid, cid, str(i+1).zfill(2), disc, cat, str(doel), tsg, 'max -10%'))
for n, (a, sa, ba, b, sb, bb, disc, cat) in enumerate(json.loads(${JSON.stringify(JSON.stringify(MATCHEN))}), 1):
    c.execute("INSERT INTO match_results (match_id, played_date, discipline, categorie, status, winner_club_id, player1_club_id, player1_score, player1_beurten, player2_club_id, player2_score, player2_beurten, player1_hoogste_reeks, player2_hoogste_reeks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ('D%03d' % n, '2026-11-10', disc, cat, 'voltooid', a if sa >= sb else b, a, sa, ba, b, sb, bb, 5, 4))`);
    const instelling = (k, w) => o.sql(`c.execute("INSERT INTO club_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (${JSON.stringify(k)}, ${JSON.stringify(w)}))`);
    instelling('disciplines_lijst', JSON.stringify(['Libre', 'Kader 47/2', 'Pool']));
    instelling('disciplines_koppelingen', '[]');
    instelling('punten_ref_libre', '30');   // eigen referentiebeurten voor Libre; de rest valt onder "Andere" (20)

    browser = await chromium.launch();
    const adm = await browser.newContext(); const ap = await adm.newPage();
    await ap.goto(o.SERVER + '/admin/login'); await ap.fill('input[name=email]', 'test@test.test'); await ap.fill('input[name=pw]', 'testwachtwoord'); await ap.click('button.btn'); await ap.waitForURL('**/admin');
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const app = await ctx.newPage(); const errs = []; app.on('pageerror', e => errs.push(e.message)); app.on('dialog', d => d.accept());
    await app.goto('http://127.0.0.1:8123/index.html');
    const sch = app.locator('#verbindingScherm'); await sch.waitFor({ state: 'visible' });
    const code = await wacht(async () => (await sch.innerText()).match(/\b(\d{6})\b/)?.[1]);
    await adm.request.post(o.SERVER + '/admin/toestellen', { form: { actie: 'goedkeuren', code, naam: 'T' }, maxRedirects: 0 }); await sch.waitFor({ state: 'hidden' });
    await wacht(async () => (await app.evaluate(() => state.players.length)) >= SPELERS.length, 15000);
    await wacht(async () => (await app.evaluate(() => window.disciplineLijst().join('|'))) === 'Libre|Kader 47/2|Pool', 8000);

    console.log('1. De lijst van de club komt van de planner');
    check('de app kent de disciplines van de club: Libre, Kader 47/2, Pool', (await app.evaluate(() => window.disciplineLijst())).join('|') === 'Libre|Kader 47/2|Pool', await app.evaluate(() => window.disciplineLijst()));
    const cats = await app.evaluate(() => state.players.map(p => [p.name, p.discipline, p.category, typeof p.category]));
    check('letters als categorie blijven letters (A en B, niet allemaal "1")', cats.filter(c => c[1] === 'Libre').map(c => c[2]).sort().join('') === 'AAABB' && cats.filter(c => c[1] === 'Libre').every(c => c[3] === 'string'), JSON.stringify(cats.filter(c => c[1] === 'Libre')));
    check('cijfers als categorie blijven getallen (zoals altijd)', cats.filter(c => c[1] === 'Kader 47/2').every(c => c[2] === 1 && c[3] === 'number'), JSON.stringify(cats));

    check('referentiebeurten per discipline komen van de planner: Libre 30 (eigen), Kader 47/2 en Pool 20 (Andere)', (await app.evaluate(() => [window.referentiebeurten('Libre'), window.referentiebeurten('Kader 47/2'), window.referentiebeurten('Pool')].join())) === '30,20,20', await app.evaluate(() => JSON.stringify(window.puntenReferentie)));
    console.log('2. Rangschikking en kruistabel');
    const combos = await app.evaluate(() => { window.buildCompComboList(); return window.compComboList.map(x => x.discipline + ' ' + x.category); });
    check('volgorde van de club: Libre A, Libre B, Kader 47/2 1, Pool 1', combos.join('|') === 'Libre A|Libre B|Kader 47/2 1|Pool 1', combos.join('|'));
    async function toon(disc, cat, weergave) {
      await app.evaluate(async () => { await window.fetchMatchResultsFromAPI(); });
      return app.evaluate(([d, c, w]) => {
        showPage(20); window.buildCompComboList();
        const i = window.compComboList.findIndex(x => x.discipline === d && String(x.category) === String(c));
        if (i < 0) return null;
        window.goToCompCombo(i); window.switchCompView(w);
        return (w === 'leaderboard' ? document.getElementById('competitionLeaderboard') : document.getElementById('crossTableContainer')).innerText;
      }, [disc, cat, weergave]);
    }
    const lb = await toon('Libre', 'A', 'leaderboard');
    check('rangschikking Libre A: de drie spelers van A staan er, die van B niet', lb && ['Libreaa', 'Libreab', 'Libreac'].every(n => lb.includes(n)) && !lb.includes('Librebd'), (lb || '').slice(0, 200));
    const lb2 = await toon('Libre', 'B', 'leaderboard');
    check('rangschikking Libre B: de twee spelers van B', lb2 && lb2.includes('Librebd') && lb2.includes('Libreb') && !lb2.includes('Libreaa'), (lb2 || '').slice(0, 200));
    const kt = await toon('Libre', 'A', 'crosstable');
    check('kruistabel Libre A toont de drie spelers', kt && ['Libreaa', 'Libreab', 'Libreac'].every(n => kt.includes(n)), (kt || '').slice(0, 200));
    const kd = await toon('Kader 47/2', '1', 'leaderboard');
    check('rangschikking Kader 47/2 (met "/" en cijfer als categorie)', kd && kd.includes('Kaderfa') && kd.includes('Kaderga'), (kd || '').slice(0, 200));

    console.log('3. Vriendschappelijke match: de speltypes van de club');
    const kaarten = await app.evaluate(() => [...document.querySelectorAll('#step2GameType .config-card')].map(k => [k.getAttribute('data-gametype'), k.querySelector('.card-label').textContent]));
    check('kaartjes: Triatlon en Dubbeltje blijven, daarna Libre, Kader 47/2, Pool (geen Vrijspel meer)', kaarten.map(k => k[0]).join('|') === 'triatlon-small|triatlon-large|dubbeltje|libre|kader 47/2|pool' && kaarten[4][1] === 'Kader 47/2', JSON.stringify(kaarten));
    await app.evaluate(() => { state.friendlyMatch = { numPlayers: 2 }; });
    await app.evaluate(() => { try { window.selectGameType('kader 47/2'); } catch (e) {} });
    check('een kaartje kiezen zet het speltype op de discipline van de club', await app.evaluate(() => state.friendlyMatch.gameType) === 'kader 47/2');
    check('een discipline van de club vraagt om een doel, Triatlon en Dubbeltje niet, en iets onbekends niet', await app.evaluate(() => [window.isGewoneDiscipline('libre'), window.isGewoneDiscipline('Kader 47/2'), window.isGewoneDiscipline('dubbeltje'), window.isGewoneDiscipline('triatlon-large'), window.isGewoneDiscipline('vrijspel')].join()) === 'true,true,false,false,false');

    console.log('4. Een match in een andere discipline wordt nooit een andere discipline');
    async function eindig(gameType) {
      return app.evaluate(gt => {
        state.friendlyMatch = { gameType: gt, numPlayers: 2, players: { 1: { name: 'Een', target: 30, average: 1 }, 2: { name: 'Twee', target: 30, average: 1 } }, teams: null, orders: null,
          turnState: { matchEnded: false, firstToTarget: 'right', activeSide: 'left', leftTotalScore: 10, rightTotalScore: 30, leftTurns: [10], rightTurns: [30], leftHighestSeries: 10, rightHighestSeries: 30, leftPhase: 'vrijspel', rightPhase: 'vrijspel' } };
        try { window.endFriendlyMatch(); } catch (e) { /* de UI-update erna mag falen in de test */ }
        return state.currentMatch && state.currentMatch.discipline;
      }, gameType);
    }
    check('Libre blijft Libre', await eindig('libre') === 'Libre');
    check('Kader 47/2 blijft Kader 47/2 (met hoofdletters en schuine streep zoals in de planner)', await eindig('kader 47/2') === 'Kader 47/2');
    const onb = await eindig('iets onbekends');
    check('een onbekend speltype wordt NIET stilzwijgend Driebanden', onb !== 'Driebanden' && !!onb, onb);
    const afk = await app.evaluate(() => [window.disciplineAfkorting('Libre'), window.disciplineAfkorting('Kader 38/2'), window.disciplineAfkorting('Pool'), window.disciplineAfkorting('Vrijspel'), window.disciplineAfkorting('Driebanden'), window.disciplineAfkorting('Bandstoten')]);
    check('afkortingen: LI, KA, PO, en de bekende VS, DB, BS (een "3" in de naam maakt er geen DB van)', afk.join() === 'LI,KA,PO,VS,DB,BS', afk.join());

    console.log('5. Zonder instelling van de club: de oude, standaard indeling');
    o.sql(`c.execute("DELETE FROM club_settings WHERE key IN ('disciplines_lijst','disciplines_koppelingen')")`);
    await app.reload(); await sleep(2500);
    await wacht(async () => (await app.evaluate(() => window.disciplineLijst().join('|'))) === 'Vrijspel|Bandstoten|Driebanden', 15000);
    const k2 = await app.evaluate(() => [...document.querySelectorAll('#step2GameType .config-card')].map(k => k.getAttribute('data-gametype')));
    check('de kaartjes zijn weer Vrijspel, Bandstoten, Driebanden (naast Triatlon en Dubbeltje)', k2.join('|') === 'triatlon-small|triatlon-large|dubbeltje|vrijspel|bandstoten|driebanden', k2.join('|'));
    check('zonder instellingen: Driebanden 40 beurten, Vrijspel en Bandstoten 20 (zoals vroeger)', (await app.evaluate(() => [window.referentiebeurten('Vrijspel'), window.referentiebeurten('Bandstoten'), window.referentiebeurten('Driebanden')].join())) === '20,20,40');
    check('volgorde en afkortingen zoals vroeger', (await app.evaluate(() => ['Driebanden', 'Vrijspel', 'Bandstoten'].sort(window.disciplineVolgorde).join())) === 'Vrijspel,Bandstoten,Driebanden');
    check('geen JavaScript-fouten', errs.length === 0, errs.join(' ; '));
  } catch (e) { check('test zonder onverwachte fout', false, String(e.stack || e).slice(0, 600)); }
  finally { if (browser) await browser.close(); await o.stop(); const bad = res.filter(x => !x).length; console.log(`\nResultaat: ${res.length - bad} van ${res.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`); process.exit(bad ? 1 : 0); }
})();
