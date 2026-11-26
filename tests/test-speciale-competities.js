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

    console.log('6. Spelregels per speciale competitie (doel en maximum aantal beurten van de planner)');
    await app.evaluate(() => showPage(1));
    instelling('speciale_regels', JSON.stringify({ Dames: { doel: 5, beurten: 12 }, Veteranen: { doel: 30, beurten: 25 } }));
    zetCompetities(['Dames', 'Veteranen']); await opstarten();
    check('de app kent de spelregels van de planner (Veteranen 30 punten en 25 beurten, Dames 5 en 12)', JSON.stringify(await app.evaluate(() => [window.speciaalSpel('Veteranen'), window.speciaalSpel('dames'), window.speciaalSpel('Onbekend')])) === '[{"doel":30,"beurten":25},{"doel":5,"beurten":12},{"doel":20,"beurten":20}]', JSON.stringify(await app.evaluate(() => [window.speciaalSpel('Veteranen'), window.speciaalSpel('dames'), window.speciaalSpel('Onbekend')])));
    const wisUitslagen = () => o.sql(`c.execute("DELETE FROM match_results")`);      // anders zijn de twee spelers 'al tegen elkaar geweest' en blijft de startknop uit
    async function speelCompetitie(naam, aantalKliks) {
      wisUitslagen();
      await codeIntypen('4711');
      await app.waitForSelector('#speciaalKeuzeOverlay');
      await app.click(`#speciaalKeuzeLijst button[data-competitie=${naam}]`);
      await app.waitForSelector('#speciaalSpelersLijst button', { timeout: 8000 });
      await app.locator('#speciaalSpelersLijst button').nth(0).click(); await app.locator('#speciaalSpelersLijst button').nth(1).click();
      await app.click('#speciaalStartBtn');
      await app.waitForFunction(() => state.currentPage === 4, null, { timeout: 8000 });
      const doel = await app.evaluate(() => [state.currentMatch.eersteDoel, state.currentMatch.tweedeDoel]);
      await app.evaluate(() => { selectWhitePlayer(1); startMatch(); });
      await app.waitForFunction(() => state.currentPage === 5);
      const witDoel = await app.evaluate(() => state.wit.target);
      let guard = 0;
      while (!(await app.evaluate(() => state.matchEnded)) && guard++ < 200) await app.evaluate(() => { if (state.currentPlayer === 1) changeScore(1); window.addScore(); });
      const beurten = await app.evaluate(() => [state.wit.turns.length, state.geel.turns.length, state.wit.score]);
      return { doel, witDoel, beurten };
    }
    let r6 = await speelCompetitie('Veteranen');
    check('Veteranen: het doel van de match is 30 (niet 20) en de match loopt tot 25 beurten per speler (de witte speler haalt 30 punten niet eerder)', JSON.stringify(r6.doel) === '[30,30]' && r6.witDoel === 30 && r6.beurten[0] === 25 && r6.beurten[1] === 25, JSON.stringify(r6));
    await app.waitForFunction(() => state.currentPage === 6, null, { timeout: 15000 });
    await app.evaluate(() => showPage(1));
    r6 = await speelCompetitie('Dames');
    check('Dames met doel 5 en 12 beurten: de match eindigt zodra wit 5 punten haalt (met een nabeurt voor geel), na 5 beurten per speler', JSON.stringify(r6.doel) === '[5,5]' && r6.witDoel === 5 && r6.beurten[0] === 5 && r6.beurten[1] === 5 && r6.beurten[2] === 5, JSON.stringify(r6));
    await app.waitForFunction(() => state.currentPage === 6, null, { timeout: 15000 });
    await app.evaluate(() => showPage(1));
    wisUitslagen(); instelling('speciale_regels', JSON.stringify({ Dames: { doel: 100, beurten: 12 }, Veteranen: { doel: 30, beurten: 25 } })); await opstarten();
    await codeIntypen('4711'); await app.waitForSelector('#speciaalKeuzeOverlay');
    await app.click('#speciaalKeuzeLijst button[data-competitie=Dames]'); await app.waitForSelector('#speciaalSpelersLijst button', { timeout: 8000 });
    await app.locator('#speciaalSpelersLijst button').nth(0).click(); await app.locator('#speciaalSpelersLijst button').nth(1).click(); await app.click('#speciaalStartBtn');
    await app.waitForFunction(() => state.currentPage === 4); await app.evaluate(() => { selectWhitePlayer(1); startMatch(); }); await app.waitForFunction(() => state.currentPage === 5);
    await app.evaluate(() => { for (let i = 0; i < 3; i++) { if (state.currentPlayer === 1) changeScore(1); window.addScore(); if (state.currentPlayer === 2) window.addScore(); } });
    const groepen = await app.evaluate(() => document.querySelectorAll('.turn-group').length);
    const rijen = await app.evaluate(() => document.querySelectorAll('.turn-row').length);
    check('de lijst met beurten toont voor een competitie met 12 beurten per speler 3 groepjes (5 + 5 + 2), dus 24 plaatsen voor twee spelers, geen vaste 20', groepen === 6 && rijen === 24, JSON.stringify([groepen, rijen]));
    await app.evaluate(() => showPage(1));
    console.log('7. Zonder doel, en zonder maximum aantal beurten');
    await app.evaluate(() => showPage(1));
    instelling('speciale_regels', JSON.stringify({ Dames: { doel: 0, beurten: 6 }, Veteranen: { doel: 8, beurten: 0 } }));
    zetCompetities(['Dames', 'Veteranen']); await opstarten();
    check('de app kent "geen doel" (Dames 0 en 6) en "geen maximum" (Veteranen 8 en 0); allebei 0 wordt 20 en 20', JSON.stringify(await app.evaluate(() => [window.speciaalSpel('Dames'), window.speciaalSpel('Veteranen')])) === '[{"doel":0,"beurten":6},{"doel":8,"beurten":0}]');
    const spelKeuze = async (naam) => {
      wisUitslagen(); await codeIntypen('4711'); await app.waitForSelector('#speciaalKeuzeOverlay');
      await app.click(`#speciaalKeuzeLijst button[data-competitie=${naam}]`); await app.waitForSelector('#speciaalSpelersLijst button', { timeout: 8000 });
      await app.locator('#speciaalSpelersLijst button').nth(0).click(); await app.locator('#speciaalSpelersLijst button').nth(1).click(); await app.click('#speciaalStartBtn');
      await app.waitForFunction(() => state.currentPage === 4); await app.evaluate(() => { selectWhitePlayer(1); startMatch(); }); await app.waitForFunction(() => state.currentPage === 5);
    };
    await spelKeuze('Dames');
    check('zonder doel: de match heeft geen bereikbaar doel (hij kan dus niet vroeg eindigen)', await app.evaluate(() => state.wit.target >= window.GEEN_DOEL && state.geel.target >= window.GEEN_DOEL));
    for (let i = 0; i < 5; i++) await app.evaluate(() => { changeScore(state.currentPlayer === 1 ? 60 : 10); window.addScore(); });
    check('na enorme scores (60 per beurt) is de match na 5 beurten per speler nog niet voorbij: er is geen doel', !(await app.evaluate(() => state.matchEnded)) && await app.evaluate(() => state.wit.turns.length === 3 && state.geel.turns.length === 2), await app.evaluate(() => [state.wit.turns.length, state.geel.turns.length, state.wit.score]));
    let g = 0;
    while (!(await app.evaluate(() => state.matchEnded)) && g++ < 40) await app.evaluate(() => { changeScore(state.currentPlayer === 1 ? 60 : 10); window.addScore(); });
    check('de match eindigt pas als beide spelers 6 beurten gespeeld hebben; wit (de meeste punten) wint', await app.evaluate(() => state.wit.turns.length === 6 && state.geel.turns.length === 6 && state.currentMatch.winner === state.currentMatch.wit), await app.evaluate(() => [state.wit.turns.length, state.geel.turns.length, state.currentMatch.winner]));
    await app.waitForFunction(() => state.currentPage === 6, null, { timeout: 15000 });
    check('in het overzicht staat bij het doel een streepje (geen 99999)', !(await app.locator('#page6, body').first().innerText()).includes('99999'));
    await app.evaluate(() => showPage(1));
    await spelKeuze('Veteranen');
    check('zonder maximum: de match gaat gewoon door voorbij 20 beurten (30 beurten gespeeld, nog geen einde bij een laag doel van 8: 0 punten gescoord)', await (async () => { for (let i = 0; i < 60; i++) await app.evaluate(() => { window.addScore(); }); return !(await app.evaluate(() => state.matchEnded)) && await app.evaluate(() => state.wit.turns.length === 30 && state.geel.turns.length === 30); })());
    const groepenGroei = await app.evaluate(() => document.querySelectorAll('.turn-group').length);
    check('de lijst met beurten groeit mee: 30 gespeelde beurten en ruimte voor de volgende = 7 groepjes van 5 per speler, dus 14 (niet vast 8)', groepenGroei === 14, groepenGroei);
    for (let i = 0; i < 8; i++) { if (await app.evaluate(() => state.matchEnded)) break; await app.evaluate(() => { if (state.currentPlayer === 1) changeScore(2); window.addScore(); }); }
    check('zodra wit zijn doel (8 punten) haalt, eindigt de match (met nabeurt voor geel)', await app.evaluate(() => state.matchEnded && state.wit.score === 8), await app.evaluate(() => [state.matchEnded, state.wit.score, state.wit.turns.length, state.geel.turns.length]));
    await app.waitForFunction(() => state.currentPage === 6, null, { timeout: 15000 });
    await app.evaluate(() => showPage(1));
    console.log('5. Geen speciale competities');
    zetCompetities([]); await opstarten();
    check('zonder speciale competities is de knop verborgen, ook met een code', !(await knopZichtbaar()));
    check('geen JavaScript-fouten', errs.length === 0, errs.join(' ; '));
  } catch (e) { check('test zonder onverwachte fout', false, String(e.stack || e).slice(0, 600)); }
  finally { if (browser) await browser.close(); await o.stop(); const bad = res.filter(x => !x).length; console.log(`\nResultaat: ${res.length - bad} van ${res.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`); process.exit(bad ? 1 : 0); }
})();
