// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { PutObjectCommand, PutObjectCommandInput, S3Client } from '@aws-sdk/client-s3';

const bucket = process.env.BUCKET_NAME || 'audit-events';
const s3 = new S3Client({});

async function handler(event: any): Promise<string | void> {
  try {

    console.log('Raw event', event);
    
    if (!event.detail.data) { // no need to store object upon delete
      return ''
    }

    const key = generateS3Key(event);
    const body = JSON.stringify(event.detail.data);
    const params: PutObjectCommandInput = {
      Body: body,
      ContentType: 'application/json',
      Bucket: bucket, 
      Key: key
     };
    await s3.send(new PutObjectCommand(params));
    return key;

  } catch (e) {
    console.log('There has been an error while trying to save to Amazon S3', e);
    throw e;
  }
}

function generateS3Key(event: any): string {
  const {id, detail} = event;
  const paddingChar = "0";
  const d = new Date(parseInt(detail.ts, 10));  
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, paddingChar);
  const day = d.getDate().toString().padStart(2, paddingChar);

  return `${year}/${month}/${day}/${id}`;
}

export { handler };
