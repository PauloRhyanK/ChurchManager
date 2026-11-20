import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  PayloadTooLargeException,
  Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_SLIDE_PNG_BYTES, SLIDE_PNG_TOO_LARGE_MESSAGE } from './storage.service';

const MulterFile: Type<NestInterceptor> = FileInterceptor('file', {
  limits: { fileSize: MAX_SLIDE_PNG_BYTES, files: 1 },
});

/** Recebe o campo `file` (imagem de slide) com limite de 1,5 MB e erro 413 em pt-BR. */
export class PngUploadInterceptor extends MulterFile {
  override async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (err) {
      if (err instanceof PayloadTooLargeException) {
        throw new PayloadTooLargeException(SLIDE_PNG_TOO_LARGE_MESSAGE);
      }
      throw err;
    }
  }
}
