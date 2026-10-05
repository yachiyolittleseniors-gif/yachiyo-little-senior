# Month-specific duty roster integration

The target grades are `image.table.grades` for the **requested roster month**.
There is no April/June/July cutoff. Uploading a future two-grade roster does not
remove third-year families from an earlier three-grade roster's request list.

- Candidate names come from the authenticated guardian roster, one entry per
  grade and normalized household name. Parents are merged; distinguishing name
  suffixes are preserved. A household need not be assigned in the current month.
- New draft creation offers automatic inheritance / two grades / three grades.
  Inheritance uses the target month's table or the nearest earlier non-test table,
  never a future table. Without prior metadata it defaults to `[2,1]`.
- Image review explicitly confirms two/three grades and column order, then
  validates four/six names per row. OCR remains advisory; the administrator must
  confirm the table. Existing originals and stored records are not migrated.
- Table display, generated images, source-slot verification, and server save
  validation all handle `2 + grades.length * 2` row entries.
- Replacement requests check the target grade on submit, LINE-resume submit, and
  approval. Existing LINE identity and token flows are unchanged.

## Build and local development

Run `node netlify/prepare-duty-grades.mjs` before serving this repository locally.
It integrates `netlify/duty-grade-policy.cjs` into the existing browser/server
adapters and copies the same pure rules to `duty-grade-policy.js` for the browser.
It also versions the three changed browser assets. The original adapter sources
remain readable in Git; their month-grade integration is explicitly maintained
in `prepare-duty-grades.mjs`. Do not run the unprepared legacy source directly.

The Netlify command runs the integration, the duty-grade regression suite and the
existing CSP suite, then the existing CSP synchronizer. All anchor replacements
are counted, all generated JS is syntax-checked, and a mismatch fails the build
rather than publishing a partially changed site. Integration is idempotent.

When moving these adapters to native month-grade implementations, remove the
corresponding transformation and keep the regression tests; do not silently
relax source-anchor assertions. No build step connects to production storage.
