# ✅ Automation Setup Checklist

Follow these steps IN ORDER to set up daily automation for Shanghai Discovery.

---

## 🎯 Prerequisites

- [ ] You have a GitHub account
- [ ] You have Claude API key (from Anthropic)
- [ ] You have Supabase project credentials
- [ ] Both scraper and main project work locally

---

## 📦 Step 1: Push Scraper to GitHub

**If your scraper is NOT on GitHub yet:**

```bash
cd ~/projects/xiaohongshu-scraper-test

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: MediaCrawler scraper for Shanghai Discovery"

# Create repo on GitHub (go to github.com → New repository)
# Name it: xiaohongshu-scraper-test
# Make it PRIVATE (contains scraper code)
# Don't initialize with README (we already have code)

# Add remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/xiaohongshu-scraper-test.git

# Push
git push -u origin main
```

**If scraper is already on GitHub:**
- [ ] Verify it's pushed: `git push`
- [ ] Note your repo URL: `https://github.com/YOUR_USERNAME/xiaohongshu-scraper-test`

---

## 📝 Step 2: Update Workflow File

1. Open: `.github/workflows/daily-automation.yml`

2. Find line 27 (around "Checkout scraper project")

3. Replace `YOUR_USERNAME` with your actual GitHub username:
   ```yaml
   repository: YOUR_ACTUAL_USERNAME/xiaohongshu-scraper-test
   ```

4. Save the file

---

## 🔐 Step 3: Add GitHub Secrets

**Go to:** `https://github.com/YOUR_USERNAME/shanghai-discovery/settings/secrets/actions`

**Add 3 secrets:**

### Secret 1: Anthropic API Key
- **Name:** `VITE_ANTHROPIC_API_KEY`
- **Value:** Your Claude API key (from https://console.anthropic.com)
- **Looks like:** `sk-ant-api03-...`
- Click **Add secret**

### Secret 2: Supabase URL
- **Name:** `VITE_SUPABASE_URL`
- **Value:** Your Supabase project URL
- **Looks like:** `https://abcdefghijk.supabase.co`
- **Where to find:** Supabase Dashboard → Project Settings → API
- Click **Add secret**

### Secret 3: Supabase Key
- **Name:** `VITE_SUPABASE_ANON_KEY`
- **Value:** Your Supabase anon/public key
- **Looks like:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Where to find:** Supabase Dashboard → Project Settings → API → anon/public key
- Click **Add secret**

**Verify:** You should see 3 secrets listed (values will be hidden)

---

## 🚀 Step 4: Push Workflow to GitHub

```bash
cd ~/projects/shanghai-discovery

# Add workflow file
git add .github/workflows/daily-automation.yml
git add README-automation.md
git add AUTOMATION-SETUP-CHECKLIST.md

# Commit
git commit -m "Add daily automation workflow"

# Push
git push
```

---

## ✅ Step 5: Test the Workflow

**Manual test run:**

1. Go to: `https://github.com/YOUR_USERNAME/shanghai-discovery/actions`

2. Click **"Daily Content Pipeline"** (left sidebar)

3. Click **"Run workflow"** dropdown (right side)

4. Click green **"Run workflow"** button

5. Wait ~15-30 minutes for it to complete

6. Click on the running workflow to watch logs in real-time

**What to check:**
- [ ] All steps should have green checkmarks ✅
- [ ] "Pipeline Summary" step shows accepted posts count
- [ ] No red error messages

---

## 🎉 Step 6: Verify It Worked

**Check Supabase:**

1. Go to Supabase Dashboard → Table Editor → Post table
2. You should see new posts added
3. Check Storage → post-images → You should see new images

**Check your app:**

```bash
npm run dev
```

1. Open http://localhost:5173
2. You should see the new posts with images
3. Test the image carousel

---

## 📅 Step 7: Confirm Schedule

The workflow is now set to run **daily at 2 AM UTC (10 AM Shanghai time)**.

**To change schedule:**
- Edit `.github/workflows/daily-automation.yml` line 7
- Use https://crontab.guru to generate cron expressions
- Commit and push changes

---

## 🐛 Troubleshooting

### Workflow doesn't appear in Actions tab
- **Fix:** Make sure `.github/workflows/daily-automation.yml` is in the repo
- **Check:** `git log --oneline` should show your commit
- **Verify:** `git push` was successful

### "No scraped data found" error
- **Fix:** Check scraper works locally first
- **Check:** Scraper config has `ENABLE_GET_MEDIAS = True`
- **Verify:** Scraper repo URL is correct in workflow

### "API key invalid" error
- **Fix:** Double-check secrets are named EXACTLY as shown above
- **Check:** No extra spaces in secret values
- **Verify:** Keys are from correct environment (not test keys)

### Workflow runs but no posts added
- **Check:** Look at "Pipeline Summary" step
- **Review:** Filter criteria might be too strict
- **Check:** Supabase credentials are correct

---

## 📚 Next Steps

- [ ] Read full documentation: [README-automation.md](README-automation.md)
- [ ] Set up failure notifications (optional)
- [ ] Monitor first few runs to ensure everything works
- [ ] Adjust scraper keywords/filters as needed

---

## ✨ You're Done!

Your Shanghai Discovery app now updates automatically every day! 🎉

**What happens next:**
- Every day at 2 AM UTC, the pipeline runs
- New posts are scraped, filtered, translated, and uploaded
- Your app gets fresh content without manual work
- You can check progress in GitHub Actions tab

**Enjoy your automated content pipeline!** 🚀
