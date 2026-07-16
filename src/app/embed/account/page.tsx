import { listTickets, getAnalysis } from "@/lib/db";
import { AccountEmbedClient } from "./AccountEmbedClient";

export default async function EmbedAccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  
  // Try several fallback options for how Pylon might pass the ID in the URL.
  const account_id = (params.account_id || params.id || params.account || params.accountId) as string | undefined;
  
  if (!account_id || account_id.includes('{{')) {
    return (
      <div className="p-4 text-sm text-zinc-500 break-words">
        <strong>Error: Invalid or missing Account ID.</strong><br/><br/>
        It looks like Pylon passed these exact URL parameters to the iframe:<br/>
        <code className="text-xs bg-zinc-100 p-2 block mt-2 rounded whitespace-pre-wrap">
          {JSON.stringify(params, null, 2)}
        </code>
        <br/>
        Try using <strong>{"{{id}}"}</strong> instead of <strong>{"{{account.id}}"}</strong> in Pylon's settings for the Account View URL.
      </div>
    );
  }

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
