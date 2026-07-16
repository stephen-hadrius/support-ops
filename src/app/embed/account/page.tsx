import { listTickets, getAnalysis } from "@/lib/db";
import { AccountEmbedClient } from "./AccountEmbedClient";

export default async function EmbedAccountPage({ searchParams }: { searchParams: Promise<{ account_id?: string }> }) {
  const { account_id } = await searchParams;
  
  console.log("EmbedAccountPage requested with account_id:", account_id);

  if (!account_id) return <div className="p-4 text-sm text-zinc-500">No account_id provided in iframe URL. Please configure the Pylon Iframe App to pass ?account_id={"{{account.id}}"}</div>;

  const allTickets = listTickets();
  const accountTickets = allTickets.filter(t => {
    try {
      const parsed = JSON.parse(t.raw_json);
      return parsed?.account?.id === account_id || parsed?.account?.external_id === account_id;
    } catch {
      return false;
    }
  });

  console.log(`Found ${accountTickets.length} tickets for account ${account_id}`);

  const ticketsWithAnalysis = accountTickets.map(t => {
    return {
      ticket: t,
      analysis: getAnalysis(t.id) || null
    };
  });

  return <AccountEmbedClient tickets={ticketsWithAnalysis} account_id={account_id} />;
}
