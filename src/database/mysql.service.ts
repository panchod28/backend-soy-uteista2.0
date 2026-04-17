import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as mysql from 'mysql2/promise';

@Injectable()
export class MysqlService {
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      connectionLimit: 10,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows as T[];
    } catch (err) {
      throw new InternalServerErrorException('MySQL query failed');
    }
  }
}
