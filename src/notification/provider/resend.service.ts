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
      // 1. Get raw env value or fallback
      let fromEmail =
        this.config.get<string>('RESEND_FROM_EMAIL') ||
        '"Aviorè Security" <no-reply@aviorego.com.ng>';

      // 2. Strip accidental enclosing quotes from .env parsing
      fromEmail = fromEmail.trim().replace(/^["']|["']$/g, '');

      // 3. Ensure display name with special characters (like è) is wrapped in double quotes
      if (!fromEmail.startsWith('"') && fromEmail.includes('<')) {
        const parts = fromEmail.split('<');
        const name = parts[0].trim();
        const email = parts[1];
        fromEmail = `"${name}" <${email}`;
      }

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