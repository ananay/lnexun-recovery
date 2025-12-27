#!/usr/bin/env python3
"""
Script to download all feed URLs and consolidate into one XML file.
"""

import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time
from collections import defaultdict
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def download_feed(url):
    """Download a feed from the given URL."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return response.text
    except Exception as e:
        logger.error(f"Failed to download {url}: {e}")
        return None

def parse_feed(xml_content):
    """Parse XML content and extract items."""
    try:
        root = ET.fromstring(xml_content)
        
        # Handle different RSS namespaces
        namespaces = {
            'rss': 'http://purl.org/rss/1.0/',
            'content': 'http://purl.org/rss/1.0/modules/content/',
            'wfw': 'http://wellformedweb.org/CommentAPI/',
            'dc': 'http://purl.org/dc/elements/1.1/',
            'atom': 'http://www.w3.org/2005/Atom',
            'sy': 'http://purl.org/rss/1.0/modules/syndication/',
            'slash': 'http://purl.org/rss/1.0/modules/slash/'
        }
        
        items = []
        
        # Find all item elements
        for item in root.findall('.//item'):
            item_data = {}
            
            # Extract basic fields
            for field in ['title', 'link', 'description', 'pubDate', 'guid']:
                elem = item.find(field)
                if elem is not None:
                    item_data[field] = elem.text if elem.text else ''
            
            # Extract namespaced fields
            for ns_prefix, ns_uri in namespaces.items():
                for elem in item.findall(f'.//{{{ns_uri}}}*'):
                    tag = elem.tag.replace(f'{{{ns_uri}}}', f'{ns_prefix}:')
                    item_data[tag] = elem.text if elem.text else ''
            
            # Extract categories
            categories = []
            for category in item.findall('category'):
                if category.text:
                    categories.append(category.text)
            item_data['categories'] = categories
            
            items.append(item_data)
        
        return items
    except Exception as e:
        logger.error(f"Failed to parse XML: {e}")
        return []

def create_consolidated_feed(items):
    """Create a consolidated RSS feed from items."""
    # Remove duplicates based on GUID
    unique_items = {}
    for item in items:
        guid = item.get('guid', '')
        if guid and guid not in unique_items:
            unique_items[guid] = item
        elif not guid:
            # If no GUID, use title and link as key
            key = f"{item.get('title', '')}-{item.get('link', '')}"
            if key not in unique_items:
                unique_items[key] = item
    
    # Sort by publication date (newest first)
    sorted_items = sorted(
        unique_items.values(),
        key=lambda x: datetime.strptime(x.get('pubDate', ''), '%a, %d %b %Y %H:%M:%S %z') if x.get('pubDate') else datetime.min,
        reverse=True
    )
    
    # Create RSS XML
    rss = ET.Element('rss', version='2.0')
    rss.set('xmlns:content', 'http://purl.org/rss/1.0/modules/content/')
    rss.set('xmlns:wfw', 'http://wellformedweb.org/CommentAPI/')
    rss.set('xmlns:dc', 'http://purl.org/dc/elements/1.1/')
    rss.set('xmlns:atom', 'http://www.w3.org/2005/Atom')
    rss.set('xmlns:sy', 'http://purl.org/rss/1.0/modules/syndication/')
    rss.set('xmlns:slash', 'http://purl.org/rss/1.0/modules/slash/')
    
    channel = ET.SubElement(rss, 'channel')
    
    # Add channel metadata
    title = ET.SubElement(channel, 'title')
    title.text = 'ln(exun) - Consolidated Feed'
    
    link = ET.SubElement(channel, 'link')
    link.text = 'https://www.lnexun.com'
    
    description = ET.SubElement(channel, 'description')
    description.text = 'Consolidated feed from ln(exun) - Natural log of Exun Clan, the computer club at DPS RK Puram.'
    
    last_build_date = ET.SubElement(channel, 'lastBuildDate')
    last_build_date.text = datetime.now().strftime('%a, %d %b %Y %H:%M:%S %z')
    
    language = ET.SubElement(channel, 'language')
    language.text = 'en-US'
    
    # Add items
    for item_data in sorted_items:
        item = ET.SubElement(channel, 'item')
        
        for field in ['title', 'link', 'description', 'pubDate', 'guid']:
            if field in item_data and item_data[field]:
                elem = ET.SubElement(item, field)
                elem.text = item_data[field]
        
        # Add categories
        for category in item_data.get('categories', []):
            cat_elem = ET.SubElement(item, 'category')
            cat_elem.text = category
    
    return ET.tostring(rss, encoding='unicode', method='xml')

def main():
    """Main function to download and consolidate feeds."""
    logger.info("Starting feed consolidation...")
    
    # Read feed URLs
    try:
        with open('feed_urls.txt', 'r') as f:
            feed_urls = [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        logger.error("feed_urls.txt not found!")
        return
    
    logger.info(f"Found {len(feed_urls)} feed URLs to process")
    
    all_items = []
    
    # Download and parse each feed
    for i, url in enumerate(feed_urls, 1):
        logger.info(f"Processing feed {i}/{len(feed_urls)}: {url}")
        
        xml_content = download_feed(url)
        if xml_content:
            items = parse_feed(xml_content)
            all_items.extend(items)
            logger.info(f"Found {len(items)} items in this feed")
        
        # Add a small delay to be respectful to the servers
        time.sleep(1)
    
    logger.info(f"Total items collected: {len(all_items)}")
    
    # Create consolidated feed
    consolidated_xml = create_consolidated_feed(all_items)
    
    # Write to file
    output_file = 'consolidated_feed.xml'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(consolidated_xml)
    
    logger.info(f"Consolidated feed saved to {output_file}")

if __name__ == "__main__":
    main() 