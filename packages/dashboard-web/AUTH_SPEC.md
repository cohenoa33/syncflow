# AUTH_SPEC.md
This document defines the **current, enforced authentication + tenant isolation contract** for `packages/dashboard-web/server`.

It is intentionally concise and MUST stay aligned with:
- `server/tenants.ts` (tenant parsing + indexes + auth config)
- `server/auth.ts` (HTTP auth middleware)
- `server/socket.ts` (Socket.IO auth gates)
- `server/routes/demo.ts` (demo mode gates)
- `server/__tests__/auth.test.ts` (integration contract)

If behavior changes intentionally, update this spec FIRST, then update tests.

---

## 1) Configuration Inputs

### Environment Variables
- `TENANTS_JSON` (string, JSON)
- `AUTH_MODE` (`dev` | `strict`, default = `dev`)
- `DEMO_MODE_ENABLED` (`"true"` enables demo routes, otherwise disabled)
- `DEMO_MODE_TOKEN` (string, required in `strict` mode for demo routes)

### TENANTS_JSON format
```json
{
  "tenant-id": {
    "apps": { "appName": "agentToken" },
    "dashboards": { "viewerToken": true }
  }
}
```

#### Notes:
- Empty / missing TENANTS_JSON means no tenants configured.
- dashboards keys are treated as valid viewer tokens for that tenant.
- apps maps appName -> agentToken and implies agents are enabled.

## 2) Tenant Identification (Hard Requirement)

### HTTP: tenant is taken ONLY from header:
- X-Tenant-Id (case-insensitive)

#### Rules:
- Missing or empty X-Tenant-Id ⇒ 400 BAD_REQUEST
- No fallback tenant, no query param, no body tenant.
### Socket.IO: tenant is provided by event payload:
- join_tenant({ tenantId, token })

#### Rules:
- Missing tenantId ⇒ emits auth_error with MISSING_TENANT_ID
- No fallback tenant.

## 3) Auth Modes

### AUTH_MODE=dev (default)
- System should behave permissively where explicitly intended.
- However, tenant header is still required for HTTP routes (/api/*).
- Demo routes may skip demo token requirements (dev convenience).

AUTH_MODE=strict
- Enforces full auth requirements described below.
- Viewer tokens and demo token (when enabled) are enforced.

## 4) Viewer Authentication (Dashboards)

Viewer auth applies when TENANTS_JSON contains at least one tenant.

### HTTP /api/* (requireApiKey middleware)

#### Requests MUST include:
- valid X-Tenant-Id
- valid viewer token in Authorization: Bearer <token>

#### Failure rules:
- Missing tenant header ⇒ 400 BAD_REQUEST
- Unknown tenant ⇒ 401 UNAUTHORIZED
- Missing/invalid Authorization ⇒ 401 UNAUTHORIZED
- Invalid viewer token for tenant ⇒ 401 UNAUTHORIZED

#### Success rule:
- Valid tenant + valid viewer token ⇒ request proceeds (e.g. /api/traces returns 200)

#### Special case:
- If TENANTS_JSON is empty, /api/traces returns 200 with [] (no tenant enforcement beyond header presence).

### Socket.IO viewer join (join_tenant)

#### Requires:
- tenantId
- valid viewer token for that tenant
- tenant must exist in TENANTS_JSON

#### Failure rules:
- Missing tenantId ⇒ auth_error: MISSING_TENANT_ID
- TENANTS_JSON empty ⇒ auth_error: TENANTS_NOT_CONFIGURED
- Unknown tenant ⇒ auth_error: UNAUTHORIZED
- Missing/invalid viewer token ⇒ auth_error: UNAUTHORIZED

#### Success rule:
- On success, client joins room: tenant:<tenantId>
- Client receives agents event confirming join.

## 5) Agent Authentication (Register)

Agent registration is performed via Socket.IO:
- register({ appName, token })

### Rules:
- If TENANTS_JSON empty ⇒ reject with auth_error: TENANTS_NOT_CONFIGURED
- Missing appName ⇒ reject with auth_error: MISSING_APP_NAME
- Unknown appName ⇒ reject with auth_error: UNAUTHORIZED
- Invalid agent token ⇒ reject with auth_error: UNAUTHORIZED
- Valid credentials ⇒ agent becomes connected and is associated with its tenant

### On success:
- Server records agent in in-memory connectedAgents
- Agent is treated as belonging to the tenant mapped by appName

## 6) Demo Routes (/api/demo-seed)
Demo routes exist only when demo is enabled.

### Enablement:
- If DEMO_MODE_ENABLED !== "true" ⇒ demo routes return 403 DEMO_MODE_DISABLED
- If enabled and AUTH_MODE=strict ⇒ requires DEMO_MODE_TOKEN and request header X-Demo-Token
- If enabled and AUTH_MODE=dev ⇒ demo token is not required

### Authorization requirements:
- Demo routes still require:
- valid X-Tenant-Id
- valid viewer Authorization (when tenants configured)

### Failure rules (strict mode):
- Missing demo token ⇒ 401 UNAUTHORIZED
- Invalid demo token ⇒ 401 UNAUTHORIZED

### Success:
- POST seeds demo events for that tenant
- DELETE removes demo events for that tenant only

## 7) Tenant Isolation (Critical)

### Isolation is enforced across:
- HTTP /api/traces
- Socket.IO rooms (tenant:<tenantId>)
- Demo seed/delete actions

#### Rules:
- Tenant A must never observe Tenant B events over HTTP.
- Socket events are room-scoped; cross-tenant leakage must never occur.
- Demo events are isolated per-tenant and tagged:
- source="demo"
- Deleting demo data must not delete real events.

This is considered a security invariant. Any regression is a release blocker.

## 8) Test Contract

The integration tests in server/__tests__/auth.test.ts are the executable contract.

### General policies:
- Tests assert on behavior (status codes + error codes), not human messages.
- Tests must run in any order.
- If behavior changes intentionally: update AUTH_SPEC.md first, then tests, then code.