import axios from 'axios';
import fs from 'fs';

const UA_LIST = [
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const client = axios.create({
	timeout: 15000,
	decompress: true,
});

const inspect = async () => {
	try {
		const response = await client.get('https://www.espncricinfo.com/live-cricket-score', {
			headers: {
				'User-Agent': UA_LIST[0],
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9',
				'Accept-Encoding': 'gzip, deflate, br',
				'Referer': 'https://www.google.com/',
			},
		});

		const html = response.data;
		console.log(`Saved ${html.length} bytes to live-score.html`);
		fs.writeFileSync('live-score.html', html, 'utf8');

		// Extract just the body content for analysis
		const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
		if (bodyMatch) {
			const bodyContent = bodyMatch[1].substring(0, 150000);
			fs.writeFileSync('live-score-body.html', bodyContent, 'utf8');
			console.log('Saved body content to live-score-body.html');
		}

		// Look for match-related content
		const matches = html.match(/match|fixture|live|cricket|score|team/gi) || [];
		console.log(`Found ${matches.length} instances of match-related keywords`);

		// Extract all JSON objects (data attributes)
		const jsons = html.match(/\{[^{}]*"(?:match|team|fixture|game)[^{}]*\}/gi) || [];
		if (jsons.length > 0) {
			console.log('\nFound JSON data structures:');
			jsons.slice(0, 3).forEach((j, i) => {
				console.log(`  ${i + 1}. ${j.substring(0, 80)}...`);
			});
		}

	} catch (error) {
		console.error('Error:', error.message);
		console.error('Status:', error.response?.status);
	}
};

inspect();
