import { getCurrentTenant } from "@/lib/tenant-server";
import { fetchMessages } from "./actions";
import { ChatThread } from "@/components/dashboard/ChatThread";

export const metadata = {
  title: "Messages – SparkBooks",
};

export default async function MessagesPage() {
  const tenant = await getCurrentTenant();

  const result = await fetchMessages({
    tenantId: tenant.id,
    limit: 40,
  });

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-xl text-ink">Messages</h1>
        <p className="text-xs text-ink-muted mt-0.5">
          WhatsApp conversation history for {tenant.businessName}
        </p>
      </div>

      <ChatThread
        tenantId={tenant.id}
        initialMessages={result.messages}
        initialHasMore={result.hasMore}
        initialNextCursor={result.nextCursor}
      />
    </div>
  );
}
