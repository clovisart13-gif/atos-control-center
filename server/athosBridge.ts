/**
 * ATHOS Bridge — Comunicação entre ATHOS_MENTOR e ATOS_EXECUTOR (n8n)
 *
 * Capacidades:
 * - Listar workflows disponíveis no n8n
 * - Acionar um workflow por ID ou nome via webhook
 * - Criar um novo workflow a partir de um JSON
 * - Ativar/desativar workflows
 */

const N8N_BASE_URL = process.env.N8N_BASE_URL?.replace(/\/$/, "");
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_BASE_URL || !N8N_API_KEY) {
  console.warn("[athos-bridge] N8N_BASE_URL ou N8N_API_KEY não configurados");
}

const n8nHeaders = {
  "X-N8N-API-KEY": N8N_API_KEY ?? "",
  "Content-Type": "application/json",
};

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  tags?: { id: string; name: string }[];
}

export interface N8nWorkflowDetail extends N8nWorkflow {
  nodes: unknown[];
  connections: unknown;
  settings?: unknown;
}

/**
 * Lista todos os workflows do n8n
 */
export async function listWorkflows(): Promise<N8nWorkflow[]> {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows?limit=100`, {
    headers: n8nHeaders,
  });
  if (!res.ok) throw new Error(`n8n listWorkflows error: ${res.status} ${await res.text()}`);
  const data = await res.json() as { data: N8nWorkflow[] };
  return data.data ?? [];
}

/**
 * Busca um workflow pelo nome (case-insensitive)
 */
export async function findWorkflowByName(name: string): Promise<N8nWorkflow | null> {
  const workflows = await listWorkflows();
  return workflows.find(w => w.name.toLowerCase().includes(name.toLowerCase())) ?? null;
}

/**
 * Busca detalhes completos de um workflow pelo ID
 */
export async function getWorkflow(workflowId: string): Promise<N8nWorkflowDetail> {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${workflowId}`, {
    headers: n8nHeaders,
  });
  if (!res.ok) throw new Error(`n8n getWorkflow error: ${res.status} ${await res.text()}`);
  return res.json() as Promise<N8nWorkflowDetail>;
}

/**
 * Ativa um workflow pelo ID
 */
export async function activateWorkflow(workflowId: string): Promise<void> {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${workflowId}/activate`, {
    method: "POST",
    headers: n8nHeaders,
  });
  if (!res.ok) throw new Error(`n8n activateWorkflow error: ${res.status} ${await res.text()}`);
}

/**
 * Desativa um workflow pelo ID
 */
export async function deactivateWorkflow(workflowId: string): Promise<void> {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${workflowId}/deactivate`, {
    method: "POST",
    headers: n8nHeaders,
  });
  if (!res.ok) throw new Error(`n8n deactivateWorkflow error: ${res.status} ${await res.text()}`);
}

/**
 * Cria um novo workflow a partir de um JSON
 */
export async function createWorkflow(workflowJson: Record<string, unknown>): Promise<N8nWorkflow> {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows`, {
    method: "POST",
    headers: n8nHeaders,
    body: JSON.stringify(workflowJson),
  });
  if (!res.ok) throw new Error(`n8n createWorkflow error: ${res.status} ${await res.text()}`);
  return res.json() as Promise<N8nWorkflow>;
}

/**
 * Aciona um workflow via webhook (para workflows com trigger Webhook)
 * webhookPath: o path configurado no nó Webhook do workflow (ex: "atos-executor")
 */
export async function triggerWebhook(
  webhookPath: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const url = `${N8N_BASE_URL}/webhook/${webhookPath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`n8n triggerWebhook error: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Executa uma ação no ATOS_EXECUTOR baseada no bloco ```execute``` do ATHOS_MENTOR
 * Suporta: list_workflows, get_workflow, create_workflow, activate_workflow, trigger_webhook
 */
export async function dispatchAction(action: string, args: Record<string, unknown>): Promise<unknown> {
  switch (action) {
    case "list_workflows":
      return listWorkflows();

    case "get_workflow":
      return getWorkflow(args.workflow_id as string);

    case "find_workflow":
      return findWorkflowByName(args.name as string);

    case "create_workflow":
      return createWorkflow(args.workflow as Record<string, unknown>);

    case "activate_workflow":
      await activateWorkflow(args.workflow_id as string);
      return { success: true, message: `Workflow ${args.workflow_id} ativado` };

    case "deactivate_workflow":
      await deactivateWorkflow(args.workflow_id as string);
      return { success: true, message: `Workflow ${args.workflow_id} desativado` };

    case "trigger_webhook":
      return triggerWebhook(args.webhook_path as string, (args.payload as Record<string, unknown>) ?? {});

    default:
      throw new Error(`Ação desconhecida: ${action}. Ações disponíveis: list_workflows, get_workflow, find_workflow, create_workflow, activate_workflow, deactivate_workflow, trigger_webhook`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE BRIDGE — Consultas diretas ao banco de dados
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY ?? "",
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
  "Content-Type": "application/json",
};

/**
 * Lista todas as tabelas públicas do Supabase via OpenAPI schema
 */
export async function listSupabaseTables(): Promise<{ name: string; schema: string }[]> {
  // Usa o endpoint OpenAPI do Supabase que lista todas as tabelas expostas
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: supabaseHeaders,
  });

  if (!res.ok) throw new Error(`Supabase listTables error: ${res.status} ${await res.text()}`);

  const schema = await res.json() as { paths?: Record<string, unknown> };
  const paths = Object.keys(schema.paths ?? {}).filter(p => p !== "/" && !p.startsWith("/rpc/"));
  return paths.map(p => ({ name: p.replace(/^\//, ""), schema: "public" }));
}

/**
 * Consulta dados de uma tabela do Supabase com filtros opcionais
 */
export async function querySupabaseTable(
  table: string,
  options: {
    select?: string;
    limit?: number;
    filter?: string; // ex: "status=eq.active"
    order?: string;  // ex: "created_at.desc"
  } = {}
): Promise<unknown[]> {
  const params = new URLSearchParams();
  params.set("select", options.select ?? "*");
  if (options.limit) params.set("limit", String(options.limit));
  if (options.filter) {
    // Suporta múltiplos filtros separados por &
    options.filter.split("&").forEach(f => {
      const [key, val] = f.split("=");
      if (key && val) params.set(key, val);
    });
  }
  if (options.order) params.set("order", options.order);

  const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?${params.toString()}`;
  const res = await fetch(url, { headers: supabaseHeaders });
  if (!res.ok) throw new Error(`Supabase query error on '${table}': ${res.status} ${await res.text()}`);
  return res.json() as Promise<unknown[]>;
}

/**
 * Conta registros de uma tabela do Supabase
 */
export async function countSupabaseTable(table: string, filter?: string): Promise<number> {
  const params = new URLSearchParams({ select: "count" });
  if (filter) {
    filter.split("&").forEach(f => {
      const [key, val] = f.split("=");
      if (key && val) params.set(key, val);
    });
  }

  const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { ...supabaseHeaders, Prefer: "count=exact" },
  });
  if (!res.ok) throw new Error(`Supabase count error on '${table}': ${res.status} ${await res.text()}`);

  const countHeader = res.headers.get("content-range");
  if (countHeader) {
    const match = countHeader.match(/\/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  const data = await res.json() as any[];
  return data.length;
}

// Adiciona supabase actions ao dispatchAction
const _originalDispatch = dispatchAction;

/**
 * Versão estendida do dispatchAction com suporte a Supabase
 */
export async function dispatchActionExtended(action: string, args: Record<string, unknown>): Promise<unknown> {
  switch (action) {
    case "list_supabase_tables":
      return listSupabaseTables();

    case "query_supabase_table":
      return querySupabaseTable(
        args.table as string,
        {
          select: args.select as string | undefined,
          limit: args.limit as number | undefined,
          filter: args.filter as string | undefined,
          order: args.order as string | undefined,
        }
      );

    case "count_supabase_table":
      return countSupabaseTable(args.table as string, args.filter as string | undefined);

    default:
      return _originalDispatch(action, args);
  }
}
