import { useEffect, useMemo, useRef, useState } from "react";
import { api, API_BASE_URL, fileToBase64, Speaker } from "./lib/api";

// ---------------------------------------------------------------------------
// Speaker metadata — keep in sync with modal-backend/app.py SPEAKERS list.
// ---------------------------------------------------------------------------
const SPEAKERS: Speaker[] = [
  { id: "Serena",   name: "Serena",   lang: "Chinese",  desc: "Warm, gentle — best for devotionals" },
  { id: "Uncle_Fu", name: "Uncle Fu", lang: "Chinese",  desc: "Seasoned, mellow, deep" },
  { id: "Vivian",   name: "Vivian",   lang: "Chinese",  desc: "Bright young female" },
  { id: "Aiden",    name: "Aiden",    lang: "English",  desc: "Sunny, warm American male" },
  { id: "Ryan",     name: "Ryan",     lang: "English",  desc: "Dynamic with rhythm" },
  { id: "Sohee",    name: "Sohee",    lang: "Korean",   desc: "Warm Korean female" },
  { id: "Ono_Anna", name: "Ono Anna", lang: "Japanese", desc: "Playful Japanese female" },
];

// Sorted with French first since it's the default
const LANGUAGES = [
  "French", "English", "Chinese", "Japanese", "Korean", "German",
  "Spanish", "Italian", "Portuguese", "Russian",
];

// Devotional preset texts — French first (the default)
const DEVOTION_PRESETS: { label: string; lang: string; text: string; instruct: string }[] = [
  {
    label: "Psaume 23",
    lang: "French",
    instruct: "Parlez d'une voix calme, douce et apaisante, avec un ton dévotionnel et respectueux",
    text: "L'Éternel est mon berger : je ne manquerai de rien. Il me fait reposer dans de verts pâturages, il me dirige près des eaux paisibles. Il restaure mon âme, il me conduit dans les sentiers de la justice, à cause de son nom. Quand je marche dans la vallée de l'ombre de la mort, je ne crains aucun mal, car tu es avec moi.",
  },
  {
    label: "Prière du matin",
    lang: "French",
    instruct: "Parlez d'une voix douce, intime et contemplative, comme une prière personnelle",
    text: "Seigneur, en ce nouveau jour, je remets ma vie entre tes mains. Guide mes pas, éclaire mes décisions, et donne-moi la force d'aimer ceux que tu mets sur mon chemin. Que ta paix habite mon cœur, aujourd'hui et toujours. Amen.",
  },
  {
    label: "Méditation",
    lang: "French",
    instruct: "Parlez lentement, avec des pauses, dans un ton méditatif et apaisant",
    text: "Respire profondément. Sente l'air qui entre et qui sort. Tu es ici, présent à ce moment. Laisse les pensées venir et repartir, comme des nuages dans le ciel. Tu n'as besoin de rien faire. Juste être. Juste respirer. Juste être.",
  },
  {
    label: "Psaume 23 (EN)",
    lang: "English",
    instruct: "Speak in a calm, gentle, soothing devotional tone with reverence and warmth",
    text: "The Lord is my shepherd, I shall not want. He makes me lie down in green pastures, he leads me beside quiet waters, he restores my soul. He guides me in paths of righteousness for his name's sake. Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me.",
  },
  {
    label: "Empty — start writing",
    lang: "French",
    instruct: "Parlez d'une voix calme, douce et apaisante, avec un ton dévotionnel et respectueux",
    text: "",
  },
];

// Calm-tone style presets
const STYLE_PRESETS = [
  { label: "Calm devotional (default)", value: "Parlez d'une voix calme, douce et apaisante, avec un ton dévotionnel et respectueux" },
  { label: "Calm devotional (EN)",      value: "Speak in a calm, gentle, soothing devotional tone with reverence and warmth" },
  { label: "Meditative / slow",          value: "Parlez lentement, avec des pauses, dans un ton méditatif et apaisant" },
  { label: "Personal prayer (intimate)", value: "Parlez d'une voix douce, intime et contemplative, comme une prière personnelle" },
  { label: "Soft whisper",               value: "Chuchotez doucement, comme si vous parliez à quelqu'un à côté de vous" },
  { label: "Reverent reading",           value: "Lisez avec révérence, lentement et clairement, en marquant chaque phrase" },
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
  size: number;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function Header({ onConfigureApi, isOffline }: { onConfigureApi: () => void; isOffline: boolean }) {
  return (
    <header className="border-b border-ink-800/60 backdrop-blur-sm bg-ink-950/80 sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-lg shadow-accent-500/30">
            <svg viewBox="0 0 32 32" className="w-4 h-4 sm:w-5 sm:h-5" fill="white">
              <path d="M9 11h2v10H9zm4-2h2v14h-2zm4 4h2v6h-2zm4-2h2v10h-2zm4 3h2v4h-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-none">Devotionals</h1>
            <p className="text-[10px] sm:text-xs text-ink-400 mt-0.5">Qwen3-TTS · calm & soothing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOffline && (
            <span className="chip text-amber-300 bg-amber-500/10 border border-amber-500/30 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              Hors ligne
            </span>
          )}
          <button
            onClick={onConfigureApi}
            className="btn-ghost text-xs p-2 sm:px-3 sm:py-2"
            aria-label="Paramètres"
            title="Paramètres"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
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
        <h2 className="text-xl font-bold text-white mb-2">Backend API</h2>
        <p className="text-sm text-ink-400 mb-4">Optionnel — l'URL est déjà configurée par défaut.</p>
        <label className="label">URL de l'API Modal</label>
        <input
          type="url"
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button
            onClick={() => {
              const trimmed = url.trim();
              localStorage.setItem("qwen3-tts-api-url", trimmed);
              onSave(trimmed);
            }}
            className="btn-primary"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------
export default function App() {
  const [apiUrl, setApiUrl] = useState<string>(
    () => localStorage.getItem("qwen3-tts-api-url") || API_BASE_URL
  );
  const effectiveApiUrl = apiUrl || API_BASE_URL;
  const [showSettings, setShowSettings] = useState(false);

  // Default preset is the French Psalm 23 (first in the list with text)
  const defaultPreset = DEVOTION_PRESETS[0];
  const [text, setText] = useState(defaultPreset.text);
  const [language, setLanguage] = useState(defaultPreset.lang);
  const [speaker, setSpeaker] = useState("Serena");
  const [instruct, setInstruct] = useState(defaultPreset.instruct);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<{ url: string; durationMs: number; size: number; blob: Blob } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem("qwen3-tts-history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Online/offline indicator
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Persist history
  useEffect(() => {
    try {
      localStorage.setItem("qwen3-tts-history", JSON.stringify(history.slice(0, 10)));
    } catch {
      /* quota — ignore */
    }
  }, [history]);

  // Filter speakers by language
  const speakersForLang = useMemo(
    () => SPEAKERS.filter((s) => s.lang === language),
    [language]
  );

  // Auto-pick first available speaker when language changes (if current is not in list)
  useEffect(() => {
    if (speakersForLang.length > 0 && !speakersForLang.find((s) => s.id === speaker)) {
      setSpeaker(speakersForLang[0].id);
    }
  }, [language, speakersForLang, speaker]);

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const loadPreset = (preset: typeof DEVOTION_PRESETS[number]) => {
    setText(preset.text);
    setLanguage(preset.lang);
    setInstruct(preset.instruct);
  };

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError("Ajoutez du texte pour générer l'audio.");
      return;
    }
    if (!effectiveApiUrl) {
      setShowSettings(true);
      setError("Configurez l'URL du backend d'abord.");
      return;
    }

    setError(null);
    setLoading(true);
    setCurrentAudio(null);

    const controller = new AbortController();
    abortRef.current = controller;
    // Long text takes longer; scale timeout by length. ~3s/char on L4 with 1.7B.
    const timeoutMs = Math.min(300_000, 30_000 + Math.ceil(text.length / 50) * 1000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await api.synthesize({
        text: text.trim(),
        language,
        speaker,
        instruct,
      });
      setCurrentAudio({ url: result.url, durationMs: result.durationMs, size: result.blob.size, blob: result.blob });

      const item: HistoryItem = {
        id: crypto.randomUUID(),
        text: text.trim(),
        language,
        speaker,
        instruct,
        url: result.url,
        durationMs: result.durationMs,
        size: result.blob.size,
        createdAt: Date.now(),
      };
      setHistory((h) => [item, ...h].slice(0, 10));
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setError(`Génération expirée. Le texte est peut-être trop long pour le timeout. Réessayez ou réduisez le texte.`);
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

  const shareAudio = async (blob: Blob, filename: string, text: string) => {
    const file = new File([blob], filename, { type: "audio/wav" });
    const shareData: ShareData = {
      files: [file],
      title: "Devotional Audio",
      text: text.slice(0, 140),
    };
    if (navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        // User cancelled or share failed — fall back to download
        if ((e as Error).name !== "AbortError") {
          downloadAudio(URL.createObjectURL(blob), filename);
        }
      }
    } else {
      // Web Share API not available (e.g. desktop) — just download
      downloadAudio(URL.createObjectURL(blob), filename);
    }
  };

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="min-h-screen flex flex-col">
      <Header onConfigureApi={() => setShowSettings(true)} isOffline={isOffline} />

      {!effectiveApiUrl && (
        <div className="bg-accent-700/20 border-b border-accent-700/40 text-center py-2.5 px-4 text-sm text-accent-200">
          ⚠ Backend non configuré.{" "}
          <button
            onClick={() => setShowSettings(true)}
            className="underline font-semibold hover:text-white"
          >
            Ouvrir les paramètres
          </button>
        </div>
      )}

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 pb-32 sm:pb-12 space-y-4 sm:space-y-6">

        {/* PRESETS — quick devotional starters */}
        <section className="card animate-slide-up !p-4 sm:!p-5">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>
            Préréglages
          </h2>
          <div className="flex flex-wrap gap-2">
            {DEVOTION_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => loadPreset(p)}
                disabled={loading}
                className="chip hover:bg-accent-500/20 hover:text-accent-200 transition text-sm py-1.5 px-3 min-h-[36px]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* TEXT INPUT — primary, takes most of the screen on mobile */}
        <section className="card animate-slide-up !p-4 sm:!p-6" style={{ animationDelay: "40ms" }}>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>
            Texte
          </h2>
          <textarea
            className="input min-h-[180px] sm:min-h-[220px] resize-y font-serif text-base sm:text-lg leading-relaxed"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Écrivez ou collez votre texte ici..."
            disabled={loading}
            maxLength={2500}
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          />
          <div className="flex items-center justify-between mt-2 text-xs text-ink-500">
            <span>{wordCount} mots · {charCount}/2500</span>
            {text && (
              <button
                onClick={() => setText("")}
                disabled={loading}
                className="text-ink-500 hover:text-ink-300 text-xs"
              >
                Effacer
              </button>
            )}
          </div>
        </section>

        {/* SETTINGS — collapsed on mobile (single row), full on desktop */}
        <section className="card animate-slide-up !p-4 sm:!p-5" style={{ animationDelay: "80ms" }}>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>
            Voix & ton
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="label" htmlFor="lang">Langue</label>
              <select
                id="lang"
                className="input cursor-pointer text-base py-3 min-h-[48px]"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={loading}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="spk">Voix</label>
              <select
                id="spk"
                className="input cursor-pointer text-base py-3 min-h-[48px]"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
                disabled={loading}
              >
                {speakersForLang.length > 0 ? (
                  speakersForLang.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {s.desc}</option>
                  ))
                ) : (
                  SPEAKERS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.lang}) — {s.desc}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="label" htmlFor="instr">Ton</label>
            <input
              id="instr"
              type="text"
              className="input text-base py-3 min-h-[48px]"
              value={instruct}
              onChange={(e) => setInstruct(e.target.value)}
              placeholder="ex. Voix calme et apaisante"
              disabled={loading}
              list="style-presets"
            />
            <datalist id="style-presets">
              {STYLE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </datalist>
          </div>
        </section>

        {/* ERROR */}
        {error && (
          <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm animate-fade-in">
            {error}
          </div>
        )}

        {/* CURRENT AUDIO — big, prominent save/share */}
        {currentAudio && !loading && (
          <section className="card animate-slide-up !p-4 sm:!p-6 border-accent-500/40 bg-accent-500/5">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Lecture
            </h2>

            <audio
              ref={audioRef}
              src={currentAudio.url}
              controls
              autoPlay
              className="w-full h-12 sm:h-10 mb-4"
            />

            {/* PRIMARY ACTION: Save (download) — big, finger-friendly */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={() => downloadAudio(currentAudio.url, `devotional-${speaker}-${Date.now()}.wav`)}
                className="btn-primary py-4 sm:py-3 text-base font-semibold min-h-[52px]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Sauvegarder l'audio
              </button>
              {canShare ? (
                <button
                  onClick={() => shareAudio(currentAudio.blob, `devotional-${speaker}-${Date.now()}.wav`, text)}
                  className="btn-ghost py-4 sm:py-3 text-base font-semibold min-h-[52px]"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                  </svg>
                  Partager
                </button>
              ) : (
                <button
                  onClick={() => downloadAudio(currentAudio.url, `devotional-${speaker}-${Date.now()}.wav`)}
                  className="btn-ghost py-4 sm:py-3 text-base font-semibold min-h-[52px]"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                  </svg>
                  Copier le lien
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 mt-3 text-[10px] sm:text-xs text-ink-500">
              <span className="chip">{(currentAudio.size / 1024).toFixed(1)} KB</span>
              <span>·</span>
              <span>Généré en {(currentAudio.durationMs / 1000).toFixed(1)}s</span>
            </div>
          </section>
        )}

        {/* HISTORY */}
        {history.length > 0 && (
          <section className="animate-slide-up">
            <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2 px-1">
              Récents
            </h3>
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="p-3 rounded-lg bg-ink-900/40 border border-ink-800 hover:border-ink-700 transition"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="chip text-[10px]">{h.language}</span>
                    <span className="chip text-[10px]">{h.speaker}</span>
                    <span className="text-[10px] text-ink-500 ml-auto">
                      {new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-xs text-ink-300 line-clamp-2 mb-2 font-serif">{h.text}</p>
                  <div className="flex items-center gap-2">
                    <audio src={h.url} controls className="flex-1 h-8" />
                    <button
                      onClick={() => downloadAudio(h.url, `devotional-${h.speaker}-${h.createdAt}.wav`)}
                      className="btn-ghost p-2 min-h-[36px] min-w-[36px]"
                      aria-label="Sauvegarder"
                      title="Sauvegarder"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setHistory([])}
              className="text-[10px] text-ink-500 hover:text-ink-300 mt-2 px-1"
            >
              Effacer l'historique
            </button>
          </section>
        )}
      </main>

      {/* STICKY GENERATE BUTTON — pinned to bottom on mobile for thumb reach */}
      <div className="sticky bottom-0 left-0 right-0 z-10 p-3 sm:p-0 sm:relative sm:mt-6 bg-gradient-to-t from-ink-950 via-ink-950/95 to-transparent sm:bg-none">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="space-y-2">
              <button
                onClick={handleCancel}
                className="w-full py-4 sm:py-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 font-semibold text-base min-h-[56px] sm:min-h-[52px]"
              >
                <svg className="inline w-5 h-5 mr-2 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Annuler la génération
              </button>
              <p className="text-center text-xs text-ink-500">
                {language === "French" ? "Génération en cours sur le GPU…" : "Synthesizing on GPU…"}
              </p>
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!text.trim()}
              className="w-full py-4 sm:py-3.5 rounded-xl bg-gradient-to-r from-accent-600 to-accent-500 text-white font-semibold text-lg shadow-2xl shadow-accent-500/30 disabled:opacity-50 disabled:cursor-not-allowed min-h-[56px] sm:min-h-[52px]"
            >
              <svg className="inline w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              {language === "French" ? "Générer l'audio" : "Generate Audio"}
            </button>
          )}
        </div>
      </div>

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
