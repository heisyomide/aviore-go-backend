import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from '../uploads/upload.service';

// Interface defining the expected Cloudinary upload result structure
interface CloudinaryUploadResponse {
  secure_url?: string;
  url?: string;
  [key: string]: any;
}

const DOCUMENT_VALIDATION_PIPE = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024, message: 'File is too large. Max size is 5MB.' }),
    new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|pdf)$/ }),
  ],
});

const PHOTO_VALIDATION_PIPE = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024, message: 'Image is too large. Max size is 5MB.' }),
    new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
  ],
});

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('rider/id-front')
  @UseInterceptors(FileInterceptor('file'))
  async uploadIdFront(@UploadedFile(DOCUMENT_VALIDATION_PIPE) file: any) {
    const result = (await this.uploadsService.uploadKycDocument(file)) as CloudinaryUploadResponse;
    return { url: result?.secure_url || result?.url };
  }

  @Post('rider/id-back')
  @UseInterceptors(FileInterceptor('file'))
  async uploadIdBack(@UploadedFile(DOCUMENT_VALIDATION_PIPE) file: any) {
    const result = (await this.uploadsService.uploadKycDocument(file)) as CloudinaryUploadResponse;
    return { url: result?.secure_url || result?.url };
  }

  @Post('rider/selfie')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSelfie(@UploadedFile(PHOTO_VALIDATION_PIPE) file: any) {
    const result = (await this.uploadsService.uploadSelfie(file)) as CloudinaryUploadResponse;
    return { url: result?.secure_url || result?.url };
  }

  @Post('rider/vehicle-photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVehiclePhoto(
    @UploadedFile(PHOTO_VALIDATION_PIPE) file: any,
  ) {
    const result = (await this.uploadsService.uploadVehiclePhoto(file)) as CloudinaryUploadResponse;
    return { url: result?.secure_url || result?.url };
  }

  @Post('license')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLicense(@UploadedFile(DOCUMENT_VALIDATION_PIPE) file: any) {
    const result = (await this.uploadsService.uploadVehicleDocument(file)) as CloudinaryUploadResponse;
    return { url: result?.secure_url || result?.url };
  }

  @Post('rider/vehicle-paper')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVehiclePaper(@UploadedFile(DOCUMENT_VALIDATION_PIPE) file: any) {
    const result = (await this.uploadsService.uploadKycDocument(file)) as CloudinaryUploadResponse;
    return { url: result?.secure_url || result?.url };
  }

  @Post('rider/insurance')
  @UseInterceptors(FileInterceptor('file'))
  async uploadInsurance(@UploadedFile(DOCUMENT_VALIDATION_PIPE) file: any) {
    const result = (await this.uploadsService.uploadKycDocument(file)) as CloudinaryUploadResponse;
    return { url: result?.secure_url || result?.url };
  }

  @Post('rider/road-worthiness')
  @UseInterceptors(FileInterceptor('file'))
  async uploadRoadWorthiness(@UploadedFile(DOCUMENT_VALIDATION_PIPE) file: any) {
    const result = (await this.uploadsService.uploadKycDocument(file)) as CloudinaryUploadResponse;
    return { url: result?.secure_url || result?.url };
  }

  @Post('rider/profile-photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfilePhoto(
    @UploadedFile(PHOTO_VALIDATION_PIPE) file: any,
  ) {
    // Cast 'result' as CloudinaryUploadResponse to bypass the strict 'unknown' assignment error
    const result = (await this.uploadsService.uploadProfilePhoto(file)) as CloudinaryUploadResponse;
    return { url: result?.secure_url || result?.url };
  }
}