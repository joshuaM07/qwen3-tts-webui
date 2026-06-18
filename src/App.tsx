import { useEffect, useMemo, useRef, useState } from "react";
import { api, API_BASE_URL, fileToBase64, Speaker } from "./lib/api";

// ---------------------------------------------------------------------------
// Local speaker metadata — keep in sync with modal-backend/app.py SPEAKERS list.
// Hardcoded so the UI is instant on first paint; the /speakers endpoint is the
// source of truth if you want to override at runtime.
// ---------------------------------------------------------------------------
const SPEAKERS: Speaker[] = [
  { id: "Vivian",   name: "Vivian",   lang: "Chinese",  desc: "Bright young female voice" },
  { id: "Serena",   name: "Serena",   lang: "Chinese",  desc: "Warm, gentle young female voice" },
  { id: "Uncle_Fu", name: "Uncle Fu", lang: "Chinese",  desc: "Seasoned male voice, mellow timbre" },
  { id: "Dylan",    name: "Dylan",    lang: "Chinese",  desc: "Youthful Beijing male voice" },
  { id: "Eric",     name: "Eric",     lang: "Chinese",  desc: "Lively Chengdu male voice" },
  { id: "Ryan",     name: "Ryan",     lang: "English",  desc: "Dynamic male voice with rhythm" },
  { id: "Aiden",    name: "Aiden",    lang: "English",  desc: "Sunny American male voice" },
  { id: "Ono_Anna", name: "Ono Anna", lang: "Japanese", desc: "Playful Japanese female voice" },
  { id: "Sohee",    name: "Sohee",    lang: "Korean",   desc: "Warm Korean female voice" },
];

const LANGUAGES = [
  "Chinese", "English", "Japanese", "Korean", "German",
  "French", "Russian", "Portuguese", "Spanish", "Italian",
];

const SAMPLE_TEXTS: { lang: string; text: string }[] = [
  { lang: "English",  text: "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs." },
  { lang: "English",  text: "Hello! Welcome to Qwen3-TTS. I can speak in many languages and styles. Try changing the speaker or instruction below." },
  { lang: "Chinese",  text: "你好！欢迎使用通义千问语音合成。我可以用多种语言和风格朗读文本。试试切换不同的说话人或风格指令。" },
  { lang: "Japanese", text: "こんにちは！Qwen3-TTSへようこそ。多くの言語とスタイルでテキストを読み上げることができます。" },
  { lang: "Korean",   text: "안녕하세요! Qwen3-TTS에 오신 것을 환영합니다. 다양한 언어와 스타일로 텍스트를 읽을 수 있습니다." },
];

const STYLE_PRESETS = [
  { label: "(no instruction)", value: "" },
  { label: "Speak in a very happy tone",        value: "Speak in a very happy tone" },
  { label: "Speak in a calm, soothing tone",    value: "Speak in a calm, soothing tone" },
  { label: "Speak with excitement and energy",  value: "Speak with excitement and energy" },
  { label: "Speak slowly and clearly",          value: "Speak slowly and clearly" },
  { label: "Whisper softly",                    value: "Whisper softly" },
  { label: "Use a serious, news-anchor style",  value: "Use a serious, news-anchor style" },
  { label: "Speak with a sad, gentle tone",     value: "Speak with a sad, gentle tone" },
];

interface HistoryItem {
  id: string;
  text: string;
  language: string;
  speaker: string;
  instruct: string;
  url: string;
  durationMs: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function Header({ onConfigureApi }: { onConfigureApi: () => void }) {
  return (
    <header className="border-b border-ink-800/60 backdrop-blur-sm bg-ink-950/60 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-lg shadow-accent-500/30">
            <svg viewBox="0 0 32 32" className="w-5 h-5" fill="currentColor">
              <path d="M9 11h2v10H9zm4-2h2v14h-2zm4 4h2v6h-2zm4-2h2v10h-2zm4 3h2v4h-2z" fill="white" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Qwen3-TTS</h1>
            <p className="text-xs text-ink-400 -mt-0.5">Neural Voice Studio</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-xs"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zm0 7L2 14l10 5 10-5-10-5z" />
            </svg>
            Model
          </a>
          <button onClick={onConfigureApi} className="btn-ghost text-xs" title="Configure Modal backend URL">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Settings
          </button>
        </div>
      </div>
    </header>
  );
}

function ApiConfigModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (url: string) => void;
}) {
  const [url, setUrl] = useState(localStorage.getItem("qwen3-tts-api-url") || "");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="card max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-white mb-2">Configure Modal Backend</h2>
        <p className="text-sm text-ink-400 mb-4">
          Paste the URL of your deployed Modal FastAPI app. It looks like
          <code className="mx-1 px-1.5 py-0.5 rounded bg-ink-800 text-accent-400 text-xs">
            https://your-username--qwen3-tts-fastapi-app.modal.run
          </code>
        </p>
        <label className="label">Modal API URL</label>
        <input
          type="url"
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => {
              const trimmed = url.trim();
              localStorage.setItem("qwen3-tts-api-url", trimmed);
              onSave(trimmed);
            }}
            className="btn-primary"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SpeakerAvatar({ speaker }: { speaker: Speaker }) {
  // Generate a stable color from speaker id
  const hash = speaker.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = (hash * 47) % 360;
  const initials = speaker.name
    .split(/[\s_-]+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md flex-shrink-0"
      style={{ background: `linear-gradient(135deg, hsl(${hue}, 65%, 55%), hsl(${(hue + 40) % 360}, 70%, 45%))` }}
    >
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main studio
// ---------------------------------------------------------------------------
export default function App() {
  // Start with the baked-in default URL. localStorage can override at runtime.
  const [apiUrl, setApiUrl] = useState<string>(
    () => localStorage.getItem("qwen3-tts-api-url") || API_BASE_URL
  );
  const effectiveApiUrl = apiUrl || API_BASE_URL;
  const [showSettings, setShowSettings] = useState(false);
  const [text, setText] = useState(SAMPLE_TEXTS[1].text);
  const [language, setLanguage] = useState("English");
  const [speaker, setSpeaker] = useState("Ryan");
  const [instruct, setInstruct] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<{ url: string; durationMs: number; size: number } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem("qwen3-tts-history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const abortRef = useRef<AbortController | null>(null);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("qwen3-tts-history", JSON.stringify(history.slice(0, 20)));
    } catch {
      /* quota — ignore */
    }
  }, [history]);

  // Filter speakers by language for UX
  const speakersForLang = useMemo(
    () => SPEAKERS.filter((s) => s.lang === language),
    [language],
  );

  // Auto-pick first available speaker when language changes
  useEffect(() => {
    if (!speakersForLang.find((s) => s.id === speaker)) {
      setSpeaker(speakersForLang[0]?.id || SPEAKERS[0].id);
    }
  }, [language, speakersForLang, speaker]);

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError("Please enter some text to synthesize.");
      return;
    }
    if (!effectiveApiUrl) {
      setShowSettings(true);
      setError("Configure your Modal backend URL first (Settings → Modal API URL).");
      return;
    }

    setError(null);
    setLoading(true);
    setCurrentAudio(null);

    // Custom timeout via AbortController
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 95_000);

    try {
      const result = await api.synthesize({
        text: text.trim(),
        language,
        speaker,
        instruct,
      });
      setCurrentAudio({ url: result.url, durationMs: result.durationMs, size: result.blob.size });

      const item: HistoryItem = {
        id: crypto.randomUUID(),
        text: text.trim(),
        language,
        speaker,
        instruct,
        url: result.url,
        durationMs: result.durationMs,
        createdAt: Date.now(),
      };
      setHistory((h) => [item, ...h].slice(0, 20));
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setError("Generation timed out (95s). The GPU may be cold-starting — try again.");
      } else {
        setError((e as Error).message);
      }
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setLoading(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const downloadAudio = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header onConfigureApi={() => setShowSettings(true)} />

      {!effectiveApiUrl && (
        <div className="bg-accent-700/20 border-b border-accent-700/40 text-center py-2.5 px-4 text-sm text-accent-200">
          ⚠ Backend not configured.{" "}
          <button
            onClick={() => setShowSettings(true)}
            className="underline font-semibold hover:text-white"
          >
            Open Settings
          </button>{" "}
          to paste your Modal API URL.
        </div>
      )}

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 grid lg:grid-cols-[1fr_1.1fr] gap-6">
        {/* LEFT: Controls */}
        <section className="card animate-slide-up">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>
            Voice Configuration
          </h2>

          <div className="space-y-4">
            {/* Language */}
            <div>
              <label className="label" htmlFor="language">Language</label>
              <select
                id="language"
                className="input cursor-pointer"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={loading}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Speaker */}
            <div>
              <label className="label" htmlFor="speaker">
                Speaker
                <span className="ml-2 normal-case text-ink-500 font-normal tracking-normal">
                  ({speakersForLang.length} available for {language})
                </span>
              </label>
              {speakersForLang.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {speakersForLang.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSpeaker(s.id)}
                      disabled={loading}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all
                        ${speaker === s.id
                          ? "border-accent-500 bg-accent-500/10"
                          : "border-ink-700 hover:border-ink-600 bg-ink-900/40"
                        }`}
                    >
                      <SpeakerAvatar speaker={s} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white truncate">{s.name}</div>
                        <div className="text-xs text-ink-400 truncate">{s.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-ink-500 italic p-3 border border-dashed border-ink-700 rounded-lg">
                  No preset speakers for {language} — pick a different language.
                </div>
              )}
            </div>

            {/* Style instruction */}
            <div>
              <label className="label" htmlFor="instruct">Style Instruction <span className="normal-case text-ink-500 font-normal">(optional)</span></label>
              <input
                id="instruct"
                type="text"
                className="input"
                value={instruct}
                onChange={(e) => setInstruct(e.target.value)}
                placeholder="e.g. Speak in a happy tone"
                disabled={loading}
                list="style-presets"
              />
              <datalist id="style-presets">
                {STYLE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </datalist>
            </div>
          </div>
        </section>

        {/* RIGHT: Text + Output */}
        <section className="card animate-slide-up" style={{ animationDelay: "60ms" }}>
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>
            Script
          </h2>

          <textarea
            className="input min-h-[160px] resize-y font-medium leading-relaxed"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste the text you want to synthesize..."
            disabled={loading}
            maxLength={2000}
          />

          <div className="flex items-center justify-between mt-2 text-xs text-ink-500">
            <span>{wordCount} words · {charCount}/2000 chars</span>
            <div className="flex flex-wrap gap-1">
              {SAMPLE_TEXTS.filter((s) => s.lang === language || language === "English").slice(0, 3).map((s, i) => (
                <button
                  key={i}
                  onClick={() => setText(s.text)}
                  className="chip hover:bg-ink-700 transition"
                  disabled={loading}
                >
                  Sample {i + 1}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
            className="btn-primary w-full mt-5 py-3 text-base"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Synthesizing on GPU… (may take 15-30s on cold start)
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Generate Speech
              </>
            )}
          </button>

          {loading && (
            <button onClick={handleCancel} className="btn-ghost w-full mt-2 text-xs">
              Cancel
            </button>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm animate-fade-in">
              {error}
            </div>
          )}

          {/* Output */}
          {currentAudio && !loading && (
            <div className="mt-5 p-4 rounded-xl bg-ink-900/60 border border-ink-700 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs text-ink-400">
                  <span className="chip">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {(currentAudio.size / 1024).toFixed(1)} KB
                  </span>
                  <span>·</span>
                  <span>Generated in {(currentAudio.durationMs / 1000).toFixed(1)}s</span>
                </div>
                <button
                  onClick={() => downloadAudio(currentAudio.url, `qwen3-tts-${speaker}-${Date.now()}.wav`)}
                  className="btn-ghost text-xs py-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Download
                </button>
              </div>
              <audio src={currentAudio.url} controls autoPlay className="w-full" />
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">
                Recent
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-lg bg-ink-900/40 border border-ink-800 hover:border-ink-700 transition"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="chip text-[10px]">{h.language}</span>
                      <span className="chip text-[10px]">{h.speaker}</span>
                      <span className="text-[10px] text-ink-500 ml-auto">
                        {new Date(h.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-ink-300 line-clamp-2 mb-2">{h.text}</p>
                    <audio src={h.url} controls className="w-full h-8" />
                  </div>
                ))}
              </div>
              <button
                onClick={() => setHistory([])}
                className="text-[10px] text-ink-500 hover:text-ink-300 mt-2"
              >
                Clear history
              </button>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-ink-800/60 py-4 text-center text-xs text-ink-500">
        Qwen3-TTS · Frontend on Cloudflare Pages · GPU on Modal · Apache 2.0
      </footer>

      <ApiConfigModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={(url) => {
          setApiUrl(url);
          setShowSettings(false);
        }}
      />
    </div>
  );
}
