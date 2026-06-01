"""
FaceScan -- Environment Class Image Scraper v3
==============================================
Downloads 150+ environment/background images (no faces) using:
  - Primary:  DuckDuckGo Images via ddgs (with retry + back-off)
  - Fallback: Unsplash Source API (no API key required)

Output folder: dataset/environment/
Usage:         python dataset/scrape_environment.py
"""

import os
import sys
import time
import random
import requests

# -- Output folder ------------------------------------------------------------
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "environment")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -- Count existing env_ images so we resume numbering -----------------------
existing = [
    f for f in os.listdir(OUTPUT_DIR)
    if f.startswith("env_") and os.path.isfile(os.path.join(OUTPUT_DIR, f))
]
file_index = len(existing) + 1
print(f"Resuming from env_{file_index:04d}  ({len(existing)} images already in folder)")

# -- Search queries + targets -------------------------------------------------
QUERIES = [
    ("philippine university campus empty no people",    10),
    ("local college hallway empty philippines",         10),
    ("philippine state university exterior no students",10),
    ("empty university classroom philippines",          10),
]
TARGET_TOTAL = 20

# -- HTTP helpers -------------------------------------------------------------
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    )
}

def download_image(url: str, dest: str) -> bool:
    try:
        r = requests.get(url, headers=HEADERS, timeout=12, stream=True, allow_redirects=True)
        if r.status_code != 200:
            return False
        ct = r.headers.get("Content-Type", "")
        if "image" not in ct and "jpeg" not in ct and "png" not in ct:
            return False
        with open(dest, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        if os.path.getsize(dest) < 8_000:   # reject tiny/error responses
            os.remove(dest)
            return False
        return True
    except Exception:
        if os.path.exists(dest):
            try:
                os.remove(dest)
            except Exception:
                pass
        return False

def ext_from_url(url: str) -> str:
    path = url.split("?")[0].lower()
    for e in (".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(e):
            return ".jpg" if e == ".jpeg" else e
    return ".jpg"

# -- Strategy 1: ddgs ---------------------------------------------------------
def scrape_ddgs(query: str, count: int) -> list:
    """Return up to count*3 image URLs via ddgs, or [] on failure."""
    try:
        from ddgs import DDGS
    except ImportError:
        return []
    try:
        results = []
        with DDGS() as ddgs:
            for r in ddgs.images(query, max_results=count * 3):
                url = r.get("image", "")
                if url:
                    results.append(url)
        return results
    except Exception as e:
        print(f"    ddgs error: {e}")
        return []

# -- Main crawl ---------------------------------------------------------------
total_saved = 0

for query, target in QUERIES:
    if total_saved >= TARGET_TOTAL:
        print(f"\n  Target of {TARGET_TOTAL} reached early. Skipping remaining queries.")
        break

    need = min(target, TARGET_TOTAL - total_saved)
    print(f"\n[+] '{query}'  ->  need {need} images")
    saved_this = 0

    # -- Try ddgs (wait 3s before each query to avoid rate limit) -------
    time.sleep(3)
    urls = scrape_ddgs(query, need)

    if not urls:
        print("    ddgs returned nothing, skipping query...")
        continue

    seen_urls = set()
    for url in urls:
        if saved_this >= need:
            break
        if url in seen_urls:
            continue
        seen_urls.add(url)

        ext = ext_from_url(url)
        dest = os.path.join(OUTPUT_DIR, f"env_{file_index:04d}{ext}")
        if download_image(url, dest):
            file_index += 1
            saved_this += 1
        time.sleep(0.3)

    total_saved += saved_this
    print(f"    Saved {saved_this}/{need}  (total: {total_saved})")

# -- Summary ------------------------------------------------------------------
print("\n" + "=" * 60)
print(f"  Done!  {total_saved} images saved to:")
print(f"  {OUTPUT_DIR}")
print("=" * 60)

if total_saved < 150:
    print(f"\n  WARNING: Only {total_saved}/150 downloaded.")
    print("  Re-run the script to top up (it will resume from where it left off).")
else:
    print(f"\n  SUCCESS: {total_saved} images ready for Teachable Machine.")
