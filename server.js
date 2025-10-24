import express from "express";
import cors from "cors";
import morgan from "morgan";
import fs from "fs";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

// 🔐 najpierw spróbuj z ENV (Render), a lokalnie czytaj z pliku:
const credentials = process.env.GOOGLE_TTS_JSON
  ? JSON.parse(process.env.GOOGLE_TTS_JSON)
  : JSON.parse(fs.readFileSync("./vocal-ceiling-475815-u5-6b14ff369025.json", "utf8"));

const ttsClient = new TextToSpeechClient({ credentials });


const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan("tiny"));

app.post("/tts", async (req, res) => {
  const text = req.body.text || "Dzień dobry! Miłego poranka!";
  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: { languageCode: "pl-PL", name: "pl-PL-Wavenet-A" },
    audioConfig: { audioEncoding: "MP3" }
  });

  const audio = Buffer.from(response.audioContent, "base64");
  res.set("Content-Type", "audio/mpeg");
  res.send(audio);
});

app.listen(8080, () => console.log("✅ Serwer działa na http://localhost:8080"));

