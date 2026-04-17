import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { StudentsService } from './students.service';

@Controller('soyuteista')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('carnet2')
  getCarnet2(@Query('email') email: string) {
    if (!email) throw new BadRequestException('email query param is required');
    return this.studentsService.getCarnet2(email);
  }

  @Get('schedule')
  getSchedule(@Query('email') email: string) {
    if (!email) throw new BadRequestException('email query param is required');
    return this.studentsService.getSchedule(email);
  }

  @Get('qualification')
  getQualification(@Query('email') email: string) {
    if (!email) throw new BadRequestException('email query param is required');
    return this.studentsService.getGrades(email);
  }
}
