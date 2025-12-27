const { fetchSnapshot, extractWordPressPosts } = require('./fetch_posts.js');
const { wa_timestamps } = require('./scrapepost2017.js');

async function testSingleSnapshot() {
    // Test with a recent snapshot that's likely to have good content
    const testEntry = wa_timestamps.find(entry => entry[1] === '20230330175424') || wa_timestamps[1];
    
    if (!testEntry) {
        console.error('No test entry found');
        return;
    }
    
    const [urlkey, timestamp, originalUrl, mimetype, statuscode, digest, length] = testEntry;
    
    console.log('Testing single snapshot:');
    console.log(`Timestamp: ${timestamp}`);
    console.log(`Original URL: ${originalUrl}`);
    console.log(`Wayback URL: https://web.archive.org/web/${timestamp}/${originalUrl}`);
    console.log('\n--- Starting test ---\n');
    
    try {
        const result = await fetchSnapshot(timestamp, originalUrl);
        
        console.log('\n--- Test Results ---');
        console.log(`Success: ${result.success}`);
        console.log(`Posts found: ${result.posts.length}`);
        
        if (result.posts.length > 0) {
            console.log('\n--- Sample Post ---');
            const samplePost = result.posts[0];
            console.log(`Title: ${samplePost.title}`);
            console.log(`Content length: ${samplePost.content ? samplePost.content.length : 0} characters`);
            console.log(`Author: ${samplePost.author}`);
            console.log(`Date: ${JSON.stringify(samplePost.date)}`);
            console.log(`Categories: ${samplePost.categories.join(', ')}`);
            console.log(`Tags: ${samplePost.tags.join(', ')}`);
            console.log(`Permalink: ${samplePost.permalink}`);
            console.log(`HTML length: ${samplePost.fullHtml ? samplePost.fullHtml.length : 0} characters`);
            
            if (samplePost.content) {
                console.log('\n--- Content Preview (first 200 chars) ---');
                console.log(samplePost.content.substring(0, 200) + '...');
            }
        }
        
        if (result.error) {
            console.log(`Error: ${result.error}`);
        }
        
        // Save test result
        const fs = require('fs').promises;
        await fs.writeFile('./test_result.json', JSON.stringify(result, null, 2));
        console.log('\nTest result saved to test_result.json');
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testSingleSnapshot(); 