export class EnabledModuleDto {
  id_modulo!: number;
  nombre!: string;
  habilitado!: number;
}

export class EnabledModulesResponseDto {
  data!: EnabledModuleDto[];
}
