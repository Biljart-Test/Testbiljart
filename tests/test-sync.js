// Test: synchronisatie van uitslagen (server bereikbaar, wifi weg, herstart, dubbel versturen).
// Gebruik: node tests/test-sync.js [repo-map]     (standaard: de map boven tests/)
// Er gaat NOOIT een verzoek naar een echte server: de planner (https://planner.test) en het lokale Pi-programma worden nagemaakt.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(process.argv[2] || path.join(__dirname, '..'));

// --- kleine statische webserver voor de repo ---
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(REPO, p);
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// --- nagebootste Pi-dienst (blijft bestaan bij "herstart", zoals de SD-kaart) ---
const pi = { backups: {}, pending: {} };
const log = { serverPosts: [], piDeletes: [], blockedLive: [], sleutels: [] };
let serverUp = true;

async function setup(ctx) {
  await ctx.route('https://planner.test/**', async route => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    log.sleutels.push(req.headers()['x-toestel-sleutel']);
    const url = req.url();
    log.blockedLive.push(req.method() + ' ' + url);
    if (url.endsWith('/api/match-result') && req.method() === 'POST') {
      if (!serverUp) return route.abort('internetdisconnected');
      log.serverPosts.push(JSON.parse(req.postData()).match_id);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' });
    }
    if (!serverUp) return route.abort('internetdisconnected');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' });
  });
  await ctx.route(/^http:\/\/(localhost|127\.0\.0\.1):5000\/.*/, async route => {
    const req = route.request();
    const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': '*', 'access-control-allow-headers': '*' };
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const m = u.pathname;
    if (m === '/status') return json({ status: 'goedgekeurd', koppelcode: '', naam: 'Testtafel', server_url: 'https://planner.test', app_url: 'http://127.0.0.1:8123/index.html' });
    if (m === '/sleutel') return json({ sleutel: 'testsleutel-' + 'x'.repeat(30) });
    if (m === '/shutdown') return json({ ok: true });
    if (m === '/backups' && req.method() === 'GET') return json(Object.values(pi.backups));
    if (m === '/backup' && req.method() === 'POST') { const d = JSON.parse(req.postData()); pi.backups[d.matchId] = d; return json({ ok: true }); }
    if (m.startsWith('/backup/') && req.method() === 'DELETE') { const id = decodeURIComponent(m.slice(8)); delete pi.backups[id]; log.piDeletes.push('backup:' + id); return json({ ok: true }); }
    if (m === '/pending-matches' && req.method() === 'GET') return json(Object.values(pi.pending));
    if (m === '/pending-match' && req.method() === 'POST') { const d = JSON.parse(req.postData()); pi.pending[d.match_id] = d; return json({ ok: true }); }
    if (m.startsWith('/pending-match/') && req.method() === 'DELETE') { const id = decodeURIComponent(m.slice(15)); delete pi.pending[id]; log.piDeletes.push('pending:' + id); return json({ ok: true }); }
    return json({});
  });
}

function fakeMatch(id) {
  return { id, wit: 'Testspeler A', geel: 'Testspeler B', wit_club_id: 90001, geel_club_id: 90002, date: '2026-11-22',
    discipline: 'Libre', cat: 3, witScore: 30, geelScore: 12, witTurns: [10, 20], geelTurns: [12], witHighest: 20, geelHighest: 12, completed: true };
}
function fakeBackup(id) {
  return { matchId: id, completed: true, wit: 'Testspeler A', geel: 'Testspeler B', date: '2026-11-22', discipline: 'Libre', cat: 3,
    wit_club_id: 90001, geel_club_id: 90002, witScore: 30, geelScore: 12, witTurns: [10, 20], geelTurns: [12], witHighest: 20, geelHighest: 12 };
}
const reset = () => { log.serverPosts.length = 0; log.piDeletes.length = 0; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, extra) { results.push(ok); console.log((ok ? '  OK   ' : '  FOUT ') + name + (extra ? '  [' + extra + ']' : '')); }

(async () => {
  await new Promise(r => srv.listen(8123, r));
  const browser = await chromium.launch();
  const base = 'http://127.0.0.1:8123/index.html';
  console.log('\n=== Synchronisatie van uitslagen ===');

  // ---------- Test 1: laadt zonder JS-fouten, juiste versies actief ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await setup(ctx);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(base); await sleep(800);
    const info = await page.evaluate(() => ({
      sync: window.syncMatchToAPI.toString().includes('clearMatchBackup'),
      pend: (typeof syncPendingMatchesEcht === 'function' ? syncPendingMatchesEcht : window.syncPendingMatches).toString().includes('LOKAAL_URL'),
      save: saveToPendingQueue.toString().includes('LOKAAL_URL'),
      rem: removeFromPendingQueue.toString().includes('LOKAAL_URL'),
    }));
    console.log('Test 1: pagina laadt, welke versie van de functies is actief?');
    check('de app stuurt de sleutel van het toestel mee naar de planner', await (async () => { await page.evaluate(() => window.serverFetch('/api/club')); return log.sleutels.includes('testsleutel-' + 'x'.repeat(30)); })());
    check('er staat nergens meer een KPBC-adres in de app', !(await page.content()).toLowerCase().includes('kpbc') );
    check('geen JavaScript-fouten bij het laden', errs.length === 0, errs.join('; '));
    check('syncMatchToAPI wist de Pi-back-up (goede versie)', info.sync);
    check('syncPendingMatches gebruikt de Pi-wachtrij (goede versie)', info.pend);
    check('saveToPendingQueue schrijft ook naar de Pi (goede versie)', info.save);
    check('removeFromPendingQueue wist ook op de Pi (goede versie)', info.rem);
    await ctx.close();
  }

  // ---------- Test 2: server bereikbaar -> back-up op Pi wordt gewist ----------
  {
    serverUp = true; reset(); pi.backups = {}; pi.pending = {};
    const ctx = await browser.newContext(); await setup(ctx);
    const page = await ctx.newPage(); await page.goto(base); await sleep(600);
    const id = 'T2-' + Date.now();
    pi.backups[id] = fakeBackup(id);
    await page.evaluate(m => { localStorage.setItem('biljart_match_backup', JSON.stringify({ matchId: m.id })); return window.syncMatchToAPI(m); }, fakeMatch(id));
    await sleep(400);
    console.log('Test 2: match versturen terwijl de server bereikbaar is');
    check('uitslag is naar de server gestuurd', log.serverPosts.includes(id), log.serverPosts.join(','));
    check('back-up op de Pi is gewist na bevestiging', !(id in pi.backups) && log.piDeletes.includes('backup:' + id), JSON.stringify(Object.keys(pi.backups)));
    check('back-up in de browser is gewist', await page.evaluate(() => localStorage.getItem('biljart_match_backup') === null));
    await ctx.close();
  }

  // ---------- Test 3: wifi weg -> match blijft bewaard, op de Pi ----------
  let idOffline;
  {
    serverUp = false; reset(); pi.backups = {}; pi.pending = {};
    const ctx = await browser.newContext(); await setup(ctx);
    const page = await ctx.newPage(); await page.goto(base); await sleep(600);
    idOffline = 'T3-' + Date.now();
    pi.backups[idOffline] = fakeBackup(idOffline);
    const res = await page.evaluate(m => window.syncMatchToAPI(m), fakeMatch(idOffline));
    await sleep(400);
    console.log('Test 3: match versturen terwijl de wifi weg is');
    check('versturen mislukt netjes (geeft false terug)', res === false);
    check('match staat in de wachtrij in de browser', await page.evaluate(i => JSON.parse(localStorage.getItem('pendingMatches') || '[]').some(m => m.match_id === i), idOffline));
    check('match staat OOK in de wachtrij op de Pi (SD-kaart)', idOffline in pi.pending, JSON.stringify(Object.keys(pi.pending)));
    check('back-up op de Pi is NIET gewist', idOffline in pi.backups);
    await ctx.close();
  }

  // ---------- Test 4: herstart (verse browser, lege localStorage) + wifi terug ----------
  {
    serverUp = true; reset();
    const ctx = await browser.newContext(); await setup(ctx);   // nieuwe context = incognito-herstart
    const page = await ctx.newPage(); await page.goto(base); await sleep(1500);
    console.log('Test 4: herstart na wifi-uitval, wifi is terug');
    check('lege browser (zoals na herstart): geen wachtrij in localStorage', await page.evaluate(() => localStorage.getItem('pendingMatches') === null || localStorage.getItem('pendingMatches') === '[]'));
    check('match uit Pi-wachtrij is alsnog verstuurd, precies één keer (nu: ' + log.serverPosts.filter(x => x === idOffline).length + 'x)', log.serverPosts.filter(x => x === idOffline).length === 1, log.serverPosts.join(','));
    check('match is uit de Pi-wachtrij gehaald', !(idOffline in pi.pending), JSON.stringify(Object.keys(pi.pending)));
    check('back-up op de Pi is nu gewist', !(idOffline in pi.backups), JSON.stringify(Object.keys(pi.backups)));
    await ctx.close();
  }

  // ---------- Test 5: 'online'-gebeurtenis mag niet dubbel versturen ----------
  {
    serverUp = false; reset(); pi.backups = {}; pi.pending = {};
    const ctx = await browser.newContext(); await setup(ctx);
    const page = await ctx.newPage(); await page.goto(base); await sleep(600);
    const id = 'T5-' + Date.now();
    pi.backups[id] = fakeBackup(id);
    await page.evaluate(m => window.syncMatchToAPI(m), fakeMatch(id));
    await sleep(300);
    serverUp = true; reset();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await sleep(1200);
    const n = log.serverPosts.filter(x => x === id).length;
    console.log('Test 5: wifi komt terug (online-gebeurtenis)');
    check('match wordt precies één keer verstuurd (nu: ' + n + 'x)', n === 1);
    check('Pi-back-up gewist', !(id in pi.backups));
    await ctx.close();
  }

  {
    // Een match zonder id (vroeger: "90002_90001_datum" met underscore): nu het ene formaat, laagste-hoogste club_id
    serverUp = true; reset(); pi.backups = {}; pi.pending = {};
    const ctx = await browser.newContext(); await setup(ctx);
    const page = await ctx.newPage(); await page.goto(base); await sleep(600);
    const zonder = fakeMatch(undefined); delete zonder.id; zonder.wit_club_id = 90002; zonder.geel_club_id = 90001;
    await page.evaluate(m => window.syncMatchToAPI(m), zonder);
    await sleep(500);
    console.log('Test 6: een match zonder id');
    check('wordt verstuurd onder 90001-90002 (laagste-hoogste, geen underscore, geen datum)', log.serverPosts.includes('90001-90002') && !log.serverPosts.some(x => x.includes('_')), JSON.stringify(log.serverPosts));
    await ctx.close();
  }

  await browser.close(); srv.close();
  const bad = results.filter(r => !r).length;
  console.log(`\nResultaat: ${results.length - bad} van ${results.length} gecontroleerd en in orde${bad ? ', ' + bad + ' FOUT' : ''}.`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
