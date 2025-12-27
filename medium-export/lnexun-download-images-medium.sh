#!/bin/bash

# Script to find img tags in HTML files and download images
# Scans all HTML files in the posts folder

# Check if posts directory exists
if [ ! -d "posts" ]; then
    echo "Error: posts directory not found"
    exit 1
fi

# Find all HTML files in posts directory and process them
find posts -name "*.html" -type f | while read -r file; do
    # Extract img tags with the specific structure we're looking for
    # Look for img tags with both src and data-external-src attributes
    grep -o '<img[^>]*>' "$file" 2>/dev/null | grep 'data-external-src=' | grep 'src=' | while read -r img_tag; do
        # Extract src attribute (the Medium CDN URL to download from)
        src_url=$(echo "$img_tag" | sed -n 's/.*src="\([^"]*\)".*/\1/p')
        
        # Extract data-external-src attribute (contains original URL with path info)
        external_src=$(echo "$img_tag" | sed -n 's/.*data-external-src="\([^"]*\)".*/\1/p')
        
        # Extract year and month from data-external-src URL
        # Look for pattern like /uploads/2005/02/ or /uploads/2010/05/
        year_month=$(echo "$external_src" | grep -o '/uploads/[0-9]\{4\}/[0-9]\{2\}/' | sed 's|/uploads/||;s|/$||')
        
        if [ -n "$year_month" ] && [ -n "$src_url" ] && [ -n "$external_src" ]; then
            year=$(echo "$year_month" | cut -d'/' -f1)
            month=$(echo "$year_month" | cut -d'/' -f2)
            
            # Extract filename from the data-external-src URL
            # Get the last part of the URL path (after the last /)
            filename=$(echo "$external_src" | sed 's|.*/||')
            
            # Create the target directory structure
            target_dir="uploads/${year}/${month}"
            mkdir -p "$target_dir"
            
            # Full path for the target file
            target_file="${target_dir}/${filename}"
            
            echo "Saving ${src_url} as ${target_file}"
            
            # Download the image using curl with proper redirect handling
            if curl -s -L --max-redirs 10 --location-trusted -o "$target_file" "$src_url" 2>/dev/null; then
                echo "Successfully downloaded: ${target_file}"
            else
                echo "Failed to download: ${src_url}"
            fi
        fi
    done
done
