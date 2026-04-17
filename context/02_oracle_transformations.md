# Context 02 — Oracle Transformation Details

## Source Files

```
backend-soyuteista/src/common/peticionesOracle/
├── carnet.js
├── horario.js
└── notas.js
```

All three files follow the same pattern:
1. Build a raw SQL string calling an Oracle stored procedure.
2. Execute it via `conexionOracle.getConnection()` + `connection.execute()`.
3. Transform `result.rows` (array of plain objects with prefixed column names)
   into a cleaner structure.
4. Return `{ result: <code>, data: <transformed>, error: null }` or an error
   envelope.

---

## T-01 / T-02 — Schedule Transform (`horario.js`)

### Stored Procedures

| Transform | Procedure | Trigger |
|---|---|---|
| T-01 | `academico.RETURN_OBJECTS_APP_HORARIO` | Called with institutional email |
| T-02 | `academico.RETURN_OBJECTS_APP_HORA_QR` | Called with document/ID number |

### Oracle Column → Clean Field Mapping

| Oracle Column (prefix `H_`) | Clean Field Name |
|---|---|
| `H_ESTP_ID` | `ID` |
| `H_PEGE_DOCUMENTOIDENTIDAD` | `CEDULA` |
| `H_PENG_PRIMERNOMBRE` + `H_PENG_SEGUNDONOMBRE` + `H_PENG_PRIMERAPELLIDO` + `H_PENG_SEGUNDOAPELLIDO` | `NOMBRE` (concatenated — see warning below) |
| `H_SEDE_NOMBRE` | `SEDE` |
| `H_PROG_NOMBRE` | `NOMBRE_PROGRAMA` |
| `H_ESTP_CORREO` | `CORREO_INSTITUCIONAL` |
| `H_MATE_CODIGOMATERIA` | `CODIGO_MATERIA` |
| `H_MATE_NOMBRE` | `NOMBRE_MATERIA` |
| `H_GRUP_NOMBRE` | `GRUPO` |
| `H_CLSE_DIA` | `DIA` |
| `H_BLHO_HORAINICIO` | `HORA_INICIO` |
| `H_BLHO_HORAFINAL` | `HORA_FINAL` |
| `H_REFI_NOMENCLATURA` | `SALON` |
| `H_LOCA_DESCRIPCION` | `DESCRIPCION` |

### Output Shape

```json
{
  "result": 1,
  "data": {
    "ID": "...",
    "CEDULA": "...",
    "NOMBRE": "First Second LastA LastB",
    "SEDE": "...",
    "NOMBRE_PROGRAMA": "...",
    "CORREO_INSTITUCIONAL": "...",
    "MATERIAS": [
      {
        "CODIGO_MATERIA": "...",
        "NOMBRE_MATERIA": "...",
        "GRUPO": "...",
        "DIA": "...",
        "HORA_INICIO": "...",
        "HORA_FINAL": "...",
        "SALON": "...",
        "DESCRIPCION": "..."
      }
    ]
  },
  "error": null
}
```

### NEEDS VERIFICATION — Null name concatenation

`horario.js` line 32:
```javascript
NOMBRE: `${result.rows[0].H_PENG_PRIMERNOMBRE} ${result.rows[0].H_PENG_SEGUNDONOMBRE} ${result.rows[0].H_PENG_PRIMERAPELLIDO} ${result.rows[0].H_PENG_SEGUNDOAPELLIDO}`,
```
`H_PENG_SEGUNDONOMBRE` is likely nullable (second name is optional in Colombian
civil records). If the Oracle driver returns `null`, JavaScript template
interpolation will produce the literal string `"null"` in the name.
NestJS rewrite must guard: `[first, second, last1, last2].filter(Boolean).join(' ')`.

### NEEDS VERIFICATION — Duplication

T-01 and T-02 share identical transformation logic but different stored
procedure names. They should be refactored to a single shared transformer
function. Confirm there are no field-level differences between the two
stored procedures' output schemas before merging.

---

## T-03 — Grades Transform (`notas.js`)

### Stored Procedure

`academico.RETURN_OBJECTS_APP_NOTAS` — called with institutional email.

### Oracle Column Prefix → Meaning

| Prefix | Meaning |
|---|---|
| `N_MATE_NOMBRE` | Subject (materia) name |
| `N_EVAC_DESCRIPCION` | Evaluation period description (corte) |
| `N_EVAL_NOMBRE` | Individual evaluation name |
| `N_CALF_VALOR` | Grade value (numeric) |
| `N_NOTA_PESO` | Weight/percentage of grade in period |

### Three-Stage Pipeline

**Stage 1 — GroupBy materia → corte (lines 14–52)**

```
flat rows
  → group by N_MATE_NOMBRE
    → for each materia: group by N_EVAC_DESCRIPCION
      → leaf: { N_EVAL_NOMBRE, N_CALF_VALOR, N_NOTA_PESO }
```

Result shape after Stage 1:
```json
{
  "Cálculo I": {
    "Corte 1": [ { "N_EVAL_NOMBRE": "Parcial 1", "N_CALF_VALOR": 3.5, "N_NOTA_PESO": 30 } ],
    "Corte 2": [ ... ],
    "Corte 3": [ ... ]
  }
}
```

**Stage 2 — Per-corte final grade computation (lines 54–70)**

For each corte:
```
DEFINITIVA_CORTE = Σ (N_CALF_VALOR × N_NOTA_PESO) / 100
```

Each corte object gains a `DEFINITIVA CORTE` field (note: space in key name,
not underscore — potential inconsistency).

**Stage 3 — Final subject grade computation (lines 73–114)**

Weights:
| Corte index | Weight |
|---|---|
| 0 (Corte 1) | 33% |
| 1 (Corte 2) | 33% |
| 2 (Corte 3) | 34% |

```
NOTA_FINAL = (corte1.DEFINITIVA_CORTE × 0.33)
           + (corte2.DEFINITIVA_CORTE × 0.33)
           + (corte3.DEFINITIVA_CORTE × 0.34)
```

Special case — Habilitación (make-up exam, lines 93–101):
If a corte's description contains `"HABILITACION"` (case-insensitive check
NEEDS VERIFICATION), its weight replaces `corte3.DEFINITIVA_CORTE × 0.34`
with the habilitación value at a different weight. Exact logic NEEDS
VERIFICATION by reading lines 93–101 carefully in context.

### Output Shape

```json
{
  "result": 1,
  "data": [
    {
      "materia": "Cálculo I",
      "infoMateria": [
        {
          "corte": "Corte 1",
          "infoCorte": [
            { "N_EVAL_NOMBRE": "...", "N_CALF_VALOR": 3.5, "N_NOTA_PESO": 30 }
          ],
          "DEFINITIVA CORTE": 3.5
        }
      ],
      "NOTA_FINAL": 3.6
    }
  ],
  "error": null
}
```

---

## T-04 / T-05 — Student ID (carnet) Transform (`carnet.js`)

### Stored Procedure

`academico.RETURN_OBJECTS_APP_CARNE` — called with institutional email.

### Result Code Mapping

Determined by `obtainDomainName(email)` from `common/obtainDomain.js`:

| Condition | `result` code |
|---|---|
| Query error | `0` |
| Domain is institutional (`@uteam...` NEEDS VERIFICATION) | `1` |
| Domain is external/public | `2` |
| Empty result set | `3` |

### `carnet` vs `carnet2` Difference

| | `carnet` (T-04) | `carnet2` (T-05) |
|---|---|---|
| `data` field | `resp[0]` — first row only | `resp` — full array |
| Use case | Single-program student | Multi-program student |

### NEEDS VERIFICATION

The Oracle columns returned by `RETURN_OBJECTS_APP_CARNE` are **not renamed**
unlike `horario.js`. The raw Oracle row object is passed directly as `data`.
Confirm what column names the stored procedure returns — the NestJS DTO for
this endpoint must match them.

---

## SQL Injection Risk (flagged for NestJS rewrite)

`horario.js` and `carnet.js` build queries via string interpolation:

```javascript
// carnet.js — email interpolated with quotes (lower risk)
`select * from table(academico.RETURN_OBJECTS_APP_CARNE('${email}'))`

// horario.js getScheduleByDocument — document interpolated WITHOUT quotes (HIGH RISK)
`SELECT * FROM table(academico.RETURN_OBJECTS_APP_HORA_QR(${document}))`
```

The NestJS rewrite must use parameterized Oracle queries (`oracledb` supports
bind variables: `:email`). Do not carry forward string interpolation.
