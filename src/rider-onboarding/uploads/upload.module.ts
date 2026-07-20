import { Module, Global } from '@nestjs/common';
import { UploadsController } from '../uploads/upload.controller';
import { UploadsService } from '../uploads/upload.service';
import { CloudinaryService } from './cloudinary.service';
import { CloudinaryProvider } from './cloudinary.provider';

@Global() // This makes UploadsService available app-wide without re-importing UploadsModule
@Module({
  controllers: [UploadsController],
  providers: [UploadsService, CloudinaryService, CloudinaryProvider],
  exports: [UploadsService],
})
export class UploadsModule {}