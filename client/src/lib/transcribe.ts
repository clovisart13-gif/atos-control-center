/**
 * Transcrição de áudio para texto usando Whisper API via backend.
 * O blob de áudio é convertido para base64 e enviado para a rota tRPC voice.transcribe,
 * que faz upload para S3 e chama o Whisper — suporta áudios longos com alta precisão.
 */
// Usa fetch direto para não depender de hooks React
export async function transcribeAudioWithWhisper(blob: Blob): Promise<string> {
  // Converte Blob para base64
  const base64 = await blobToBase64(blob);
  const mimeType = blob.type || "audio/webm";

  // Chama a API tRPC via fetch direto (não precisa de hook React)
  const response = await fetch("/api/trpc/voice.transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      json: {
        audioBase64: base64,
        mimeType,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Erro na transcrição (${response.status}): ${errText}`);
  }

  const data = await response.json();

  // tRPC retorna { result: { data: { json: { text, language, duration } } } }
  const text =
    data?.result?.data?.json?.text ??
    data?.result?.data?.text ??
    data?.text ??
    "";

  return text.trim();
}

/**
 * Converte um Blob para string base64 (sem o prefixo data:...)
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove o prefixo "data:audio/webm;base64," para obter apenas o base64
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo de áudio."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Função principal exportada — usa Whisper via backend.
 * Mantém a mesma assinatura da versão anterior para compatibilidade.
 */
export async function transcribeAudio(blob: Blob): Promise<string> {
  return transcribeAudioWithWhisper(blob);
}
