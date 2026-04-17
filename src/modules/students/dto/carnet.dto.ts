export class CarnetItemDto {
  C_ESTP_ID!: number;
  C_PEGE_DOCUMENTOIDENTIDAD!: string;
  C_PENG_PRIMERAPELLIDO!: string;
  C_PENG_SEGUNDOAPELLIDO!: string | null;
  C_PENG_PRIMERNOMBRE!: string;
  C_PENG_SEGUNDONOMBRE!: string | null;
  C_UNID_NOMBRE!: string;
  C_PROG_NOMBRE!: string;
  C_FRAN_DESCRIPCION!: string;
  C_PENS_DESCRIPCION!: string;
  C_PENS_TOTALCREDITOS!: number;
  C_ESTP_CREDITOSAPROBADOS!: number;
  C_AVANCE!: number;
  C_CATE_DESCRIPCION!: string;
  C_SITE_DESCRIPCION!: string;
  C_PENG_EMAILINSTITUCIONAL!: string;
  C_ESTP_PROMEDIOGENERAL!: number;
  C_PEUN_FECHAFIN!: string;
}

export class CarnetResponseDto {
  result!: number;
  data!: CarnetItemDto[] | Record<string, never>;
  error!: string;
}
