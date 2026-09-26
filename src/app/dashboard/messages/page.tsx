import { getCurrentTenant } from "@/lib/tenant-server";
import { fetchMessages } from "./actions";
import { ChatThread } from "@/components/dashboard/ChatThread";
import { getWhatsAppBotUrl } from "@/lib/whatsapp";

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-xl text-ink">Messages</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            WhatsApp conversation history for <strong className="text-ink">{tenant.businessName}</strong>
          </p>
        </div>

        <a
          href={getWhatsAppBotUrl(tenant.businessName)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          Open WhatsApp Chat ↗
        </a>
      </div>

      <ChatThread
        tenantId={tenant.id}
        businessName={tenant.businessName}
        initialMessages={result.messages}
        initialHasMore={result.hasMore}
        initialNextCursor={result.nextCursor}
      />
    </div>
  );
}
