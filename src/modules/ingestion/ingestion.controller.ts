import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/common/guards';
import { IngestionService } from './ingestion.service';
import { IngestionJobType } from './entities/data-ingestion-job.entity';

@Controller('api/v2/admin/market-data')
@UseGuards(JwtAuthGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Get('csv-template')
  getCsvTemplate(@Res() res: any) {
    const csv = 'crop_slug,region,observed_at,price_ghc,price_type,source,source_url,volume_kg,quality_grade,notes\n';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="price-points-template.csv"');
    res.send(csv);
  }

  @Post('price-points/bulk')
  @UseInterceptors(FileInterceptor('file'))
  async bulkUploadPricePoints(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    const userId: string = req.user?.id;
    const job = await this.ingestionService.createJob(
      IngestionJobType.CSV_UPLOAD,
      userId,
      file?.originalname,
    );
    return { jobId: job.id, status: job.status };
  }

  @Get('jobs/:id/errors/csv')
  async downloadErrors(@Param('id') id: string, @Res() res: any) {
    const job = await this.ingestionService.findJobById(id);
    const errors = job.errors ?? [];
    const csv = ['row,field,message', ...errors.map((e) => `${e.row},${e.field},${e.message}`)].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="job-${id}-errors.csv"`);
    res.send(csv);
  }
}
