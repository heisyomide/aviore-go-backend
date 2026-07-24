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
      return await this.brevoClient.transactionalEmails.sendTransacEmail({
        subject,
        htmlContent,
        sender: {
          name: 'Aviorè Dispatch',
          email:
            this.config.get<string>('BREVO_FROM_EMAIL') ||
            'dispatch@aviore.com',
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