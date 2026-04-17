import { Injectable } from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { CarnetResponseDto } from './dto/carnet.dto';
import { ScheduleResponseDto, MateriaDto } from './dto/schedule.dto';
import { GradesResponseDto } from './dto/grades.dto';

const ERROR_0 =
  'Hemos detectado que no eres estudiante, pero eres uteísta, así que podrás ver las últimas noticias, la agenda de eventos UTS y nuestra revista';
const ERROR_2 = "'|'[-||(_+[] #/-//|3/2[-, desencriptelo mi papa!";
const ERROR_3 =
  'El usuario ingresado presenta una de las siguientes opciones: No cuenta con una matricula vigente o materias inscritas';

function getDomain(email: string): string {
  return email.substring(email.lastIndexOf('@') + 1);
}

function groupBy<T>(input: T[], key: keyof T): Record<string, T[]> {
  return input.reduce<Record<string, T[]>>((acc, item) => {
    const groupKey = String(item[key]);
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {});
}

@Injectable()
export class StudentsService {
  constructor(private readonly oracle: OracleService) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getCarnet2(email: string): Promise<CarnetResponseDto> {
    const rows = await this.oracle.query<any>(
      `select * from table(academico.RETURN_OBJECTS_APP_CARNE('${email}'))`,
    );

    const domain = getDomain(email);

    if (domain === 'uts.edu.co') {
      if (rows.length > 0) {
        return { result: 1, data: rows as any, error: '' };
      }
      return { result: 3, data: {}, error: ERROR_3 };
    }

    if (domain === 'correo.uts.edu.co') {
      return { result: 0, data: {}, error: ERROR_0 };
    }

    return { result: 2, data: {}, error: ERROR_2 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getSchedule(email: string): Promise<ScheduleResponseDto> {
    const rows = await this.oracle.query<any>(
      `select * from table(academico.RETURN_OBJECTS_APP_HORARIO('${email}'))`,
    );

    const domain = getDomain(email);

    if (domain !== 'uts.edu.co') {
      if (domain === 'correo.uts.edu.co') {
        return { result: 0, data: {}, error: ERROR_0 };
      }
      return { result: 2, data: {}, error: ERROR_2 };
    }

    if (rows.length === 0) {
      return { result: 1, data: {}, error: '' };
    }

    const materias: MateriaDto[] = rows.map((e) => ({
      CODIGO_MATERIA: e.H_MATE_CODIGOMATERIA as string,
      NOMBRE_MATERIA: e.H_MATE_NOMBRE as string,
      GRUPO: e.H_GRUP_NOMBRE as string,
      DIA: e.H_CLSE_DIA as number,
      HORA_INICIO: e.H_BLHO_HORAINICIO as string,
      HORA_FINAL: e.H_BLHO_HORAFINAL as string,
      SALON: e.H_REFI_NOMENCLATURA as string,
      DESCRIPCION: e.H_LOCA_DESCRIPCION as string,
    }));

    const first = rows[0];
    const nombre = [
      first.H_PENG_PRIMERNOMBRE,
      first.H_PENG_SEGUNDONOMBRE,
      first.H_PENG_PRIMERAPELLIDO,
      first.H_PENG_SEGUNDOAPELLIDO,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      result: 1,
      data: {
        ID: first.H_ESTP_ID as number,
        CEDULA: first.H_PEGE_DOCUMENTOIDENTIDAD as string,
        NOMBRE: nombre,
        SEDE: first.H_UNID_NOMBRE as string,
        NOMBRE_PROGRAMA: first.H_PROG_NOMBRE as string,
        CORREO_INSTITUCIONAL: first.H_PENG_EMAILINSTITUCIONAL as string,
        MATERIAS: materias,
      },
      error: '',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getGrades(email: string): Promise<GradesResponseDto> {
    const rows = await this.oracle.query<any>(
      `select * from table(academico.RETURN_OBJECTS_APP_NOTAS('${email}'))`,
    );

    if (rows.length === 0) {
      return { result: 1, data: {}, error: '' };
    }

    // Stage 1 — group by materia then by corte
    const byMateria = groupBy(rows, 'N_MATE_NOMBRE');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const array2: any[] = [];

    for (const materia in byMateria) {
      const byCorte = groupBy(byMateria[materia], 'N_EVAC_DESCRIPCION');
      const infoMateria = Object.entries(byCorte).map(([corte, infoCorte]) => ({
        corte,
        infoCorte,
      }));
      array2.push({ materia, infoMateria });
    }

    // Stage 2 — compute DEFINITIVA CORTE per corte
    array2.forEach((e: any, iM: number) => {
      e.infoMateria.forEach((f: any, iC: number) => {
        let notaFinalCorte = 0;
        f.infoCorte.forEach((g: any) => {
          notaFinalCorte += g.N_CALF_VALOR * g.N_NOTA_PESO;
        });
        array2[iM].infoMateria[iC].infoCorte.push({
          N_NOTA_DESCRIPCION: 'DEFINITIVA CORTE',
          N_CALF_VALOR: parseFloat(
            (Math.round(parseFloat((notaFinalCorte / 10).toFixed(1))) / 10).toFixed(1),
          ),
        });
      });
    });

    // Stage 3 — compute NOTA FINAL per materia
    array2.forEach((e: any) => {
      let notaFinalMateria = 0;
      let esHabilitaciones = false;
      let notaHabilitacion = 0;

      e.infoMateria.forEach((f: any) => {
        const notaCorte = f.infoCorte[f.infoCorte.length - 1].N_CALF_VALOR;
        if (f.corte === 'HABILITACIONES') {
          notaHabilitacion = notaCorte;
          esHabilitaciones = true;
          return;
        }
        if (f.corte === 'TERCER CORTE') {
          notaFinalMateria += notaCorte * 0.34 * 100;
        } else {
          notaFinalMateria += notaCorte * 0.33 * 100;
        }
      });

      if (esHabilitaciones) {
        const temp = (Math.round(parseFloat((notaFinalMateria / 10).toFixed(1))) / 10).toFixed(1);
        const notafinal = (+temp + notaHabilitacion) / 2;
        e.infoMateria.push({
          corte: 'NOTA FINAL',
          infoCorte: notafinal.toFixed(2) + ' Revisa la plataforma',
        });
      } else {
        e.infoMateria.push({
          corte: 'NOTA FINAL',
          infoCorte: parseFloat(
            (Math.round(parseFloat((notaFinalMateria / 10).toFixed(1))) / 10).toFixed(1),
          ),
        });
      }
    });

    return { result: 1, data: array2, error: '' };
  }
}
