import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';

@Public()
@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      name: 'Estate Agency API',
      version: '1.0.0',
      docs: '/api/docs',
      health: '/health',
    };
  }
}
