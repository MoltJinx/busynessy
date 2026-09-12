# Nessie API quick reference

This folder contains the backend integration helper for [Nessie API v1](https://nessieisreal.com/docs).

## Run any endpoint

The CLI is intentionally generic: every documented Nessie route can be called without adding a new SDK method.

```bash
# Node.js 18+ (fetch is built in)
export NESSIE_API_KEY="your-key"
node backend/nessie-cli.mjs GET /customers
node backend/nessie-cli.mjs GET /customers/<customer_id>/accounts
node backend/nessie-cli.mjs GET /accounts/<account_id>/deposits
node backend/nessie-cli.mjs POST /accounts/<account_id>/deposits --data '{"medium":"balance","amount":500,"description":"Invoice payment"}'
```

The key is sent as the API's required `key` query parameter. Keep it server-side in `NESSIE_API_KEY`; never expose it in the frontend or commit it.

## Endpoint map

Base URL: `https://prod-api.nessieisreal.com`

| Resource | Documented routes |
| --- | --- |
| Customers | `GET, POST /customers`; `GET, PUT /customers/{id}`; `GET /accounts/{id}/customer` |
| Accounts | `GET, POST /customers/{id}/accounts`; `GET /accounts`; `GET, PUT, DELETE /accounts/{id}` |
| Deposits | `GET, POST /accounts/{id}/deposits`; `GET /deposits`; `GET, PUT, DELETE /deposits/{id}` |
| Withdrawals | `GET, POST /accounts/{id}/withdrawals`; `GET, PUT, DELETE /withdrawal/{withdrawal_id}` |
| Bills | `GET /customers/{id}/bills`; `GET, POST /accounts/{id}/bills`; `GET, PUT, DELETE /bills/{bill_id}` |
| Purchases | `GET, PUT, DELETE /purchase/{purchase_id}` |
| Transfers | `GET, PUT, DELETE /transfers/{transfer_id}` |
| Loans | `GET, POST /accounts/{id}/loans`; `GET, PUT, DELETE /loans/{id}` |
| Merchants | `GET, POST /merchants`; `GET, PUT /merchants/{id}` |
| ATMs / branches | `GET /atms`, `GET /atms/{id}`, `GET /branches`, `GET /branches/{id}` |
| Enterprise | `GET /enterprise/customers`, `/enterprise/customers/{customer_id}`, `/enterprise/deposits`, `/enterprise/deposits/{deposit_id}`, `/enterprise/withdrawal/{withdrawal_id}` |

## Cash-flow model for Busynessy

1. Start with each account's `balance`.
2. Treat deposits as inflows.
3. Treat withdrawals, purchases, and bills as outflows.
4. Treat transfers as internal movements, not net cash flow, so they are not double-counted.
5. Use recurring bills (`status: recurring`, `recurring_date`, and `upcoming_payment_date`) to project predictable 30-day expenses.
6. Use a purchase's `merchant_id` to enrich expense categories from the merchant record.

### Important documentation note

Nessie's current Quick Start documents `POST /accounts/{id}/transfers`, while the Transfers page only displays read/update/delete operations. The Purchases page likewise displays individual purchase operations but not account-level list/create routes. Before shipping either workflow, verify the desired route in Nessie's interactive documentation with the active API key. The generic CLI can call the verified route immediately without a code change.
