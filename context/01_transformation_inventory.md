# Context 01 — Transformation Logic Inventory

## Scope

All transformation logic identified in the legacy Express app at
`backend-soyuteista/src/`. The NestJS scaffold (`src/`) is empty — no
transformations exist there yet.

---

## What "Transformation" Means Here

Transformation = any place where data changes shape, type, or representation
before it is used, stored, or sent:

- Oracle/MySQL raw rows → structured JSON objects
- Flat rows → nested/grouped structures
- Computed derived fields (e.g. weighted grade averages)
- Input normalization (campus name → numeric ID)
- Encrypted envelopes ↔ plain JSON
- String splitting (GROUP_CONCAT → arrays)
- Date range expansion (scalar range → per-day rows)
- Name concatenation (4 Oracle columns → one string)

---

## Complete Inventory Table

| # | File (relative to `backend-soyuteista/src/`) | Function / Location | Input | Output | Type |
|---|---|---|---|---|---|
| T-01 | `common/peticionesOracle/horario.js` L15–37 | `getSchedule` inner map | Oracle flat rows (prefixed columns `H_*`) | Nested `{ID, CEDULA, NOMBRE, SEDE, NOMBRE_PROGRAMA, CORREO_INSTITUCIONAL, MATERIAS[]}` | Row rename + aggregation |
| T-02 | `common/peticionesOracle/horario.js` L75–97 | `getScheduleByDocument` inner map | Same Oracle schema, different stored proc `RETURN_OBJECTS_APP_HORA_QR` | Identical output shape to T-01 | Row rename + aggregation (duplicate of T-01) |
| T-03 | `common/peticionesOracle/notas.js` L12–116 | `getGrades` inner pipeline | Oracle flat rows (`N_*` prefix columns) | 3-level nested `{materia, infoMateria[{corte, infoCorte[{...}], DEFINITIVA_CORTE}], NOTA_FINAL}` plus computed weighted grade | GroupBy + weighted avg computation |
| T-04 | `common/peticionesOracle/carnet.js` L11–30 | `carnet` | Oracle rows | `{result: 0|1|2|3, data: row[0], error}` envelope (single row) | Envelope + domain-code logic |
| T-05 | `common/peticionesOracle/carnet.js` L33–52 | `carnet2` | Oracle rows | `{result: 0|1|2|3, data: row[], error}` envelope (full array) | Envelope + domain-code logic |
| T-06 | `api/.../bienestar/services/campuses_fields/campus-field.service.js` L6–25 | `getAllByCampus` | Flat MySQL rows (one row per campus+field pair) | `[{id_campus, name_campus, fields:[{id_field,name_field,id_campus_field}]}]` | GroupBy aggregation |
| T-07 | `api/.../bienestar/services/time-slots/time-slot.service.js` L15–33 | `groupTimeSlotsByScheduleAndDate` | Flat MySQL rows (one per time slot) | `[{id_schedule, date, time_slots:[...]}]` | GroupBy aggregation |
| T-08 | `api/.../bienestar/services/users-time-slots-dates/user-time-slot-date.service.js` L4–18 | `getAllByProfessional` | MySQL GROUP_CONCAT strings (`time_slot_ids`, `time_slot_names`, `user_time_slot_ids`) | Row with `time_slots` array replacing the CSV strings | String-split → array |
| T-09 | `api/.../bienestar/services/users-time-slots-dates/user-time-slot-date.service.js` L29–83 | `formatter` (static) | Flat MySQL rows | Deep nested `{date → [users → [time_slots]]}` structure | Stateful imperative loop |
| T-10 | `api/.../bienestar/repositories/users-time-slots-dates/user-time-slot-date.repository.js` L36–66 | `insert` | `{startDate, endDate, time_slots[]}` | N INSERT rows (one per day × time_slot) | Date range expansion |
| T-11 | `api/.../bienestar/utilities/campus-formatter.utility.js` | `CampusFormatter.campusMapping` | Campus name string (e.g. `"Sede Norte"`) | Numeric ID string (e.g. `"1"`) | Hardcoded lookup table |
| T-12 | `api/.../bienestar/middlewares/decrypt.middleware.js` L3–19 | `decryptMiddleware` | `req.body.content` (AES-encrypted string) | Replaces `req.body` with decrypted plain JSON | AES decrypt + body mutation |
| T-13 | `api/.../bienestar/config/crypto.config.js` L3–9 | `encrypt` | Plain JS object | AES-encrypted string | Serialise + AES encrypt |
| T-14 | `api/.../bienestar/config/crypto.config.js` L25–28 | `send` | JS object + `res` | AES-encrypted JSON response over the wire | Response wrapping + encryption |
| T-15 | `api/.../soyuteista/soyuteista.service.js` L112–147 | `findDependencia` groupBy block | MySQL join rows | `[{dependencia, infoDependencia:[...]}]` | GroupBy aggregation |
| T-16 | `api/.../soyuteista/soyuteista.service.js` L150–164 | `versionChecker` | Two semver strings | Boolean `is_update_required` | String split + integer comparison |
| T-17 | `common/peticionesOracle/horario.js` L32 | Name concat inside T-01/T-02 | 4 Oracle columns `H_PENG_*` | Single `NOMBRE` string | Multi-column string concat |
| T-18 | `common/security/bcrypt_encryption.js` | `hashPassword` | Plain-text password | bcrypt hash string | One-way hash |
| T-19 | `common/utils/organizarHorarioBienestar.js` | exported function | Flat bienestar schedule rows | Formatted schedule structure | GroupBy / reshape (NEEDS VERIFICATION: call sites unclear) |

---

## Transformation Hotspots

Three files account for most of the non-trivial transformation work:

1. **`notas.js`** — most complex; 3-stage pipeline with grade computation.
2. **`user-time-slot-date.service.js`** — two separate transforms (T-08 and T-09), one
   stateful imperative formatter.
3. **`horario.js`** — two near-identical transforms (T-01, T-02) for the same
   Oracle column schema.

---

## What Is NOT Transformed

- `appointments` — raw MySQL rows returned as-is.
- `campuses` — raw MySQL rows returned as-is.
- `fields` — raw MySQL rows returned as-is (except the campus name → ID lookup
  before querying).
- `users` — raw MySQL rows returned after `getDetailedInfo` projection (password
  excluded at query level, not transformation level).
- All `modulos` and `convocatorias` queries in soyuteista — passed through directly.
