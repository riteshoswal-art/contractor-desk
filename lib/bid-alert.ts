// Server-only: the builder's "new bid received" Telegram alert (live demo).
//
// It is called only AFTER a bid has been validated and saved (submitBid
// returned ok with a new bid ID), so a duplicate, a rejected bid or a page
// refresh never produces an alert. Each bid ID is alerted at most once. The bid
// is never touched here: if Telegram fails, the bid stays saved and the failure
// is recorded for the builder view. TEST records only. The destination is the
// builder's demo chat (TELEGRAM_DEMO_CHAT_ID), never a contractor.
import { formatBidPrice } from "./bid";
import { loadBids } from "./bid-store";
import type { ContractorSheet } from "./contractor-store";
import { demoState, updateDemo, type BidAlertLog } from "./demo-store";
import { loadContractors, loadRequests } from "./records";
import type { RecordType } from "./registration";
import { sendDemoMessage, type TelegramConfig } from "./telegram";

export function istTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) + " IST";
}

export function composeBidAlert(args: {
  requestId: string;
  trade: string;
  area: string;
  contractorName: string;
  price: string;
  provisional: boolean;
  receivedAt: string;
  bidCount: number;
  link: string;
}): string {
  return [
    "Contractor Desk (demo) · New bid received",
    `Ticket: ${args.requestId} (${args.trade} in ${args.area})`,
    `Contractor: ${args.contractorName}`,
    `Quote: ${args.price}`,
    `Status: ${args.provisional ? "Provisional — start date needs confirmation before this bid can be selected" : "Received"}`,
    `Received: ${istTime(args.receivedAt)}`,
    `Bids so far on this ticket: ${args.bidCount}`,
    "",
    "Compare bids (prices are only compared within the same unit):",
    args.link,
  ].join("\n");
}

export async function alertBuilder(
  sheet: ContractorSheet,
  args: { bidId: string; provisional: boolean },
  env: { recordType: RecordType; telegram: TelegramConfig; baseUrl: string; now?: Date; fetchImpl?: Parameters<typeof sendDemoMessage>[2] },
): Promise<BidAlertLog | null> {
  if (env.recordType !== "TEST") return null;
  if (demoState().bidAlerts[args.bidId]) return null; // already alerted (or tried) for this bid
  const bids = await loadBids(sheet, env.recordType);
  const bid = bids.find((b) => b.id === args.bidId && !b.voided);
  if (!bid) return null;

  const now = env.now ?? new Date();
  const record = (log: BidAlertLog) => {
    updateDemo((s) => {
      s.bidAlerts[args.bidId] = log;
    });
    return log;
  };
  if (!env.telegram.configured) return record({ status: "not_configured", at: now.toISOString() });

  const request = (await loadRequests(sheet)).find((r) => r.id === bid.requestId && r.recordType === env.recordType);
  const contractor = (await loadContractors(sheet)).find((c) => c.id === bid.contractorId && c.recordType === env.recordType);
  const text = composeBidAlert({
    requestId: bid.requestId,
    trade: request?.trade ?? "",
    area: request?.area ?? "",
    contractorName: contractor?.name || bid.contractorId,
    price: formatBidPrice(bid.amount, bid.unit),
    provisional: args.provisional,
    receivedAt: bid.submittedAt,
    bidCount: bids.filter((b) => b.requestId === bid.requestId && !b.voided).length,
    link: `${env.baseUrl}/admin/builder/${bid.requestId}`,
  });
  // Mark it as in progress first, so a second call at the same moment does nothing.
  record({ status: "failed", detail: "sending", at: now.toISOString() });
  const sent = await sendDemoMessage(env.telegram, text, env.fetchImpl);
  return record(sent.ok ? { status: "sent", at: now.toISOString() } : { status: "failed", detail: sent.error, at: now.toISOString() });
}
