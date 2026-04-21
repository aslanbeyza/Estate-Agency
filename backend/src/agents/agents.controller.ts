import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';

@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
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

  @Get(':id')
  @ApiOperation({ summary: 'Get an agent by id' })
  findOne(@Param('id') id: string) {
    return this.agentsService.findOne(id);
  }

  @Get(':id/earnings')
  @ApiOperation({
    summary: 'Get total earnings for an agent across completed transactions',
  })
  earnings(@Param('id') id: string) {
    return this.agentsService.earnings(id);
  }

  @Get(':id/transactions')
  @ApiOperation({
    summary:
      "Agent-scoped transaction feed with each item's role and payout amount pre-computed",
  })
  transactions(@Param('id') id: string) {
    return this.agentsService.transactions(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an agent' })
  remove(@Param('id') id: string) {
    return this.agentsService.remove(id);
  }
}
