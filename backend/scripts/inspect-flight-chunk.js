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
  const chunkIndex = Number(process.argv[3] || '26');
  const token = process.argv[4] || 'scoreCard';

  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}/scorecard`;
  const res = await axios.get(url, { headers: HEADERS, validateStatus: () => true, timeout: 15000 });
  const html = String(res.data || '');
  const chunks = extractFlightChunks(html);

  const chunk = chunks[chunkIndex];
  if (!chunk) {
    console.error(`No chunk at index ${chunkIndex}. total=${chunks.length}`);
    process.exit(2);
  }

  const s = chunk.str;
  const i = s.indexOf(token);
  console.log({ chunkIndex, idx: chunk.idx, len: s.length, token, firstIndex: i });
  if (i === -1) {
    console.log('token not found; printing head/tail snippets');
    console.log('--- head ---');
    console.log(s.slice(0, 1200));
    console.log('--- tail ---');
    console.log(s.slice(-1200));
    return;
  }

  const start = Math.max(0, i - 600);
  const end = Math.min(s.length, i + 2000);
  console.log('--- context ---');
  console.log(s.slice(start, end));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
