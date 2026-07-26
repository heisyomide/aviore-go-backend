import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class ResendService {
  private resend: Resend;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
  }

  async sendPriorityEmail(to: string, subject: string, html: string) {
    try {
      // Uses RESEND_FROM_EMAIL if set, otherwise falls back to Resend's default test sender
      const fromEmail =
        this.config.get<string>('RESEND_FROM_EMAIL') ||
        'Aviorè Security <onboarding@resend.dev>';

      const res = await this.resend.emails.send({
        from: fromEmail,
        to: [to],
        subject,
        html,
      });

      if (res.error) {
        throw new InternalServerErrorException(
          `Resend API Error: ${res.error.message}`,
        );
      }

      return res;
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Resend dispatch failed: ${error?.message || 'Unknown error'}`,
      );
    }
  }
}