// Dump compaction-related facts for the running DSH profile.
// Usage: ELECTRON_RUN_AS_NODE=1 <dsh-node> compact-stats.mjs > out.txt
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const HOME = process.env.USERPROFILE;
const cacheDir = path.join(HOME, '.dsh', 'storages', 'session_projcache', 'sessions');
const sessionsRoot = path.join(HOME, '.dsh', 'sessions');

const truncate = (v, max = 400) => {
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) + `…[${v.length} chars]` : v;
  if (Array.isArray(v)) return v.length > 8 ? [...v.slice(0, 8).map(x => truncate(x, max)), `…+${v.length - 8}`] : v.map(x => truncate(x, max));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = truncate(x, max);
    return o;
  }
  return v;
};

// 1) recent projcache snapshots
const cacheFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'))
  .map(f => ({ f, st: fs.statSync(path.join(cacheDir, f)) }))
  .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
console.log('== projcache files (newest first) ==');
for (const { f, st } of cacheFiles.slice(0, 4)) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8')); } catch (e) { console.log(f, 'PARSE FAIL', e.message); continue; }
  console.log('\n---', f, 'mtime=', new Date(st.mtimeMs).toISOString(), 'size=', st.size);
  console.log('top keys:', Object.keys(j).join(','));
  const rec = j.record || j;
  if (rec.rows) {
    for (const [k, v] of Object.entries(rec.rows)) {
      const val = v && typeof v === 'object' && 'val' in v ? v.val : v;
      console.log(`  row ${k}:`, JSON.stringify(truncate(val, 600)));
    }
  }
  // any other fields worth seeing
  for (const [k, v] of Object.entries(j)) {
    if (k === 'record' || k === 'rows') continue;
    const s = JSON.stringify(truncate(v, 300));
    if (s && s.length > 2) console.log(`  field ${k}:`, s);
  }
}

// 2) find the session log for the newest session and dump compaction events
function findLogFile(dir) {
  const hits = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) hits.push(...findLogFile(path.join(dir, e.name)));
    else if (e.name === 'session.v4.jsonl.zstd') hits.push(path.join(dir, e.name));
  }
  return hits;
}

const newest = cacheFiles[0];
const newestBase = newest ? newest.f.replace(/\.json$/, '') : null;
console.log('\n== session logs found ==');
const logs = findLogFile(sessionsRoot);
for (const l of logs) console.log(l, '->', fs.statSync(l).size, 'bytes');

function decodeLog(file) {
  const buf = fs.readFileSync(file);
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const parts = [];
  let start = 0;
  let frames = 0;
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) {
      if (i > start) {
        try { parts.push(zlib.zstdDecompressSync(buf.subarray(start, i))); frames++; } catch (e) { parts.push(Buffer.from('')); }
      }
      start = i;
    }
  }
  if (start < buf.length) { try { parts.push(zlib.zstdDecompressSync(buf.subarray(start))); frames++; } catch (e) {} }
  const text = Buffer.concat(parts).toString('utf8');
  const events = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { events.push(JSON.parse(t)); } catch (e) {}
  }
  return { events, frames, bytes: buf.length, textBytes: Buffer.byteLength(text) };
}

const target = logs.find(l => newestBase && l.includes(newestBase)) || logs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (target) {
  console.log('\n== decoding', target, '==');
  const { events, frames, bytes, textBytes } = decodeLog(target);
  console.log('frames=', frames, 'compressed=', bytes, 'decoded=', textBytes, 'events=', events.length);
  const typeCount = new Map();
  for (const ev of events) {
    const t = ev?.event?.type || ev?.type || '?';
    typeCount.set(t, (typeCount.get(t) || 0) + 1);
  }
  console.log('event types:', [...typeCount.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
  console.log('\n== compaction events ==');
  for (const ev of events) {
    const e = ev?.event || ev;
    const t = e?.type || '';
    if (!/compact/i.test(t)) continue;
    console.log('\n@', e.seq, e.time, t);
    console.log(JSON.stringify(truncate(e.data, 1200), null, 1));
  }
}
