# Context 07 — Implementation Plan

> Base URL prefix for all routes: `/api/v1/production`  
> All student endpoints require `MicrosoftJwtGuard` (see Auth section).  
> Response shapes are authoritative from `UTS_WEBSERVICE_SPEC.md`.

---

## Endpoints

---

### 1. GET /soyuteista/carnet2

**Controller** — `src/modules/students/students.controller.ts`
```
method : getCarnet(@CurrentUser() user: AuthenticatedUser)
route  : @Get('carnet2')
params : email taken from validated JWT (user.upn), NOT from query string
```

**Service** — `src/modules/students/students.service.ts`
```
method       : getCarnet(email: string): Promise<CarnetResponseDto>
Oracle proc  : academico.RETURN_OBJECTS_APP_CARNE(:email)
query note   : returns full array — supports multi-program enrollment
result codes : 1=found, 0=error, 2=not enrolled, 69=validation error
```

**Request DTO** — none (email from JWT, no body)

**Response DTO** — `src/modules/students/dto/carnet.dto.ts`
```typescript
class CarnetItemDto {
  C_ESTP_ID: number;
  C_PEGE_DOCUMENTOIDENTIDAD: string;
  C_PENG_PRIMERAPELLIDO: string;
  C_PENG_SEGUNDOAPELLIDO?: string;       // nullable
  C_PENG_PRIMERNOMBRE: string;
  C_PENG_SEGUNDONOMBRE?: string;         // nullable
  C_UNID_NOMBRE: string;
  C_PROG_NOMBRE: string;
  C_FRAN_DESCRIPCION: string;
  C_PENS_DESCRIPCION: string;
  C_PENS_TOTALCREDITOS: number;
  C_ESTP_CREDITOSAPROBADOS: number;
  C_AVANCE: number;
  C_CATE_DESCRIPCION: string;
  C_SITE_DESCRIPCION: string;
  C_PENG_EMAILINSTITUCIONAL: string;
  C_ESTP_PROMEDIOGENERAL: number;
  C_PEUN_FECHAFIN: string;
}

class CarnetResponseDto {
  result: 1 | 0 | 2 | 69;
  data: CarnetItemDto[];
  error: string;
}
```

**Response shape** (result=1):
```json
{ "result": 1, "data": [{ "C_ESTP_ID": 12345, "..." }], "error": "" }
```
**Response shape** (result=0/2/69):
```json
{ "result": 0, "data": [], "error": "Student not found" }
```

**Legacy diff**: Legacy `carnet.js` returns `data` as single row (`resp[0]`); `carnet2.js` returns full array — use full array as spec requires.

---

### 2. GET /soyuteista/schedule

**Controller** — `src/modules/students/students.controller.ts`
```
method : getSchedule(@CurrentUser() user: AuthenticatedUser)
route  : @Get('schedule')
params : email from JWT
```

**Service** — `src/modules/students/students.service.ts`
```
method       : getSchedule(email: string): Promise<ScheduleResponseDto>
Oracle proc  : academico.RETURN_OBJECTS_APP_HORARIO(:email)
transform    : flat H_* rows → { ID, CEDULA, NOMBRE, SEDE, NOMBRE_PROGRAMA,
               CORREO_INSTITUCIONAL, MATERIAS[] }
               NOMBRE = [H_PENG_PRIMERNOMBRE, H_PENG_SEGUNDONOMBRE,
                         H_PENG_PRIMERAPELLIDO, H_PENG_SEGUNDOAPELLIDO]
                         .filter(Boolean).join(' ')
result codes : 1=success, 0=error
```

**Response DTO** — `src/modules/students/dto/schedule.dto.ts`
```typescript
class MateriaDto {
  CODIGO_MATERIA: string;
  NOMBRE_MATERIA: string;
  GRUPO: string;
  DIA: number;           // 1–6 (Mon–Sat)
  HORA_INICIO: string;   // "HH:mm"
  HORA_FINAL: string;    // "HH:mm"
  SALON: string;
  DESCRIPCION: string;
}

class ScheduleDataDto {
  ID: number;
  CEDULA: string;
  NOMBRE: string;
  SEDE: string;
  NOMBRE_PROGRAMA: string;
  CORREO_INSTITUCIONAL: string;
  MATERIAS: MateriaDto[];
}

class ScheduleResponseDto {
  result: 1 | 0;
  data: ScheduleDataDto | null;
}
```

**Response shape** (result=1):
```json
{
  "result": 1,
  "data": {
    "ID": 12345, "CEDULA": "...", "NOMBRE": "...", "SEDE": "...",
    "NOMBRE_PROGRAMA": "...", "CORREO_INSTITUCIONAL": "...",
    "MATERIAS": [{ "CODIGO_MATERIA": "...", "DIA": 1, "..." }]
  }
}
```
**Response shape** (result=0): `{ "result": 0, "data": null }`

**Legacy diff**: Legacy has two procs for schedule (email vs. document-ID); NestJS uses email proc only — QR scan endpoint is absent from frontend.

---

### 3. GET /soyuteista/qualification

**Controller** — `src/modules/students/students.controller.ts`
```
method : getGrades(@CurrentUser() user: AuthenticatedUser)
route  : @Get('qualification')
params : email from JWT
```

**Service** — `src/modules/students/students.service.ts`
```
method       : getGrades(email: string): Promise<GradesResponseDto>
Oracle proc  : academico.RETURN_OBJECTS_APP_NOTAS(:email)
transform    : flat N_* rows → group by N_MATE_NOMBRE → group by N_EVAC_DESCRIPCION
               → leaf: { N_NOTA_DESCRIPCION, N_NOTA_PESO?, N_CALF_VALOR, N_DOCENTE? }
               Computed "DEFINITIVA CORTE" row already in Oracle result (do NOT
               recompute in NestJS unless Oracle omits it — NEEDS VERIFICATION)
result codes : 1=success, 0=error
```

**Response DTO** — `src/modules/students/dto/grades.dto.ts`
```typescript
class InfoCorteDto {
  N_NOTA_DESCRIPCION: string;
  N_NOTA_PESO?: number;
  N_CALF_VALOR: number;
  N_DOCENTE?: string;
}

class InfoMateriaDto {
  corte: string;             // "PRIMER CORTE" | "SEGUNDO CORTE" | "TERCER CORTE" | "NOTA FINAL"
  infoCorte: InfoCorteDto[];
}

class MateriaGradeDto {
  materia: string;
  infoMateria: InfoMateriaDto[];
}

class GradesResponseDto {
  result: 1 | 0;
  data: MateriaGradeDto[];
  error: string;
}
```

**Response shape** (result=1):
```json
{
  "result": 1,
  "data": [{
    "materia": "Cálculo Diferencial",
    "infoMateria": [{
      "corte": "PRIMER CORTE",
      "infoCorte": [
        { "N_NOTA_DESCRIPCION": "AUTOEVALUACIÓN", "N_CALF_VALOR": 4.5 },
        { "N_NOTA_DESCRIPCION": "DEFINITIVA CORTE", "N_CALF_VALOR": 4.1 }
      ]
    }]
  }],
  "error": ""
}
```

**Legacy diff**: Legacy recomputes weighted grade averages in JS; verify if Oracle already returns `"DEFINITIVA CORTE"` rows — if yes, drop the JS computation.

---

### 4. GET /soyuteista/enabled-modules

**Controller** — `src/modules/app-config/app-config.controller.ts`
```
method : getEnabledModules(@CurrentUser() user: AuthenticatedUser)
route  : @Get('enabled-modules')
params : email from JWT
```

**Service** — `src/modules/app-config/app-config.service.ts`
```
method      : getEnabledModules(email: string): Promise<EnabledModulesResponseDto>
query       : SELECT id_modulo, nombre, habilitado FROM modulos
              (legacy queries MySQL with no student filter — NEEDS VERIFICATION:
               confirm whether Oracle has a student-specific module table or if
               the response is the same for all students)
result      : empty array = all modules enabled (frontend default)
```

**Response DTO** — `src/modules/app-config/dto/enabled-modules.dto.ts`
```typescript
class EnabledModuleDto {
  id_modulo: number;
  nombre: string;
  habilitado: 0 | 1;
}

class EnabledModulesResponseDto {
  data: EnabledModuleDto[];
}
```

**Response shape**:
```json
{
  "data": [
    { "id_modulo": 2, "nombre": "Horario", "habilitado": 1 },
    { "id_modulo": 5, "nombre": "Notas", "habilitado": 1 }
  ]
}
```

**Legacy diff**: Legacy queries MySQL `modulos` table (no student join); spec shows Oracle with student join. Resolve before implementing — wrong data source = incorrect module gates.

---

### 5. POST /soyuteista/get-app-basic-info

**Controller** — `src/modules/app-config/app-config.controller.ts`
```
method : getAppBasicInfo(@Body() body: AppBasicInfoQueryDto)
route  : @Post('get-app-basic-info')
params : body.phone_version (string, semver "X.Y.Z")
guard  : MicrosoftJwtGuard NOT required — called before auth (NEEDS VERIFICATION:
          confirm frontend calls this before or after login)
```

**Service** — `src/modules/app-config/app-config.service.ts`
```
method  : getAppBasicInfo(phoneVersion: string): Promise<AppBasicInfoResponseDto>
queries : SELECT C_PARA_VALOR FROM PARAMETROS WHERE C_PARA_CLAVE = :key
          Keys: 'MANTENIMIENTO_ACTIVO', 'MANTENIMIENTO_MSG', 'MANTENIMIENTO_IMAGEN',
                'VERSION_MINIMA', 'UPDATE_MSG', 'CAMPAIGN_ACTIVA', 'CAMPAIGN_MSG', 'CAMPAIGN_IMAGEN'
          version compare: split on '.' → compare integer components
```

**Request DTO** — `src/modules/app-config/dto/app-basic-info-query.dto.ts`
```typescript
class AppBasicInfoQueryDto {
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/)
  phone_version: string;
}
```

**Response DTO** — `src/modules/app-config/dto/app-basic-info.dto.ts`
```typescript
class MaintenanceDto  { is_under_maintenance: 0 | 1; msg: string; image: string; }
class UpdateCheckerDto { is_update_required: 0 | 1;  msg: string; image: string; }
class CampaignDto     { is_campaign_running: 0 | 1;  msg: string; image: string; }

class AppBasicInfoResponseDto {
  maintenance: MaintenanceDto;
  update_checker: UpdateCheckerDto;
  campaign: CampaignDto;
}
```

**Response shape**:
```json
{
  "maintenance":     { "is_under_maintenance": 0, "msg": "", "image": "" },
  "update_checker":  { "is_update_required": 0,   "msg": "", "image": "" },
  "campaign":        { "is_campaign_running": 0,  "msg": "", "image": "" }
}
```

**Legacy diff**: Legacy queries MySQL `configuracion` table; spec shows Oracle `PARAMETROS`. Resolve data source before implementing.

---

## Auth & Security

### MicrosoftJwtGuard — `src/common/guards/microsoft-jwt.guard.ts`

```
library    : jose  (npm i jose)
JWKS URI   : https://login.microsoftonline.com/common/discovery/v2.0/keys
             → cache with jose.createRemoteJWKSet (JWKS is fetched lazily and cached)
validate   : issuer   = 'https://login.microsoftonline.com/common/v2.0'  (or /{tenantId}/v2.0)
             audience = process.env.MICROSOFT_CLIENT_ID  ('6112809e-ef44-4718-be4d-9826c4eb1ed3')
extract    : payload.upn  → student institutional email
             payload.preferred_username as fallback if upn absent
attach     : req.user = { email: payload.upn, ... }
on failure : throw UnauthorizedException (NestJS maps to HTTP 401)
```

### ApiKeyGuard — `src/common/guards/api-key.guard.ts`

```
header     : X-WebServiceUTSAPI-Key
compare    : timingSafeEqual against process.env.UTS_WEBSERVICE_API_KEY
scope      : applied globally; MicrosoftJwtGuard is in addition for student routes
             (maintain backward-compatible API key check during migration period)
             Remove once mobile app is fully migrated to JWT-only auth.
```

### @CurrentUser decorator — `src/common/decorators/current-user.decorator.ts`

```typescript
export const CurrentUser = createParamDecorator(
  (_, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
```

### CORS

```typescript
// main.ts
app.enableCors({
  origin: ['exp://*', 'soyuteista://*'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-WebServiceUTSAPI-Key'],
});
```

### Global Pipe

```typescript
// main.ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

---

## Dependencies

| package | version | reason |
|---|---|---|
| `@nestjs/common` | `^11` | already installed |
| `@nestjs/core` | `^11` | already installed |
| `@nestjs/platform-express` | `^11` | already installed |
| `@nestjs/config` | `^4` | typed env config with Joi validation |
| `@nestjs/throttler` | `^6` | rate limiting (60 req/min per user) |
| `class-validator` | `^0.14` | DTO validation decorators |
| `class-transformer` | `^0.5` | `@Type()` for nested DTO transforms |
| `oracledb` | `^6` | official Oracle driver; requires Oracle Instant Client on server |
| `jose` | `^5` | Microsoft JWT validation + JWKS fetch/cache |
| `joi` | `^17` | env var schema validation for `@nestjs/config` |

---

## Implementation Order

1. **Install dependencies** — `npm i @nestjs/config @nestjs/throttler class-validator class-transformer oracledb jose joi`

2. **DatabaseModule** — `src/database/`  
   `DatabaseService` with `executeQuery<T>()` and connection pool (`poolMin:2, poolMax:10`).  
   Validate Oracle connection before proceeding.

3. **ConfigModule** — `src/config/configuration.ts`  
   Load and validate all env vars with Joi schema (Oracle, Microsoft, API key, port).

4. **MicrosoftJwtGuard + ApiKeyGuard** — `src/common/guards/`  
   Unit-test the guard with a real expired token to confirm error shape before wiring controllers.

5. **StudentsModule — carnet2 endpoint**  
   Simplest endpoint; no transformation. Confirms Oracle connection + guard are wired.

6. **StudentsModule — schedule endpoint**  
   Adds flat-rows → nested transform; validate NOMBRE null-guard.

7. **StudentsModule — qualification endpoint**  
   Most complex transform; verify if Oracle returns "DEFINITIVA CORTE" rows directly.  
   If yes: pass through. If no: implement 3-stage `mapGrades()` in service.

8. **AppConfigModule — get-app-basic-info endpoint** (no auth guard needed if pre-login)  
   Resolve MySQL vs. Oracle data source first (NEEDS VERIFICATION before coding).

9. **AppConfigModule — enabled-modules endpoint**  
   Resolve student-specific vs. global query (NEEDS VERIFICATION before coding).

10. **Global wiring** — `app.module.ts`  
    Register `ThrottlerModule`, `ValidationPipe`, CORS, `GlobalExceptionFilter`.

11. **Smoke test against mobile app**  
    Point mobile dev build at local NestJS; verify all 5 endpoint responses match expected shapes.

12. **Remove legacy API key dependency from mobile app** after JWT auth is confirmed working.
