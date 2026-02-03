import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: 'text/html',
  'Accept-Language': 'en-US,en;q=0.9',
};

const extractNextData = (html) => {
  const s = String(html || '');
  const m = s.match(/<script[^>]+id=\"__NEXT_DATA__\"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
};

const main = async () => {
  const matchId = process.argv[2] || '145385';
  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}/scorecard`;

  const res = await axios.get(url, { headers: HEADERS, validateStatus: () => true, timeout: 15000 });
  console.log('status', res.status, 'len', String(res.data || '').length);

  const html = String(res.data || '');
  console.log('contains __NEXT_DATA__:', html.includes('__NEXT_DATA__'));
  const scriptIds = Array.from(html.matchAll(/<script[^>]+id=\"([^\"]+)\"[^>]*>/g)).map((m) => m[1]);
  console.log('script ids (first 10):', scriptIds.slice(0, 10));

  const nextData = extractNextData(res.data);
  if (!nextData) {
    console.log('No __NEXT_DATA__ found');
    process.exit(2);
  }

  const pageProps = nextData?.props?.pageProps;
  console.log('pageProps keys:', pageProps ? Object.keys(pageProps) : null);

  // Find likely scorecard-containing objects by scanning for known keywords
  const raw = JSON.stringify(pageProps);
  const hints = ['scorecard', 'scoreCard', 'innings', 'batsmen', 'batting', 'bowling', 'wickets'];
  for (const h of hints) {
    console.log(`contains ${h}:`, raw.includes(h));
  }

  console.log('pageProps snippet:', raw.slice(0, 800));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
