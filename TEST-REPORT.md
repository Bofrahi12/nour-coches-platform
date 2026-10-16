# TEST REPORT — 2026-10-16 21:12 +00 — local run (Node v24.20.0) + demo-dataset revision

```
PASS - Unauthenticated admin API rejected (401) · 401
PASS - Wrong password rejected (401) · 401
PASS - Admin login works · admin@nourcoches.ma
PASS - Demo stats: 12 vehicles total · {'total': 12, 'AVAILABLE': 6, 'RESERVED': 3, 'RENTED': 2, 'MAINTENANCE': 1, 'UNAVAILABLE': 0}
PASS - Demo stats: 2 RENTED (active bookings now) · {'total': 12, 'AVAILABLE': 6, 'RESERVED': 3, 'RENTED': 2, 'MAINTENANCE': 1, 'UNAVAILABLE': 0}
PASS - Demo stats: 3 RESERVED (future confirmed) · {'total': 12, 'AVAILABLE': 6, 'RESERVED': 3, 'RENTED': 2, 'MAINTENANCE': 1, 'UNAVAILABLE': 0}
PASS - Demo stats: 1 MAINTENANCE (Tucson window) · {'total': 12, 'AVAILABLE': 6, 'RESERVED': 3, 'RENTED': 2, 'MAINTENANCE': 1, 'UNAVAILABLE': 0}
PASS - Demo stats: overdue alert present (Golf) · [{'ref': 'NC-DEMO-103', 'return_at': '2026-10-15T10:00', 'customer_name': 'Sara Amrani (démo)', 'phone': '0600000013', 'brand': 'Volkswagen', 'model': 'Golf'}]
PASS - Demo customers are fictional (démo) · 6
PASS - Add Mercedes vehicle (201) · {'uid': 'NCV-0013', 'id': 13}
PASS - Set daily price via PUT 
PASS - Mercedes published & AVAILABLE publicly · [{'uid': 'NCV-0013', 'brand': 'Mercedes-Benz', 'model': 'Classe G', 'trim': '63 AMG', 'year': 2024, 'category': 'SUV Premium', 'transmission': 'Automatique', 'fuel': 'Essence', 'seats': 5, 'doors': 5, 'photos': ['/assets/hero-poster.webp'], 'description': 'Véhicule de test du workflow.', 'price_day': 1500, 'price_week': 9000, 'price_month': 30000, 'deposit': 20000, 'status': 'AVAILABLE', 'status_detail': 'Prêt à louer', 'available_for_range': None, 'quote': None}]
PASS - Public API does not leak plate/documents 
PASS - Customer booking created · {'ref': 'NC-2026-50896', 'status': 'pending', 'days': 3, 'total': 4590, 'deposit_due': 20000, 'vehicle': 'Mercedes-Benz Classe G', 'price_parts': '3 j', 'extras': [{'name': 'GPS', 'price': 30}], 'conflict_warning': None}
PASS - Booking is pending in manual mode · pending
PASS - Total = 3 days x 1500 + GPS 3x30 = 4590 · 4590
PASS - Availability API: pending does not block yet (request mode) 
PASS - Second overlapping request accepted as pending 
PASS - Admin confirms booking 1 · confirmed
PASS - Availability API: confirmed booking blocks overlapping range 
PASS - Confirming overlapping booking 2 -> 409 conflict · {'error': 'conflict', 'detail': 'Chevauchement avec la réservation NC-2026-50896'}
PASS - Auto mode: overlapping public booking -> 409 · {'error': 'not_available', 'detail': 'Chevauchement avec la réservation NC-2026-50896'}
PASS - Pickup sets booking active · active
PASS - Extension accepted, total 5 days = 5x1500 + GPS 5x30 = 7650 · {'ok': True, 'days': 5, 'total': 7650}
PASS - Completion sets booking completed + deposit returned · {'id': 9, 'ref': 'NC-2026-50896', 'vehicle_id': 13, 'customer_name': 'Client Test', 'phone': '0612345678', 'email': 'client@test.ma', 'pickup_at': '2026-10-23T10:00', 'return_at': '2026-10-28T10:00', 'location': 'Aéroport Ibn Battouta', 'extras': '[{"name":"GPS","price":30}]', 'days': 5, 'total': 7650, 'deposit_due': 20000, 'deposit_status': 'returned', 'status': 'completed', 'notes': '', 'created_at': '2026-10-16T21:12:02.580Z', 'updated_at': '2026-10-16T21:12:03.037Z'}
PASS - Vehicle live status back to AVAILABLE/RESERVED after completion · {'status': 'AVAILABLE', 'detail': 'Prêt à louer'}
PASS - Cancel booking 2 
PASS - Maintenance window created · {'id': 4}
PASS - Booking over maintenance window -> 409 · {'error': 'not_available', 'detail': 'Maintenance planifiée : Vidange test'}
PASS - Maintenance window deleted 
PASS - Vehicle with booking history cannot be deleted (409 has_history) · {'error': 'has_history', 'detail': 'Ce véhicule a un historique de 2 réservation(s) — dépubliez-le (Publié = Non) au lieu de le supprimer, pour préserver les dossiers clients.'}
PASS - Test vehicle unpublished (cleanup) 
PASS - Unpublished vehicle hidden from public fleet 
PASS - Reset demo data works · {'ok': True, 'detail': 'Données de démonstration restaurées. Configuration et compte admin inchangés.'}
PASS - After reset: still logged in + 12 vehicles + 2 rented · {'total': 12, 'AVAILABLE': 6, 'RESERVED': 3, 'RENTED': 2, 'MAINTENANCE': 1, 'UNAVAILABLE': 0}
PASS - After reset: workflow-test Mercedes is gone 
PASS - After reset: canonical demo bookings present · ['NC-DEMO-101', 'NC-DEMO-102', 'NC-DEMO-103', 'NC-DEMO-104']
PASS - Change admin password · {'ok': True}
PASS - Old password no longer works · 401
PASS - New password works · 200

40/40 checks passed
```

## Live demo verification — https://nour-coches.onrender.com (2026-10-16, after demo-dataset revision, commit 8c3d031)
- Demo banner present on the public home page; admin shows the DÉMO badge.
- Public API statuses == admin dashboard counts: 12 vehicles → 6 AVAILABLE, 3 RESERVED, 2 RENTED, 1 MAINTENANCE; 1 overdue alert (Golf, NC-DEMO-103).
- Presentation journey on production: public booking on NCV-0006 Duster (2 days + GPS = 660 MAD) → pending, visible in admin → confirm → vehicle RESERVED with the booking ref → cancel → POST /api/admin/reset-demo → canonical dataset restored (8 bookings, test booking gone, counts identical).
