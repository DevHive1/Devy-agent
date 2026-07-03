'use strict';

class OllamaClient {
  constructor({ host, model }) {
    this.host = host;
    this.model = model;
  }

  /**
   * Calls chat, with optional streaming and an optional AbortSignal (used to let the user
   * stop a running task mid-generation via Ctrl+C).
   */
  async chat(messages, { stream = false, onToken = null, temperature = 0.3, signal = null } = {}) {
    let res;
    try {
      res = await fetch(`${this.host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream,
          options: { temperature }
        }),
        signal
      });
    } catch (networkErr) {
      if (networkErr.name === 'AbortError') {
        const err = new Error('Stopped by user.');
        err.aborted = true;
        throw err;
      }
      throw new Error(`Cannot reach Ollama at ${this.host}. Make sure "ollama serve" is running and OLLAMA_HOST is correct. (${networkErr.message})`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Ollama error (${res.status}): ${errText}`);
    }

    if (!stream) {
      const data = await res.json();
      return data.message?.content || '';
    }

    // Read the stream line by line (NDJSON)
    let full = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const piece = json.message?.content || '';
          if (piece) {
            full += piece;
            if (onToken) onToken(piece);
          }
        } catch (_) { /* incomplete line, skip */ }
      }
    }
    return full;
  }

  async embed(text) {
    try {
      const res = await fetch(`${this.host}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          input: text
        })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Ollama embed error (${res.status}): ${errText}`);
      }
      const data = await res.json();
      return data.embeddings?.[0] || data.embedding || null;
    } catch (e) {
      throw new Error(`Embedding failed: ${e.message}`);
    }
  }

  async listModels() {
    try {
      const res = await fetch(`${this.host}/api/tags`);
      if (!res.ok) throw new Error(`Ollama request to ${this.host} failed (status ${res.status})`);
      const data = await res.json();
      return (data.models || []).map((m) => m.name);
    } catch (e) {
      throw new Error(`Cannot reach Ollama at ${this.host}. (${e.message})`);
    }
  }

  get supportsVision() {
    return false;
  }

  get supportsStreaming() {
    return true;
  }

  get modelName() {
    return this.model;
  }
}

module.exports = OllamaClient;
