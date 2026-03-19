/**
 * Mentor Router — Atos nativo no Manus
 *
 * Fluxo por mensagem:
 * 1. Busca as últimas 20 mensagens do conversation_logs (Supabase) como contexto
 * 2. Salva a mensagem do usuário no Supabase via athos-log
 * 3. Chama o LLM nativo do Manus com system prompt + contexto + mensagem atual
 * 4. Salva a resposta do mentor no Supabase via athos-log
 * 5. Retorna a resposta ao frontend
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { fetchConversationContext, saveLog, dispatchToExecutor } from "./supabase";
import { listWorkflows, findWorkflowByName, getWorkflow } from "./athosBridge";

/**
 * Detecta intenção do usuário e busca dados do n8n antes de chamar o LLM.
 * Isso garante que o ATHOS_MENTOR sempre tenha dados reais para responder.
 */
async function resolveN8nContext(message: string): Promise<string | null> {
  const lower = message.toLowerCase();

  // Intenção: analisar/inspecionar workflow específico
  const analyzePatterns = [
    /anali[sz]/i, /inspecion/i, /ver detalhes/i, /estrutura do workflow/i,
    /como funciona/i, /o que faz/i, /detalhe/i, /examinar/i, /revisar workflow/i,
    /por que não funciona/i, /problema no workflow/i, /erro no workflow/i
  ];
  const isAnalyze = analyzePatterns.some(p => p.test(message));

  if (isAnalyze) {
    // Tenta extrair nome ou ID do workflow da mensagem
    try {
      const workflows = await listWorkflows();
      // Procura por qualquer nome de workflow mencionado na mensagem
      const matched = workflows.find(w =>
        message.toLowerCase().includes(w.name.toLowerCase()) ||
        message.includes(w.id)
      );

      if (matched) {
        // Busca o JSON completo do workflow
        const detail = await getWorkflow(matched.id);
        const nodeNames = Array.isArray(detail.nodes)
          ? (detail.nodes as any[]).map((n: any) => `  - **${n.name}** (tipo: ${n.type?.split('.')?.pop() ?? n.type})`).join("\n")
          : "Não foi possível listar os nós";
        return `[ATOS_EXECUTOR — dados reais do n8n]\nWorkflow analisado: **${detail.name}** (ID: ${detail.id})\nStatus: ${detail.active ? "ativo" : "inativo"}\n\nNós do workflow (${Array.isArray(detail.nodes) ? detail.nodes.length : 0}):\n${nodeNames}\n\nJSON completo disponível para análise aprofundada.\n\nDados brutos dos nós:\n${JSON.stringify(detail.nodes, null, 2).slice(0, 3000)}`;
      } else {
        // Nenhum workflow identificado na mensagem — lista todos para o mentor escolher
        const list = workflows.map((w) => `- **${w.name}** (ID: ${w.id}) — ${w.active ? "ativo" : "inativo"}`).join("\n");
        return `[ATOS_EXECUTOR — dados reais do n8n]\nNão identifiquei qual workflow analisar. Workflows disponíveis:\n${list}`;
      }
    } catch (err: any) {
      return `[ATOS_EXECUTOR] Erro ao analisar workflow: ${err.message}`;
    }
  }

  // Intenção: listar workflows
  if (
    lower.includes("list") ||
    lower.includes("workflows") ||
    lower.includes("fluxos") ||
    lower.includes("automações") ||
    lower.includes("quais workflow") ||
    lower.includes("ver workflow") ||
    lower.includes("mostrar workflow")
  ) {
    try {
      const workflows = await listWorkflows();
      if (workflows.length === 0) return "[ATOS_EXECUTOR] Nenhum workflow encontrado no n8n.";
      const list = workflows
        .map((w) => `- **${w.name}** (ID: ${w.id}) — ${w.active ? "ativo" : "inativo"}`)
        .join("\n");
      return `[ATOS_EXECUTOR — dados reais do n8n]\nWorkflows encontrados (${workflows.length}):\n${list}`;
    } catch (err: any) {
      return `[ATOS_EXECUTOR] Erro ao listar workflows: ${err.message}`;
    }
  }

  return null;
}

const ATOS_SYSTEM_PROMPT = `Você é ATHOS_MENTOR — Mentor Cognitivo Estratégico do ecossistema de Clóvis.

## IDENTIDADE E PAPEL
Você é um mentor estratégico full-time, não um assistente genérico. Você sabe que está dentro de um sistema em construção — conhece o que já existe, o que falta e o que precisa ser criado para o ecossistema ganhar autonomia. Seu papel é manter continuidade histórica, priorizar decisões práticas e organizar próximos passos. Seja direto, executivo e sem rodeios.

Quando uma tarefa exigir um "braço" que ainda não existe (integração, workflow, automação), você identifica isso e orienta Clóvis sobre o que precisa ser construído para o ATOS_EXECUTOR ter autonomia para executar.

## SOBRE O USUÁRIO
**Clóvis** — CEO e fundador do ecossistema. Perfil executivo, foco em execução, visão de longo prazo. Espera orientação direta e prática. Quando pedir sua opinião, dê uma recomendação clara — não liste opções sem posicionar.

---

## ECOSSISTEMA DE NEGÓCIOS

### R2PB Confecções
Operação private label premium. Produz para marcas nos segmentos streetwear, fitness e alfaiataria moderna. Fábrica estratégica e laboratório real de validação dos agentes de IA.

### Mirage
Empresa de soluções para o segmento têxtil/confeccionista. Modelo: consultoria + ferramentas SaaS integradas. A R2PB é o caso real de validação do Mirage.

---

## APPS NO MANUS (núcleo do ecossistema)
Não sugira recriar algo que já existe em outro app.

| App | O que é | Status |
|---|---|---|
| **ATHOS_MENTOR** | Mentor estratégico de Clóvis (este app) | Produção |
| **Custos Plus** | Fichas de custo e orçamentos têxteis | Produção |
| **Kambam** | Kanban de produção multi-tenant (3 empresas ativas) | Produção |
| **Comunidade** | Plataforma B2B têxtil — fornecedores, clientes, fórum | Produção |
| **Financeiro** | Gestão financeira com OFX, conciliação e dashboards | Protótipo (sem backend ainda) |

**Visão futura:** Hub central que aglutina todos os apps do Manus e integra CRM Helena e Bling em uma única interface.

---

## FERRAMENTAS EXTERNAS DO ECOSSISTEMA

| Ferramenta | Função |
|---|---|
| **ATOS_EXECUTOR (n8n)** | Executor de automações — workflows, gatilhos externos, integrações com APIs de terceiros. É o "braço executor" do ecossistema. |
| **CRM Helena** (white label) | CRM e atendimento ao cliente — parte do ecossistema Mirage |
| **Bling** | ERP externo — emissão de NF, cadastro de clientes e pedidos |
| **Supabase** | Banco de dados e memória persistente do ecossistema |

Para integrações pontuais com ferramentas externas não listadas (geração de imagens, IA especializada, etc.), avaliar a melhor opção no momento e integrar via ATOS_EXECUTOR conforme necessário.

---

## ARQUITETURA COGNITIVA DO ECOSSISTEMA
- **Camada 1 — ATHOS_MENTOR (VOCÊ):** Define direção estratégica, prioriza decisões, guarda o Documento Mestre. Sabe o que falta construir.
- **Camada 2 — Supervisor Orchestrator:** Traduz estratégia em tarefas técnicas e delega execução.
- **Camada 3 — ATOS_EXECUTOR (n8n):** Executa workflows e automações. Ganha autonomia à medida que novos "braços" (integrações) são construídos.
- **Camada 4 — Agentes Especialistas:** Marketing, CRM, Automação, Infra, Growth.
- **Camada 5 — Memória em Camadas:** Master Context, Decisões Estratégicas, Estado Atual, Logs, Histórico Conversacional (Supabase).

---

## ESTADO ATUAL DO SISTEMA
- Foco: ATHOS_MENTOR Core V2 com memória persistente no Supabase.
- Decisão estratégica ativa: criar agente de prospecção para captação de leads qualificados.
- Próximo passo crítico nos apps SaaS: integrar Stripe (Comunidade, Kambam, Custos Plus).
- Visão de longo prazo: Hub central integrando todos os apps Manus + CRM Helena + Bling.

---

## SUAS CAPACIDADES REAIS COM O ATOS_EXECUTOR — LEIA COM ATENÇÃO

VOCÊ TEM ACESSO DIRETO E FUNCIONAL À API DO N8N. Isso já está implementado e funcionando. NÃO diga que não consegue fazer algo que está na lista abaixo. NÃO oriente Clóvis a criar workflows intermediários para funções que você já executa diretamente.

Quando o usuário pedir qualquer uma das ações abaixo, o sistema já busca os dados ANTES de chegar até você. Os dados estarão disponíveis no contexto marcados como [ATOS_EXECUTOR — dados reais do n8n]. USE ESSES DADOS para responder.

| Ação | Como acionar | O que faz |
|---|---|---|
| Listar workflows | Detectado automaticamente | Retorna nome, ID e status de todos os workflows |
| Buscar workflow por nome | Detectado automaticamente | Encontra um workflow específico |
| Criar workflow | Bloco execute: create_workflow | Cria novo workflow no n8n |
| Ativar workflow | Bloco execute: activate_workflow | Ativa um workflow pelo ID |
| Desativar workflow | Bloco execute: deactivate_workflow | Desativa um workflow pelo ID |
| Acionar via webhook | Bloco execute: trigger_webhook | Dispara um workflow via webhook |

REGRA ABSOLUTA: Se o usuário pedir para listar workflows e você receber dados marcados como [ATOS_EXECUTOR — dados reais do n8n] no contexto, APRESENTE ESSES DADOS DIRETAMENTE. NÃO diga que não consegue. NÃO peça para o usuário acessar o painel do n8n. NÃO sugira criar workflows intermediários.

---

## REGRAS DE ORIENTAÇÃO ESTRATÉGICA
Quando Clóvis trouxer um projeto ou demanda:

- **Manus:** landing pages, sites, dashboards, análises, documentos, código, estratégia, novos módulos para apps existentes.
- **ATOS_EXECUTOR (n8n):** automações com gatilhos externos, integrações pontuais com APIs, fluxos multi-sistema, tarefas agendadas. Gerar JSON do workflow quando solicitado.
- **CRM Helena:** tudo relacionado a CRM e atendimento ao cliente.
- **Bling:** NF, cadastro de clientes e pedidos — não expandir além disso.
- **Braços faltando:** quando uma tarefa exigir uma integração ainda não construída, identificar e orientar o que precisa ser criado no ATOS_EXECUTOR para ganhar autonomia.
- **Nunca recriar** algo que já existe em outro app do Manus.

---

## DIRETRIZES DE COMPORTAMENTO
- Responda sempre em português brasileiro.
- Seja direto e objetivo. Evite listas longas sem valor prático.
- Use markdown para organizar respostas quando ajudar na leitura.
- Priorize execução sobre planejamento excessivo.
- Use o histórico de conversa fornecido para manter continuidade e contexto.

Quando acionar o ATOS_EXECUTOR via athos-bridge, use o bloco:
\`\`\`execute
{"action": "nome_da_acao", "args": {}, "meta": {"user": "clovis_admin"}}
\`\`\`
`;

export const mentorRouter = router({
  /**
   * Envia mensagem ao Mentor Atos e recebe resposta com contexto do Supabase.
   */
  chat: publicProcedure
    .input(
      z.object({
        message: z.string().min(1),
        userId: z.string().default("clovis_admin"),
      })
    )
    .mutation(async ({ input }) => {
      const { message, userId } = input;

      // 1. Busca contexto do Supabase (últimas 20 mensagens)
      let contextMessages: { role: string; content: string }[] = [];
      try {
        const history = await fetchConversationContext(20);
        contextMessages = history.map((log) => ({
          role: log.role === "mentor" ? "assistant" : "user",
          content: log.message,
        }));
      } catch (err) {
        console.error("[Mentor] Erro ao buscar contexto:", err);
      }

      // 2. Salva mensagem do usuário no Supabase (assíncrono, não bloqueia)
      saveLog({ role: "user", message }).catch((err) =>
        console.error("[Mentor] Erro ao salvar log do usuário:", err)
      );

      // 3. Detecta intenção e busca dados reais do n8n (se aplicável)
      const n8nContext = await resolveN8nContext(message).catch(() => null);

      // 4. Monta o array de mensagens para o LLM
      // Injeta o contexto do n8n DENTRO da mensagem do usuário para garantir que o LLM use os dados reais
      const userMessageWithContext = n8nContext
        ? `${n8nContext}\n\n---\nPergunta de Clóvis: ${message}\n\nIMPORTANTE: Use EXCLUSIVAMENTE os dados acima fornecidos pelo ATOS_EXECUTOR para responder. NÃO use conhecimento de treinamento sobre o n8n. Os dados acima são os dados REAIS e ATUAIS do sistema.`
        : message;

      const llmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system" as const, content: ATOS_SYSTEM_PROMPT },
        ...contextMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        { role: "user" as const, content: userMessageWithContext },
      ];

      // 4. Chama o LLM nativo do Manus
      let reply = "";
      try {
        const result = await invokeLLM({ messages: llmMessages });
        const rawContent = result.choices[0]?.message?.content;
        if (typeof rawContent === "string") {
          reply = rawContent;
        } else if (Array.isArray(rawContent)) {
          // Extrai texto de array de content parts (TextContent[])
          reply = rawContent
            .map((part: any) => (part?.text ?? part?.content ?? JSON.stringify(part)))
            .join("");
        } else {
          reply = JSON.stringify(rawContent);
        }
      } catch (err: any) {
        console.error("[Mentor] Erro no LLM:", err);
        reply = `❌ Erro ao processar sua mensagem: ${err.message}`;
      }

      // 5. Verifica se o Mentor quer executar uma ação no n8n
      const executeMatch = reply.match(/```execute\s*([\s\S]*?)```/);
      let executionResult: string | null = null;

      if (executeMatch) {
        try {
          const command = JSON.parse(executeMatch[1].trim());
          command.meta = { ...command.meta, user: userId };

          // Remove o bloco execute da resposta visível
          reply = reply.replace(/```execute[\s\S]*?```/g, "").trim();

          // Salva log de execução e aciona o executor
          saveLog({
            role: "executor",
            message: `Executando ação: ${command.action}`,
          }).catch(() => {});

          const execResult = await dispatchToExecutor(command);
          if (execResult.success) {
            executionResult = `\n\n✅ **Ação executada:** \`${command.action}\``;
          } else {
            executionResult = `\n\n⚠️ **Falha na execução:** ${execResult.error}`;
          }
        } catch (err: any) {
          console.error("[Mentor] Erro ao parsear comando execute:", err);
        }
      }

      // Adiciona resultado da execução à resposta
      if (executionResult) {
        reply += executionResult;
      }

      // 6. Salva resposta do mentor no Supabase (assíncrono)
      saveLog({ role: "mentor", message: reply }).catch((err) =>
        console.error("[Mentor] Erro ao salvar log do mentor:", err)
      );

      return { reply };
    }),

  /**
   * Aciona diretamente o executor n8n via athos-bridge.
   */
  execute: publicProcedure
    .input(
      z.object({
        action: z.string(),
        args: z.record(z.string(), z.unknown()).optional(),
        meta: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await dispatchToExecutor({
        action: input.action,
        args: input.args,
        meta: { ...input.meta, user: "clovis_admin" },
      });
      return result;
    }),
});
