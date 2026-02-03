import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: 'text/html',
  'Accept-Language': 'en-US,en;q=0.9',
};

const main = async () => {
  const matchId = process.argv[2] || '145385';
  const mode = process.argv[3] || 'scores';
  const url =
    mode === 'live-cricket-scorecard'
      ? // slug is optional; Cricbuzz usually redirects/serves something reasonable
        `https://www.cricbuzz.com/live-cricket-scorecard/${matchId}`
      : `https://www.cricbuzz.com/live-cricket-scores/${matchId}/scorecard`;

  const res = await axios.get(url, { headers: HEADERS, validateStatus: () => true, timeout: 15000 });
  const html = String(res.data || '');

  console.log(`url: ${url}`);
  console.log(`status: ${res.status} len: ${html.length}`);

  const needles = [
    'batTeamDetails',
    'bowlTeamDetails',
    'scoreCard',
    'scorecard',
    'inningsScoreList',
    'matchHeader',
    'batsmanData',
    'bowlerData',
    'battingScorecard',
    'bowlingScorecard',
    'fullScorecard',
    'scorecardData',
    'playerDetails',
  ];

  for (const n of needles) {
    const i = html.indexOf(n);
    console.log(`${n}: ${i}`);
  }

  const around = (token) => {
    const i = html.indexOf(token);
    if (i === -1) return;
    const start = Math.max(0, i - 200);
    const end = Math.min(html.length, i + 400);
    console.log(`\n--- context around ${token} ---`);
    console.log(html.slice(start, end));
  };

  around('batTeamDetails');
  around('inningsScoreList');
  around('matchHeader');
  around('playerDetails');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
