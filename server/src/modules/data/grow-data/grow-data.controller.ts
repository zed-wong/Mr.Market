import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GrowdataService } from 'src/modules/data/grow-data/grow-data.service';

@ApiTags('Data')
@Controller('grow')
export class GrowdataController {
  constructor(private readonly growdataService: GrowdataService) {}

  @Get('/info')
  getGrowData() {
    return this.growdataService.getGrowData();
  }
}
