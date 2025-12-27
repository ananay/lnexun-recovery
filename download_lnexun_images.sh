#!/bin/bash

# Script to download all files from lnexun_image_urls.txt
# and store them in the uploads folder preserving URL structure

# Create uploads directory if it doesn't exist
mkdir -p uploads

# Counter for progress tracking
total_urls=$(wc -l < lnexun_image_urls.txt)
current=0

echo "Starting download of $total_urls files..."

# Read each URL from the file
while IFS= read -r url; do
    # Skip empty lines
    if [[ -z "$url" ]]; then
        continue
    fi
    
    current=$((current + 1))
    echo "[$current/$total_urls] Processing: $url"
    
    # Extract the path from the URL
    # Remove the web.archive.org prefix and extract the path after /wp-content/uploads/
    path=$(echo "$url" | sed -E 's|https://web\.archive\.org/web/[0-9]+[^/]*/https?://[^/]+/wp-content/uploads/||')
    
    # Handle URLs that don't have the expected structure
    if [[ -z "$path" ]]; then
        echo "Warning: Could not parse path from URL: $url"
        continue
    fi
    
    # Create the full local path
    local_path="uploads/$path"
    
    # Create directory structure
    dir=$(dirname "$local_path")
    mkdir -p "$dir"
    
    # Check if file already exists
    if [[ -f "$local_path" ]]; then
        echo "  ⚡ Already exists: $local_path (skipping)"
        continue
    fi
    
    # Download the file
    if curl -L -s -f -o "$local_path" "$url"; then
        echo "  ✓ Downloaded: $local_path"
    else
        echo "  ✗ Failed to download: $url"
        # Remove the file if it was partially created
        rm -f "$local_path"
    fi
    
done < lnexun_image_urls.txt

echo "Download complete!"
echo "Files saved in the uploads/ directory"
