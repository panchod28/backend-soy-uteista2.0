export class MateriaDto {
  CODIGO_MATERIA!: string;
  NOMBRE_MATERIA!: string;
  GRUPO!: string;
  DIA!: number;
  HORA_INICIO!: string;
  HORA_FINAL!: string;
  SALON!: string;
  DESCRIPCION!: string;
}

export class ScheduleDataDto {
  ID!: number;
  CEDULA!: string;
  NOMBRE!: string;
  SEDE!: string;
  NOMBRE_PROGRAMA!: string;
  CORREO_INSTITUCIONAL!: string;
  MATERIAS!: MateriaDto[];
}

export class ScheduleResponseDto {
  result!: number;
  data!: ScheduleDataDto | Record<string, never>;
  error!: string;
}
