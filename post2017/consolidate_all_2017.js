const fs = require('fs').promises;
const path = require('path');

// Configuration
const SCRAPED_POSTS_DIR = './scraped_posts';

// Function to clean web archive URLs from text/HTML
function cleanWebArchiveUrls(text) {
    if (!text || typeof text !== 'string') return text;
    
    let cleaned = text;
    
    // Pattern 1: Full web archive URLs with timestamp and flags
    // Example: https://web.archive.org/web/20230322120550if_/https://drive.google.com/...
    const fullArchivePattern = /https?:\/\/web\.archive\.org\/web\/\d{14}[a-zA-Z_]*\/(https?:\/\/[^"\s\)]+)/g;
    cleaned = cleaned.replace(fullArchivePattern, '$1');
    
    // Pattern 2: Basic web archive URLs without the original protocol
    // Example: https://web.archive.org/web/20230322120550/example.com/...
    const basicArchivePattern = /https?:\/\/web\.archive\.org\/web\/\d{14}[a-zA-Z_]*\/([^"\s\)]+)/g;
    cleaned = cleaned.replace(basicArchivePattern, (match, originalUrl) => {
        // Add https:// if the original URL doesn't have a protocol
        if (!originalUrl.startsWith('http://') && !originalUrl.startsWith('https://')) {
            return `https://${originalUrl}`;
        }
        return originalUrl;
    });
    
    // Pattern 3: Any remaining web.archive.org references
    const remainingArchivePattern = /web\.archive\.org\/web\/\d{14}[a-zA-Z_]*\//g;
    cleaned = cleaned.replace(remainingArchivePattern, '');
    
    // Pattern 4: Clean up any double protocols that might result from the above
    cleaned = cleaned.replace(/https?:\/\/https?:\/\//g, 'https://');
    
    // Normalize lnexun.com URLs
    cleaned = cleaned.replace(/https?:\/\/www\.lnexun\.com:80\//g, 'https://lnexun.com/');
    cleaned = cleaned.replace(/http:\/\/www\.lnexun\.com\//g, 'https://lnexun.com/');
    cleaned = cleaned.replace(/https?:\/\/www\.lnexun\.com\//g, 'https://lnexun.com/');
    
    // Clean up any remaining malformed URLs
    cleaned = cleaned.replace(/src="\/\//g, 'src="https://');
    cleaned = cleaned.replace(/href="\/\//g, 'href="https://');
    
    return cleaned;
}

// Function to clean a post object recursively
function cleanPost(post) {
    const cleanedPost = { ...post };
    
    // Clean string fields
    const stringFields = ['title', 'content', 'excerpt', 'author', 'permalink', 'fullHtml'];
    stringFields.forEach(field => {
        if (cleanedPost[field]) {
            cleanedPost[field] = cleanWebArchiveUrls(cleanedPost[field]);
        }
    });
    
    // Clean array fields
    if (cleanedPost.categories && Array.isArray(cleanedPost.categories)) {
        cleanedPost.categories = cleanedPost.categories.map(cat => cleanWebArchiveUrls(cat));
    }
    
    if (cleanedPost.tags && Array.isArray(cleanedPost.tags)) {
        cleanedPost.tags = cleanedPost.tags.map(tag => cleanWebArchiveUrls(tag));
    }
    
    // Clean date object if it exists
    if (cleanedPost.date && typeof cleanedPost.date === 'object') {
        if (cleanedPost.date.text) {
            cleanedPost.date.text = cleanWebArchiveUrls(cleanedPost.date.text);
        }
        if (cleanedPost.date.html) {
            cleanedPost.date.html = cleanWebArchiveUrls(cleanedPost.date.html);
        }
    }
    
    // Clean metadata
    if (cleanedPost.metadata) {
        if (cleanedPost.metadata.sourceUrl) {
            cleanedPost.metadata.sourceUrl = cleanWebArchiveUrls(cleanedPost.metadata.sourceUrl);
        }
    }
    
    return cleanedPost;
}

// Function to generate a better unique ID for posts
function generatePostId(post) {
    // Try to use existing ID first
    if (post.id && post.id !== 'page-content' && post.id !== 'error-post' && !post.id.startsWith('post-')) {
        return post.id;
    }
    
    // Generate ID from title if available
    if (post.title && post.title.trim()) {
        const titleSlug = post.title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-')     // Replace spaces with hyphens
            .replace(/-+/g, '-')      // Replace multiple hyphens with single
            .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens
        
        if (titleSlug.length > 3) {
            return titleSlug;
        }
    }
    
    // Generate ID from content hash if title not available
    if (post.content) {
        const contentHash = require('crypto')
            .createHash('md5')
            .update(post.content.substring(0, 500))
            .digest('hex')
            .substring(0, 8);
        return `content-${contentHash}`;
    }
    
    // Fallback to timestamp-based ID
    return `post-${post.metadata?.timestamp || Date.now()}`;
}

// Function to merge duplicate posts (keep the one with most content)
function mergePosts(posts) {
    if (posts.length === 1) return posts[0];
    
    // Sort by content length (descending) and take the one with most content
    const sortedPosts = posts.sort((a, b) => {
        const aContentLength = (a.content || '').length + (a.fullHtml || '').length;
        const bContentLength = (b.content || '').length + (b.fullHtml || '').length;
        return bContentLength - aContentLength;
    });
    
    const bestPost = sortedPosts[0];
    
    // Merge categories and tags from all posts
    const allCategories = new Set();
    const allTags = new Set();
    
    posts.forEach(post => {
        if (post.categories) {
            post.categories.forEach(cat => allCategories.add(cat));
        }
        if (post.tags) {
            post.tags.forEach(tag => allTags.add(tag));
        }
    });
    
    bestPost.categories = Array.from(allCategories);
    bestPost.tags = Array.from(allTags);
    
    // Add metadata about merging
    bestPost.metadata = bestPost.metadata || {};
    bestPost.metadata.mergedFrom = posts.length;
    bestPost.metadata.sourceTimestamps = posts.map(p => p.metadata?.timestamp).filter(Boolean);
    
    return bestPost;
}

// Main consolidation function
async function consolidateAllPosts() {
    try {
        console.log('🔍 Reading scraped posts directory...');
        
        // Read all JSON files from scraped_posts directory
        const files = await fs.readdir(SCRAPED_POSTS_DIR);
        const jsonFiles = files.filter(file => file.endsWith('.json') && file.startsWith('snapshot_'));
        
        console.log(`📁 Found ${jsonFiles.length} snapshot files`);
        
        const allPosts = [];
        let totalSnapshots = 0;
        let successfulSnapshots = 0;
        
        // Process each snapshot file
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(SCRAPED_POSTS_DIR, file);
                const content = await fs.readFile(filePath, 'utf8');
                const snapshot = JSON.parse(content);
                
                totalSnapshots++;
                
                if (snapshot.success && snapshot.posts && snapshot.posts.length > 0) {
                    successfulSnapshots++;
                    console.log(`📄 Processing ${file}: ${snapshot.posts.length} posts`);
                    
                    // Clean and add posts
                    snapshot.posts.forEach(post => {
                        const cleanedPost = cleanPost(post);
                        allPosts.push(cleanedPost);
                    });
                } else {
                    console.log(`⚠️  Skipping ${file}: ${snapshot.error || 'no posts'}`);
                }
            } catch (error) {
                console.error(`❌ Error processing ${file}:`, error.message);
            }
        }
        
        console.log(`\n📊 Processed ${totalSnapshots} snapshots (${successfulSnapshots} successful)`);
        console.log(`📦 Total posts before deduplication: ${allPosts.length}`);
        
        // Group posts by generated ID
        const postGroups = new Map();
        
        allPosts.forEach(post => {
            const postId = generatePostId(post);
            
            if (!postGroups.has(postId)) {
                postGroups.set(postId, []);
            }
            postGroups.get(postId).push(post);
        });
        
        // Merge duplicate posts
        const uniquePosts = [];
        let duplicatesFound = 0;
        
        for (const [postId, posts] of postGroups.entries()) {
            if (posts.length > 1) {
                duplicatesFound += posts.length - 1;
                console.log(`🔗 Merging ${posts.length} duplicates for: "${posts[0].title || postId}"`);
            }
            
            const mergedPost = mergePosts(posts);
            mergedPost.uniqueId = postId;
            uniquePosts.push(mergedPost);
        }
        
        // Sort posts by date (newest first) where possible
        uniquePosts.sort((a, b) => {
            const aTimestamp = a.metadata?.timestamp || '0';
            const bTimestamp = b.metadata?.timestamp || '0';
            return bTimestamp.localeCompare(aTimestamp);
        });
        
        console.log(`\n✨ Final results:`);
        console.log(`📝 Unique posts: ${uniquePosts.length}`);
        console.log(`🗑️  Duplicates removed: ${duplicatesFound}`);
        
        // Create summary statistics
        const stats = {
            totalSnapshots,
            successfulSnapshots,
            totalPostsBeforeDedup: allPosts.length,
            uniquePosts: uniquePosts.length,
            duplicatesRemoved: duplicatesFound,
            postsWithContent: uniquePosts.filter(p => p.content && p.content.length > 100).length,
            postsWithTitles: uniquePosts.filter(p => p.title && p.title.trim()).length,
            averageContentLength: Math.round(
                uniquePosts.reduce((sum, p) => sum + (p.content || '').length, 0) / uniquePosts.length
            ),
            dateRange: {
                earliest: uniquePosts.reduce((earliest, p) => {
                    const timestamp = p.metadata?.timestamp;
                    return timestamp && (!earliest || timestamp < earliest) ? timestamp : earliest;
                }, null),
                latest: uniquePosts.reduce((latest, p) => {
                    const timestamp = p.metadata?.timestamp;
                    return timestamp && (!latest || timestamp > latest) ? timestamp : latest;
                }, null)
            }
        };
        
        // Output the consolidated result
        const result = {
            metadata: {
                consolidatedAt: new Date().toISOString(),
                statistics: stats
            },
            posts: uniquePosts
        };
        
        console.log('\n📈 Statistics:');
        console.log(`   Posts with substantial content: ${stats.postsWithContent}`);
        console.log(`   Posts with titles: ${stats.postsWithTitles}`);
        console.log(`   Average content length: ${stats.averageContentLength} characters`);
        console.log(`   Date range: ${stats.dateRange.earliest} to ${stats.dateRange.latest}`);
        
        console.log('\n🎯 Consolidated JSON output:');
        console.log('=====================================');
        console.log(JSON.stringify(result, null, 2));
        
        // Also save to file
        const outputFile = 'consolidated_posts_2017_plus.json';
        await fs.writeFile(outputFile, JSON.stringify(result, null, 2));
        console.log(`\n💾 Saved to ${outputFile}`);
        
        return result;
        
    } catch (error) {
        console.error('❌ Error in consolidation:', error);
        throw error;
    }
}

// Run the consolidation
if (require.main === module) {
    consolidateAllPosts()
        .then(() => {
            console.log('\n✅ Consolidation complete!');
        })
        .catch(error => {
            console.error('💥 Consolidation failed:', error);
            process.exit(1);
        });
}

module.exports = {
    consolidateAllPosts,
    cleanWebArchiveUrls,
    cleanPost,
    generatePostId
};

