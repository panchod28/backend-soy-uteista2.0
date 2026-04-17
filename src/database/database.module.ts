import { Global, Module } from '@nestjs/common';
import { OracleService } from './oracle.service';
import { MysqlService } from './mysql.service';

@Global()
@Module({
  providers: [OracleService, MysqlService],
  exports: [OracleService, MysqlService],
})
export class DatabaseModule {}
