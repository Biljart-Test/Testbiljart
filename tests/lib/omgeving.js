// Gedeelde opstart voor de end-to-end tests: echte testplanner + echt lokaal Pi-programma + score-app in een browser.
// Alles lokaal, verzonnen gegevens, niets naar een live server. TESTSERVER en PYTHON zijn nodig (zie test-koppelen.js).
const { spawn, execFileSync } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vrijePoort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
async function wacht(f, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await f(); if (v) return v; } catch (e) {} await sleep(200); } return null; }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png' };

async function start(repo, opties = {}) {
  const TS = process.env.TESTSERVER, PY = process.env.PYTHON || 'python3';
  if (!TS) { console.error('Zet TESTSERVER (map van de repo Testserver)'); process.exit(2); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
  const procs = [];
  const pSrv = await vrijePoort(); const SERVER = `http://127.0.0.1:${pSrv}`; const DB = path.join(tmp, 'srv.db');
  const app = http.createServer((req, rs) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(repo, p);
    if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
    rs.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs); });
  await new Promise(r => app.listen(8123, '127.0.0.1', r));
  const env = Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: '1' });
  procs.push(spawn(PY, [path.join(TS, 'tests/start_testserver.py'), '--db', DB, '--port', String(pSrv)], { env, stdio: 'ignore' }));
  if (!await wacht(async () => (await fetch(SERVER + '/admin/login')).ok)) throw new Error('testplanner startte niet');
  fs.writeFileSync(path.join(tmp, 'biljart.txt'), `app_url=http://127.0.0.1:8123/index.html\nserver_url=${SERVER}\n`);
  const penv = Object.assign({}, env, { BILJART_DATA: path.join(tmp, 'data'), BILJART_CONFIG: path.join(tmp, 'biljart.txt'), BILJART_POORT: '5000', BILJART_TEMPO: '10' });
  procs.push(spawn(PY, [path.join(TS, 'pi/biljart_lokaal.py')], { env: penv, stdio: 'ignore' }));
  await wacht(async () => (await fetch('http://127.0.0.1:5000/status')).ok);
  const sql = code => execFileSync(PY, ['-c', `import sqlite3,json;c=sqlite3.connect(${JSON.stringify(DB)});${code};c.commit()`]).toString();
  const sqlJson = code => JSON.parse(execFileSync(PY, ['-c', `import sqlite3,json;c=sqlite3.connect(${JSON.stringify(DB)});c.row_factory=sqlite3.Row;${code}`]).toString());
  async function stop() { procs.forEach(p => p.kill()); app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  return { SERVER, DB, tmp, sql, sqlJson, stop, sleep, wacht };
}
module.exports = { start, sleep, wacht };
