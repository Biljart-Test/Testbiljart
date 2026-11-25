// Het overzicht na een competitiematch toont de klassementspunten van beide spelers (groen bij plus, rood bij min, grijs bij nul).
// De PLANNER rekent ze uit en stuurt ze terug bij het verzenden van de uitslag; de app rekent zelf niets.
// ECHTE testplanner + ECHT Pi-programma + de app. Verzonnen gegevens.
// Gebruik: TESTSERVER=<map Testserver> PYTHON=<python met Flask> node tests/test-matchoverzicht.js <map van de score-app>
const { chromium } = require('playwright');
const path = require('path');
const { start, sleep, wacht } = require('./lib/omgeving.js');
const REPO = path.resolve(process.argv[2] || '.');
const res = []; const check = (n, ok, e) => { res.push(ok); console.log((ok ? '  OK   ' : '  FOUT ') + n + (e && !ok ? '  [' + String(e).slice(0, 260) + ']' : '')); };
const GROEN = 'rgb(46, 204, 113)', ROOD = 'rgb(231, 76, 60)', GRIJS = 'rgb(189, 195, 199)';

(async () => {
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
    // Speel een match tussen twee spelers: elke beurt maakt speler A "winst" punten, speler B "winstB" punten (tot de match eindigt)
    async function speel(a, b, disc, cat, winstA, winstB) {
      nr++; const id = `${a}_${b}_2026-11-23_${nr}`;
      await app.evaluate(([id, a, b, disc, cat]) => {
        const pa = state.players.find(p => p.id === a && p.discipline === disc), pb = state.players.find(p => p.id === b && p.discipline === disc);
        state.matches.push({ id, date: '2026-11-23', time: '20:00', table: 1, p1: pa.name, p2: pb.name, referee: null, p1_club_id: a, p2_club_id: b, target1: pa.target, target2: pb.target,
          discipline: disc, cat, match_type: 'Speler', completed: false, whitePlayer: null, p1Score: 0, p2Score: 0, p1Turns: [], p2Turns: [], p1Highest: 0, p2Highest: 0 });
        selectMatch(id);
      }, [id, a, b, disc, cat]);
      await app.waitForFunction(() => state.currentPage === 4);
      await app.evaluate(() => { selectWhitePlayer(1); startMatch(); });
      await app.waitForFunction(() => state.currentPage === 5);
      let guard = 0;
      while (!(await app.evaluate(() => state.matchEnded)) && guard++ < 200) {
        await app.evaluate(([wa, wb]) => { const n = state.currentPlayer === 1 ? wa : wb; if (n > 0) changeScore(n); window.addScore(); }, [winstA, winstB]);
      }
      await app.waitForFunction(() => state.currentPage === 6, null, { timeout: 15000 });
      const lees = nr_ => app.evaluate(n => { const el = document.getElementById('summaryPunten' + n); return el ? { tekst: el.textContent.trim(), kleur: getComputedStyle(el).color } : null; }, nr_);
      await wacht(async () => (await lees(1)) && (await lees(1)).tekst !== '…', 8000);
      return { p1: await lees(1), p2: await lees(2), eind: await app.evaluate(() => [state.wit.score, state.wit.turns.length, state.geel.score, state.geel.turns.length]) };
    }

    console.log('1. Standaard (beurtenbonus)');
    let r = await speel(2001, 2002, 'Vrijspel', 1, 2, 1);
    check('A haalt zijn doel van 20 in 10 beurten (+10, groen); B maakte in dezelfde 10 beurten 10 punten (0, grijs)', r.p1 && r.p2 && r.p1.tekst === '+10' && r.p1.kleur === GROEN && r.p2.tekst === '0' && r.p2.kleur === GRIJS, JSON.stringify(r));
    check('beide spelers hadden evenveel beurten (10)', r.eind[1] === r.eind[3], JSON.stringify(r.eind));
    await app.evaluate(() => showPage(1));
    r = await speel(2001, 2002, 'Vrijspel', 1, 1, 0);
    check('A haalt zijn doel pas in 20 beurten (0, grijs); B maakte 0 punten (-5, rood: de ondergrens)', r.p1.tekst === '0' && r.p1.kleur === GRIJS && r.p2.tekst === '-5' && r.p2.kleur === ROOD, JSON.stringify(r));
    check('het label "Klassementspunten" staat in het overzicht', (await app.locator('#summaryPlayer1').innerText()).toLowerCase().includes('klassementspunten'));
    // dezelfde punten staan in de planner
    const inPlanner = o.sqlJson(`print(json.dumps([[r[0], r[1]] for r in c.execute("select player1_club_id, player2_club_id from match_results order by rowid")]))`);
    check('de uitslagen staan in de planner', inPlanner.length === 2);

    console.log('2. Winst / gelijkspel / verlies (3-2-1)');
    instelling('punten_systeem', 'wvg'); await opstarten();
    r = await speel(2001, 2002, 'Vrijspel', 1, 2, 1);
    check('winnaar +3 (groen), verliezer +1 (groen)', r.p1.tekst === '+3' && r.p1.kleur === GROEN && r.p2.tekst === '+1' && r.p2.kleur === GROEN, JSON.stringify(r));
    await app.evaluate(() => showPage(1));
    wis(); instelling('punten_systeem', 'wvg'); instelling('punten_winst', 5); instelling('punten_gelijk', 3); instelling('punten_verlies', 0); await opstarten();
    r = await speel(2001, 2002, 'Vrijspel', 1, 2, 1);
    check('met 5-3-0: winnaar +5 (groen), verliezer 0 (grijs)', r.p1.tekst === '+5' && r.p2.tekst === '0' && r.p2.kleur === GRIJS, JSON.stringify(r));
    await app.evaluate(() => showPage(1));

    console.log('3. Dames');
    wis(); await opstarten();
    r = await speel(4001, 4002, 'Dames', 0, 3, 1);
    check('dames: winnares +3 (groen), de andere +1 (groen)', r.p1.tekst === '+3' && r.p2.tekst === '+1' && r.p1.kleur === GROEN, JSON.stringify(r));
    await app.evaluate(() => showPage(1));

    console.log('4. De verbinding valt weg bij het versturen');
    wifi = false;
    r = await speel(2001, 2002, 'Vrijspel', 1, 2, 1);
    check('geen punten uit de lucht gegrepen: er staat dat ze volgen zodra de uitslag verstuurd is', r.p1.tekst.includes('volgen zodra') && r.p2.tekst.includes('volgen zodra'), JSON.stringify(r));
    wifi = true;
    check('geen JavaScript-fouten', errs.length === 0, errs.join(' ; '));
  } catch (e) { check('test zonder onverwachte fout', false, String(e.stack || e).slice(0, 600)); }
  finally { if (browser) await browser.close(); await o.stop(); const bad = res.filter(x => !x).length; console.log(`\nResultaat: ${res.length - bad} van ${res.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`); process.exit(bad ? 1 : 0); }
})();
