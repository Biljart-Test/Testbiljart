// De spelregels van Dubbeltje en Triatlon staan op één plaats (js/spelregels.js) en zijn niet veranderd.
// Gebruik: node tests/test-spelregels.js <map van de score-app>   (geen planner nodig; de app wordt lokaal geopend)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = path.resolve(process.argv[2] || '.');
const res = []; const check = (n, ok, e) => { res.push(ok); console.log((ok ? '  OK   ' : '  FOUT ') + n + (e && !ok ? '  [' + String(e).slice(0, 200) + ']' : '')); };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png' };
const srv = http.createServer((req, rs) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(REPO, p);
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs); });
(async () => {
  await new Promise(r => srv.listen(8124, '127.0.0.1', r));
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1:8124|localhost:5000).*/, r => r.abort());   // niets naar buiten
  await ctx.route('http://localhost:5000/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 'verbinden' }) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8124/index.html'); await p.waitForTimeout(500);

  console.log('1. De regels zoals ze altijd waren');
  const OUD = {   // de getallen van vóór het centraliseren, letterlijk overgenomen uit de oude code
    'dubbeltje':      { limits: { vrijspel: 3, bandstoten: 2, driebanden: 1 },       thresholds: { vrijspel: 40, bandstoten: 20, driebanden: 10 } },
    'triatlon-small': { limits: { vrijspel: 99, bandstoten: 99, driebanden: 99 },    thresholds: { vrijspel: 20, bandstoten: 10, driebanden: 5 } },
    'triatlon-large': { limits: { vrijspel: 99, bandstoten: 99, driebanden: 99 },    thresholds: { vrijspel: 40, bandstoten: 20, driebanden: 10 } },
    'vrijspel':       { limits: { vrijspel: 99, bandstoten: 99, driebanden: 99 },    thresholds: { vrijspel: 999, bandstoten: 999, driebanden: 999 } },
    'bandstoten':     { limits: { vrijspel: 99, bandstoten: 99, driebanden: 99 },    thresholds: { vrijspel: 999, bandstoten: 999, driebanden: 999 } },
  };
  for (const [spel, verwacht] of Object.entries(OUD)) {
    const uit = await p.evaluate(s => { state.friendlyMatch = { gameType: s, numPlayers: 2, players: { 1: { name: 'A', target: 10 }, 2: { name: 'B', target: 10 } }, teams: {}, orders: {} }; try { window.initFriendlyScoring(); } catch (e) {} return { limits: state.friendlyMatch.limits, thresholds: state.friendlyMatch.thresholds }; }, spel);
    check(`${spel}: dezelfde drempels en limieten als vroeger`, JSON.stringify(uit) === JSON.stringify(verwacht), JSON.stringify(uit));
  }
  check('Dubbeltje: het doel is de som van de drempels = 70', await p.evaluate(() => window.spelDoel('dubbeltje')) === 70);
  check('welke spellen fases hebben: dubbeltje en beide triatlons, een gewoon spel niet', await p.evaluate(() => ['dubbeltje', 'triatlon-small', 'triatlon-large'].every(window.isFaseSpel) && !window.isFaseSpel('vrijspel') && !window.isFaseSpel('drie-spelers')));
  check('de regels zijn bevroren: niemand kan ze per ongeluk veranderen', await p.evaluate(() => { 'use strict'; try { window.SPELREGELS.dubbeltje.drempels.vrijspel = 1; } catch (e) {} return window.spelDoel('dubbeltje') === 70; }));
  check('het 3-spelersspel heeft zijn eigen regels (40 / 20 / 10)', await p.evaluate(() => JSON.stringify(window.spelregelsVan('drie-spelers').drempels)) === JSON.stringify({ vrijspel: 40, bandstoten: 20, driebanden: 10 }));

  console.log('2. Nergens anders in de code staan nog eigen kopieën');
  const bron = n => fs.readFileSync(path.join(REPO, 'js', n), 'utf8');
  const overig = fs.readdirSync(path.join(REPO, 'js')).filter(n => n.endsWith('.js') && n !== 'spelregels.js').map(n => [n, bron(n)]);
  check('geen vaste 70 meer voor Dubbeltje', overig.every(([n, t]) => !/target:\s*70\b|target1:\s*70\b|target2:\s*70\b/.test(t)), overig.filter(([n, t]) => /target:\s*70\b/.test(t)).map(x => x[0]).join());
  check('geen eigen drempels of limieten meer in andere bestanden', overig.every(([n, t]) => !/fm\.(thresholds|limits)\s*=\s*\{/.test(t)));
  check('geen eigen lijst van fase-spellen meer in andere bestanden', overig.every(([n, t]) => !/\['triatlon-small',\s*'triatlon-large',\s*'dubbeltje'\]/.test(t)));
  check('geen JavaScript-fouten', errs.length === 0, errs.join(';'));
  await b.close(); srv.close();
  const bad = res.filter(x => !x).length;
  console.log(`\nResultaat: ${res.length - bad} van ${res.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
