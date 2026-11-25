// Wit en geel: in de score-app is 'wit' ALTIJD de speler met de witte bal (links, begint), ook als de planner die speler als TWEEDE doorgaf.
// Controleert bij beide kleurkeuzes: wie links staat, wie begint, welk doel bij wie hoort, dat de uitslag bij de JUISTE club-id in de planner komt
// (winnaar, scores, beurten, hoogste reeks) en dat de klassementspunten bij de juiste speler staan.
// ECHTE testplanner + ECHT Pi-programma + de app. Verzonnen gegevens.
// Gebruik: TESTSERVER=<map Testserver> PYTHON=<python met Flask> node tests/test-wit-geel.js <map van de score-app>
const { chromium } = require('playwright');
const path = require('path');
const { start, sleep, wacht } = require('./lib/omgeving.js');
const REPO = path.resolve(process.argv[2] || '.');
const res = []; const check = (n, ok, e) => { res.push(ok); console.log((ok ? '  OK   ' : '  FOUT ') + n + (e && !ok ? '  [' + String(e).slice(0, 260) + ']' : '')); };
const GROEN = 'rgb(46, 204, 113)', ROOD = 'rgb(231, 76, 60)', GRIJS = 'rgb(189, 195, 199)';

(async () => {
  // Statische controle: de oude, verwarrende namen mogen nergens meer staan (js + index.html)
  const fs = require('fs');
  const oud = [...fs.readdirSync(path.join(REPO, 'js')).filter(f => f.endsWith('.js')).map(f => path.join(REPO, 'js', f)), path.join(REPO, 'index.html')]
    .filter(f => /state\.player[12]\b/.test(fs.readFileSync(f, 'utf8')));
  check('nergens in de app staat nog state.player1 of state.player2 (het is nu state.wit en state.geel)', oud.length === 0, oud.join(', '));
  const o = await start(REPO); let browser;
  try {
    o.sql(`pass
for i, (cid, vn, an, disc, cat) in enumerate([('2001','Anna','Alfa','Vrijspel','1'), ('2002','Bert','Beta','Vrijspel','1'), ('4001','Hilde','Theta','Dames','0'), ('4002','Ine','Iota','Dames','0')]):
    c.execute("INSERT INTO users (first_name,last_name,email,password_hash) VALUES (?,?,?,'x')", (vn, an, f'u{i}@voorbeeld.test'))
    uid = c.execute("SELECT last_insert_rowid()").fetchone()[0]
    c.execute("INSERT INTO player_stats (user_id,club_id,player_number,discipline,category,points,coeff,mode) VALUES (?,?,?,?,?,?,?,?)", (uid, cid, str(i+1).zfill(2), disc, cat, '20' if disc == 'Vrijspel' else '1', '1,000', 'max -10%'))`);
    const instelling = (k, w) => o.sql(`c.execute("INSERT INTO club_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (${JSON.stringify(k)}, ${JSON.stringify(String(w))}))`);
    const wis = () => o.sql(`c.execute("DELETE FROM club_settings WHERE key LIKE 'punten_%'")`);
    browser = await chromium.launch();
    const adm = await browser.newContext(); const ap = await adm.newPage();
    await ap.goto(o.SERVER + '/admin/login'); await ap.fill('input[name=email]', 'test@test.test'); await ap.fill('input[name=pw]', 'testwachtwoord'); await ap.click('button.btn'); await ap.waitForURL('**/admin');

    let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); let app = await ctx.newPage(); const errs = []; app.on('pageerror', e => errs.push(e.message)); app.on('dialog', d => d.accept());
    let wifi = true;
    await ctx.route('**/api/match-result', r => wifi ? r.continue() : r.abort('internetdisconnected'));
    async function opstarten() {
      await app.goto('http://127.0.0.1:8123/index.html');
      const sch = app.locator('#verbindingScherm');
      if (await sch.isVisible().catch(() => false) || (await wacht(async () => await sch.isVisible(), 3000))) {
        const code = await wacht(async () => (await sch.innerText()).match(/\b(\d{6})\b/)?.[1], 5000);
        if (code) await adm.request.post(o.SERVER + '/admin/toestellen', { form: { actie: 'goedkeuren', code, naam: 'T' }, maxRedirects: 0 });
        await sch.waitFor({ state: 'hidden', timeout: 20000 });
      }
      await wacht(async () => (await app.evaluate(() => state.players.length)) >= 4, 15000);
    }
    await opstarten();
    let nr = 0;
    // Speel: planner geeft A (eerste) en B (tweede) door. witNr = 1 of 2 = wie de witte bal krijgt. Wie begint scoort 'wit' punten per beurt, de ander 'geel'.
    async function speel(a, b, witNr, winstWit, winstGeel) {
      nr++; const id = `${Math.min(a, b)}-${Math.max(a, b)}`;
      await app.evaluate(([id, a, b]) => {
        const pa = state.players.find(p => p.id === a), pb = state.players.find(p => p.id === b);
        state.matches = state.matches.filter(m => m.id !== id);
        state.matches.push({ id, date: '2026-11-23', time: '20:00', table: 1, p1: pa.name, p2: pb.name, referee: null, p1_club_id: a, p2_club_id: b, target1: pa.target, target2: pb.target,
          discipline: 'Vrijspel', cat: '1', match_type: 'Speler', completed: false, whitePlayer: null, p1Score: 0, p2Score: 0, p1Turns: [], p2Turns: [], p1Highest: 0, p2Highest: 0 });
        selectMatch(id);
      }, [id, a, b]);
      await app.waitForFunction(() => state.currentPage === 4);
      await app.evaluate(n => { selectWhitePlayer(n); startMatch(); }, witNr);
      await app.waitForFunction(() => state.currentPage === 5);
      const begin = await app.evaluate(() => ({ wit: state.currentMatch.p1, geel: state.currentMatch.p2, witId: state.currentMatch.p1_club_id, geelId: state.currentMatch.p2_club_id,
        witDoel: state.wit.target, geelDoel: state.geel.target, witIsWit: state.wit.isWhite, geelIsWit: state.geel.isWhite, aanDeBeurt: state.currentPlayer,
        links: document.querySelector('.player-card.player-white')?.innerText || '', rechts: document.querySelector('.player-card.player-yellow')?.innerText || '' }));
      let guard = 0;
      while (!(await app.evaluate(() => state.matchEnded)) && guard++ < 300) {
        await app.evaluate(([w, g]) => { const n = state.currentPlayer === 1 ? w : g; if (n > 0) changeScore(n); window.addScore(); }, [winstWit, winstGeel]);
      }
      await app.waitForFunction(() => state.currentPage === 6, null, { timeout: 15000 });
      const eind = await app.evaluate(() => ({ witScore: state.wit.score, witBeurten: state.wit.turns.length, geelScore: state.geel.score, geelBeurten: state.geel.turns.length, witHoogste: state.wit.highestSeries }));
      await wacht(async () => o.sqlJson(`print(json.dumps(c.execute("select count(*) from match_results where match_id=?", (${JSON.stringify(id)},)).fetchone()[0]))`) === 1, 8000);
      const rij = o.sqlJson(`r=c.execute("select player1_club_id,player1_score,player1_beurten,player2_club_id,player2_score,player2_beurten,winner_club_id from match_results where match_id=?", (${JSON.stringify(id)},)).fetchone(); print(json.dumps(list(r)))`);
      return { begin, eind, rij };
    }
    const doelA = 20, doelB = 20;

    console.log('1. Planner: A eerst, B tweede. A krijgt de witte bal (de gewone situatie)');
    let r = await speel(2001, 2002, 1, 2, 1);
    check('links (wit) staat A (Anna), rechts (geel) staat B (Bert); A begint', r.begin.wit.includes('Anna') && r.begin.geel.includes('Bert') && r.begin.aanDeBeurt === 1 && r.begin.witIsWit === true && r.begin.geelIsWit === false, JSON.stringify(r.begin));
    check('club-id\'s horen bij dezelfde speler (wit = 2001, geel = 2002)', r.begin.witId === 2001 && r.begin.geelId === 2002, JSON.stringify(r.begin));
    check('in de planner staat als eerste de witte speler (2001) en als tweede de gele (2002), met de juiste scores', String(r.rij[0]) === '2001' && String(r.rij[3]) === '2002' && r.rij[1] === r.eind.witScore && r.rij[4] === r.eind.geelScore, JSON.stringify([r.rij, r.eind]));
    check('winnaar is de witte speler A (2001): hij haalde zijn doel', String(r.rij[6]) === '2001', JSON.stringify(r.rij));
    await app.evaluate(() => showPage(1));

    console.log('2. Planner: A eerst, B tweede. B krijgt de witte bal (de wissel)');
    r = await speel(2001, 2002, 2, 2, 1);
    check('links (wit) staat nu B (Bert), rechts (geel) staat A (Anna); B begint', r.begin.wit.includes('Bert') && r.begin.geel.includes('Anna') && r.begin.aanDeBeurt === 1 && r.begin.witIsWit === true, JSON.stringify(r.begin));
    check('de club-id\'s zijn mee omgewisseld (wit = 2002, geel = 2001)', r.begin.witId === 2002 && r.begin.geelId === 2001, JSON.stringify(r.begin));
    check('het scherm toont de kleuren bij de juiste naam (de witte kaart heeft Bert, de gele kaart Anna)', r.begin.links.includes('Bert') && r.begin.rechts.includes('Anna'), JSON.stringify([r.begin.links, r.begin.rechts]));
    check('in de planner staat de witte speler (2002) als eerste en A (2001) als tweede, scores bij de juiste club-id', String(r.rij[0]) === '2002' && String(r.rij[3]) === '2001' && r.rij[1] === r.eind.witScore && r.rij[4] === r.eind.geelScore, JSON.stringify([r.rij, r.eind]));
    check('winnaar is B (2002): hij was wit, begon en haalde zijn doel', String(r.rij[6]) === '2002', JSON.stringify(r.rij));
    await app.evaluate(() => showPage(1));

    console.log('3. De gele speler wint (zodat een foute koppeling van winnaar aan kleur opvalt)');
    r = await speel(2001, 2002, 2, 1, 2);
    check('B (wit, 2002) maakt 1 per beurt, A (geel, 2001) maakt 2 per beurt: A wint, winnaar-id 2001, scores bij de juiste club-id', String(r.rij[6]) === '2001' && String(r.rij[0]) === '2002' && r.rij[1] < r.rij[4], JSON.stringify([r.rij, r.eind]));
    await app.evaluate(() => showPage(1));

    console.log('4. Klassementspunten bij de juiste speler');
    r = await speel(2001, 2002, 2, 2, 1);
    const punten = await app.evaluate(() => [document.getElementById('summaryPunten1')?.textContent.trim(), document.getElementById('summaryPunten2')?.textContent.trim(), document.getElementById('summaryPlayer1')?.innerText, document.getElementById('summaryPlayer2')?.innerText]);
    check('het overzicht toont links de witte speler (Bert) met zijn punten en rechts Anna', /Bert/.test(punten[2]) && /Anna/.test(punten[3]) && punten[0] !== punten[1], JSON.stringify(punten));
    check('geen JavaScript-fouten', errs.length === 0, errs.join(' ; '));
  } catch (e) { check('test zonder onverwachte fout', false, String(e.stack || e).slice(0, 600)); }
  finally { if (browser) await browser.close(); await o.stop(); const bad = res.filter(x => !x).length; console.log(`\nResultaat: ${res.length - bad} van ${res.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`); process.exit(bad ? 1 : 0); }
})();
