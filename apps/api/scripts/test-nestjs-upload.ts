import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/modules/storage/storage.service';

async function testNestJSUpload() {
  console.log('Initializing NestJS app context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('NestJS app context initialized successfully!');

  const storageService = app.get(StorageService);
  console.log('Got StorageService instance.');

  try {
    const dummyBuffer = Buffer.from('dummy image content');
    console.log('Uploading file to R2 via StorageService...');
    const url = await storageService.uploadFile(dummyBuffer, 'dummy.png', 'test-nestjs');
    console.log('Upload successful! Public URL:', url);
  } catch (err) {
    console.error('Upload failed with error inside StorageService:', err);
  } finally {
    await app.close();
  }
}

testNestJSUpload();
