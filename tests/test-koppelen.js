// De score-app in een echte browser, met het ECHTE lokale Pi-programma en een ECHTE testplanner (uit de repo Testserver).
// Gebruik: TESTSERVER=<map met Testserver> PYTHON=<python met Flask> node tests/test-koppelen.js <map van de score-app>
// Verzonnen gegevens, alles lokaal. Niets gaat naar een live server.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const REPO = path.resolve(process.argv[2] || '.'), TS = process.env.TESTSERVER, PY = process.env.PYTHON || 'python3';
if (!TS) { console.error('Zet TESTSERVER (map van de repo Testserver)'); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'koppel-test-'));
const res = []; const check = (n, ok, e) => { res.push(ok); console.log((ok ? '  OK   ' : '  FOUT ') + n + (e && !ok ? '  [' + String(e).slice(0, 160) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vrijePoort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const procs = [];
async function wacht(f, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await f(); if (v) return v; } catch (e) {} await sleep(200); } return null; }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png' };

(async () => {
  const [pSrv, pPi] = [await vrijePoort(), 5000];   // de app verwacht het lokale programma op poort 5000
  const SERVER = `http://127.0.0.1:${pSrv}`;
  const app = http.createServer((req, rs) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(REPO, p);
    if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
    rs.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs); });
  await new Promise(r => app.listen(8123, '127.0.0.1', r));
  const env = Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: '1' });
  procs.push(spawn(PY, [path.join(TS, 'tests/start_testserver.py'), '--db', path.join(tmp, 'srv.db'), '--port', String(pSrv)], { env, stdio: 'ignore' }));
  check('testplanner start', await wacht(async () => (await fetch(SERVER + '/admin/login')).ok));
  // een verzonnen speler, zodat we zien dat gegevens binnenkomen
  execFileSync(PY, ['-c', `import sqlite3;c=sqlite3.connect(${JSON.stringify(path.join(tmp, 'srv.db'))});c.execute("INSERT INTO users (first_name,last_name,email,password_hash) VALUES ('Piet','Voorbeeld','piet@voorbeeld.test','x')");c.commit()`]);
  fs.writeFileSync(path.join(tmp, 'biljart.txt'), `app_url=http://127.0.0.1:8123/index.html\nserver_url=${SERVER}\n`);
  const penv = Object.assign({}, env, { BILJART_DATA: path.join(tmp, 'data'), BILJART_CONFIG: path.join(tmp, 'biljart.txt'), BILJART_POORT: String(pPi), BILJART_TEMPO: '10' });
  procs.push(spawn(PY, [path.join(TS, 'pi/biljart_lokaal.py')], { env: penv, stdio: 'ignore' }));
  await wacht(async () => (await fetch('http://127.0.0.1:5000/status')).ok);

  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  const verzoeken = []; page.on('request', r => verzoeken.push(r.url()));
  await page.goto('http://127.0.0.1:8123/index.html');

  console.log('1. Nieuw toestel: koppelscherm');
  const scherm = page.locator('#verbindingScherm');
  await scherm.waitFor({ state: 'visible', timeout: 10000 });
  const code = await wacht(async () => { const t = await scherm.innerText(); const m = t.match(/\b(\d{6})\b/); return m && m[1]; });
  check('blokscherm toont een koppelcode van 6 cijfers', !!code, await scherm.innerText());
  check('het scherm zegt waar de code getypt moet worden (pagina Toestellen)', (await scherm.innerText()).includes('Toestellen'));
  check('de app blokkeert de bediening (scherm bedekt alles)', await page.evaluate(() => { const e = document.elementFromPoint(640, 400); return !!e.closest('#verbindingScherm'); }));
  await page.keyboard.press('PageUp');
  check('presenter-toetsen doen niets zolang het scherm er staat', (await scherm.isVisible()));
  const geenSpelers = await page.evaluate(() => (typeof state !== 'undefined' ? state.players.length : -1));
  check('er zijn nog geen spelers opgehaald (geen gegevens zonder goedkeuring)', geenSpelers === 0, geenSpelers);

  console.log('2. Goedkeuren in de planner');
  const adm = await ctx.request.post(SERVER + '/admin/login', { form: { email: 'test@test.test', pw: 'testwachtwoord' }, maxRedirects: 0 });
  await ctx.request.post(SERVER + '/admin/toestellen', { form: { actie: 'goedkeuren', code, naam: 'Tafel 7' }, maxRedirects: 0 });
  await scherm.waitFor({ state: 'hidden', timeout: 15000 });
  check('na goedkeuren verdwijnt het blokscherm vanzelf', !(await scherm.isVisible()));
  const speler = await wacht(async () => page.evaluate(() => state.players.length > 0 && state.players.map(p => p.name || p.first_name || JSON.stringify(p)).join('|')), 15000);
  check('spelers komen nu van de planner binnen (via de sleutel)', !!speler && speler.includes('Piet'), speler);
  const naam = await wacht(async () => (await page.locator('#clubNaamKop').innerText()) !== '' || 'leeg', 8000);
  check('de koptekst gebruikt de clubnaam van de planner (neutraal "Biljartclub" zolang niets is ingevuld)', (await page.locator('#clubNaamKop').innerText()) === 'Biljartclub', await page.locator('#clubNaamKop').innerText());
  check('alle server-aanroepen gingen naar de planner uit de instellingen, nooit naar een vast adres', verzoeken.filter(u => /^https?:/.test(u) && !u.startsWith('http://127.0.0.1:8123') && !u.startsWith(SERVER) && !u.startsWith('http://localhost:5000') && !u.includes('cdnjs')).length === 0, verzoeken.filter(u => !u.startsWith('http://127.0.0.1')).join(','));
  check('de knop "QR code voor inlog" is verborgen', !(await page.locator('button:has-text("QR code voor inlog")').isVisible()));

  console.log('2b. Codes van het bestuur: Beheer Matchen en Dames-avond');
  const heeftBeheer = () => page.evaluate(() => { const b = document.querySelector('.header-buttons .upload-btn'); return !!b && b.offsetParent !== null; });
  const heeftDames = () => page.evaluate(() => { const b = document.getElementById('damesKnop'); return !!b && b.offsetParent !== null; });
  check('zonder ingestelde codes: geen knop "Beheer Matchen" en geen knop "Dames-avond"', !(await heeftBeheer()) && !(await heeftDames()));
  check('er staat geen vast wachtwoord of pincode meer in de app', await page.evaluate(() => typeof DEFAULT_PASSWORD === 'undefined' && typeof DAMES_PIN === 'undefined' && !document.documentElement.innerHTML.includes('admin123')));
  const vroeg = [];
  page.once('dialog', d => { vroeg.push(d.message()); d.accept(); });
  await page.evaluate(() => { const f = document.getElementById('adminPassword'); f.style.display = 'block'; f.value = 'admin123'; checkPassword(); });
  await sleep(400);
  check('zonder ingestelde code opent "admin123" NIETS (ook niet als je de knop omzeilt)', (await page.evaluate(() => state.currentPage)) !== 7 && vroeg.some(m => m.includes('niet beschikbaar')), vroeg.join('|'));
  await page.evaluate(() => { document.getElementById('adminPassword').style.display = 'none'; });
  execFileSync(PY, ['-c', `import sqlite3;c=sqlite3.connect(${JSON.stringify(path.join(tmp, 'srv.db'))});c.execute("INSERT OR REPLACE INTO club_settings (key,value) VALUES ('app_beheer_code','bestuurscode')");c.execute("INSERT OR REPLACE INTO club_settings (key,value) VALUES ('dames_code','4711')");c.commit()`]);
  await page.reload(); await sleep(2500);
  check('met codes in de planner: beide knoppen verschijnen', (await heeftBeheer()) && (await heeftDames()));
  const meldingen = []; page.on('dialog', d => { meldingen.push(d.message()); d.accept(); });
  const beheerKnop = page.locator('.header-buttons .upload-btn');
  await beheerKnop.click(); await page.fill('#adminPassword', 'admin123'); await beheerKnop.click();
  check('het oude wachtwoord "admin123" werkt niet meer', meldingen.some(m => m.includes('Onjuist')) && (await page.evaluate(() => state.currentPage)) !== 7, meldingen.join('|'));
  await page.fill('#adminPassword', 'bestuurscode'); await beheerKnop.click(); await sleep(500);
  check('de code uit de planner opent Beheer Matchen', (await page.evaluate(() => state.currentPage)) === 7);
  await page.evaluate(() => showPage(1)); await sleep(300);
  await page.click('#damesKnop'); await page.waitForSelector('#damesPinOverlay');
  for (const k of '8970') await page.locator('#damesDigits button', { hasText: new RegExp('^' + k + '$') }).click();
  check('de oude damescode 8970 werkt niet meer', (await page.locator('#damesPinError').innerText()).includes('Foute code') && await page.locator('#damesPinOverlay').count() === 1);
  for (const k of '4711') await page.locator('#damesDigits button', { hasText: new RegExp('^' + k + '$') }).click().catch(() => {});
  await sleep(1200);
  check('de damescode uit de planner opent de Dames-avond', await page.locator('#damesPinOverlay').count() === 0);
  await page.waitForSelector('text=kies 2 speelsters', { timeout: 8000 }).catch(() => {}); await sleep(2500);   // laat het ophalen van de speelsters afronden
  await page.reload(); await sleep(2000);

  console.log('3. Uitgeschakeld en weer ingeschakeld');
  await ctx.request.post(SERVER + '/admin/toestellen', { form: { actie: 'uitschakelen', id: '1' }, maxRedirects: 0 });
  await page.reload();
  await scherm.waitFor({ state: 'visible', timeout: 10000 });
  await wacht(async () => (await scherm.innerText()).includes('uitgeschakeld'), 15000);
  check('uitgeschakeld toestel: duidelijk bericht, geen gegevens', (await scherm.innerText()).includes('uitgeschakeld'));
  await ctx.request.post(SERVER + '/admin/toestellen', { form: { actie: 'inschakelen', id: '1' }, maxRedirects: 0 });
  await scherm.waitFor({ state: 'hidden', timeout: 20000 });
  check('weer ingeschakeld: scherm verdwijnt', !(await scherm.isVisible()));

  console.log('4. Planner niet bereikbaar bij het opstarten');
  procs.forEach(p => p.kill());   // planner én lokaal programma stoppen
  await sleep(500);
  procs.length = 0;
  const leeg = spawn(PY, [path.join(TS, 'pi/biljart_lokaal.py')], { env: Object.assign({}, penv, { BILJART_DATA: path.join(tmp, 'data') }), stdio: 'ignore' }); procs.push(leeg);
  await wacht(async () => (await fetch('http://127.0.0.1:5000/status')).ok);
  await page.reload();
  await scherm.waitFor({ state: 'visible', timeout: 10000 });
  await wacht(async () => (await scherm.innerText()).includes('Geen verbinding'), 20000);
  check('zonder verbinding: "Geen verbinding", er wordt niet gespeeld', (await scherm.innerText()).includes('Geen verbinding') && (await scherm.innerText()).toLowerCase().includes('op papier'));
  check('de app is niet te bedienen: het scherm dekt alles af, ook toetsen worden tegengehouden', await page.evaluate(() => !!document.elementFromPoint(640, 400).closest('#verbindingScherm')));
  await page.keyboard.press('Tab'); await page.keyboard.press('PageUp');
  check('na toetsen is het scherm er nog', await scherm.isVisible());
  check('geen JavaScript-fouten', errs.length === 0, errs.join(';'));
  await b.close();
  const slecht = res.filter(x => !x).length;
  console.log(`\nResultaat: ${res.length - slecht} van ${res.length} gecontroleerd en in orde${slecht ? ', ' + slecht + ' FOUT' : ''}.`);
  procs.forEach(p => p.kill()); app.close(); fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(slecht ? 1 : 0);
})().catch(e => { console.error(e); procs.forEach(p => p.kill()); process.exit(2); });
