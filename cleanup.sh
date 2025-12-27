#!/bin/bash

# Script to delete files that were downloaded from URLs containing "*if_"
# These appear to be problematic or incomplete downloads from Wayback Machine

echo "Starting cleanup of files downloaded from URLs with '*if_'..."

# Counter for tracking
deleted_count=0
total_files=0

# Read each URL from the file
while IFS= read -r url; do
    # Skip empty lines
    if [[ -z "$url" ]]; then
        continue
    fi
    
    # Check if URL contains "*if_"
    if [[ "$url" == *"*if_"* ]]; then
        total_files=$((total_files + 1))
        
        # Extract the path from the URL (same logic as download script)
        path=$(echo "$url" | sed -E 's|https://web\.archive\.org/web/[0-9]+[^/]*/https?://[^/]+/wp-content/uploads/||')
        
        # Handle URLs that don't have the expected structure
        if [[ -z "$path" ]]; then
            echo "Warning: Could not parse path from URL: $url"
            continue
        fi
        
        # Create the full local path
        local_path="uploads/$path"
        
        # Check if file exists and delete it
        if [[ -f "$local_path" ]]; then
            echo "🗑️  Deleting: $local_path"
            rm "$local_path"
            deleted_count=$((deleted_count + 1))
            
            # Check if the directory is now empty and remove it if so
            dir=$(dirname "$local_path")
            if [[ -d "$dir" ]] && [[ -z "$(ls -A "$dir")" ]]; then
                echo "  📁 Removing empty directory: $dir"
                rmdir "$dir"
            fi
        else
            echo "⚠️  File not found: $local_path"
        fi
    fi
    
done < lnexun_image_urls.txt

echo ""
echo "Cleanup complete!"
echo "Files processed: $total_files"
echo "Files deleted: $deleted_count"
echo "Files not found: $((total_files - deleted_count))" 