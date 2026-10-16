#!/usr/bin/env python3
"""E2E workflow test — NOUR COCHES platform (mirrors the 9 steps in the spec)."""
import json, sys, urllib.request, urllib.error, http.cookiejar
from datetime import datetime, timedelta

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8932'
ADMIN_EMAIL, ADMIN_PASS = 'admin@nourcoches.ma', 'NourAdmin!2026'
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS' if cond else 'FAIL'), '-', name, ('· ' + str(detail) if detail else ''))

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
plain = urllib.request.build_opener()

def call(op, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={'Content-Type': 'application/json'})
    try:
        with op.open(req) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or '{}')
        except Exception: return e.code, {}

def d(days, hour=10):
    t = datetime.now() + timedelta(days=days)
    return t.strftime('%Y-%m-%dT%H:%M').replace(t.strftime('%H:%M'), f'{hour:02d}:00')

P1, R1 = d(7), d(10)          # booking 1: 3 days
P2, R2 = d(8), d(9)           # overlapping booking 2
EXT = d(12)                    # extension target: 5 days total

# 0. unauthorized access must fail
code, _ = call(plain, 'GET', '/api/admin/stats')
check('Unauthenticated admin API rejected (401)', code == 401, code)
code, _ = call(plain, 'POST', '/api/auth/login', {'email': ADMIN_EMAIL, 'password': 'wrong-pass'})
check('Wrong password rejected (401)', code == 401, code)

# login
code, r = call(opener, 'POST', '/api/auth/login', {'email': ADMIN_EMAIL, 'password': ADMIN_PASS})
check('Admin login works', code == 200, r.get('email'))

# 1-3. Add Mercedes, set price, publish
code, r = call(opener, 'POST', '/api/admin/vehicles', {
    'brand': 'Mercedes-Benz', 'model': 'Classe G', 'trim': '63 AMG', 'year': 2024,
    'plate': 'TEST-2026-MA', 'category': 'SUV Premium', 'transmission': 'Automatique',
    'fuel': 'Essence', 'seats': 5, 'doors': 5, 'price_day': 1500, 'price_week': 9000,
    'price_month': 30000, 'deposit': 20000, 'is_published': True,
    'photos': ['/assets/hero-poster.webp'], 'description': 'Véhicule de test du workflow.'})
check('Add Mercedes vehicle (201)', code == 201, r)
uid = r.get('uid')
vid = r.get('id')
code, r = call(opener, 'PUT', f'/api/admin/vehicles/{vid}', {'price_day': 1500})
check('Set daily price via PUT', code == 200)
code, r = call(plain, 'GET', '/api/vehicles')
merc = [v for v in r['vehicles'] if v['uid'] == uid]
check('Mercedes published & AVAILABLE publicly', len(merc) == 1 and merc[0]['status'] == 'AVAILABLE', merc)
check('Public API does not leak plate/documents', merc and 'plate' not in merc[0] and 'documents' not in merc[0])

# 4. Customer booking (manual mode -> pending)
cust = {'vehicle_uid': uid, 'pickup_at': P1, 'return_at': R1, 'location': 'Aéroport Ibn Battouta',
        'customer_name': 'Client Test', 'phone': '0612345678', 'email': 'client@test.ma', 'extras': ['GPS']}
code, b1 = call(plain, 'POST', '/api/bookings', cust)
check('Customer booking created', code == 201, b1)
check('Booking is pending in manual mode', b1.get('status') == 'pending', b1.get('status'))
check('Total = 3 days x 1500 + GPS 3x30 = 4590', b1.get('total') == 4590, b1.get('total'))
ref1 = b1.get('ref')

# 5. Double-booking protection
code, r = call(plain, 'GET', f'/api/vehicles?from={P2}&to={R2}')
m2 = [v for v in r['vehicles'] if v['uid'] == uid][0]
check('Availability API: pending does not block yet (request mode)', m2['available_for_range'] is True)
code, b2 = call(plain, 'POST', '/api/bookings', {**cust, 'pickup_at': P2, 'return_at': R2, 'customer_name': 'Client Deux', 'phone': '0698765432'})
ref2 = b2.get('ref')
check('Second overlapping request accepted as pending', code == 201 and b2.get('status') == 'pending')
code, lst = call(opener, 'GET', '/api/admin/bookings')
id1 = [b for b in lst['bookings'] if b['ref'] == ref1][0]['id']
id2 = [b for b in lst['bookings'] if b['ref'] == ref2][0]['id']
code, r = call(opener, 'POST', f'/api/admin/bookings/{id1}/confirm', {})
check('Admin confirms booking 1', code == 200, r.get('booking', {}).get('status'))
code, r = call(plain, 'GET', f'/api/vehicles?from={P2}&to={R2}')
m2 = [v for v in r['vehicles'] if v['uid'] == uid][0]
check('Availability API: confirmed booking blocks overlapping range', m2['available_for_range'] is False)
code, r = call(opener, 'POST', f'/api/admin/bookings/{id2}/confirm', {})
check('Confirming overlapping booking 2 -> 409 conflict', code == 409, r)
code, _ = call(opener, 'PUT', '/api/admin/settings', {'confirmation_mode': 'auto'})
code, r = call(plain, 'POST', '/api/bookings', {**cust, 'pickup_at': P2, 'return_at': R2, 'phone': '0655555555'})
check('Auto mode: overlapping public booking -> 409', code == 409, r)
code, _ = call(opener, 'PUT', '/api/admin/settings', {'confirmation_mode': 'manual'})

# 6. Pickup -> vehicle RENTED
code, r = call(opener, 'POST', f'/api/admin/bookings/{id1}/pickup', {})
check('Pickup sets booking active', code == 200 and r.get('booking', {}).get('status') == 'active', r.get('booking', {}).get('status'))

# 8a. Extension (while active), overlapping re-check + price recompute
code, r = call(opener, 'POST', f'/api/admin/bookings/{id1}/extend', {'new_return_at': EXT})
check('Extension accepted, total 5 days = 5x1500 + GPS 5x30 = 7650', code == 200 and r.get('total') == 7650, r)

# 7. Complete -> available again
code, r = call(opener, 'POST', f'/api/admin/bookings/{id1}/complete', {})
check('Completion sets booking completed + deposit returned', code == 200 and r.get('booking', {}).get('status') == 'completed' and r.get('booking', {}).get('deposit_status') == 'returned', r.get('booking'))
code, r = call(opener, 'GET', '/api/admin/vehicles')
mv = [v for v in r['vehicles'] if v['id'] == vid][0]
check('Vehicle live status back to AVAILABLE/RESERVED after completion', mv['live']['status'] in ('AVAILABLE', 'RESERVED'), mv['live'])

# 8b. Cancellation frees the range
code, r = call(opener, 'POST', f'/api/admin/bookings/{id2}/cancel', {})
check('Cancel booking 2', code == 200 and r.get('booking', {}).get('status') == 'cancelled')

# 8c. Maintenance window blocks bookings
code, r = call(opener, 'POST', '/api/admin/maintenance', {'vehicle_id': vid, 'title': 'Vidange test', 'starts_at': d(20), 'ends_at': d(22)})
check('Maintenance window created', code == 201, r)
mid = r.get('id')
code, _ = call(opener, 'PUT', '/api/admin/settings', {'confirmation_mode': 'auto'})
code, r = call(plain, 'POST', '/api/bookings', {**cust, 'pickup_at': d(20), 'return_at': d(21), 'phone': '0655555555'})
check('Booking over maintenance window -> 409', code == 409, r)
code, _ = call(opener, 'PUT', '/api/admin/settings', {'confirmation_mode': 'manual'})
code, _ = call(opener, 'DELETE', f'/api/admin/maintenance/{mid}')
check('Maintenance window deleted', code == 200)

# history preservation: a vehicle with bookings cannot be deleted — unpublish instead
code, r = call(opener, 'DELETE', f'/api/admin/vehicles/{vid}')
check('Vehicle with booking history cannot be deleted (409 has_history)', code == 409 and r.get('error') == 'has_history', r)
code, r = call(opener, 'PUT', f'/api/admin/vehicles/{vid}', {'is_published': False})
check('Test vehicle unpublished (cleanup)', code == 200)
code, r = call(plain, 'GET', '/api/vehicles')
check('Unpublished vehicle hidden from public fleet', all(v['uid'] != uid for v in r['vehicles']))

# 9. password change works and old password dies
code, r = call(opener, 'POST', '/api/admin/change-password', {'current_password': ADMIN_PASS, 'new_password': 'NewPass!2026'})
check('Change admin password', code == 200, r)
code, _ = call(plain, 'POST', '/api/auth/login', {'email': ADMIN_EMAIL, 'password': ADMIN_PASS})
check('Old password no longer works', code == 401, code)
code, _ = call(plain, 'POST', '/api/auth/login', {'email': ADMIN_EMAIL, 'password': 'NewPass!2026'})
check('New password works', code == 200, code)
call(opener, 'POST', '/api/admin/change-password', {'current_password': 'NewPass!2026', 'new_password': ADMIN_PASS})

fails = [n for n, ok, _ in results if not ok]
print()
print(f'{len(results) - len(fails)}/{len(results)} checks passed')
if fails:
    print('FAILURES:', fails); sys.exit(1)
