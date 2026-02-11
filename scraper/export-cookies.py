#!/usr/bin/env python3
"""
Export Xiaohongshu cookies for GitHub Actions automation
Run this after logging in locally with QR code
"""

import os
import sqlite3
import json

# Try both possible cookie database locations
POSSIBLE_PATHS = [
    "./browser_data/xhs_user_data_dir/Default/Cookies",
    "./browser_data/xhs_user_data_dir/Default/Network/Cookies",
    "../xiaohongshu-scraper-test/browser_data/xhs_user_data_dir/Default/Cookies",
]

def find_cookie_db():
    """Find the cookies database file"""
    for path in POSSIBLE_PATHS:
        if os.path.exists(path):
            return path
    return None

def export_cookies():
    """Extract Xiaohongshu cookies from browser database"""
    cookie_db_path = find_cookie_db()

    if not cookie_db_path:
        print("❌ Cookie database not found!")
        print("\nTried these locations:")
        for path in POSSIBLE_PATHS:
            print(f"  - {path}")
        print("\n💡 Make sure you've run the scraper locally at least once with QR login.")
        print("   The scraper saves cookies after you scan the QR code.")
        return None

    print(f"✓ Found cookie database: {cookie_db_path}\n")

    try:
        # Connect to cookies database
        conn = sqlite3.connect(cookie_db_path)
        cursor = conn.cursor()

        # Get Xiaohongshu cookies
        cursor.execute("""
            SELECT name, value
            FROM cookies
            WHERE host_key LIKE '%xiaohongshu.com%'
            ORDER BY name
        """)

        cookies = cursor.fetchall()
        conn.close()

        if not cookies:
            print("❌ No Xiaohongshu cookies found in database!")
            print("\n💡 Make sure you're logged in to Xiaohongshu:")
            print("   1. Run the scraper locally: python main.py")
            print("   2. Scan the QR code with your phone")
            print("   3. Wait for login to complete")
            print("   4. Run this script again")
            return None

        # Format as cookie string
        cookie_string = "; ".join([f"{name}={value}" for name, value in cookies])

        print(f"✓ Found {len(cookies)} cookies!\n")
        print("Cookie names:")
        for name, _ in cookies:
            print(f"  - {name}")

        return cookie_string

    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
        return None

def main():
    print("=" * 70)
    print("XIAOHONGSHU COOKIE EXPORT FOR GITHUB ACTIONS")
    print("=" * 70)
    print()

    cookie_string = export_cookies()

    if cookie_string:
        print("\n" + "=" * 70)
        print("YOUR COOKIE STRING (copy everything below):")
        print("=" * 70)
        print(cookie_string)
        print("=" * 70)
        print()
        print("📋 Next steps:")
        print("1. Copy the cookie string above")
        print("2. Go to GitHub repo → Settings → Secrets → Actions")
        print("3. Create new secret:")
        print("   Name: XHS_COOKIES")
        print("   Value: <paste cookie string>")
        print("4. Save the secret")
        print()
        print("✅ Then GitHub Actions can scrape without QR code!")
    else:
        print("\n❌ Failed to export cookies. See error above.")
        return 1

    return 0

if __name__ == "__main__":
    exit(main())
