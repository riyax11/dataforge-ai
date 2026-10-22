import type { PlanStep, SourceProfile } from "@workspace/db";
import { logger } from "./logger";

/**
 * LLM-assisted planner.
 *
 * The model PROPOSES which steps to run and WHY, but it never decides risk.
 * Risk comes from the fixed table below, so duplicate removal and publishing
 * always need human approval no matter what the model returns.
 * If the key is missing, the call fails, or the answer breaks the rules,
 * we fall back to the original rule-based plan.
 */

const ACTION_RISK: Record<string, PlanStep["risk"]> = {
  profile_source: "safe",
  trim_text_fields: "safe",
  detect_quality_issues: "safe",
  remove_exact_duplicates: "approval_required",
  validate_output: "safe",
  publish_validated_output: "approval_required",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

export type PlanResult = { plan: PlanStep[]; usedLlm: boolean };

function buildMessages(source: SourceProfile, requirement: string) {
  // Only metadata is sent. Row values (previewRows) can hold personal data,
  // so they never leave the server.
  const columns = source.columns
    .map(
      (c) =>
        `- ${c.name} (${c.dtype}): ${c.missing} missing, ${c.unique} unique values`,
    )
    .join("\n");

  const system = [
    "You are a data engineering planner.",
    "Choose and order the steps needed for the user's requirement, using ONLY these actions:",
    "- profile_source: inspect schema, completeness and duplicates",
    "- trim_text_fields: normalize whitespace in text columns",
    "- detect_quality_issues: surface missing values and uniqueness problems",
    "- remove_exact_duplicates: remove exact duplicate rows",
    "- validate_output: verify row counts, completeness and schema",
    "- publish_validated_output: publish the validated dataset",
    "Rules: start with profile_source, include validate_output before publish_validated_output, and end with publish_validated_output.",
    "Each reason must be specific to this data, one sentence, at most 25 words.",
    'Reply with JSON only, in this shape: {"steps":[{"action":"...","reason":"..."}]}',
  ].join("\n");

  const user = [
    `Requirement: ${requirement}`,
    `File: ${source.fileName}`,
    `Rows: ${source.rowCount}`,
    `Duplicate rows: ${source.duplicateCount}`,
    `Missing cells: ${source.missingCellCount}`,
    "Columns:",
    columns,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function validatePlan(raw: unknown): PlanStep[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const steps = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(steps) || steps.length < 3 || steps.length > 8) return null;

  const seen = new Set<string>();
  const plan: PlanStep[] = [];
  for (const step of steps) {
    if (typeof step !== "object" || step === null) return null;
    const { action, reason } = step as { action?: unknown; reason?: unknown };
    if (typeof action !== "string" || typeof reason !== "string") return null;

    const risk = ACTION_RISK[action];
    if (!risk || seen.has(action)) return null;
    seen.add(action);

    // risk is taken from our table, never from the model
    plan.push({ action, risk, reason: reason.trim().slice(0, 200) });
  }

  const order = plan.map((s) => s.action);
  const validateAt = order.indexOf("validate_output");
  const publishAt = order.indexOf("publish_validated_output");
  if (order[0] !== "profile_source") return null;
  if (validateAt === -1 || publishAt === -1 || validateAt > publishAt) return null;
  if (order[order.length - 1] !== "publish_validated_output") return null;

  return plan;
}

export async function generatePlan(
  source: SourceProfile,
  requirement: string,
  fallback: PlanStep[],
): Promise<PlanResult> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) return { plan: fallback, usedLlm: false };

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env["GROQ_MODEL"] ?? DEFAULT_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: buildMessages(source, requirement),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Groq returned HTTP ${res.status}`);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty model response");

    const plan = validatePlan(JSON.parse(content));
    if (!plan) throw new Error("Model plan failed validation");

    return { plan, usedLlm: true };
  } catch (err) {
    logger.warn({ err }, "LLM planner unavailable, using rule-based plan");
    return { plan: fallback, usedLlm: false };
  }
}
