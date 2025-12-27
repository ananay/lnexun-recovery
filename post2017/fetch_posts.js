const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { wa_timestamps } = require('./scrapepost2017.js');

// Configuration
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds delay to be respectful to Internet Archive
const OUTPUT_DIR = './scraped_posts';
const MAX_RETRIES = 3;

// Utility function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility function to clean and normalize URLs
function normalizeUrl(originalUrl) {
    return originalUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// Build Wayback Machine URL
function buildWaybackUrl(timestamp, originalUrl) {
    return `https://web.archive.org/web/${timestamp}/${originalUrl}`;
}

// Extract WordPress posts from HTML
function extractWordPressPosts($, url, timestamp) {
    try {
        // Verify $ is working
        if (typeof $ !== 'function') {
            throw new Error('Cheerio $ function is not available');
        }
        
        const posts = [];
        
        // Test basic cheerio functionality
        try {
            const testElement = $('html');
            if (testElement.length === 0) {
                console.warn(`No HTML element found for ${url} - ${timestamp}`);
            }
        } catch (testError) {
            throw new Error(`Cheerio test failed: ${testError.message}`);
        }
        
        // Common WordPress selectors for posts
        const postSelectors = [
            'article',
            '.post',
            '.hentry',
            '.entry',
            '[class*="post"]',
            '#content .post',
            '.content .post',
            '.main .post'
        ];
        
        let foundPosts = false;
        
        for (const selector of postSelectors) {
            try {
                const elements = $(selector);
                if (elements.length > 0) {
                    foundPosts = true;
                    console.log(`Using selector "${selector}" - found ${elements.length} elements`);
                    
                    elements.each((index, element) => {
                        try {
                            const $post = $(element);
                            
                            // Extract post data
                            const post = {
                                id: $post.attr('id') || `post-${index}`,
                                classes: $post.attr('class') || '',
                                title: extractPostTitle($post, $),
                                content: extractPostContent($post, $),
                                excerpt: extractPostExcerpt($post, $),
                                date: extractPostDate($post, $),
                                author: extractPostAuthor($post, $),
                                categories: extractPostCategories($post, $),
                                tags: extractPostTags($post, $),
                                permalink: extractPostPermalink($post, url, $),
                                fullHtml: $post.html(),
                                metadata: {
                                    sourceUrl: url,
                                    timestamp: timestamp,
                                    selector: selector,
                                    extractedAt: new Date().toISOString()
                                }
                            };
                            
                            posts.push(post);
                        } catch (postError) {
                            console.error(`Error extracting individual post ${index}:`, postError.message);
                        }
                    });
                    break; // Use the first selector that finds posts
                }
            } catch (selectorError) {
                console.warn(`Error with selector "${selector}":`, selectorError.message);
                continue; // Try next selector
            }
        }
        
        // If no posts found with common selectors, try to extract from page content
        if (!foundPosts) {
            try {
                const pageContent = extractPageContent($, url, timestamp);
                if (pageContent) {
                    posts.push(pageContent);
                }
            } catch (pageError) {
                console.error(`Error extracting page content:`, pageError.message);
            }
        }
        
        return posts;
        
    } catch (error) {
        console.error(`Critical error in extractWordPressPosts for ${url} - ${timestamp}:`, error.message);
        return [{
            id: 'error-post',
            classes: 'error',
            title: 'Extraction Error',
            content: `Failed to extract content: ${error.message}`,
            excerpt: '',
            date: null,
            author: '',
            categories: [],
            tags: [],
            permalink: url,
            fullHtml: '',
            metadata: {
                sourceUrl: url,
                timestamp: timestamp,
                selector: 'error',
                extractedAt: new Date().toISOString(),
                error: error.message
            }
        }];
    }
}

// Extract post title
function extractPostTitle($post, $) {
    const titleSelectors = [
        '.entry-title',
        '.post-title',
        'h1',
        'h2',
        '.title',
        'header h1',
        'header h2'
    ];
    
    for (const selector of titleSelectors) {
        const title = $post.find(selector).first().text().trim();
        if (title) return title;
    }
    
    return '';
}

// Extract post content
function extractPostContent($post, $) {
    const contentSelectors = [
        '.entry-content',
        '.post-content',
        '.content',
        '.post-body',
        '.entry',
        '.the-content'
    ];
    
    for (const selector of contentSelectors) {
        const content = $post.find(selector).first();
        if (content.length > 0) {
            return content.html();
        }
    }
    
    // Fallback: return all content except header/footer
    const $clone = $post.clone();
    $clone.find('header, footer, .meta, .post-meta').remove();
    return $clone.html();
}

// Extract post excerpt
function extractPostExcerpt($post, $) {
    const excerptSelectors = [
        '.entry-summary',
        '.excerpt',
        '.post-excerpt',
        '.summary'
    ];
    
    for (const selector of excerptSelectors) {
        const excerpt = $post.find(selector).first().html();
        if (excerpt) return excerpt;
    }
    
    return '';
}

// Extract post date
function extractPostDate($post, $) {
    const dateSelectors = [
        '.entry-date',
        '.post-date',
        '.date',
        'time',
        '.published',
        '.post-meta .date'
    ];
    
    for (const selector of dateSelectors) {
        const dateElement = $post.find(selector).first();
        if (dateElement.length > 0) {
            return {
                text: dateElement.text().trim(),
                datetime: dateElement.attr('datetime') || dateElement.attr('title') || '',
                html: dateElement.html()
            };
        }
    }
    
    return null;
}

// Extract post author
function extractPostAuthor($post, $) {
    const authorSelectors = [
        '.author',
        '.entry-author',
        '.post-author',
        '.by-author',
        '.vcard'
    ];
    
    for (const selector of authorSelectors) {
        const author = $post.find(selector).first().text().trim();
        if (author) return author;
    }
    
    return '';
}

// Extract categories
function extractPostCategories($post, $) {
    const categorySelectors = [
        '.category',
        '.categories',
        '.post-categories',
        '.entry-categories'
    ];
    
    const categories = [];
    for (const selector of categorySelectors) {
        $post.find(selector).find('a').each((i, el) => {
            categories.push($(el).text().trim());
        });
        if (categories.length > 0) break;
    }
    
    return categories;
}

// Extract tags
function extractPostTags($post, $) {
    const tagSelectors = [
        '.tags',
        '.post-tags',
        '.entry-tags',
        '.tag'
    ];
    
    const tags = [];
    for (const selector of tagSelectors) {
        $post.find(selector).find('a').each((i, el) => {
            tags.push($(el).text().trim());
        });
        if (tags.length > 0) break;
    }
    
    return tags;
}

// Extract permalink
function extractPostPermalink($post, baseUrl, $) {
    const linkSelectors = [
        '.entry-title a',
        '.post-title a',
        'h1 a',
        'h2 a',
        '.permalink'
    ];
    
    for (const selector of linkSelectors) {
        const href = $post.find(selector).first().attr('href');
        if (href) {
            if (href.startsWith('http')) {
                return href;
            } else if (href.startsWith('/')) {
                const baseUrlObj = new URL(baseUrl);
                return `${baseUrlObj.protocol}//${baseUrlObj.host}${href}`;
            }
        }
    }
    
    return '';
}

// Extract page content if no posts found
function extractPageContent($, url, timestamp) {
    const $main = $('#main, #content, .main, .content').first();
    if ($main.length === 0) return null;
    
    const title = $('title').text() || $('h1').first().text() || 'Page Content';
    
    return {
        id: 'page-content',
        classes: 'page-content',
        title: title.trim(),
        content: $main.html(),
        excerpt: '',
        date: null,
        author: '',
        categories: [],
        tags: [],
        permalink: url,
        fullHtml: $main.html(),
        metadata: {
            sourceUrl: url,
            timestamp: timestamp,
            selector: 'page-content',
            extractedAt: new Date().toISOString(),
            type: 'page'
        }
    };
}

// Fetch and parse a single snapshot
async function fetchSnapshot(timestamp, originalUrl, retryCount = 0) {
    const waybackUrl = buildWaybackUrl(timestamp, originalUrl);
    
    try {
        console.log(`Fetching: ${waybackUrl}`);
        
        const response = await axios.get(waybackUrl, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Archive-Bot/1.0; +http://archive.org/details/software)'
            }
        });
        
        // Validate response data
        if (!response.data) {
            throw new Error('No response data received');
        }
        
        if (typeof response.data !== 'string') {
            throw new Error(`Invalid response data type: ${typeof response.data}`);
        }
        
        // Check if it's a valid HTML response
        if (!response.data.includes('<html') && !response.data.includes('<HTML')) {
            console.warn(`Response doesn't appear to be HTML for ${waybackUrl}`);
            console.log(`Response preview: ${response.data.substring(0, 200)}...`);
        }
        
        let $;
        try {
            $ = cheerio.load(response.data);
        } catch (cheerioError) {
            console.error(`Cheerio loading failed for ${waybackUrl}:`, cheerioError.message);
            throw new Error(`Failed to parse HTML: ${cheerioError.message}`);
        }
        
        // Verify cheerio loaded successfully
        if (typeof $ !== 'function') {
            throw new Error('Cheerio failed to initialize properly');
        }
        
        const posts = extractWordPressPosts($, waybackUrl, timestamp);
        
        console.log(`Found ${posts.length} posts from ${timestamp}`);
        
        return {
            timestamp,
            originalUrl,
            waybackUrl,
            posts,
            success: true,
            error: null,
            responseSize: response.data.length,
            contentType: response.headers['content-type'] || 'unknown'
        };
        
    } catch (error) {
        console.error(`Error fetching ${waybackUrl}:`, error.message);
        
        if (retryCount < MAX_RETRIES) {
            console.log(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            await delay(DELAY_BETWEEN_REQUESTS * 2);
            return fetchSnapshot(timestamp, originalUrl, retryCount + 1);
        }
        
        return {
            timestamp,
            originalUrl,
            waybackUrl,
            posts: [],
            success: false,
            error: error.message,
            responseSize: 0,
            contentType: 'unknown'
        };
    }
}

// Main function to fetch all snapshots
async function fetchAllSnapshots() {
    try {
        // Create output directory
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        
        const results = [];
        const allPosts = [];
        
        // Skip header row and process timestamps
        for (let i = 1; i < wa_timestamps.length; i++) {
            const [urlkey, timestamp, originalUrl, mimetype, statuscode, digest, length] = wa_timestamps[i];
            
            // Only process successful HTML responses
            if (statuscode === '200' && mimetype === 'text/html') {
                const result = await fetchSnapshot(timestamp, originalUrl);
                results.push(result);
                
                if (result.success) {
                    allPosts.push(...result.posts);
                }
                
                // Save individual result
                const resultFile = path.join(OUTPUT_DIR, `snapshot_${timestamp}.json`);
                await fs.writeFile(resultFile, JSON.stringify(result, null, 2));
                
                // Delay between requests
                await delay(DELAY_BETWEEN_REQUESTS);
            }
        }
        
        // Save consolidated results
        const summaryFile = path.join(OUTPUT_DIR, 'summary.json');
        await fs.writeFile(summaryFile, JSON.stringify({
            totalSnapshots: results.length,
            successfulSnapshots: results.filter(r => r.success).length,
            totalPosts: allPosts.length,
            results: results.map(r => ({
                timestamp: r.timestamp,
                originalUrl: r.originalUrl,
                waybackUrl: r.waybackUrl,
                postsCount: r.posts.length,
                success: r.success,
                error: r.error
            }))
        }, null, 2));
        
        // Save all posts
        const allPostsFile = path.join(OUTPUT_DIR, 'all_posts.json');
        await fs.writeFile(allPostsFile, JSON.stringify(allPosts, null, 2));
        
        console.log('\n=== SCRAPING COMPLETE ===');
        console.log(`Total snapshots processed: ${results.length}`);
        console.log(`Successful snapshots: ${results.filter(r => r.success).length}`);
        console.log(`Total posts extracted: ${allPosts.length}`);
        console.log(`Results saved to: ${OUTPUT_DIR}`);
        
    } catch (error) {
        console.error('Error in main function:', error);
    }
}

// Run the script
if (require.main === module) {
    fetchAllSnapshots();
}

module.exports = {
    fetchAllSnapshots,
    fetchSnapshot,
    extractWordPressPosts
}; 