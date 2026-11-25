// Een heel tornooi met 32 spelers (dubbele uitschakeling, 62 matchen) uitspelen in de ECHTE score-app, met een ECHTE testplanner
// en het ECHTE lokale Pi-programma. Verzonnen gegevens, alles lokaal.
// Gebruik: TESTSERVER=<map Testserver> PYTHON=<python met Flask> node tests/test-tornooi32.js <map van de score-app>
const { chromium } = require('playwright');
const path = require('path');
const { start, sleep, wacht } = require('./lib/omgeving.js');
const REPO = path.resolve(process.argv[2] || '.');
const res = []; const check = (n, ok, e) => { res.push(ok); console.log((ok ? '  OK   ' : '  FOUT ') + n + (e && !ok ? '  [' + String(e).slice(0, 200) + ']' : '')); };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

(async () => {
  const o = await start(REPO);
  let browser, app;
  try {
    o.sql(`[c.execute("INSERT INTO users (first_name,last_name,email,password_hash) VALUES (?,?,?,'x')",(f'Speler{i}',f'Test{i:02d}',f's{i}@voorbeeld.test')) for i in range(1,33)]`);
    browser = await chromium.launch();
    const adm = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const ap = await adm.newPage(); ap.on('dialog', d => d.accept());
    console.log('1. Tornooi van 32 aanmaken in de planner');
    await ap.goto(o.SERVER + '/admin/login'); await ap.fill('input[name=email]', 'test@test.test'); await ap.fill('input[name=pw]', 'testwachtwoord'); await ap.click('button.btn'); await ap.waitForURL('**/admin');
    await ap.goto(o.SERVER + '/admin/tournaments');
    await ap.selectOption('select[name=tier]', 'Silver'); await ap.selectOption('#slotsSelect', '32'); await ap.selectOption('select[name=uitschakeling]', 'dubbel');
    await ap.fill('input[name=eigen_naam]', 'Test32'); await ap.selectOption('select[name=year_range]', { index: 1 });
    await ap.click('button:has-text("Tornooi Aanmaken")'); await ap.waitForLoadState();
    await ap.locator('tr', { hasText: 'Test32' }).locator('a:has-text("Beheer")').click(); await ap.waitForLoadState();
    await ap.click('summary:has-text("Plaats voor plaats invullen")');
    for (let i = 1; i <= 32; i++) await ap.selectOption(`#member_${i}`, { label: `Test${String(i).padStart(2, '0')} Speler${i}` });
    await ap.click('button[name="loting"]'); await ap.waitForLoadState();
    await ap.click('button:has-text("Bracket Starten")'); await ap.waitForLoadState();
    const tid = o.sqlJson(`print(json.dumps(c.execute("select id from tournaments").fetchone()[0]))`);
    const totaal = o.sqlJson(`print(json.dumps(c.execute("select count(*) from tournament_matches where tournament_id=?",(${tid},)).fetchone()[0]))`);
    check('62 matchen in het schema (dubbele uitschakeling, 32 spelers)', totaal === 62, totaal);
    const vandaag = o.sql(`print(__import__('datetime').date.today().isoformat())`).trim();
    // De planner plant wat speelklaar is (hier vereenvoudigd: alles van vandaag, tafel 1). Geeft het aantal nieuw geplande matchen.
    const plan = () => o.sqlJson(`n=c.execute("UPDATE tournament_matches SET match_date=?, match_time='20:00', table_nr='1' WHERE tournament_id=${tid} AND status='pending' AND match_date IS NULL AND player1_participant_id IS NOT NULL AND player2_participant_id IS NOT NULL",('${vandaag}',)).rowcount;c.commit();print(json.dumps(n))`);
    const openMatchen = () => o.sqlJson(`print(json.dumps([r[0] for r in c.execute("SELECT match_number FROM tournament_matches WHERE tournament_id=${tid} AND status='pending' AND match_date IS NOT NULL AND player1_participant_id IS NOT NULL AND player2_participant_id IS NOT NULL ORDER BY match_number")]))`);
    const status = n => o.sqlJson(`r=c.execute("SELECT status FROM tournament_matches WHERE tournament_id=${tid} AND match_number=?",(${n},)).fetchone();print(json.dumps(r[0]))`);

    console.log('2. De score-app koppelen');
    let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    app = await ctx.newPage(); const errs = []; app.on('pageerror', e => errs.push(e.message)); app.on('dialog', d => d.accept());
    await app.goto('http://127.0.0.1:8123/index.html');
    const sch = app.locator('#verbindingScherm'); await sch.waitFor({ state: 'visible', timeout: 15000 });
    const code = await wacht(async () => (await sch.innerText()).match(/\b(\d{6})\b/)?.[1]);
    await adm.request.post(o.SERVER + '/admin/toestellen', { form: { actie: 'goedkeuren', code, naam: 'Tafel 1' }, maxRedirects: 0 });
    await sch.waitFor({ state: 'hidden', timeout: 20000 });
    check('toestel gekoppeld', true);

    const naarLijst = async page => {
      if ((await page.evaluate(() => state.currentPage)) === 6) await page.click('button:has-text("Hoofdmenu") >> visible=true');   // zoals een speler: na afloop op Hoofdmenu drukken
      else if ((await page.evaluate(() => state.currentPage)) !== 1) await page.evaluate(() => showPage(1));
      await page.waitForSelector('button:has-text("Officiële Matchen Ophalen")', { state: 'visible' });
      await page.click('button:has-text("Officiële Matchen Ophalen")');
      await wacht(async () => (await page.locator('.match-card:visible').count()) > 0 || (await page.locator('body').innerText()).includes('Geen'), 8000);
      await sleep(900);
    };
    const kaarten = async page => page.locator('.match-card:visible').count();
    // Speel de eerste kaart in de lijst. De winnaar en de score komen uit een vaste reeks (zodat de test elke keer hetzelfde doet).
    const rnd = mulberry(32);
    const gespeeld = [];
    async function speelEersteMatch(page) {
      const tekst = await page.locator('.match-card:visible').first().innerText();
      await page.locator('.match-card:visible').first().click();
      await page.waitForFunction(() => state.currentPage === 4);
      const mid = await page.evaluate(() => state.currentMatch.id);
      await page.click('.ball-option >> nth=0'); await page.click('#startMatchBtn');
      await page.waitForFunction(() => state.currentPage === 5);
      const winnaar = rnd() < 0.5 ? 1 : 2; const verliezerPunten = 4 * Math.floor(rnd() * 6);
      let guard = 0;
      while (!(await page.evaluate(() => state.matchEnded)) && guard++ < 60) {
        await page.evaluate(([w, lp]) => {
          const cp = state.currentPlayer; const p = cp === 1 ? state.wit : state.geel;
          const n = cp === w ? 9 : Math.max(0, Math.min(4, lp - p.score));
          for (let k = 0; k < n; k++) changeScore(1);
          window.addScore();
        }, [winnaar, verliezerPunten]);
        await sleep(60);
      }
      const einde = await page.evaluate(() => [state.matchEnded, state.wit.score, state.geel.score]);
      if (gespeeld.length === 0) check('een tornooimatch toont GEEN klassementspunten in het overzicht (tornooien tellen niet mee voor het klassement)', await page.evaluate(() => document.getElementById('summaryPunten1') === null));
      await page.waitForFunction(() => state.currentPage === 6, null, { timeout: 15000 });   // de app toont zelf het overzicht na afloop
      const m = /T(\d+)M(\d+)/.exec(mid); const nr = parseInt(m[2]);
      const bevestigd = await wacht(async () => (await status(nr)) === 'voltooid', 8000);
      gespeeld.push({ nr, tekst });
      return { nr, einde, bevestigd: !!bevestigd, winnaar };
    }

    // Een "herstart van de Pi": lege browser (zoals de incognito-modus). Gespeelde matchen mogen NIET terugkomen, de rest wel.
    async function herstart(verwacht, wanneer) {
      await ctx.close(); ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); app = await ctx.newPage();
      app.on('pageerror', e => errs.push(e.message)); app.on('dialog', d => d.accept());
      await app.goto('http://127.0.0.1:8123/index.html'); await sleep(2500);
      await naarLijst(app);
      const na = await kaarten(app);
      check(`herstart ${wanneer}: de lijst toont precies de ${verwacht} nog te spelen matchen, geen gespeelde`, na === verwacht, `app ${na}, verwacht ${verwacht}`);
    }
    console.log('3. Ronde per ronde uitspelen');
    let ronde = 0, probleem = null, onbekend = 0, verkeerdAantal = [];
    while (ronde++ < 40) {
      const nieuw = plan(); const open = openMatchen();
      if (open.length === 0) break;
      await naarLijst(app);
      const zichtbaar = await kaarten(app);
      if (zichtbaar !== open.length) verkeerdAantal.push(`ronde ${ronde}: app ${zichtbaar}, planner ${open.length}`);
      if ((await app.locator('body').innerText()).includes('ONBEKEND')) onbekend++;
      if (ronde === 2) await herstart(open.length, 'aan het begin van ronde 2 (alle matchen van ronde 1 gespeeld)');
      for (let i = 0; i < open.length; i++) {
        const r = await speelEersteMatch(app);
        if (!r.einde[0] || !r.bevestigd) { probleem = `match ${r.nr}: einde=${JSON.stringify(r.einde)} bevestigd=${r.bevestigd}`; break; }
        await naarLijst(app);
        if (ronde === 1 && i === 4) await herstart(open.length - 5, 'midden in ronde 1 (5 gespeeld, rest nog niet)');
      }
      if (probleem) break;
    }
    check('alle ronden lopen door zonder vastlopen', !probleem, probleem);
    check('in elke ronde toont de app precies de matchen die de planner klaar heeft', verkeerdAantal.length === 0, verkeerdAantal.join('; '));
    check('nergens "ONBEKEND" als spelersnaam (alle doorgeschoven spelers hebben een naam)', onbekend === 0, onbekend);

    console.log('4. Controle van het eindresultaat in de planner');
    const eind = o.sqlJson(`print(json.dumps({'status':c.execute("select status from tournaments where id=${tid}").fetchone()[0],
      'voltooid':c.execute("select count(*) from tournament_matches where tournament_id=${tid} and status='voltooid'").fetchone()[0],
      'open':c.execute("select count(*) from tournament_matches where tournament_id=${tid} and status!='voltooid'").fetchone()[0],
      'beurten':c.execute("select count(*) from tournament_match_turns where tournament_id=${tid}").fetchone()[0],
      'verliezen':[r[0] for r in c.execute("select count(*) from tournament_matches where tournament_id=${tid} and status='voltooid' group by loser_participant_id order by 1 desc")],
      'zonderWinnaar':c.execute("select count(*) from tournament_matches where tournament_id=${tid} and status='voltooid' and (winner_participant_id is null or loser_participant_id is null or winner_participant_id=loser_participant_id)").fetchone()[0]}))`);
    const volgorde = gespeeld.map(g => g.nr);
    check('het tornooi staat op "completed"', eind.status === 'completed', eind.status);
    check('alle matchen zijn gespeeld en bevestigd door de planner (zoveel als er matchen zijn)', eind.voltooid === totaal && eind.open === 0, JSON.stringify(eind));
    check(`elke match is precies één keer via de app gespeeld (${gespeeld.length} speelbeurten, ${new Set(volgorde).size} verschillende matchen)`, gespeeld.length === totaal && new Set(volgorde).size === totaal, gespeeld.length);
    check('elke match heeft een winnaar en een andere verliezer', eind.zonderWinnaar === 0);
    check('niemand verliest meer dan twee keer (dubbele uitschakeling)', Math.max(...eind.verliezen) <= 2, JSON.stringify(eind.verliezen));
    check('de beurten van de matchen zijn bewaard', eind.beurten > totaal, eind.beurten);
    check('geen JavaScript-fouten in de score-app', errs.length === 0, errs.join(';'));
  } catch (e) { try { console.log('DEBUG', JSON.stringify(await app.evaluate(() => ({ p: state.currentPage, kaarten: [...document.querySelectorAll('.match-card')].map(e => [e.getAttribute('onclick'), e.offsetParent !== null, JSON.stringify(e.getBoundingClientRect())]).slice(0, 3), actief: document.querySelector('.page.active')?.id })))); await app.screenshot({ path: '/tmp/claude-0/-home-user/93bf1081-e2ea-5cde-b709-48044d3c8f37/scratchpad/t32-fout.png' }); } catch (x) {} check('test zonder onverwachte fout', false, String(e.message).replace(/\x1b\[[0-9;]*m/g, '').slice(0, 900)); }
  finally {
    if (browser) await browser.close();
    await o.stop();
    const slecht = res.filter(x => !x).length;
    console.log(`\nResultaat: ${res.length - slecht} van ${res.length} gecontroleerd en in orde${slecht ? ', ' + slecht + ' FOUT' : ''}.`);
    process.exit(slecht ? 1 : 0);
  }
})();
