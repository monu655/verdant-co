# Testing the webhook

Endpoint: `POST <API URL>/webhook` with header `X-Signature: sha256=<hex>`, where the hex value is the HMAC-SHA256 of the **raw body** using `WEBHOOK_SECRET` (the assessment's test secret is `verdant-demo-secret-2026`).

```bash
URL=http://localhost:8080          # or your Render URL
SECRET=verdant-demo-secret-2026
BODY='{"event_id":"evt_demo_1","type":"message.received","brand_id":"verdant-co","timestamp":"2026-11-03T10:15:22Z","customer":{"id":"cust_1042","name":"Aisha Khan","phone":"+919800000001"},"message":{"id":"msg_demo_1","type":"text","text":"Do you deliver to Dubai?"}}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')"

curl -i -X POST $URL/webhook -H "Content-Type: application/json" -H "X-Signature: $SIG" -d "$BODY"
```

| Case | Result |
|---|---|
| Valid signature | `200 {"status":"processed",...}` and a draft is created |
| Same `event_id` again | `200 {"status":"duplicate"}`, nothing new stored |
| Wrong or missing signature, or body changed after signing | `401 invalid_signature` |
| Malformed JSON or missing fields | `400` |
| Other `brand_id` | `422 unknown_brand` |
| Non-text message or other event type | `200 {"status":"ignored"}` |
| Database failure | `500` (nothing committed, safe to redeliver) |

Sign the exact bytes you send. Re-serialising the JSON after signing changes the bytes and the request is rejected.
