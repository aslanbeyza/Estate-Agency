import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a transaction (starts in `agreement` stage)',
  })
  create(@Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all transactions (agents populated)' })
  findAll() {
    return this.transactionsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transaction by id' })
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }

  @Patch(':id/stage')
  @ApiOperation({
    summary:
      'Advance to the next stage. On completed, commission is auto-calculated and persisted.',
  })
  updateStage(@Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.transactionsService.updateStage(id, dto);
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
  @ApiOperation({ summary: 'Delete a transaction' })
  remove(@Param('id') id: string) {
    return this.transactionsService.remove(id);
  }
}
