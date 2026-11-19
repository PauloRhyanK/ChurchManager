import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  PayloadTooLargeException,
  Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AUDIO_TOO_LARGE_MESSAGE, MAX_AUDIO_BYTES } from './storage.service';

const MulterFile: Type<NestInterceptor> = FileInterceptor('file', {
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
});

/** Recebe o campo `file` com limite de 90 MB e erro 413 em pt-BR. */
export class AudioUploadInterceptor extends MulterFile {
  override async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (err) {
      if (err instanceof PayloadTooLargeException) {
        throw new PayloadTooLargeException(AUDIO_TOO_LARGE_MESSAGE);
      }
      throw err;
    }
  }
}
