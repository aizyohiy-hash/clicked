export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-[var(--foreground)]/50">
      Conversation {id}
    </div>
  );
}
