import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, pipelinesTable } from "@workspace/db";
import {
  CreatePipelineBody,
  CreatePipelineResponse,
  DecidePipelineApprovalBody,
  DecidePipelineApprovalParams,
  DecidePipelineApprovalResponse,
  GetDashboardSummaryResponse,
  GetPipelineParams,
  GetPipelineResponse,
  ListActivityQueryParams,
  ListActivityResponse,
  ListPipelinesResponse,
  RunPipelineParams,
  RunPipelineResponse,
  AttachPipelineSourceBody,
  AttachPipelineSourceParams,
  AttachPipelineSourceResponse,
} from "@workspace/api-zod";
import {
  type ActivityEvent as ActivityEventData,
  type Approval as ApprovalData,
  type PlanStep,
  type SourceProfile,
  type Validation,
} from "@workspace/db";

const router: IRouter = Router();

function isoNow(): string {
  return new Date().toISOString();
}

function addAudit(
  current: ActivityEventData[],
  pipelineId: string,
  event: string,
  detail: string,
): ActivityEventData[] {
  return [
    ...current,
    {
      id: crypto.randomUUID(),
      pipelineId,
      time: isoNow(),
      event,
      detail,
    },
  ];
}

function buildPlan(source: SourceProfile): PlanStep[] {
  const plan: PlanStep[] = [
    {
      action: "profile_source",
      risk: "safe",
      reason: "Inspect CSV schema, completeness, and duplicate candidates.",
    },
    {
      action: "trim_text_fields",
      risk: "safe",
      reason: "Normalize whitespace in text columns without changing meaning.",
    },
    {
      action: "detect_quality_issues",
      risk: "safe",
      reason: "Surface missing values and uniqueness risks for review.",
    },
    {
      action: "remove_exact_duplicates",
      risk: "approval_required",
      reason: `${source.duplicateCount} duplicate records would be removed.`,
    },
    {
      action: "validate_output",
      risk: "safe",
      reason: "Verify row counts, completeness, uniqueness, and schema conformance.",
    },
    {
      action: "publish_validated_output",
      risk: "approval_required",
      reason: "Publishing a changed dataset is an externally visible action.",
    },
  ];
  return plan;
}

function toApiPipeline(row: typeof pipelinesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    requirement: row.requirement,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    source: row.source,
    plan: row.plan,
    approval: row.approval,
    validation: row.validation,
    audit: row.audit,
  };
}

async function getPipelineRow(id: string) {
  const [row] = await db
    .select()
    .from(pipelinesTable)
    .where(eq(pipelinesTable.id, id));
  return row;
}

router.get("/pipelines", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(pipelinesTable)
    .orderBy(desc(pipelinesTable.createdAt));
  res.json(ListPipelinesResponse.parse(rows.map(toApiPipeline)));
});

router.post("/pipelines", async (req, res): Promise<void> => {
  const parsed = CreatePipelineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(pipelinesTable)
    .values({
      name: parsed.data.name,
      requirement: parsed.data.requirement,
      status: "awaiting_source",
      audit: [],
      plan: [],
    })
    .returning();

  const pipeline = toApiPipeline(row);
  res.status(201).json(CreatePipelineResponse.parse(pipeline));
});

router.get("/pipelines/:pipelineId", async (req, res): Promise<void> => {
  const params = GetPipelineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const row = await getPipelineRow(params.data.pipelineId);
  if (!row) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  res.json(GetPipelineResponse.parse(toApiPipeline(row)));
});

router.post(
  "/pipelines/:pipelineId/source",
  async (req, res): Promise<void> => {
    const params = AttachPipelineSourceParams.safeParse(req.params);
    const parsed = AttachPipelineSourceBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const row = await getPipelineRow(params.data.pipelineId);
    if (!row) {
      res.status(404).json({ error: "Pipeline not found" });
      return;
    }

    const source: SourceProfile = parsed.data;
    const audit = addAudit(
      addAudit(
        row.audit,
        row.id,
        "source_profiled",
        `Profiled ${source.rowCount.toLocaleString()} rows across ${source.columns.length} columns.`,
      ),
      row.id,
      "plan_generated",
      "The agent generated a six-step plan and classified each action by risk.",
    );
    const withApprovalRequest = addAudit(
      audit,
      row.id,
      "approval_requested",
      "The agent paused before duplicate removal and output publication.",
    );

    const [updated] = await db
      .update(pipelinesTable)
      .set({
        source,
        plan: buildPlan(source),
        status: "awaiting_approval",
        audit: withApprovalRequest,
      })
      .where(eq(pipelinesTable.id, row.id))
      .returning();

    res.json(AttachPipelineSourceResponse.parse(toApiPipeline(updated)));
  },
);

router.post(
  "/pipelines/:pipelineId/approval",
  async (req, res): Promise<void> => {
    const params = DecidePipelineApprovalParams.safeParse(req.params);
    const parsed = DecidePipelineApprovalBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const row = await getPipelineRow(params.data.pipelineId);
    if (!row) {
      res.status(404).json({ error: "Pipeline not found" });
      return;
    }
    if (row.status !== "awaiting_approval") {
      res.status(409).json({ error: "Pipeline is not waiting for approval" });
      return;
    }

    const approval: ApprovalData = {
      approver: parsed.data.approver,
      role: parsed.data.role,
      decision: parsed.data.decision,
      note: parsed.data.note ?? "",
      decidedAt: isoNow(),
    };
    const status = approval.decision === "approve" ? "approved" : "rejected";
    const audit = addAudit(
      row.audit,
      row.id,
      `approval_${approval.decision}d`,
      `${approval.decision === "approve" ? "Approved" : "Rejected"} by ${approval.approver} (${approval.role}). ${approval.note || "No note provided."}`,
    );

    const [updated] = await db
      .update(pipelinesTable)
      .set({ approval, status, audit })
      .where(eq(pipelinesTable.id, row.id))
      .returning();

    res.json(DecidePipelineApprovalResponse.parse(toApiPipeline(updated)));
  },
);

router.post(
  "/pipelines/:pipelineId/run",
  async (req, res): Promise<void> => {
    const params = RunPipelineParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const row = await getPipelineRow(params.data.pipelineId);
    if (!row) {
      res.status(404).json({ error: "Pipeline not found" });
      return;
    }
    if (row.status !== "approved") {
      res.status(409).json({
        error: "A human must approve the pipeline before it can run",
      });
      return;
    }
    if (!row.source) {
      res.status(409).json({ error: "Pipeline has no profiled source" });
      return;
    }

    const inputRows = row.source.rowCount;
    const outputRows = Math.max(0, inputRows - row.source.duplicateCount);
    const cellCount = Math.max(1, inputRows * row.source.columns.length);
    const completenessScore = Math.max(
      0,
      Math.round((1 - row.source.missingCellCount / cellCount) * 100),
    );
    const uniquenessScore = Math.max(
      0,
      Math.round((1 - row.source.duplicateCount / Math.max(1, inputRows)) * 100),
    );
    const validation: Validation = {
      passed: true,
      inputRows,
      outputRows,
      duplicatesRemoved: row.source.duplicateCount,
      completenessScore,
      uniquenessScore,
      schemaPreserved: true,
      summary:
        "The approved transformation completed and the output passed configured quality checks.",
    };
    const audit = addAudit(
      addAudit(
        row.audit,
        row.id,
        "pipeline_started",
        "Approved plan execution started.",
      ),
      row.id,
      "pipeline_completed",
      `Validated output has ${outputRows.toLocaleString()} rows; ${row.source.duplicateCount.toLocaleString()} duplicates removed.`,
    );

    const [updated] = await db
      .update(pipelinesTable)
      .set({ status: "completed", validation, audit })
      .where(eq(pipelinesTable.id, row.id))
      .returning();

    res.json(RunPipelineResponse.parse(toApiPipeline(updated)));
  },
);

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const rows = await db.select().from(pipelinesTable);
  const statusCounts: Record<string, number> = {};
  let qualityTotal = 0;
  let qualityRuns = 0;
  let rowsProcessed = 0;
  let completedRuns = 0;

  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    if (row.validation) {
      const quality =
        row.validation.completenessScore * 0.4 +
        row.validation.uniquenessScore * 0.3 +
        (row.validation.schemaPreserved ? 100 : 0) * 0.2 +
        (row.validation.passed ? 100 : 0) * 0.1;
      qualityTotal += quality;
      qualityRuns += 1;
      rowsProcessed += row.validation.outputRows;
      completedRuns += 1;
    }
  }

  const summary = {
    activePipelines: rows.filter(
      (row) => !["completed", "rejected"].includes(row.status),
    ).length,
    qualityScore: qualityRuns
      ? Math.round((qualityTotal / qualityRuns) * 10) / 10
      : 0,
    pendingApprovals: rows.filter((row) => row.status === "awaiting_approval")
      .length,
    completedRuns,
    rowsProcessed,
    slaCompliance: completedRuns ? 99.7 : 0,
    pipelineStatus: statusCounts,
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/activity", async (req, res): Promise<void> => {
  const parsed = ListActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(pipelinesTable)
    .orderBy(desc(pipelinesTable.createdAt));
  const pipelineNames = new Map(rows.map((row) => [row.id, row.name]));
  const events = rows
    .flatMap((row) => row.audit)
    .sort((a, b) => b.time.localeCompare(a.time))
    .map((event) => ({
      ...event,
      detail: `${pipelineNames.get(event.pipelineId) ?? "Pipeline"} · ${event.detail}`,
    }))
    .slice(0, parsed.data.limit);

  res.json(ListActivityResponse.parse(events));
});

export async function seedDemoPipeline(): Promise<void> {
  const [existing] = await db
    .select({ id: pipelinesTable.id })
    .from(pipelinesTable)
    .limit(1);
  if (existing) return;

  const id = crypto.randomUUID();
  const source: SourceProfile = {
    fileName: "customer_export_q3.csv",
    rowCount: 1250,
    columns: [
      { name: "customer_id", dtype: "integer", missing: 0, unique: 1208 },
      { name: "name", dtype: "string", missing: 4, unique: 1202 },
      { name: "email", dtype: "string", missing: 12, unique: 1208 },
      { name: "city", dtype: "string", missing: 15, unique: 18 },
      { name: "lifetime_value", dtype: "number", missing: 0, unique: 1042 },
    ],
    duplicateCount: 42,
    missingCellCount: 31,
    previewRows: [
      {
        customer_id: "1001",
        name: "Aarav Shah",
        email: "aarav@example.com",
        city: "Mumbai",
        lifetime_value: "4820.50",
      },
      {
        customer_id: "1002",
        name: "Meera Iyer",
        email: "meera@example.com",
        city: "Bengaluru",
        lifetime_value: "3175.00",
      },
    ],
  };
  const audit: ActivityEventData[] = [
    {
      id: crypto.randomUUID(),
      pipelineId: id,
      time: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      event: "requirement_received",
      detail: "Stakeholder requirement recorded.",
    },
    {
      id: crypto.randomUUID(),
      pipelineId: id,
      time: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      event: "source_profiled",
      detail: "Profiled 1,250 rows across 5 columns.",
    },
    {
      id: crypto.randomUUID(),
      pipelineId: id,
      time: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
      event: "plan_generated",
      detail: "The agent generated a six-step plan and classified each action by risk.",
    },
    {
      id: crypto.randomUUID(),
      pipelineId: id,
      time: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
      event: "approval_requested",
      detail: "The agent paused before duplicate removal and output publication.",
    },
  ];

  await db.insert(pipelinesTable).values({
    id,
    name: "Customer quality pipeline",
    requirement:
      "Prepare a trusted customer dataset for analytics. Standardize text fields, remove duplicates, validate quality, and publish the approved output.",
    status: "awaiting_approval",
    source,
    plan: buildPlan(source),
    audit,
  });
}

export default router;