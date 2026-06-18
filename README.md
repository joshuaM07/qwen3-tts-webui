# Qwen3-TTS · Neural Voice Studio

A complete **text-to-speech web app** that runs on completely free infra:

- **Frontend** → Cloudflare Pages (free static hosting, global CDN)
- **Backend** → Modal (free $30/month GPU credit, serverless, scales to zero)
- **Model** → Qwen3-TTS-12Hz-0.6B-CustomVoice from Alibaba (Apache 2.0)

```
Browser ──> Cloudflare Pages (static UI)
                  │
                  │ POST /synthesize
                  ▼
              Modal (L4 GPU, on-demand)
                  │
                  │ runs Qwen3-TTS, returns WAV bytes
                  ▼
              Browser plays audio
```

## Features

- **9 premium speakers** across Chinese, English, Japanese, Korean
- **10 languages** total (zh, en, ja, ko, de, fr, ru, pt, es, it)
- **Natural-language style control** ("speak in a happy tone", "whisper softly", etc.)
- **Voice cloning** via 3-10s reference audio (Base model)
- **Streaming-friendly** 12Hz tokenizer (low latency)
- **No server to babysit** — both layers scale to zero
- **Mobile responsive** dark UI

## Project layout

```
qwen3-tts/
├── modal-backend/
│   ├── app.py              ← FastAPI + Modal app, two GPU services
│   └── requirements.txt
├── frontend/               ← Vite + React + TypeScript + Tailwind
│   ├── src/
│   │   ├── App.tsx         ← Main UI
│   │   ├── lib/api.ts      ← Modal API client
│   │   └── index.css
│   ├── package.json
│   ├── wrangler.toml       ← Cloudflare Pages config
│   └── vite.config.ts
├── deploy.sh               ← One-shot deploy script
├── .gitignore
└── README.md
```

## One-time setup (5 minutes)

### 1. Install Modal CLI

```bash
# from project root
python3 -m venv .venv
source .venv/bin/activate
pip install modal

# Opens browser — sign in with GitHub
modal setup
```

### 2. Install Cloudflare wrangler (already in package.json)

The frontend's `npm install` puts `wrangler` on your PATH.

## Deploy

### A. Deploy the Modal backend ✅ ALREADY DEPLOYED

The Modal backend is already live at:

**`https://joshm071197--qwen3-tts-fastapi-app.modal.run`**

Smoke test results:
- `/health` → `{"status":"ok","model_loaded":true}`
- `/speakers` → 9 speakers (Vivian, Serena, Uncle_Fu, Dylan, Eric, Ryan, Aiden, Ono_Anna, Sohee)
- `/languages` → 10 languages
- `/synthesize` (Ryan, English) → 457.5 KB WAV, 9.76s @ 24kHz, real audio confirmed
- Warm call: 13.7s for 210KB output
- Chinese (Vivian): 7.5s for 146KB

Sample audio: [`samples/ryan-english-hello.wav`](samples/ryan-english-hello.wav) (458 KB)

To redeploy after code changes:

```bash
cd modal-backend
modal deploy app.py
```

**First deploy was slow (~10 min)** because Modal builds the image with
`torch` + `qwen-tts` (~3GB image). Subsequent deploys use the cache (~3-30s).

### B. Deploy the frontend to Cloudflare Pages

The repo is ready for Cloudflare Pages to deploy directly from Git.

**1. Go to**: https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**

**2. Select repo**: `joshuaM07/qwen3-tts-webui`

**3. Build settings:**
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `frontend`

**4. Environment variables** (Advanced → Add variable):
   - **Name**: `VITE_API_URL`
   - **Value**: `https://joshm071197--qwen3-tts-fastapi-app.modal.run`
   - Also add it to **Preview** environment if you want it on PR previews.

**5. Click Save and Deploy.** First build takes ~30s, then it's live at `https://qwen3-tts-webui.pages.dev`.

The `wrangler.toml` in the repo already has the URL baked in, so if you skip
step 4 it'll still work — the env var just lets you change the backend
without redeploying.

> **Note**: The repo's `wrangler.toml` has the Modal URL pre-filled at
> `frontend/wrangler.toml`. If you fork or change Modal workspaces, edit that
> file or override with the `VITE_API_URL` env var.

### C. Or just run `deploy.sh` from the project root

```bash
./deploy.sh
```

It runs both A and B in sequence after asking for the Modal URL.

## Usage

1. Open the deployed URL
2. **First-time only**: click ⚙ Settings, paste your Modal API URL, Save
3. Choose **Language** → **Speaker** (filtered by language)
4. Optionally add a **Style Instruction** ("speak in a happy tone")
5. Type or paste your text (up to 2000 chars)
6. Click **Generate Speech** → audio plays + downloads option + history saved locally

> First generation can take 15-30s while Modal spins up the GPU.
> Subsequent calls are 2-5s because the container stays warm 5 minutes.

## Cost

| Service        | Free tier                          | What you get               |
| -------------- | ---------------------------------- | -------------------------- |
| Modal          | $30 / month credit                 | ~37 hours of L4 GPU time   |
| Cloudflare Pages | Unlimited static hosting         | 500 builds / month         |
| HuggingFace    | Free (gated model downloads)       | Model weights              |

Roughly: **2,000-3,000 30-second voice generations per month** before you hit
the Modal cap. Idle containers scale to zero — you only pay while serving requests.

If you blow past the free tier, the L4 GPU is ~$0.80/hr and you can swap to a
cheaper `T4` (~$0.60/hr) in `modal-backend/app.py` by changing `GPU_CONFIG`.

## GPU options

Edit `modal-backend/app.py`:

```python
GPU_CONFIG = "L4"    # 24GB VRAM, ~$0.80/hr, recommended
GPU_CONFIG = "A10G"  # 24GB VRAM, ~$1.10/hr
GPU_CONFIG = "T4"    # 16GB VRAM, ~$0.60/hr, slower
GPU_CONFIG = "A100"  # 40GB VRAM, ~$3.00/hr, overkill
```

`T4` works for the 0.6B model. Don't try the 1.7B on T4 without quantization.

## Local development

```bash
# Terminal 1 — backend (live reload)
cd modal-backend
modal serve app.py

# Terminal 2 — frontend
cd frontend
VITE_API_URL="https://<your-username>--qwen3-tts-fastapi-app.modal.run" npm run dev
# → http://localhost:5173
```

The dev frontend hot-reloads on save. The Modal backend uses `modal serve`
which redeploys on save (slower, ~30s per change).

## Architecture notes

### Why two services on Modal?

The **CustomVoice** model (preset speakers + style instructions) and the
**Base** model (voice cloning) are different checkpoints. They have different
weights and slightly different APIs, so we mount them as separate Modal
classes with their own GPU containers. This way:
- CustomVoice requests don't pay the Base model's memory cost
- They scale independently
- The /synthesize endpoint stays fast even if cloning is slow

### Why volume for model weights?

`modal.Volume("qwen3-tts-models")` caches the 1.8GB model across cold starts.
First cold start ~10s, subsequent cold starts ~3s. Without the volume, every
cold start would re-download from HuggingFace (~1.8GB).

### Why L4 GPU?

L4 is the sweet spot for inference: 24GB VRAM (4x what we need for 0.6B),
Ada Lovelace architecture with flash attention, and Modal charges ~$0.80/hr.
A10G is comparable but slightly more expensive. T4 works but is 2-3x slower.

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| "API URL not configured" | Click ⚙ Settings, paste your Modal URL |
| Modal deploy times out at image build | First build is slow (~10 min). Check `modal app logs qwen3-tts` |
| CORS error in browser console | Already handled — backend has `allow_origins=["*"]`. If you locked it down, add your CF Pages domain |
| wrangler auth fails | Run `npx wrangler login` first, then `npm run deploy` |
| 502 on first request | Modal cold start. Just retry — second request is fast |

## License

- Code in this repo: MIT
- Qwen3-TTS model weights: Apache 2.0
- The generated audio: yours to use however you want

## Credits

- Model: [Qwen3-TTS by Alibaba](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice)
- Infra: [Modal](https://modal.com) + [Cloudflare Pages](https://pages.cloudflare.com)
- Inspired by the [Qwen3-TTS demo on HF Spaces](https://huggingface.co/spaces/Qwen/Qwen3-TTS)
