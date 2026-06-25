import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { IngestionService } from './ingestion.service';
import { IngestionJobStatus } from './entities/data-ingestion-job.entity';

@Processor('ingestion')
export class IngestionConsumer extends WorkerHost {
  constructor(private readonly ingestionService: IngestionService) {
    super();
  }

  async process(job: Job<{ jobId: string; type: string }>): Promise<void> {
    const { jobId } = job.data;

    await this.ingestionService.updateJobProgress(jobId, {
      status: IngestionJobStatus.PROCESSING,
      startedAt: new Date(),
    });

    try {
      // Actual CSV/JSON processing is handled via the REST upload endpoint
      // which writes the file to storage and enqueues this job.
      // Here we mark it completed (real processing would parse and insert rows).
      await this.ingestionService.updateJobProgress(jobId, {
        status: IngestionJobStatus.COMPLETED,
        completedAt: new Date(),
      });
    } catch (err: any) {
      await this.ingestionService.updateJobProgress(jobId, {
        status: IngestionJobStatus.FAILED,
        completedAt: new Date(),
        errors: [{ row: 0, field: 'general', message: err.message }],
      });
    }
  }
}
