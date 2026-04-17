# Context 05 — Where Transformation Should Live in NestJS

## Guiding Principle

NestJS has well-defined layers. Each transformation type belongs in the layer
that has the right lifecycle and scope:

```
Request → Guard → Pipe → Controller → Service → Repository → (DB)
                                                               ↓
Response ← Interceptor ←────────────────────────────── (DB result)
```

The legacy code mixes transformation into services, repositories, and
controllers indiscriminately. The NestJS rewrite should assign each transform
to its correct layer.

---

## Decision Table

| Transform ID | What It Does | Recommended NestJS Layer | Rationale |
|---|---|---|---|
| T-01 / T-02 | Oracle flat rows → nested schedule DTO | **Service** (via private mapper method or dedicated mapper class) | Data shaping from DB result is the service's responsibility; not reusable enough to warrant a separate mapper class unless shared across multiple endpoints |
| T-03 | Oracle flat rows → nested grades + computed finals | **Service** (dedicated private method per stage, or a `GradesMapper` class) | Complex 3-stage logic; isolate as a named private method `mapGrades()` inside the service for readability |
| T-04 / T-05 | Oracle rows → result-code envelope | **Service** (throw typed NestJS exceptions instead of result codes) | The result code → HTTP status translation is controller-level noise in the legacy code; replace with `NotFoundException`, `ForbiddenException` thrown from the service — the controller becomes trivial |
| T-06 | Flat MySQL rows → campus+fields nested | **Service** (private `groupByCampus()` method) | Same rationale as T-01 |
| T-07 | Flat MySQL rows → schedule+slots nested | **Service** (private `groupBySchedule()` method) | Same |
| T-08 | GROUP_CONCAT strings → arrays | **Repository** (transform as soon as the raw row is read, before returning to service) | The GROUP_CONCAT is a query-level detail; the service should never see comma-separated strings |
| T-09 | Stateful date→user→slots formatter | **Service** (rewrite as functional `groupBy` pipeline, not stateful loop) | Stateful imperative loops are hard to test; replace with two nested `Map` groupBy operations |
| T-10 | Date range expansion for INSERT | **Repository** (keep in the repository — this is a write-path query concern) | Generating INSERT rows from a range is a persistence concern, not business logic |
| T-11 | Campus name → numeric ID lookup | **Pipe** or **Guard** (or inline in the controller `@Param()` / `@Query()` transform) | Input normalization before the controller is a pipe responsibility; alternatively, accept both name and ID natively in the service and map there |
| T-12 | AES decrypt `req.body` | **Out of scope** (bienestar only) | Not being rewritten in NestJS per spec |
| T-13 / T-14 | AES encrypt response | **Out of scope** (bienestar only) | Not being rewritten in NestJS per spec |
| T-15 | MySQL rows → dependencias grouped | **Service** (private `groupByDependencia()` method) | Same as T-06 |
| T-16 | Semver comparison | **Service** (inline in `basicInfo()` method) | Trivial utility; no need for a separate class |
| T-17 | 4 Oracle columns → full name string | **Service** (inside the schedule mapper method) | Simple null-safe join: `[a, b, c, d].filter(Boolean).join(' ')` |
| T-18 | bcrypt hash/compare | **Service** (inject `BcryptService` or use `@nestjs/passport` / custom auth service) | Authentication logic belongs in an `AuthService` |
| T-19 | `organizarHorarioBienestar` format | **Out of scope** (bienestar only) | Not being rewritten |

---

## Where NOT to Put Transformation

### Not in Controllers

Controllers should be thin. The controller's only job is to extract request
parameters, call a service method, and return the result. No data shaping
should happen in a controller.

Legacy anti-pattern (do not replicate):
```javascript
// soyuteista.controller.js — inline transform in controller (avoid in NestJS)
const { result, data, error } = await getSchedule(email);
if (result === 1) return res.json({ ...data });
if (result === 2) return res.status(403).json({ error });
```

NestJS pattern:
```typescript
// controller.ts — thin, no transform
@Get('schedule')
async getSchedule(@Query('email') email: string) {
  return this.soyuteistaService.getSchedule(email);
  // service throws NotFoundException / ForbiddenException as needed
}
```

### Not in Repositories

Repositories should return typed, clean objects — but only the structural
transformation that is inseparable from the query (like T-08, GROUP_CONCAT
splitting) should live here. Business-level grouping (T-06, T-07, T-09)
should stay in the service.

### Not in Global Interceptors (for this project)

A `SerializeInterceptor` / `ClassSerializerInterceptor` pattern is useful when
you have ORM entities with `@Exclude()` fields. Since this project uses raw
SQL (no TypeORM entities), `ClassSerializerInterceptor` provides no benefit
unless you create response DTO classes. NEEDS VERIFICATION: decide whether
response DTOs + `@Exclude()` are worth the overhead for this API scope.

---

## Recommended Architecture for soyuteista Module

```
src/
└── soyuteista/
    ├── soyuteista.module.ts
    ├── soyuteista.controller.ts      ← thin: extract params, call service
    ├── soyuteista.service.ts         ← orchestration + business logic
    ├── soyuteista.repository.ts      ← raw Oracle/MySQL queries, minimal mapping
    ├── mappers/
    │   ├── schedule.mapper.ts        ← T-01/T-02: Oracle rows → ScheduleDto
    │   ├── grades.mapper.ts          ← T-03: Oracle rows → GradeDto + grade calc
    │   └── carnet.mapper.ts          ← T-04/T-05: Oracle rows → CarnetDto
    └── dto/
        ├── schedule.dto.ts
        ├── grade.dto.ts
        └── carnet.dto.ts
```

### When to Extract a Mapper Class vs. Private Method

Use a **dedicated mapper class** when:
- The transformation is complex enough to need unit testing in isolation (T-03 grade calculation qualifies).
- The same transformation is reused across multiple services.

Use a **private service method** when:
- The transformation is straightforward (T-01, T-06, T-15).
- It is only ever called from one place.

For this codebase, only `GradesMapper` (T-03) clearly warrants its own class.
The others can be private methods within their respective services.

---

## Shared Utilities

The following should be placed in a shared `common/` or `utils/` folder:

| Utility | NestJS Location |
|---|---|
| `groupBy<T>(array, key)` | `src/common/utils/group-by.util.ts` |
| Semver comparison (T-16) | Inline in service (too simple to extract) |
| Null-safe name join (T-17) | `src/common/utils/name.util.ts` or inline |
| `CampusFormatter` mapping (T-11) | `src/common/utils/campus.util.ts` or as a config constant |

---

## Transformation That Changes With NestJS

| Legacy Pattern | NestJS Replacement |
|---|---|
| Result code `{ result: 0/1/2/3, data, error }` envelope | Throw `HttpException` subclasses; NestJS global exception filter handles HTTP status |
| String interpolation in SQL | `oracledb` bind variables; `mysql2` parameterized queries |
| `groupBy` duplicated 4× | One shared `groupBy` utility |
| `parseInt` without radix | `parseInt(val, 10)` or `Number(val)` |
| UTC date from `toISOString()` | Explicit locale/timezone-aware formatter |
| Null name concat → `"null"` string | `[...].filter(Boolean).join(' ')` |
