import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';

@Injectable()
export class ImageTypePipe implements PipeTransform {
  async transform(file: Express.Multer.File | undefined) {
    if (!file) return file;
    const type = await fileTypeFromBuffer(file.buffer);
    const allowed = /^image\//;
    if (!type || !allowed.test(type.mime)) {
      throw new BadRequestException('Only image files are allowed');
    }
    return file;
  }
}
