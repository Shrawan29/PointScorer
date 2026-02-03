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

const main = async () => {
  const matchId = process.argv[2] || '145385';
  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}/scorecard`;
  const res = await axios.get(url, { headers: HEADERS, validateStatus: () => true, timeout: 15000 });
  const html = String(res.data || '');
  const chunks = extractFlightChunks(html);

  const needles = [
    'scoreCard',
    'scorecard',
    'batTeamDetails',
    'batsman',
    'batting',
    'bowling',
    'wickets',
    'fours',
    'sixes',
    'inningsScoreList',
    'matchHeader',
    'playerDetails',
  ];

  const hits = [];
  for (let i = 0; i < chunks.length; i++) {
    const { idx, str } = chunks[i];
    const lower = str.toLowerCase();
    const found = needles.filter((n) => lower.includes(n.toLowerCase()));
    if (found.length) {
      hits.push({ i, idx, len: str.length, found });
    }
  }

  console.log(`chunks: ${chunks.length}`);
  console.log(`hits: ${hits.length}`);
  console.log(hits.slice(0, 50));

  const interesting = hits
    .filter((h) => h.found.includes('wickets') || h.found.includes('fours') || h.found.includes('sixes') || h.found.includes('scoreCard'))
    .slice(0, 5);

  for (const h of interesting) {
    console.log(`\n--- chunk i=${h.i} idx=${h.idx} len=${h.len} found=${h.found.join(',')} ---`);
    console.log(chunks[h.i].str.slice(0, 2000));
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
