// Dump command + header events from the current session log.
import fs from 'node:fs';
const LOG = 'C:\\Users\\ADMINI~1.DES\\AppData\\Local\\Temp';
const zlib = await import('node:zlib');
const file = 'C:\\Users\\Administrator.DESKTOP-HV32D5I\\.dsh\\sessions\\--D-DeepSeek~0020Harness-workbox--\\session-d5ca6653-e3f2-4fdc-982c-e862a0f89749\\session.v4.jsonl.zstd';
const buf = fs.readFileSync(file);
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const parts = []; let start = 0;
for (let i = 0; i + 4 <= buf.length; i++) {
  if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) {
    if (i > start) { try { parts.push(zlib.zstdDecompressSync(buf.subarray(start, i))); } catch (e) {} }
    start = i;
  }
}
if (start < buf.length) { try { parts.push(zlib.zstdDecompressSync(buf.subarray(start))); } catch (e) {} }
const events = Buffer.concat(parts).toString('utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const trunc = (v, m = 800) => { if (typeof v === 'string') return v.length > m ? v.slice(0, m) + `…[${v.length}]` : v; if (Array.isArray(v)) return v.length > 6 ? [...v.slice(0, 6).map(x => trunc(x, m)), `…+${v.length - 6}`] : v.map(x => trunc(x, m)); if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = trunc(x, m); return o; } return v; };
for (const ev of events) {
  const e = ev?.event || ev;
  const t = e?.type || '';
  if (!/^(command\/|request\/header|request\/context|user\/message)/.test(t)) continue;
  console.log('\n@', e.seq, e.time, t);
  console.log(JSON.stringify(trunc(e.data, 700), null, 1));
}
