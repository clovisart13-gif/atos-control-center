/**
 * Supabase helpers para o Mentor Atos
 * - Busca contexto/memória da tabela conversation_logs
 * - Salva logs via Edge Function athos-log
 * - Aciona executor via Edge Function athos-bridge
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BRIDGE_API_KEY = process.env.SUPABASE_BRIDGE_API_KEY!;

export interface ConversationLog {
  id: string;
  created_at: string;
  role: "user" | "mentor" | "supervisor" | "executor";
  message: string;
  context_version?: string;
  blueprint_version?: string;
  decision_reference?: string;
}

/**
 * Busca as últimas N mensagens do conversation_logs para montar contexto do Mentor.
 */
export async function fetchConversationContext(limit = 20): Promise<ConversationLog[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/conversation_logs?select=id,role,message,created_at&order=created_at.desc&limit=${limit}`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    console.error("[Supabase] Erro ao buscar contexto:", res.status, await res.text());
    return [];
  }

  const data: ConversationLog[] = await res.json();
  // Inverte para ordem cronológica (mais antiga primeiro)
  return data.reverse();
}

/**
 * Salva uma mensagem no conversation_logs via Edge Function athos-log.
 */
export async function saveLog(params: {
  role: "user" | "mentor" | "supervisor" | "executor";
  message: string;
  context_version?: string;
  blueprint_version?: string;
  decision_reference?: string;
}): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/athos-log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-key": BRIDGE_API_KEY,
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      console.error("[Supabase] Erro ao salvar log:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[Supabase] Falha na chamada athos-log:", err);
  }
}

/**
 * Aciona o executor n8n via Edge Function athos-bridge.
 * Usado quando o Mentor decide executar uma ação.
 */
export async function dispatchToExecutor(command: {
  action: string;
  args?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/athos-bridge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-key": BRIDGE_API_KEY,
      },
      body: JSON.stringify(command),
    });

    const text = await res.text();

    if (!res.ok) {
      console.error("[Supabase] Erro no athos-bridge:", res.status, text);
      return { success: false, error: `Status ${res.status}: ${text}` };
    }

    try {
      return { success: true, data: JSON.parse(text) };
    } catch {
      return { success: true, data: text };
    }
  } catch (err: any) {
    console.error("[Supabase] Falha na chamada athos-bridge:", err);
    return { success: false, error: err.message };
  }
}
