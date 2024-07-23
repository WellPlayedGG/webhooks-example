import crypto from 'crypto';
import { Request } from 'express';
import { RawBodyRequest } from '@nestjs/common';

export const checkSignature = ({
  secret,
  request,
}: {
  request: RawBodyRequest<Request>;
  secret: string;
}) => {
  const signature = request.header('wp-webhook-signature');
  const messageId = request.header('wp-webhook-message-id');
  const timestamp = request.header('wp-webhook-timestamp');
  const payload = request.rawBody;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(messageId + timestamp + payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    throw new Error('Invalid signature');
  }
};
