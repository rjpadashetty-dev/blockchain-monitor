# Shared Production Data Setup

Local and Render use the same data only when both backend services have the same hosted PostgreSQL `DATABASE_URL`.

## 1. Create one hosted PostgreSQL database

Use Render PostgreSQL, Neon, Supabase, or another managed PostgreSQL provider. Keep the connection string private.

## 2. Configure Render backend

Add these environment variables to the Render backend service:

```text
DATABASE_URL=<the hosted PostgreSQL connection string>
JWT_SECRET=<one stable random secret>
BLOCKCHAIN_RPC_URL=<Sepolia RPC URL>
BLOCKCHAIN_MODE=readonly
FRONTEND_URL=<your Render frontend URL>
```

On first startup, the backend creates the schema and imports users from `backend/db.json` if the database is empty. Do not delete the hosted database after migration.

## 3. Configure local backend

Copy `backend/.env.example` to `backend/.env` and set the same `DATABASE_URL`, `JWT_SECRET`, and `BLOCKCHAIN_RPC_URL` values used on Render. Start the backend normally. It will use PostgreSQL instead of LowDB.

## 4. Blockchain mode

`readonly` enables live chain status and transaction lookup without server-side private keys. `custodial` enables native testnet transfers using `BLOCKCHAIN_PRIVATE_KEY`; use only a disposable funded testnet wallet and never commit that key.

## 5. Monitoring

Prometheus can scrape:

```text
http://backend:5000/api/metrics
```

Socket.IO sends `security:high-risk-transaction`, `cicd:pipeline-failed`, `support:new-request`, and `service:down` events to connected dashboards.