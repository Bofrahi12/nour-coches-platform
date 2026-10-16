# Audit — existing project (2026-10-16)

## What exists today
- `demo-nour.html` (in the mounir-web repo, GitHub Pages): a single static HTML page.
  Dark/gold branding (Cairo + Archivo), French copy, hero with the owner's 60 FPS
  Classe G video in a 3D stage, fleet grid, services, sales, steps, FAQ, contact.
- A client-side *simulated* booking form (added 2026-10-16): per-car availability is a
  hardcoded offset table in JavaScript, prices are computed in the browser, and the
  "confirmation" is a WhatsApp deep link. Nothing is stored anywhere.
- Assets: hero video (60 FPS), poster, 14 fleet photos (same-model photos, demo use).

## What is missing (per the upgrade spec)
- No framework, no server, no database, no authentication, no admin area.
- No real vehicle records (no plates, years, deposits, documents), no per-vehicle calendar.
- No server-side availability validation; double bookings are possible by design.
- No booking persistence, no statuses, no notifications, no reports.
- Fleet data = 12 models verified from the agency's own posts; per-unit data
  (plates, exact prices) was never verified — it must be completed by the admin,
  and is flagged as such in the new dashboard (never presented as real inventory).

## Decision
Keep the static page live as the showcase (it is the approved design), and build the
platform as a zero-dependency Node.js + SQLite application in this project, reusing
the exact branding, assets and fleet content. Public site and admin are served by
the same app; the database is the single source of truth for availability.
