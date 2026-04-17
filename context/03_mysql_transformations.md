# Context 03 — MySQL Transformation Details

## Source Files

```
backend-soyuteista/src/api/v1/production/bienestar/
├── services/
│   ├── campuses_fields/campus-field.service.js
│   ├── time-slots/time-slot.service.js
│   └── users-time-slots-dates/user-time-slot-date.service.js
├── repositories/
│   └── users-time-slots-dates/user-time-slot-date.repository.js
└── utilities/
    └── campus-formatter.utility.js

backend-soyuteista/src/api/v1/production/soyuteista/
└── soyuteista.service.js  (lines 112–164)
```

---

## T-06 — Campus-Fields Grouping (`campus-field.service.js`)

### Raw MySQL Query Result

Each row from the `campuses_fields JOIN campuses JOIN fields` query:

```
{ id_campus, name_campus, id_field, name_field, id_campus_field }
```

One row per campus–field pair. If campus A has 3 fields, there are 3 rows for
campus A.

### Transformation Logic (lines 6–25)

```javascript
const groupedData = {};
rawData.forEach((row) => {
  if (!groupedData[row.id_campus]) {
    groupedData[row.id_campus] = {
      id_campus_field: row.id_campus_field,  // NOTE: first field's id used
      name_campus: row.name_campus,
      fields: [],
    };
  }
  groupedData[row.id_campus].fields.push({
    id_field: row.id_field,
    name_field: row.name_field,
    id_campus_field: row.id_campus_field,
  });
});
return Object.values(groupedData);
```

### Output Shape

```json
[
  {
    "id_campus_field": 1,
    "name_campus": "Sede Norte",
    "fields": [
      { "id_field": 1, "name_field": "Psicología", "id_campus_field": 1 },
      { "id_field": 2, "name_field": "Trabajo Social", "id_campus_field": 2 }
    ]
  }
]
```

### NEEDS VERIFICATION

The top-level `id_campus_field` is set from the **first row** of the group.
If a campus has multiple fields, only the first field's `id_campus_field` is
surfaced at the campus level. It is unclear whether the client uses this
top-level `id_campus_field`. May be intentional or a bug.

---

## T-07 — Time Slots Grouping (`time-slot.service.js`)

### Raw MySQL Row

```
{ id_schedule, date, id_time_slot, name_time_slot, ... }
```

### Transformation Logic (lines 15–33)

Groups flat rows by `id_schedule`, accumulating `time_slots` arrays.

### Output Shape

```json
[
  {
    "id_schedule": 5,
    "date": "2026-04-17",
    "time_slots": [
      { "id_time_slot": 1, "name_time_slot": "08:00 - 09:00" },
      { "id_time_slot": 2, "name_time_slot": "09:00 - 10:00" }
    ]
  }
]
```

### NEEDS VERIFICATION — Static vs. Instance Bug

`TimeSlotService` defines `groupTimeSlotsByScheduleAndDate` as an **instance
method** (not `static`) and is exported as `module.exports = new TimeSlotService()`.

`TimeSlotController` calls `TimeSlotService.getTimeSlotsByProfessional()`.

If `getTimeSlotsByProfessional` is also a regular instance method, this call
works only because it is invoked on the singleton instance. However, if any
controller does `const { getTimeSlotsByProfessional } = TimeSlotService`
(destructuring, losing `this`), the call would fail.

Verify all call sites do NOT destructure the service.

---

## T-08 — GROUP_CONCAT Split (`user-time-slot-date.service.js`, lines 4–18)

### Raw MySQL Row (uses GROUP_CONCAT in query)

```
{
  id_user,
  name_user,
  date,
  time_slot_ids: "1,2,3",
  time_slot_names: "08:00-09:00,09:00-10:00,10:00-11:00",
  user_time_slot_ids: "10,11,12"
}
```

### Transformation Logic

```javascript
const timeSlotIds    = row.time_slot_ids.split(",");
const timeSlotNames  = row.time_slot_names.split(",");
const userTimeSlotIds = row.user_time_slot_ids.split(",");

const timeSlots = timeSlotIds.map((id, index) => ({
  id_user_time_slot_date: parseInt(userTimeSlotIds[index]),
  id_time_slot: parseInt(id),
  name_time_slot: timeSlotNames[index],
}));
```

### NEEDS VERIFICATION

`parseInt` is used without a radix. Should be `parseInt(id, 10)` in strict
code. Also: if any GROUP_CONCAT value is null (no time slots booked), the
`split(",")` on null will throw. The NestJS rewrite should handle the null
case before splitting.

---

## T-09 — Nested Date→User→Slots Formatter (`user-time-slot-date.service.js`, lines 29–83)

### Input

Flat MySQL rows pre-sorted by `date` then `id_user` (sorted in
`getUpcomingByCampus` at line 85–94 before calling this formatter).

### Transformation Logic

Stateful imperative loop using mutable tracking variables:

```javascript
let currentDate = null;
let currentUser = null;
let currentObject = null;
let currentUserSlot = null;

rows.forEach((row) => {
  if (row.date !== currentDate) {
    // push new date group
    currentDate = row.date;
    currentObject = { date: row.date, users: [] };
    result.push(currentObject);
  }
  if (row.id_user !== currentUser) {
    // push new user group inside current date
    currentUser = row.id_user;
    currentUserSlot = { id_user: row.id_user, name_user: row.name_user, time_slots: [] };
    currentObject.users.push(currentUserSlot);
  }
  // push time slot into current user
  currentUserSlot.time_slots.push({
    id_user_time_slot_date: row.id_user_time_slot_date,
    id_time_slot: row.id_time_slot,
    name_time_slot: row.name_time_slot,
  });
});
```

### Output Shape

```json
[
  {
    "date": "2026-04-17",
    "users": [
      {
        "id_user": 3,
        "name_user": "Dr. Martínez",
        "time_slots": [
          { "id_user_time_slot_date": 10, "id_time_slot": 1, "name_time_slot": "08:00-09:00" }
        ]
      }
    ]
  }
]
```

### NEEDS VERIFICATION

The sort at line 85–94 sorts by date string comparison, not by a real Date
object. If dates are `"YYYY-MM-DD"` strings, lexicographic sort is equivalent
to date sort. If any other format is returned from MySQL, this breaks silently.

---

## T-10 — Date Range Expansion (`user-time-slot-date.repository.js`, lines 36–66)

### Input

```javascript
{
  startDate: Date,
  endDate: Date,
  time_slots: [{ id_time_slot: 1 }, { id_time_slot: 2 }],
  id_user: 3
}
```

### Transformation Logic

Helper `daysBetween(start, end)` at lines 25–33 iterates day-by-day from
`startDate` to `endDate` (inclusive), building an array of `Date` objects.

The main insert loop:
```
for each day in daysBetween:
  for each time_slot in time_slots:
    INSERT INTO users_time_slots_dates (id_user, id_time_slot, date)
    VALUES (id_user, id_time_slot, day.toISOString().substring(0, 10))
```

### NEEDS VERIFICATION

Date is formatted as `toISOString().substring(0, 10)`, which produces UTC
midnight. If the server timezone differs from Colombia (UTC-5), dates near
midnight may shift by one day. The NestJS rewrite should use a local-date
formatter or explicitly set timezone context.

---

## T-11 — Campus Name → ID Lookup (`campus-formatter.utility.js`)

### Hardcoded Mapping

```javascript
static campusMapping = {
  "Sede Norte": "1",
  // ... other campuses
};
```

Values are **strings**, not integers. Controllers compare with `isNumber(val)`
before deciding to look up.

### Usage Sites

1. `field.controller.js` lines 28–31:
   ```javascript
   const id_campus_formatted = CampusFormatter.isNumber(id_campus)
     ? id_campus
     : CampusFormatter.campusMapping[id_campus] || "1";
   ```

2. `user-time-slot-date.controller.js` lines 48–50 — **BUG**:
   ```javascript
   const id_campus_field_formatted = CampusFormatter.isNumber(id_campus_field)
     ? id_campus_field
     : CampusFormatter.campusMapping[id_campus_field_formatted] || "1";
   //                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   //  References itself before assignment — always resolves to undefined → "1"
   ```

---

## T-15 — Dependencias Grouping (`soyuteista.service.js`, lines 112–147)

### Raw MySQL Row

Join of `dependencias` + `contactosDependencia`:
```
{ dependenciaNombre, contacto fields... }
```

### Transformation

Same `groupBy` pattern as notas.js and campus-field.service.js, but applied
to MySQL data:

```javascript
const grouped = groupBy(rows, 'dependenciaNombre');
return Object.entries(grouped).map(([key, value]) => ({
  dependencia: key,
  infoDependencia: value,
}));
```

### NEEDS VERIFICATION

`groupBy` is defined locally at lines 112–121 as a closure within the service
file. It is the fourth independent copy of this function in the codebase.

---

## T-16 — Semver Version Comparison (`soyuteista.service.js`, lines 150–164)

### Input

Two version strings from DB + request: `"1.2.3"` format.

### Logic

```javascript
const [ma, mi, pa] = currentVersion.split('.').map(Number);
const [ma2, mi2, pa2] = minVersion.split('.').map(Number);
// compare component by component
```

Returns boolean `is_update_required` which is added to the `basicInfo`
response object.

Simple utility — no external library. Adequate for the use case.
