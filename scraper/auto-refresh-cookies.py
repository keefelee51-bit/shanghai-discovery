#!/usr/bin/env python3
"""
auto-refresh-cookies.py
=======================

WHY THIS SCRIPT EXISTS
----------------------
Rednote (Xiaohongshu / XHS) cookies expire roughly every 24 hours.
Your GitHub Actions workflow needs these cookies to scrape XHS without
a QR code. But GitHub Actions runs on a cloud server — it has no browser,
no local session, no way to log in on its own.

The old manual workflow was:
  1. Log in locally → scan QR code → cookies saved in browser
  2. Run export-cookies.py → copy cookie string
  3. Go to GitHub Settings → update XHS_COOKIES secret
  4. Repeat EVERY DAY → defeats the purpose of automation

THIS SCRIPT AUTOMATES STEPS 2 & 3:
  1. Opens your local browser profile (where you're already logged in)
  2. Visits XHS briefly → this refreshes/extends the cookies
  3. Extracts the fresh cookies
  4. Calls the GitHub API to update XHS_COOKIES automatically

Run this script daily (via Windows Task Scheduler) BEFORE GitHub Actions
triggers. That way, GitHub Actions always finds fresh cookies waiting for it.

TIMING:
  - GitHub Actions runs at 2AM UTC (= 10AM Shanghai time)
  - Run THIS script at 1AM UTC (= 9AM Shanghai time)
  - One hour gap = buffer in case this script is slow

HOW TO SET UP
-------------
1. Install the one extra dependency:
       pip install pynacl

2. Create a GitHub Personal Access Token (PAT):
   - Go to: github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - Give it access to THIS repo only
   - Permission needed: "Secrets" → Read and Write
   - Copy the token (you only see it once!)

3. Set environment variables on your Windows machine:
   The easiest way — open PowerShell and run:
       [System.Environment]::SetEnvironmentVariable("GITHUB_PAT",   "your_token_here",   "User")
       [System.Environment]::SetEnvironmentVariable("GITHUB_OWNER", "your_github_username", "User")
       [System.Environment]::SetEnvironmentVariable("GITHUB_REPO",  "shanghai-discovery",  "User")
   These persist across reboots (stored at User level, not just this session).

4. Test it manually first:
       cd scraper
       python auto-refresh-cookies.py

5. Schedule it via Task Scheduler:
       Double-click scraper/run-cookie-refresh.bat  (sets up the scheduled task)
"""

import asyncio
import base64
import os
import sys
from pathlib import Path

# Fix emoji/unicode printing on Windows terminals (which default to cp1252 encoding)
sys.stdout.reconfigure(encoding='utf-8')

import requests
from dotenv import load_dotenv
from playwright.async_api import async_playwright


# ─────────────────────────────────────────────────────────────────────────────
# LOAD .env FILE
#
# python-dotenv reads the .env file and loads each line into os.environ,
# so the rest of the script can use os.environ.get() as normal.
#
# We look for .env in the PROJECT ROOT (one level above scraper/).
# That's the same .env file that the Node.js scripts (process-xhs-posts.mjs,
# upload-to-supabase.mjs) also read — one file for all keys.
#
# override=False means: if a variable is ALREADY set in the system environment,
# don't overwrite it. This lets GitHub Actions inject secrets via real env vars
# without the .env file interfering.
# ─────────────────────────────────────────────────────────────────────────────

# __file__ = path to this script (scraper/auto-refresh-cookies.py)
# .parent   = scraper/
# .parent   = project root (shanghai-discovery/)
project_root = Path(__file__).parent.parent
dotenv_path = project_root / ".env"

if dotenv_path.exists():
    load_dotenv(dotenv_path, override=False)
    print(f"   Loaded .env from: {dotenv_path}")
else:
    print(f"   No .env file found at {dotenv_path} — relying on system environment variables")


# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
#
# We read secrets from environment variables instead of hardcoding them here.
# Why? If you ever commit this file to git, hardcoded passwords become PUBLIC.
# Environment variables (and .env files) stay on your local machine — safe.
# ─────────────────────────────────────────────────────────────────────────────

GITHUB_PAT   = os.environ.get("GITHUB_PAT",   "")   # Your GitHub personal access token
GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "")   # Your GitHub username, e.g. "johndoe"
GITHUB_REPO  = os.environ.get("GITHUB_REPO",  "")   # Your repo name, e.g. "shanghai-discovery"

# This is the folder Playwright created when you first logged in via QR code.
# It stores cookies, localStorage, session data — basically your entire browser state.
# Using this folder means the browser starts ALREADY LOGGED IN.
#
# os.path.abspath() converts the relative path to a full path,
# so this script works no matter which directory you run it from.
BROWSER_PROFILE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "browser_data", "xhs_user_data_dir")
)

# The XHS page we visit to trigger a session refresh
XHS_URL = "https://www.xiaohongshu.com"


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: REFRESH COOKIES
#
# We open the browser with your saved session, visit XHS, and grab the cookies.
#
# WHY DOES VISITING THE SITE REFRESH COOKIES?
# XHS (like most websites) uses "sliding session" expiry:
#   - If you don't visit for 24h → session dies
#   - Each visit → server sends back updated Set-Cookie headers → timer resets
# So just loading the homepage is enough to keep the session alive another day.
# ─────────────────────────────────────────────────────────────────────────────

async def get_fresh_cookies() -> str | None:
    """
    Opens XHS in a headless (invisible) browser using the saved local profile,
    visits the homepage to refresh the session, extracts cookies, and returns
    them as a single semicolon-separated string.

    Returns: "web_session=abc123; a1=xyz; ..."  or  None if session expired.
    """
    print("\n📂 Step 1: Refreshing cookies from your local browser profile...")
    print(f"   Profile path: {BROWSER_PROFILE_DIR}")

    # Check the profile folder exists — it's created by the first QR login
    if not os.path.exists(BROWSER_PROFILE_DIR):
        print("❌ Browser profile not found!")
        print("   You need to log in locally first:")
        print("   cd scraper && python main.py --platform xhs --lt qrcode --type search")
        return None

    # async with = Python's way of saying "set this up, use it, then clean up"
    # async_playwright() starts the Playwright engine
    async with async_playwright() as p:

        print("   Launching headless Chromium with your saved session...")

        # launch_persistent_context = open a browser that REMEMBERS your session.
        # Unlike a normal browser launch (which starts blank), this loads your
        # saved cookies, localStorage, and login state from BROWSER_PROFILE_DIR.
        #
        # headless=True = no window appears on screen.
        # This is fine here because we're not doing anything interactive —
        # just visiting a page and reading cookies.
        browser_context = await p.chromium.launch_persistent_context(
            BROWSER_PROFILE_DIR,
            headless=True,
            args=[
                "--no-sandbox",
                # Hides automation signals from the website.
                # Without this, XHS might detect "this is a bot" and block us.
                "--disable-blink-features=AutomationControlled",
            ],
        )

        # Get the first open tab, or open a new one if none exist
        page = (
            browser_context.pages[0]
            if browser_context.pages
            else await browser_context.new_page()
        )

        print(f"   Visiting {XHS_URL} to refresh the session...")
        try:
            # goto() = navigate to a URL.
            # wait_until="domcontentloaded" = stop waiting once the HTML is loaded
            # (we don't need images/videos to load — just the HTML is enough
            # for the server to see our request and refresh our session).
            # timeout=30_000 = give up if it takes more than 30 seconds.
            await page.goto(XHS_URL, wait_until="domcontentloaded", timeout=30_000)
        except Exception as e:
            # Navigation can time out on slow connections — that's okay.
            # The server likely already received our request and refreshed cookies.
            print(f"   ⚠️  Navigation timed out: {e}")
            print("   Continuing anyway — server probably refreshed cookies already.")

        # Extract all cookies the browser currently has stored.
        # Returns a list of dicts, one per cookie, e.g.:
        # [{"name": "web_session", "value": "abc123", "domain": ".xiaohongshu.com"}, ...]
        all_cookies = await browser_context.cookies()

        # Filter: only keep cookies that belong to xiaohongshu.com.
        # The browser also stores cookies for Google, CDNs, etc. — we don't want those.
        xhs_cookies = [
            c for c in all_cookies
            if "xiaohongshu.com" in c.get("domain", "")
        ]

        # Always close the browser when done — frees memory and avoids lock files
        await browser_context.close()

        if not xhs_cookies:
            print("❌ No XHS cookies found — your local session has expired.")
            print("   Re-login: cd scraper && python main.py --platform xhs --lt qrcode")
            return None

        # web_session is THE key authentication cookie for XHS.
        # The scraper's login.py only actually uses this one cookie.
        # If it's missing, we're not logged in.
        web_session = next(
            (c for c in xhs_cookies if c["name"] == "web_session"), None
        )
        if not web_session:
            print("❌ web_session cookie missing — session has expired!")
            print("   Please re-login locally with QR code.")
            return None

        print(f"   ✓ Found {len(xhs_cookies)} XHS cookies")
        print(f"   ✓ web_session is present — session is active!")

        # Join all cookies into one string using the standard HTTP Cookie format:
        # "name1=value1; name2=value2; name3=value3"
        # This is exactly what browsers send in the Cookie: request header.
        cookie_string = "; ".join(
            f"{c['name']}={c['value']}" for c in xhs_cookies
        )

        return cookie_string


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: ENCRYPT THE SECRET FOR GITHUB
#
# Before we can send the cookie to GitHub via the API, we MUST encrypt it.
# GitHub won't accept plaintext secrets — only encrypted ones.
#
# WHY ENCRYPTION?
# Even though we're using HTTPS (which encrypts the network traffic),
# GitHub adds another layer: asymmetric (public/private key) encryption.
#
# Think of it like a padlock:
#   - GitHub gives everyone the OPEN PADLOCK (public key)
#   - You lock your secret inside it → send it to GitHub
#   - Only GitHub has the KEY to open it (private key, stored on their servers)
#   - Even GitHub engineers can't read your secrets at rest
#
# The specific algorithm GitHub requires is called "libsodium Sealed Box".
# PyNaCl is Python's wrapper for libsodium.
# ─────────────────────────────────────────────────────────────────────────────

def encrypt_secret_for_github(public_key_b64: str, secret_value: str) -> str:
    """
    Encrypts a secret value using GitHub's repository public key.
    GitHub requires this before accepting any secret via the API.

    Args:
        public_key_b64: GitHub's public key, base64-encoded (fetched from GitHub API)
        secret_value:   The plaintext secret to encrypt (our cookie string)

    Returns: The encrypted value, base64-encoded (ready to send to GitHub API)
    """
    try:
        # PyNaCl is a Python wrapper around the libsodium cryptography library.
        # GitHub's official docs say to use this exact library and approach.
        from nacl.encoding import Base64Encoder
        from nacl.public import PublicKey, SealedBox
    except ImportError:
        print("❌ Missing library: PyNaCl")
        print("   Install it: pip install pynacl")
        sys.exit(1)

    # GitHub's public key comes as a base64 string.
    # We decode it back to raw bytes so the crypto library can use it.
    public_key_bytes = base64.b64decode(public_key_b64)

    # Wrap the bytes as a PyNaCl PublicKey object
    public_key = PublicKey(public_key_bytes)

    # SealedBox = anonymous encryption (the sender's identity is hidden).
    # It uses Curve25519 key exchange + XSalsa20-Poly1305 encryption.
    # (You don't need to understand the math — just know it's industry-standard.)
    sealed_box = SealedBox(public_key)

    # Encrypt the secret.
    # .encode("utf-8") converts the Python string to bytes (crypto works on bytes).
    # Base64Encoder wraps the output in base64 so it's safe to put in JSON.
    encrypted_bytes = sealed_box.encrypt(
        secret_value.encode("utf-8"),
        encoder=Base64Encoder,
    )

    # .decode("utf-8") converts bytes back to a string for JSON serialization
    return encrypted_bytes.decode("utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: PUSH TO GITHUB SECRETS VIA API
#
# GitHub's REST API lets you do programmatically anything you can do on the
# GitHub website — including creating/updating repository secrets.
#
# The flow:
#   a) Fetch the repo's public key (needed to encrypt our secret)
#   b) Encrypt the cookie string with that key
#   c) PUT the encrypted value to GitHub's secrets endpoint
#
# PUT = HTTP method meaning "create or update this resource".
# It's safe to call multiple times — running it twice just updates the same secret.
# ─────────────────────────────────────────────────────────────────────────────

def update_github_secret(secret_name: str, secret_value: str) -> bool:
    """
    Updates a GitHub Actions repository secret via the GitHub REST API.

    Args:
        secret_name:  Name of the secret to update, e.g. "XHS_COOKIES"
        secret_value: The plaintext value — will be encrypted before sending

    Returns: True if successful, False if something went wrong
    """
    print(f"\n🔐 Step 2: Pushing fresh cookies to GitHub secret '{secret_name}'...")

    # These headers go on every request to GitHub's API.
    # Authorization: Bearer = how we prove we're allowed to do this (the PAT is our password)
    # Accept: tells GitHub what format to send the response in (their v3 JSON format)
    # X-GitHub-Api-Version: pins to a specific API version so it doesn't break if GitHub updates
    headers = {
        "Authorization": f"Bearer {GITHUB_PAT}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    base_url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}"

    # ── a) Fetch the repo's encryption public key ─────────────────────────
    # Every GitHub repo has a unique public key for secrets encryption.
    # We must fetch it fresh each time (GitHub can rotate keys).
    print("   Fetching GitHub repo's public encryption key...")
    key_response = requests.get(
        f"{base_url}/actions/secrets/public-key",
        headers=headers,
    )

    if key_response.status_code != 200:
        print(f"❌ Could not fetch public key (HTTP {key_response.status_code})")
        print(f"   Response: {key_response.text}")
        print("   Check: Does your GITHUB_PAT have 'Secrets: Read & Write' permission?")
        return False

    # key_data looks like:
    # {"key_id": "012345...", "key": "base64encodedpublickey..."}
    key_data = key_response.json()

    # ── b) Encrypt our cookie string ──────────────────────────────────────
    print("   Encrypting cookie string with GitHub's public key...")
    encrypted_value = encrypt_secret_for_github(key_data["key"], secret_value)

    # ── c) Send the encrypted secret to GitHub ────────────────────────────
    print("   Sending encrypted secret to GitHub API...")
    put_response = requests.put(
        f"{base_url}/actions/secrets/{secret_name}",
        headers=headers,
        json={
            # The encrypted cookie value
            "encrypted_value": encrypted_value,
            # key_id tells GitHub WHICH public key was used to encrypt this.
            # GitHub uses it to look up the matching private key for decryption
            # when the GitHub Actions workflow reads the secret.
            "key_id": key_data["key_id"],
        },
    )

    # GitHub returns:
    #   201 Created  = secret was newly created
    #   204 No Content = secret already existed and was updated
    # Both mean success!
    if put_response.status_code in (201, 204):
        print(f"   ✓ Secret '{secret_name}' updated successfully on GitHub!")
        return True
    else:
        print(f"❌ Failed to update secret (HTTP {put_response.status_code})")
        print(f"   Response: {put_response.text}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# MAIN — ties everything together
# ─────────────────────────────────────────────────────────────────────────────

async def main():
    print("=" * 60)
    print("  XHS COOKIE AUTO-REFRESHER")
    print("  Keeps GitHub Actions working without daily manual updates")
    print("=" * 60)

    # ── Check that all required config is present ─────────────────────────
    missing = []
    if not GITHUB_PAT:   missing.append("GITHUB_PAT")
    if not GITHUB_OWNER: missing.append("GITHUB_OWNER")
    if not GITHUB_REPO:  missing.append("GITHUB_REPO")

    if missing:
        print(f"\n❌ Missing environment variables: {', '.join(missing)}")
        print("\nSet them permanently in PowerShell (run once, persists after reboot):")
        for var in missing:
            print(f'   [System.Environment]::SetEnvironmentVariable("{var}", "your_value", "User")')
        sys.exit(1)

    print(f"\n   GitHub target: {GITHUB_OWNER}/{GITHUB_REPO}")
    print(f"   PAT loaded:    {'*' * 8}{GITHUB_PAT[-4:]} (last 4 chars shown)")

    # ── Step 1: Get fresh cookies from local browser ──────────────────────
    # This is async (uses await) because Playwright does browser automation
    # in a non-blocking way — Python can do other things while waiting for pages to load.
    cookie_string = await get_fresh_cookies()
    if not cookie_string:
        print("\n❌ Could not get fresh cookies. Aborting.")
        sys.exit(1)

    # ── Step 2: Push fresh cookies to GitHub Secrets ──────────────────────
    success = update_github_secret("XHS_COOKIES", cookie_string)

    if success:
        print("\n✅ Done! GitHub Actions will use these fresh cookies on its next run.")
        print(f"   (GitHub Actions triggers at 2AM UTC = 10AM Shanghai)")
    else:
        print("\n❌ Failed to update GitHub secret. See errors above.")
        sys.exit(1)


# This block runs only when you execute this file directly (not when it's imported).
# asyncio.run() is needed because main() uses async/await (Playwright requires it).
# It starts the async event loop, runs main(), then shuts it down cleanly.
if __name__ == "__main__":
    asyncio.run(main())
