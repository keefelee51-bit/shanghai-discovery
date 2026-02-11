# Daily Automation Pipeline - Shanghai Discovery

This document explains how the automated content pipeline works and how to configure it.

## 🔄 What It Does

The GitHub Actions workflow automatically runs every day at **2 AM UTC (10 AM Shanghai time)** and:

1. **Scrapes** new Xiaohongshu posts about Shanghai
2. **Filters** posts using Claude API (removes irrelevant content)
3. **Translates** accepted posts from Chinese to English
4. **Uploads images** to Supabase Storage
5. **Saves** posts to Supabase database

**Result:** Your app gets fresh content daily without manual work!

---

## 📋 Prerequisites

Before setting up automation, ensure:

1. ✅ Your `shanghai-discovery` project is on GitHub
2. ✅ Your `xiaohongshu-scraper-test` is on GitHub (or ready to push)
3. ✅ You have API keys for Anthropic (Claude) and Supabase
4. ✅ Your scraper works locally

---

## 🔧 Setup Instructions

### Step 1: Push Scraper to GitHub (if not already there)

If your scraper is only local, create a new repo:

```bash
cd ~/projects/xiaohongshu-scraper-test
git init
git add .
git commit -m "Initial commit: MediaCrawler scraper"
git remote add origin https://github.com/YOUR_USERNAME/xiaohongshu-scraper-test.git
git push -u origin main
```

### Step 2: Update Workflow File

Edit `.github/workflows/daily-automation.yml` line 27:

```yaml
# BEFORE:
repository: YOUR_USERNAME/xiaohongshu-scraper-test

# AFTER (replace with your actual username):
repository: YourGitHubUsername/xiaohongshu-scraper-test
```

### Step 3: Add GitHub Secrets

Secrets are encrypted environment variables. Here's how to add them:

1. **Go to your repo on GitHub:**
   ```
   https://github.com/YOUR_USERNAME/shanghai-discovery
   ```

2. **Navigate to Settings:**
   - Click **Settings** (top menu)
   - Click **Secrets and variables** → **Actions** (left sidebar)
   - Click **New repository secret** (green button)

3. **Add these 3 secrets:**

   **Secret 1: VITE_ANTHROPIC_API_KEY**
   - Name: `VITE_ANTHROPIC_API_KEY`
   - Value: Your Claude API key (starts with `sk-ant-...`)
   - Click "Add secret"

   **Secret 2: VITE_SUPABASE_URL**
   - Name: `VITE_SUPABASE_URL`
   - Value: Your Supabase project URL (e.g., `https://abc123.supabase.co`)
   - Click "Add secret"

   **Secret 3: VITE_SUPABASE_ANON_KEY**
   - Name: `VITE_SUPABASE_ANON_KEY`
   - Value: Your Supabase anon/public key (starts with `eyJ...`)
   - Click "Add secret"

4. **Verify:** You should see 3 secrets listed (values are hidden)

---

## 🚀 How to Use

### Automatic Daily Runs

The workflow runs automatically every day at 2 AM UTC. No action needed!

### Manual Trigger (Test It Now)

1. Go to your repo on GitHub
2. Click **Actions** tab
3. Click **Daily Content Pipeline** (left sidebar)
4. Click **Run workflow** dropdown (right side)
5. Click green **Run workflow** button

The workflow will start immediately. You can watch it run in real-time!

---

## 📊 Viewing Logs

### See Workflow Status

1. Go to **Actions** tab on GitHub
2. You'll see a list of workflow runs with status:
   - ✅ Green checkmark = Success
   - ❌ Red X = Failed
   - 🟡 Yellow circle = Running

### View Detailed Logs

1. Click on any workflow run
2. Click on the job name (`scrape-and-process`)
3. Click on any step to see its output
4. Look for the **Pipeline Summary** step to see results

### Download Artifacts

Each run saves the pipeline output for 7 days:

1. Scroll to bottom of workflow run page
2. Under **Artifacts**, click **pipeline-results-XXX**
3. Download the ZIP file
4. Extract to see `pipeline-output.json` and scraped data

---

## 🐛 Troubleshooting

### Problem: Workflow not running

**Check:**
- Is the repo public or do you have GitHub Actions enabled?
- Is the schedule correct? (Check `.github/workflows/daily-automation.yml`)
- Did you commit and push the workflow file?

**Solution:**
```bash
git add .github/workflows/daily-automation.yml
git commit -m "Add daily automation workflow"
git push
```

### Problem: "No scraped data found"

**Possible causes:**
- Scraper failed (check scraper logs)
- Wrong file path
- Scraper config issues

**Solution:**
1. Check the "Run scraper" step logs
2. Verify scraper works locally first
3. Check if `ENABLE_GET_MEDIAS = True` in scraper config

### Problem: "Claude API error" or "Rate limit exceeded"

**Possible causes:**
- Invalid API key
- Out of API credits
- Too many requests

**Solution:**
1. Verify `VITE_ANTHROPIC_API_KEY` secret is correct
2. Check your Anthropic dashboard for usage/limits
3. Reduce number of posts scraped

### Problem: "Supabase upload failed"

**Possible causes:**
- Invalid Supabase credentials
- Storage quota exceeded
- Network issues

**Solution:**
1. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct
2. Check Supabase dashboard for storage usage
3. Check if bucket `post-images` exists

### Problem: Workflow uses too many minutes

**GitHub Actions free tier:** 2,000 minutes/month

**Typical usage:**
- One pipeline run: ~15-30 minutes
- Daily runs: ~450-900 minutes/month
- **You're within limits!** ✅

**If you exceed:**
- Reduce scraping frequency (every 2 days instead of daily)
- Process fewer posts
- Optimize scraper runtime

---

## ⚙️ Configuration Options

### Change Schedule

Edit `.github/workflows/daily-automation.yml` line 7:

```yaml
# Current: Daily at 2 AM UTC (10 AM Shanghai)
cron: '0 2 * * *'

# Every 12 hours:
cron: '0 */12 * * *'

# Mondays only at 9 AM UTC:
cron: '0 9 * * 1'

# Every 3 days at midnight UTC:
cron: '0 0 */3 * *'
```

**Cron syntax:** `minute hour day month weekday`

Use https://crontab.guru to generate cron expressions.

### Change Scraper Keywords

Edit line 93 to search for different topics:

```yaml
# Current:
python main.py --platform xhs --lt qrcode --type search --keywords "上海"

# Multiple keywords:
python main.py --platform xhs --lt qrcode --type search --keywords "上海 美食"

# Different city:
python main.py --platform xhs --lt qrcode --type search --keywords "北京"
```

### Enable Failure Notifications

Uncomment lines 180-192 in the workflow file and add email secrets:

1. Add GitHub secrets:
   - `EMAIL_USERNAME`: Your Gmail address
   - `EMAIL_PASSWORD`: Gmail app password ([create one here](https://myaccount.google.com/apppasswords))

2. Update the `to:` email address

3. You'll receive emails when pipeline fails

---

## 📈 Monitoring & Optimization

### Check Pipeline Health

**Weekly checklist:**
1. Go to Actions tab
2. Review success rate (should be >80%)
3. Check average runtime (should be <30 min)
4. Review artifacts to see accepted/rejected ratios

### Optimize Performance

**If pipeline is slow:**
- Reduce posts scraped (edit scraper config)
- Filter more aggressively (adjust filter prompts)
- Process in batches

**If too few posts accepted:**
- Adjust Claude API filter criteria
- Change scraper keywords
- Increase post count in scraper

**If storage fills up:**
- Delete old images from Supabase
- Reduce image quality
- Implement cleanup script

---

## 🔒 Security Notes

**Secrets are encrypted** - GitHub never exposes them in logs

**Best practices:**
- ✅ Never commit API keys to code
- ✅ Use separate API keys for production
- ✅ Rotate keys periodically
- ✅ Use environment-specific secrets

**If a secret is compromised:**
1. Revoke the old key (Anthropic/Supabase dashboard)
2. Generate a new key
3. Update the GitHub secret
4. Re-run the workflow to test

---

## 📞 Support

**Issues with this automation?**

1. Check the [Troubleshooting](#-troubleshooting) section above
2. Review workflow logs in GitHub Actions
3. Test scripts locally first before debugging automation
4. Check [GitHub Actions documentation](https://docs.github.com/en/actions)

**Common resources:**
- [GitHub Actions pricing](https://github.com/pricing)
- [Cron expression generator](https://crontab.guru)
- [Supabase storage limits](https://supabase.com/docs/guides/storage)
- [Anthropic API limits](https://docs.anthropic.com/claude/reference/rate-limits)

---

## 🎯 Quick Reference

| Task | Command/Link |
|------|-------------|
| View all runs | `https://github.com/YOUR_USERNAME/shanghai-discovery/actions` |
| Trigger manually | Actions → Daily Content Pipeline → Run workflow |
| Add secrets | Settings → Secrets and variables → Actions |
| View logs | Actions → Click any run → Click job → Click step |
| Download results | Scroll to Artifacts at bottom of run page |
| Change schedule | Edit `.github/workflows/daily-automation.yml` line 7 |
| Test locally | `npm run dev` and check for new posts |

---

**Questions?** Check the main [README.md](README.md) or review the workflow file comments!
