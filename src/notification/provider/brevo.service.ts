import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class BrevoService {
  private brevoClient: BrevoClient;

  constructor(private readonly config: ConfigService) {
    this.brevoClient = new BrevoClient({
      apiKey: this.config.get<string>('BREVO_API_KEY') || '',
    });
  }

  async sendBroadcastEmail(
    to: string[],
    subject: string,
    htmlContent: string,
  ): Promise<any> {
    try {
      const fromEmail =
        this.config.get<string>('BREVO_FROM_EMAIL') ||
        'support@aviorego.com.ng';
      const replyToEmail =
        this.config.get<string>('BREVO_REPLY_TO') || fromEmail;

      // Map each recipient cleanly into individual 'to' entries for proper envelope headers,
      // or batch if volume is high. Brevo accepts an array of destination objects in 'to'.
      return await this.brevoClient.transactionalEmails.sendTransacEmail({
        subject,
        htmlContent,
        sender: {
          name: 'Aviorè Go',
          email: fromEmail,
        },
        replyTo: {
          email: replyToEmail,
          name: 'Aviorè Go Support',
        },
        to: to.map((email) => ({ email })),
      });
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Brevo broadcast failed: ${error?.message || 'Unknown error'}`,
      );
    }
  }
}