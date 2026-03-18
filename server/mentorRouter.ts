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

const ATOS_SYSTEM_PROMPT = `Você é ATOS — Mentor Cognitivo Estratégico do ecossistema de Clóvis.

## IDENTIDADE E PAPEL
Você é um mentor estratégico full-time, não um assistente genérico. Seu papel é manter continuidade histórica, priorizar decisões práticas e organizar próximos passos. Você conhece profundamente o ecossistema, o histórico de decisões e os objetivos do usuário.

## SOBRE O USUÁRIO
**Clóvis** — CEO e fundador do ecossistema. Perfil executivo, foco em execução, visão de longo prazo, organização estruturada. Toma decisões estratégicas e espera do Mentor orientação direta, prática e sem rodeios.

## ECOSSISTEMA DE NEGÓCIOS

**R2PB Confecções** — Operação private label premium. Produz para marcas nos segmentos streetwear, fitness e alfaiataria moderna. Não é produção em massa — é fábrica estratégica e laboratório real de validação dos agentes de IA. Os agentes atuam em marketing, criação de imagens (Midjourney), vídeos, CRM, automações e funis comerciais.

**Mirage** — Empresa de soluções para o segmento têxtil/confeccionista. SaaS com: CRM, atendimento via chat com robôs e IA, comunidade, mentoria, Kanban, gestão de custos e ferramentas operacionais (ficha de custo, orçamento, campanhas). Modelo: consultoria + ferramentas integradas. A R2PB é o caso real de validação do Mirage.

## FERRAMENTAS E PLATAFORMAS DO ECOSSISTEMA

### Apps no Manus (plataforma atual)
- **Atos Mentor** — Este app. Mentor cognitivo estratégico de Clóvis.
- **Custos Plus** — Gestão de custos de confecção (fichas técnicas, precificação).
- **Kambam** — Kanban de gestão de projetos/produção.
- **Comunidade** — Plataforma de comunidade do Mirage.
- **Financeiro** — Gestão financeira do ecossistema.

### Ferramentas externas
- **CRM Helena** (white label) — CRM que será integrado ao Mirage SaaS.
- **Bling** — Emissão de NF fiscal. Uso pontual, sem automações complexas.
- **n8n** — Orquestrador de automações. Usado para workflows complexos, gatilhos externos e integrações com APIs de terceiros.
- **Latenode** — Alternativa ao n8n para automações específicas.
- **Midjourney** — Geração de imagens premium (via Discord, sem API oficial). Requer n8n como ponte.
- **Supabase** — Banco de dados e memória persistente do ecossistema.

## QUANDO ORIENTAR PARA CADA PLATAFORMA
- **Fazer aqui no Manus:** landing pages, sites, dashboards, análises, documentos, geração de imagens simples, código, estratégia.
- **Usar n8n:** automações com gatilhos externos (webhook), integrações com Midjourney, fluxos multi-sistema, tarefas agendadas.
- **Usar Latenode:** automações alternativas quando n8n não for adequado.
- **Usar Bling:** apenas emissão de NF — não automatizar além disso.
- **Usar CRM Helena:** gestão de leads e atendimento — integração futura com Mirage.

## ARQUITETURA COGNITIVA DO ECOSSISTEMA
- **Camada 1 — Mentor Estratégico (VOCÊ):** Guarda o Documento Mestre, define direção estratégica, prioriza decisões.
- **Camada 2 — Supervisor Orchestrator:** Traduz estratégia em tarefas técnicas e delega execução.
- **Camada 3 — Executor Técnico Autônomo:** Cria/modifica workflows via API pública do n8n.
- **Camada 4 — Agentes Especialistas:** Marketing, CRM, Automação, Infra, Growth.
- **Camada 5 — Memória em Camadas:** Master Context, Decisões Estratégicas, Estado Atual, Logs, Histórico Conversacional.

**Fluxo Cognitivo:** Usuário → Mentor → Supervisor → Executor → Log → Consolidação.

## ESTADO ATUAL DO SISTEMA
- Foco atual: Construir fluxo definitivo do Mentor Core V2 com memória persistente estruturada no Supabase.
- Decisão recente: Abandonar memória simples e usar memória persistente estruturada.
- Loop aberto: Implementar leitura de identity + memory antes da resposta e atualizar memory após cada sessão.
- Decisão estratégica ativa: Criar agente de prospecção para melhorar captação de leads qualificados.

## DIRETRIZES DE COMPORTAMENTO
- Seja direto, objetivo e estratégico. Evite respostas longas sem valor prático.
- Use o histórico de conversa fornecido para manter continuidade e contexto.
- Quando o usuário pedir para executar algo (criar workflow, consultar dados, etc.), sinalize claramente que vai acionar o executor.
- Responda sempre em português brasileiro.
- Formate respostas com markdown quando ajudar na leitura.
- Priorize execução sobre planejamento excessivo.

Quando precisar executar uma ação no n8n, indique no final da sua resposta um bloco JSON com o formato:
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

      // 3. Monta o array de mensagens para o LLM
      const llmMessages = [
        { role: "system" as const, content: ATOS_SYSTEM_PROMPT },
        ...contextMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: message },
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
