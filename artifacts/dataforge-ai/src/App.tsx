import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import {
  getGetPipelineQueryKey,
  getGetDashboardSummaryQueryKey,
  getListActivityQueryKey,
  getListPipelinesQueryKey,
  getHealthCheckQueryKey,
  useAttachPipelineSource,
  useCreatePipeline,
  useDecidePipelineApproval,
  useGetDashboardSummary,
  useGetPipeline,
  useHealthCheck,
  useListActivity,
  useListPipelines,
  useRunPipeline,
} from '@workspace/api-client-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleDot,
  ClipboardCheck,
  Clock3,
  Database,
  Download,
  FileArchive,
  FileCheck2,
  FilePlus2,
  Gauge,
  GitBranch,
  History,
  Info,
  Layers3,
  LockKeyhole,
  Menu,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Upload,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

type IconType = typeof Activity;

const navItems: { href: string; label: string; icon: IconType; hint: string }[] = [
  { href: '/', label: 'Overview', icon: Gauge, hint: 'Live control room' },
  { href: '/studio', label: 'Pipeline studio', icon: Sparkles, hint: 'Design and run' },
  { href: '/quality', label: 'Quality', icon: ClipboardCheck, hint: 'Profile and validate' },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck, hint: 'Human decisions' },
  { href: '/monitoring', label: 'Monitoring', icon: Activity, hint: 'Runs and health' },
  { href: '/audit', label: 'Audit trail', icon: History, hint: 'Immutable record' },
  { href: '/comparison', label: 'Project contribution', icon: Info, hint: 'Viva framing' },
];

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat('en-IN').format(value ?? 0);
}

function formatDate(value?: string) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'error' in error && typeof error.error === 'string') return error.error;
  return fallback;
}

function parseCsvText(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function downloadSourcePreview(source: any) {
  if (!source?.previewRows?.length) return;
  const headers = Object.keys(source.previewRows[0]);
  const csv = [
    headers.join(','),
    ...source.previewRows.map((row: Record<string, string>) =>
      headers
        .map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`)
        .join(','),
    ),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${source.fileName?.replace(/\.csv$/i, '') ?? 'dataforge'}-profile-preview.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printAuditReport(item: any, trail: any[]) {
  if (!item) return;
  const popup = window.open('', '_blank', 'width=980,height=760');
  if (!popup) return;
  const source = item.source;
  const headers = source?.previewRows?.[0] ? Object.keys(source.previewRows[0]) : [];
  const previewTable = source?.previewRows?.length
    ? `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${source.previewRows.map((row: Record<string, string>) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p>No CSV preview rows were attached.</p>';
  popup.document.write(`<!doctype html><html><head><title>DataForge AI - ${escapeHtml(item.name)}</title><style>
    body{font-family:Arial,sans-serif;color:#17233c;margin:0;background:#eef3f8}
    main{max-width:920px;margin:28px auto;background:#fff;padding:36px;box-shadow:0 4px 18px #0002}
    h1{margin:0;color:#102950}h2{margin:28px 0 10px;color:#102950;font-size:18px}
    p{color:#64748b;line-height:1.5}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}
    .meta div{background:#eef8f8;padding:12px;border-radius:6px;font-size:11px;color:#60728b}.meta b{display:block;color:#17233c;font-size:14px;margin-top:5px}
    table{width:100%;border-collapse:collapse;font-size:12px}th{background:#102950;color:white;text-align:left;padding:9px}td{padding:9px;border-bottom:1px solid #dce5f0}
    .pass{color:#087f5b;font-weight:bold}.footer{margin-top:30px;padding-top:12px;border-top:1px solid #dce5f0;color:#64748b;font-size:11px}
    @media print{body{background:#fff}main{margin:0;box-shadow:none}}
  </style></head><body><main>
    <h1>DataForge AI</h1><p>Agentic Data Engineer · Governed pipeline report</p>
    <div class="meta"><div>PIPELINE<b>${escapeHtml(item.name)}</b></div><div>STATUS<b>${escapeHtml(item.status)}</b></div><div>SOURCE<b>${escapeHtml(source?.fileName ?? 'Not attached')}</b></div></div>
    <h2>Requirement</h2><p>${escapeHtml(item.requirement)}</p>
    <h2>Source profile</h2><p>${escapeHtml(source?.rowCount ?? 0)} rows · ${escapeHtml(source?.columns?.length ?? 0)} columns · ${escapeHtml(source?.duplicateCount ?? 0)} duplicate candidates · ${escapeHtml(source?.missingCellCount ?? 0)} missing cells</p>${previewTable}
    <h2>Approval record</h2><table><tr><th>Reviewer</th><th>Role</th><th>Decision</th><th>Note</th></tr><tr><td>${escapeHtml(item.approval?.approver ?? 'Pending')}</td><td>${escapeHtml(item.approval?.role ?? 'Not assigned')}</td><td class="pass">${escapeHtml(item.approval?.decision ?? 'Pending')}</td><td>${escapeHtml(item.approval?.note ?? '')}</td></tr></table>
    <h2>Validation outcome</h2><table><tr><th>Check</th><th>Result</th></tr><tr><td>Quality validation</td><td class="pass">${escapeHtml(item.validation?.summary ?? 'Pending pipeline run')}</td></tr><tr><td>Rows</td><td>${escapeHtml(item.validation ? `${item.validation.inputRows} → ${item.validation.outputRows}` : 'Pending')}</td></tr></table>
    <h2>Audit events</h2><table><tr><th>Time</th><th>Event</th><th>Detail</th></tr>${trail.map((event: any) => `<tr><td>${escapeHtml(formatDate(event.time))}</td><td>${escapeHtml(event.event)}</td><td>${escapeHtml(event.detail)}</td></tr>`).join('')}</table>
    <div class="footer">Generated by DataForge AI. Use the browser print dialog and choose “Save as PDF”.</div>
  </main></body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

function titleForRoute(path: string) {
  return navItems.find((item) => item.href === path)?.label ?? 'Workspace';
}

function StatusBadge({ status }: { status?: string | null }) {
  const labels: Record<string, string> = {
    awaiting_source: 'Awaiting source',
    awaiting_approval: 'Awaiting approval',
    approved: 'Approved',
    rejected: 'Rejected',
    completed: 'Completed',
  };
  const tone = status === 'completed' || status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : status === 'awaiting_approval' ? 'warn' : 'neutral';
  return <span data-testid={`status-${status ?? 'unknown'}`} className={`status-badge status-${tone}`}><span className="status-dot" />{labels[status ?? ''] ?? 'Draft'}</span>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state" data-testid="empty-state"><div className="empty-icon"><Layers3 size={21} /></div><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

function ErrorState({ retry }: { retry: () => void }) {
  return <div className="empty-state error-state" data-testid="error-state"><div className="empty-icon"><CircleAlert size={21} /></div><h3>Control room is offline</h3><p>We could not reach the orchestration service. Your workspace is safe; try the connection again.</p><button className="button button-secondary" onClick={retry} data-testid="button-retry"><RefreshCw size={15} /> Retry connection</button></div>;
}

function PageHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <header className="page-header animate-rise-in"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{detail}</p></div>{action}</header>;
}

function MetricCard({ label, value, detail, icon: Icon, accent = 'teal' }: { label: string; value: string; detail: string; icon: IconType; accent?: 'teal' | 'amber' | 'blue' }) {
  return <article className={`metric-card metric-${accent} animate-rise-in`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-icon"><Icon size={17} /></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></article>;
}

function Panel({ children, className = '', title, detail, action }: { children: ReactNode; className?: string; title?: string; detail?: string; action?: ReactNode }) {
  return <section className={`panel ${className}`}><div className="panel-body">{title && <div className="panel-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>}{children}</div></section>;
}

type WorkspaceValue = {
  pipelines: any[];
  selectedId: string;
  selectedPipeline: any;
  selectPipeline: (id: string) => void;
  pipelinesLoading: boolean;
  pipelinesError: boolean;
  refetchPipelines: () => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const useWorkspace = () => {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Workspace context unavailable');
  return value;
};

function WorkspaceShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { data: pipelineData, isLoading: pipelinesLoading, isError: pipelinesError, refetch: refetchPipelines } = useListPipelines();
  const { data: health } = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000, staleTime: 15000 } });
  const { data: notifications } = useListActivity({ limit: 8 });
  const pipelines = pipelineData ?? [];
  const [selectedId, setSelectedId] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    if (!selectedId && pipelines[0]?.id) setSelectedId(pipelines[0].id);
    if (selectedId && pipelines.length && !pipelines.some((pipeline: any) => pipeline.id === selectedId)) setSelectedId(pipelines[0]?.id ?? '');
  }, [pipelines, selectedId]);
  const selectedPipeline = pipelines.find((pipeline: any) => pipeline.id === selectedId) ?? pipelines[0];
  const selectPipeline = (id: string) => setSelectedId(id);
  return <WorkspaceContext.Provider value={{ pipelines, selectedId: selectedPipeline?.id ?? selectedId, selectedPipeline, selectPipeline, pipelinesLoading, pipelinesError, refetchPipelines }}>
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark"><GitBranch size={18} /></div><div><strong>DataForge</strong><span>AI CONTROL ROOM</span></div></div>
         <div className="workspace-switcher"><span className="mini-label">WORKSPACE</span><div className="workspace-name"><span className="online-pip" />Team workspace / governed</div></div>
         <nav className="main-nav" aria-label="Main navigation">{navItems.map(({ href, label, icon: Icon, hint }) => <Link key={href} href={href} className={`nav-item ${location === href ? 'nav-active' : ''}`} onClick={() => setMobileNavOpen(false)} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} /><span><strong>{label}</strong><small>{hint}</small></span>{label === 'Approvals' && pipelines.filter((pipeline: any) => pipeline.status === 'awaiting_approval').length > 0 && <span className="nav-count">{pipelines.filter((pipeline: any) => pipeline.status === 'awaiting_approval').length}</span>}</Link>)}</nav>
         <div className="sidebar-bottom"><div className="health-line"><span className={`online-pip ${health?.status === 'ok' ? '' : 'health-unknown'}`} />API {health?.status === 'ok' ? 'operational' : 'checking'}</div><div className="student-card"><div className="avatar">DT</div><div><strong>DataForge Team</strong><span>Shared project workspace</span></div><ChevronRight size={14} /></div></div>
      </aside>
      {mobileNavOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} data-testid="button-close-navigation" />}
      <main className="main-content">
         <div className="topbar"><button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={20} /></button><div className="breadcrumb"><span>DataForge</span><ChevronRight size={13} /><strong>{titleForRoute(location)}</strong></div><div className="topbar-actions"><span className="last-sync"><span className="online-pip" />Live sync</span><div className="notification-wrap"><button className={`icon-button ${notificationsOpen ? 'icon-button-active' : ''}`} onClick={() => setNotificationsOpen((open) => !open)} aria-label="Notifications" aria-expanded={notificationsOpen} data-testid="button-notifications"><Bell size={17} />{notifications?.length ? <span className="notification-dot" /> : null}</button>{notificationsOpen && <div className="notification-popover" role="status" data-testid="panel-notifications"><div className="notification-head"><strong>Recent activity</strong><span>{notifications?.length ?? 0} events</span></div>{notifications?.length ? notifications.slice(0, 4).map((event: any) => <div className="notification-item" key={event.id}><span className="notification-mark" /><div><strong>{event.event}</strong><span>{event.detail}</span></div></div>) : <p className="notification-empty">No new workspace activity.</p>}<Link href="/audit" className="notification-link" onClick={() => setNotificationsOpen(false)} data-testid="link-notification-audit">Open audit trail <ArrowRight size={13} /></Link></div>}</div><div className="top-avatar" aria-label="DataForge Team">DT</div></div></div>
         <div className="page-wrap">{pipelinesError && <div className="workspace-alert" role="status" data-testid="status-pipelines-error"><CircleAlert size={15} /><span>Pipeline inventory is unavailable. Existing views remain readable while we reconnect.</span><button className="text-link" onClick={() => refetchPipelines()} data-testid="button-retry-pipelines">Retry</button></div>}{children}</div>
      </main>
    </div>
  </WorkspaceContext.Provider>;
}

function Overview() {
  const { pipelines, selectedPipeline, selectPipeline } = useWorkspace();
  const { data: summary, isLoading, isError, refetch } = useGetDashboardSummary();
  const { data: activity, isLoading: activityLoading } = useListActivity({ limit: 8 });
  if (isError) return <ErrorState retry={refetch} />;
  const statusCounts = summary?.pipelineStatus ?? {};
  return <div className="page-stack">
    <PageHeader eyebrow="LIVE CONTROL ROOM / 09:42 IST" title="Good morning, team." detail="Your governed data workspace is holding steady. One human decision is waiting for you." action={<Link href="/studio" className="button button-primary" data-testid="link-new-pipeline"><FilePlus2 size={16} /> New pipeline</Link>} />
    <div className="metric-grid">{isLoading ? [1, 2, 3, 4].map((item) => <Skeleton key={item} className="metric-card" />) : <><MetricCard label="Active pipelines" value={formatNumber(summary?.activePipelines)} detail={`${formatNumber(statusCounts.awaiting_approval ?? 0)} in review`} icon={GitBranch} /><MetricCard label="Quality score" value={`${summary?.qualityScore ?? 0}%`} detail="Across latest validations" icon={ClipboardCheck} accent="blue" /><MetricCard label="Pending approvals" value={formatNumber(summary?.pendingApprovals)} detail="High-impact action" icon={ShieldCheck} accent="amber" /><MetricCard label="Rows processed" value={formatNumber(summary?.rowsProcessed)} detail={`${summary?.slaCompliance ?? 0}% SLA compliance`} icon={BarChart3} /></>}</div>
    <div className="dashboard-grid">
      <Panel title="Pipeline state" detail="Every stage, one glance" className="pipeline-state-panel" action={<Link href="/monitoring" className="text-link" data-testid="link-view-monitoring">Open monitoring <ArrowRight size={14} /></Link>}>
        {pipelines.length === 0 ? <EmptyState title="No pipelines yet" detail="Start with a business requirement and let the studio draft the plan." action={<Link href="/studio" className="button button-secondary" data-testid="link-create-first-pipeline">Create first pipeline</Link>} /> : <div className="pipeline-list">{pipelines.slice(0, 5).map((pipeline: any, index: number) => <button key={pipeline.id} className={`pipeline-row ${selectedPipeline?.id === pipeline.id ? 'pipeline-selected' : ''}`} onClick={() => selectPipeline(pipeline.id)} data-testid={`button-select-pipeline-${pipeline.id}`}><div className="pipeline-index">{String(index + 1).padStart(2, '0')}</div><div className="pipeline-info"><strong>{pipeline.name}</strong><span>{pipeline.source?.fileName ?? 'Source not attached'} · {formatDate(pipeline.createdAt)}</span></div><StatusBadge status={pipeline.status} /><ChevronRight size={15} className="row-arrow" /></button>)}</div>}
      </Panel>
      <Panel title="Next human decision" detail="Governance queue" className="decision-panel">
        {selectedPipeline?.status === 'awaiting_approval' ? <><div className="decision-kicker"><span className="signal signal-amber" />HIGH-IMPACT TRANSFORMATION</div><h3>{selectedPipeline.plan?.find((step: any) => step.risk === 'approval_required')?.action ?? 'Review the proposed transformation'}</h3><p>{selectedPipeline.plan?.find((step: any) => step.risk === 'approval_required')?.reason ?? selectedPipeline.requirement}</p><div className="decision-meta"><span><LockKeyhole size={14} /> Approval gate</span><span><Clock3 size={14} /> Waiting on you</span></div><Link href="/approvals" className="button button-dark" data-testid="link-review-decision">Review decision <ArrowRight size={15} /></Link></> : <><div className="decision-kicker"><span className="signal signal-teal" />WORKSPACE READY</div><h3>{selectedPipeline ? 'No blocked decisions right now' : 'Your first decision starts here'}</h3><p>{selectedPipeline ? 'Create a pipeline or inspect the latest run in monitoring.' : 'Translate a requirement into a traceable, reviewable plan.'}</p><Link href="/studio" className="button button-dark" data-testid="link-open-studio">Open pipeline studio <ArrowRight size={15} /></Link></>}
      </Panel>
    </div>
    <Panel title="Agent activity" detail="Recent events across the workspace" action={<Link href="/audit" className="text-link" data-testid="link-view-audit">Full audit trail <ArrowRight size={14} /></Link>}>
      {activityLoading ? <div className="activity-list"><Skeleton className="activity-row" /><Skeleton className="activity-row" /><Skeleton className="activity-row" /></div> : activity?.length ? <ActivityList events={activity} compact /> : <EmptyState title="No activity recorded" detail="Agent events will appear as soon as you create a pipeline." />}
    </Panel>
  </div>;
}

function ActivityList({ events, compact = false }: { events: any[]; compact?: boolean }) {
  return <div className="activity-list" data-testid="activity-list">{events.map((event: any) => <div className="activity-row" key={event.id} data-testid={`activity-${event.id}`}><div className={`activity-icon ${event.event?.toLowerCase().includes('error') ? 'activity-danger' : event.event?.toLowerCase().includes('approval') ? 'activity-amber' : ''}`}><CircleDot size={14} /></div><div className="activity-copy"><strong>{event.event}</strong><span>{event.detail}</span></div><time>{formatDate(event.time)}</time>{!compact && <span className="mono-id">{event.pipelineId}</span>}</div>)}</div>;
}

function Studio() {
  const { pipelines, selectedId, selectedPipeline, selectPipeline } = useWorkspace();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [requirement, setRequirement] = useState('');
  const [fileName, setFileName] = useState('');
  const [sourceInput, setSourceInput] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const create = useCreatePipeline();
  const attach = useAttachPipelineSource();
  const run = useRunPipeline();
  const { data: detailPipeline } = useGetPipeline(selectedId ?? '', { query: { enabled: Boolean(selectedId), queryKey: getGetPipelineQueryKey(selectedId ?? '') } });
  const pipeline = detailPipeline ?? selectedPipeline;
  const visibleSource = sourceInput ?? pipeline?.source;
  const parseCsv = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const rows = parseCsvText(text);
    const headers = rows[0] ?? [];
    const body = rows.slice(1);
    if (headers.length === 0 || body.length === 0) {
      setSourceInput(null);
      setNotice('That CSV does not contain a header row and at least one data row.');
      return;
    }
    const objects = body.map((row) => Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, row[index] ?? ''])));
    const columns = headers.map((header, index) => {
      const values = body.map((row) => row[index] ?? '');
      const nonEmpty = values.filter(Boolean);
      const numeric = nonEmpty.length > 0 && nonEmpty.every((value) => !Number.isNaN(Number(value)));
      return { name: header || `column_${index + 1}`, dtype: numeric ? 'number' : 'string', missing: values.filter((value) => !value).length, unique: new Set(nonEmpty).size };
    });
    const duplicateCount = body.length - new Set(body.map((row) => row.join('|'))).size;
    setSourceInput({ fileName: file.name, rowCount: body.length, columns, duplicateCount, missingCellCount: columns.reduce((sum, column) => sum + column.missing, 0), previewRows: objects.slice(0, 5) });
    setNotice(`${file.name} profiled locally. Ready to attach.`);
  };
  const createDraft = () => {
    if (name.trim().length < 3 || requirement.trim().length < 10) { setNotice('Add a pipeline name and a requirement of at least 10 characters.'); return; }
    create.mutate({ data: { name: name.trim(), requirement: requirement.trim() } }, { onSuccess: (created: any) => { queryClient.invalidateQueries({ queryKey: getListPipelinesQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getListActivityQueryKey({ limit: 8 }) }); selectPipeline(created.id); setName(''); setRequirement(''); setNotice('Draft created. Attach a CSV profile to generate its plan.'); }, onError: (error) => setNotice(readableError(error, 'Could not create the pipeline draft. Try again.')) });
  };
  const attachSource = () => {
    if (!pipeline?.id || !sourceInput) return;
    attach.mutate({ pipelineId: pipeline.id, data: sourceInput }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPipelinesQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetPipelineQueryKey(pipeline.id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getListActivityQueryKey({ limit: 8 }) }); setNotice('Source attached. The agent plan is ready for review.'); }, onError: (error) => setNotice(readableError(error, 'Could not attach this source profile. Try again.')) });
  };
  const runPipeline = () => {
    if (!pipeline?.id) return;
    run.mutate({ pipelineId: pipeline.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPipelinesQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetPipelineQueryKey(pipeline.id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getListActivityQueryKey({ limit: 8 }) }); setNotice('Run queued. Follow progress in monitoring.'); }, onError: (error) => setNotice(readableError(error, 'Could not queue this run. Confirm the pipeline is approved.')) });
  };
  return <div className="page-stack">
    <PageHeader eyebrow="PIPELINE STUDIO / GOVERNED BUILD" title="Turn intent into a runbook." detail="Start with plain language. DataForge will make every assumption visible before anything changes data." />
    <div className="studio-layout">
      <div className="studio-main">
        <Panel title="01 · Business requirement" detail="Give the agent a crisp outcome, not a technical recipe.">
          <div className="form-grid"><label className="field"><span>Pipeline name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Retail demand clean-up" data-testid="input-pipeline-name" /></label><label className="field"><span>What should this pipeline achieve?</span><textarea value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="Prepare last-mile delivery data for weekly operations reporting. Preserve the schema, remove exact duplicates, and flag incomplete addresses for review." rows={5} data-testid="input-pipeline-requirement" /></label><button className="button button-primary field-submit" onClick={createDraft} disabled={create.isPending} data-testid="button-create-pipeline">{create.isPending ? 'Creating draft…' : 'Create governed draft'} <ArrowRight size={15} /></button></div>
        </Panel>
        <Panel title="02 · Source profile" detail="CSV parsing happens in your browser. Only the compact profile is sent to the API." action={<span className="privacy-chip"><LockKeyhole size={13} /> Profile only</span>}>
          <label className="upload-zone" data-testid="input-csv-file"><input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseCsv(file); }} /><div className="upload-icon"><Upload size={19} /></div><strong>{fileName || 'Choose a CSV file'}</strong><span>{fileName ? 'Select a different file to replace the profile' : 'Up to 5 preview rows · no raw file upload'}</span></label>
          {sourceInput && <div className="source-summary"><div><span className="mini-label">PROFILED FILE</span><strong>{sourceInput.fileName}</strong></div><div><span className="mini-label">ROWS</span><strong>{formatNumber(sourceInput.rowCount)}</strong></div><div><span className="mini-label">COLUMNS</span><strong>{sourceInput.columns.length}</strong></div><div><span className="mini-label">MISSING CELLS</span><strong>{formatNumber(sourceInput.missingCellCount)}</strong></div><button className="button button-secondary" onClick={attachSource} disabled={!pipeline?.id || attach.isPending} data-testid="button-attach-source">{attach.isPending ? 'Attaching…' : 'Attach profile'} <FileCheck2 size={15} /></button></div>}
          {visibleSource?.previewRows?.length ? <div className="source-preview"><div className="source-preview-head"><div><span className="mini-label">SOURCE PREVIEW</span><strong>{visibleSource.fileName} · first {visibleSource.previewRows.length} rows</strong></div><button className="button button-secondary" onClick={() => downloadSourcePreview(visibleSource)} data-testid="button-download-source-preview"><Download size={14} /> Download preview CSV</button></div><div className="table-wrap"><table className="data-table"><thead><tr>{Object.keys(visibleSource.previewRows[0]).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{visibleSource.previewRows.map((row: Record<string, string>, index: number) => <tr key={index}>{Object.keys(visibleSource.previewRows[0]).map((header) => <td key={header}>{row[header] || '—'}</td>)}</tr>)}</tbody></table></div></div> : null}
          {!pipeline?.id && <p className="inline-note"><Info size={14} /> Create a draft first so the profile can be attached to a pipeline.</p>}
        </Panel>
        {pipeline?.plan?.length ? <Panel title="03 · Explainable plan" detail={`${pipeline.plan.length} proposed steps · one approval gate`} action={<StatusBadge status={pipeline.status} />}><div className="plan-list">{pipeline.plan.map((step: any, index: number) => <div className="plan-step" key={`${step.action}-${index}`}><div className="step-number">{String(index + 1).padStart(2, '0')}</div><div className="step-body"><strong>{step.action}</strong><p>{step.reason}</p></div><span className={`risk-chip risk-${step.risk === 'approval_required' ? 'approval' : 'safe'}`}>{step.risk === 'approval_required' ? <LockKeyhole size={12} /> : <Check size={12} />}{step.risk === 'approval_required' ? 'Approval required' : 'Safe'}</span></div>)}</div><div className="plan-footer"><span><ShieldCheck size={15} /> The agent cannot cross the approval gate without a human decision.</span>{pipeline.status === 'approved' && <button className="button button-primary" onClick={runPipeline} disabled={run.isPending} data-testid="button-run-pipeline">{run.isPending ? 'Queueing…' : 'Run approved pipeline'} <Play size={14} /></button>}{pipeline.status === 'awaiting_approval' && <Link href="/approvals" className="button button-dark" data-testid="link-approve-plan">Review approval <ArrowRight size={15} /></Link>}</div></Panel> : <Panel title="03 · Explainable plan" detail="Attach a source to generate a plan"><div className="plan-placeholder"><Sparkles size={20} /><p>Once a source profile is attached, the agent will show its proposed transformations and the reasoning behind each one.</p></div></Panel>}
      </div>
      <aside className="studio-rail"><div className="rail-label">ACTIVE DRAFT</div><div className="rail-pipeline">{pipeline ? <><div className="rail-pipeline-top"><div className="pipeline-glyph"><Database size={18} /></div><StatusBadge status={pipeline.status} /></div><h3>{pipeline.name}</h3><p>{pipeline.requirement}</p><div className="rail-divider" /><div className="rail-stat"><span>Created</span><strong>{formatDate(pipeline.createdAt)}</strong></div><div className="rail-stat"><span>Source</span><strong>{pipeline.source?.fileName ?? 'Not attached'}</strong></div><div className="rail-stat"><span>Approval</span><strong>{pipeline.approval?.decision ?? 'Pending'}</strong></div></> : <EmptyState title="No active draft" detail="Create a pipeline to pin it here." />}</div><div className="rail-callout"><Zap size={16} /><div><strong>Governed autonomy</strong><p>Safe actions proceed. High-impact changes pause for your review.</p></div></div><div className="rail-label rail-label-spaced">OTHER PIPELINES</div><div className="rail-pipeline-list">{pipelines.filter((item: any) => item.id !== pipeline?.id).slice(0, 4).map((item: any) => <button key={item.id} onClick={() => selectPipeline(item.id)} data-testid={`button-switch-pipeline-${item.id}`}><span>{item.name}</span><StatusBadge status={item.status} /></button>)}</div></aside>
    </div>
    {notice && <div className="action-notice" data-testid="status-studio-notice"><CheckCircle2 size={15} /> {notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice" data-testid="button-dismiss-notice"><X size={14} /></button></div>}
  </div>;
}

function Quality() {
  const { selectedId, selectedPipeline } = useWorkspace();
  const { data: pipeline, isLoading } = useGetPipeline(selectedId ?? '', { query: { enabled: Boolean(selectedId), queryKey: getGetPipelineQueryKey(selectedId ?? '') } });
  const item = pipeline ?? selectedPipeline;
  const source = item?.source;
  const validation = item?.validation;
  return <div className="page-stack"><PageHeader eyebrow="QUALITY / SOURCE INTELLIGENCE" title="Know what the data is saying." detail="Profile signals before transformations, then compare the output against the contract." action={<span className="selection-chip"><span className="online-pip" />{item?.name ?? 'No pipeline selected'}</span>} />{isLoading ? <div className="metric-grid"><Skeleton className="metric-card" /><Skeleton className="metric-card" /><Skeleton className="metric-card" /><Skeleton className="metric-card" /></div> : !item ? <EmptyState title="Select a pipeline" detail="Create a pipeline in Studio to inspect its source quality." /> : <><div className="metric-grid"><MetricCard label="Completeness" value={`${validation?.completenessScore ?? (source ? Math.max(0, 100 - (source.missingCellCount / Math.max(1, source.rowCount * source.columns.length)) * 100) : 0).toFixed(1)}%`} detail="Non-empty cells" icon={CheckCircle2} /><MetricCard label="Uniqueness" value={`${validation?.uniquenessScore ?? (source ? Math.max(0, 100 - (source.duplicateCount / Math.max(1, source.rowCount)) * 100) : 0).toFixed(1)}%`} detail="Distinct row signal" icon={Layers3} accent="blue" /><MetricCard label="Duplicate rows" value={formatNumber(validation?.duplicatesRemoved ?? source?.duplicateCount)} detail="Removed or detected" icon={Table2} accent="amber" /><MetricCard label="Schema preserved" value={validation?.schemaPreserved === false ? 'No' : 'Yes'} detail={`${source?.columns?.length ?? 0} columns profiled`} icon={FileCheck2} /></div><div className="two-col-grid"><Panel title="Column profile" detail={`${source?.fileName ?? 'No source'} · ${formatNumber(source?.rowCount)} rows`}><div className="table-wrap"><table className="data-table"><thead><tr><th>Column</th><th>Type</th><th>Missing</th><th>Unique</th><th>Signal</th></tr></thead><tbody>{source?.columns?.map((column: any) => <tr key={column.name}><td><strong>{column.name}</strong></td><td><span className="type-pill">{column.dtype}</span></td><td className={column.missing ? 'cell-warn' : ''}>{formatNumber(column.missing)}</td><td>{formatNumber(column.unique)}</td><td><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, (column.unique / Math.max(1, source.rowCount)) * 100)}%` }} /></div></td></tr>)}</tbody></table></div>{!source && <EmptyState title="Source profile pending" detail="Attach a CSV from Pipeline Studio to see column-level signals." />}</Panel><Panel title="Validation outcome" detail="Latest contract check">{validation ? <div className={`validation-card ${validation.passed ? 'validation-pass' : 'validation-fail'}`}><div className="validation-icon">{validation.passed ? <CheckCircle2 size={22} /> : <XCircle size={22} />}</div><div><strong>{validation.passed ? 'Validation passed' : 'Validation needs attention'}</strong><p>{validation.summary}</p></div></div> : <EmptyState title="No run to validate" detail="Run an approved pipeline to generate an output validation report." />}</Panel></div>{source?.previewRows?.length ? <Panel title="CSV preview" detail={`${source.fileName} · compact profile preview, not the raw file`} action={<button className="button button-secondary" onClick={() => downloadSourcePreview(source)} data-testid="button-quality-download-preview"><Download size={14} /> Download preview CSV</button>}><div className="table-wrap"><table className="data-table"><thead><tr>{Object.keys(source.previewRows[0]).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{source.previewRows.map((row: Record<string, string>, index: number) => <tr key={index}>{Object.keys(source.previewRows[0]).map((header) => <td key={header}>{row[header] || '—'}</td>)}</tr>)}</tbody></table></div></Panel> : null}</>}</div>;
}

function Approvals() {
  const { selectedId, selectedPipeline } = useWorkspace();
  const queryClient = useQueryClient();
  const { data: pipeline } = useGetPipeline(selectedId ?? '', { query: { enabled: Boolean(selectedId), queryKey: getGetPipelineQueryKey(selectedId ?? '') } });
  const item = pipeline ?? selectedPipeline;
  const [approver, setApprover] = useState('DataForge Team');
  const [role, setRole] = useState('Data owner');
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState('');
  const decide = useDecidePipelineApproval();
  const highImpact = item?.plan?.find((step: any) => step.risk === 'approval_required');
  const submit = (decision: 'approve' | 'reject') => {
    if (!item?.id || approver.trim().length < 2 || role.trim().length < 2) { setFeedback('Add a reviewer name and role before recording a decision.'); return; }
    const trimmedApprover = approver.trim();
    const trimmedRole = role.trim();
    const trimmedNote = note.trim();
    decide.mutate(
      { pipelineId: item.id, data: { approver: trimmedApprover, role: trimmedRole, decision, note: trimmedNote } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPipelinesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPipelineQueryKey(item.id) });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListActivityQueryKey({ limit: 8 }) });

          setFeedback(`Decision recorded: ${decision === 'approve' ? 'approved.' : 'rejected.'}`);
        },
        onError: (error) => setFeedback(readableError(error, 'The decision could not be recorded. Refresh and try again.')),
      },
    );
  };
  return <div className="page-stack">
    <PageHeader eyebrow="APPROVALS / HUMAN-IN-THE-LOOP" title="Put a name behind the decision." detail="Each pipeline has its own approval record. Only high-impact transformations pause here, and each note becomes part of that pipeline’s audit trail." />
    {!item ? <EmptyState title="Nothing is waiting" detail="Create and profile a pipeline to see its approval gate here." action={<Link href="/studio" className="button button-secondary" data-testid="link-approval-studio">Open studio</Link>} /> : <div className="approval-layout">
      <div className="approval-main">
        <div className="approval-banner"><div className="approval-banner-icon"><LockKeyhole size={21} /></div><div><span className="eyebrow">PIPELINE-SPECIFIC DECISION</span><h2>{highImpact?.action ?? 'No approval gate is currently open'}</h2><p><strong>{item.name}</strong> · {highImpact?.reason ?? 'This pipeline is not asking for a decision right now.'}</p></div><StatusBadge status={item.status} /></div>
        <Panel title="Decision record" detail="Required fields are written with this pipeline’s decision.">
          <div className="form-grid form-grid-two"><label className="field"><span>Reviewer name</span><input value={approver} onChange={(event) => setApprover(event.target.value)} data-testid="input-approver" /></label><label className="field"><span>Reviewer role</span><input value={role} onChange={(event) => setRole(event.target.value)} data-testid="input-reviewer-role" /></label><label className="field field-span"><span>Decision note <small>Optional · up to 500 characters</small></span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Why is this transformation appropriate for this source and requirement?" rows={5} data-testid="input-approval-note" /></label></div>
          <div className="approval-actions"><button className="button button-secondary button-reject" onClick={() => submit('reject')} disabled={decide.isPending || item.status !== 'awaiting_approval'} data-testid="button-reject-approval"><XCircle size={16} /> Reject</button><button className="button button-primary" onClick={() => submit('approve')} disabled={decide.isPending || item.status !== 'awaiting_approval'} data-testid="button-approve-approval"><CheckCircle2 size={16} /> Approve and continue</button></div>
          {feedback && <p className="form-feedback" data-testid="status-approval-feedback"><CheckCircle2 size={14} /> {feedback}</p>}
        </Panel>
      </div>
      <aside className="approval-rail"><div className="rail-label">DECISION CONTEXT</div><div className="context-card"><div className="context-row"><span>Pipeline</span><strong>{item.name}</strong></div><div className="context-row"><span>Requirement</span><strong>{item.requirement}</strong></div><div className="context-row"><span>Source</span><strong>{item.source?.fileName ?? 'Not attached'}</strong></div><div className="context-row"><span>Plan steps</span><strong>{item.plan?.length ?? 0}</strong></div></div><div className="governance-note"><ShieldCheck size={16} /><strong>Why this pauses</strong><p>Destructive or irreversible changes need a human owner. Safe profiling and validation remain agentic.</p></div></aside>
    </div>}
  </div>;
}

function Monitoring() {
  const { selectedId, selectedPipeline } = useWorkspace();
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: activityLoading } = useListActivity({ limit: 12 });
  const { data: pipeline } = useGetPipeline(selectedId ?? '', { query: { enabled: Boolean(selectedId), queryKey: getGetPipelineQueryKey(selectedId ?? '') } });
  const item = pipeline ?? selectedPipeline;
  const statuses = Object.entries(summary?.pipelineStatus ?? {});
  return <div className="page-stack"><PageHeader eyebrow="MONITORING / RUN HEALTH" title="See the system breathe." detail="Runs, throughput, and audit signals in one operational view." action={<span className="selection-chip"><span className="online-pip" />Polling live</span>} /><div className="metric-grid">{isLoading ? [1, 2, 3, 4].map((item) => <Skeleton className="metric-card" key={item} />) : <><MetricCard label="Completed runs" value={formatNumber(summary?.completedRuns)} detail="Successful pipeline runs" icon={CheckCircle2} /><MetricCard label="Rows processed" value={formatNumber(summary?.rowsProcessed)} detail="Across completed runs" icon={BarChart3} accent="blue" /><MetricCard label="SLA compliance" value={`${summary?.slaCompliance ?? 0}%`} detail="Within expected window" icon={Clock3} accent="amber" /><MetricCard label="Current status" value={item?.status === 'completed' ? 'Healthy' : item?.status ?? 'Idle'} detail={item?.name ?? 'Select a pipeline'} icon={Activity} /></>}</div><div className="two-col-grid"><Panel title="Status breakdown" detail="Workspace pipeline distribution"><div className="status-breakdown">{statuses.length ? statuses.map(([status, count]) => <div className="status-break-row" key={status}><div><StatusBadge status={status} /><strong>{String(count)}</strong></div><div className="bar-track"><div className={`bar-fill bar-${status}`} style={{ width: `${Math.min(100, ((count as number) / Math.max(1, summary?.activePipelines ?? 1)) * 100)}%` }} /></div></div>) : <EmptyState title="No run data yet" detail="Run a pipeline to populate health signals." />}</div></Panel><Panel title="Selected pipeline" detail="Latest validation and throughput"><div className="run-health-card">{item ? <><div className="run-health-head"><div className="pipeline-glyph"><GitBranch size={17} /></div><div><strong>{item.name}</strong><span>{item.source?.fileName ?? 'No source attached'}</span></div><StatusBadge status={item.status} /></div><div className="health-stats"><div><span>Input rows</span><strong>{formatNumber(item.validation?.inputRows ?? item.source?.rowCount)}</strong></div><div><span>Output rows</span><strong>{formatNumber(item.validation?.outputRows)}</strong></div><div><span>Duplicates removed</span><strong>{formatNumber(item.validation?.duplicatesRemoved)}</strong></div></div></> : <EmptyState title="No pipeline selected" detail="Select a pipeline from the overview." />}</div></Panel></div><Panel title="Recent audit activity" detail="Operational events from the last 50 records" action={<Link href="/audit" className="text-link" data-testid="link-monitoring-audit">Open audit <ArrowRight size={14} /></Link>}>{activityLoading ? <div className="activity-list"><Skeleton className="activity-row" /><Skeleton className="activity-row" /></div> : activity?.length ? <ActivityList events={activity} /> : <EmptyState title="No activity yet" detail="Activity appears after the first workspace action." />}</Panel></div>;
}

function Audit() {
  const { selectedId, selectedPipeline } = useWorkspace();
  const { data: pipeline } = useGetPipeline(selectedId ?? '', { query: { enabled: Boolean(selectedId), queryKey: getGetPipelineQueryKey(selectedId ?? '') } });
  const { data: events, isLoading } = useListActivity({ limit: 50 });
  const item = pipeline ?? selectedPipeline;
  const trail = item?.audit?.length ? item.audit : events?.filter((event: any) => event.pipelineId === item?.id) ?? [];
  const exportSummary = () => {
    const summary = [`DataForge AI audit summary`, `Pipeline: ${item?.name ?? 'Not selected'}`, `Requirement: ${item?.requirement ?? ''}`, `Status: ${item?.status ?? ''}`, `Events: ${trail.length}`, ...trail.map((event: any) => `${event.time} | ${event.event} | ${event.detail}`)].join('\n');
    const blob = new Blob([summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${item?.name?.replace(/\s+/g, '-').toLowerCase() || 'dataforge'}-audit.txt`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <div className="page-stack"><PageHeader eyebrow="AUDIT / IMMUTABLE RECORD" title="Every decision leaves a trace." detail="A plain-language event trail for review, debugging, and export." action={<div className="header-actions"><button className="button button-secondary" onClick={exportSummary} disabled={!item} data-testid="button-export-audit"><FileArchive size={16} /> Export summary</button><button className="button button-primary" onClick={() => printAuditReport(item, trail)} disabled={!item} data-testid="button-print-audit"><FileArchive size={16} /> Print / save PDF</button></div>} />{!item ? <EmptyState title="Select a pipeline" detail="Audit records are scoped to a selected pipeline." /> : <div className="audit-layout"><div className="audit-main"><Panel title={item.name} detail={`${item.source?.fileName ?? 'Source pending'} · Created ${formatDate(item.createdAt)}`}><div className="audit-summary-grid"><div><span>Pipeline ID</span><strong className="mono-id">{item.id}</strong></div><div><span>Current status</span><StatusBadge status={item.status} /></div><div><span>Approval</span><strong>{item.approval ? `${item.approval.decision} by ${item.approval.approver}` : 'Not decided'}</strong></div></div></Panel><Panel title="Event trail" detail="Append-only workspace events"><div className="timeline">{isLoading ? <><Skeleton className="timeline-item" /><Skeleton className="timeline-item" /></> : trail.length ? trail.map((event: any, index: number) => <div className="timeline-item" key={event.id ?? index}><div className="timeline-mark"><span /></div><div className="timeline-copy"><div><strong>{event.event}</strong><time>{formatDate(event.time)}</time></div><p>{event.detail}</p><span className="mono-id">event/{event.id}</span></div></div>) : <EmptyState title="No events yet" detail="The first event will appear when this pipeline is created." />}</div></Panel></div><aside className="audit-rail"><div className="rail-label">EXPORT-ORIENTED SUMMARY</div><div className="export-card"><FileArchive size={20} /><h3>Ready for review</h3><p>Download a human-readable snapshot with pipeline metadata and every recorded event.</p><button className="button button-dark" onClick={exportSummary} disabled={!trail.length} data-testid="button-download-audit">Download audit summary <ArrowRight size={15} /></button><button className="button button-primary export-pdf-button" onClick={() => printAuditReport(item, trail)} disabled={!trail.length} data-testid="button-print-audit-card"><FileArchive size={15} /> Print / save PDF</button></div><div className="integrity-card"><LockKeyhole size={16} /><div><strong>Immutable by design</strong><p>Events are generated by the API and cannot be edited from this workspace.</p></div></div></aside></div>}</div>;
}

function Comparison() {
  const rows = [{ name: 'Scheduler', scheduler: 'Runs on a clock', forge: 'Plans from intent', validation: 'No' }, { name: 'Validation-only tool', scheduler: 'Checks after the fact', forge: 'Explains before and after', validation: 'Yes' }, { name: 'DataForge Tier-2', scheduler: 'Runs safe actions', forge: 'Plans, explains, pauses', validation: 'Built in' }];
  return <div className="page-stack"><PageHeader eyebrow="PROJECT CONTRIBUTION / VIVA READY" title="Why governed autonomy matters." detail="DataForge is a control layer between a business requirement and a production data change." /><div className="comparison-hero"><div><span className="eyebrow">THE THESIS</span><h2>Let the agent move fast.<br /><em>Keep the human in charge.</em></h2><p>Tier-2 autonomy is the practical middle ground: the agent can profile, propose, validate, and execute reversible work, while high-impact transformations pause with an explainable approval gate.</p></div><div className="thesis-diagram"><div className="diagram-node">Requirement</div><ArrowRight size={17} /><div className="diagram-node diagram-accent">Agent plan</div><ArrowRight size={17} /><div className="diagram-node diagram-gate"><LockKeyhole size={14} /> Human gate</div><ArrowRight size={17} /><div className="diagram-node">Validated run</div></div></div><div className="comparison-grid"><Panel title="The contribution" detail="What this project adds"><div className="contribution-list"><div><span className="contribution-number">01</span><p><strong>Explainable planning.</strong> Business requirements become a visible sequence of actions with reasons, risk labels, and a source profile.</p></div><div><span className="contribution-number">02</span><p><strong>Risk-aware autonomy.</strong> Safe operations flow through. Destructive or irreversible operations stop at a human decision point.</p></div><div><span className="contribution-number">03</span><p><strong>Evidence after execution.</strong> Validation scores, schema checks, and an immutable audit record make every outcome defensible.</p></div></div></Panel><Panel title="A useful distinction" detail="How it differs from familiar tools"><div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Approach</th><th>Core behavior</th><th>Explains intent</th><th>Quality feedback</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name} className={row.name === 'DataForge Tier-2' ? 'comparison-highlight' : ''}><td><strong>{row.name}</strong></td><td>{row.scheduler}</td><td>{row.forge}</td><td>{row.validation}</td></tr>)}</tbody></table></div></Panel></div><div className="comparison-footer"><Info size={16} /><p><strong>Viva framing:</strong> DataForge does not replace the data engineer. It gives the engineer a clear operating surface for delegating routine work without delegating accountability.</p></div></div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return <RoutedErrorBoundary><WorkspaceShell><Switch><Route path="/" component={Overview} /><Route path="/studio" component={Studio} /><Route path="/quality" component={Quality} /><Route path="/approvals" component={Approvals} /><Route path="/monitoring" component={Monitoring} /><Route path="/audit" component={Audit} /><Route path="/comparison" component={Comparison} /><Route component={NotFound} /></Switch></WorkspaceShell></RoutedErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;