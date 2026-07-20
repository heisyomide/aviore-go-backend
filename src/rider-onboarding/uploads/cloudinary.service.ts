import {
  Inject,
  Injectable,
} from '@nestjs/common';

import { v2 as Cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(
    @Inject('CLOUDINARY')
    private readonly cloudinary: typeof Cloudinary,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    folder: string,
  ) {
    return new Promise((resolve, reject) => {
      this.cloudinary.uploader
        .upload_stream(
          {
            folder,

            resource_type: 'auto',
          },
          (error, result) => {
            if (error) {
              return reject(error);
            }

            resolve(result);
          },
        )
        .end(file.buffer);
    });
  }

  async deleteFile(
    publicId: string,
  ) {
    return this.cloudinary.uploader.destroy(
      publicId,
    );
  }
}