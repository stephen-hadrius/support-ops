// Client for fetching articles from Pylon Knowledge Base using the REST API

export async function fetchPylonKnowledgeBase(apiKey: string | undefined): Promise<string> {
  if (!apiKey) return "";

  try {
    // 1. Get all knowledge bases
    const kbsRes = await fetch("https://api.usepylon.com/knowledge-bases", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!kbsRes.ok) return "";
    const kbsData = await kbsRes.json();
    const kbs = kbsData.data || [];

    let combinedText = "";

    // 2. For each KB, fetch articles
    for (const kb of kbs) {
      if (!kb.id) continue;
      
      const articlesRes = await fetch(`https://api.usepylon.com/knowledge-bases/${kb.id}/articles?limit=100`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!articlesRes.ok) continue;
      
      const articlesData = await articlesRes.json();
      const articles = articlesData.data || [];

      for (const article of articles) {
        if (!article.is_published) continue;
        
        combinedText += `--- Article: ${article.title} ---\n`;
        combinedText += `URL: ${article.url || `https://app.usepylon.com/knowledge-bases/${kb.id}/articles/${article.id}`}\n`;
        // current_published_content_html has HTML. Strip simple tags for prompt injection safety/token usage.
        const plainText = (article.current_published_content_html || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        combinedText += `${plainText}\n\n`;
      }
    }
    
    return combinedText;
  } catch (err) {
    console.error("Error fetching Pylon KB", err);
    return "";
  }
}
