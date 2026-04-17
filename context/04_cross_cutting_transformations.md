# Context 04 — Cross-Cutting Transformation Concerns

## Scope

Transformations that span multiple modules or that affect all requests/responses
uniformly: encryption, response envelopes, request body decryption, validation,
password hashing.

---

## 1. AES Encryption Layer (bienestar API)

### Files

```
backend-soyuteista/src/api/v1/production/bienestar/config/crypto.config.js
backend-soyuteista/src/api/v1/production/bienestar/middlewares/decrypt.middleware.js
```

### How It Works

**Inbound** (decrypt.middleware.js):
- Runs before every bienestar route handler.
- If `req.body.content` exists, AES-decrypts it and replaces `req.body` with the
  parsed plaintext object.
- If `req.body.content` is absent, `req.body` is left unchanged (plaintext
  request — used in development/testing? NEEDS VERIFICATION).

```
encrypted request  →  decryptMiddleware  →  plain req.body  →  controller
```

**Outbound** (crypto.config.js `send()`):
- Every bienestar controller calls `send(data, res)` instead of `res.json(data)`.
- `send()` calls `encrypt(data)` → AES-encrypts the full response → sends as
  JSON `{ content: "<encrypted>" }`.

```
controller result  →  send()  →  AES-encrypted JSON  →  client
```

**Secret Key**:
`process.env.SECRET_KEY` — value masked as `***`. NEEDS VERIFICATION: confirm
this env variable is set in all deployment environments and is not committed to
the repository.

### NEEDS VERIFICATION — decryptMiddleware Express Order Bug

`decrypt.middleware.js` lines 11–14:
```javascript
next();
send({ error: "..." }, res);   // called AFTER next()
```

In Express, calling `next()` before sending an error response means the request
has already been passed to the next handler. The subsequent `send()` call
would try to write headers that are already sent, producing an
`ERR_HTTP_HEADERS_SENT` error in production. The correct pattern is either
`next(err)` to pass to error handler OR `return res.status(400).json(...)` —
never both.

### Implication for NestJS Rewrite

The bienestar encrypted API is **out of scope** per `UTS_WEBSERVICE_SPEC.md`.
The soyuteista NestJS module does not use encryption. This section is
documented for completeness only.

---

## 2. Response Envelope Pattern

### bienestar Module

All 8 bienestar controllers wrap responses in:
```javascript
{ data: <result>, status: 200 }  // success
{ error: <message>, status: 4xx } // failure
```
Then pass to `send()` which encrypts the whole envelope.

### soyuteista Module

`soyuteista.service.js` Oracle functions return:
```javascript
{ result: <0|1|2|3>, data: <payload>, error: <null|message> }
```

`result` codes:
| Code | Meaning |
|---|---|
| `1` | Success |
| `0` | Database error |
| `2` | Non-institutional email domain |
| `3` | Empty result set |

The controller reads `result` to decide HTTP status and what to forward.

### NEEDS VERIFICATION

The mapping from `result` code to HTTP status code is done inline in
`soyuteista.controller.js`. Confirm the exact mapping — the NestJS service
layer should throw typed exceptions (`NotFoundException`, `ForbiddenException`,
etc.) rather than carrying numeric codes.

---

## 3. Request Validation (Middleware Layer)

### bienestar Module

Uses `express-validator` with `body()` chains defined in:
```
api/.../bienestar/middlewares/validation-rules/<resource>/<resource>-validation-rules.middleware.js
```

A shared `validationMiddleware` at `middlewares/validator/validator.middleware.js`
reads `validationResult(req)` and returns a 400 if any rule fails.

Route assembly:
```
router.post('/', [...validationRules], validationMiddleware, controller.method)
```

This is the only validation step — there is no input sanitization beyond
`express-validator` constraints.

### soyuteista Module

No formal validation middleware. `soyuteista.controller.js` checks
`req.body.email` and `req.query.email` presence inline, returning early with
error messages. No schema validation.

### Implication for NestJS Rewrite

Both validation patterns should be replaced with `class-validator` DTOs +
NestJS `ValidationPipe` (global). This is already planned in
`context/UTS_WEBSERVICE_SPEC.md`.

---

## 4. Password Hashing (`bcrypt_encryption.js`)

### File

`backend-soyuteista/src/common/security/bcrypt_encryption.js`

### Functions

```javascript
hashPassword(password)    // bcrypt.hash(password, saltRounds) → promise
comparePassword(plain, hash) // bcrypt.compare(plain, hash) → promise
```

`saltRounds` value: NEEDS VERIFICATION (check source — not shown in agent
report). Standard NestJS practice is 10.

### Call Site

`UserController.insertProfessional` (bienestar):
1. Generates a plain-text password.
2. Calls `hashPassword`.
3. Stores the hash in MySQL.
4. Emails the **plain-text** password to the user.

**Security note**: emailing plain-text passwords is a known bad practice.
The NestJS rewrite should consider sending a one-time setup link instead.
However, whether to change this behaviour is a product decision, not a
transformation decision.

---

## 5. `groupBy` Utility — Duplication Across Modules

The same `groupBy(array, key)` function is independently defined in 4 places:

| File | Lines | Scope |
|---|---|---|
| `common/peticionesOracle/notas.js` | ~14–22 | Local function |
| `common/utils/organizarHorarioBienestar.js` | ~1–10 | Exported |
| `api/.../soyuteista/soyuteista.service.js` | ~112–121 | Local function |
| `api/.../soyuteista/pruebas.js` | ~3–11 | Local (test/scratch file) |

There is no shared utility export used by all of them. In NestJS, a single
`groupBy` utility function in a shared helpers module would serve all use
cases.

---

## 6. Date Formatting

Three different date handling approaches exist:

| Location | Approach | Risk |
|---|---|---|
| `user-time-slot-date.repository.js` line 52 | `new Date().toISOString().substring(0, 10)` | UTC-based; may shift dates at Colombia UTC-5 timezone boundary |
| `user-time-slot-date.service.js` line 85 | Sort by `row.date` string | Safe only for `YYYY-MM-DD` format |
| `soyuteista.service.js` various | No date transform — MySQL returns raw | Passes through as-is |

The NestJS rewrite should standardize on a single date utility (e.g., `date-fns`
with explicit timezone) for any date manipulation. NEEDS VERIFICATION: what
timezone is the production server running in?
