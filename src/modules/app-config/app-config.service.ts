import { Injectable } from '@nestjs/common';
import { MysqlService } from '../../database/mysql.service';
import { EnabledModulesResponseDto } from './dto/enabled-modules.dto';
import { AppBasicInfoResponseDto } from './dto/app-basic-info.dto';

const CURRENT_VERSION = '21.0.0';
const UPDATE_MSG =
  'Para seguir gozando de tu app SoyUteista, esta debe ser actualizada, por favor da click en el enlace debajo';

function versionChecker(current: string, phone: string): number {
  const a = current.split('.');
  const b = phone.split('.');
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((+a[i] || 0) > (+b[i] || 0)) return 1;
    if ((+a[i] || 0) < (+b[i] || 0)) return -1;
  }
  return 0;
}

@Injectable()
export class AppConfigService {
  constructor(private readonly mysql: MysqlService) {}

  async getEnabledModules(): Promise<EnabledModulesResponseDto> {
    const rows = await this.mysql.query<{
      id_modulo: number;
      nombre: string;
      habilitado: number;
    }>('SELECT * FROM modulos');
    return { data: rows };
  }

  getAppBasicInfo(phoneVersion: string): AppBasicInfoResponseDto {
    const phone = phoneVersion || '0.0.0';
    const checker = versionChecker(CURRENT_VERSION, phone) > 0 ? 1 : 0;

    return {
      maintenance: {
        is_under_maintenance: 0,
        image: null,
        msg: 'Actualmente nos encontramos mejorando para brindarte una mejor experiencia. Por favor, inténtalo más tarde.',
      },
      update_checker: {
        is_update_required: checker,
        image: checker ? '' : '',
        msg: checker ? UPDATE_MSG : '',
      },
      campaign: {
        is_campaign_running: 0,
        image: null,
        msg: '',
      },
    };
  }
}
