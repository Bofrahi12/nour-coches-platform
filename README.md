# NOUR COCHES — Fleet Management & Booking Platform (CLIENT DEMO)

> **Demonstration environment.** All data is fictional sample data (vehicles with
> `DEMO-xxxx` plates, customers marked « (démo) », references `NC-DEMO-xxx`).
> No real bookings, payments or notifications are processed. Built by **VERTEX WEB**
> as a client presentation demo for NOUR COCHES (car rental, Jirari 1, Tangier).

- **Public site** (`/`): the agency's existing dark/gold branding, hero video (60 FPS
  Classe G), live fleet from the database, real availability per date range, filters
  (brand, transmission, fuel, seats, max price), instant price quotes (day/week/month
  best split), online booking with server-side double-booking protection, booking
  tracking by reference + phone, FR/AR toggle (RTL).
- **Admin** (`/admin`): fleet CRUD (each physical vehicle = its own record + calendar),
  live statuses (AVAILABLE / RESERVED / RENTED / MAINTENANCE / UNAVAILABLE), booking
  lifecycle (confirm → pickup → extend → complete, cancel), maintenance windows that
  block bookings, customers, revenue & utilization reports, notification log,
  settings (confirmation mode, WhatsApp number, SMTP, extras catalog).

## Stack
Zero-dependency Node.js ≥ 22 (`node:http`, `node:sqlite`, `node:crypto` scrypt).
No npm install needed — `node server.js` and it runs.

## Run locally
```bash
ADMIN_EMAIL=admin@nourcoches.ma ADMIN_PASSWORD='choose-a-strong-one' node server.js
# http://localhost:8932  ·  admin at /admin
```
The admin account is created on first boot from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
(if `ADMIN_PASSWORD` is omitted, a random one is printed once in the server log).
The password can later be changed from Admin → Paramètres.

## Configuration (Admin → Paramètres)
- `confirmation_mode`: `manual` (request → admin confirms) or `auto`
  (instant confirmation if the range is free). Availability is re-checked
  server-side at creation **and** at confirmation, inside a transaction.
- WhatsApp number: notifications prepare a wa.me deep link (honest model — a human
  sends it; nothing is claimed auto-sent). Email notifications are logged as
  `not_configured` until SMTP host/user are set.

## Demo data & reset
First boot seeds a coherent demo dataset: 12 demo vehicles (complete fictional
specs), 8 sample bookings (completed / active / overdue / confirmed / pending),
3 maintenance entries and matching notifications — every dashboard statistic is
computed from these records, so they always agree. Sample dates are relative to
the seed day, so the demo never looks stale.
**Reset:** Admin → Paramètres → « Réinitialiser les données de démo » restores the
canonical dataset. Settings and the admin account are never touched by a reset.
Credentials are provided only through environment variables — none exist in this
repository.

## Tests
```bash
ADMIN_EMAIL=admin@exemple.ma ADMIN_PASSWORD='…' node server.js &  # port 8932
NOUR_ADMIN_PASSWORD='…' python3 test/workflow-test.py http://localhost:8932
```
End-to-end checks: auth rejection, Mercedes add/price/publish, booking totals,
pending vs confirmed blocking, 409 on overlap (confirm-time and auto mode), pickup →
RENTED, extension repricing, completion → available, cancellation, maintenance
blocking, history preservation, demo-stat coherence, reset behaviour, password
change. See `TEST-REPORT.md`.

## Production note
SQLite lives on local disk (`data/nour.sqlite`). On hosts with an ephemeral
filesystem (e.g. Render free tier) the database resets on redeploy — for production,
run on a host with a persistent volume (Railway volume, Render paid disk, VPS)
or set `DB_PATH` to a mounted volume.
