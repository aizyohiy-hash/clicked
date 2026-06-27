import type { Message, MessageEnvelope } from '../db/schema.js';

type MessageWithEnvelopes = Message & {
  envelopes?: MessageEnvelope[];
};

export function serializeMessage<T extends MessageWithEnvelopes>(
  message: T,
): Omit<T, 'deletedAt'> & { content: string | null } {
  const { deletedAt, ...rest } = message;
  const content = deletedAt
    ? null
    : message.envelopes && message.envelopes.length > 0
      ? message.envelopes[0].content
      : null;

  return {
    ...rest,
    content,
  } as Omit<T, 'deletedAt'> & { content: string | null };
}
