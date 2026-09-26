/**
 * Voice message handler — download from Meta, upload to Supabase Storage,
 * transcribe with OpenAI Whisper (gpt-4o-transcribe).
 */

import { OPENAI_TRANSCRIPTION_MODEL } from "@/lib/constants";

const WHATSAPP_API_VERSION = "v22.0";
const STORAGE_BUCKET = "voice-notes";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB safety limit
const FETCH_TIMEOUT_MS = 20_000; // 20s timeout for audio download/upload

interface MetaMediaMeta {
  url: string;
  mime_type: string;
  file_size: number;
}

/**
 * Fetch media metadata from Meta's Graph API.
 */
async function getMediaMeta(mediaId: string): Promise<MetaMediaMeta> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN not set");

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${mediaId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "curl/7.64.1",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Meta media fetch failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return {
      url: data.url,
      mime_type: data.mime_type,
      file_size: data.file_size,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Download the raw audio bytes from Meta's media URL.
 */
async function downloadAudio(url: string): Promise<ArrayBuffer> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "curl/7.64.1",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Audio download failed: ${res.status} ${res.statusText}`);
    }

    return res.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Derive file extension from MIME type.
 */
function mimeToExt(mimeType: string): string {
  if (mimeType.includes("ogg") || mimeType.includes("opus")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  return "ogg";
}

/**
 * Upload audio to Supabase Storage under tenant_id/message_id.ext.
 * Returns the storage path.
 */
async function uploadToStorage(
  supabase: ReturnType<
    typeof import("@/lib/supabase/server").createAdminClient
  >,
  tenantId: number,
  messageId: string,
  buffer: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const ext = mimeToExt(mimeType);
  const path = `${tenantId}/${messageId}.${ext}`;

  const nodeBuffer = Buffer.from(buffer);

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, nodeBuffer, { contentType: mimeType, upsert: true });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return path;
}

/**
 * Transcribe audio using OpenAI Whisper/GPT-4o-transcribe.
 * Accepts an ArrayBuffer of audio data + MIME type.
 */
export async function transcribeAudio(
  buffer: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const groqApiKey = process.env.GROQ_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!groqApiKey && !openaiApiKey) {
    throw new Error("Neither GROQ_API_KEY nor OPENAI_API_KEY is configured for voice transcription");
  }

  const ext = mimeToExt(mimeType);
  const blob = new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.append("file", blob, `audio.${ext}`);
  formData.append("language", "en");
  formData.append(
    "prompt",
    "Nigerian small business bookkeeping: sales, expenses, restock, naira, wigs, closures, stock, quantity, pieces, price, sold",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Use Groq Whisper if available (free & fast), else OpenAI Whisper
  const endpoint = groqApiKey
    ? "https://api.groq.com/openai/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
  const apiKey = groqApiKey || openaiApiKey;
  const model = groqApiKey ? "whisper-large-v3-turbo" : OPENAI_TRANSCRIPTION_MODEL;

  formData.append("model", model);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      if (err.includes("credit_balance_exhausted") || err.includes("insufficient_quota")) {
        throw new Error("OPENAI_QUOTA_EXHAUSTED: OpenAI API credit balance is $0. Please add credits to your OpenAI account or set a free GROQ_API_KEY.");
      }
      throw new Error(`Transcription failed: ${res.status} ${err}`);
    }

    const data = await res.json();
    return data.text?.trim() ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Full voice message pipeline:
 *   1. Fetch metadata from Meta
 *   2. Check file size (reject if > 10 MB)
 *   3. Download audio from Meta
 *   4. Upload to Supabase Storage
 *   5. Transcribe with Whisper
 *
 * Returns { storagePath, transcript }.
 */
export async function processVoiceMessage(
  supabase: ReturnType<
    typeof import("@/lib/supabase/server").createAdminClient
  >,
  tenantId: number,
  messageId: string,
  mediaId: string,
): Promise<{ storagePath: string; transcript: string }> {
  // 1. Get metadata
  const meta = await getMediaMeta(mediaId);

  // 2. Size check
  if (meta.file_size > MAX_FILE_SIZE) {
    throw new Error(
      "VOICE_TOO_LARGE: Audio exceeds 10 MB limit. Please send a shorter note or type it instead.",
    );
  }

  // 3. Download
  const audioBuffer = await downloadAudio(meta.url);

  // 4. Upload to Supabase Storage
  const storagePath = await uploadToStorage(
    supabase,
    tenantId,
    messageId,
    audioBuffer,
    meta.mime_type,
  );

  // 5. Transcribe
  const transcript = await transcribeAudio(audioBuffer, meta.mime_type);

  return { storagePath, transcript };
}
