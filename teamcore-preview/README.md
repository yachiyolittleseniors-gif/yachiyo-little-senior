# TEAM CORE isolated UI preview

PREVIEW ONLY. DO NOT MERGE INTO MAIN.

The user's approved conversation prototype is deployed at a separate Netlify Deploy Preview URL. The production main branch is not modified.

## Isolation

- Only the generated `public` directory is published.
- The Functions directory is deliberately empty. No production API, LINE integration, authentication, member data, or storage is deployed.
- All names, schedules, rosters and scores are samples. Input remains in this browser only.
- A restrictive CSP disables connections, workers, frames and form submissions.
- The only external application link is the explicit public-homepage link, opened in a new tab.
- The build refuses the `production` context or `main` branch.

## Reproduce the prototype

The supplied HTML is packaged as three consecutive Brotli binary chunks to transfer the original artifact without hand-editing its UI code. This is data compression, not encryption. `build.mjs` concatenates and decompresses them with Node's built-in zlib, checks the exact SHA-256 of the complete source, and writes the readable HTML to `public/index.html`. No downloads or dependencies are used by this build.

From this directory run `node build.mjs`. Read/edit the decompressed HTML for subsequent development rather than editing binary chunks. Source SHA-256: `63b8c4c39ce201566f0f52974db91f594df1c3174acdfd91331c4e3769f6aded`.

Changes from the conversation file: the page title identifies the separate-URL preview and two explanatory strings now say the production branch remains unchanged (the preview branch has been added).

## Local checks

Chromium at 375x667 and 390x844: initial home, attendance-to-home count update, sample duty-swap request and simulated approval, score input, official-homepage link, no horizontal document overflow, zero uncaught page errors and zero outgoing requests during those interactions. Tests rendered the supplied document directly; this is not a claim of testing physical iPhones or real Face ID / LINE.
