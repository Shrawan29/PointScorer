import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: 'text/html',
  'Accept-Language': 'en-US,en;q=0.9',
};

const extractFlightChunks = (html) => {
  const s = String(html || '');
  const re = /self\.__next_f\.push\(\[\s*(\d+)\s*,\s*"([\s\S]*?)"\s*\]\)\s*;?/g;
  const chunks = [];
  for (const m of s.matchAll(re)) {
    const idx = Number(m[1]);
    const raw = m[2];
    // Best-effort unescape
    let str;
    try {
      str = JSON.parse(`"${raw.replace(/\\/g, '\\\\').replace(/\"/g, '\\"')}"`);
    } catch {
      str = raw;
    }
    chunks.push({ idx, str });
  }
  return chunks;
};

const count = (hay, needle) => {
  const s = String(hay);
  const n = String(needle);
  let i = 0;
  let c = 0;
  while (true) {
    const j = s.indexOf(n, i);
    if (j === -1) break;
    c += 1;
    i = j + n.length;
  }
  return c;
};

const main = async () => {
  const matchId = process.argv[2] || '145385';
  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}/scorecard`;

  const res = await axios.get(url, { headers: HEADERS, validateStatus: () => true, timeout: 15000 });
  const html = String(res.data || '');
  const chunks = extractFlightChunks(html);

  const needles = ['"runs"', '"fours"', '"sixes"', '"wickets"', '"bat"', '"bowl"', '"score"', '"dismissal"'];

  const scored = chunks.map((c, i) => {
    const low = c.str.toLowerCase();
    const score = needles.reduce((sum, n) => sum + count(low, n.replace(/"/g, '')), 0);
    return { i, idx: c.idx, len: c.str.length, score };
  });

  scored.sort((a, b) => b.score - a.score);
  console.log('top 10 chunks by heuristic score:');
  console.log(scored.slice(0, 10));

  const top = scored[0];
  const str = chunks[top.i]?.str || '';
  console.log('\n--- top chunk snippet ---');
  console.log(str.slice(0, 1200));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
