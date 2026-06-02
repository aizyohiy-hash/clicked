type MessageLike = {
  content: string | null;
  deletedAt?: Date | null;
};

export function serializeMessage<T extends MessageLike>(
  message: T,
): Omit<T, 'deletedAt'> & { content: string | null } {
  const { deletedAt, ...rest } = message;

  return {
    ...rest,
    content: deletedAt ? null : message.content,
  };
}
