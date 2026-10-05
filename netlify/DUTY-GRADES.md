# Month-specific duty roster grades

The target grades are `image.table.grades` for the **requested roster month**.
There is no April/June/July cutoff. Uploading a future two-grade roster does not
remove third-year families from an earlier three-grade roster's request list.

## Operation

- Replacement candidate names come from the authenticated guardian roster, one
  entry per grade and normalized household name. Fathers and mothers are merged;
  distinguishing name suffixes are preserved. The household does not have to be
  assigned a duty in the current month. The source household is excluded even
  when the roster uses parentheses and the guardian list does not.
- New draft creation offers automatic inheritance / two grades / three grades.
  Inheritance uses the target month's table or the nearest earlier non-test
  table, never a future table. Without prior metadata it defaults to `[2,1]`.
  Choose three grades explicitly for the first three-grade month, then confirm
  the draft. A change to two grades works the same way; no season dates are set.
- Image review confirms two/three grades and left-to-right column order, then
  validates four/six names per day. OCR is advisory: the administrator must
  check the image and approve the parsed table before it is saved.
- Display, generated images, source-slot verification, and server save validation
  all handle `2 + grades.length * 2` row entries. Two-grade layouts retain their
  original column widths. Three-grade tables can scroll horizontally on phones.
- Replacement requests check the target grade on submit, LINE-resume submit and
  approval. Existing LINE identity and token flows remain in place.
- Existing saved originals, changes, pending requests and guardian data are not
  rewritten or migrated by deployment. Read failures do not publish the guardian
  catalog outside the authenticated endpoint.

## Source and tests

The checked-in `board.html`, `board-duty-roster.js`, `board-duty-auto-test.js`,
`duty-image-reader.js`, `netlify/functions/site-data.mjs` and
`netlify/functions/duty-change-requests.mjs` are the canonical runnable sources.
No source-rewriting step is required to build or serve the site.

`netlify/duty-grade-policy.cjs` and the identical `duty-grade-policy.js` hold the
pure month and family rules for the server and browser. Keep the files identical.
`netlify/prepare-duty-grades.mjs` is a retained, idempotent migration utility used
once to integrate the legacy snapshot, and its bounded transformations are
covered by tests. It is not part of the production build command. Make subsequent
changes in the canonical source files rather than adding runtime patch layers.

Run:

    node --test tests/duty-grades.test.mjs tests/home-csp.test.mjs

The 24 duty tests include actual table rendering, source-slot verification,
server table validation, simulated approval persistence, target-month switching,
legacy compatibility, household deduplication and self-selection prevention.
The additional existing CSP tests remain enabled. The read-only Actions workflow
also checks syntax and that the browser/server policy copies are byte-identical.
Netlify runs the regression tests before its existing CSP synchronization step.

Tests use synthetic local objects, never production storage or real LINE accounts.
A successful automated run is not an end-to-end test of LINE authentication or
OCR on a real user's phone.
