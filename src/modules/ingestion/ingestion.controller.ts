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

/**
 * REST controller for admin market-data ingestion. Mounted at
 * `POST /api/v2/admin/market-data`. All routes require a valid JWT via
 * `JwtAuthGuard` (role enforcement is expected upstream or via middleware).
 *
 * Endpoints:
 *  - `GET  /csv-template`           — download a blank CSV template
 *  - `POST /price-points/bulk`      — multipart CSV/JSON file upload; creates
 *    a `DataIngestionJob` and returns `{ jobId, status }`
 *  - `GET  /jobs/:id/errors/csv`    — download per-row errors for a job as CSV
 */
@Controller('api/v2/admin/market-data')
@UseGuards(JwtAuthGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /** Returns a blank CSV template with the expected column headers. */
  @Get('csv-template')
  getCsvTemplate(@Res() res: any) {
    const csv = 'crop_slug,region,observed_at,price_ghc,price_type,source,source_url,volume_kg,quality_grade,notes\n';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="price-points-template.csv"');
    res.send(csv);
  }

  /**
   * Accepts a multipart file upload, creates a `CSV_UPLOAD` ingestion job,
   * and enqueues it for background processing.
   * Returns `{ jobId, status }` so the caller can poll for completion.
   */
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

  /** Streams per-row validation errors for the given job as a downloadable CSV. */
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
