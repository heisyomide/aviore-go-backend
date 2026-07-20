import {
  Injectable,
  RequestTimeoutException,
  InternalServerErrorException,
} from '@nestjs/common';

import { CloudinaryService } from './cloudinary.service';
import { UploadFolder } from './upload-folders.enum';

@Injectable()
export class UploadsService {
  constructor(
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Upload any file with global timeout & network drop protection
   */
  async upload(
    file: Express.Multer.File,
    folder: UploadFolder,
  ) {
    try {
      // Direct call to your existing cloudinary upload pipeline
      return await this.cloudinaryService.uploadFile(
        file,
        folder,
      );
    } catch (error: any) {
      console.error('--- Media Storage Gateway Exception ---', error);

      // Handle Cloudinary client cancellation/timeout thresholds (e.g., http_code 499)
      if (error?.http_code === 499 || error?.name === 'TimeoutError' || error?.status === 499) {
        throw new RequestTimeoutException(
          'Storage server connection timed out. Please check your network connection and retry upload.',
        );
      }

      // Fallback for missing file context or invalid buffers
      throw new InternalServerErrorException(
        error?.message || 'An unexpected failure occurred while processing file streams.',
      );
    }
  }

  /**
   * Upload profile picture
   */
  async uploadProfilePhoto(
    file: Express.Multer.File,
  ) {
    return this.upload(
      file,
      UploadFolder.PROFILE_PHOTO,
    );
  }

  /**
   * Upload selfie
   */
  async uploadSelfie(
    file: Express.Multer.File,
  ) {
    return this.upload(
      file,
      UploadFolder.SELFIE,
    );
  }

  /**
   * Upload KYC document
   */
  async uploadKycDocument(
    file: Express.Multer.File,
  ) {
    return this.upload(
      file,
      UploadFolder.KYC_DOCUMENT,
    );
  }

  /**
   * Upload vehicle picture
   */
  async uploadVehiclePhoto(
    file: Express.Multer.File,
  ) {
    return this.upload(
      file,
      UploadFolder.VEHICLE,
    );
  }

  /**
   * Upload vehicle document
   */
  async uploadVehicleDocument(
    file: Express.Multer.File,
  ) {
    return this.upload(
      file,
      UploadFolder.VEHICLE_DOCUMENT,
    );
  }
}