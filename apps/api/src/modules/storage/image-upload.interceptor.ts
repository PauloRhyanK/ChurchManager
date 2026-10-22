import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  PayloadTooLargeException,
  Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BYTES } from './storage.service';

const MulterFile: Type<NestInterceptor> = FileInterceptor('file', {
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

/** Recebe o campo `file` com limite de 5 MB e erro 413 em pt-BR. */
export class ImageUploadInterceptor extends MulterFile {
  override async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (err) {
      if (err instanceof PayloadTooLargeException) {
        throw new PayloadTooLargeException(IMAGE_TOO_LARGE_MESSAGE);
      }
      throw err;
    }
  }
}
