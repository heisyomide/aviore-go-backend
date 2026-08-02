import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  async createTicket(@Req() req: any, @Body() body: { subject: string; category: string; message: string; jobId?: string }) {
    const userId = req.user?.id || 'RIDER_123';
    return this.ticketsService.createTicket(userId, body);
  }

  @Get()
  async getUserTickets(@Req() req: any) {
    const userId = req.user?.id || 'RIDER_123';
    return this.ticketsService.getUserTickets(userId);
  }

  @Get(':id')
  async getTicketById(@Param('id') id: string) {
    return this.ticketsService.getTicketById(id);
  }

  @Post(':id/reply')
  async addReply(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { message: string }
  ) {
    const userId = req.user?.id || 'RIDER_123';
    const role = req.user?.role || 'RIDER';
    return this.ticketsService.addReply(id, userId, role, body.message);
  }

  // Admin-only endpoint to close tickets
  @Post(':id/resolve')
  async resolveTicket(@Param('id') id: string) {
    return this.ticketsService.resolveTicket(id);
  }
}