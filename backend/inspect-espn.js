import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const inspect = async () => {
	try {
		console.log('[Inspector] Fetching https://www.espncricinfo.com/live-cricket-score');
		const response = await axios.get('https://www.espncricinfo.com/live-cricket-score', {
			headers: {
				'User-Agent': UA,
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9',
			},
			timeout: 15000,
		});

		const html = response.data;
		console.log(`[Inspector] Received ${html.length} bytes`);

		const $ = cheerio.load(html);

		// Find ALL divs with "match", "fixture", "card" keywords
		console.log('\n=== ELEMENT ANALYSIS ===\n');

		const selectors = [
			'div[data-testid]',
			'div[class*="match"]',
			'div[class*="card"]',
			'div[class*="fixture"]',
			'a[href*="/matches/"]',
			'tr',
			'table',
			'[class*="Match"]',
			'[class*="match-"]',
		];

		for (const sel of selectors) {
			const count = $(sel).length;
			if (count > 0) {
				console.log(`✓ "${sel}": ${count} elements`);
			}
		}

		// Sample elements
		console.log('\n=== SAMPLE HTML STRUCTURE ===\n');

		// Try to find anything with teams/match data
		const potentialMatches = $('div[class], span[class], a[class]').slice(0, 20);
		potentialMatches.each((i, el) => {
			const $el = $(el);
			const tagName = $el.prop('tagName');
			const classes = $el.attr('class');
			const text = $el.text()?.substring(0, 80).trim();
			const href = $el.attr('href');
			
			if (text && text.length > 5) {
				console.log(`${tagName} .${classes} - "${text}"`);
				if (href) console.log(`  └─ href: ${href}`);
			}
		});

		// Try direct structure analysis
		console.log('\n=== UNIQUE CLASSES ===\n');
		const uniqueClasses = new Set();
		$('[class]').each((i, el) => {
			const classes = $(el).attr('class');
			if (classes && classes.length < 100) {
				uniqueClasses.add(classes.split(' ')[0]);
			}
			if (uniqueClasses.size >= 30) return false;
		});

		Array.from(uniqueClasses).sort().forEach(c => {
			console.log(`  - ${c}`);
		});

		// Save first 5000 chars to file for manual inspection
		fs.writeFileSync('espn_sample.html', html.substring(0, 100000), 'utf8');
		console.log('\n✓ Saved first 100KB to espn_sample.html');

	} catch (error) {
		console.error('[Inspector] Error:', error.message);
	}
};

inspect();
