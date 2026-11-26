// Het klassement en de kruistabel in de score-app (Competitie Stand / rustscherm) tonen de punten die de PLANNER uitrekent,
// volgens de puntentelling die het bestuur instelde. ECHTE testplanner + ECHT Pi-programma + de app. Verzonnen gegevens.
// Gebruik: TESTSERVER=<map Testserver> PYTHON=<python met Flask> node tests/test-klassement.js <map van de score-app>
const { chromium } = require('playwright');
const path = require('path');
const { start, sleep, wacht } = require('./lib/omgeving.js');
const REPO = path.resolve(process.argv[2] || '.');
const res = []; const check = (n, ok, e) => { res.push(ok); console.log((ok ? '  OK   ' : '  FOUT ') + n + (e && !ok ? '  [' + String(e).slice(0, 260) + ']' : '')); };

// Gegevens: [club_id, voornaam, achternaam, discipline, categorie, doel, tsg, mode]
const SPELERS = [
  ['2001', 'Anna', 'Alfa', 'Vrijspel', '1', 20, '1,000', 'max -10%'], ['2002', 'Bert', 'Beta', 'Vrijspel', '1', 20, '0,900', 'max -10%'],
  ['2003', 'Cor', 'Gamma', 'Vrijspel', '1', 25, '1,250', 'kleiner'], ['2004', 'Dirk', 'Delta', 'Vrijspel', '1', 15, '0,750', 'max -10%'],
  ['3001', 'Eva', 'Epsilon', 'Driebanden', '1', 13, '0,325', 'max -10%'], ['3002', 'Fien', 'Zeta', 'Driebanden', '1', 13, '0,300', 'max -10%'], ['3003', 'Gust', 'Eta', 'Driebanden', '1', 18, '0,450', 'max -10%'],
  ['4001', 'Hilde', 'Theta', 'Dames', '0', 1, '1,000', 'max -10%'], ['4002', 'Ine', 'Iota', 'Dames', '0', 1, '1,000', 'max -10%'],
];
// [club_a, score_a, beurten_a, club_b, score_b, beurten_b]  (beide spelers hebben evenveel beurten)
const MATCHEN = {
  Vrijspel: [['2001', 20, 14, '2002', 15, 14], ['2001', 20, 30, '2003', 12, 30], ['2002', 20, 25, '2004', 15, 25], ['2003', 25, 20, '2004', 9, 20], ['2002', 8, 40, '2003', 25, 40]],
  Driebanden: [['3001', 13, 99, '3002', 4, 99], ['3001', 18, 60, '3003', 18, 60], ['3002', 13, 35, '3003', 6, 35]],
  Dames: [['4001', 30, 20, '4002', 22, 20]],
};
const REF = { Vrijspel: 20, Bandstoten: 20, Driebanden: 40 }, MIN = { Vrijspel: -5, Bandstoten: -5, Driebanden: -10 };
const doelVan = id => SPELERS.find(s => s[0] === id)[5];
// Onafhankelijke uitrekening (niet de code van de planner of de app)
function punten(sys, p, disc, own, beurten, doel, opp) {
  if (disc === 'Dames') return own > opp ? 3 : (own < opp ? 1 : 2);
  if (sys === 'wvg') return own > opp ? 3 : (own < opp ? 1 : 2);
  if (sys === 'verhouding') return own > opp ? 12 : (own === opp ? 11 : Math.floor(11 * Math.min(own, doel) / doel));
  const ref = p.ref[disc] || 20, mn = disc === 'Driebanden' ? p.mnDrie : -5;
  if (beurten <= 0) return mn;
  const raw = own >= doel ? ref - beurten : (own === 0 ? -1e9 : Math.floor(ref - doel / (own / beurten)));
  return Math.max(Math.trunc(raw), mn);
}
function verwacht(sys, instellingen) {
  const p = { ref: Object.assign({}, REF, instellingen.ref || {}), mnDrie: instellingen.mnDrie ?? -10 };
  const uit = {};
  for (const [disc, lijst] of Object.entries(MATCHEN)) {
    for (const [a, sa, ba, b, sb, bb] of lijst) {
      for (const [id, own, bt, opp] of [[a, sa, ba, sb], [b, sb, bb, sa]]) {
        const u = uit[id] = uit[id] || { mptn: 0, punten: 0, beurten: 0, gespeeld: 0 };
        u.mptn += punten(sys, p, disc, own, bt, doelVan(id), opp); u.punten += own; u.beurten += bt; u.gespeeld++;
      }
    }
  }
  for (const [id, u] of Object.entries(uit)) {
    const s = SPELERS.find(x => x[0] === id); const disc = s[3];
    const tsg = parseFloat(s[6].replace(',', '.')); const gem = u.punten / u.beurten;
    const tsgvs = s[7].startsWith('k') ? (gem < tsg ? tsg : gem) : (gem < tsg * 0.9 ? tsg * 0.9 : gem);
    const minimum = ({ Vrijspel: 20, Bandstoten: 15, Driebanden: 13 })[disc] || 0;      // het minimum doel per discipline (standaard van de planner): wie eronder zou vallen, krijgt het minimum
    u.ptnvs = disc === 'Dames' ? 1 : Math.max(Math.ceil(tsgvs * (p.ref[disc] || 20)), minimum);
  }
  return uit;
}

(async () => {
  const o = await start(REPO); let browser;
  try {
    o.sql(`import json
for i, (cid, vn, an, disc, cat, doel, tsg, mode) in enumerate(json.loads(${JSON.stringify(JSON.stringify(SPELERS))})):
    c.execute("INSERT INTO users (first_name,last_name,email,password_hash) VALUES (?,?,?,'x')", (vn, an, f'u{i}@voorbeeld.test'))
    uid = c.execute("SELECT last_insert_rowid()").fetchone()[0]
    c.execute("INSERT INTO player_stats (user_id,club_id,player_number,discipline,category,points,coeff,mode) VALUES (?,?,?,?,?,?,?,?)", (uid, cid, str(i+1).zfill(2), disc, cat, str(doel), tsg, mode))
n = 0
for disc, lijst in json.loads(${JSON.stringify(JSON.stringify(MATCHEN))}).items():
    cat = '0' if disc == 'Dames' else '1'
    for a, sa, ba, b, sb, bb in lijst:
        n += 1
        c.execute("INSERT INTO match_results (match_id, played_date, discipline, categorie, status, winner_club_id, player1_club_id, player1_score, player1_beurten, player2_club_id, player2_score, player2_beurten, player1_hoogste_reeks, player2_hoogste_reeks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (f'K{n}', '2026-11-20', disc, cat, 'voltooid', a if sa >= sb else b, a, sa, ba, b, sb, bb, 3, 2))`);
    browser = await chromium.launch();
    const adm = await browser.newContext(); const ap = await adm.newPage();
    await ap.goto(o.SERVER + '/admin/login'); await ap.fill('input[name=email]', 'test@test.test'); await ap.fill('input[name=pw]', 'testwachtwoord'); await ap.click('button.btn'); await ap.waitForURL('**/admin');
    const instelling = (k, w) => o.sql(`c.execute("INSERT INTO club_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (${JSON.stringify(k)}, ${JSON.stringify(String(w))}))`);
    const wis = () => o.sql(`c.execute("DELETE FROM club_settings WHERE key LIKE 'punten_%'")`);

    let ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); let app = await ctx.newPage(); const errs = []; app.on('pageerror', e => errs.push(e.message)); app.on('dialog', d => d.accept());
    await app.goto('http://127.0.0.1:8123/index.html');
    const sch = app.locator('#verbindingScherm'); await sch.waitFor({ state: 'visible' });
    const code = await wacht(async () => (await sch.innerText()).match(/\b(\d{6})\b/)?.[1]);
    await adm.request.post(o.SERVER + '/admin/toestellen', { form: { actie: 'goedkeuren', code, naam: 'T' }, maxRedirects: 0 }); await sch.waitFor({ state: 'hidden' });
    await wacht(async () => (await app.evaluate(() => state.players.length)) >= SPELERS.length, 15000);

    // Laat de app het klassement van één groep tonen en lees de tabel uit
    async function toon(disc, cat, weergave = 'leaderboard') {
      await app.evaluate(async () => { await window.fetchMatchResultsFromAPI(); });
      const gevonden = await app.evaluate(([d, c, w]) => {
        showPage(20); window.buildCompComboList();
        const i = window.compComboList.findIndex(x => x.discipline === d && String(x.category) === String(c));
        if (i < 0) return false;
        window.goToCompCombo(i); window.switchCompView(w); return true;
      }, [disc, cat, weergave]);
      if (!gevonden) return null;
      return app.evaluate(() => [...document.querySelectorAll('#competitionLeaderboard tbody tr')].map(r => [...r.children].map(td => td.innerText.trim())));
    }
    const kruisCellen = async (disc, cat) => {
      await toon(disc, cat, 'crosstable');
      return app.evaluate(() => [...document.querySelectorAll('#crossTableContainer td.match-turns + td')].map(td => td.innerText.trim()));
    };
    const lees = rijen => Object.fromEntries(rijen.map(r => [r[1], { mptn: parseInt(r[7].replace('+', '')), ptnvs: parseInt(r[10]), brtn: parseInt(r[5]), gespeeld: parseInt(r[2]) }]));
    const naam = id => { const s = SPELERS.find(x => x[0] === id); return s[1] + ' ' + s[2]; };
    async function vergelijk(titel, sys, instellingen) {
      const ver = verwacht(sys, instellingen); const fouten = [];
      for (const [disc, cat] of [['Vrijspel', '1'], ['Driebanden', '1'], ['Dames', '0']]) {
        const rijenApp = await toon(disc, cat);
        if (!rijenApp) { fouten.push(`${disc} ontbreekt in de lijst van de app`); continue; }
        const g = lees(rijenApp);
        for (const s of SPELERS.filter(x => x[3] === disc)) {
          const e = ver[s[0]], a = g[naam(s[0])];
          if (!a) { fouten.push(`${naam(s[0])} ontbreekt in het klassement`); continue; }
          if (a.mptn !== e.mptn) fouten.push(`${naam(s[0])}: MPTN app ${a.mptn}, verwacht ${e.mptn}`);
          if (a.ptnvs !== e.ptnvs) fouten.push(`${naam(s[0])}: PTNVS app ${a.ptnvs}, verwacht ${e.ptnvs}`);
          if (a.brtn !== e.beurten || a.gespeeld !== e.gespeeld) fouten.push(`${naam(s[0])}: beurten/matchen anders`);
        }
      }
      check(`${titel}: MPTN en PTNVS van alle ${SPELERS.length} spelers (vrijspel, driebanden, dames) kloppen op het scherm`, fouten.length === 0, fouten.slice(0, 3).join(' | '));
    }

    console.log('1. Standaard (beurtenbonus, zoals KPBC)');
    await vergelijk('standaard', 'beurtenbonus', {});
    const cel0 = await kruisCellen('Driebanden', '1');
    check('driebanden: de zeer langzame match (13 punten in 99 beurten) toont in de kruistabel de ondergrens -10 van de planner (de app rekende vroeger met -5)', cel0.includes('-10') && !cel0.includes('-5'), cel0.join(' '));

    console.log('2. Het bestuur kiest winst / gelijkspel / verlies (3-2-1)');
    instelling('punten_systeem', 'wvg');
    await app.reload(); await sleep(2500); await wacht(async () => (await app.evaluate(() => state.players.length)) >= SPELERS.length, 15000);
    await vergelijk('3-2-1', 'wvg', {});
    const cel1 = await kruisCellen('Driebanden', '1');
    check('de kruistabel toont ook het gekozen systeem: enkel 3, 2 of 1 punten, nooit negatief', cel1.length > 0 && cel1.every(c => ['3', '2', '1'].includes(c.replace('+', ''))), cel1.join(' '));

    console.log('3. Winnaar 12 / gelijkspel 11 / verliezer naar verhouding, en eigen referentiebeurten');
    instelling('punten_systeem', 'verhouding');
    await app.reload(); await sleep(2500); await wacht(async () => (await app.evaluate(() => state.players.length)) >= SPELERS.length, 15000);
    await vergelijk('12 / 11', 'verhouding', {});
    wis(); instelling('punten_ref_vrijspel', 25); instelling('punten_ref_driebanden', 50); instelling('punten_min_driebanden', -8);
    await app.reload(); await sleep(2500); await wacht(async () => (await app.evaluate(() => state.players.length)) >= SPELERS.length, 15000);
    await vergelijk('beurtenbonus met referentie 25 en 50, ondergrens driebanden -8', 'beurtenbonus', { ref: { Vrijspel: 25, Driebanden: 50 }, mnDrie: -8 });

    console.log('4. Het rustscherm gebruikt dezelfde cijfers');
    wis(); instelling('punten_systeem', 'wvg');
    await app.reload(); await sleep(2500); await wacht(async () => (await app.evaluate(() => state.players.length)) >= SPELERS.length, 15000);
    await app.evaluate(async () => { await window.fetchMatchResultsFromAPI(); });
    await app.evaluate(() => { startIdleCarousel(); });
    await sleep(800);
    const rust = await app.evaluate(() => [...document.querySelectorAll('#competitionLeaderboard tbody tr')].map(r => [...r.children].map(td => td.innerText.trim())));
    check('het rustscherm (idle carousel) toont het klassement met de punten van het gekozen systeem (3-2-1: nooit negatief)', rust.length > 0 && rust.every(r => parseInt(r[7].replace('+', '')) >= 0), JSON.stringify(rust.slice(0, 2)));
    await app.evaluate(() => { stopIdleCarousel(); });
    check('geen JavaScript-fouten in de app', errs.length === 0, errs.join(' ; '));
    wis();
  } catch (e) { check('test zonder onverwachte fout', false, String(e.stack || e).slice(0, 600)); }
  finally { if (browser) await browser.close(); await o.stop(); const bad = res.filter(x => !x).length; console.log(`\nResultaat: ${res.length - bad} van ${res.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`); process.exit(bad ? 1 : 0); }
})();
