# TEST REPORT — 2026-10-16 20:28 +00 — local run (Node v24.20.0, SQLite via node:sqlite)

```
PASS - Unauthenticated admin API rejected (401) · 401
PASS - Wrong password rejected (401) · 401
PASS - Admin login works · admin@nourcoches.ma
PASS - Add Mercedes vehicle (201) · {'uid': 'NCV-0013', 'id': 13}
PASS - Set daily price via PUT 
PASS - Mercedes published & AVAILABLE publicly · [{'uid': 'NCV-0013', 'brand': 'Mercedes-Benz', 'model': 'Classe G', 'trim': '63 AMG', 'year': 2024, 'category': 'SUV Premium', 'transmission': 'Automatique', 'fuel': 'Essence', 'seats': 5, 'doors': 5, 'photos': ['/assets/hero-poster.webp'], 'description': 'Véhicule de test du workflow.', 'price_day': 1500, 'price_week': 9000, 'price_month': 30000, 'deposit': 20000, 'status': 'AVAILABLE', 'status_detail': 'Prêt à louer', 'available_for_range': None, 'quote': None}]
PASS - Public API does not leak plate/documents 
PASS - Customer booking created · {'ref': 'NC-2026-72049', 'status': 'pending', 'days': 3, 'total': 4590, 'deposit_due': 20000, 'vehicle': 'Mercedes-Benz Classe G', 'price_parts': '3 j', 'extras': [{'name': 'GPS', 'price': 30}], 'conflict_warning': None}
PASS - Booking is pending in manual mode · pending
PASS - Total = 3 days x 1500 + GPS 3x30 = 4590 · 4590
PASS - Availability API: pending does not block yet (request mode) 
PASS - Second overlapping request accepted as pending 
PASS - Admin confirms booking 1 · confirmed
PASS - Availability API: confirmed booking blocks overlapping range 
PASS - Confirming overlapping booking 2 -> 409 conflict · {'error': 'conflict', 'detail': 'Chevauchement avec la réservation NC-2026-72049'}
PASS - Auto mode: overlapping public booking -> 409 · {'error': 'not_available', 'detail': 'Chevauchement avec la réservation NC-2026-72049'}
PASS - Pickup sets booking active · active
PASS - Extension accepted, total 5 days = 5x1500 + GPS 5x30 = 7650 · {'ok': True, 'days': 5, 'total': 7650}
PASS - Completion sets booking completed + deposit returned · {'id': 1, 'ref': 'NC-2026-72049', 'vehicle_id': 13, 'customer_name': 'Client Test', 'phone': '0612345678', 'email': 'client@test.ma', 'pickup_at': '2026-10-23T10:00', 'return_at': '2026-10-28T10:00', 'location': 'Aéroport Ibn Battouta', 'extras': '[{"name":"GPS","price":30}]', 'days': 5, 'total': 7650, 'deposit_due': 20000, 'deposit_status': 'returned', 'status': 'completed', 'notes': '', 'created_at': '2026-10-16T20:28:21.854Z', 'updated_at': '2026-10-16T20:28:22.178Z'}
PASS - Vehicle live status back to AVAILABLE/RESERVED after completion · {'status': 'AVAILABLE', 'detail': 'Prêt à louer'}
PASS - Cancel booking 2 
PASS - Maintenance window created · {'id': 1}
PASS - Booking over maintenance window -> 409 · {'error': 'not_available', 'detail': 'Maintenance planifiée : Vidange test'}
PASS - Maintenance window deleted 
PASS - Vehicle with booking history cannot be deleted (409 has_history) · {'error': 'has_history', 'detail': 'Ce véhicule a un historique de 2 réservation(s) — dépubliez-le (Publié = Non) au lieu de le supprimer, pour préserver les dossiers clients.'}
PASS - Test vehicle unpublished (cleanup) 
PASS - Unpublished vehicle hidden from public fleet 
PASS - Change admin password · {'ok': True}
PASS - Old password no longer works · 401
PASS - New password works · 200

30/30 checks passed
```
