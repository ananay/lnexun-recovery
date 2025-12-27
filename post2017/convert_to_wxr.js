const fs = require('fs').promises;
const path = require('path');

// Configuration
const INPUT_FILE = './consolidated_posts_2017_plus.json';
const OUTPUT_FILE = './lnexun_posts_import.xml';

// Helper function to escape XML content
function escapeXml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Helper function to create CDATA section
function cdata(content) {
    if (!content) return '';
    // Ensure content doesn't contain ]]> which would break CDATA
    const cleanContent = content.replace(/\]\]>/g, ']]&gt;');
    return `<![CDATA[${cleanContent}]]>`;
}

// Helper function to format date for WordPress
function formatWordPressDate(timestamp) {
    if (!timestamp) return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
    
    // Parse wayback timestamp (YYYYMMDDHHMMSS) to ISO date
    const year = timestamp.substring(0, 4);
    const month = timestamp.substring(4, 6);
    const day = timestamp.substring(6, 8);
    const hour = timestamp.substring(8, 10) || '12';
    const minute = timestamp.substring(10, 12) || '00';
    const second = timestamp.substring(12, 14) || '00';
    
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    return date.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

// Helper function to generate WordPress post slug
function generateSlug(title, postId) {
    if (title && title.trim()) {
        return title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 200); // WordPress slug limit
    }
    return postId || 'post';
}

// Helper function to extract post ID number
function extractPostId(post) {
    // Try to extract numeric ID from various sources
    if (post.id && /^\d+$/.test(post.id)) {
        return parseInt(post.id);
    }
    
    if (post.id && post.id.includes('post-')) {
        const match = post.id.match(/post-(\d+)/);
        if (match) return parseInt(match[1]);
    }
    
    if (post.classes && post.classes.includes('post-')) {
        const match = post.classes.match(/post-(\d+)/);
        if (match) return parseInt(match[1]);
    }
    
    // Generate ID from timestamp or hash
    if (post.metadata && post.metadata.timestamp) {
        return parseInt(post.metadata.timestamp.substring(-8)) || Date.now();
    }
    
    return Date.now() + Math.floor(Math.random() * 1000);
}

// Function to create category/tag XML
function createTaxonomyXml(terms, taxonomy) {
    if (!terms || !Array.isArray(terms) || terms.length === 0) return '';
    
    return terms.map(term => {
        const slug = term.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `
		<category domain="${taxonomy}" nicename="${escapeXml(slug)}">${cdata(term)}</category>`;
    }).join('');
}

// Function to convert a single post to WXR format
function convertPostToWxr(post, index) {
    const postId = extractPostId(post);
    const title = post.title || 'Untitled Post';
    const slug = generateSlug(title, post.uniqueId);
    const content = post.content || post.fullHtml || '';
    const excerpt = post.excerpt || '';
    const authorLogin = getAuthorLogin(post.author);
    const publishDate = formatWordPressDate(post.metadata?.timestamp);
    const publishDateGmt = publishDate; // Assuming GMT for simplicity
    
    // Format WordPress date for display (without timezone)
    const wpDate = publishDate.replace(/\+00:00$/, '');
    const wpDateGmt = publishDateGmt.replace(/\+00:00$/, '');
    
    // Categories and tags
    const categoriesXml = createTaxonomyXml(post.categories, 'category');
    const tagsXml = createTaxonomyXml(post.tags, 'post_tag');
    
    return `
	<item>
		<title>${title}</title>
		<link>https://lnexun.com/${slug}/</link>
		<pubDate>${new Date(publishDate).toUTCString()}</pubDate>
		<dc:creator>${cdata(authorLogin)}</dc:creator>
		<guid isPermaLink="false">https://lnexun.com/?p=${postId}</guid>
		<description></description>
		<content:encoded>${cdata(content)}</content:encoded>
		<excerpt:encoded>${cdata(excerpt)}</excerpt:encoded>
		<wp:post_id>${postId}</wp:post_id>
		<wp:post_date>${cdata(wpDate)}</wp:post_date>
		<wp:post_date_gmt>${cdata(wpDateGmt)}</wp:post_date_gmt>
		<wp:comment_status>${cdata('open')}</wp:comment_status>
		<wp:ping_status>${cdata('open')}</wp:ping_status>
		<wp:post_name>${cdata(slug)}</wp:post_name>
		<wp:status>${cdata('publish')}</wp:status>
		<wp:post_parent>0</wp:post_parent>
		<wp:menu_order>0</wp:menu_order>
		<wp:post_type>${cdata('post')}</wp:post_type>
		<wp:post_password>${cdata('')}</wp:post_password>
		<wp:is_sticky>0</wp:is_sticky>${categoriesXml}${tagsXml}
		<wp:postmeta>
			<wp:meta_key>${cdata('_edit_last')}</wp:meta_key>
			<wp:meta_value>${cdata('1')}</wp:meta_value>
		</wp:postmeta>
		<wp:postmeta>
			<wp:meta_key>${cdata('_wp_old_slug')}</wp:meta_key>
			<wp:meta_value>${cdata(post.uniqueId || slug)}</wp:meta_value>
		</wp:postmeta>
		<wp:postmeta>
			<wp:meta_key>${cdata('_lnexun_import_source')}</wp:meta_key>
			<wp:meta_value>${cdata('wayback_machine')}</wp:meta_value>
		</wp:postmeta>
		<wp:postmeta>
			<wp:meta_key>${cdata('_lnexun_original_timestamp')}</wp:meta_key>
			<wp:meta_value>${cdata(post.metadata?.timestamp || '')}</wp:meta_value>
		</wp:postmeta>
		<wp:postmeta>
			<wp:meta_key>${cdata('_lnexun_merged_from')}</wp:meta_key>
			<wp:meta_value>${cdata(String(post.metadata?.mergedFrom || 1))}</wp:meta_value>
		</wp:postmeta>
	</item>`;
}

// Author mapping - extracted from your existing WordPress export
const AUTHORS = {
    'admin': { id: 3, login: 'admin', email: 'felukewl+lnexun@gmail.com', display_name: 'admin', first_name: '', last_name: '' },
    'aurojit': { id: 20, login: 'aurojit', email: 'aurojit@gmail.com', display_name: 'aurojit', first_name: 'Aurojit', last_name: 'Panda' },
    'udrastogi': { id: 21, login: 'udrastogi', email: 'udrastogi@gmail.com', display_name: 'udrastogi', first_name: 'Udit', last_name: 'Rastogi' },
    'ikkumpal': { id: 9, login: 'ikkumpal', email: 'ikkumpal@gmail.com', display_name: 'ikkumpal', first_name: 'Mukesh', last_name: 'Kumar' },
    'viksit': { id: 22, login: 'viksit', email: 'viksit@gmail.com', display_name: 'viksit', first_name: '', last_name: '' },
    'souvikdg': { id: 23, login: 'souvikdg', email: 'souvikdg@gmail.com', display_name: 'souvikdg', first_name: 'Souvik', last_name: 'Das Gupta' },
    'prateekrungta': { id: 24, login: 'prateekrungta', email: 'prateekrungta@gmail.com', display_name: 'prateekrungta', first_name: 'Prateek', last_name: 'Rungta' },
    'anant90': { id: 25, login: 'anant90', email: 'anant90@gmail.com', display_name: 'anant90', first_name: 'Anant', last_name: 'Jain' },
    'aayushkumar': { id: 26, login: 'aayushkumar', email: 'aayushkumar@gmail.com', display_name: 'aayushkumar', first_name: 'Aayush', last_name: 'Kumar' },
    'aditya.aditude': { id: 6, login: 'aditya.aditude', email: 'aditya.aditude@gmail.com', display_name: 'aditya.aditude', first_name: 'Aditya', last_name: 'Jain' },
    'sidnangia': { id: 8, login: 'sidnangia', email: 'sidnangia@gmail.com', display_name: 'sidnangia', first_name: 'Siddharth', last_name: 'Nangia' },
    'raghavkhullar': { id: 27, login: 'raghavkhullar', email: 'raghavkhullar@gmail.com', display_name: 'raghavkhullar', first_name: 'Raghav', last_name: 'Khullar' },
    'sahil29': { id: 16, login: 'sahil29', email: 'sahil29@gmail.com', display_name: '» sahil', first_name: 'Sahil', last_name: 'Bajaj' },
    'srajanmani': { id: 28, login: 'srajanmani', email: 'srajanmani@gmail.com', display_name: 'srajanmani', first_name: 'Srajan', last_name: 'Rastogi' },
    'shubham.cash': { id: 12, login: 'shubham.cash', email: 'shubham.cash@gmail.com', display_name: 'Shubham Goel', first_name: 'Shubham', last_name: 'Goel' },
    'akritigaur': { id: 13, login: 'akritigaur', email: 'akritigaur@gmail.com', display_name: 'akritigaur', first_name: 'Akriti', last_name: 'Gaur' },
    'ralbhat': { id: 5, login: 'ralbhat', email: 'ralbhat@gmail.com', display_name: 'Rahul', first_name: 'Rahul', last_name: 'Bhatnagar' },
    'samarth.math': { id: 14, login: 'samarth.math', email: 'samarth.math@gmail.com', display_name: 'samarth.math', first_name: 'Samarth', last_name: 'Mathur' },
    'goonerbynature': { id: 18, login: 'goonerbynature', email: 'tanayrulz@gmail.com', display_name: 'goonerbynature', first_name: 'Tanay', last_name: 'Padhi' },
    'vishesh420': { id: 19, login: 'vishesh420', email: 'vishesh420@gmail.com', display_name: 'vishesh420', first_name: 'Vishesh', last_name: 'Kumar' },
    'pranavobhrai': { id: 29, login: 'pranavobhrai', email: 'pranavobhrai@gmail.com', display_name: 'pranavobhrai', first_name: 'Pranav', last_name: 'Obhrai' },
    'aditya.grover1': { id: 17, login: 'aditya.grover1', email: 'aditya.grover1@gmail.com', display_name: 'aditya.grover1', first_name: 'Aditya', last_name: 'Grover' },
    '246964': { id: 15, login: '246964', email: '246964@gmail.com', display_name: 'Sid', first_name: 'Sidharth', last_name: 'Iyer' },
    'felu': { id: 10, login: 'felu', email: 'felukewl@gmail.com', display_name: 'Bhuwan Khattar', first_name: 'Bhuwan', last_name: 'Khattar' },
    'kush2005': { id: 7, login: 'kush2005', email: 'kush2005@gmail.com', display_name: 'Kush Agrawal', first_name: 'Kush', last_name: 'Agrawal' },
    'pratham.agrawal92': { id: 4, login: 'pratham.agrawal92', email: 'pratham.agrawal92@gmail.com', display_name: 'pratham.agrawal92', first_name: 'Pratham', last_name: 'Agrawal' },
    'ronng93': { id: 11, login: 'ronng93', email: 'ronng93@gmail.com', display_name: 'ronng93', first_name: 'Srijit', last_name: 'Ghosh' },
    'varzrulz': { id: 30, login: 'varzrulz', email: 'varzrulz@gmail.com', display_name: 'varzrulz', first_name: 'Varun', last_name: 'Dubey' },
    'karanveer.1992': { id: 31, login: 'karanveer.1992', email: 'karanveer.1992@gmail.com', display_name: 'Karanveer', first_name: 'Karanveer', last_name: 'Mohan' },
    'mayank.sharmas94': { id: 32, login: 'mayank.sharmas94', email: 'mayank.sharmas94@gmail.com', display_name: 'mayank.sharmas94', first_name: 'Mayank', last_name: 'Sharma' },
    'achalv2.0': { id: 33, login: 'achalv2.0', email: 'achalv2.0@gmail.com', display_name: 'Achal Varma', first_name: 'Achal', last_name: 'Varma' },
    'strong.aman': { id: 34, login: 'strong.aman', email: 'strong.aman@gmail.com', display_name: 'strong.aman', first_name: 'aman', last_name: 'agarwal' },
    'gursartaj': { id: 35, login: 'gursartaj', email: 'gursartaj@gmail.com', display_name: 'gursartaj', first_name: 'gursartaj', last_name: 'nijjar' },
    'ishan28mkip': { id: 36, login: 'ishan28mkip', email: 'ishan28mkip@gmail.com', display_name: 'ishan28mkip', first_name: 'Ishan', last_name: 'Sharma' },
    'bharatkashyap.exun': { id: 38, login: 'bharatkashyap.exun', email: 'bharatkashyap.exun@gmail.com', display_name: 'Bharat Kashyap', first_name: 'Bharat', last_name: 'Kashyap' },
    'amazinash94': { id: 37, login: 'amazinash94', email: 'amazinash94@gmail.com', display_name: 'Aishwarya Kane', first_name: 'Aishwarya', last_name: 'Kane' },
    'sanchit.windows': { id: 39, login: 'sanchit.windows', email: 'sanchit.windows@gmail.com', display_name: 'Sanchit Abrol', first_name: 'Sanchit', last_name: 'Abrol' },
    'sibesh96@gmail.com': { id: 40, login: 'sibesh96@gmail.com', email: 'sibesh96@gmail.com', display_name: 'Sibesh Kar', first_name: 'Sibesh', last_name: 'Kar' },
    'ananay': { id: 2, login: 'ananay', email: 'ananay@exunclan.com', display_name: 'ananay', first_name: '', last_name: '' },
    'trijeetm': { id: 41, login: 'trijeetm', email: 'trijeetm@gmail.com', display_name: 'Trijeet Mukhopadhyay', first_name: 'Trijeet', last_name: 'Mukhopadhyay' },
    'ibatra171': { id: 43, login: 'ibatra171', email: 'ibatra171@gmail.com', display_name: 'ibatra171', first_name: 'Ishita', last_name: 'Batra' },
    'keshavadhyay': { id: 44, login: 'keshavadhyay', email: 'keshavadhyay@gmail.com', display_name: 'keshavadhyay', first_name: 'Keshav', last_name: 'Adhyay' },
    'rohan.nagpal94': { id: 45, login: 'rohan.nagpal94', email: 'rohan.nagpal94@gmail.com', display_name: 'Rohan Nagpal', first_name: 'Rohan', last_name: 'Nagpal' },
    'sealelf': { id: 46, login: 'sealelf', email: 'sealelf@gmail.com', display_name: 'Akshay Dadhwal', first_name: 'Akshay', last_name: 'Dadhwal' },
    'ambarpal1996': { id: 47, login: 'ambarpal1996', email: 'ambarpal1996@gmail.com', display_name: 'Ambar Pal', first_name: 'Ambar', last_name: 'Pal' },
    'abhishekbiswal': { id: 48, login: 'abhishekbiswal', email: 'abhishekbiswal@live.com', display_name: 'abhishekbiswal', first_name: 'Abhishek', last_name: 'Biswal' },
    'siddharthbhogra': { id: 49, login: 'siddharthbhogra', email: 'siddharthbhogra@gmail.com', display_name: 'Siddharth Bhogra', first_name: 'Siddharth', last_name: 'Bhogra' },
    'iammohitsharma': { id: 50, login: 'iammohitsharma', email: 'iammohitsharma@gmail.com', display_name: 'iammohitsharma', first_name: 'Mohit', last_name: 'Sharma' },
    'MadhavNarayan': { id: 51, login: 'MadhavNarayan', email: 'soccermadhav@gmail.com', display_name: 'Madhav Narayan', first_name: 'Madhav', last_name: 'Narayan' },
    'prannaykhosla': { id: 52, login: 'prannaykhosla', email: 'prannay.khosla@gmail.com', display_name: 'Prannay Khosla', first_name: 'Prannay', last_name: 'Khosla' },
    'parth': { id: 53, login: 'parth', email: 'parth082997@gmail.com', display_name: 'Parth Mittal', first_name: 'Parth', last_name: 'Mittal' },
    'abhishekdpseok': { id: 54, login: 'abhishekdpseok', email: 'abhishekdpseok@gmail.com', display_name: 'Abhishek Anand', first_name: 'Abhishek', last_name: 'Anand' },
    'arkin': { id: 55, login: 'arkin', email: 'geekarkin@gmail.com', display_name: 'Arkin Gupta', first_name: 'Arkin', last_name: 'Gupta' },
    'TanayVardhan': { id: 57, login: 'TanayVardhan', email: 'tanaytku@gmail.com', display_name: 'Tanay Vardhan', first_name: 'Tanay', last_name: 'Vardhan' },
    'sana': { id: 56, login: 'sana', email: 'thesanagujral@gmail.com', display_name: 'Sana Gujral', first_name: 'Sana', last_name: 'Gujral' },
    'devanshgandhi': { id: 42, login: 'devanshgandhi', email: 'devanshgandhi103@gmail.com', display_name: 'Devansh Gandhi', first_name: 'Devansh', last_name: 'Gandhi' },
    'saumitrkhullar': { id: 59, login: 'saumitrkhullar', email: 'saumitrkhullar@gmail.com', display_name: 'Saumitra Khullar', first_name: 'Saumitra', last_name: 'Khullar' },
    'akshaygupta': { id: 58, login: 'akshaygupta', email: 'wizardgupta@gmail.com', display_name: 'Akshay Gupta', first_name: 'Akshay', last_name: 'Gupta' },
    'harshil': { id: 60, login: 'harshil', email: 'harshilkashyap3598@gmail.com', display_name: 'Harshil Kashyap', first_name: 'Harshil', last_name: 'Kashyap' },
    'eagerbeavers': { id: 61, login: 'eagerbeavers', email: 'udit@exunclan.com', display_name: 'Udit Malik', first_name: 'Udit', last_name: 'Malik' },
    'tanmay': { id: 62, login: 'tanmay', email: 'bansal.tanmay99@gmail.com', display_name: 'Tanmay Bansal', first_name: 'Tanmay', last_name: 'Bansal' },
    'manav': { id: 63, login: 'manav', email: 'manavaggarwal1234@gmail.com', display_name: 'Manav Aggarwal', first_name: 'Manav', last_name: 'Aggarwal' },
    'gshagun20': { id: 64, login: 'gshagun20', email: 'gshagun20@gmail.com', display_name: 'Shagun Goel', first_name: 'Shagun', last_name: 'Goel' },
    'ritin': { id: 65, login: 'ritin', email: 'ritin@gauravpachnanda.com', display_name: 'Ritin Pachnanda', first_name: 'Ritin', last_name: 'Pachnanda' },
    'aveneel': { id: 66, login: 'aveneel', email: 'aveneel@hotmail.com', display_name: 'Aveneel Waadhwa', first_name: 'Aveneel', last_name: 'Waadhwa' },
    'srijan': { id: 67, login: 'srijan', email: 'srijanjain1207@gmail.com', display_name: 'Srijan Jain', first_name: 'Srijan', last_name: 'Jain' },
    'ayush': { id: 68, login: 'ayush', email: 'ayushsingla.as@gmail.com', display_name: 'Ayush Singla', first_name: 'Ayush', last_name: 'Singla' },
    'anirudhgoyal': { id: 69, login: 'anirudhgoyal', email: 'anirudh.goyal05@gmail.com', display_name: 'Anirudh Goyal', first_name: 'Anirudh', last_name: 'Goyal' },
    'rohan': { id: 70, login: 'rohan', email: 'rohan.offi@gmail.com', display_name: 'Rohan Dhar', first_name: 'Rohan', last_name: 'Dhar' },
    'aaraivsharma': { id: 72, login: 'aaraivsharma', email: 'aaraivcool7@gmail.com', display_name: 'Aaraiv Sharma', first_name: 'Aaraiv', last_name: 'Sharma' },
    'akshaykhandelwal': { id: 71, login: 'akshaykhandelwal', email: 'akshay@exunclan.com', display_name: 'Akshay Khandelwal', first_name: 'Akshay', last_name: 'Khandelwal' },
    'kabir': { id: 73, login: 'kabir', email: 'kabirgoel.kg@gmail.com', display_name: 'Kabir Goel', first_name: 'Kabir', last_name: 'Goel' }
};

// Track newly created users
const CREATED_USERS = new Map();

// Function to create a new user from author string
function createNewUser(authorString) {
    if (!authorString || authorString.trim() === '') {
        return 'admin';
    }
    
    const cleanAuthor = authorString.trim();
    
    // Try to parse the name
    const nameParts = cleanAuthor.split(/\s+/);
    let firstName = '';
    let lastName = '';
    
    if (nameParts.length >= 2) {
        firstName = nameParts[0];
        lastName = nameParts[nameParts.length - 1];
    } else if (nameParts.length === 1) {
        firstName = nameParts[0];
        lastName = '';
    }
    
    // Create username: firstname.lastname
    const username = lastName ? 
        `${firstName.toLowerCase()}.${lastName.toLowerCase()}` : 
        firstName.toLowerCase();
    
    // Clean username (remove special characters)
    const cleanUsername = username.replace(/[^a-z0-9.]/g, '');
    
    // Create email: ananay+firstnamelastname@exunclan.com
    const emailSuffix = lastName ? 
        `${firstName.toLowerCase()}${lastName.toLowerCase()}` : 
        firstName.toLowerCase();
    const email = `ananay+${emailSuffix.replace(/[^a-z0-9]/g, '')}@exunclan.com`;
    
    // Generate new user ID (start from 1000 to avoid conflicts)
    const newUserId = 1000 + CREATED_USERS.size + 1;
    
    const newUser = {
        id: newUserId,
        login: cleanUsername,
        email: email,
        display_name: cleanAuthor,
        first_name: firstName,
        last_name: lastName
    };
    
    CREATED_USERS.set(cleanUsername, newUser);
    
    console.log(`👤 Created new user: ${cleanUsername} (${cleanAuthor}) -> ${email}`);
    
    return cleanUsername;
}

// Function to get author login from author string
function getAuthorLogin(authorString) {
    if (!authorString || authorString.trim() === '') return 'admin';
    
    // Clean the author string
    const cleanAuthor = authorString.toLowerCase().trim();
    
    // Direct username match in existing AUTHORS
    if (AUTHORS[cleanAuthor]) {
        return cleanAuthor;
    }
    
    // Try to match by display name or real name in existing AUTHORS (exact matches only)
    for (const [login, author] of Object.entries(AUTHORS)) {
        const displayName = author.display_name.toLowerCase();
        const firstName = author.first_name.toLowerCase();
        const lastName = author.last_name.toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        
        if (displayName === cleanAuthor || fullName === cleanAuthor || 
            firstName === cleanAuthor || lastName === cleanAuthor) {
            return login;
        }
    }
    
    // More conservative partial matching (only if the author name contains exact words)
    const authorWords = cleanAuthor.split(/\s+/);
    for (const [login, author] of Object.entries(AUTHORS)) {
        const firstName = author.first_name.toLowerCase();
        const lastName = author.last_name.toLowerCase();
        const displayName = author.display_name.toLowerCase();
        
        // Only match if first name AND last name are both present as complete words
        if (firstName && lastName && 
            authorWords.includes(firstName) && authorWords.includes(lastName)) {
            console.log(`🔍 Matched "${authorString}" to existing user: ${login}`);
            return login;
        }
        
        // Match if display name is exactly one of the words (for single names)
        if (displayName && authorWords.includes(displayName)) {
            console.log(`🔍 Matched "${authorString}" to existing user: ${login}`);
            return login;
        }
    }
    
    // If no match found, create a new user
    console.log(`🆕 No match found for "${authorString}", creating new user...`);
    return createNewUser(authorString);
}

// Function to create the complete WXR file
function createWxrFile(posts, metadata) {
    const currentDate = new Date().toUTCString();
    const siteUrl = 'https://lnexun.com';
    const siteName = 'Natural Log of Exun';
    
    // Get unique categories and tags for the header
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
    
    // Create category and tag definitions
    const categoryDefs = Array.from(allCategories).map((cat, index) => {
        const slug = cat.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `
	<wp:category>
		<wp:term_id>${index + 1}</wp:term_id>
		<wp:category_nicename>${escapeXml(slug)}</wp:category_nicename>
		<wp:category_parent></wp:category_parent>
		<wp:cat_name>${cdata(cat)}</wp:cat_name>
	</wp:category>`;
    }).join('');
    
    const tagDefs = Array.from(allTags).map((tag, index) => {
        const slug = tag.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `
	<wp:tag>
		<wp:term_id>${allCategories.size + index + 1}</wp:term_id>
		<wp:tag_slug>${escapeXml(slug)}</wp:tag_slug>
		<wp:tag_name>${cdata(tag)}</wp:tag_name>
	</wp:tag>`;
    }).join('');
    
    // Create author definitions from both existing AUTHORS and newly created users
    const allAuthors = [...Object.values(AUTHORS), ...Array.from(CREATED_USERS.values())];
    const authorDefs = allAuthors.map(author => {
        return `
	<wp:author><wp:author_id>${author.id}</wp:author_id><wp:author_login>${cdata(author.login)}</wp:author_login><wp:author_email>${cdata(author.email)}</wp:author_email><wp:author_display_name>${cdata(author.display_name)}</wp:author_display_name><wp:author_first_name>${cdata(author.first_name)}</wp:author_first_name><wp:author_last_name>${cdata(author.last_name)}</wp:author_last_name></wp:author>`;
    }).join('');
    
    // Convert all posts
    const postsXml = posts.map((post, index) => convertPostToWxr(post, index)).join('');
    
    return `<?xml version="1.0" encoding="UTF-8" ?>
<!-- This is a WordPress eXtended RSS file generated by lnexun wayback scraper as seen on lnexun.com -->
<!-- generator="WordPress/6.6.2" created="${currentDate}" -->
<rss version="2.0"
	xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
	xmlns:content="http://purl.org/rss/1.0/modules/content/"
	xmlns:wfw="http://wellformedweb.org/CommentAPI/"
	xmlns:dc="http://purl.org/dc/elements/1.1/"
	xmlns:wp="http://wordpress.org/export/1.2/">

<channel>
	<title>${siteName}</title>
	<link>${siteUrl}</link>
	<description>The Natural Log of Exun - Computer Club of DPS RKP</description>
	<pubDate>${currentDate}</pubDate>
	<language>en-US</language>
	<wp:wxr_version>1.2</wp:wxr_version>
	<wp:base_site_url>${siteUrl}</wp:base_site_url>
	<wp:base_blog_url>${siteUrl}</wp:base_blog_url>

	${authorDefs}

	${categoryDefs}
	${tagDefs}

	<generator>WordPress/6.6.2</generator>

	${postsXml}
</channel>
</rss>`;
}

// Main conversion function
async function convertToWxr() {
    try {
        // Clear any previously created users
        CREATED_USERS.clear();
        
        console.log('🔄 Reading consolidated posts file...');
        
        // Read the consolidated JSON file
        const jsonContent = await fs.readFile(INPUT_FILE, 'utf8');
        const data = JSON.parse(jsonContent);
        
        if (!data.posts || !Array.isArray(data.posts)) {
            throw new Error('Invalid JSON structure: missing posts array');
        }
        
        console.log(`📄 Found ${data.posts.length} posts to convert`);
        
        // Filter out error posts and posts without substantial content
        const validPosts = data.posts.filter(post => {
            return post.id !== 'error-post' && 
                   (post.title?.trim() || (post.content && post.content.length > 50));
        });
        
        console.log(`✅ Converting ${validPosts.length} valid posts to WXR format`);
        
        // First pass: Process all posts to identify and create new users
        console.log('🔍 Processing posts to identify authors...');
        validPosts.forEach(post => {
            getAuthorLogin(post.author); // This will create new users as needed
        });
        
        if (CREATED_USERS.size > 0) {
            console.log(`📝 Created ${CREATED_USERS.size} new users during processing`);
        }
        
        // Create WXR content
        const wxrContent = createWxrFile(validPosts, data.metadata);
        
        // Save to file
        await fs.writeFile(OUTPUT_FILE, wxrContent, 'utf8');
        
        console.log('📊 Conversion Statistics:');
        console.log(`   Total posts processed: ${data.posts.length}`);
        console.log(`   Valid posts exported: ${validPosts.length}`);
        console.log(`   Posts with titles: ${validPosts.filter(p => p.title?.trim()).length}`);
        console.log(`   Posts with content: ${validPosts.filter(p => p.content && p.content.length > 100).length}`);
        console.log(`   Average content length: ${Math.round(validPosts.reduce((sum, p) => sum + (p.content || '').length, 0) / validPosts.length)} chars`);
        
        // Show created users summary
        if (CREATED_USERS.size > 0) {
            console.log('\n👥 Newly Created Users:');
            Array.from(CREATED_USERS.values()).forEach(user => {
                console.log(`   ${user.login} (${user.display_name}) -> ${user.email}`);
            });
            console.log(`   Total new users created: ${CREATED_USERS.size}`);
        } else {
            console.log('\n👥 No new users were created - all authors matched existing users');
        }
        
        console.log(`\n✅ WXR file created: ${OUTPUT_FILE}`);
        console.log(`📦 File size: ${(await fs.stat(OUTPUT_FILE)).size} bytes`);
        
        console.log('\n🚀 Import Instructions:');
        console.log('   1. Go to WordPress Admin → Tools → Import');
        console.log('   2. Choose "WordPress" importer');
        console.log('   3. Upload the generated XML file');
        console.log('   4. Assign authors and configure import settings');
        console.log('   5. Run the import');
        
        return validPosts.length;
        
    } catch (error) {
        console.error('❌ Conversion failed:', error.message);
        if (error.code === 'ENOENT') {
            console.error(`📁 File not found: ${INPUT_FILE}`);
            console.error('   Make sure you have run the consolidation script first');
        }
        throw error;
    }
}

// Run the conversion
if (require.main === module) {
    convertToWxr()
        .then(postCount => {
            console.log(`\n🎉 Successfully converted ${postCount} posts to WXR format!`);
        })
        .catch(error => {
            console.error('💥 Conversion failed:', error);
            process.exit(1);
        });
}

module.exports = {
    convertToWxr,
    createWxrFile,
    convertPostToWxr,
    escapeXml,
    cdata
}; 