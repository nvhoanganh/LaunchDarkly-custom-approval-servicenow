# LaunchDarkly Custom Approvals — ServiceNow Integration Demo

This repository demonstrates how to integrate **LaunchDarkly Custom Approvals** with **ServiceNow Change Requests**. Before any feature flag change can be applied in a production environment, a corresponding ServiceNow Change Request (CR) must exist and be in an approved state.

## What this demonstrates

LaunchDarkly supports a [Custom Approvals](https://launchdarkly.com/docs/integrations/custom-approvals) framework that lets you replace the default LD approval workflow with your own external system. This demo wires LD Custom Approvals to ServiceNow so that:

1. A developer requests a flag change in LaunchDarkly and enters a ServiceNow CR number (e.g. `CHG0001234`)
2. LaunchDarkly sends the approval request to an intermediary service
3. The intermediary checks ServiceNow to see if that CR exists and is in the approved (Implement) state
4. LaunchDarkly polls the intermediary every 5 minutes until the CR is approved
5. Once the CR is approved in ServiceNow, LD automatically applies the flag change

## Architecture

```
Developer (LaunchDarkly UI)
    │  submits flag change + CR number
    ▼
LaunchDarkly (cloud)
    │  POST /api/approvals         ← creationRequest
    │  GET  /api/approvals/:id/status  ← statusRequest (polls every 5 min)
    │  POST /api/approvals/:id/apply   ← postApplyRequest
    ▼
LD Approval Intermediary  (Supabase Edge Function)
    │  checks CR state via ServiceNow API
    ▼
ServiceNow  (real instance or mock)
    ▲
    │  ServiceNow admin approves the CR
```

## Repository structure

```
├── LDApprovalIntermediary/     ← LD Custom Approvals intermediary app
│   ├── supabase/
│   │   └── functions/
│   │       └── ld-approval/
│   │           └── index.ts    ← Edge function: handles all LD approval API routes
│   └── src/                    ← React UI: shows health status + approval audit log
│
├── ServiceNowMock/             ← Mock ServiceNow instance (for demo/testing)
│   ├── supabase/
│   │   └── functions/
│   │       └── servicenow/
│   │           └── index.ts    ← Edge function: mocks ServiceNow OAuth + Table API
│   └── src/                    ← React UI: create CRs, approve/reject/reset state
│
└── docs/
    └── screenshots/            ← End-to-end demo screenshots
```

## Components

### LDApprovalIntermediary

A Supabase-hosted application that implements the [LaunchDarkly Custom Approvals API contract](https://launchdarkly.com/docs/integrations/custom-approvals/custom-app).

**Edge function routes:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/approvals` | Receives new approval request from LD, checks CR state |
| `GET` | `/api/approvals/:id/status` | LD polls this every 5 min for current CR state |
| `POST` | `/api/approvals/:id/apply` | LD notifies when flag change is applied |
| `DELETE` | `/api/approvals/:id` | LD notifies when approval is cancelled |

**Response shape:**
```json
{ "_id": "<ld-approval-id>", "status": { "value": "approved|declined|pending", "display": "Human readable message" } }
```

**CR state mapping (ServiceNow → LD):**

| ServiceNow state value | Meaning | LD decision |
|------------------------|---------|-------------|
| `-1` | Implement | `approved` |
| `4` | Cancelled | `declined` |
| anything else | New, Assess, Authorize, etc. | `pending` (LD keeps polling) |

**Authentication:** LaunchDarkly sends `Authorization: Bearer <API_TOKEN>` on every request. The token must match the value configured in the LD integration settings.

### ServiceNowMock

A mock ServiceNow instance for demo and testing purposes. Exposes the same API surface as real ServiceNow so the intermediary works without a real ServiceNow subscription.

**Mock API endpoints (Supabase Edge Function):**

- `POST /oauth_token.do` — returns a mock OAuth access token
- `GET /api/now/table/change_request?sysparm_query=number=CHG0001` — returns CR state from the mock database

**UI features:**
- Create new Change Requests
- Approve, Reject, or Reset CR state
- View all CRs and their current state

## LaunchDarkly setup

### Step 1 — Add the Custom Approvals integration

Go to **Organization settings → Integrations → Custom Approvals → Add integration** and configure:

| Field | Value |
|-------|-------|
| Name | Service Now Demo (or any name) |
| API Token | The shared secret (must match `BEARER_TOKEN` in the edge function) |
| Custom approval service base URL | `https://<your-supabase-project>.supabase.co/functions/v1/ld-approval` |
| Additional form variables | See below |

**Additional form variables:**
```json
[{"key":"cr_number","name":"ServiceNow CR Number","type":"string","description":"Enter the CR number (e.g. CHG0001)"}]
```

This causes a **ServiceNow CR Number** field to appear in the LaunchDarkly approval request dialog, where the developer enters the CR number associated with their change.

### Step 2 — Configure environment approval settings

Go to **Project settings → Approval settings → [your environment] → Edit approval setting** and:

- Set **Approval system** to your Custom Approvals integration
- Enable **Require approvals for flags in this environment**
- Enable **Automatically apply flag changes when external change requests are approved**

> **Note:** Configuring Custom Approvals at the environment level requires the LaunchDarkly Enterprise plan and must be set via the API if the UI shows a validation error. Use:
> ```sh
> curl -X PATCH "https://app.launchdarkly.com/api/v2/projects/<project>/environments/<env>" \
>   -H "Authorization: <ld-api-key>" \
>   -H "Content-Type: application/json" \
>   -d '[
>     {"op":"replace","path":"/approvalSettings/serviceKind","value":"custom-approvals"},
>     {"op":"replace","path":"/approvalSettings/serviceKindConfigurationId","value":"<integration-config-id>"},
>     {"op":"replace","path":"/approvalSettings/required","value":true},
>     {"op":"replace","path":"/approvalSettings/minNumApprovals","value":1},
>     {"op":"replace","path":"/approvalSettings/bypassApprovalsForPendingChanges","value":false}
>   ]'
> ```

## End-to-end demo flow

1. Open the **ServiceNow Mock UI** and create a CR (e.g. `CHG0001`) — starts in `new` state
2. In LaunchDarkly, make a flag change in the configured environment — the approval dialog appears with the **ServiceNow CR Number** field
3. Enter `CHG0001` and submit the approval request
4. LaunchDarkly calls the intermediary → intermediary checks ServiceNow → CR is in `new` state → returns `pending`
5. The **LD Approval Intermediary UI** shows the approval log entry with status `pending`
6. In the **ServiceNow Mock UI**, click **Approve** on `CHG0001` — state changes to `implement`
7. LaunchDarkly polls the intermediary again (or refresh the approval page) → intermediary checks ServiceNow → CR is now in `implement` state → returns `approved`
8. LaunchDarkly automatically applies the flag change

## Screenshots

See [`docs/screenshots/`](docs/screenshots/) for end-to-end demo screenshots.

## Deploying your own instance

Both apps are built with [Lovable](https://lovable.dev) and hosted on Supabase. To deploy your own:

1. Fork this repo and import into Lovable
2. Lovable provisions a Supabase project automatically
3. Copy `.env.example` to `.env` and fill in your Supabase credentials
4. Update `BEARER_TOKEN` and `SNOW_BASE` in `LDApprovalIntermediary/supabase/functions/ld-approval/index.ts`
5. Deploy via Lovable's built-in publish flow

## Real ServiceNow integration

To connect to a real ServiceNow instance instead of the mock:

1. In ServiceNow: **System OAuth → Application Registry → New → Create an OAuth API endpoint for external clients**
2. Note the Client ID and Client Secret
3. Update the edge function's `SNOW_BASE` URL and OAuth credentials to point at your ServiceNow instance
4. Set `APPROVED_STATE` to the numeric state value your team uses for approved CRs (commonly `-1` for Implement)
5. Set `REJECTED_STATES` to numeric state values for cancelled/rejected CRs (commonly `4` for Cancelled, `8` for Closed Incomplete)
