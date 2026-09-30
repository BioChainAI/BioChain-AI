# database_migrations/

Numbered SQLite migrations for the orchestrator's local store (profiles,
sessions, biofeedback, events, node positions, consent, bridge receipts).

* Filenames `NNNN_description.sql` are applied in order. Each one is recorded in
  `schema_migrations` and never re-run.
* The orchestrator applies pending migrations at startup (`store.py` imports
  `migrate.apply`). You can also run them by hand:
  `python3 deploy/database_migrations/migrate.py --db cocoon.db --status`.
* **Never edit an applied migration.** Add a new file instead.
* Biometric data is sensitive health data. Migrations must not copy raw
  `biofeedback` rows anywhere else; exports go through the receipt (digests only).
