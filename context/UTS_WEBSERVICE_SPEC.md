# UTS WebService API — Complete Specification for NestJS Rewrite

## Overview

The UTS WebService API is the **primary academic backend** for the SoyUteista 2.0 mobile application. It provides read-only access to student academic records stored in an **Oracle database**.

### Sole Responsibility

This API:
- Retrieves student profile and enrollment data (carnet)
- Returns weekly class schedules
- Serves academic grades by subject and evaluation period
- Provides module/screen enablement status per student
- Returns app-level configuration (maintenance mode, update requirements, campaigns)

### Read-Only Nature

**CRITICAL**: There are no create, update, or delete operations in this API.

- The mobile app never sends student data back to this backend
- All data flows from Oracle → API → Mobile app
- The only write operations would be internal (logging, caching) — not exposed to clients
- Students cannot modify their grades, schedule, or profile through this API

### Oracle Database Connection

- Connects to the existing UTS Oracle database
- Queries pre-existing tables/views for student academic data
- **No new database needed** — reuses existing Oracle infrastructure
- Data is maintained by UTS administrative systems (registrar, academics department)

### Consumer

- **SoyUteista 2.0 Mobile App** (React Native/Expo)
- Consumed via `webserviceAPI` axios instance in `src/api/web-service.api.ts`
- All endpoints require authentication (see Authentication section)

---

## Base URL & Environment

### Current Base URL

```
https://webservice.uts.edu.co/api/v1/production
```

Found in:
- `.env` line 13: `DEV_UTS_WEBSERVICE_API_BASE_URL=https://webservice.uts.edu.co/api/v1/production`
- `.env` line 17: `PROD_UTS_WEBSERVICE_API_BASE_URL=https://webservice.uts.edu.co/api/v1/production`
- `eas.json` lines 14, 29, 47: Same URL

### Environment Variables Required

| Variable Name | Description | Example Value | Required |
|---------------|-------------|---------------|----------|
| `UTS_WEBSERVICE_API_BASE_URL` | Base URL for the WebService | `https://webservice.uts.edu.co/api/v1/production` | Yes |
| `UTS_WEBSERVICE_API_KEY` | API key for WebService authentication | `f910fd9b70mshc4e59787d044bc3p10ea5ejsnbd1f4b7fe6f7` | Yes |
| `UTS_WEBSERVICE_HOST` | Host header value | `webservice.uts.edu.co` | Yes |
| `SECRET_KEY` | AES encryption key for bienestar endpoint | `REACTANDNODEWORKS4EVER!` | Yes |

### Headers Required on Every Request

| Header | Value Source | Purpose |
|--------|--------------|---------|
| `X-WebServiceUTSAPI-Key` | `UTS_WEBSERVICE_API_KEY` env var | API authentication |
| `Host` | `UTS_WEBSERVICE_HOST` env var | Required by the backend server |

### Request Timeout

- **10,000ms (10 seconds)** — configured in `src/api/web-service.api.ts:14`

---

## Authentication Model

### Current Implementation (SECURITY ISSUE)

The current implementation uses a simple API key that is:
- Stored in environment variables (exposed to client in Expo/EAS builds)
- Sent with every request to the UTS WebService
- **Not validated against the Microsoft token**

**Problem**: Anyone with the API key can query any student's data by guessing email addresses.

```typescript
// Current approach in web-service.api.ts
headers: {
  'X-WebServiceUTSAPI-Key': X_WebServiceUTSAPI_Key,
}
```

### New NestJS Backend Authentication

The NestJS backend must implement **proper authentication**:

#### Step 1: Validate Microsoft Token

```typescript
// In a guard or middleware
import * as jose from 'jose';

const MICROSOFT_JWKS_URI = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';

async validateMicrosoftToken(token: string) {
  const JWKS = jose.createRemoteJWKSet(new URL(MICROSOFT_JWKS_URI));
  
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: 'https://login.microsoftonline.com/common/v2.0',
    audience: '6112809e-ef44-4718-be4d-9826c4eb1ed3',
  });
  
  return payload;
}
```

#### Step 2: Extract Student Email from Token

The email from the validated Microsoft token (`upn` claim) becomes the **primary identifier** for all queries.

```typescript
// Extract from JWT claims
const studentEmail = payload.upn; // e.g., "juan.perez@correo.uts.edu.co"
```

#### Step 3: Query Oracle with Student Email

The email is used to look up the student in Oracle:

```sql
-- Example: Get student ID from email
SELECT C_ESTP_ID, C_PENG_EMAILINSTITUCIONAL
FROM ESTUDIANTE_PROGRAMA
WHERE C_PENG_EMAILINSTITUCIONAL = :email
```

### Security Fix Summary

| Current (Vulnerable) | New (Secure) |
|---------------------|--------------|
| API key only | API key + Microsoft JWT validation |
| Email as query param (untrusted) | Email extracted from validated JWT |
| Anyone with API key can query anyone | Only authenticated students can access their own data |

---

## Endpoints — Complete Reference

### [GET] /soyuteista/carnet2/

**Purpose**: Retrieves complete student ID card data including personal info, enrollment status, program details, credits, and GPA.

**Called from**: `CarnetManager.getCarnet()` in `src/services/carnet.service.ts:13`

```typescript
const resp = await webserviceAPI.get<ICarnetResp>(`/soyuteista/carnet2/?email=${email}`);
```

#### Request

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-WebServiceUTSAPI-Key` | string | Yes | API authentication key |
| `Host` | string | Yes | API host |

**Query Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Student's institutional email address (from validated Microsoft token) |

#### Response (Success)

**HTTP Status**: 200

**Result Codes**:

| Code | Meaning |
|------|---------|
| `1` | Success — student found |
| `0` | Error — student not found or query failed |
| `2` | Not matriculado — student exists but is not currently enrolled |
| `69` | Validation error — special case, student cannot access app |

**Success Response (result = 1)**:

```json
{
  "result": 1,
  "data": [
    {
      "C_ESTP_ID": 12345,
      "C_PEGE_DOCUMENTOIDENTIDAD": "1098765432",
      "C_PENG_PRIMERAPELLIDO": "Perez",
      "C_PENG_SEGUNDOAPELLIDO": "Rojas",
      "C_PENG_PRIMERNOMBRE": "Gabriel",
      "C_PENG_SEGUNDONOMBRE": "Andres",
      "C_UNID_NOMBRE": "Santo Domingo",
      "C_PROG_NOMBRE": "Ingenieria de Sistemas",
      "C_FRAN_DESCRIPCION": "Diurna",
      "C_PENS_DESCRIPCION": "Pensum 2021",
      "C_PENS_TOTALCREDITOS": 160,
      "C_ESTP_CREDITOSAPROBADOS": 98,
      "C_AVANCE": 61.25,
      "C_CATE_DESCRIPCION": "Estudiante Regular",
      "C_SITE_DESCRIPCION": "Activo",
      "C_PENG_EMAILINSTITUCIONAL": "gabriel.perez@correo.uts.edu.co",
      "C_ESTP_PROMEDIOGENERAL": 4.2,
      "C_PEUN_FECHAFIN": "2025-12-15"
    }
  ],
  "error": ""
}
```

**Notes**:
- `data` is always an **array** (supports students enrolled in multiple programs)
- Frontend uses `data[0]` as primary profile
- Frontend uses full `data` array for career switching in Carnet screen
- `error` field is always empty string on success

**Error Response (result = 0)**:

```json
{
  "result": 0,
  "data": [],
  "error": "Student not found"
}
```

**Special Responses (result = 2 or 69)**:

```json
{
  "result": 2,
  "data": [],
  "error": "Estudiante no matriculado"
}
```

```json
{
  "result": 69,
  "data": [],
  "error": "Error de validacion"
}
```

#### Oracle Query Hint

```sql
-- Likely from ESTUDIANTE_PROGRAMA view or table
SELECT 
    C_ESTP_ID,
    C_PEGE_DOCUMENTOIDENTIDAD,
    C_PENG_PRIMERAPELLIDO,
    C_PENG_SEGUNDOAPELLIDO,
    C_PENG_PRIMERNOMBRE,
    C_PENG_SEGUNDONOMBRE,
    C_UNID_NOMBRE,
    C_PROG_NOMBRE,
    C_FRAN_DESCRIPCION,
    C_PENS_DESCRIPCION,
    C_PENS_TOTALCREDITOS,
    C_ESTP_CREDITOSAPROBADOS,
    C_AVANCE,
    C_CATE_DESCRIPCION,
    C_SITE_DESCRIPCION,
    C_PENG_EMAILINSTITUCIONAL,
    C_ESTP_PROMEDIOGENERAL,
    C_PEUN_FECHAFIN
FROM ESTUDIANTE_PROGRAMA
WHERE C_PENG_EMAILINSTITUCIONAL = :email
```

#### NestJS Implementation

**Controller**:
```typescript
// students.controller.ts
@Controller('soyuteista')
export class StudentsController {
  constructor(private studentsService: StudentsService) {}

  @Get('carnet2')
  async getCarnet(@Query('email') email: string) {
    return this.studentsService.getCarnet(email);
  }
}
```

**Service**:
```typescript
// students.service.ts
@Injectable()
export class StudentsService {
  async getCarnet(email: string): Promise<ICarnetResp> {
    // 1. Validate email format
    // 2. Query Oracle with email
    // 3. Map Oracle columns to response shape
    // 4. Return with appropriate result code
  }
}
```

**DTO with Validation**:
```typescript
// carnet.dto.ts
export class CarnetDto {
  C_ESTP_ID: number;
  C_PEGE_DOCUMENTOIDENTIDAD: string;
  C_PENG_PRIMERAPELLIDO: string;
  C_PENG_SEGUNDOAPELLIDO?: string;
  C_PENG_PRIMERNOMBRE: string;
  C_PENG_SEGUNDONOMBRE?: string;
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

export class CarnetResponseDto {
  result: number;
  data: CarnetDto[];
  error: string;
}

export class CarnetQueryDto {
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @IsNotEmpty()
  email: string;
}
```

---

### [GET] /soyuteista/schedule/

**Purpose**: Retrieves the student's weekly class schedule organized by day and time.

**Called from**: `HorarioEstudiante.getHorario()` in `src/services/horario.service.ts:13`

```typescript
const resp = await webserviceAPI.get<IHorarioResp>(`/soyuteista/schedule/?email=${email}`);
```

#### Request

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-WebServiceUTSAPI-Key` | string | Yes | API authentication key |
| `Host` | string | Yes | API host |

**Query Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Student's institutional email address |

#### Response (Success)

**HTTP Status**: 200

**Result Codes**:

| Code | Meaning |
|------|---------|
| `1` | Success |
| `0` | Error |

**Success Response (result = 1)**:

```json
{
  "result": 1,
  "data": {
    "ID": 12345,
    "CEDULA": "1098765432",
    "NOMBRE": "Gabriel Andrés Pérez Rojas",
    "SEDE": "Santo Domingo",
    "NOMBRE_PROGRAMA": "Ingeniería de Sistemas",
    "CORREO_INSTITUCIONAL": "gabriel.perez@correo.uts.edu.co",
    "MATERIAS": [
      {
        "CODIGO_MATERIA": "CAL-101",
        "NOMBRE_MATERIA": "Cálculo Diferencial",
        "GRUPO": "A",
        "DIA": 1,
        "HORA_INICIO": "07:00",
        "HORA_FINAL": "09:00",
        "SALON": "A-201",
        "DESCRIPCION": "Teórico"
      },
      {
        "CODIGO_MATERIA": "CAL-101",
        "NOMBRE_MATERIA": "Cálculo Diferencial",
        "GRUPO": "A",
        "DIA": 1,
        "HORA_INICIO": "09:00",
        "HORA_FINAL": "11:00",
        "SALON": "LAB-03",
        "DESCRIPCION": "Laboratorio"
      }
    ]
  }
}
```

**Field Details**:

| Field | Type | Description |
|-------|------|-------------|
| `ID` | number | Student enrollment ID |
| `CEDULA` | string | Identity document number |
| `NOMBRE` | string | Full student name |
| `SEDE` | string | Campus/location name |
| `NOMBRE_PROGRAMA` | string | Academic program name |
| `CORREO_INSTITUCIONAL` | string | Institutional email |
| `MATERIAS` | array | List of scheduled classes |

**MATERIAS Array Elements**:

| Field | Type | Description | Possible Values |
|-------|------|-------------|-----------------|
| `CODIGO_MATERIA` | string | Course code | e.g., "CAL-101", "PRO-101" |
| `NOMBRE_MATERIA` | string | Course name | e.g., "Cálculo Diferencial" |
| `GRUPO` | string | Group/section | e.g., "A", "B", "1" |
| `DIA` | number | Day of week | 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday |
| `HORA_INICIO` | string | Start time | 24-hour format: "07:00", "14:00" |
| `HORA_FINAL` | string | End time | 24-hour format: "09:00", "16:00" |
| `SALON` | string | Room/lab | e.g., "A-201", "LAB-03" |
| `DESCRIPCION` | string | Class type | "Teórico", "Laboratorio", "Taller" |

**Notes**:
- `MATERIAS` can be empty if student has no scheduled classes
- `DIA` values 1-6 map to Monday through Saturday
- Time is stored as string in "HH:mm" format
- Multiple entries for same course (different times/rooms) indicate multiple sessions per week

**Error Response (result = 0)**:

```json
{
  "result": 0,
  "data": null
}
```

#### Oracle Query Hint

```sql
-- Likely from HORARIO or HORARIO_ESTUDIANTE table
SELECT 
    e.C_ESTP_ID as ID,
    e.C_PEGE_DOCUMENTOIDENTIDAD as CEDULA,
    e.C_PENG_PRIMERNOMBRE || ' ' || e.C_PENG_SEGUNDOAPELLIDO as NOMBRE,
    u.C_UNID_NOMBRE as SEDE,
    p.C_PROG_NOMBRE as NOMBRE_PROGRAMA,
    e.C_PENG_EMAILINSTITUCIONAL as CORREO_INSTITUCIONAL,
    h.CODIGO_MATERIA,
    h.NOMBRE_MATERIA,
    h.GRUPO,
    h.DIA,
    h.HORA_INICIO,
    h.HORA_FINAL,
    h.SALON,
    h.DESCRIPCION
FROM ESTUDIANTE_PROGRAMA e
JOIN HORARIO h ON e.C_ESTP_ID = h.C_ESTP_ID
JOIN UNIDAD u ON e.C_UNID_ID = u.C_UNID_ID
JOIN PROGRAMA p ON e.C_PROG_ID = p.C_PROG_ID
WHERE e.C_PENG_EMAILINSTITUCIONAL = :email
ORDER BY h.DIA, h.HORA_INICIO
```

#### NestJS Implementation

**Controller**:
```typescript
@Get('schedule')
async getSchedule(@Query('email') email: string) {
  return this.studentsService.getSchedule(email);
}
```

**Service**:
```typescript
async getSchedule(email: string): Promise<IHorarioResp> {
  // 1. Query Oracle for student + schedule
  // 2. Transform flat rows into nested MATERIAS array
  // 3. Return with result code
}
```

**DTO with Validation**:
```typescript
// schedule.dto.ts
export class MateriaDto {
  @IsString()
  @IsNotEmpty()
  CODIGO_MATERIA: string;

  @IsString()
  @IsNotEmpty()
  NOMBRE_MATERIA: string;

  @IsString()
  @IsNotEmpty()
  GRUPO: string;

  @IsInt()
  @Min(1)
  @Max(6)
  DIA: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be HH:mm format' })
  HORA_INICIO: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be HH:mm format' })
  HORA_FINAL: string;

  @IsString()
  @IsNotEmpty()
  SALON: string;

  @IsString()
  @IsNotEmpty()
  DESCRIPCION: string;
}

export class UserDataDto {
  @IsNumber()
  ID: number;

  @IsString()
  CEDULA: string;

  @IsString()
  NOMBRE: string;

  @IsString()
  SEDE: string;

  @IsString()
  NOMBRE_PROGRAMA: string;

  @IsEmail()
  CORREO_INSTITUCIONAL: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MateriaDto)
  MATERIAS: MateriaDto[];
}

export class ScheduleResponseDto {
  result: number;
  data: UserDataDto;
}
```

---

### [GET] /soyuteista/qualification/

**Purpose**: Retrieves student's academic grades organized by subject and evaluation period (corte).

**Called from**: `NotasEstudiante.getAll()` in `src/services/notas.service.ts:13`

```typescript
const resp = await webserviceAPI.get<INotasResp>(`/soyuteista/qualification/?email=${email}`);
```

#### Request

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-WebServiceUTSAPI-Key` | string | Yes | API authentication key |
| `Host` | string | Yes | API host |

**Query Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Student's institutional email address |

#### Response (Success)

**HTTP Status**: 200

**Result Codes**:

| Code | Meaning |
|------|---------|
| `1` | Success |
| `0` | Error |

**Success Response (result = 1)**:

```json
{
  "result": 1,
  "data": [
    {
      "materia": "Cálculo Diferencial",
      "infoMateria": [
        {
          "corte": "PRIMER CORTE",
          "infoCorte": [
            {
              "N_NOTA_DESCRIPCION": "AUTOEVALUACIÓN",
              "N_CALF_VALOR": 4.5
            },
            {
              "N_NOTA_DESCRIPCION": "TAREAS TIEMPO INDEPENDIENTE",
              "N_NOTA_PESO": 20,
              "N_CALF_VALOR": 4.2
            },
            {
              "N_NOTA_DESCRIPCION": "EVALULACIÓN DEL CORTE",
              "N_NOTA_PESO": 30,
              "N_CALF_VALOR": 4.0,
              "N_DOCENTE": "Dr. Carlos Mendoza"
            },
            {
              "N_NOTA_DESCRIPCION": "DEFINITIVA CORTE",
              "N_CALF_VALOR": 4.1
            }
          ]
        },
        {
          "corte": "SEGUNDO CORTE",
          "infoCorte": [...]
        }
      ]
    }
  ],
  "error": ""
}
```

**Data Structure**:

```
data (IMaterias[])
├── materia: string (course name)
└── infoMateria (IInfoMateria[])
    ├── corte: ECorte (evaluation period)
    │   └── infoCorte (IInfoCorte[])
    │       ├── N_NOTA_DESCRIPCION: string (grade type)
    │       ├── N_NOTA_PESO?: number (weight %)
    │       ├── N_CALF_VALOR: number (grade value)
    │       └── N_DOCENTE?: string (instructor)
```

**Evaluation Periods (ECorte)**:

| Value | Description |
|-------|-------------|
| `"PRIMER CORTE"` | First evaluation period |
| `"SEGUNDO CORTE"` | Second evaluation period |
| `"TERCER CORTE"` | Third evaluation period |
| `"NOTA FINAL"` | Final grade |

**Grade Types (ENotaDescripcion)**:

| Value | Description |
|-------|-------------|
| `"AUTOEVALUACIÓN"` | Self-evaluation grade |
| `"TAREAS TIEMPO INDEPENDIENTE"` | Homework/independent work |
| `"EVALULACIÓN DEL CORTE"` | Period exam |
| `"DEFINITIVA CORTE"` | Period final grade (weighted average) |

**Grade Scale**: 0.0 to 5.0 (typical Latin American grading system)

**Notes**:
- `data` can be empty array if student has no grades
- Each subject (`materia`) contains multiple `infoMateria` entries (one per corte)
- Each `infoCorte` array contains 4 grade entries per standard evaluation
- `N_NOTA_PESO` represents the percentage weight of that grade component
- `N_DOCENTE` is optional and may not appear for all grades

#### Oracle Query Hint

```sql
-- Likely from NOTAS or CALIFICACIONES table
SELECT 
    m.C_MATE_NOMBRE as materia,
    n.N_EVAC_DESCRIPCION as corte,
    n.N_NOTA_DESCRIPCION,
    n.N_NOTA_PESO,
    n.N_CALF_VALOR,
    d.C_DOCE_NOMBRE || ' ' || d.C_DOCE_APELLIDO as N_DOCENTE
FROM ESTUDIANTE_PROGRAMA e
JOIN NOTAS n ON e.C_ESTP_ID = n.C_ESTP_ID
JOIN MATERIA m ON n.C_MATE_ID = m.C_MATE_ID
LEFT JOIN DOCENTE d ON n.C_DOCE_ID = d.C_DOCE_ID
WHERE e.C_PENG_EMAILINSTITUCIONAL = :email
ORDER BY m.C_MATE_NOMBRE, n.N_EVAC_ORDEN, n.N_NOTA_ORDEN
```

#### NestJS Implementation

**Controller**:
```typescript
@Get('qualification')
async getGrades(@Query('email') email: string) {
  return this.studentsService.getGrades(email);
}
```

**Service**:
```typescript
async getGrades(email: string): Promise<INotasResp> {
  // 1. Query Oracle for all grades
  // 2. Transform flat rows into nested structure:
  //    materia -> infoMateria (grouped by corte) -> infoCorte (grades)
  // 3. Map Oracle columns to response shape
}
```

**DTO with Validation**:
```typescript
// grades.dto.ts
export enum ECorte {
  NotaFinal = "NOTA FINAL",
  PrimerCorte = "PRIMER CORTE",
  SegundoCorte = "SEGUNDO CORTE",
  TercerCorte = "TERCER CORTE",
}

export enum ENotaDescripcion {
  Autoevaluación = "AUTOEVALUACIÓN",
  DefinitivaCorte = "DEFINITIVA CORTE",
  EvalulaciónDelCorte = "EVALULACIÓN DEL CORTE",
  TareasTiempoIndependiente = "TAREAS TIEMPO INDEPENDIENTE",
}

export class InfoCorteDto {
  @IsString()
  @IsNotEmpty()
  N_NOTA_DESCRIPCION: ENotaDescripcion;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  N_NOTA_PESO?: number;

  @IsNumber()
  @Min(0)
  @Max(5)
  N_CALF_VALOR: number;

  @IsOptional()
  @IsString()
  N_DOCENTE?: string;

  @IsOptional()
  @IsNumber()
  N_ESTP_ID?: number;

  @IsOptional()
  @IsString()
  N_MATE_CODIGOMATERIA?: string;
}

export class InfoMateriaDto {
  @IsString()
  @IsEnum(ECorte)
  corte: ECorte;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InfoCorteDto)
  infoCorte: InfoCorteDto[];
}

export class MateriasDto {
  @IsString()
  @IsNotEmpty()
  materia: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InfoMateriaDto)
  infoMateria: InfoMateriaDto[];
}

export class GradesResponseDto {
  @IsNumber()
  result: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MateriasDto)
  data: MateriasDto[];

  @IsString()
  error: string;
}
```

---

### [GET] /soyuteista/enabled-modules/

**Purpose**: Retrieves which app screens/modules are enabled or disabled for the authenticated student.

**Called from**: `EnabledScreensService.getAll()` in `src/services/enable-screens.service.ts:13`

```typescript
const resp = await webserviceAPI.get<IRespEnable>(`/soyuteista/enabled-modules/?email=${email}`);
```

#### Request

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-WebServiceUTSAPI-Key` | string | Yes | API authentication key |
| `Host` | string | Yes | API host |

**Query Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Student's institutional email address |

#### Response (Success)

**HTTP Status**: 200

**Success Response**:

```json
{
  "data": [
    { "id_modulo": 2, "nombre": "Horario", "habilitado": 1 },
    { "id_modulo": 3, "nombre": "Carnet", "habilitado": 1 },
    { "id_modulo": 4, "nombre": "Perfil", "habilitado": 1 },
    { "id_modulo": 5, "nombre": "Notas", "habilitado": 1 },
    { "id_modulo": 6, "nombre": "Revista", "habilitado": 1 }
  ]
}
```

**Module IDs and Names**:

| id_modulo | nombre | Screen |
|-----------|--------|--------|
| 1 | Inicio | Home/News (REMOVED) |
| 2 | Horario | Schedule |
| 3 | Carnet | Student ID |
| 4 | Perfil | Profile |
| 5 | Notas | Grades |
| 6 | Revista | Magazine |
| 7 | Agenda | Institutional Agenda (REMOVED) |

**habilitado Values**:

| Value | Meaning |
|-------|---------|
| `0` | Module is disabled for this student |
| `1` | Module is enabled for this student |

**Notes**:
- If a module is NOT in the array, the frontend treats it as **enabled by default**
- The backend only returns exceptions (disabled modules)
- Frontend `enableChecker()` function returns: 0 (disabled), 1 (enabled), 2 (not in list = enabled)
- Module ID 1 (Inicio) and 7 (Agenda) have been removed from the app but may still exist in data

#### Oracle Query Hint

```sql
-- Likely from MODULOS_HABILITADOS or MODULO_ESTUDIANTE table
SELECT 
    m.C_MODU_ID as id_modulo,
    m.C_MODU_NOMBRE as nombre,
    me.C_MOES_HABILITADO as habilitado
FROM MODULO m
JOIN MODULO_ESTUDIANTE me ON m.C_MODU_ID = me.C_MODU_ID
JOIN ESTUDIANTE_PROGRAMA e ON me.C_ESTP_ID = e.C_ESTP_ID
WHERE e.C_PENG_EMAILINSTITUCIONAL = :email
  AND me.C_MOES_HABILITADO = 0
```

#### NestJS Implementation

**Controller**:
```typescript
@Get('enabled-modules')
async getEnabledModules(@Query('email') email: string) {
  return this.appConfigService.getEnabledModules(email);
}
```

**Service**:
```typescript
async getEnabledModules(email: string): Promise<IRespEnable> {
  // Query Oracle for disabled modules only
  // Return array; if empty, all modules are enabled
}
```

**DTO with Validation**:
```typescript
// enabled-modules.dto.ts
export class EnableDto {
  @IsNumber()
  @IsPositive()
  id_modulo: number;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsNumber()
  @IsIn([0, 1])
  habilitado: number;
}

export class EnabledModulesResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnableDto)
  data: EnableDto[];
}
```

---

### [POST] /soyuteista/get-app-basic-info

**Purpose**: Returns app-level configuration including maintenance status, update requirements, and active campaigns.

**Called from**: `BootBasicInfo.getAll()` in `src/services/boot-basic-info.service.ts:30`

```typescript
const resp = await webserviceAPI.post<IAPPBootBasicInfo>(
  `/soyuteista/get-app-basic-info`,
  { phone_version: '22.0.0' }
);
```

#### Request

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-WebServiceUTSAPI-Key` | string | Yes | API authentication key |
| `Host` | string | Yes | API host |
| `Content-Type` | string | Yes | `application/json` |

**Body**:

```json
{
  "phone_version": "22.0.0"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phone_version` | string | Yes | Current app version from device (e.g., "22.0.0") |

#### Response (Success)

**HTTP Status**: 200

**Success Response**:

```json
{
  "maintenance": {
    "is_under_maintenance": 0,
    "msg": "",
    "image": ""
  },
  "update_checker": {
    "is_update_required": 0,
    "msg": "",
    "image": ""
  },
  "campaign": {
    "is_campaign_running": 0,
    "msg": "",
    "image": ""
  }
}
```

**Flag Values**:

| Section | Field | Values | Meaning |
|---------|-------|--------|---------|
| `maintenance` | `is_under_maintenance` | `0` | App is operational |
| `maintenance` | `is_under_maintenance` | `1` | App is under maintenance |
| `update_checker` | `is_update_required` | `0` | No update needed |
| `update_checker` | `is_update_required` | `1` | Update is required |
| `campaign` | `is_campaign_running` | `0` | No active campaign |
| `campaign` | `is_campaign_running` | `1` | Campaign is active |

**Optional Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `msg` | string | Message to display in dialog |
| `image` | string | URL to image to display in dialog |

**Notes**:
- Frontend shows dialogs in order: maintenance, then update, then campaign
- Only ONE dialog is shown at a time
- After one dialog is shown, the check stops
- Empty strings for `msg` and `image` mean no custom content
- `phone_version` is used to compare against required version for update check

#### Oracle Query Hint

```sql
-- Likely from CONFIGURACION_APP or PARAMETROS table
SELECT 
    (SELECT C_PARA_VALOR FROM PARAMETROS WHERE C_PARA_CLAVE = 'MANTENIMIENTO_ACTIVO') as is_under_maintenance,
    (SELECT C_PARA_VALOR FROM PARAMETROS WHERE C_PARA_CLAVE = 'MANTENIMIENTO_MSG') as maintenance_msg,
    (SELECT C_PARA_VALOR FROM PARAMETROS WHERE C_PARA_CLAVE = 'MANTENIMIENTO_IMAGEN') as maintenance_image,
    -- Similar for UPDATE and CAMPAIGN
    CASE 
        WHEN :phone_version < (SELECT C_PARA_VALOR FROM PARAMETROS WHERE C_PARA_CLAVE = 'VERSION_MINIMA') 
        THEN 1 ELSE 0 
    END as is_update_required,
    (SELECT C_PARA_VALOR FROM PARAMETROS WHERE C_PARA_CLAVE = 'UPDATE_MSG') as update_msg,
    (SELECT C_PARA_VALOR FROM PARAMETROS WHERE C_PARA_CLAVE = 'CAMPAIGN_ACTIVA') as is_campaign_running
FROM DUAL
```

#### NestJS Implementation

**Controller**:
```typescript
@Post('get-app-basic-info')
async getAppBasicInfo(@Body() body: AppBasicInfoQueryDto) {
  return this.appConfigService.getAppBasicInfo(body.phone_version);
}
```

**Service**:
```typescript
async getAppBasicInfo(phoneVersion: string): Promise<IAPPBootBasicInfo> {
  // 1. Check maintenance status
  // 2. Compare phone_version with minimum required version
  // 3. Check for active campaigns
  // 4. Return combined response
}
```

**DTO with Validation**:
```typescript
// app-basic-info.dto.ts
export class CommonInfoDto {
  @IsNumber()
  @IsIn([0, 1])
  is_under_maintenance: number;

  @IsOptional()
  @IsString()
  msg?: string;

  @IsOptional()
  @IsString()
  image?: string;
}

export class UpdateInfoDto {
  @IsNumber()
  @IsIn([0, 1])
  is_update_required: number;

  @IsOptional()
  @IsString()
  msg?: string;

  @IsOptional()
  @IsString()
  image?: string;
}

export class CampaignInfoDto {
  @IsNumber()
  @IsIn([0, 1])
  is_campaign_running: number;

  @IsOptional()
  @IsString()
  msg?: string;

  @IsOptional()
  @IsString()
  image?: string;
}

export class AppBasicInfoQueryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'Version must be X.Y.Z format' })
  phone_version: string;
}

export class AppBasicInfoResponseDto {
  @ValidateNested()
  @Type(() => CommonInfoDto)
  maintenance: CommonInfoDto;

  @ValidateNested()
  @Type(() => UpdateInfoDto)
  update_checker: UpdateInfoDto;

  @ValidateNested()
  @Type(() => CampaignInfoDto)
  campaign: CampaignInfoDto;
}
```

---

## Data Models — Oracle Field Analysis

### 1. Student / Carnet Entity (C_ prefix)

**Source**: `src/models/carnet.model.ts`

| Field | TypeScript Type | Oracle Column | Type | Description | Nullable |
|-------|-----------------|---------------|------|-------------|----------|
| `C_ESTP_ID` | `number` | `C_ESTP_ID` | `NUMBER(10)` | Primary enrollment ID | No |
| `C_PEGE_DOCUMENTOIDENTIDAD` | `string` | `C_PEGE_DOCUMENTOIDENTIDAD` | `VARCHAR2(50)` | Identity document (CEDULA) | No |
| `C_PENG_PRIMERAPELLIDO` | `string` | `C_PENG_PRIMERAPELLIDO` | `VARCHAR2(100)` | First last name | No |
| `C_PENG_SEGUNDOAPELLIDO` | `string` | `C_PENG_SEGUNDOAPELLIDO` | `VARCHAR2(100)` | Second last name | Yes |
| `C_PENG_PRIMERNOMBRE` | `string` | `C_PENG_PRIMERNOMBRE` | `VARCHAR2(100)` | First name | No |
| `C_PENG_SEGUNDONOMBRE` | `string` | `C_PENG_SEGUNDONOMBRE` | `VARCHAR2(100)` | Middle name | Yes |
| `C_UNID_NOMBRE` | `string` | `C_UNID_NOMBRE` | `VARCHAR2(255)` | Campus/unit name | No |
| `C_PROG_NOMBRE` | `string` | `C_PROG_NOMBRE` | `VARCHAR2(255)` | Program name | No |
| `C_FRAN_DESCRIPCION` | `string` | `C_FRAN_DESCRIPCION` | `VARCHAR2(100)` | Schedule shift (Diurna/Nocturna) | No |
| `C_PENS_DESCRIPCION` | `string` | `C_PENS_DESCRIPCION` | `VARCHAR2(255)` | Curriculum/pensum version | No |
| `C_PENS_TOTALCREDITOS` | `number` | `C_PENS_TOTALCREDITOS` | `NUMBER(3)` | Total credits required | No |
| `C_ESTP_CREDITOSAPROBADOS` | `number` | `C_ESTP_CREDITOSAPROBADOS` | `NUMBER(3)` | Credits completed | No |
| `C_AVANCE` | `number` | `C_AVANCE` | `NUMBER(5,2)` | Progress % (calculated) | No |
| `C_CATE_DESCRIPCION` | `string` | `C_CATE_DESCRIPCION` | `VARCHAR2(100)` | Student category | No |
| `C_SITE_DESCRIPCION` | `string` | `C_SITE_DESCRIPCION` | `VARCHAR2(100)` | Enrollment status | No |
| `C_PENG_EMAILINSTITUCIONAL` | `string` | `C_PENG_EMAILINSTITUCIONAL` | `VARCHAR2(255)` | Institutional email | No |
| `C_ESTP_PROMEDIOGENERAL` | `number` | `C_ESTP_PROMEDIOGENERAL` | `NUMBER(3,2)` | Overall GPA | No |
| `C_PEUN_FECHAFIN` | `string` | `C_PEUN_FECHAFIN` | `DATE` | Enrollment end date | No |

**Likely Table**: `ESTUDIANTE_PROGRAMA` (student-program enrollment)

**Key Relationships**:
- `C_ESTP_ID` → Primary key, links to grades, schedule
- `C_PENG_EMAILINSTITUCIONAL` → Lookup key from Microsoft token

---

### 2. Schedule / Materia Entity (no prefix)

**Source**: `src/screens/schedule-day/models/materia-horario.model.ts`

| Field | TypeScript Type | Oracle Column | Type | Description | Nullable |
|-------|-----------------|---------------|------|-------------|----------|
| `CODIGO_MATERIA` | `string` | `CODIGO_MATERIA` | `VARCHAR2(20)` | Course code | No |
| `NOMBRE_MATERIA` | `string` | `NOMBRE_MATERIA` | `VARCHAR2(255)` | Course name | No |
| `GRUPO` | `string` | `GRUPO` | `VARCHAR2(10)` | Group/section | No |
| `DIA` | `number` | `DIA` | `NUMBER(1)` | Day of week (1-6) | No |
| `HORA_INICIO` | `string` | `HORA_INICIO` | `VARCHAR2(5)` | Start time HH:MM | No |
| `HORA_FINAL` | `string` | `HORA_FINAL` | `VARCHAR2(5)` | End time HH:MM | No |
| `SALON` | `string` | `SALON` | `VARCHAR2(50)` | Room/lab | No |
| `DESCRIPCION` | `string` | `DESCRIPCION` | `VARCHAR2(50)` | Class type | No |

**Likely Table**: `HORARIO` or `HORARIO_ESTUDIANTE`

---

### 3. Grades / Notas Entity (N_ prefix)

**Source**: `src/models/notas.model.ts`

| Field | TypeScript Type | Oracle Column | Type | Description | Nullable |
|-------|-----------------|---------------|------|-------------|----------|
| `N_ESTP_ID` | `number` | `C_ESTP_ID` | `NUMBER(10)` | Enrollment ID | Yes |
| `N_PEGE_DOCUMENTOIDENTIDAD` | `string` | `C_PEGE_DOCUMENTOIDENTIDAD` | `VARCHAR2(50)` | CEDULA | Yes |
| `N_PENG_PRIMERAPELLIDO` | `string` | `C_PENG_PRIMERAPELLIDO` | `VARCHAR2(100)` | Last name | Yes |
| `N_PENG_SEGUNDOAPELLIDO` | `string` | `C_PENG_SEGUNDOAPELLIDO` | `VARCHAR2(100)` | Second last name | Yes |
| `N_PENG_PRIMERNOMBRE` | `string` | `C_PENG_PRIMERNOMBRE` | `VARCHAR2(100)` | First name | Yes |
| `N_PENG_SEGUNDONOMBRE` | `string` | `C_PENG_SEGUNDONOMBRE` | `VARCHAR2(100)` | Middle name | Yes |
| `N_PROG_NOMBRE` | `string` | `C_PROG_NOMBRE` | `VARCHAR2(255)` | Program name | Yes |
| `N_UNID_NOMBRE` | `string` | `C_UNID_NOMBRE` | `VARCHAR2(255)` | Campus | Yes |
| `N_MATE_CODIGOMATERIA` | `string` | `C_MATE_CODIGO` | `VARCHAR2(20)` | Course code | Yes |
| `N_MATE_NOMBRE` | `string` | `C_MATE_NOMBRE` | `VARCHAR2(255)` | Course name | Yes |
| `N_GRUP_NOMBRE` | `string` | `C_GRUP_NOMBRE` | `VARCHAR2(10)` | Group name | Yes |
| `N_EVAC_DESCRIPCION` | `string` | `C_EVAC_DESCRIPCION` | `VARCHAR2(50)` | Evaluation period | Yes |
| `N_NOTA_DESCRIPCION` | `string` | `C_NOTA_DESCRIPCION` | `VARCHAR2(100)` | Grade type | No |
| `N_NOTA_PESO` | `number` | `C_NOTA_PESO` | `NUMBER(3)` | Weight percentage | Yes |
| `N_CALF_VALOR` | `number` | `C_CALF_VALOR` | `NUMBER(3,2)` | Grade value (0-5) | No |
| `N_DOCENTE` | `string` | `C_DOCE_NOMBRE \|\| ' ' \|\| C_DOCE_APELLIDO` | `VARCHAR2(255)` | Instructor full name | Yes |
| `N_EVAC_ID` | `number` | `C_EVAC_ID` | `NUMBER(10)` | Evaluation ID | Yes |

**Likely Table**: `NOTAS` or `CALIFICACIONES`

**Note**: The `N_` prefix suggests these are "Nota" (grade) related columns, possibly from a different view or denormalized table that joins student and grade data.

---

### 4. Enabled Modules Entity

**Source**: `src/screens/temp/models/enable.model.ts`

| Field | TypeScript Type | Oracle Column | Type | Description | Nullable |
|-------|-----------------|---------------|------|-------------|----------|
| `id_modulo` | `number` | `C_MODU_ID` | `NUMBER(5)` | Module ID | No |
| `nombre` | `string` | `C_MODU_NOMBRE` | `VARCHAR2(100)` | Module display name | No |
| `habilitado` | `number` | `C_MOES_HABILITADO` | `NUMBER(1)` | Enabled flag (0/1) | No |

**Likely Tables**: `MODULO` + `MODULO_ESTUDIANTE` (junction)

---

### 5. App Config Entity

**Source**: `src/services/boot-basic-info.service.ts`

| Field | TypeScript Type | Oracle Column | Type | Description | Nullable |
|-------|-----------------|---------------|------|-------------|----------|
| `is_under_maintenance` | `number` | `C_PARA_VALOR` (clave='MANTENIMIENTO_ACTIVO') | `NUMBER(1)` | Maintenance flag | No |
| `msg` | `string` | `C_PARA_VALOR` (clave='MANTENIMIENTO_MSG') | `VARCHAR2(1000)` | Maintenance message | Yes |
| `image` | `string` | `C_PARA_VALOR` (clave='MANTENIMIENTO_IMAGEN') | `VARCHAR2(500)` | Maintenance image URL | Yes |
| `is_update_required` | `number` | Computed: phone_version < VERSION_MINIMA | `NUMBER(1)` | Update required flag | No |
| `is_campaign_running` | `number` | `C_PARA_VALOR` (clave='CAMPAIGN_ACTIVA') | `NUMBER(1)` | Campaign flag | No |

**Likely Table**: `PARAMETROS` or `CONFIGURACION_APP`

---

## Field Naming Conventions

Understanding the Oracle schema through field prefixes:

### C_ Prefix — Core/Tabla (Main Tables)

Prefix `C_` appears on fields from main entity tables:

| Prefix | Example | Likely Table |
|--------|---------|--------------|
| `C_ESTP_` | `C_ESTP_ID`, `C_ESTP_CREDITOSAPROBADOS` | ESTUDIANTE (Student) |
| `C_PENG_` | `C_PENG_PRIMERNOMBRE`, `C_PENG_EMAILINSTITUCIONAL` | PERSONA (Person) |
| `C_PROG_` | `C_PROG_NOMBRE` | PROGRAMA (Program/Career) |
| `C_PENS_` | `C_PENS_DESCRIPCION`, `C_PENS_TOTALCREDITOS` | PENSUM (Curriculum) |
| `C_UNID_` | `C_UNID_NOMBRE` | UNIDAD (Campus/Unit) |
| `C_MATE_` | `C_MATE_NOMBRE`, `C_MATE_CODIGO` | MATERIA (Course) |
| `C_DOCE_` | `C_DOCE_NOMBRE` | DOCENTE (Instructor) |
| `C_FRAN_` | `C_FRAN_DESCRIPCION` | FRANJA (Time slot/Shift) |
| `C_CATE_` | `C_CATE_DESCRIPCION` | CATEGORIA (Category) |
| `C_SITE_` | `C_SITE_DESCRIPCION` | SITUACION (Status) |
| `C_MODU_` | `C_MODU_ID`, `C_MODU_NOMBRE` | MODULO (Module) |
| `C_PARA_` | `C_PARA_CLAVE`, `C_PARA_VALOR` | PARAMETRO (Parameter) |
| `C_PEGE_` | `C_PEGE_DOCUMENTOIDENTIDAD` | PERSONA_GENERAL (General Person data) |

### N_ Prefix — Nota/Grade Data

Prefix `N_` appears on fields from grade/evaluation tables:

| Prefix | Example | Description |
|--------|---------|-------------|
| `N_` | `N_CALF_VALOR`, `N_NOTA_DESCRIPCION` | Nota/Grade columns |
| `N_EVAC_` | `N_EVAC_DESCRIPCION`, `N_EVAC_ID` | Evaluacion/Corte (Evaluation period) |
| `N_DOCE_` | `N_DOCENTE` | Instructor (joined from DOCENTE) |

### No Prefix — Schedule Data

Fields in schedule/materia use no prefix, suggesting they come from a denormalized view or legacy table:

| Field | Example | Description |
|-------|---------|-------------|
| `CODIGO_MATERIA` | Direct column name | Course code |
| `NOMBRE_MATERIA` | Direct column name | Course name |
| `HORA_INICIO`, `HORA_FINAL` | Direct column name | Time fields |

### ID Pattern

| Pattern | Example | Meaning |
|---------|---------|---------|
| `C_*_ID` | `C_ESTP_ID`, `C_PROG_ID` | Foreign key to entity table |
| `C_PEGE_` | `C_PEGE_DOCUMENTOIDENTIDAD` | Person General entity reference |

---

## Business Rules Embedded in Frontend

### 1. Result Code Meanings

**Carnet Endpoint (result field)**:

| Code | Frontend Behavior | Backend Implication |
|------|-------------------|---------------------|
| `1` | Success, proceed to app | Student found and enrolled |
| `0` | Error, show empty state | Student not found or query failed |
| `2` | "Not matriculado" message, reject login | Student exists but not enrolled in current period |
| `69` | Error message, reject login | Special validation failure |

**Schedule/Grades Endpoints**:

| Code | Meaning |
|------|---------|
| `1` | Success |
| `0` | Error or no data |

### 2. Special Student Status Handling

From `auth.context.tsx:44` and `:67`:

```typescript
if (rep.user!.userResult !== 2 && rep.user!.userResult !== 69) {
  // Allow login
}
```

**Rule**: Students with `result === 2` or `result === 69` are NOT allowed to access the app.

### 3. Module Enable/Disable Logic

From `src/navigator/left-drawer-navigator/hooks/use-enable-screens.hook.ts`:

```typescript
const enableChecker = (data: IEnable[], screenStr: string): number => {
  const found = data.find(item => item.nombre === screenStr);
  if (!found) return 2; // Not in list = enabled (default)
  return found.habilitado; // Return 0 (disabled) or 1 (enabled)
};
```

**Rule**:
- If module NOT in response → enabled (return 2)
- If module in response with `habilitado=1` → enabled
- If module in response with `habilitado=0` → disabled

### 4. Multi-Career Support

From `auth.context.tsx:106-107`:

```typescript
userMoreInfo: dataValue!.data[0],    // First program (primary)
userMoreInfo2: dataValue!.data,       // All programs (for switching)
```

**Rule**: Backend returns ALL programs for a student. Frontend uses first as primary.

### 5. GPA Threshold (Removed Feature)

From context docs: "Students with GPA < 3.5 see 'Éxito Escolar' dialog on first login"

**Current Status**: Feature has been removed from app but data exists.

### 6. Empty Arrays vs Null

| Scenario | Response |
|----------|----------|
| No grades | `"data": []` |
| No schedule | `"data": { "MATERIAS": [] }` |
| No enabled modules | `"data": []` |
| No carnet (not found) | `"data": [], "result": 0` |

### 7. Data Transformation Required

**Schedule transformation**:
- Oracle returns flat rows (one per class)
- Response needs nested structure: `{ studentInfo, MATERIAS: [...] }`
- Frontend groups by `DIA` for tab display

**Grades transformation**:
- Oracle returns flat rows (one per grade entry)
- Response needs nested structure: `{ materia -> infoMateria (by corte) -> infoCorte }`

---

## NestJS Module Structure

```
src/
├── main.ts                          # Application entry point
├── app.module.ts                    # Root module
├── config/
│   └── configuration.ts             # Environment config loader
│
├── modules/
│   │
│   ├── students/                     # Students module (carnet, schedule, grades)
│   │   ├── students.module.ts
│   │   ├── students.controller.ts
│   │   ├── students.service.ts
│   │   ├── dto/
│   │   │   ├── carnet.dto.ts
│   │   │   ├── carnet-query.dto.ts
│   │   │   ├── schedule.dto.ts
│   │   │   ├── schedule-query.dto.ts
│   │   │   ├── grades.dto.ts
│   │   │   └── grades-query.dto.ts
│   │   └── entities/                # If using TypeORM
│   │       └── estudiante-programa.entity.ts
│   │
│   ├── app-config/                   # App config module (enabled modules, boot info)
│   │   ├── app-config.module.ts
│   │   ├── app-config.controller.ts
│   │   ├── app-config.service.ts
│   │   └── dto/
│   │       ├── enabled-modules.dto.ts
│   │       ├── app-basic-info.dto.ts
│   │       └── app-basic-info-query.dto.ts
│   │
│   └── health/                      # Health check module
│       ├── health.module.ts
│       └── health.controller.ts
│
├── common/
│   ├── guards/
│   │   ├── microsoft-jwt.guard.ts   # Validates Microsoft JWT
│   │   └── api-key.guard.ts         # Validates API key (if still needed)
│   │
│   ├── decorators/
│   │   ├── current-user.decorator.ts # Extracts user from validated JWT
│   │   └── public.decorator.ts      # Marks endpoints as public
│   │
│   ├── filters/
│   │   └── http-exception.filter.ts  # Global exception handling
│   │
│   ├── interceptors/
│   │   └── logging.interceptor.ts    # Request/response logging
│   │
│   └── middleware/
│       ├── logging.middleware.ts     # Request logging
│       └── correlation-id.middleware.ts
│
├── database/
│   ├── database.module.ts            # Oracle connection module
│   └── oracle.config.ts             # Oracle connection config
│
└── utils/
    ├── oracle-client.ts             # Raw Oracle client wrapper
    └── response-transformer.ts      # Transform helpers
```

### Controller Routes

```typescript
// students.controller.ts
@Controller('soyuteista')
@UseGuards(MicrosoftJwtGuard)        // All routes require authentication
export class StudentsController {
  
  // GET /soyuteista/carnet2?email=xxx
  @Get('carnet2')
  async getCarnet(
    @CurrentUser() user: AuthenticatedUser, // Email from validated JWT
  ): Promise<CarnetResponseDto> {
    return this.studentsService.getCarnet(user.email);
  }

  // GET /soyuteista/schedule?email=xxx
  @Get('schedule')
  async getSchedule(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ScheduleResponseDto> {
    return this.studentsService.getSchedule(user.email);
  }

  // GET /soyuteista/qualification?email=xxx
  @Get('qualification')
  async getGrades(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GradesResponseDto> {
    return this.studentsService.getGrades(user.email);
  }
}

// app-config.controller.ts
@Controller('soyuteista')
@UseGuards(MicrosoftJwtGuard)
export class AppConfigController {
  
  // GET /soyuteista/enabled-modules?email=xxx
  @Get('enabled-modules')
  async getEnabledModules(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EnabledModulesResponseDto> {
    return this.appConfigService.getEnabledModules(user.email);
  }

  // POST /soyuteista/get-app-basic-info
  @Post('get-app-basic-info')
  async getAppBasicInfo(
    @Body() body: AppBasicInfoQueryDto,
  ): Promise<AppBasicInfoResponseDto> {
    return this.appConfigService.getAppBasicInfo(body.phone_version);
  }
}
```

### Service Responsibilities

```typescript
// students.service.ts
@Injectable()
export class StudentsService {
  
  async getCarnet(email: string): Promise<CarnetResponseDto> {
    // 1. Query Oracle for student by email
    // 2. Map Oracle result to CarnetDto[]
    // 3. Return with result code
  }

  async getSchedule(email: string): Promise<ScheduleResponseDto> {
    // 1. Query Oracle for student + schedule
    // 2. Transform flat rows to nested MATERIAS array
    // 3. Return with result code
  }

  async getGrades(email: string): Promise<GradesResponseDto> {
    // 1. Query Oracle for all grades
    // 2. Transform to nested materia -> infoMateria -> infoCorte structure
    // 3. Return with result code
  }
}

// app-config.service.ts
@Injectable()
export class AppConfigService {
  
  async getEnabledModules(email: string): Promise<EnabledModulesResponseDto> {
    // 1. Query Oracle for disabled modules only
    // 2. Return array (empty = all enabled)
  }

  async getAppBasicInfo(phoneVersion: string): Promise<AppBasicInfoResponseDto> {
    // 1. Check maintenance flag from PARAMETROS
    // 2. Compare phoneVersion with VERSION_MINIMA
    // 3. Check campaign flag
    // 4. Return combined response
  }
}
```

### Oracle Query Approach

**Recommendation**: Use **raw queries with node-oracledb** rather than TypeORM.

**Reasons**:
1. The existing Oracle schema may not fit TypeORM conventions
2. Field name mapping (C_, N_ prefixes) requires custom transformers
3. Complex joins and denormalized views are easier with raw SQL
4. Better control over Oracle-specific features (REF CURSOR, etc.)
5. No TypeORM Oracle dialect support in NestJS (experimental)

**Alternative**: If using an ORM, consider **Prisma** with raw mode or **Knex** for complex queries.

---

## Oracle Connection Setup

### Recommended Package

**`node-oracledb`** (official Oracle driver for Node.js)

```bash
npm install oracledb
```

**Note**: Requires Oracle Instant Client to be installed on the server.

### Connection Configuration

```typescript
// database/oracle.config.ts
import { OracleConfig } from '../config/configuration';

export const createOraclePool = async (config: OracleConfig) => {
  await oracledb.createPool({
    user: config.UTS_ORACLE_USER,
    password: config.UTS_ORACLE_PASSWORD,
    connectString: config.UTS_ORACLE_CONNECT_STRING, // e.g., "webservice.uts.edu.co:1521/UTS"
    
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 1,
    
    poolAlias: 'main',
  });
};

// Example .env values needed:
// UTS_ORACLE_USER=webservice_user
// UTS_ORACLE_PASSWORD=secure_password
// UTS_ORACLE_CONNECT_STRING=webservice.uts.edu.co:1521/UTS
```

### Connection Pool Recommendations

| Setting | Recommended Value | Rationale |
|---------|-------------------|-----------|
| `poolMin` | 2 | Minimum connections always available |
| `poolMax` | 10 | Based on expected concurrent users |
| `poolIncrement` | 1 | Grow pool gradually |
| `stmtCacheSize` | 30 | Cache prepared statements |
| `connectionTimeout` | 60 | Seconds before connection timeout |

### NestJS Database Module

```typescript
// database/database.module.ts
import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
```

```typescript
// database/database.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { oracledb, Pool, PoolAttributes } from 'oracledb';
import { ConfigurationService } from '../config/configuration.service';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: Pool;

  async onModuleDestroy() {
    await this.pool.close();
  }

  async executeQuery<T>(sql: string, params: Record<string, any> = {}): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      const result = await connection.execute(sql, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT, // Return as objects
      });
      return result.rows as T;
    } finally {
      connection.close();
    }
  }

  async executeQuerySingle<T>(sql: string, params: Record<string, any> = {}): Promise<T | null> {
    const rows = await this.executeQuery<T[]>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }
}
```

---

## Environment Variables — Complete List

### Database Variables (NEW)

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `UTS_ORACLE_USER` | Oracle database username | `uts_reader` | Yes |
| `UTS_ORACLE_PASSWORD` | Oracle database password | `secure_password` | Yes |
| `UTS_ORACLE_CONNECT_STRING` | Oracle connection string (TNS) | `webservice.uts.edu.co:1521/UTS` | Yes |

### API Variables (NEW)

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `UTS_WEBSERVICE_API_KEY` | API key for authentication | `f910fd9b70mshc4e59787d044bc3p10ea5ejsnbd1f4b7fe6f7` | Yes |
| `UTS_WEBSERVICE_HOST` | Host header value | `webservice.uts.edu.co` | Yes |

### Microsoft Variables

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `MICROSOFT_CLIENT_ID` | Azure AD application client ID | `6112809e-ef44-4718-be4d-9826c4eb1ed3` | Yes |
| `MICROSOFT_TENANT_ID` | Azure AD tenant ID | `common` | Yes |
| `MICROSOFT_JWKS_URI` | Microsoft public keys URI | `https://login.microsoftonline.com/common/discovery/v2.0/keys` | No (uses default) |

### Security Variables

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `SECRET_KEY` | AES encryption key | `REACTANDNODEWORKS4EVER!` | Yes |
| `JWT_SECRET` | Secret for internal JWT (if needed) | `random_secret_32_chars_long` | Yes |

### Application Variables

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `APP_HOST` | API host for CORS | `0.0.0.0` | No (default: 0.0.0.0) |
| `APP_PORT` | API port | `3000` | No (default: 3000) |
| `NODE_ENV` | Environment | `development`, `production` | No |
| `LOG_LEVEL` | Logging level | `debug`, `info`, `warn`, `error` | No |

### All Variables Summary

```bash
# .env file for NestJS backend

# Oracle Database
UTS_ORACLE_USER=uts_reader
UTS_ORACLE_PASSWORD=secure_password
UTS_ORACLE_CONNECT_STRING=webservice.uts.edu.co:1521/UTS

# API Authentication
UTS_WEBSERVICE_API_KEY=f910fd9b70mshc4e59787d044bc3p10ea5ejsnbd1f4b7fe6f7
UTS_WEBSERVICE_HOST=webservice.uts.edu.co

# Microsoft Authentication
MICROSOFT_CLIENT_ID=6112809e-ef44-4718-be4d-9826c4eb1ed3
MICROSOFT_TENANT_ID=common

# Security
SECRET_KEY=REACTANDNODEWORKS4EVER!
JWT_SECRET=random_secret_32_chars_long_for_jwt_signing

# Application
APP_PORT=3000
NODE_ENV=production
LOG_LEVEL=info
```

---

## Security Checklist

### [HIGH] No Microsoft Token Validation

**Issue**: Currently, the UTS WebService trusts the email parameter without validating the Microsoft token. Anyone with the API key can query any student.

**Current Flow**:
```
Client → API Key → UTS WebService (no user validation)
```

**Fix in NestJS**:
1. Implement `MicrosoftJwtGuard` that validates the Bearer token
2. Extract email from validated JWT claims
3. Use extracted email for Oracle queries (never trust client-provided email)
4. Return 401 Unauthorized if token is invalid or expired

```typescript
// Required: Every request must have valid Microsoft JWT
@UseGuards(MicrosoftJwtGuard)
@Controller('soyuteista')
export class StudentsController {}
```

**Priority**: HIGH

---

### [HIGH] API Key Exposed to Client

**Issue**: The `X-WebServiceUTSAPI-Key` is stored in frontend environment variables, which are bundled into the mobile app. Users can extract it.

**Current State**: API key visible in `eas.json`, `.env`

**Fix in NestJS**:
1. Move API key validation to ONLY internal use (if still needed)
2. The NestJS backend should validate Microsoft JWT, not API key
3. Remove API key from mobile app entirely
4. If API key is kept, use it only for internal service-to-service calls

**Recommendation**: Replace API key auth with Microsoft JWT auth for mobile clients.

**Priority**: HIGH

---

### [MEDIUM] No Rate Limiting

**Issue**: No rate limiting on endpoints. A malicious actor could:
- Query all students by enumerating email addresses
- Overload the database with repeated requests

**Fix in NestJS**:
1. Implement `@nestjs/throttler` for rate limiting
2. Suggested limits:
   - `/soyuteista/*`: 60 requests per minute per user
   - `/soyuteista/get-app-basic-info`: 10 requests per minute per user

```typescript
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
  ],
})
export class AppModule {}
```

**Priority**: MEDIUM

---

### [MEDIUM] No Input Validation on Email

**Issue**: Email is passed as query parameter and used in SQL without validation.

**Current Code**:
```typescript
webserviceAPI.get(`/soyuteista/carnet2/?email=${email}`);
```

**Fix in NestJS**:
1. Use `@IsEmail()` validation decorator
2. Sanitize input before Oracle query
3. Use parameterized queries (never string concatenation)

```typescript
export class CarnetQueryDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty()
  email: string;
}
```

**Priority**: MEDIUM

---

### [MEDIUM] Sensitive Data in Logs

**Issue**: Student emails and data could appear in logs if logging is too verbose.

**Fix in NestJS**:
1. Implement log sanitization (mask PII in logs)
2. Set appropriate log levels (info for requests, debug for details)
3. Never log full JWT tokens
4. Never log query parameters with student data

**Priority**: MEDIUM

---

### [LOW] No CORS Configuration

**Issue**: CORS not explicitly configured in current implementation.

**Fix in NestJS**:
1. Configure CORS for mobile app origins only
2. Whitelist specific domains if known

```typescript
app.enableCors({
  origin: ['exp://*', 'soyuteista://*'], // Expo/React Native
  methods: 'GET,POST',
  allowedHeaders: 'Content-Type,Authorization',
});
```

**Priority**: LOW

---

### [LOW] No Request Timeout

**Issue**: Long-running Oracle queries could hang indefinitely.

**Fix in NestJS**:
1. Set request timeout in middleware
2. Set Oracle query timeout (10 seconds based on current frontend timeout)

```typescript
// In Oracle query execution
const result = await connection.execute(sql, params, {
  maxRows: 10000,
  timeout: 10000, // 10 seconds
});
```

**Priority**: LOW

---

## What This API Does NOT Do

Explicitly out of scope for this implementation:

### Authentication (Handled Client-Side)

- **Microsoft OAuth 2.0 login** — Handled by `expo-auth-session` on mobile app
- **Token storage** — Handled by AsyncStorage on mobile app
- **Token refresh** — Handled by `AuthManager` on mobile app
- **User identity** — Derived from Microsoft JWT claims, not this API

**This API receives an already-authenticated user's email and returns their data.**

### WordPress News/Posts

- **News feed** — Retrieved from `https://www.uts.edu.co/sitio/wp-json/last-post/v2/category`
- **Institutional agenda** — Retrieved from same WordPress API
- **NOT part of this specification**

### Revista/Magazine Content

- **University magazine editions** — Retrieved from `https://soyuteista.uts.edu.co/revista/getNewsletter.php`
- **NOT part of this specification**

### Tutorias (Tutoring)

- **Tutoring appointments** — Retrieved from `https://tutorias.uts.edu.co/api/v2.1`
- **NOT part of this specification** (feature removed from app)

### Write Operations

- **Student registration** — NOT handled
- **Grade submission** — NOT handled
- **Schedule modification** — NOT handled
- **Profile updates** — NOT handled
- **Enrollment changes** — NOT handled

This is a **read-only API** for academic data retrieval.

### Student Data Modification

- **Cannot create students** — Students exist in Oracle from UTS administrative systems
- **Cannot modify grades** — Grades are entered by instructors in a separate system
- **Cannot change schedule** — Schedule is set by academics department
- **Cannot enable/disable modules** — Managed by UTS administrators

### Bienquerencia/Bienestar (Encrypted Endpoint)

- The `/bienestar/` endpoint exists in current implementation
- Uses AES encryption with `SECRET_KEY`
- **Purpose unknown** — Possibly for wellness/institutional services
- **NOT called by current mobile app** (feature appears unused)
- **Out of scope unless specifically required**

### Session Management

- **No session storage** — Each request is independent
- **No session tracking** — Relies on mobile app to maintain Microsoft token
- **No logout propagation** — Mobile app clears local token only

---

## Summary

### What IS in Scope

| Endpoint | Purpose |
|----------|---------|
| `GET /soyuteista/carnet2` | Student profile/enrollment data |
| `GET /soyuteista/schedule` | Weekly class schedule |
| `GET /soyuteista/qualification` | Academic grades |
| `GET /soyuteista/enabled-modules` | Module enablement status |
| `POST /soyuteista/get-app-basic-info` | App config (maintenance, updates, campaigns) |

### Key Requirements

1. **Read-only** — No mutations to Oracle data
2. **Authenticate via Microsoft JWT** — Replace API key auth
3. **Query Oracle database** — Using node-oracledb or raw SQL
4. **Return same response shapes** — Frontend expects exact JSON structure
5. **Handle result codes** — 1=success, 0=error, 2/69=special cases

### Next Steps

1. Obtain Oracle database credentials and connection details from UTS IT
2. Map Oracle tables/views to the schemas described
3. Implement NestJS modules following the structure provided
4. Test against existing mobile app to ensure response compatibility
5. Deploy and update mobile app to use new endpoint URLs
