export class InfoCorteDto {
  N_NOTA_DESCRIPCION!: string;
  N_NOTA_PESO?: number;
  N_CALF_VALOR!: number;
  N_DOCENTE?: string;
}

export class InfoMateriaDto {
  corte!: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  infoCorte: any;
}

export class MateriaGradeDto {
  materia!: string;
  infoMateria!: InfoMateriaDto[];
}

export class GradesResponseDto {
  result!: number;
  data!: MateriaGradeDto[] | Record<string, never>;
  error!: string;
}
