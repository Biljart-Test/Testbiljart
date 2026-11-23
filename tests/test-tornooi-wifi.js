// Tornooimatch waarbij de verbinding wegvalt net op het einde: de uitslag mag niet verloren gaan, en niet dubbel verstuurd worden.
// ECHTE testplanner + ECHT lokaal Pi-programma + score-app. Verzonnen gegevens.
// Gebruik: TESTSERVER=<map Testserver> PYTHON=<python met Flask> node tests/test-tornooi-wifi.js <map van de score-app>
const { chromium } = require('playwright');
const path = require('path');
const { start, sleep, wacht } = require('./lib/omgeving.js');
const REPO = path.resolve(process.argv[2] || '.');
const res = []; const check = (n, ok, e) => { res.push(ok); console.log((ok ? '  OK   ' : '  FOUT ') + n + (e && !ok ? '  [' + String(e).slice(0, 200) + ']' : '')); };
(async () => {
  const o = await start(REPO); let browser;
  try {
    o.sql(`[c.execute("INSERT INTO users (first_name,last_name,email,password_hash) VALUES (?,?,?,'x')",(f'Speler{i}',f'Test{i:02d}',f's{i}@voorbeeld.test')) for i in range(1,5)]`);
    browser = await chromium.launch();
    const adm = await browser.newContext(); const ap = await adm.newPage(); ap.on('dialog', d => d.accept());
    await ap.goto(o.SERVER + '/admin/login'); await ap.fill('input[name=email]', 'test@test.test'); await ap.fill('input[name=pw]', 'testwachtwoord'); await ap.click('button.btn'); await ap.waitForURL('**/admin');
    await ap.goto(o.SERVER + '/admin/tournaments');
    await ap.selectOption('select[name=tier]', 'Silver'); await ap.selectOption('#slotsSelect', '4'); await ap.selectOption('select[name=uitschakeling]', 'enkel');
    await ap.fill('input[name=eigen_naam]', 'Mini'); await ap.selectOption('select[name=year_range]', { index: 1 });
    await ap.click('button:has-text("Tornooi Aanmaken")'); await ap.waitForLoadState();
    await ap.locator('tr', { hasText: 'Mini' }).locator('a:has-text("Beheer")').click(); await ap.waitForLoadState();
    await ap.click('summary:has-text("Plaats voor plaats invullen")');
    for (let i = 1; i <= 4; i++) await ap.selectOption(`#member_${i}`, { label: `Test0${i} Speler${i}` });
    await ap.click('button[name="loting"]'); await ap.waitForLoadState(); await ap.click('button:has-text("Bracket Starten")'); await ap.waitForLoadState();
    const vandaag = o.sql(`print(__import__('datetime').date.today().isoformat())`).trim();
    o.sql(`c.execute("UPDATE tournament_matches SET match_date=?, match_time='20:00', table_nr='1' WHERE status='pending' AND player1_participant_id IS NOT NULL AND player2_participant_id IS NOT NULL",('${vandaag}',))`);
    const klaar = () => o.sqlJson(`print(json.dumps(c.execute("select count(*) from tournament_matches where status='voltooid'").fetchone()[0]))`);
    const pi = async p => (await fetch('http://127.0.0.1:5000' + p)).json();

    let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); let app = await ctx.newPage(); app.on('dialog', d => d.accept());
    await app.goto('http://127.0.0.1:8123/index.html');
    const sch = app.locator('#verbindingScherm'); await sch.waitFor({ state: 'visible' });
    const code = await wacht(async () => (await sch.innerText()).match(/\b(\d{6})\b/)?.[1]);
    await adm.request.post(o.SERVER + '/admin/toestellen', { form: { actie: 'goedkeuren', code, naam: 'T' }, maxRedirects: 0 }); await sch.waitFor({ state: 'hidden' });
    const posts = []; let wifi = false;
    await ctx.route('**/api/tournament/match-result', r => { if (!wifi) return r.abort('internetdisconnected'); posts.push(1); return r.continue(); });

    console.log('1. Een tornooimatch spelen terwijl de verbinding op het einde wegvalt');
    await app.click('button:has-text("Officiële Matchen Ophalen")'); await app.waitForSelector('.match-card:visible');
    await app.locator('.match-card:visible').first().click(); await app.click('.ball-option >> nth=0'); await app.click('#startMatchBtn');
    for (let i = 0; i < 14 && !(await app.evaluate(() => state.matchEnded)); i++) { await app.evaluate(() => { const n = state.currentPlayer === 1 ? 9 : 4; for (let k = 0; k < n; k++) changeScore(1); window.addScore(); }); await sleep(100); }
    await sleep(2500);
    check('de match is afgelopen', await app.evaluate(() => state.matchEnded));
    check('de planner heeft de uitslag niet gekregen (verbinding was weg)', (await klaar()) === 0);
    const bk = await pi('/backups');
    check('de back-up van de afgewerkte match staat veilig op de Pi', bk.length === 1 && bk[0].completed === true && /^T\d+M\d+$/.test(bk[0].matchId), JSON.stringify(bk).slice(0, 100));

    console.log('2. Herstart van de Pi (lege browser) met verbinding');
    wifi = true;
    await ctx.close(); ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route('**/api/tournament/match-result', r => { posts.push(1); return r.continue(); });
    app = await ctx.newPage(); app.on('dialog', d => d.accept());
    await app.goto('http://127.0.0.1:8123/index.html');
    check('de uitslag wordt vanzelf alsnog naar de planner gestuurd', !!(await wacht(async () => (await klaar()) === 1, 15000)));
    check('precies één keer verstuurd (geen dubbele uitslag)', posts.length === 1, posts.length);
    check('daarna is de back-up op de Pi gewist (anders wordt hij bij elke start opnieuw verstuurd)', !!(await wacht(async () => (await pi('/backups')).length === 0, 8000)), JSON.stringify(await pi('/backups')).slice(0, 100));

    console.log('3. Nog een herstart: er gebeurt niets meer');
    posts.length = 0;
    await ctx.close(); ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route('**/api/tournament/match-result', r => { posts.push(1); return r.continue(); });
    app = await ctx.newPage(); app.on('dialog', d => d.accept()); await app.goto('http://127.0.0.1:8123/index.html'); await sleep(5000);
    check('geen nieuwe verzending bij een volgende start', posts.length === 0, posts.length);
    check('de planner heeft nog steeds één uitslag', (await klaar()) === 1);

    console.log('4. Een normale match zonder storing');
    await app.click('button:has-text("Officiële Matchen Ophalen")'); await app.waitForSelector('.match-card:visible', { timeout: 10000 }).catch(() => {});
    check('de lijst toont alleen de andere, nog niet gespeelde match van ronde 1 (de gespeelde komt niet terug)', (await app.locator('.match-card:visible').count()) === 1);
    await ctx.close();
  } catch (e) { check('test zonder onverwachte fout', false, String(e.message || e).slice(0, 400)); }
  finally { if (browser) await browser.close(); await o.stop(); const bad = res.filter(x => !x).length; console.log(`\nResultaat: ${res.length - bad} van ${res.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`); process.exit(bad ? 1 : 0); }
})();
