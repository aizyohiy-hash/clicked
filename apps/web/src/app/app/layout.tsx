import { ConversationListSidebar } from "@/components/conversations/ConversationListSidebar";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <ConversationListSidebar />
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <p className="text-sm text-[var(--foreground)]/45">clicked.</p>
            <h1 className="text-xl font-semibold">Messages</h1>
          </div>
          <WalletConnectButton />
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </section>
    </main>
  );
}
