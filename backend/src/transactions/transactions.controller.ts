import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { TransactionsService } from './transactions.service';

/**
 * Authorization summary for this controller:
 *   - Read endpoints (`GET`): any authenticated user (admin or agent).
 *   - `POST /transactions`:  admin + agent — agents can book deals.
 *   - `PATCH /stage`:        admin only — only managers can advance or
 *                            complete a transaction. This is the concrete
 *                            fix for "an attacker could flip completed".
 *   - `DELETE`:              admin only.
 */
@ApiBearerAuth()
@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AGENT)
  @ApiOperation({
    summary: 'Create a transaction (starts in `agreement` stage)',
  })
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: AuthUser) {
    return this.transactionsService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({
    summary:
      'List transactions — paginated (`limit` default 20, max 100; `offset` default 0) with optional `stage` filter',
  })
  findAll(@Query() query: QueryTransactionsDto) {
    return this.transactionsService.findPaginated(query);
  }

  // Declared **before** `:id` so `/transactions/stats` isn't swallowed by
  // the dynamic param route.
  @Get('stats')
  @ApiOperation({
    summary: 'Aggregate dashboard stats (counts per stage + total agency revenue in kuruş)',
  })
  stats() {
    return this.transactionsService.stats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transaction by id' })
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }

  @Patch(':id/stage')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Advance to the next stage. On completed, commission is auto-calculated and persisted.',
  })
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateStageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.transactionsService.updateStage(id, dto, user.sub);
  }

  @Get(':id/breakdown')
  @ApiOperation({
    summary:
      'Get the commission breakdown (only available for completed transactions)',
  })
  getBreakdown(@Param('id') id: string) {
    return this.transactionsService.getBreakdown(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a transaction' })
  remove(@Param('id') id: string) {
    return this.transactionsService.remove(id);
  }
}
