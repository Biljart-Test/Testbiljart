// Tornooi-DUBBELTJE waarbij de verbinding wegvalt net op het einde van de match: de uitslag mag niet verloren gaan.
// (Zelfde opzet als test-tornooi-dubbel.js:) ECHTE score-app, met een ECHTE testplanner en het ECHTE lokale Pi-programma.
// Vooral: als paar 2 de WITTE bal krijgt, staan de teams in de app omgewisseld; de doorgestuurde uitslag moet dan nog steeds
// de juiste punten bij het juiste paar zetten. Verzonnen gegevens, alles lokaal.
// Gebruik: TESTSERVER=<map Testserver> PYTHON=<python met Flask> node tests/test-tornooi-dubbel.js <map van de score-app>
const { chromium } = require('playwright');
const path = require('path');
const { start, sleep, wacht } = require('./lib/omgeving.js');
const REPO = path.resolve(process.argv[2] || '.');
const res = []; const check = (n, ok, e) => { res.push(ok); console.log((ok ? '  OK   ' : '  FOUT ') + n + (e && !ok ? '  [' + String(e).slice(0, 260) + ']' : '')); };

(async () => {
  const o = await start(REPO); let browser;
  try {
    o.sql(`[c.execute("INSERT INTO users (first_name,last_name,email,password_hash) VALUES (?,?,?,'x')",(f'Speler{i}',f'Test{i:02d}',f's{i}@voorbeeld.test')) for i in range(1,9)]`);
    browser = await chromium.launch();
    const adm = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const ap = await adm.newPage(); ap.on('dialog', d => d.accept());
    console.log('1. Dubbeltje-tornooi met 4 paren aanmaken');
    await ap.goto(o.SERVER + '/admin/login'); await ap.fill('input[name=email]', 'test@test.test'); await ap.fill('input[name=pw]', 'testwachtwoord'); await ap.click('button.btn'); await ap.waitForURL('**/admin');
    await ap.goto(o.SERVER + '/admin/tournaments');
    await ap.selectOption('#formatSelect', 'dubbel'); await ap.selectOption('#slotsSelect', '4'); await ap.selectOption('select[name=uitschakeling]', 'enkel');
    await ap.fill('input[name=eigen_naam]', 'Dubbeltje'); await ap.selectOption('select[name=year_range]', { index: 1 });
    await ap.click('button:has-text("Tornooi Aanmaken")'); await ap.waitForLoadState();
    await ap.locator('tr', { hasText: 'Dubbeltje' }).locator('a:has-text("Beheer")').click(); await ap.waitForLoadState();
    await ap.click('summary:has-text("Plaats voor plaats invullen")').catch(() => {});
    for (let i = 1; i <= 4; i++) {
      await ap.selectOption(`#member_${i}_a`, { label: `Test0${2 * i - 1} Speler${2 * i - 1}` });
      await ap.selectOption(`#member_${i}_b`, { label: `Test0${2 * i} Speler${2 * i}` });
    }
    await ap.click('button[name="loting"]'); await ap.waitForLoadState();   // de volgorde van de paren wordt geloot; de test leest de paren daarna uit de planner
    await ap.click('button:has-text("Bracket Starten")'); await ap.waitForLoadState();
    const tid = o.sqlJson(`print(json.dumps(c.execute("select id from tournaments").fetchone()[0]))`);
    const aantal = o.sqlJson(`print(json.dumps(c.execute("select count(*) from tournament_matches where tournament_id=${tid}").fetchone()[0]))`);
    check('3 matchen (2 halve finales en een finale)', aantal === 3, aantal);
    const vandaag = o.sql(`print(__import__('datetime').date.today().isoformat())`).trim();
    const plan = () => o.sql(`c.execute("UPDATE tournament_matches SET match_date=?, match_time='20:00', table_nr='1' WHERE tournament_id=${tid} AND status='pending' AND match_date IS NULL AND player1_participant_id IS NOT NULL AND player2_participant_id IS NOT NULL",('${vandaag}',))`);
    // paar (namen) per deelnemer, uit de database
    const paren = o.sqlJson(`print(json.dumps({r[0]: sorted([r[1], r[2]]) for r in c.execute("select p.id, u.first_name||' '||u.last_name, v.first_name||' '||v.last_name from tournament_participants p join users u on u.id=p.user_id join users v on v.id=p.partner_user_id where p.tournament_id=${tid}")}))`);
    check('4 paren van 2 spelers', Object.keys(paren).length === 4, JSON.stringify(paren));

    console.log('2. Toestel koppelen');
    let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); let app = await ctx.newPage();
    const errs = []; app.on('pageerror', e => errs.push(e.message)); app.on('dialog', d => d.accept());
    await app.goto('http://127.0.0.1:8123/index.html');
    const sch = app.locator('#verbindingScherm'); await sch.waitFor({ state: 'visible' });
    const code = await wacht(async () => (await sch.innerText()).match(/\b(\d{6})\b/)?.[1]);
    await adm.request.post(o.SERVER + '/admin/toestellen', { form: { actie: 'goedkeuren', code, naam: 'T' }, maxRedirects: 0 }); await sch.waitFor({ state: 'hidden' });

    const naarLijst = async () => {
      await sleep(1500);   // de app toont na afloop zelf eerst het overzicht
      if ((await app.evaluate(() => state.currentPage)) !== 1) {
        const knop = app.locator('button:has-text("Hoofdmenu") >> visible=true');
        if (await knop.count()) await knop.first().click(); else await app.evaluate(() => showPage(1));
      }
      await app.waitForSelector('button:has-text("Officiële Matchen Ophalen")', { state: 'visible' });
      await app.click('button:has-text("Officiële Matchen Ophalen")');
      await wacht(async () => (await app.locator('.match-card:visible').count()) > 0, 8000); await sleep(600);
    };

    // Speel de eerste match uit de lijst. whiteTeam = welk van de twee paren (1 of 2, zoals de planner ze noemt) de witte bal krijgt;
    // winner = welk paar wint. Geeft wat de app en de planner erover zeggen.
    async function speel(whiteTeam, winnerTeam) {
      await app.locator('.match-card:visible').first().click();
      await app.waitForSelector('#teamVolgordeOverlay');
      await app.keyboard.press('Tab'); await sleep(700); await app.keyboard.press('Tab'); await sleep(500);
      await app.locator('#page13 .ball-option').nth(whiteTeam - 1).click();
      await app.click('#friendlyStartMatchBtn');
      await app.waitForFunction(() => state.friendlyMatch && state.friendlyMatch.turnState && !state.friendlyMatch.turnState.matchEnded);
      // Wie staat links/rechts na de wissel? (teams[...] = 1 is links)
      const opstelling = await app.evaluate(() => { const fm = state.friendlyMatch; const nm = t => Object.keys(fm.players).filter(p => fm.teams[p] == t).map(p => fm.players[p].name).sort(); return { links: nm(1), rechts: nm(2), mid: fm.tournamentMatchId }; });
      const plannerLinks = whiteTeam;                         // het paar met de witte bal moet LINKS staan
      const winnaarKant = winnerTeam === whiteTeam ? 'left' : 'right';
      // Spelen: het winnende paar scoort 6 per beurt, het andere 2
      let guard = 0;
      while (!(await app.evaluate(() => state.friendlyMatch.turnState.matchEnded)) && guard++ < 80) {
        await app.evaluate(w => {
          const ts = state.friendlyMatch.turnState; const wint = ts.activeSide === w; const n = wint ? 6 : 2;
          for (let k = 0; k < n && !ts.matchEnded; k++) friendlyChangeScore(1);
          if (!ts.matchEnded) friendlyMiss();
        }, winnaarKant);
      }
      const ts = await app.evaluate(() => { const t = state.friendlyMatch.turnState; return { l: t.leftTotalScore, r: t.rightTotalScore, wint: t.activeSide, einde: t.matchEnded, lt: t.leftTurns.length, rt: t.rightTurns.length }; });
      const mnr = parseInt(opstelling.mid.split('M')[1]);
      await wacht(async () => (await o.sqlJson(`print(json.dumps(c.execute("select status from tournament_matches where tournament_id=${tid} and match_number=${mnr}").fetchone()[0]))`)) === 'voltooid', 8000);
      const db = o.sqlJson(`r=c.execute("select player1_participant_id p1, player2_participant_id p2, player1_score s1, player2_score s2, winner_participant_id w, status from tournament_matches where tournament_id=${tid} and match_number=${mnr}").fetchone();print(json.dumps(dict(r)))`);
      return { opstelling, ts, db, mnr };
    }
    const noem = ids => ids.map(i => paren[i].join(' & '));
    const sameNames = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

    async function controleer(titel, whiteTeam, winnerTeam) {
      await naarLijst();
      const r = await speel(whiteTeam, winnerTeam);
      const { db, ts, opstelling } = r;
      // Welk paar (in de planner) staat links in de app?
      const linksP = [db.p1, db.p2].find(p => sameNames(paren[p], opstelling.links)); const rechtsP = [db.p1, db.p2].find(p => sameNames(paren[p], opstelling.rechts));
      const wit = whiteTeam === 1 ? db.p1 : db.p2;
      check(`${titel}: het paar met de witte bal staat links in de app`, linksP === wit, JSON.stringify({ links: opstelling.links, wit: paren[wit] }));
      check(`${titel}: de match is afgelopen en door de planner bevestigd`, ts.einde && db.status === 'voltooid', JSON.stringify(ts));
      const scoreVan = p => (p === db.p1 ? db.s1 : db.s2);
      check(`${titel}: de score van het paar links in de app (${ts.l}) staat bij DAT paar in de planner (${scoreVan(linksP)})`, scoreVan(linksP) === ts.l, JSON.stringify({ db, ts }));
      check(`${titel}: de score van het paar rechts (${ts.r}) staat bij dat paar (${scoreVan(rechtsP)})`, scoreVan(rechtsP) === ts.r, JSON.stringify({ db, ts }));
      const winnaarP = ts.wint === 'left' ? linksP : rechtsP;
      check(`${titel}: de planner kent de winst toe aan het paar dat in de app won`, db.w === winnaarP && db.w === (winnerTeam === 1 ? db.p1 : db.p2), JSON.stringify({ db, ts, gewenst: winnerTeam }));
      check(`${titel}: het winnende paar haalde 70 punten, het andere minder`, Math.max(ts.l, ts.r) >= 70 && Math.min(ts.l, ts.r) < 70, JSON.stringify(ts));
      return r;
    }

    plan();
    let wifi = false; const posts = [];
    await ctx.route('**/api/tournament/match-result', r => { if (!wifi) return r.abort('internetdisconnected'); posts.push(JSON.parse(r.request().postData() || '{}')); return r.continue(); });
    const pi = async p => (await fetch('http://127.0.0.1:5000' + p)).json();
    const statussen = () => o.sqlJson(`print(json.dumps([r[0] for r in c.execute("select status from tournament_matches where tournament_id=${tid} order by match_number")]))`);
    console.log('3. Een dubbeltje spelen terwijl de verbinding op het einde wegvalt (paar 2 heeft de witte bal)');
    await naarLijst();
    // spelen zonder te wachten op de planner (die komt niet)
    await app.locator('.match-card:visible').first().click(); await app.waitForSelector('#teamVolgordeOverlay');
    await app.keyboard.press('Tab'); await sleep(700); await app.keyboard.press('Tab'); await sleep(500);
    await app.locator('#page13 .ball-option').nth(1).click(); await app.click('#friendlyStartMatchBtn');
    await app.waitForFunction(() => state.friendlyMatch && state.friendlyMatch.turnState);
    const mid = await app.evaluate(() => state.friendlyMatch.tournamentMatchId);
    let guard = 0;
    while (!(await app.evaluate(() => state.friendlyMatch.turnState.matchEnded)) && guard++ < 80) {
      await app.evaluate(() => { const ts = state.friendlyMatch.turnState; const n = ts.activeSide === 'left' ? 6 : 2; for (let k = 0; k < n && !ts.matchEnded; k++) friendlyChangeScore(1); if (!ts.matchEnded) friendlyMiss(); });
    }
    await sleep(2500);
    const app_ts = await app.evaluate(() => { const t = state.friendlyMatch.turnState; return { l: t.leftTotalScore, r: t.rightTotalScore }; });
    const links = await app.evaluate(() => { const fm = state.friendlyMatch; return Object.keys(fm.players).filter(p => fm.teams[p] == 1).map(p => fm.players[p].name).sort(); });
    check('de match is afgelopen (links 70 punten)', app_ts.l >= 70, JSON.stringify(app_ts));
    check('de planner heeft de uitslag niet (verbinding was weg)', (await statussen()).every(x => x === 'pending'));
    const wq = await pi('/pending-matches');
    check('de uitslag staat veilig in de wachtrij op de Pi', wq.length === 1 && wq[0].match_id === mid && wq[0]._tornooi === true && wq[0].players.length === 4, JSON.stringify(wq).slice(0, 150));

    console.log('4. Herstart van de Pi (lege browser) met verbinding');
    wifi = true; await ctx.close(); ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route('**/api/tournament/match-result', r => { posts.push(JSON.parse(r.request().postData() || '{}')); return r.continue(); });
    app = await ctx.newPage(); app.on('pageerror', e => errs.push(e.message)); app.on('dialog', d => d.accept());
    await app.goto('http://127.0.0.1:8123/index.html');
    const klaar = await wacht(async () => (await statussen())[parseInt(mid.split('M')[1]) - 1] === 'voltooid', 15000);
    check('de uitslag wordt vanzelf alsnog naar de planner gestuurd', !!klaar, JSON.stringify(await statussen()));
    check('precies één keer verstuurd, naar het tornooi-adres (niet als competitiematch)', posts.length === 1 && posts[0].match_id === mid, posts.length);
    const mnr = parseInt(mid.split('M')[1]);
    const db = o.sqlJson(`r=c.execute("select player1_participant_id p1, player2_participant_id p2, player1_score s1, player2_score s2, winner_participant_id w from tournament_matches where tournament_id=${tid} and match_number=${mnr}").fetchone();print(json.dumps(dict(r)))`);
    const linksP = [db.p1, db.p2].find(p => JSON.stringify(paren[p]) === JSON.stringify(links)); const scoreVan = p => (p === db.p1 ? db.s1 : db.s2);
    check('en de punten staan bij het juiste paar (ook al had paar 2 de witte bal)', linksP === db.p2 && scoreVan(linksP) === app_ts.l && db.w === linksP, JSON.stringify({ db, app_ts }));
    check('daarna is de wachtrij op de Pi leeg', !!(await wacht(async () => (await pi('/pending-matches')).length === 0, 8000)));
    const n = posts.length; await ctx.close(); ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route('**/api/tournament/match-result', r => { posts.push(1); return r.continue(); });
    app = await ctx.newPage(); app.on('dialog', d => d.accept()); await app.goto('http://127.0.0.1:8123/index.html'); await sleep(4000);
    check('bij een volgende start wordt niets meer verstuurd', posts.length === n, posts.length - n);
    check('geen JavaScript-fouten', errs.length === 0, errs.join(' ; '));
  } catch (e) { check('test zonder onverwachte fout', false, String(e.stack || e).slice(0, 500)); }
  finally { if (browser) await browser.close(); await o.stop(); const bad = res.filter(x => !x).length; console.log(`\nResultaat: ${res.length - bad} van ${res.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`); process.exit(bad ? 1 : 0); }
})();
