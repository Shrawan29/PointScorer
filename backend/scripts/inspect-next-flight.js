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
    let str = '';
    try {
      // m[2] is the raw JS string contents; treat it as JSON string to unescape
      str = JSON.parse(`"${m[2].replace(/\\/g, '\\\\').replace(/\"/g, '\\"')}"`);
    } catch {
      str = m[2];
    }
    chunks.push({ idx, str });
  }
  return chunks;
};

const main = async () => {
  const matchId = process.argv[2] || '145385';
  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}/scorecard`;

  const res = await axios.get(url, { headers: HEADERS, validateStatus: () => true, timeout: 15000 });
  const html = String(res.data || '');
  console.log('status', res.status, 'len', html.length);

  const chunks = extractFlightChunks(html);
  console.log('flight chunks', chunks.length);

  const needles = ['scorecard', 'innings', 'batsman', 'bowler', 'wicket', 'fours', 'sixes', 'run out', 'caught'];

  let hits = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    const { str } = chunks[i];
    const low = str.toLowerCase();
    if (needles.some((n) => low.includes(n))) {
      hits += 1;
      console.log('\n--- hit chunk', i, 'idx', chunks[i].idx, 'len', str.length, '---');
      const snippetIdx = Math.max(0, Math.min(...needles.map((n) => {
        const j = low.indexOf(n);
        return j === -1 ? low.length : j;
      })) - 120);
      console.log(str.slice(snippetIdx, snippetIdx + 500).replace(/\s+/g, ' '));
      if (hits >= 10) break;
    }
  }

  if (hits === 0) {
    console.log('No keyword hits in flight chunks');
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
