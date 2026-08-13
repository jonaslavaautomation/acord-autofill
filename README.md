# ACORD Auto-Fill

Paste a client's/insured's email — or drop in the policy's Declaration Page PDF — and the app reads it and fills your ACORD forms for you, then you download filled PDFs (individually or as one combined packet). No box-by-box typing.

It runs as a static site plus **one serverless function** (`/api/extract`) that talks to the Groq API. The API key lives on the server, never in the browser. PDF text extraction and OCR run entirely client-side (pdf.js + Tesseract.js) — only the extracted text is ever sent to `/api/extract`.

## Forms included

| Form | Title | How it fills |
|------|-------|--------------|
| ACORD 25 | Certificate of Liability Insurance | real form fields |
| ACORD 70 | Personal Policy Change Request (Except Auto) | real form fields |
| ACORD 126 | Commercial General Liability | real form fields |
| ACORD 140 | Property Section | real form fields |
| ACORD 35 | Cancellation Request / Policy Release | real form fields + text overlay† |
| ACORD 28 | Evidence of Commercial Property | text overlay* |
| ACORD 127 | Business Auto Section | text overlay* |
| ACORD 130 | Workers Compensation Application | text overlay* |
| ACORD 71 | Personal Auto Policy Change Request | text overlay* |

\* These four PDFs are flat scans with no fillable fields, so the app **prints** your data onto them at fixed positions. This reliably fills the header fields a request email contains (agency, insured, policy #, dates, carrier, limits, location). It does **not** fill the big repeating tables (driver/vehicle schedules, WC class-code tables). To make any of these true fillable forms, replace the file in `templates/` with a genuinely fillable (non-scanned) copy and add its field names to `CROSSWALK` in `app.js`.

† ACORD 35 is mostly real AcroForm fields (policy #, dates, NAIC code, policy type, remarks, etc.), but its Producer / Company / Insured "name and address" boxes have no field behind them at all in the source PDF — those three boxes are filled the overlay way instead. `fillForm()` in `app.js` runs both passes for a form when both `CROSSWALK` and `OVERLAY` entries exist for it.

## Declaration Page upload

"Step 1B" lets you drop a policy Dec Page PDF (drag-and-drop or click to browse) instead of, or alongside, pasting an email:

1. **Text extraction** — [pdf.js](https://mozilla.github.io/pdf.js/) reads each page's real text layer, client-side.
2. **OCR fallback** — any page whose text layer is too short to be useful (i.e. it's a scan or photo, not a digital PDF) is rendered to a canvas and OCR'd with [Tesseract.js](https://github.com/naptha/tesseract.js), also client-side. Nothing but the extracted text ever leaves the browser.
3. **AI extraction** — the combined per-page text is sent to `/api/extract` with a Dec-Page-specific prompt (`decPageSystemPrompt()` in `app.js`) that asks only for the keys this app already has a home for (see below), plus a one-line `_docType` guess (e.g. "Commercial Auto", "General Liability") shown in the status message.
4. **Merge into Step 2** — extracted values fill empty fields and get a blue **from dec page** badge. A value you already typed by hand, or that came from your saved agency, is never overwritten — only blanks and previously-auto-filled fields are.

**Request → form detection.** Step 1's "Read email & fill" also runs `classifyForms()` against the pasted text — a deterministic, client-side matcher (no extra AI call) that checks for an explicit "ACORD 25"-style mention first, then falls back to phrasing (e.g. "COI" → 25, "cancel" → 35, "workers comp" → 130, "commercial auto" → 127). A match replaces the Step 3 checkboxes so extraction, the Step 2 dashboard, and the download all scope to the form(s) the request actually needs — reusing the same `activeKeys()`/`formKeysFor()` mechanism the manual checkboxes already drive. If nothing matches, your current checkboxes are left alone.

**Missing-fields banner.** Step 2 shows a red banner listing any *required* field (the ones marked `full` in `REQUEST_SECTIONS`, e.g. Named Insured, Certificate holder) that the checked form(s) need but don't have yet — it updates live as you fill things in, from either source.

**Scope of what a Dec Page can fill.** The extraction schema is deliberately limited to the keys the 8 forms above already use — producer/insured/carrier info, policy number/dates, GL limits, building square footage, cancellation fields. A Homeowners or Auto Dec Page will still detect correctly (`_docType`) and fill whatever overlapping fields it has (named insured, carrier, policy #, dates), but this version does **not** extract or store dwelling Coverage A–F, vehicle schedules, or WC class codes/payroll — there's no ACORD form in this app yet that would use them (ACORD 80 and 27 aren't built), and a schema field with nowhere to go is worse than not collecting it. Adding either of those forms means the same from-scratch PDF field verification ACORD 35 required (see the comments in `CROSSWALK`/`OVERLAY` in `app.js`) — a natural next step, not done here.

OCR also spins up a fresh Tesseract worker per scanned page (simplest to build, correct, but slower than a persistent worker) — expect a real pause on multi-page scans, and expect it to struggle the way any OCR does on low-quality photos/faxes.

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

3. **Add your Groq API key.** In Vercel → your project → *Settings → Environment Variables*, add:
   - `GROQ_API_KEY` = your free key from https://console.groq.com/keys
   - (optional) `GROQ_MODEL` = `llama-3.3-70b-versatile`

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
- **Dec Page reading** is done in the browser with [pdf.js](https://mozilla.github.io/pdf.js/) (text layer) and [Tesseract.js](https://github.com/naptha/tesseract.js) (OCR fallback for scans) — see "Declaration Page upload" above.
- **Extraction**: the browser posts extracted text (pasted email or Dec Page text) to `/api/extract`, which calls Groq server-side and returns structured JSON that populates the form for your review.
- **Saved data** (your agency, saved requests) is stored in the browser via `localStorage` — nothing is sent anywhere except the text submitted for extraction.

## Privacy note

The only data that leaves the browser is the request text you paste, or the text extracted from an uploaded Dec Page PDF (sent to Groq through your serverless function for extraction). The PDF file itself, and any OCR of it, never leaves the browser. Filled PDFs are generated entirely in the browser.
