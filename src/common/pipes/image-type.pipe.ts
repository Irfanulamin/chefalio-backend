import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';

@Injectable()
export class ImageTypePipe implements PipeTransform {
  async transform(file: Express.Multer.File | undefined) {
    if (!file) return file;
    const type = await fileTypeFromBuffer(file.buffer);
    const allowed = ['image/jpeg', 'image/png'];
    if (!type || !allowed.includes(type.mime)) {
      throw new BadRequestException('Only JPEG and PNG images are allowed');
    }
    return file;
  }
}
