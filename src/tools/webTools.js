'use strict';

/**
 * Normalizes HTML entities to plain text.
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·');
}

function buildWebTools() {
  return {
    web_search: {
      description: 'Search the web using DuckDuckGo to find up-to-date information, documentation, or code examples. Returns title, URL, and snippet for each match.',
      params: {
        query: 'string (required, the search query)',
        max_results: 'number (optional, default 5, max 10)'
      },
      handler: async ({ query, max_results = 5 }) => {
        if (!query) return { error: 'Missing required parameter: "query"' };
        const limit = Math.min(Number(max_results) || 5, 10);

        try {
          const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });

          if (!response.ok) {
            return { error: `Search failed with HTTP status ${response.status}` };
          }

          const html = await response.text();
          const results = [];

          // Split the HTML by result containers
          const blocks = html.split('<div class="result');
          // Skip first block as it contains search header
          for (let i = 1; i < blocks.length; i++) {
            if (results.length >= limit) break;

            const block = blocks[i];
            // Extract URL and Title
            const titleMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
            // Extract Snippet
            const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);

            if (titleMatch) {
              let rawUrl = titleMatch[1];
              // Decouple DuckDuckGo redirect link if present (e.g. //duckduckgo.com/l/?uddg=URL)
              if (rawUrl.includes('uddg=')) {
                const uddgIndex = rawUrl.indexOf('uddg=');
                const decoded = decodeURIComponent(rawUrl.slice(uddgIndex + 5));
                rawUrl = decoded.split('&')[0];
              }

              const title = decodeHtmlEntities(titleMatch[2].replace(/<[^>]+>/g, '').trim());
              const snippet = snippetMatch 
                ? decodeHtmlEntities(snippetMatch[1].replace(/<[^>]+>/g, '').trim()) 
                : '';

              results.push({ title, url: rawUrl, snippet });
            }
          }

          return { query, results };
        } catch (e) {
          return { error: `Web search failed: ${e.message}` };
        }
      }
    },

    read_url: {
      description: 'Fetch the text content of a specific web URL (converts HTML to readable markdown/plain text). Use this to read documentation or reference pages.',
      params: {
        url: 'string (required, absolute URL starting with http/https)',
        max_chars: 'number (optional, default 5000, max 20000)'
      },
      handler: async ({ url, max_chars = 5000 }) => {
        if (!url) return { error: 'Missing required parameter: "url"' };
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return { error: 'Invalid URL. Must start with http:// or https://' };
        }

        const limit = Math.min(Number(max_chars) || 5000, 20000);

        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });

          if (!response.ok) {
            return { error: `Failed to fetch page with HTTP status ${response.status}` };
          }

          const html = await response.text();

          // Basic HTML to text conversion
          let text = html
            // Remove scripts and styles
            .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
            .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
            // Convert headings
            .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n# $1\n')
            // Convert paragraphs/divs/list items
            .replace(/<p[^>]*>/gi, '\n')
            .replace(/<div[^>]*>/gi, '\n')
            .replace(/<li[^>]*>/gi, '\n* ')
            // Remove remaining HTML tags
            .replace(/<[^>]+>/g, ' ')
            // Clean up whitespace
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s*\n+/g, '\n\n')
            .trim();

          text = decodeHtmlEntities(text);

          const truncated = text.length > limit;
          const content = truncated ? text.slice(0, limit) + '\n\n[Content Truncated]' : text;

          return {
            url,
            length_chars: text.length,
            content
          };
        } catch (e) {
          return { error: `Failed to read URL: ${e.message}` };
        }
      }
    }
  };
}

module.exports = { buildWebTools };
