// --- IMPORTY ---
import express from "express";
import cors from "cors";
import morgan from "morgan";
import fs from "fs";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

// --- KONFIGURACJA GOOGLE CLOUD ---
let credentials;
try {
  if (process.env.GOOGLE_TTS_JSON) {
    console.log("🔐 Using GOOGLE_TTS_JSON from environment");
    credentials = JSON.parse(process.env.GOOGLE_TTS_JSON);
  } else {
    console.log("📄 Using local JSON file");
    credentials = JSON.parse(fs.readFileSync("./vocal-ceiling-475815-u5-6b14ff369025.json", "utf8"));
  }
} catch (e) {
  console.error("❌ Could not load credentials:", e.message);
  process.exit(1);
}

const ttsClient = new TextToSpeechClient({ credentials });

// --- INICJALIZACJA EXPRESSA ---
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors());
app.use(morgan("tiny"));

// --- ROUTES ---

// Prosty healthcheck, żeby Render nie zgłaszał 404
app.get("/", (_req, res) => res.send("✅ TTS Proxy is running"));

// Główna trasa do syntezy mowy
app.post("/tts", async (req, res) => {
  try {
    let {
      text,
      languageCode,
      voiceName,
      audioEncoding = "MP3",
      speakingRate = 1.0,
      pitch = 0.0,
      volumeGainDb = 0.0,
      sampleRateHertz,
      effectsProfileId = []
    } = req.body || {};

    // Walidacja wejścia
    if (!text || typeof text !== "string" || text.length > 2000) {
      return res.status(400).json({ error: "Provide text (<=2000 chars)" });
    }

    // 1️⃣ Jeśli mamy voiceName, wyciągnij languageCode z prefiksu (np. "de-DE" z "de-DE-Wavenet-C")
    if (voiceName && !languageCode) {
      const match = voiceName.match(/^([a-z]{2}-[A-Z]{2})-/);
      if (match) languageCode = match[1];
    }

    // 2️⃣ Domyślne głosy per język
    if (!voiceName && languageCode) {
      const defaults = {
        "pl-PL": "pl-PL-Wavenet-A",
        "de-DE": "de-DE-Wavenet-C",
        "en-US": "en-US-Neural2-F",
        "fr-FR": "fr-FR-Wavenet-B",
        "it-IT": "it-IT-Wavenet-A",
        "es-ES": "es-ES-Wavenet-D"
      };
      voiceName = defaults[languageCode] || `${languageCode}-Wavenet-A`;
    }

    // 3️⃣ Fallback – jeśli nic nie ustawiono
    if (!languageCode) languageCode = "pl-PL";
    if (!voiceName) voiceName = "pl-PL-Wavenet-A";

    // 4️⃣ Walidacja spójności
    if (!voiceName.startsWith(languageCode)) {
      return res.status(400).json({
        error: "Mismatch languageCode vs voiceName",
        hint: `voiceName (${voiceName}) should start with ${languageCode}-...`
      });
    }

    // 5️⃣ Wykrycie SSML
    const isSSML = text.trim().startsWith("<speak>");
    const input = isSSML ? { ssml: text } : { text };

    console.log(`🎙️ Synthesizing: ${languageCode} / ${voiceName} / ${isSSML ? "SSML" : "plain text"}`);

    // --- SYNTEZA MOWY ---
    const [response] = await ttsClient.synthesizeSpeech({
      input,
      voice: { languageCode, name: voiceName },
      audioConfig: {
        audioEncoding: audioEncoding.toUpperCase(),
        speakingRate,
        pitch,
        volumeGainDb,
        sampleRateHertz,
        effectsProfileId
      }
    });

    const audio = Buffer.from(response.audioContent, "base64");

    res.type(
      audioEncoding.toUpperCase() === "MP3" ? "audio/mpeg" :
      audioEncoding.toUpperCase() === "OGG_OPUS" ? "audio/ogg" :
      audioEncoding.toUpperCase() === "LINEAR16" ? "audio/wav" : "application/octet-stream"
    );
    res.send(audio);

  } catch (err) {
    console.error("❌ TTS Error:", err);
    res.status(500).json({ error: "TTS failed", details: err.message });
  }
});

// --- START SERWERA ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
