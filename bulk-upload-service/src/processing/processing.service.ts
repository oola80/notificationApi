import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ParsingService } from '../parsing/parsing.service.js';
import { ParsedRow } from '../parsing/interfaces/parsed-row.interface.js';
import {
  EventIngestionClient,
  SubmitEventPayload,
} from '../event-ingestion/event-ingestion.client.js';
import { ResultsService } from '../results/results.service.js';
import { UploadsRepository } from '../uploads/uploads.repository.js';
import { UploadRowsRepository } from '../uploads/upload-rows.repository.js';
import { Upload, UploadStatus } from '../uploads/entities/upload.entity.js';
import { UploadRowStatus } from '../uploads/entities/upload-row.entity.js';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  CircuitBreakerService,
  CircuitBreakerState,
} from '../circuit-breaker/circuit-breaker.service.js';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service.js';
import { AuditPublisherService } from '../rabbitmq/audit-publisher.service.js';

const CONTROL_COLUMNS = ['eventType', 'cycleId'];
const RESERVED_PREFIX = '_';

@Injectable()
export class ProcessingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessingService.name);
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly groupItemsTargetField: string;
  private readonly groupConflictMode: 'warn' | 'strict';
  private running = false;
  private shutdownRequested = false;
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private currentUploadId: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly parsingService: ParsingService,
    private readonly eventIngestionClient: EventIngestionClient,
    private readonly resultsService: ResultsService,
    private readonly uploadsRepository: UploadsRepository,
    private readonly uploadRowsRepository: UploadRowsRepository,
    private readonly metricsService: MetricsService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly rateLimiter: RateLimiterService,
    private readonly auditPublisher: AuditPublisherService,
  ) {
    this.pollIntervalMs = this.configService.get<number>(
      'app.workerPollIntervalMs',
      2000,
    );
    this.batchSize = this.configService.get<number>(
      'app.workerBatchSize',
      50,
    );
    this.concurrency = this.configService.get<number>(
      'app.workerConcurrency',
      5,
    );
    this.groupItemsTargetField = this.configService.get<string>(
      'app.groupItemsTargetField',
      'items',
    );
    this.groupConflictMode = this.configService.get<string>(
      'app.groupConflictMode',
      'warn',
    ) as 'warn' | 'strict';
  }

  onModuleInit(): void {
    this.running = true;
    this.schedulePoll();
    this.logger.log(
      `Worker started: batchSize=${this.batchSize}, concurrency=${this.concurrency}, pollInterval=${this.pollIntervalMs}ms`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    this.shutdownRequested = true;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }

    // If currently processing, mark upload as failed
    if (this.currentUploadId) {
      this.logger.warn(
        `Shutdown during processing upload=${this.currentUploadId}, marking as failed`,
      );
      try {
        await this.uploadsRepository.updateStatus(
          this.currentUploadId,
          UploadStatus.FAILED,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to mark upload=${this.currentUploadId} as failed on shutdown: ${error.message}`,
        );
      }
    }

    this.logger.log('Worker stopped');
  }

  private schedulePoll(): void {
    if (!this.running) return;
    this.pollingTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const upload = await this.uploadsRepository.claimNextQueued();
      if (upload) {
        await this.processUpload(upload);
      }
    } catch (error: any) {
      this.logger.error(`Poll error: ${error.message}`);
    }

    this.schedulePoll();
  }

  async processUpload(upload: Upload): Promise<void> {
    this.currentUploadId = upload.id;
    this.metricsService.setActiveUploads(1);
    const startTime = Date.now();

    this.logger.log(
      `Processing upload=${upload.id} file=${upload.fileName} rows=${upload.totalRows}`,
    );

    try {
      this.auditPublisher.publishUploadProcessing({
        uploadId: upload.id,
        fileName: upload.fileName,
        uploadedBy: upload.uploadedBy,
        status: 'processing',
        totalRows: upload.totalRows,
        processedRows: upload.processedRows,
        succeededRows: upload.succeededRows,
        failedRows: upload.failedRows,
      });
    } catch {
      // Fire-and-forget
    }

    try {
      // Check if this is a retry (already has rows inserted)
      const existingRows = await this.uploadRowsRepository.countByStatus(
        upload.id,
      );
      const hasExistingRows = Object.values(existingRows).some((c) => c > 0);

      let modeResult;

      if (!hasExistingRows) {
        // Fresh upload — parse and insert rows
        // Step 2: Parse XLSX headers
        const headers = await this.parsingService.parseHeaders(
          upload.originalFilePath!,
        );

        // Step 3: Detect mode
        modeResult = this.parsingService.detectMode(headers);

        if (modeResult.mode === 'group') {
          // Group mode: parse all rows, group them, then insert
          await this.insertGroupRows(upload, modeResult);
        } else {
          // Standard mode: insert all rows individually
          await this.insertAllRows(upload);
        }
      } else {
        // Retry — rows already exist, detect mode from existing data
        // For retry, we need to detect mode from the file if it still exists
        if (upload.originalFilePath) {
          try {
            const headers = await this.parsingService.parseHeaders(
              upload.originalFilePath,
            );
            modeResult = this.parsingService.detectMode(headers);
          } catch {
            // File might be cleaned up after first run, default to standard
            modeResult = {
              mode: 'standard' as const,
              itemColumns: [],
              orderColumns: [],
            };
          }
        } else {
          modeResult = {
            mode: 'standard' as const,
            itemColumns: [],
            orderColumns: [],
          };
        }
        this.logger.log(
          `Upload=${upload.id}: retry detected, processing only pending rows`,
        );
      }

      // Step 5-6: Process rows in batches
      if (modeResult.mode === 'group' && !hasExistingRows) {
        await this.processGroupBatches(upload);
      } else {
        await this.processRowBatches(upload);
      }

      // Step 7: Determine final status
      const statusCounts =
        await this.uploadRowsRepository.countByStatus(upload.id);
      const succeeded = statusCounts[UploadRowStatus.SUCCEEDED] ?? 0;
      const failed =
        (statusCounts[UploadRowStatus.FAILED] ?? 0) +
        (statusCounts[UploadRowStatus.SKIPPED] ?? 0);

      let finalStatus: UploadStatus;
      if (failed === 0) {
        finalStatus = UploadStatus.COMPLETED;
      } else if (succeeded === 0) {
        finalStatus = UploadStatus.FAILED;
      } else {
        finalStatus = UploadStatus.PARTIAL;
      }

      // Step 8: Generate result file
      let resultFilePath: string | null = null;
      try {
        resultFilePath = await this.resultsService.generateResult(upload.id);
      } catch (error: any) {
        this.logger.error(
          `Failed to generate result for upload=${upload.id}: ${error.message}`,
        );
      }

      // Step 9: Update upload with final status and result
      const updatedUpload = await this.uploadsRepository.findById(upload.id);
      if (updatedUpload) {
        updatedUpload.status = finalStatus;
        updatedUpload.completedAt = new Date();
        if (modeResult.mode === 'group') {
          // totalEvents = number of groups (set during insertGroupRows)
          // Already set on the upload record, just ensure it's preserved
        } else {
          updatedUpload.totalEvents = upload.totalRows; // standard: 1 row = 1 event
        }
        if (resultFilePath) {
          updatedUpload.resultFilePath = resultFilePath;
          updatedUpload.resultGeneratedAt = new Date();
        }
        await this.uploadsRepository.save(updatedUpload);
      }

      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metricsService.observeDuration(durationSeconds);
      this.metricsService.incrementUploads(finalStatus);
      this.metricsService.observeWorkerProcessingDuration(durationSeconds);

      try {
        this.auditPublisher.publishUploadCompleted({
          uploadId: upload.id,
          fileName: upload.fileName,
          uploadedBy: upload.uploadedBy,
          status: finalStatus,
          totalRows: upload.totalRows,
          processedRows: succeeded + failed,
          succeededRows: succeeded,
          failedRows: failed,
          completedAt: updatedUpload?.completedAt?.toISOString(),
          resultFilePath: resultFilePath,
        });
      } catch {
        // Fire-and-forget
      }

      this.logger.log(
        `Upload=${upload.id} completed: status=${finalStatus} succeeded=${succeeded} failed=${failed} duration=${durationSeconds.toFixed(1)}s`,
      );
    } catch (error: any) {
      this.logger.error(
        `Upload=${upload.id} processing failed: ${error.message}`,
      );

      try {
        await this.uploadsRepository.updateStatus(
          upload.id,
          UploadStatus.FAILED,
        );
        this.metricsService.incrementUploads('failed');
      } catch (updateError: any) {
        this.logger.error(
          `Failed to update upload=${upload.id} status: ${updateError.message}`,
        );
      }
    } finally {
      this.currentUploadId = null;
      this.metricsService.setActiveUploads(0);
    }
  }

  private async insertAllRows(upload: Upload): Promise<void> {
    const rows: Array<{
      id: string;
      uploadId: string;
      rowNumber: number;
      rawData: Record<string, unknown>;
      status: UploadRowStatus;
    }> = [];

    for await (const parsedRow of this.parsingService.parseRows(
      upload.originalFilePath!,
    )) {
      rows.push({
        id: uuidv4(),
        uploadId: upload.id,
        rowNumber: parsedRow.rowNumber,
        rawData: parsedRow.data,
        status: UploadRowStatus.PENDING,
      });
    }

    if (rows.length > 0) {
      await this.uploadRowsRepository.bulkInsert(rows);
    }

    this.logger.log(
      `Upload=${upload.id}: inserted ${rows.length} rows as pending`,
    );
  }

  private async insertGroupRows(
    upload: Upload,
    modeResult: { mode: string; itemColumns: string[]; orderColumns: string[] },
  ): Promise<void> {
    // Collect all parsed rows first
    const allParsedRows: ParsedRow[] = [];
    for await (const parsedRow of this.parsingService.parseRows(
      upload.originalFilePath!,
    )) {
      allParsedRows.push(parsedRow);
    }

    // Group rows by composite key
    const groups = this.parsingService.extractGroupData(
      modeResult as any,
      allParsedRows,
      this.groupConflictMode,
    );

    // Update upload with totalEvents = number of groups
    const uploadRecord = await this.uploadsRepository.findById(upload.id);
    if (uploadRecord) {
      uploadRecord.totalEvents = groups.size;
      await this.uploadsRepository.save(uploadRecord);
    }

    // Insert rows with group keys
    const rows: Array<{
      id: string;
      uploadId: string;
      rowNumber: number;
      groupKey: string;
      rawData: Record<string, unknown>;
      status: UploadRowStatus;
    }> = [];

    for (const [compositeKey, group] of groups) {
      this.metricsService.observeGroupSize(group.items.length);

      for (const rowNumber of group.rowNumbers) {
        const parsedRow = allParsedRows.find(
          (r) => r.rowNumber === rowNumber,
        );
        rows.push({
          id: uuidv4(),
          uploadId: upload.id,
          rowNumber,
          groupKey: compositeKey,
          rawData: parsedRow?.data ?? {},
          status: UploadRowStatus.PENDING,
        });
      }
    }

    if (rows.length > 0) {
      await this.uploadRowsRepository.bulkInsert(rows);
    }

    this.logger.log(
      `Upload=${upload.id}: inserted ${rows.length} rows in ${groups.size} groups as pending`,
    );
  }

  private async processGroupBatches(upload: Upload): Promise<void> {
    // For group mode, we process entire groups at a time
    // Fetch all pending rows grouped by group_key
    let offset = 0;
    let hasMore = true;

    // Track which groups we've already processed
    const processedGroups = new Set<string>();

    while (hasMore && !this.shutdownRequested) {
      const batchStartTime = Date.now();

      // Check if upload has been cancelled
      const currentUpload = await this.uploadsRepository.findById(upload.id);
      if (
        currentUpload &&
        currentUpload.status === UploadStatus.CANCELLED
      ) {
        this.logger.log(`Upload=${upload.id} was cancelled, stopping`);
        return;
      }

      // Fetch next batch of pending rows
      const batchResult = await this.uploadRowsRepository.findPendingBatch(
        upload.id,
        this.batchSize,
        offset,
      );

      const batch = batchResult.data;
      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Group the batch rows by group_key
      const groupMap = new Map<
        string,
        Array<{ id: string; rowNumber: number; rawData: Record<string, unknown>; groupKey: string | null }>
      >();
      for (const row of batch) {
        const key = row.groupKey ?? `__no_group_${row.id}`;
        if (!processedGroups.has(key)) {
          if (!groupMap.has(key)) {
            groupMap.set(key, []);
          }
          groupMap.get(key)!.push(row);
        }
      }

      let batchSucceeded = 0;
      let batchFailed = 0;

      // Process groups (one event submission per group)
      for (const [groupKey, groupRows] of groupMap) {
        if (this.shutdownRequested) break;

        // Circuit breaker check
        if (!this.circuitBreaker.canExecute()) {
          this.updateCircuitBreakerMetrics();
          const waitTime = this.circuitBreaker.getTimeUntilRetry();
          this.logger.warn(
            `Upload=${upload.id}: circuit breaker OPEN, waiting ${waitTime}ms`,
          );
          await this.sleep(waitTime);

          if (!this.circuitBreaker.canExecute()) {
            // Still open — skip remaining
            this.logger.warn(
              `Upload=${upload.id}: circuit breaker still OPEN after cooldown, skipping batch`,
            );
            break;
          }
        }

        // Rate limiter
        const waitSeconds = await this.rateLimiter.acquire();
        if (waitSeconds > 0) {
          this.metricsService.observeRateLimiterWait(waitSeconds);
        }

        const success = await this.processGroup(upload, groupKey, groupRows);
        processedGroups.add(groupKey);

        if (success) {
          batchSucceeded += groupRows.length;
        } else {
          batchFailed += groupRows.length;
        }
      }

      // Update upload counters
      if (batchSucceeded > 0 || batchFailed > 0) {
        await this.uploadsRepository.updateCounters(
          upload.id,
          batchSucceeded,
          batchFailed,
        );
      }

      const batchDuration = (Date.now() - batchStartTime) / 1000;
      this.metricsService.observeWorkerBatchDuration(batchDuration);

      try {
        const currentState = await this.uploadsRepository.findById(upload.id);
        if (currentState) {
          const progressPercent =
            currentState.totalRows > 0
              ? Math.round(
                  (currentState.processedRows / currentState.totalRows) * 100,
                )
              : 0;
          this.auditPublisher.publishUploadProgress({
            uploadId: upload.id,
            fileName: upload.fileName,
            uploadedBy: upload.uploadedBy,
            status: 'processing',
            totalRows: currentState.totalRows,
            processedRows: currentState.processedRows,
            succeededRows: currentState.succeededRows,
            failedRows: currentState.failedRows,
            progressPercent,
          });
        }
      } catch {
        // Fire-and-forget
      }

      if (batch.length < this.batchSize) {
        hasMore = false;
      } else {
        offset += batch.length;
      }
    }
  }

  private async processGroup(
    upload: Upload,
    groupKey: string,
    rows: Array<{ id: string; rowNumber: number; rawData: Record<string, unknown>; groupKey: string | null }>,
  ): Promise<boolean> {
    const submissionStart = Date.now();
    const firstRow = rows[0];
    const data = firstRow.rawData;
    const eventType = data.eventType as string | undefined;

    // Skip groups without eventType
    if (!eventType || String(eventType).trim() === '') {
      for (const row of rows) {
        await this.uploadRowsRepository.updateRowStatus(
          row.id,
          UploadRowStatus.SKIPPED,
          "Missing required 'eventType' value",
        );
      }
      this.metricsService.incrementEventSubmission('failure');
      return false;
    }

    // Check for strict mode conflicts
    // We need to re-extract group data from the rows to detect conflicts
    const modeResult = this.parsingService.detectMode(
      Object.keys(data),
    );

    const parsedRows: ParsedRow[] = rows.map((r) => ({
      rowNumber: r.rowNumber,
      data: r.rawData,
    }));

    const groups = this.parsingService.extractGroupData(
      modeResult,
      parsedRows,
      this.groupConflictMode,
    );

    // Get the first (and only) group
    const groupData = groups.values().next().value;
    if (!groupData) {
      for (const row of rows) {
        await this.uploadRowsRepository.updateRowStatus(
          row.id,
          UploadRowStatus.FAILED,
          'Failed to extract group data',
        );
      }
      this.metricsService.incrementEventSubmission('failure');
      return false;
    }

    // In strict mode, reject group if conflicts detected
    if (
      this.groupConflictMode === 'strict' &&
      groupData.conflicts.length > 0
    ) {
      const conflictMsg = `Group conflict: ${groupData.conflicts.join('; ')}`;
      for (const row of rows) {
        await this.uploadRowsRepository.updateRowStatus(
          row.id,
          UploadRowStatus.FAILED,
          conflictMsg,
        );
      }
      this.metricsService.incrementEventSubmission('failure');
      return false;
    }

    // In warn mode, log conflicts but continue
    if (groupData.conflicts.length > 0) {
      this.logger.warn(
        `Upload=${upload.id} group=${groupKey}: order-level conflicts detected (using first row values): ${groupData.conflicts.join('; ')}`,
      );
    }

    // Build group event payload
    const cycleId = (data.cycleId as string) || upload.id;
    const groupKeyColumn = this.configService.get<string>(
      'app.groupKeyColumn',
      'orderId',
    );
    const groupKeyValue = data[groupKeyColumn] as string | undefined;

    const payload: Record<string, unknown> = {
      ...groupData.orderData,
      [this.groupItemsTargetField]: groupData.items,
    };

    const eventPayload: SubmitEventPayload = {
      sourceId: 'bulk-upload',
      cycleId,
      eventType: String(eventType),
      sourceEventId: `${upload.id}-group-${String(eventType)}-${groupKeyValue ?? 'unknown'}`,
      timestamp: new Date().toISOString(),
      payload,
    };

    try {
      const result =
        await this.eventIngestionClient.submitEvent(eventPayload);

      const submissionDuration = (Date.now() - submissionStart) / 1000;
      this.metricsService.observeEventSubmissionDuration(submissionDuration);

      if (result.success) {
        this.circuitBreaker.recordSuccess();
        this.updateCircuitBreakerMetrics();

        // Update all rows in the group to succeeded
        for (const row of rows) {
          await this.uploadRowsRepository.updateRowStatus(
            row.id,
            UploadRowStatus.SUCCEEDED,
            undefined,
            result.eventId,
          );
        }
        this.metricsService.incrementEventSubmission('success');
        return true;
      } else {
        // Record failure for circuit breaker only on 5xx errors
        if (result.statusCode && result.statusCode >= 500) {
          this.circuitBreaker.recordFailure();
          this.updateCircuitBreakerMetrics();
        }

        for (const row of rows) {
          await this.uploadRowsRepository.updateRowStatus(
            row.id,
            UploadRowStatus.FAILED,
            result.error || 'Unknown error',
          );
        }
        this.metricsService.incrementEventSubmission('failure');
        return false;
      }
    } catch (error: any) {
      this.circuitBreaker.recordFailure();
      this.updateCircuitBreakerMetrics();

      for (const row of rows) {
        await this.uploadRowsRepository.updateRowStatus(
          row.id,
          UploadRowStatus.FAILED,
          error.message || 'Unexpected error',
        );
      }
      this.metricsService.incrementEventSubmission('failure');
      return false;
    }
  }

  private async processRowBatches(upload: Upload): Promise<void> {
    let offset = 0;
    let hasMore = true;

    while (hasMore && !this.shutdownRequested) {
      const batchStartTime = Date.now();

      // Check if upload has been cancelled
      const currentUpload = await this.uploadsRepository.findById(upload.id);
      if (
        currentUpload &&
        currentUpload.status === UploadStatus.CANCELLED
      ) {
        this.logger.log(`Upload=${upload.id} was cancelled, stopping`);
        return;
      }

      // Fetch next batch of pending rows
      const batchResult = await this.uploadRowsRepository.findPendingBatch(
        upload.id,
        this.batchSize,
        offset,
      );

      const batch = batchResult.data;
      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Process batch with concurrency limit
      let batchSucceeded = 0;
      let batchFailed = 0;

      for (let i = 0; i < batch.length; i += this.concurrency) {
        if (this.shutdownRequested) break;

        // Circuit breaker check before each chunk
        if (!this.circuitBreaker.canExecute()) {
          this.updateCircuitBreakerMetrics();
          const waitTime = this.circuitBreaker.getTimeUntilRetry();
          this.logger.warn(
            `Upload=${upload.id}: circuit breaker OPEN, waiting ${waitTime}ms`,
          );
          await this.sleep(waitTime);

          if (!this.circuitBreaker.canExecute()) {
            this.logger.warn(
              `Upload=${upload.id}: circuit breaker still OPEN after cooldown, skipping remaining rows in batch`,
            );
            // Skip remaining rows in this batch
            for (let j = i; j < batch.length; j++) {
              await this.uploadRowsRepository.updateRowStatus(
                batch[j].id,
                UploadRowStatus.SKIPPED,
                'Circuit breaker open — skipped',
              );
              batchFailed++;
            }
            break;
          }
        }

        const chunk = batch.slice(i, i + this.concurrency);
        const results = await Promise.allSettled(
          chunk.map((row) => this.processRow(upload, row)),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            if (result.value) {
              batchSucceeded++;
            } else {
              batchFailed++;
            }
          } else {
            batchFailed++;
          }
        }
      }

      // Step 6: Update upload counters
      await this.uploadsRepository.updateCounters(
        upload.id,
        batchSucceeded,
        batchFailed,
      );

      const batchDuration = (Date.now() - batchStartTime) / 1000;
      this.metricsService.observeWorkerBatchDuration(batchDuration);

      try {
        const currentState = await this.uploadsRepository.findById(upload.id);
        if (currentState) {
          const progressPercent =
            currentState.totalRows > 0
              ? Math.round(
                  (currentState.processedRows / currentState.totalRows) * 100,
                )
              : 0;
          this.auditPublisher.publishUploadProgress({
            uploadId: upload.id,
            fileName: upload.fileName,
            uploadedBy: upload.uploadedBy,
            status: 'processing',
            totalRows: currentState.totalRows,
            processedRows: currentState.processedRows,
            succeededRows: currentState.succeededRows,
            failedRows: currentState.failedRows,
            progressPercent,
          });
        }
      } catch {
        // Fire-and-forget
      }

      this.logger.debug(
        `Upload=${upload.id}: batch processed succeeded=${batchSucceeded} failed=${batchFailed} duration=${batchDuration.toFixed(1)}s`,
      );

      if (batch.length < this.batchSize) {
        hasMore = false;
      } else {
        offset += batch.length;
      }
    }
  }

  private async processRow(
    upload: Upload,
    row: { id: string; rowNumber: number; rawData: Record<string, unknown> },
  ): Promise<boolean> {
    const submissionStart = Date.now();

    try {
      const data = row.rawData;
      const eventType = data.eventType as string | undefined;

      // Skip rows without eventType
      if (!eventType || String(eventType).trim() === '') {
        await this.uploadRowsRepository.updateRowStatus(
          row.id,
          UploadRowStatus.SKIPPED,
          "Missing required 'eventType' value",
        );
        this.metricsService.incrementEventSubmission('failure');
        return false;
      }

      // Rate limiter
      const waitSeconds = await this.rateLimiter.acquire();
      if (waitSeconds > 0) {
        this.metricsService.observeRateLimiterWait(waitSeconds);
      }

      // Build event payload
      const cycleId = (data.cycleId as string) || upload.id;
      const payload: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(data)) {
        if (CONTROL_COLUMNS.includes(key)) continue;
        if (key.startsWith(RESERVED_PREFIX)) continue;
        payload[key] = value;
      }

      const eventPayload: SubmitEventPayload = {
        sourceId: 'bulk-upload',
        cycleId,
        eventType: String(eventType),
        sourceEventId: `${upload.id}-row-${row.rowNumber}`,
        timestamp: new Date().toISOString(),
        payload,
      };

      // Submit to Event Ingestion Service
      const result =
        await this.eventIngestionClient.submitEvent(eventPayload);

      const submissionDuration = (Date.now() - submissionStart) / 1000;
      this.metricsService.observeEventSubmissionDuration(submissionDuration);

      if (result.success) {
        this.circuitBreaker.recordSuccess();
        this.updateCircuitBreakerMetrics();

        await this.uploadRowsRepository.updateRowStatus(
          row.id,
          UploadRowStatus.SUCCEEDED,
          undefined,
          result.eventId,
        );
        this.metricsService.incrementEventSubmission('success');
        return true;
      } else {
        // Record failure for circuit breaker only on 5xx or connection errors
        if (result.statusCode && result.statusCode >= 500) {
          this.circuitBreaker.recordFailure();
          this.updateCircuitBreakerMetrics();
        }

        await this.uploadRowsRepository.updateRowStatus(
          row.id,
          UploadRowStatus.FAILED,
          result.error || 'Unknown error',
        );
        this.metricsService.incrementEventSubmission('failure');
        return false;
      }
    } catch (error: any) {
      this.circuitBreaker.recordFailure();
      this.updateCircuitBreakerMetrics();

      await this.uploadRowsRepository.updateRowStatus(
        row.id,
        UploadRowStatus.FAILED,
        error.message || 'Unexpected error',
      );
      this.metricsService.incrementEventSubmission('failure');
      return false;
    }
  }

  private updateCircuitBreakerMetrics(): void {
    const state = this.circuitBreaker.getState();
    let stateValue = 0;
    if (state === CircuitBreakerState.OPEN) {
      stateValue = 1;
      this.metricsService.incrementCircuitBreakerTrips();
    } else if (state === CircuitBreakerState.HALF_OPEN) {
      stateValue = 2;
    }
    this.metricsService.setCircuitBreakerState(stateValue);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
