import { Router } from 'express';
import type { IRouter } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { messages, conversationMembers } from '../db/schema.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const filesRouter: IRouter = Router();
filesRouter.use(requireAuth);

const s3 = new S3Client({
  region: process.env['AWS_REGION'] || 'us-east-1',
});
const bucketName = process.env['AWS_BUCKET'] || 'clicked-files';

filesRouter.get('/:fileId', async (req: AuthRequest, res) => {
  const userId = req.auth!.userId;
  const fileId = req.params['fileId'] as string;

  if (!fileId) {
    res.status(400).json({ error: 'File id is required' });
    return;
  }

  // Find the message that references this file
  const message = await db.query.messages.findFirst({
    where: eq(messages.id, fileId),
  });

  if (!message) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // Check if the user is a member of the conversation where the file was shared
  const membership = await db.query.conversationMembers.findFirst({
    where: and(
      eq(conversationMembers.conversationId, message.conversationId),
      eq(conversationMembers.userId, userId),
    ),
  });

  if (!membership) {
    res.status(403).json({ error: 'Not authorized to access this file' });
    return;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileId,
    });
    // Short-lived URL: 5 minutes
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    res.json({ url: presignedUrl });
  } catch {
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});
