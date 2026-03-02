import { Controller, Post, Body, HttpCode, Logger } from '@nestjs/common';
import { SendRequestDto, SendResultDto } from '@app/common';
import { SendService } from './send.service.js';

@Controller()
export class SendController {
  private readonly logger = new Logger(SendController.name);

  constructor(private readonly sendService: SendService) {}

  @Post('send')
  @HttpCode(200)
  async send(@Body() request: SendRequestDto): Promise<SendResultDto> {
    try {
      return await this.sendService.send(request);
    } catch (error) {
      this.logger.error(
        `Unexpected error in send controller: ${(error as Error).message}`,
      );

      return {
        success: false,
        providerMessageId: null,
        retryable: false,
        errorMessage: (error as Error).message || 'Unexpected internal error',
        httpStatus: 500,
        providerResponse: null,
      };
    }
  }
}
