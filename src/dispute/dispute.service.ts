import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service'; // Adjust import to your Prisma service
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { DisputeStatus } from '@prisma/client';

@Injectable()
export class DisputeService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Create a dispute (Customer or Rider)
  async createDispute(reporterId: string, dto: CreateDisputeDto) {
    // Check if an active dispute already exists for this job by this user
    const existingDispute = await this.prisma.dispute.findFirst({
      where: {
        jobId: dto.jobId,
        reporterId,
        status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
      },
    });

    if (existingDispute) {
      throw new BadRequestException('You already have an active dispute for this order.');
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        jobId: dto.jobId,
        reporterId,
        reportedByRole: dto.reportedByRole,
        reason: dto.reason,
        description: dto.description,
        logs: {
          create: {
            actorId: reporterId,
            action: 'DISPUTE_CREATED',
            note: `Dispute opened for reason: ${dto.reason}`,
          },
        },
      },
    });

    return dispute;
  }

  // 2a. Fetch disputes created by the authenticated user
  async findMyDisputes(userId: string) {
    return this.prisma.dispute.findMany({
      where: {
        reporterId: userId,
      },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 2b. Fetch disputes (Filtered for Admin)
  async findAll(status?: DisputeStatus, jobId?: string) {
    return this.prisma.dispute.findMany({
      where: {
        ...(status && { status }),
        ...(jobId && { jobId }),
      },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 3. Get single dispute details
  async findOne(id: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute with ID ${id} not found.`);
    }

    return dispute;
  }

  // 4. Update Status (e.g., mark UNDER_REVIEW)
  async updateStatus(id: string, adminId: string, status: DisputeStatus) {
    const dispute = await this.findOne(id);

    return this.prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status,
        logs: {
          create: {
            actorId: adminId,
            action: 'STATUS_CHANGED',
            note: `Status updated to ${status}`,
          },
        },
      },
    });
  }

  // 5. Resolve Dispute (Admin action)
  async resolveDispute(id: string, adminId: string, dto: ResolveDisputeDto) {
    const dispute = await this.findOne(id);

    if (dispute.status === DisputeStatus.RESOLVED) {
      throw new BadRequestException('Dispute is already resolved.');
    }

    const updatedDispute = await this.prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: dto.status,
        resolution: dto.resolution,
        adminNotes: dto.adminNotes,
        resolvedById: adminId,
        resolvedAt: new Date(),
        logs: {
          create: {
            actorId: adminId,
            action: `DISPUTE_${dto.status}`,
            note: `Resolution outcome: ${dto.resolution || 'N/A'}. Admin note: ${dto.adminNotes}`,
          },
        },
      },
    });

    return updatedDispute;
  }
}