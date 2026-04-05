import {
  scrapeLatestIplEditionMatchesPlayedSoFar,
  scrapeMatchSquadsAndPlayingXI,
  scrapeCricbuzzScorecardPlayerStats,
} from '../src/services/scraper.service.js';

const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

const sample = (arr, n = 8) => (Array.isArray(arr) ? arr.slice(0, n) : []);

const fromPlayerDetails = (details) => {
  const list = Array.isArray(details) ? details : [];
  return list
    .map((p) => p?.name || p?.fullName || p?.playerName || '')
    .filter(Boolean);
};

const countBelonging = (players, expectedSet) => {
  const list = Array.isArray(players) ? players : [];
  let ok = 0;
  for (const p of list) {
    if (expectedSet.has(clean(p))) ok += 1;
  }
  return ok;
};

const main = async () => {
  const matches = await scrapeLatestIplEditionMatchesPlayedSoFar();
  const top = matches.slice(0, 6);

  for (const m of top) {
    const id = String(m?.matchId || '');
    if (!id) continue;

    const [squads, scorecard] = await Promise.all([
      scrapeMatchSquadsAndPlayingXI(id),
      scrapeCricbuzzScorecardPlayerStats(id),
    ]);

    const t1Name = squads?.team1?.name || m?.team1 || 'team1';
    const t2Name = squads?.team2?.name || m?.team2 || 'team2';

    const t1Players = Array.isArray(squads?.team1?.squad) ? squads.team1.squad : [];
    const t2Players = Array.isArray(squads?.team2?.squad) ? squads.team2.squad : [];

    const h1 = scorecard?.matchHeader?.team1 || {};
    const h2 = scorecard?.matchHeader?.team2 || {};

    const h1Names = fromPlayerDetails(h1?.playerDetails || []);
    const h2Names = fromPlayerDetails(h2?.playerDetails || []);

    const h1Set = new Set(h1Names.map(clean).filter(Boolean));
    const h2Set = new Set(h2Names.map(clean).filter(Boolean));

    const t1InH1 = countBelonging(t1Players, h1Set);
    const t1InH2 = countBelonging(t1Players, h2Set);
    const t2InH1 = countBelonging(t2Players, h1Set);
    const t2InH2 = countBelonging(t2Players, h2Set);

    console.log('\n===', id, m?.team1, 'vs', m?.team2, '===');
    console.log('squad labels:', t1Name, '|', t2Name);
    console.log('header labels:', h1?.name || h1?.shortName || '-', '|', h2?.name || h2?.shortName || '-');
    console.log('header details count:', h1Names.length, h2Names.length);
    console.log('team1 matches header1/header2:', t1InH1, '/', t1InH2, 'of', t1Players.length);
    console.log('team2 matches header1/header2:', t2InH1, '/', t2InH2, 'of', t2Players.length);
    console.log('team1 sample:', sample(t1Players));
    console.log('team2 sample:', sample(t2Players));
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
