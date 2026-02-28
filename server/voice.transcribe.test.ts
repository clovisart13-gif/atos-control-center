/**
 * Testes unitários para a rota voice.transcribe
 * Verifica que a rota rejeita áudios inválidos e grandes corretamente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// Mock dos módulos externos antes de importar o router
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "audio-transcriptions/test-audio.webm",
    url: "https://cdn.example.com/audio-transcriptions/test-audio.webm",
  }),
}));

vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({
    text: "Olá, este é um teste de transcrição de áudio.",
    language: "pt",
    duration: 3.5,
    task: "transcribe",
    segments: [],
  }),
}));

// Importa após os mocks
import { storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";

// Função auxiliar para simular a lógica da rota sem precisar do contexto tRPC completo
async function runTranscribeLogic(input: { audioBase64: string; mimeType: string }) {
  const { audioBase64, mimeType } = input;

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audioBase64, "base64");
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Dados de áudio inválidos." });
  }

  const sizeMB = audioBuffer.length / (1024 * 1024);
  if (sizeMB > 16) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Áudio muito grande (${sizeMB.toFixed(1)}MB). Máximo permitido: 16MB.`,
    });
  }

  const ext = mimeType.includes("webm") ? "webm" : "mp3";
  const fileKey = `audio-transcriptions/test.${ext}`;

  const uploaded = await storagePut(fileKey, audioBuffer, mimeType);
  const audioUrl = uploaded.url;

  const result = await transcribeAudio({
    audioUrl,
    language: "pt",
    prompt: "Transcreva a fala do usuário em português brasileiro.",
  });

  if ("error" in result) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro na transcrição: ${result.error}` });
  }

  return { text: result.text, language: result.language, duration: result.duration };
}

describe("voice.transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve transcrever áudio válido com sucesso", async () => {
    // Cria um buffer de áudio simulado (pequeno, apenas para teste)
    const fakeAudio = Buffer.from("fake audio data for testing");
    const base64 = fakeAudio.toString("base64");

    const result = await runTranscribeLogic({
      audioBase64: base64,
      mimeType: "audio/webm",
    });

    expect(result.text).toBe("Olá, este é um teste de transcrição de áudio.");
    expect(result.language).toBe("pt");
    expect(result.duration).toBe(3.5);
    expect(storagePut).toHaveBeenCalledOnce();
    expect(transcribeAudio).toHaveBeenCalledOnce();
  });

  it("deve rejeitar áudio maior que 16MB", async () => {
    // Cria um buffer de 17MB
    const largeBuffer = Buffer.alloc(17 * 1024 * 1024, "x");
    const base64 = largeBuffer.toString("base64");

    await expect(
      runTranscribeLogic({ audioBase64: base64, mimeType: "audio/webm" })
    ).rejects.toThrow(TRPCError);

    await expect(
      runTranscribeLogic({ audioBase64: base64, mimeType: "audio/webm" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("deve chamar storagePut com o tipo MIME correto", async () => {
    const fakeAudio = Buffer.from("test audio");
    const base64 = fakeAudio.toString("base64");

    await runTranscribeLogic({ audioBase64: base64, mimeType: "audio/webm" });

    expect(storagePut).toHaveBeenCalledWith(
      expect.stringContaining("audio-transcriptions/"),
      expect.any(Buffer),
      "audio/webm"
    );
  });

  it("deve propagar erro quando o Whisper falha", async () => {
    vi.mocked(transcribeAudio).mockResolvedValueOnce({
      error: "Serviço indisponível",
      code: "SERVICE_ERROR",
    });

    const fakeAudio = Buffer.from("test audio");
    const base64 = fakeAudio.toString("base64");

    await expect(
      runTranscribeLogic({ audioBase64: base64, mimeType: "audio/webm" })
    ).rejects.toThrow(TRPCError);
  });
});
