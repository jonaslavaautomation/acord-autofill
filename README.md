# ACORD Auto-Fill

Paste a client's/insured's email, and the app reads it and fills your ACORD forms for you — then you download filled PDFs (individually or as one combined packet). No box-by-box typing.

It runs as a static site plus **one serverless function** (`/api/extract`) that talks to the Anthropic API. The API key lives on the server, never in the browser.

## Forms included

| Form | Title | How it fills |
|------|-------|--------------|
| ACORD 25 | Certificate of Liability Insurance | real form fields |
| ACORD 70 | Personal Policy Change Request (Except Auto) | real form fields |
| ACORD 126 | Commercial General Liability | real form fields |
| ACORD 140 | Property Section | real form fields |
| ACORD 28 | Evidence of Commercial Property | text overlay* |
| ACORD 127 | Business Auto Section | text overlay* |
| ACORD 130 | Workers Compensation Application | text overlay* |
| ACORD 71 | Personal Auto Policy Change Request | text overlay* |

\* These four PDFs are flat scans with no fillable fields, so the app **prints** your data onto them at fixed positions. This reliably fills the header fields a request email contains (agency, insured, policy #, dates, carrier, limits, location). It does **not** fill the big repeating tables (driver/vehicle schedules, WC class-code tables). To make any of these true fillable forms, replace the file in `templates/` with a genuinely fillable (non-scanned) copy and add its field names to `CROSSWALK` in `app.js`.

## Deploy to GitHub + Vercel

1. **Create a GitHub repo and push this folder.**
   ```bash
   git init
   git add .
   git commit -m "ACORD Auto-Fill"
   git branch -M main
   git remote add origin https://github.com/<you>/acord-autofill.git
   git push -u origin main
   ```

2. **Import into Vercel.** Go to vercel.com → *Add New… → Project* → import the repo. No framework, no build command needed — Vercel serves the static files and runs `api/extract.js` automatically.

3. **Add your Anthropic API key.** In Vercel → your project → *Settings → Environment Variables*, add:
   - `ANTHROPIC_API_KEY` = your key from https://console.anthropic.com
   - (optional) `ANTHROPIC_MODEL` = `claude-sonnet-5`

   Then **Deploy** (or redeploy so the variable takes effect). That's it.

## Run locally

```bash
npm i -g vercel      # once
cp .env.example .env # then put your real key in .env
vercel dev           # serves the site + the /api function at http://localhost:3000
```
Opening `index.html` directly (file://) will show the UI but the **Read email & fill** button won't work, because it needs the `/api/extract` function — use `vercel dev`.

## How it works

- **Templates** live in `templates/*.pdf` and are fetched in the browser.
- **Filling** is done in the browser with [pdf-lib](https://pdf-lib.js.org/): real fields via `getTextField().setText()`, flat forms via `page.drawText()` at measured coordinates.
- **Extraction**: the browser posts the pasted text to `/api/extract`, which calls Anthropic server-side and returns structured JSON that populates the form for your review.
- **Saved data** (your agency, saved requests) is stored in the browser via `localStorage` — nothing is sent anywhere except the email text you submit for extraction.

## Privacy note

The only data that leaves the browser is the request text you paste (sent to Anthropic through your serverless function for extraction). Filled PDFs are generated entirely in the browser.
