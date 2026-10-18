# Reservation page

Approved: package comparison first, then an email inquiry; direct build in the existing website style. Target: public/reservations.html. Mode: Operate with offer comparison. Mobile-first; existing identity remains authoritative.

## Direction contract
THESIS: Compare actual event packages and prepare a clear inquiry, never imply an available or confirmed booking.
OWN-WORLD: Existing cream page, navy type, burgundy actions, Georgia headings and native accessible controls; no replacement brand.
STORY: Choose an event family, compare published guest tiers and inclusions, review exclusions, then describe the event in a reviewable email draft.
FIRST VIEWPORT: Back-to-menu navigation, Reservations heading, inquiry-only disclosure, event-family selector and first published package. No artificial venue photograph or fabricated promotion.
FORM: User-pinned package-first comparison, code-led. No concept-seed tournament: the user specified the layout and task. Helper context is unavailable in this session; records are read directly.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Source and accuracy
Nine brochures from user folder 1Yd6KP-LgFQZj2AkO332wliZ_gYtzRj42, read on 2026-10-18. Original JPGs copied unchanged to public/assets/reservations; these files are sourced, not AI-generated.
H1Pv7jSx: Wedding. DPy70EKD: Basic Debut. TrciN1e6: Standard Debut. 383mNyuz: Premium Debut. uoRaVwy_: Basic general event. Q3xs--ZO: Standard general event. C6Ki59nC: Premium general event. venueRentalRates1: venue rates/inclusions. venueRentalRates2: à-la-carte services.
Events Hall capacities conflict (70 versus 70–80); use conservative 70 in summary and disclose discrepancy. Wedding prices are per guest at fixed listed counts, not package totals. Brochures do not state validity dates or booking/cancellation/deposit policies; none invented. Package-host/add-on rates and à-la-carte rates differ, so do not combine or calculate a final quote. Promo venue rate remains a published brochure rate requiring confirmation.
Email inquiry only: no database or server writes. Form values stay in memory, not local/session storage or analytics. Mailto draft and selectable text fallback; opening an email app is not sending. No automatic submission or payment.

## Completion and evidence — 2026-10-18

Implemented the public package-first comparison and reviewable manual email inquiry in `public/reservations.html`, `public/reservations.css`, `public/js/reservation-offers.js` and `public/js/pages/reservations.js`. Cream surfaces, navy text, burgundy actions, Georgia headings and native controls extend the incumbent design; `DESIGN.md` is preserved and no design sidecar was generated. The nine unchanged local brochure JPGs retain the provenance above.

The full finish review identified one P2: Premium Debut's food heading incorrectly said “Beef or pork.” It now says “Beef”; the verdict resolved that finding with a ship disposition for this scoped addition, not whole-production approval. All 139 tests passed before the heading correction; all four reservation tests passed after it. Browser checks at 1440px desktop and 390px mobile covered family filtering, package selection prefill and preparing a synthetic manual draft, with no horizontal overflow at 390px. Captures are in `.impeccable/review/reservations-*.png`. No email was sent. Real-device verification is not established by these browser checks.

The detector was attempted but could not run because engine 0.1.5 was missing and cache access was denied; this is unavailable detector evidence, not a clean result. No server writes, Supabase changes, live booking, deposits or deployment were performed.
