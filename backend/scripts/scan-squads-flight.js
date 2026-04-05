import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: 'text/html',
  'Accept-Language': 'en-US,en;q=0.9',
};

const decodeChunks = (html) => {
  const s = String(html || '');
  const re = /self\.__next_f\.push\(\[\s*(\d+)\s*,\s*"((?:\\[\s\S]|[^"\\])*)"\s*\]\)\s*;?/g;
  const out = [];
  for (const m of s.matchAll(re)) {
    let decoded = '';
    try {
      decoded = JSON.parse(`"${m[2]}"`);
    } catch {
      decoded = m[2];
    }
    out.push({ idx: Number(m[1]), str: decoded });
  }
  return out;
};

const main = async () => {
  const id = process.argv[2] || '149684';
  const url = `https://www.cricbuzz.com/cricket-match-squads/${id}`;

  const res = await axios.get(url, {
    headers: HEADERS,
    timeout: 20000,
    validateStatus: () => true,
  });

  const html = String(res.data || '');
  console.log('status', res.status, 'html len', html.length);

  const chunks = decodeChunks(html);
  console.log('chunks', chunks.length);

  const needles = [
    'squad',
    'playingXI',
    'player',
    'team1',
    'team2',
    'teamName',
    'series',
    'profiles',
    'matchTeamInfo',
  ];

  const hits = [];
  for (const ch of chunks) {
    const t = String(ch.str || '').toLowerCase();
    const found = needles.filter((n) => t.includes(n.toLowerCase()));
    if (found.length > 0) {
      hits.push({ idx: ch.idx, len: String(ch.str || '').length, found });
    }
  }

  console.log('hits', hits.slice(0, 20));

  const interesting = chunks.filter((ch) => {
    const t = String(ch.str || '').toLowerCase();
    return t.includes('squad') && t.includes('team') && t.includes('player');
  });

  for (const ch of interesting.slice(0, 5)) {
    console.log('\n--- chunk idx', ch.idx, 'len', String(ch.str || '').length, '---');
    console.log(String(ch.str || '').slice(0, 3000));
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
