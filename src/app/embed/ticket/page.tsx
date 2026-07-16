import { getTicket, getAnalysis } from "@/lib/db";
import { TicketEmbedClient } from "./TicketEmbedClient";

export default async function EmbedTicketPage({ searchParams }: { searchParams: Promise<{ issue_id?: string, id?: string }> }) {
  const { issue_id, id } = await searchParams;
  const ticketId = issue_id || id;
  
  if (!ticketId) return <div className="p-4 text-sm text-zinc-500">No ticket ID provided in iframe URL. Please configure the Pylon Iframe App to pass ?issue_id={"{{issue.id}}"}</div>;

  const ticket = getTicket(ticketId);
  if (!ticket) {
    return <div className="p-4 text-sm text-zinc-500">Ticket not found in local database. Please ensure it has synced via the dashboard.</div>;
  }

  const analysis = getAnalysis(ticketId);
  
  return <TicketEmbedClient ticket={ticket} initialAnalysis={analysis} />;
}
