# 🚀 Complete Setup Guide - Shanghai Discovery Automation

## ✅ What's Done:

1. ✅ Scraper copied to `scraper/` subdirectory
2. ✅ Workflow updated for ONE repo (cookie authentication)
3. ✅ `.gitignore` configured to exclude scraper data
4. ✅ Cookie export script created

## 📋 What YOU Need to Do:

---

## STEP 1: Export Your Cookies (5 minutes)

Since you've already run the scraper locally with QR login, your cookies should be saved!

**Run the cookie export script:**

```bash
cd C:/Users/Lenovo/shanghai-discovery/scraper
python export-cookies.py
```

**Expected output:**
```
✓ Found 8 cookies!
YOUR COOKIE STRING (copy everything below):
================================================================
web_session=abc123...; a1=xyz789...; webId=...
================================================================
```

**📋 Copy that entire cookie string** - you'll need it for GitHub Secrets!

---

## STEP 2: Initialize Git and Commit Everything (2 minutes)

```bash
cd C:/Users/Lenovo/shanghai-discovery

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Shanghai Discovery app with automation"
```

---

## STEP 3: Create GitHub Repository (2 minutes)

1. **Go to:** https://github.com/new

2. **Fill in:**
   - Repository name: `shanghai-discovery`
   - Description: "Automated content discovery app for foreigners in Shanghai"
   - Visibility: **Private** (recommended - contains API usage)
   - **DO NOT** check "Add README" (we already have code)

3. **Click "Create repository"**

4. **Copy the repo URL** (you'll need it next)

---

## STEP 4: Push to GitHub (1 minute)

GitHub will show you commands after creating the repo. Run these:

```bash
cd C:/Users/Lenovo/shanghai-discovery

# Add remote (replace with your actual repo URL)
git remote add origin https://github.com/keefelee51-bit/shanghai-discovery.git

# Push
git branch -M main
git push -u origin main
```

---

## STEP 5: Add GitHub Secrets (5 minutes)

**Go to:** `https://github.com/keefelee51-bit/shanghai-discovery/settings/secrets/actions`

**Add these 4 secrets** (click "New repository secret" for each):

### Secret 1: XHS_COOKIES
- **Name:** `XHS_COOKIES`
- **Value:** Paste the cookie string from Step 1
- Click "Add secret"

### Secret 2: VITE_ANTHROPIC_API_KEY
- **Name:** `VITE_ANTHROPIC_API_KEY`
- **Value:** Your Claude API key (from https://console.anthropic.com)
- Looks like: `sk-ant-api03-...`
- Click "Add secret"

### Secret 3: VITE_SUPABASE_URL
- **Name:** `VITE_SUPABASE_URL`
- **Value:** Your Supabase project URL
- Looks like: `https://abc123xyz.supabase.co`
- **Where:** Supabase Dashboard → Project Settings → API
- Click "Add secret"

### Secret 4: VITE_SUPABASE_ANON_KEY
- **Name:** `VITE_SUPABASE_ANON_KEY`
- **Value:** Your Supabase anon/public key
- Looks like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Where:** Supabase Dashboard → Project Settings → API → anon/public key
- Click "Add secret"

**Verify:** You should see 4 secrets listed (values hidden)

---

## STEP 6: Test the Automation! (30 minutes)

**Trigger a manual run:**

1. Go to: `https://github.com/keefelee51-bit/shanghai-discovery/actions`

2. Click **"Daily Content Pipeline"** (left sidebar)

3. Click **"Run workflow"** dropdown (right side)

4. Click green **"Run workflow"** button

5. **Watch it run!** (takes 20-30 minutes)
   - Click on the running workflow to see live logs
   - Check each step for green checkmarks ✅

**What should happen:**
- ✅ Checkout code
- ✅ Install dependencies
- ✅ Configure cookie auth (no QR scan!)
- ✅ Run scraper
- ✅ Process posts with Claude API
- ✅ Upload to Supabase
- ✅ Show summary

---

## STEP 7: Verify It Worked

### Check Supabase:

1. **Go to:** Supabase Dashboard → Table Editor → Post table
2. **You should see:** New posts added
3. **Check:** Storage → post-images → New images uploaded

### Check Your App:

```bash
cd C:/Users/Lenovo/shanghai-discovery
npm run dev
```

1. Open http://localhost:5173
2. **You should see:** New posts with multiple images
3. **Test:** Click carousel arrows to see all images

---

## 🎉 Done! Your automation is live!

### What Happens Now:

- **Automatic:** Pipeline runs daily at 2 AM UTC (10 AM Shanghai time)
- **Manual:** You can trigger it anytime from Actions tab
- **No QR needed:** Uses cookies from GitHub Secrets
- **Fresh content:** App updates automatically every day!

---

## 🐛 Troubleshooting

### "No scraped data found"
**Cause:** Cookies might be expired or invalid

**Fix:**
1. Run scraper locally again (scan QR)
2. Export new cookies: `python scraper/export-cookies.py`
3. Update `XHS_COOKIES` secret on GitHub
4. Re-run workflow

### "Claude API error"
**Cause:** Invalid API key or rate limit

**Fix:**
1. Check Anthropic dashboard for usage
2. Verify `VITE_ANTHROPIC_API_KEY` secret is correct
3. Check if key has credits remaining

### "Supabase error"
**Cause:** Invalid credentials or storage full

**Fix:**
1. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct
2. Check Supabase dashboard for storage usage
3. Check if bucket `post-images` exists

### Workflow doesn't run automatically
**Fix:**
1. Go to Actions tab → Click "Enable workflows" if needed
2. Verify schedule is correct in workflow file
3. Wait until next scheduled time (2 AM UTC)

---

## 📊 Monitoring

### Check Pipeline Status:

**Daily:** Go to `https://github.com/keefelee51-bit/shanghai-discovery/actions`

**Look for:**
- ✅ Green checkmarks = Success
- ❌ Red X = Failed (check logs)
- 🟡 Yellow = Running

### View Logs:

1. Click any workflow run
2. Click job name
3. Click any step to see detailed output
4. Look for "Pipeline Summary" to see results

### Download Results:

1. Scroll to bottom of workflow run page
2. Under "Artifacts" → Click **pipeline-results-XXX**
3. Download ZIP file
4. See `pipeline-output.json` with all processed posts

---

## ⚙️ Configuration

### Change Schedule:

Edit `.github/workflows/daily-automation.yml` line 7:

```yaml
# Current: Daily at 2 AM UTC
cron: '0 2 * * *'

# Every 12 hours:
cron: '0 */12 * * *'

# Monday-Friday only at 9 AM UTC:
cron: '0 9 * * 1-5'
```

Use https://crontab.guru to generate cron expressions.

### Change Search Keywords:

Edit `.github/workflows/daily-automation.yml` line 84:

```yaml
# Current:
python main.py --platform xhs --lt cookie --type search --keywords "上海"

# Multiple keywords:
python main.py --platform xhs --lt cookie --type search --keywords "上海 美食 活动"
```

---

## 🔒 Security

**Your secrets are encrypted** - GitHub never shows them in logs!

**Cookie Maintenance:**
- Cookies can expire (usually after weeks/months)
- When they expire, re-export and update `XHS_COOKIES` secret
- Test workflow monthly to ensure it still works

**Best Practices:**
- ✅ Use private repo for production
- ✅ Rotate API keys periodically
- ✅ Don't share secrets or commit them to code
- ✅ Monitor usage in Anthropic/Supabase dashboards

---

## 📞 Need Help?

**Review these files:**
- [README-automation.md](README-automation.md) - Full documentation
- [AUTOMATION-SETUP-CHECKLIST.md](AUTOMATION-SETUP-CHECKLIST.md) - Quick checklist
- `.github/workflows/daily-automation.yml` - Workflow file (has comments)

**Check workflow logs** on GitHub Actions tab for specific errors.

---

## 🎯 Quick Command Reference

| Task | Command |
|------|---------|
| Export cookies | `cd scraper && python export-cookies.py` |
| Run scraper locally | `cd scraper && python main.py` |
| Process posts manually | `node scripts/process-xhs-posts.mjs <path>` |
| Upload to Supabase | `node scripts/upload-to-supabase.mjs` |
| Start dev server | `npm run dev` |
| View GitHub Actions | Open repo → Actions tab |
| Trigger manual run | Actions → Daily Content Pipeline → Run workflow |

---

**You're all set!** Follow the steps above to complete the setup. 🚀
