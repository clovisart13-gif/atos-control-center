/**
 * Transcrição de áudio para texto usando Web Speech API
 * Fallback: envia o áudio como blob para o webhook processar
 */

export async function transcribeAudio(blob: Blob): Promise<string> {
  // Tenta usar a Web Speech API (reconhecimento em tempo real)
  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    return new Promise((resolve, reject) => {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      let transcript = "";

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript + " ";
          }
        }
      };

      recognition.onerror = (event: any) => {
        // Se a Speech API falhar, retorna mensagem indicando áudio
        resolve(transcript.trim() || "[Áudio gravado — transcrição não disponível]");
      };

      recognition.onend = () => {
        URL.revokeObjectURL(audioUrl);
        resolve(transcript.trim() || "[Áudio gravado — transcrição não disponível]");
      };

      // Inicia reconhecimento
      try {
        recognition.start();
        // Reproduz o áudio para o reconhecimento captar
        audio.play().catch(() => {
          // Se não conseguir reproduzir, para o reconhecimento
          recognition.stop();
        });

        // Timeout de segurança
        audio.onended = () => {
          setTimeout(() => recognition.stop(), 1000);
        };

        // Timeout máximo de 60 segundos
        setTimeout(() => {
          recognition.stop();
          audio.pause();
        }, 60000);
      } catch {
        resolve("[Áudio gravado — transcrição não disponível]");
      }
    });
  }

  // Fallback: retorna indicação de áudio
  return "[Áudio gravado — transcrição não disponível neste navegador]";
}

/**
 * Transcrição em tempo real usando Web Speech API
 * Retorna uma instância controlável
 */
export function createLiveTranscriber(
  onResult: (text: string, isFinal: boolean) => void,
  onError?: (error: string) => void
) {
  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    onError?.("Reconhecimento de voz não suportado neste navegador.");
    return null;
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.lang = "pt-BR";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = "";

  recognition.onresult = (event: any) => {
    let interimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript + " ";
        onResult(finalTranscript.trim(), true);
      } else {
        interimTranscript += result[0].transcript;
        onResult(finalTranscript + interimTranscript, false);
      }
    }
  };

  recognition.onerror = (event: any) => {
    if (event.error !== "aborted") {
      onError?.(`Erro no reconhecimento: ${event.error}`);
    }
  };

  return {
    start: () => {
      finalTranscript = "";
      recognition.start();
    },
    stop: () => {
      recognition.stop();
      return finalTranscript.trim();
    },
  };
}
