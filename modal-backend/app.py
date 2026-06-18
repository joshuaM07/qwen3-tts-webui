"""
Qwen3-TTS on Modal — serverless GPU inference for the Qwen3-TTS Web UI.

Architecture:
- L4 GPU (24GB VRAM, ~$0.80/hr on Modal, plenty for the 0.6B model)
- Model weights cached in a Modal Volume (cold start ~3s after first deploy)
- FastAPI endpoint serves WAV bytes directly
- Two model variants: CustomVoice (9 preset speakers + style instructions)
  and Base (voice cloning with 3s reference audio)

Deploy:  modal deploy app.py
Run:     modal serve app.py          # dev with live reload
"""
import io
import modal
import soundfile as sf
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------
APP_NAME = "qwen3-tts"
MODEL_CUSTOM = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"  # 1.7B, 9 preset speakers — better quality
MODEL_BASE = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"  # 1.7B, voice cloning

# L4 = 24GB VRAM, ~$0.80/hr. Falls back to A10G then T4 if L4 unavailable.
GPU_CONFIG = "L4"

# Supported speakers for the CustomVoice model. Keep in sync with frontend UI.
SPEAKERS = [
    {"id": "Vivian",    "name": "Vivian",    "lang": "Chinese",  "desc": "Bright young female voice"},
    {"id": "Serena",    "name": "Serena",    "lang": "Chinese",  "desc": "Warm, gentle young female voice"},
    {"id": "Uncle_Fu",  "name": "Uncle Fu",  "lang": "Chinese",  "desc": "Seasoned male voice, mellow timbre"},
    {"id": "Dylan",     "name": "Dylan",     "lang": "Chinese",  "desc": "Youthful Beijing male voice"},
    {"id": "Eric",      "name": "Eric",      "lang": "Chinese",  "desc": "Lively Chengdu male voice"},
    {"id": "Ryan",      "name": "Ryan",      "lang": "English",  "desc": "Dynamic male voice with rhythm"},
    {"id": "Aiden",     "name": "Aiden",     "lang": "English",  "desc": "Sunny American male voice"},
    {"id": "Ono_Anna",  "name": "Ono Anna",  "lang": "Japanese", "desc": "Playful Japanese female voice"},
    {"id": "Sohee",     "name": "Sohee",     "lang": "Korean",   "desc": "Warm Korean female voice"},
]

LANGUAGES = ["Chinese", "English", "Japanese", "Korean", "German",
             "French", "Russian", "Portuguese", "Spanish", "Italian"]

# -----------------------------------------------------------------------------
# Modal image: CUDA 12.x + Python 3.11 + qwen-tts
# -----------------------------------------------------------------------------
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "qwen-tts",
        "torch==2.6.0",
        "torchvision==0.21.0",
        "torchaudio==2.6.0",
        "soundfile",
        "fastapi[standard]",
        "pydantic>=2",
    )
    .env({
        "HF_HUB_CACHE": "/models/hf",
        "TRANSFORMERS_CACHE": "/models/hf",
    })
)

# Persistent volume for model weights — survives across cold starts
model_volume = modal.Volume.from_name("qwen3-tts-models", create_if_missing=True)

app = modal.App(APP_NAME, image=image)


# -----------------------------------------------------------------------------
# Request / response models
# -----------------------------------------------------------------------------
class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000, description="Text to synthesize")
    language: str = Field("English", description="One of LANGUAGES")
    speaker: str = Field("Ryan", description="One of SPEAKERS ids")
    instruct: str = Field("", description="Style instruction, e.g. 'Speak in a happy tone'")
    # Advanced knobs (optional)
    top_k: int = Field(50, ge=1, le=100)
    top_p: float = Field(1.0, ge=0.0, le=1.0)
    temperature: float = Field(0.9, ge=0.1, le=2.0)


class CloneRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    language: str = Field("English")
    ref_audio_b64: str = Field(..., description="Base64-encoded reference WAV (3-10s)")
    ref_text: str = Field("", description="Transcript of reference audio (helps quality)")


# -----------------------------------------------------------------------------
# Model: CustomVoice (preset speakers + instructions)
# -----------------------------------------------------------------------------
@app.cls(
    gpu=GPU_CONFIG,
    volumes={"/models": model_volume},
    scaledown_window=300,  # keep warm 5 min for snappy responses
    timeout=600,
    memory=16384,
)
@modal.concurrent(max_inputs=4)  # 4 parallel requests per container
class TTSService:
    @modal.enter()
    def load_model(self):
        """Load model once per container. Runs in warm state."""
        import torch
        from qwen_tts import Qwen3TTSModel

        print(f"[{APP_NAME}] loading {MODEL_CUSTOM} on {GPU_CONFIG}...")
        self.model = Qwen3TTSModel.from_pretrained(
            MODEL_CUSTOM,
            device_map="cuda:0",
            dtype=torch.bfloat16,
            attn_implementation="sdpa",  # PyTorch native, no extra deps
        )
        print(f"[{APP_NAME}] model ready")

    @modal.method()
    def synthesize(
        self,
        text: str,
        language: str,
        speaker: str,
        instruct: str = "",
        top_k: int = 50,
        top_p: float = 1.0,
        temperature: float = 0.9,
    ) -> bytes:
        """Generate WAV bytes for the given text."""
        if not text.strip():
            raise ValueError("text is empty")
        if language not in LANGUAGES:
            raise ValueError(f"unsupported language: {language}")
        if speaker not in [s["id"] for s in SPEAKERS]:
            raise ValueError(f"unsupported speaker: {speaker}")

        wavs, sr = self.model.generate_custom_voice(
            text=text,
            language=language,
            speaker=speaker,
            instruct=instruct or None,
            top_k=top_k,
            top_p=top_p,
            temperature=temperature,
        )

        buf = io.BytesIO()
        sf.write(buf, wavs[0], sr, format="WAV", subtype="PCM_16")
        return buf.getvalue()


# -----------------------------------------------------------------------------
# Model: Base (voice cloning with reference audio)
# -----------------------------------------------------------------------------
@app.cls(
    gpu=GPU_CONFIG,
    volumes={"/models": model_volume},
    scaledown_window=300,
    timeout=600,
    memory=16384,
)
@modal.concurrent(max_inputs=2)
class TTSCloneService:
    @modal.enter()
    def load_model(self):
        import torch
        from qwen_tts import Qwen3TTSModel

        print(f"[{APP_NAME}] loading {MODEL_BASE} for voice cloning...")
        self.model = Qwen3TTSModel.from_pretrained(
            MODEL_BASE,
            device_map="cuda:0",
            dtype=torch.bfloat16,
            attn_implementation="sdpa",  # PyTorch native, no extra deps
        )
        print(f"[{APP_NAME}] clone model ready")

    @modal.method()
    def clone(
        self,
        text: str,
        language: str,
        ref_audio_b64: str,
        ref_text: str = "",
    ) -> bytes:
        import base64
        import tempfile
        import torch
        import torchaudio

        if not text.strip():
            raise ValueError("text is empty")
        if not ref_audio_b64:
            raise ValueError("ref_audio_b64 is required for voice cloning")

        # Decode ref audio to a temp file (Qwen API takes a file path)
        audio_bytes = base64.b64decode(ref_audio_b64)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_bytes)
            ref_path = f.name

        try:
            # Load ref audio into tensors (Base API expects ref_audio tensor list)
            wav, sr = torchaudio.load(ref_path)
            ref_audio = [wav.squeeze(0)]  # list of 1D tensors

            kwargs = {
                "text": text,
                "language": language,
                "ref_audio": ref_audio,
            }
            if ref_text.strip():
                kwargs["ref_text"] = ref_text

            wavs, out_sr = self.model.generate_voice_clone(**kwargs)
        finally:
            import os
            try:
                os.unlink(ref_path)
            except OSError:
                pass

        buf = io.BytesIO()
        sf.write(buf, wavs[0], out_sr, format="WAV", subtype="PCM_16")
        return buf.getvalue()


# -----------------------------------------------------------------------------
# FastAPI web layer
# -----------------------------------------------------------------------------
web_app = FastAPI(title="Qwen3-TTS API", version="1.0.0")

# CORS — open by default; lock down to your Cloudflare Pages domain in prod
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@web_app.get("/")
def root():
    return {
        "name": APP_NAME,
        "status": "ok",
        "model": MODEL_CUSTOM,
        "gpu": GPU_CONFIG,
        "endpoints": ["/health", "/speakers", "/languages", "/synthesize", "/clone"],
    }


@web_app.get("/health")
def health():
    return {"status": "ok", "model_loaded": True}


@web_app.get("/speakers")
def speakers():
    return {"speakers": SPEAKERS}


@web_app.get("/languages")
def languages():
    return {"languages": LANGUAGES}


@web_app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    """Synthesize text to speech. Returns audio/wav bytes."""
    try:
        wav_bytes = TTSService().synthesize.remote(
            text=req.text,
            language=req.language,
            speaker=req.speaker,
            instruct=req.instruct,
            top_k=req.top_k,
            top_p=req.top_p,
            temperature=req.temperature,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[synthesize] error: {e}")
        raise HTTPException(status_code=500, detail=f"synthesis failed: {e}")

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": 'inline; filename="qwen3-tts.wav"',
            "Cache-Control": "no-store",
        },
    )


@web_app.post("/clone")
def clone(req: CloneRequest):
    """Voice-clone synthesis. Body is JSON, ref_audio is base64 WAV."""
    try:
        wav_bytes = TTSCloneService().clone.remote(
            text=req.text,
            language=req.language,
            ref_audio_b64=req.ref_audio_b64,
            ref_text=req.ref_text,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[clone] error: {e}")
        raise HTTPException(status_code=500, detail=f"cloning failed: {e}")

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": 'inline; filename="qwen3-tts-cloned.wav"',
            "Cache-Control": "no-store",
        },
    )


@app.function()
@modal.asgi_app()
def fastapi_app():
    return web_app
