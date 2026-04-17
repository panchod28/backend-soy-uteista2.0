# Context 06 — Bugs, Risks, and NEEDS VERIFICATION Items

## Summary

This file consolidates every flagged issue from contexts 01–05. Items are
grouped by severity. None of the source files have been modified.

---

## Critical Bugs (likely causes runtime errors in production)

### BUG-01 — Self-referencing variable in CampusFormatter

**File:** `user-time-slot-date.controller.js` line ~50  
**Severity:** Critical (always produces wrong result, silently)

```javascript
const id_campus_field_formatted = CampusFormatter.isNumber(id_campus_field)
  ? id_campus_field
  : CampusFormatter.campusMapping[id_campus_field_formatted] || "1";
//                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^
// id_campus_field_formatted is being defined here but referenced in its own
// initializer — JavaScript evaluates the RHS before assigning, so
// id_campus_field_formatted is `undefined` at the point of the lookup.
// CampusFormatter.campusMapping[undefined] is always undefined → fallback "1".
// This means non-numeric campus IDs ALWAYS resolve to campus "1".
```

**Fix in NestJS rewrite:** Use the source variable, not the result variable:
```typescript
const formatted = CampusFormatter.isNumber(id_campus_field)
  ? id_campus_field
  : CampusFormatter.campusMapping[id_campus_field] || '1';
```

---

### BUG-02 — Express `next()` before error `send()` in decryptMiddleware

**File:** `decrypt.middleware.js` lines 11–14  
**Severity:** Critical (causes `ERR_HTTP_HEADERS_SENT` crash when decryption fails)

```javascript
next();                // passes request to next handler — headers committed
send({ error: ... }, res);  // tries to write headers again → CRASH
```

**Fix in NestJS rewrite:** Not applicable (bienestar encryption is out of scope).
Documented for awareness.

---

### BUG-03 — TimeSlotService static/instance method inconsistency

**File:** `time-slot.service.js`  
**Severity:** NEEDS VERIFICATION — may be latent or already worked around

`TimeSlotService` uses instance methods but is exported as a singleton
`module.exports = new TimeSlotService()`. If the controller imports it and
calls methods directly on the export object (not destructuring), calls will
work. If any call site destructures the export or re-assigns `this`, it will
fail with `TypeError: this.groupTimeSlotsByScheduleAndDate is not a function`.

Verify all call sites: `TimeSlotController.js` method invocations.

---

## Security Issues

### SEC-01 — SQL Injection in Oracle Queries

**Files:** `horario.js`, `carnet.js`  
**Severity:** High

```javascript
// carnet.js — lower risk (email in single quotes)
`select * from table(academico.RETURN_OBJECTS_APP_CARNE('${email}'))`

// horario.js getScheduleByDocument — HIGH RISK (no quotes around parameter)
`SELECT * FROM table(academico.RETURN_OBJECTS_APP_HORA_QR(${document}))`
```

A numeric document value like `1 OR 1=1` could alter query semantics.

**Fix in NestJS rewrite:** Use `oracledb` bind variables:
```typescript
connection.execute(
  `SELECT * FROM table(academico.RETURN_OBJECTS_APP_HORA_QR(:document))`,
  { document: documentValue }
)
```

---

### SEC-02 — Plain-text password transmitted via email

**File:** `user.controller.js` (bienestar)  
**Severity:** Medium (product concern, not a data corruption bug)

When creating a professional user account, the controller:
1. Generates a password.
2. Hashes it with bcrypt.
3. Stores the hash.
4. Emails the **plain-text** password to the user.

Emailing plain-text passwords is a security anti-pattern. Should be replaced
with a one-time setup link or temporary-password flow.

**NestJS relevance:** NEEDS VERIFICATION — is user registration part of the
NestJS soyuteista rewrite scope or bienestar-only? If bienestar-only, this is
out of scope.

---

### SEC-03 — Hardcoded API key in source file

**File:** `soyuteista.controller.js` line ~27  
**Severity:** Medium

A hardcoded API key value with a comment `//anterior` (meaning "previous") is
present. A second (current) key is also in the file. Both values are in source
control.

**Value masked:** `***`

**Fix in NestJS rewrite:** Move all secrets to environment variables, validated
via `@nestjs/config` with a Joi schema. Never commit API keys to source.

---

## Data Correctness Issues

### DATA-01 — Null name produces literal "null" string

**File:** `horario.js` line 32  
**Severity:** Medium

```javascript
NOMBRE: `${H_PENG_PRIMERNOMBRE} ${H_PENG_SEGUNDONOMBRE} ${H_PENG_PRIMERAPELLIDO} ${H_PENG_SEGUNDOAPELLIDO}`
```

If `H_PENG_SEGUNDONOMBRE` is `null` (nullable column — second given name is
optional in Colombian civil records), the output is:
```
"Juan null Pérez García"
```

**Fix in NestJS rewrite:**
```typescript
[first, second, last1, last2].filter(Boolean).join(' ')
```

---

### DATA-02 — UTC date shift for Colombian timezone

**File:** `user-time-slot-date.repository.js` line ~52  
**Severity:** Low–Medium (only affects dates scheduled near midnight Colombian time)

`new Date(dateObj).toISOString().substring(0, 10)` returns UTC date, which is
5 hours ahead of Colombia (UTC-5). A date constructed at 23:00 Colombia time
would be stored as the next day in UTC.

**Fix in NestJS rewrite:** Use explicit timezone-aware formatting:
```typescript
import { format } from 'date-fns-tz';
format(date, 'yyyy-MM-dd', { timeZone: 'America/Bogota' })
```

NEEDS VERIFICATION: Confirm server timezone and whether the existing production
data shows any day-shift artifacts.

---

### DATA-03 — Campus ID top-level in grouped campus-fields

**File:** `campus-field.service.js` line ~11  
**Severity:** Low

The top-level `id_campus_field` of each campus group is set from the **first
field's** `id_campus_field`. If the client uses this value to identify the
campus, the value is arbitrary and will change if the order of fields returned
by MySQL changes.

NEEDS VERIFICATION: Does any client use this top-level `id_campus_field`?
If so, it should be `id_campus` (the campus's own ID), not a field-association
ID.

---

### DATA-04 — bienestar routes registered twice

**File:** `bienestar/index.js` lines 19 and 24  
**Severity:** Low (routes work but handlers execute twice for matching requests)

`campusRouter` is registered twice:
```javascript
app.use(routes.campus, campusRouter); // line 19
// ...
app.use(routes.campus, campusRouter); // line 24 — duplicate
```

Express will match both and run the handler twice. NEEDS VERIFICATION:
confirm if this causes double database writes on POST/PUT campus routes.

---

## NEEDS VERIFICATION — Open Questions

| ID | Question | Location | Why It Matters |
|---|---|---|---|
| NV-01 | What Oracle column names does `RETURN_OBJECTS_APP_CARNE` return? | `carnet.js` | The NestJS DTO for carnet must match exactly — no column rename was applied in the legacy code |
| NV-02 | Is the habilitación grade weight logic at `notas.js` L93–101 correct? | `notas.js` | Grade computation affects student academic records |
| NV-03 | What is the `saltRounds` value for bcrypt? | `bcrypt_encryption.js` | Determines hashing cost; standard is 10 |
| NV-04 | Does `H_PENG_SEGUNDONOMBRE` return `null` from Oracle or an empty string? | Oracle schema | Determines whether null-guard is needed |
| NV-05 | What is the exact result-code → HTTP status mapping in `soyuteista.controller.js`? | Controller | Needed to correctly implement NestJS exception throwing |
| NV-06 | Is `SECRET_KEY` set in all deployment environments and not committed to git? | `.env` / deployment config | AES encryption of bienestar responses depends on it |
| NV-07 | What timezone does the production server run in? | Server config | Affects `toISOString()` date shift (DATA-02) |
| NV-08 | Does any bienestar client use the top-level `id_campus_field` from the grouped campus response? | Frontend code | Determines severity of DATA-03 |
| NV-09 | Are there two distinct stored procedures for `RETURN_OBJECTS_APP_HORARIO` and `RETURN_OBJECTS_APP_HORA_QR`, and do they return identical column schemas? | Oracle DB | Determines if T-01 and T-02 can share one mapper |
| NV-10 | Is the `TimeSlotController` call to `TimeSlotService.getTimeSlotsByProfessional()` destructured or called directly on the singleton object? | `time-slot.controller.js` | Determines if BUG-03 is live |
| NV-11 | Does the `decryptMiddleware` bug (BUG-02) cause observable errors in production? | Server logs | May be masked if decryption never fails or if the error is swallowed |
| NV-12 | Is `pruebas.js` (scratch/test file) deployed to production? | `soyuteista/pruebas.js` | Should be excluded; also contains a copy of `groupBy` |
| NV-13 | What does `obtainDomainName` return for each email domain? Exactly which domains map to result code `1` vs `2`? | `common/obtainDomain.js` | Needed to implement the NestJS carnet domain-check logic |
