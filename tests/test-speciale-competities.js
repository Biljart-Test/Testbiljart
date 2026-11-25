// Speciale competities in de score-app (bv. Dames en Veteranen, elk met eigen punten): knop met code, een competitie kiezen als er meer zijn,
// alleen de spelers van die competitie, de uitslag onder de juiste discipline en de punten volgens de regels van die competitie.
// ECHTE testplanner + ECHT Pi-programma + de app. Verzonnen gegevens.
// Gebruik: TESTSERVER=<map Testserver> PYTHON=<python met Flask> node tests/test-speciale-competities.js <map van de score-app>
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
for i, (cid, vn, an, disc, cat) in enumerate([('2001','Anna','Alfa','Vrijspel','1'), ('2002','Bert','Beta','Vrijspel','1'), ('4001','Hilde','Theta','Dames','0'), ('4002','Ine','Iota','Dames','0'), ('5001','Vera','Vet','Veteranen','0'), ('5002','Wim','Wijs','Veteranen','0')]):
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
    const zetCompetities = lijst => instelling('speciale_competities', JSON.stringify(lijst));
    zetCompetities(['Dames', 'Veteranen']); instelling('dames_code', '4711');
    instelling('punten_sc_veteranen_winst', 5); instelling('punten_sc_veteranen_gelijk', 3); instelling('punten_sc_veteranen_verlies', 0);
    await opstarten();
    const knopZichtbaar = () => app.evaluate(() => { const b = document.getElementById('speciaalKnop'); return !!b && b.offsetParent !== null; });
    async function typ(code) { for (const k of code) await app.locator('#speciaalDigits button', { hasText: new RegExp('^' + k + '$') }).click(); }
    async function codeIntypen(code) { await app.click('#speciaalKnop'); await app.waitForSelector('#speciaalPinOverlay'); await typ(code); }

    console.log('1. De knop en de lijst van de planner');
    check('de app kent de speciale competities van de planner: Dames en Veteranen', JSON.stringify(await app.evaluate(() => window.speciaalLijst())) === '["Dames","Veteranen"]');
    check('de knop heet "Speciale competitie" en is zichtbaar (er is een code)', (await knopZichtbaar()) && (await app.locator('#speciaalKnop').innerText()).includes('Speciale competitie'), await app.locator('#speciaalKnop').innerText());
    check('Veteranen telt als speciale competitie, Vrijspel niet', await app.evaluate(() => window.isSpeciaal('Veteranen') && window.isSpeciaal('veteranen') && !window.isSpeciaal('Vrijspel')));

    console.log('2. Code, dan de competitie kiezen (er zijn er twee)');
    await codeIntypen('0000');
    check('een foute code geeft een melding en de competitiekeuze verschijnt niet', (await app.locator('#speciaalPinError').innerText()).includes('Foute code') && await app.locator('#speciaalKeuzeOverlay').count() === 0);
    await typ('4711');
    await app.waitForSelector('#speciaalKeuzeOverlay', { timeout: 5000 });
    check('de goede code geeft de keuze tussen de twee competities', JSON.stringify(await app.$$eval('#speciaalKeuzeLijst button', b => b.map(x => x.dataset.competitie))) === '["Dames","Veteranen"]');
    await app.click('#speciaalKeuzeLijst button[data-competitie=Veteranen]');
    await app.waitForSelector('#speciaalKeuzeOverlay', { state: 'detached' });
    await app.waitForSelector('#speciaalSpelersLijst button', { timeout: 8000 });
    check('de spelerskeuze heet "Veteranen" en toont enkel de spelers van Veteranen (Vet Vera, Wijs Wim), niet die van Dames of Vrijspel', (await app.locator('#speciaalKeuzeOverlay h2').innerText()).includes('Veteranen') && JSON.stringify((await app.$$eval('#speciaalSpelersLijst button', b => b.map(x => x.textContent))).sort()) === JSON.stringify(['Vet Vera', 'Wijs Wim']), await app.$$eval('#speciaalSpelersLijst button', b => b.map(x => x.textContent)));
    await app.locator('#speciaalSpelersLijst button').nth(0).click(); await app.locator('#speciaalSpelersLijst button').nth(1).click();
    await app.click('#speciaalStartBtn');
    await app.waitForFunction(() => state.currentPage === 4, null, { timeout: 8000 });
    check('de match is een match van Veteranen, zonder categorie of doel (discipline Veteranen)', await app.evaluate(() => state.currentMatch.discipline === 'Veteranen' && state.currentMatch.cat === 0), await app.evaluate(() => JSON.stringify(state.currentMatch)));

    console.log('3. Spelen en de uitslag');
    await app.evaluate(() => { selectWhitePlayer(1); startMatch(); });
    await app.waitForFunction(() => state.currentPage === 5);
    check('bij een speciale competitie staat geen doel in de kop (zoals bij Dames)', (await app.locator('#headerTarget1').innerText()) === '');
    let guard = 0;
    while (!(await app.evaluate(() => state.matchEnded)) && guard++ < 100) {
      await app.evaluate(() => { if (state.currentPlayer === 1) changeScore(1); window.addScore(); });
    }
    await app.waitForFunction(() => state.currentPage === 6, null, { timeout: 15000 });
    check('de match eindigt na 20 beurten per speler (speciale competitie), niet pas bij een doel', await app.evaluate(() => state.wit.turns.length === 20 && state.geel.turns.length === 20), await app.evaluate(() => [state.wit.turns.length, state.geel.turns.length]));
    await wacht(async () => o.sqlJson(`print(json.dumps(c.execute("select count(*) from match_results where discipline='Veteranen'").fetchone()[0]))`) === 1, 8000);
    const rij = o.sqlJson(`r=c.execute("select discipline, categorie, player1_club_id, player1_score, player2_club_id, player2_score from match_results").fetchone(); print(json.dumps(list(r)))`);
    check('de planner bewaart de uitslag onder de discipline Veteranen (categorie 0)', rij[0] === 'Veteranen' && String(rij[1]) === '0' && String(rij[2]) === '5001', JSON.stringify(rij));
    await wacht(async () => (await app.evaluate(() => (document.getElementById('summaryPunten1') || {}).textContent || '')).trim() !== '…', 8000);
    const pnt = await app.evaluate(() => [document.getElementById('summaryPunten1').textContent.trim(), document.getElementById('summaryPunten2').textContent.trim()]);
    check('de punten volgen de regels van Veteranen (5 - 3 - 0): winnaar Vera krijgt 5, verliezer Wim 0 (niet de 3 en 1 van Dames)', pnt[0].replace('+', '') === '5' && pnt[1] === '0', JSON.stringify(pnt));

    console.log('4. Eén speciale competitie: geen keuze meer');
    await app.evaluate(() => showPage(1));
    zetCompetities(['Dames']); await opstarten();
    await codeIntypen('4711');
    await app.waitForSelector('#speciaalSpelersLijst button', { timeout: 8000 });
    check('met maar één speciale competitie gaat het meteen naar de spelerskeuze (Dames: Theta Hilde, Iota Ine)', await app.locator('#speciaalKeuzeOverlay h2').innerText().then(t => t.includes('Dames')) && JSON.stringify((await app.$$eval('#speciaalSpelersLijst button', b => b.map(x => x.textContent))).sort()) === JSON.stringify(['Iota Ine', 'Theta Hilde']));
    await app.click('#speciaalAnnuleerBtn');

    console.log('5. Geen speciale competities');
    zetCompetities([]); await opstarten();
    check('zonder speciale competities is de knop verborgen, ook met een code', !(await knopZichtbaar()));
    check('geen JavaScript-fouten', errs.length === 0, errs.join(' ; '));
  } catch (e) { check('test zonder onverwachte fout', false, String(e.stack || e).slice(0, 600)); }
  finally { if (browser) await browser.close(); await o.stop(); const bad = res.filter(x => !x).length; console.log(`\nResultaat: ${res.length - bad} van ${res.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`); process.exit(bad ? 1 : 0); }
})();
