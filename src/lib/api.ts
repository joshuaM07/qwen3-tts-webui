// API client for the Qwen3-TTS Modal backend.
// All requests go to the Modal-deployed FastAPI app.

// Public Modal endpoint — baked in as the default. Can be overridden at
// build time by setting VITE_API_URL, or at runtime via the ⚙ Settings
// panel (stored in localStorage).
export const DEFAULT_API_URL = "https://joshm071197--qwen3-tts-fastapi-app.modal.run";

export const API_BASE_URL: string = (import.meta.env.VITE_API_URL as string)?.trim() || DEFAULT_API_URL;

export interface Speaker {
  id: string;
  name: string;
  lang: string;
  desc: string;
}

export interface GenerationRequest {
  text: string;
  language: string;
  speaker: string;
  instruct?: string;
  top_k?: number;
  top_p?: number;
  temperature?: number;
}

export interface GenerationError {
  detail: string;
}

class ApiClient {
  private baseUrl: string;
  private audioCache = new Map<string, string>(); // dedupe identical recent requests

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  get url(): string {
    return this.baseUrl;
  }

  get isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  async health(): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`health check failed: ${res.status}`);
    return res.json();
  }

  async getSpeakers(): Promise<{ speakers: Speaker[] }> {
    const res = await fetch(`${this.baseUrl}/speakers`);
    if (!res.ok) throw new Error(`failed to fetch speakers: ${res.status}`);
    return res.json();
  }

  async getLanguages(): Promise<{ languages: string[] }> {
    const res = await fetch(`${this.baseUrl}/languages`);
    if (!res.ok) throw new Error(`failed to fetch languages: ${res.status}`);
    return res.json();
  }

  /**
   * Synthesize text to speech. Returns an object URL that can be assigned to <audio src>.
   * Times out after 90s — Modal cold start + inference can be slow on first hit.
   */
  async synthesize(req: GenerationRequest): Promise<{ url: string; blob: Blob; durationMs: number }> {
    if (!this.isConfigured) {
      throw new Error(
        "API URL not configured. Deploy the Modal backend and set VITE_API_URL in wrangler.toml.",
      );
    }

    const cacheKey = JSON.stringify(req);
    const cached = this.audioCache.get(cacheKey);
    if (cached) {
      const blob = await fetch(cached).then((r) => r.blob());
      return { url: cached, blob, durationMs: 0 };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    const start = performance.now();
    try {
      const res = await fetch(`${this.baseUrl}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: req.text,
          language: req.language,
          speaker: req.speaker,
          instruct: req.instruct || "",
          top_k: req.top_k ?? 50,
          top_p: req.top_p ?? 1.0,
          temperature: req.temperature ?? 0.9,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = res.statusText;
        try {
          const err = (await res.json()) as GenerationError;
          if (err?.detail) detail = err.detail;
        } catch {
          /* ignore */
        }
        throw new Error(`Synthesis failed (${res.status}): ${detail}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      this.audioCache.set(cacheKey, url);
      // Evict after 5 min to keep memory sane
      setTimeout(() => {
        URL.revokeObjectURL(url);
        this.audioCache.delete(cacheKey);
      }, 5 * 60_000);

      return { url, blob, durationMs: performance.now() - start };
    } finally {
      clearTimeout(timeout);
    }
  }

  async clone(
    text: string,
    language: string,
    refAudioBase64: string,
    refText: string,
  ): Promise<{ url: string; blob: Blob; durationMs: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    const start = performance.now();
    try {
      const res = await fetch(`${this.baseUrl}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          language,
          ref_audio_b64: refAudioBase64,
          ref_text: refText,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const err = (await res.json()) as GenerationError;
          if (err?.detail) detail = err.detail;
        } catch {
          /* ignore */
        }
        throw new Error(`Clone failed (${res.status}): ${detail}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      return { url, blob, durationMs: performance.now() - start };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const api = new ApiClient(API_BASE_URL);

// Helper: read a File as base64 (no data: prefix)
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:audio/wav;base64," prefix
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
