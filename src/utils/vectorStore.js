'use strict';
const fs = require('fs');

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

class VectorStore {
  constructor({ persistPath } = {}) {
    this.persistPath = persistPath || null;
    this.vectors = []; // {id, embedding, metadata}
    this.fileHashes = {}; // file relative path -> { mtime, size }
  }

  add(id, embedding, metadata = {}) {
    this.remove(id);
    this.vectors.push({ id, embedding, metadata });
  }

  search(queryEmbedding, topK = 5) {
    const scored = this.vectors.map(v => ({
      id: v.id,
      score: cosineSimilarity(queryEmbedding, v.embedding),
      metadata: v.metadata
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  remove(id) {
    this.vectors = this.vectors.filter(v => v.id !== id);
  }

  clear() {
    this.vectors = [];
    this.fileHashes = {};
  }

  size() { return this.vectors.length; }

  save() {
    if (!this.persistPath) return;
    try {
      const data = {
        vectors: this.vectors.map(v => ({
          id: v.id,
          embedding: Array.from(v.embedding),
          metadata: v.metadata
        })),
        fileHashes: this.fileHashes
      };
      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('VectorStore save failed:', e.message);
    }
  }

  load() {
    if (!this.persistPath) return;
    try {
      if (fs.existsSync(this.persistPath)) {
        const raw = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
        if (raw && raw.vectors) {
          this.vectors = raw.vectors;
          this.fileHashes = raw.fileHashes || {};
        } else {
          // Backward compatibility for old simple array format
          this.vectors = Array.isArray(raw) ? raw : [];
          this.fileHashes = {};
        }
      }
    } catch (e) {
      console.error('VectorStore load failed:', e.message);
    }
  }
}

module.exports = { VectorStore, cosineSimilarity };
