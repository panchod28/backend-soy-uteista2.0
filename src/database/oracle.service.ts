import { Injectable, OnModuleInit, OnModuleDestroy, InternalServerErrorException } from '@nestjs/common';
import * as oracledb from 'oracledb';

@Injectable()
export class OracleService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    await oracledb.createPool({
      user: process.env.UTS_ORACLE_USER,
      password: process.env.UTS_ORACLE_PASSWORD,
      connectString: process.env.UTS_ORACLE_CONNECT_STRING,
      poolMin: 2,
      poolMax: 10,
      poolIncrement: 1,
    });
  }

  async onModuleDestroy() {
    await oracledb.getPool().close(0);
  }

  async query<T>(sql: string): Promise<T[]> {
    let connection: oracledb.Connection | undefined;
    try {
      connection = await oracledb.getConnection();
      const result = await connection.execute<T>(sql);
      return (result.rows ?? []) as T[];
    } catch (err) {
      throw new InternalServerErrorException('Oracle query failed');
    } finally {
      if (connection) await connection.close();
    }
  }
}
