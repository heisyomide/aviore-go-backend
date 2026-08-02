import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';

export interface TicketMessage {
  id: string;
  senderId: string;
  senderRole: 'RIDER' | 'CUSTOMER' | 'ADMIN';
  message: string;
  createdAt: Date;
}

export interface Ticket {
  id: string;
  userId: string;
  subject: string;
  category: string;
  jobId?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  messages: TicketMessage[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TicketsService {
  // Replace this mock array with your Database Prisma/TypeORM repo
  private tickets: Ticket[] = [];

  async createTicket(userId: string, data: { subject: string; category: string; message: string; jobId?: string }) {
    const newTicket: Ticket = {
      id: `TICK_${Date.now()}`,
      userId,
      subject: data.subject,
      category: data.category,
      jobId: data.jobId,
      status: 'OPEN',
      messages: [
        {
          id: `MSG_${Date.now()}`,
          senderId: userId,
          senderRole: 'RIDER',
          message: data.message,
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tickets.push(newTicket);
    return newTicket;
  }

  async getUserTickets(userId: string) {
    return this.tickets.filter((t) => t.userId === userId);
  }

  async getTicketById(id: string) {
    const ticket = this.tickets.find((t) => t.id === id);
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async addReply(ticketId: string, senderId: string, role: 'RIDER' | 'CUSTOMER' | 'ADMIN', message: string) {
    const ticket = await this.getTicketById(ticketId);

    // CRITICAL REQUIREMENT: Lock conversation if resolved/closed
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      throw new BadRequestException(
        'This issue has been resolved and closed by management. You cannot send further messages.'
      );
    }

    const newMessage: TicketMessage = {
      id: `MSG_${Date.now()}`,
      senderId,
      senderRole: role,
      message,
      createdAt: new Date(),
    };

    ticket.messages.push(newMessage);
    ticket.updatedAt = new Date();

    return ticket;
  }

  async resolveTicket(ticketId: string) {
    const ticket = await this.getTicketById(ticketId);
    ticket.status = 'RESOLVED';
    ticket.updatedAt = new Date();
    return ticket;
  }
}