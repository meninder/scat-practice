# Google Apps Script Webhook Setup

This walkthrough will set up an automated email and logging system for SCAT practice attempts. Follow these steps in order.

## Step 1: Create a Google Sheet for the Log

1. Go to [Google Sheets](https://sheets.google.com)
2. Click **+ Create** (or start a new blank spreadsheet)
3. Name it **"SCAT Log"** and create it
4. Once the sheet opens, copy the **Sheet ID** from the URL:
   - Look at the URL: `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit...`
   - Copy everything between `/d/` and the next `/` — that's your Sheet ID
   - **Save this value** for Step 3

## Step 2: Set Up the Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **+ New project** in the left sidebar
3. Replace the default code in the editor with the contents of `Code.gs`
   - Option A (easier): Visit [https://github.com/meninder/scat-practice/blob/main/apps-script/Code.gs](https://github.com/meninder/scat-practice/blob/main/apps-script/Code.gs), copy all the code, and paste it into the editor
   - Option B: Copy from `apps-script/Code.gs` in the repository
4. Click **Save** (Ctrl+S or Cmd+S)

## Step 3: Add Script Properties

1. Click the **⚙️ Settings** icon (gear) in the left sidebar
2. Scroll down and click **Script properties**
3. Add the following properties as **rows** (click **Add row** for each):

### SCAT_TOKEN (required now)
- **Property**: `SCAT_TOKEN`
- **Value**: Generate a long random string
  - Open Terminal and run: `openssl rand -hex 16`
  - Copy the output and paste it as the value
  - **Save this value** — you'll need it in Step 5

### SHEET_ID (required now)
- **Property**: `SHEET_ID`
- **Value**: Paste the Sheet ID from Step 1

### GH_PAT and GH_REPO (can be added later in Task 10)
These are not needed yet and can be added later without redeploying:
- **Property**: `GH_REPO`
- **Value**: `meninder/scat-practice`

And when Task 10 is ready:
- **Property**: `GH_PAT`
- **Value**: A GitHub Personal Access Token (see instructions below)

### How to create a GitHub PAT (for later, Task 10):
If you need to add `GH_PAT` later:
1. Go to [github.com/settings/developer-settings/personal-access-tokens/fine-grained/new](https://github.com/settings/developer-settings/personal-access-tokens/fine-grained/new)
2. Set **Repository access** to **Only select repositories** → choose `meninder/scat-practice` only
3. Under **Repository permissions**, find **Contents** and set it to **Read and write**
4. Click **Generate token**
5. Copy the token and paste it as `GH_PAT` in Script Properties

## Step 4: Deploy as a Web App

1. At the top of the editor, click **Deploy** → **New deployment**
2. Click the **type** dropdown and select **Web app**
3. Set:
   - **Execute as**: (the account dropdown) → choose "Me" (your Google account)
   - **Who has access**: **Anyone**
4. Click **Deploy**
5. You'll see an authorization popup — click **Authorize** and select your account
6. After authorization, a confirmation appears with the **Web app URL**
7. **Copy the full URL** (it ends in `/exec`)
   - Example: `https://script.googleapis.com/macros/d/DEPLOYMENT_ID/userweb/exec`
   - **Save this URL** — you need it for the final step

## Step 5: Test and Share

Run this command in Terminal to test the webhook (replace placeholders):

```bash
curl -sL -X POST '<EXEC_URL>' \
  -H 'Content-Type: text/plain' \
  -d '{"token":"<TOKEN>","kid":"Test","level":"advanced","ts":1753200000000,"v":6,"q":7,"sec":540,"levels":{"v":2,"q":2},"leveledUp":[],"beaten":0,"misses":[],"lowTiers":[]}'
```

Replace:
- `<EXEC_URL>` with the Web app URL from Step 4
- `<TOKEN>` with the SCAT_TOKEN value from Step 3

**Expected results:**
- You should see: `{"ok":true,"dispatched":false}`
- An email arrives at meninder.purewal@gmail.com with the subject line starting with "SCAT: Test 13/16"
- A new row appears in your "SCAT Log" sheet with the test data

---

## Next Steps

- Once testing is complete, return to the chat with the Web app URL and SCAT_TOKEN value
- When Task 10 is ready, you'll add the GitHub token (`GH_PAT`) and the system will automatically generate new questions when the bank runs low
