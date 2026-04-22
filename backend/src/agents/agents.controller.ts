import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';

/**
 * Agents are a managed directory of staff; admins own their lifecycle.
 * Read access is open to any authenticated user because the dashboard
 * surfaces agent stats to everyone.
 */
@ApiBearerAuth()
@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create an agent' })
  create(@Body() dto: CreateAgentDto) {
    return this.agentsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all agents' })
  findAll() {
    return this.agentsService.findAll();
  }

  @Get('stats')
  @ApiOperation({
    summary:
      'List agents with aggregate stats (listing / selling / completed counts + totalEarned in kuruş)',
  })
  stats() {
    return this.agentsService.stats();
  }

  // Static path `stats` is above. These multi-segment routes must register
  // before `@Get(':id')` so `/agents/:id/transactions` never falls through to
  // the single-param handler on any Nest/router edge case.
  @Get(':id/transactions')
  @ApiOperation({
    summary:
      "Agent-scoped transaction feed with each item's role and payout amount pre-computed",
  })
  transactions(@Param('id') id: string) {
    return this.agentsService.transactions(id);
  }

  @Get(':id/earnings')
  @ApiOperation({
    summary: 'Get total earnings for an agent across completed transactions',
  })
  earnings(@Param('id') id: string) {
    return this.agentsService.earnings(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an agent by id' })
  findOne(@Param('id') id: string) {
    return this.agentsService.findOne(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete an agent' })
  remove(@Param('id') id: string) {
    return this.agentsService.remove(id);
  }
}
