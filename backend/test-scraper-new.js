import { 
	scrapeTodayAndLiveMatches, 
	scrapeUpcomingMatches,
	scrapeMatchDetails
} from './src/services/scraper.service.js';

const runTests = async () => {
	console.log('======================================');
	console.log('SCRAPER TEST SUITE');
	console.log('======================================\n');

	// Test 1: Live Matches
	console.log('TEST 1: Scraping Today\'s and Live Matches');
	console.log('-------------------------------------------');
	try {
		const liveMatches = await scrapeTodayAndLiveMatches();
		console.log(`✓ Retrieved ${liveMatches.length} live/today matches`);
		
		if (liveMatches.length > 0) {
			console.log('\nSample live matches:');
			liveMatches.slice(0, 3).forEach((m, idx) => {
				console.log(`  ${idx + 1}. ${m.matchName} (${m.matchType}) - Status: ${m.matchStatus}`);
				console.log(`     URL: ${m.matchUrl?.substring(0, 60)}...`);
			});
		} else {
			console.warn('⚠ WARNING: No live matches found!');
		}
	} catch (error) {
		console.error('✗ Error scraping live matches:', error.message);
	}

	console.log('\n');

	// Test 2: Upcoming Matches
	console.log('TEST 2: Scraping Upcoming Matches');
	console.log('-------------------------------------------');
	try {
		const upcomingMatches = await scrapeUpcomingMatches();
		console.log(`✓ Retrieved ${upcomingMatches.length} upcoming matches`);
		
		if (upcomingMatches.length > 0) {
			console.log('\nSample upcoming matches:');
			upcomingMatches.slice(0, 3).forEach((m, idx) => {
				console.log(`  ${idx + 1}. ${m.matchName} (${m.matchType})`);
				console.log(`     Date: ${m.dateInfo || 'TBA'}`);
				console.log(`     URL: ${m.matchUrl?.substring(0, 60)}...`);
			});
		} else {
			console.warn('⚠ WARNING: No upcoming matches found!');
		}
	} catch (error) {
		console.error('✗ Error scraping upcoming matches:', error.message);
	}

	console.log('\n');

	// Test 3: Match Details (if we have a URL)
	console.log('TEST 3: Scraping Match Details');
	console.log('-------------------------------------------');
	try {
		const matches = await scrapeTodayAndLiveMatches();
		if (matches.length > 0 && matches[0].matchUrl) {
			console.log(`Testing with URL: ${matches[0].matchUrl}`);
			const details = await scrapeMatchDetails(matches[0].matchUrl);
			
			if (details) {
				console.log('✓ Successfully scraped match details:');
				console.log(`  Name: ${details.matchName}`);
				console.log(`  Type: ${details.matchType}`);
				console.log(`  Status: ${details.matchStatus}`);
				console.log(`  Venue: ${details.venue || 'N/A'}`);
			} else {
				console.warn('⚠ Match details returned null');
			}
		} else {
			console.warn('⚠ No match URLs available for testing');
		}
	} catch (error) {
		console.error('✗ Error scraping match details:', error.message);
	}

	console.log('\n');
	console.log('======================================');
	console.log('TEST COMPLETE');
	console.log('======================================');
};

runTests();
