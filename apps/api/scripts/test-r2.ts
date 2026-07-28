import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testUpload() {
  console.log('Testing R2 Upload...');
  console.log('R2_ENDPOINT:', process.env.R2_ENDPOINT);
  console.log('R2_BUCKET_NAME:', process.env.R2_BUCKET_NAME);
  console.log('R2_ACCESS_KEY_ID:', process.env.R2_ACCESS_KEY_ID);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  });

  try {
    const res = await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: 'test-from-script.txt',
        Body: Buffer.from('hello from script'),
        ContentType: 'text/plain',
      })
    );
    console.log('Upload successful!', res);
  } catch (err) {
    console.error('Upload failed with error:', err);
  }
}

testUpload();
