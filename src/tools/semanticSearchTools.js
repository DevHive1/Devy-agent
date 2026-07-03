'use strict';
const fs = require('fs');
const path = require('path');
const { VectorStore } = require('../utils/vectorStore');

function buildSemanticSearchTools(projectContext, llmClient, vectorStore) {
  return {
    semantic_search: {
      description: 'Search project code by meaning using embeddings. Finds conceptually related code even when exact keywords don\'t match. Run index_project first.',
      params: { query: 'string (required)', max_results: 'number (optional, default 5)' },
      handler: async ({ query, max_results = 5 }) => {
        if (!query) return { error: 'Missing required parameter: "query"' };
        try {
          const embedding = await llmClient.embed(query);
          if (!embedding) return { error: 'Embedding not supported by current model. Use search_code for text search instead.' };
          const results = vectorStore.search(embedding, Number(max_results) || 5);
          return { results: results.map(r => ({ file: r.metadata.file, startLine: r.metadata.startLine, endLine: r.metadata.endLine, score: Math.round(r.score * 1000) / 1000, preview: r.metadata.text })) };
        } catch (e) {
          return { error: `Semantic search failed: ${e.message}. Try search_code for text-based search.` };
        }
      }
    },
    index_project: {
      description: 'Index project files for semantic search. Run once after opening a project or after major changes.',
      params: { path: 'string (optional)', extensions: 'string (optional, comma-separated, default "js,ts,py,go,rs,java,rb,php,md")' },
      handler: async ({ path: p, extensions = 'js,ts,py,go,rs,java,rb,php,md' }) => {
        try {
          const root = path.resolve(projectContext.dir, p || '.');
          const exts = extensions.split(',').map(e => '.' + e.trim());
          const ignore = new Set(['node_modules', '.git', '.devy-agent', 'dist', 'build', '__pycache__']);
          let fileCount = 0, chunkCount = 0;
          function walk(dir) {
            const files = [];
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                if (ignore.has(e.name)) continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) files.push(...walk(full));
                else if (exts.includes(path.extname(e.name))) files.push(full);
              }
            } catch (_) {}
            return files;
          }
          const files = walk(root);
          vectorStore.clear();
          for (const file of files) {
            try {
              const content = fs.readFileSync(file, 'utf8');
              const lines = content.split('\n');
              const chunkSize = 30, overlap = 5;
              for (let i = 0; i < lines.length; i += chunkSize - overlap) {
                const chunk = lines.slice(i, i + chunkSize).join('\n');
                if (chunk.trim().length < 20) continue;
                const embedding = await llmClient.embed(chunk);
                if (!embedding) return { error: 'Embedding not supported by current model.' };
                const id = `${path.relative(root, file)}:${i}`;
                vectorStore.add(id, embedding, { file: path.relative(root, file), startLine: i + 1, endLine: Math.min(i + chunkSize, lines.length), text: chunk.slice(0, 200) });
                chunkCount++;
              }
              fileCount++;
            } catch (_) {}
          }
          vectorStore.save();
          return { indexed_files: fileCount, chunks: chunkCount };
        } catch (e) {
          return { error: `Indexing failed: ${e.message}` };
        }
      }
    }
  };
}

module.exports = { buildSemanticSearchTools };
