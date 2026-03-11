import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  SesSendOptions,
  SesSmtpResponse,
  SesSendResult,
  SesClientInterface,
} from './interfaces/ses.interfaces.js';

@Injectable()
export class SesSmtpClientService implements OnModuleInit, SesClientInterface {
  private readonly logger = new Logger(SesSmtpClientService.name);
  private transporter!: nodemailer.Transporter;

  private readonly smtpHost: string;
  private readonly smtpPort: number;
  private readonly smtpUsername: string;
  private readonly smtpPassword: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.smtpHost = this.configService.get<string>(
      'ses.smtpHost',
      'email-smtp.us-east-1.amazonaws.com',
    );
    this.smtpPort = this.configService.get<number>('ses.smtpPort', 587);
    this.smtpUsername = this.configService.get<string>('ses.smtpUsername', '');
    this.smtpPassword = this.configService.get<string>('ses.smtpPassword', '');
    this.timeoutMs = this.configService.get<number>('ses.timeoutMs', 10000);
  }

  onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: this.smtpHost,
      port: this.smtpPort,
      secure: this.smtpPort === 465,
      auth: {
        user: this.smtpUsername,
        pass: this.smtpPassword,
      },
      tls: {
        ciphers: 'SSLv3',
      },
      connectionTimeout: this.timeoutMs,
      greetingTimeout: this.timeoutMs,
      socketTimeout: this.timeoutMs,
    });

    this.logger.log(
      `SES SMTP transporter initialized: ${this.smtpHost}:${this.smtpPort}`,
    );
  }

  async sendEmail(options: SesSendOptions): Promise<SesSmtpResponse> {
    const mailOptions: nodemailer.SendMailOptions = {
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      headers: options.headers,
      attachments: options.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    };

    this.logger.debug(`Sending email via SES SMTP to ${options.to}`);

    const info = await this.transporter.sendMail(mailOptions);

    return {
      messageId: info.messageId,
      envelope: {
        from: info.envelope.from,
        to: Array.isArray(info.envelope.to)
          ? info.envelope.to
          : [info.envelope.to],
      },
    };
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.warn(
        `SES SMTP connection verification failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async checkConnectivity(): Promise<{
    ok: boolean;
    latencyMs: number;
    details: Record<string, any>;
  }> {
    const start = Date.now();
    try {
      const connected = await this.verifyConnection();
      const latencyMs = Date.now() - start;

      return {
        ok: connected,
        latencyMs,
        details: {
          smtpHost: this.smtpHost,
          mode: 'smtp',
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      return {
        ok: false,
        latencyMs,
        details: {
          smtpHost: this.smtpHost,
          mode: 'smtp',
          error: (error as Error).message,
        },
      };
    }
  }

  getSmtpHost(): string {
    return this.smtpHost;
  }
}
