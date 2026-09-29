# COAL AI API Contract v1

This contract keeps the frontend independent from AppDeploy, Render, or any single host.

## Session and auth
- `GET /api/me` — current user authorization and role
- `GET /api/auth/google` — begin Google sign-in
- `POST /api/auth/logout` — end session
- `POST /api/invites/:code/join` — accept invite

## Dashboard
- `GET /api/demo-dashboard` — public demo dashboard
- `GET /api/dashboard` — authenticated dashboard
- `GET /api/daily-brief` — AI daily operational brief

## Fleet records
All list endpoints return `{ items: [] }`. Create endpoints accept JSON and return a success message plus created record where available.
- `GET|POST /api/vehicles`
- `GET|POST /api/trips`
- `GET|POST /api/fuel`
- `GET|POST /api/maintenance`
- `GET|POST /api/tires`
- `GET|POST /api/drivers`
- `GET|POST /api/documents`

## AI and voice
- `POST /api/ai-manager` — body `{ question }`; returns `{ answer }`
- `POST /api/stt` — speech-to-text
- `POST /api/tts` — text-to-speech; browser fallback must remain available

## Admin
- `GET /api/admin/access-log`
- `GET /api/admin/user-data-summary`
- `POST /api/admin/invites`
- `POST /api/admin/roles`

## Required security rules
1. Real records are always scoped by authenticated `user_id`/company ownership.
2. Guest users can access demo data only.
3. Admin endpoints require server-side admin authorization.
4. Role checks are server-side; hiding UI controls is not authorization.
5. No production record is deleted or overwritten during migration.
6. AI responses must distinguish real registered data from demo data.
7. Secrets never live in frontend source or GitHub.

## Compatibility
Frontend uses a configurable `API_BASE`. A replacement backend is compatible when it implements this contract, regardless of hosting provider.
