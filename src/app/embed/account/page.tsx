import { listTickets, getAnalysis } from "@/lib/db";
import { AccountEmbedClient } from "./AccountEmbedClient";

export default async function EmbedAccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const account_id = (params.account_id || params.id || params.account) as string | undefined;
  
  if (!account_id || account_id === '{{account.id}}' || account_id === '{{account_id}}') {
    return (
      <div className="p-4 text-sm text-zinc-500 break-words">
        <strong>Error: Invalid or missing Account ID.</strong><br/><br/>
        It looks like Pylon passed these exact URL parameters to the iframe:<br/>
        <code className="text-xs bg-zinc-100 p-2 block mt-2 rounded">
          {JSON.stringify(params, null, 2)}
        </code>
        <br/>
        Please check Pylon's iframe documentation for the correct variable syntax (e.g. {'{account.id}'}, {'{{id}}'}, etc.), or see if Pylon automatically appends the account ID if you just use a base URL without query strings.
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
