# Feed Consolidation Script

This script downloads RSS feeds from multiple URLs and consolidates them into a single XML file.

## Features

- Downloads RSS feeds from URLs listed in `feed_urls.txt`
- Parses XML content and extracts all feed items
- Removes duplicate items based on GUID
- Sorts items by publication date (newest first)
- Creates a consolidated RSS feed with proper namespaces
- Handles various RSS feed formats and namespaces

## Requirements

- Python 3.6+
- requests library

## Installation

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

## Usage

1. Make sure you have a `feed_urls.txt` file with one URL per line
2. Run the script:
```bash
python consolidate_feeds.py
```

The script will:
- Download each feed URL
- Parse the XML content
- Extract all items
- Remove duplicates
- Sort by publication date
- Generate a consolidated RSS feed as `consolidated_feed.xml`

## Output

The script creates a `consolidated_feed.xml` file containing:
- All unique items from all feeds
- Items sorted by publication date (newest first)
- Proper RSS 2.0 format with all necessary namespaces
- Channel metadata for ln(exun)

## Error Handling

- Failed downloads are logged but don't stop the process
- Invalid XML is logged but skipped
- Network timeouts are handled gracefully
- Rate limiting with 1-second delays between requests

## Logging

The script provides detailed logging of:
- Number of feeds processed
- Number of items found in each feed
- Total items collected
- Any errors encountered 