// De volgorde van het klassement (instelling van het bestuur op de planner: klassementspunten is een regel in de lijst) wordt ook in de score-app gebruikt.
// ECHTE testplanner + ECHT Pi-programma + de app. Verzonnen gegevens.
// Gebruik: TESTSERVER=<map Testserver> PYTHON=<python met Flask> node tests/test-klassementvolgorde.js <map van de score-app>
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
    const sorteer = (volgorde, lijst) => app.evaluate(([v, l]) => { window.klassementVolgorde = v; return l.slice().sort(window.klassementVergelijking()).map(x => x.name); }, [volgorde, lijst]);
    const sp = (name, p, coef, hr, gem, gesp) => ({ name, totalCompPoints: p, coefficient: coef, highestSeries: hr, average: gem, matchesPlayed: gesp === undefined ? 5 : gesp });
    const q = [sp('A', 10, 1, 5, 2.0), sp('B', 30, 1, 5, 0.5), sp('C', 20, 1, 5, 1.0)];

    console.log('1. De planner geeft de volgorde mee');
    let club = await app.evaluate(() => serverFetch('/api/club').then(r => r.json()));
    check('/api/club bevat de volgorde, met de klassementspunten bovenaan (standaard)', Array.isArray(club.klassement_volgorde) && club.klassement_volgorde[0] === 'punten' && club.klassement_volgorde.length === 5, JSON.stringify(club.klassement_volgorde));
    check('de score-app heeft de volgorde ontvangen', JSON.stringify(await app.evaluate(() => window.klassementVolgorde)) === JSON.stringify(club.klassement_volgorde));

    console.log('2. De score-app sorteert zoals de planner');
    check('standaard (punten eerst): B, C, A', JSON.stringify(await sorteer(['punten', 'coef', 'hoogste_reeks', 'gemiddelde', 'minste_matchen'], q)) === '["B","C","A"]');
    check('gemiddelde eerst, punten daaronder: A, C, B', JSON.stringify(await sorteer(['gemiddelde', 'punten', 'coef', 'hoogste_reeks', 'minste_matchen'], q)) === '["A","C","B"]');
    check('zonder bekende volgorde: de standaard (punten eerst)', JSON.stringify(await sorteer(null, q)) === '["B","C","A"]');
    check('een oude volgorde zonder punten: de punten komen bovenaan', JSON.stringify(await sorteer(['gemiddelde', 'coef'], q)) === '["B","C","A"]');
    check('wie niet speelde staat onderaan, ook als gemiddelde eerst telt', JSON.stringify(await sorteer(['gemiddelde', 'punten'], [sp('Z', 0, 9, 9, 9, 0), sp('Y', 1, 1, 1, 0.1, 1)])) === '["Y","Z"]');
    check('gelijk in alles: alfabetisch', JSON.stringify(await sorteer(['punten'], [sp('zoe', 5, 1, 1, 1), sp('Anna', 5, 1, 1, 1), sp('bert', 5, 1, 1, 1)])) === '["Anna","bert","zoe"]');
    check('coëfficiënt 1,0004 en 1,0001 zijn gelijk (de planner rekent op 3 decimalen), dan beslist de hoogste reeks', JSON.stringify(await sorteer(['coef', 'hoogste_reeks'], [sp('X', 5, 1.0004, 3, 1), sp('W', 5, 1.0001, 9, 1)])) === '["W","X"]');
    check('minste matchen eerst: wie er minder voor nodig had staat hoger', JSON.stringify(await sorteer(['minste_matchen'], [sp('M', 5, 1, 1, 1, 9), sp('N', 5, 1, 1, 1, 3)])) === '["N","M"]');

    console.log('3. Een andere volgorde op de planner komt in de app aan');
    o.sql(`c.execute("INSERT INTO club_settings (key,value) VALUES ('klassement_volgorde','gemiddelde,punten,coef,hoogste_reeks,minste_matchen') ON CONFLICT(key) DO UPDATE SET value=excluded.value")`);
    club = await app.evaluate(() => serverFetch('/api/club').then(r => r.json()));
    check('/api/club geeft nu de nieuwe volgorde (gemiddelde eerst)', JSON.stringify(club.klassement_volgorde) === '["gemiddelde","punten","coef","hoogste_reeks","minste_matchen"]', JSON.stringify(club.klassement_volgorde));
    await opstarten();
    check('na opnieuw opstarten gebruikt de score-app de nieuwe volgorde', JSON.stringify(await app.evaluate(() => window.klassementVolgorde)) === '["gemiddelde","punten","coef","hoogste_reeks","minste_matchen"]');
    check('en het klassement sorteert er mee (gemiddelde eerst: A, C, B)', JSON.stringify(await app.evaluate(l => l.slice().sort(window.klassementVergelijking()).map(x => x.name), q)) === '["A","C","B"]');
    console.log('4. De regel voor het nieuwe doel (mode) en het percentage van de planner');
    const nieuwDoel = (mode, daling, gem) => app.evaluate(([mode, daling, gem]) => {
      window.maxDaling = daling;
      state.players = [{ id: 'm1', name: 'Mo Del', discipline: 'Vrijspel', category: 1, target: 40, tsg: '2,000', mode }];
      const m = { discipline: 'Vrijspel', category: 1, winner_club_id: 'x', players: [{ club_id: 'm1', score: Math.round(gem * 100), beurten: 100, hoogste_reeks: 5 }, { club_id: 'm2', score: 10, beurten: 100 }] };
      const r = calculatePlayerStatsFromAPI('m1', 'Mo Del', 'Vrijspel', 1, [m]);
      return [Math.round(r.tsgvs * 1000) / 1000, r.ptnvs];
    }, [mode, daling, gem]);
    check('slecht jaar (gemiddelde 1,6; doel was 40): bij 10% van de planner naar 36', JSON.stringify(await nieuwDoel('max', 10, 1.6)) === '[1.8,36]', JSON.stringify(await nieuwDoel('max', 10, 1.6)));
    check('bij 8% naar 37 (1,84) en bij 12% naar 36 (1,76): het percentage komt van de planner', JSON.stringify(await nieuwDoel('max', 8, 1.6)) === '[1.84,37]' && JSON.stringify(await nieuwDoel('max', 12, 1.6)) === '[1.76,36]');
    check('"kan niet verminderen" (en de oude schrijfwijze "kleiner"): het doel blijft 40', JSON.stringify(await nieuwDoel('kan niet verminderen', 8, 1.6)) === '[2,40]' && JSON.stringify(await nieuwDoel('kleiner', 10, 1.6)) === '[2,40]');
    check('de oude waarde "max -10%" volgt het percentage van de club (8%: 37)', JSON.stringify(await nieuwDoel('max -10%', 8, 1.6)) === '[1.84,37]');
    check('de regel wordt in gewone taal getoond (max -8% / kan niet verminderen); zonder percentage van de planner 10', await app.evaluate(() => { window.maxDaling = 8; const a = [modeTekst('max'), modeTekst('K')]; window.maxDaling = undefined; return JSON.stringify(a.concat([modeTekst('max -10%')])); }) === '["max -8%","kan niet verminderen","max -10%"]');
    check('geen JavaScript-fouten', errs.length === 0, errs.join(' ; '));
  } catch (e) { check('test zonder onverwachte fout', false, String(e.stack || e).slice(0, 600)); }
  finally { if (browser) await browser.close(); await o.stop(); const bad = res.filter(x => !x).length; console.log(`\nResultaat: ${res.length - bad} van ${res.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`); process.exit(bad ? 1 : 0); }
})();
