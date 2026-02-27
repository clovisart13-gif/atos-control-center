import { APP_CONFIG } from "@shared/const";

/**
 * Converte um File para base64 data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

/**
 * Valida se o arquivo é uma imagem permitida
 */
export function isValidImage(file: File): boolean {
  return (
    APP_CONFIG.allowedImageTypes.includes(file.type as any) &&
    file.size <= APP_CONFIG.maxFileSize
  );
}

/**
 * Valida se o arquivo é um PDF permitido
 */
export function isValidPdf(file: File): boolean {
  return (
    APP_CONFIG.allowedPdfTypes.includes(file.type as any) &&
    file.size <= APP_CONFIG.maxFileSize
  );
}

/**
 * Formata o tamanho do arquivo para exibição
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formata duração em segundos para mm:ss
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
