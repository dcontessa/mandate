import { useEffect, useState, useCallback } from "react";
import {
  BriefcaseBusiness,
  Building2,
  FileText,
  ShieldCheck,
  History,
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  CircleAlert,
  Check,
  LockKeyhole,
  Search,
  Download,
  Users,
  Plus,
  LogIn,
  ChevronRight,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { previewState } from "@/lib/seed";
import type { WorkspaceView, Engagement, DocumentRecord } from "@/lib/types";
import { EngagementPanel } from "./engagement-panel";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
const nav = [
  { id: "work", label: "Work queue", icon: BriefcaseBusiness },
  { id: "clients", label: "Clients", icon: Building2 },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
  { id: "evidence", label: "Activity & evidence", icon: History },
];
type ApiResult = WorkspaceView & {
  error?: string;
  blocked?: { message: string };
  replayed?: boolean;
  invitePath: string;
};
const initial: WorkspaceView = {
  authAvailable: false,
  mode: "preview",
  actor: null,
  workspace: previewState,
  memberships: [],
  terminal3: { connected: false, detail: "Not connected" },
  signInPath: "#signin",
};
export const readable = (s: string) => s.replaceAll("_", " ");
export function Status({ value }: { value: string }) {
  const tone =
    value === "approved" || value === "recorded"
      ? "success"
      : value === "needs_review" || value === "blocked"
        ? "danger"
        : "neutral";
  return <span className={`status ${tone}`}>{readable(value)}</span>;
}
export function MandateApp() {
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();
  const [data, setData] = useState<WorkspaceView>(initial),
    [section, setSection] = useState("work"),
    [service, setService] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState("eng_alpha_sec"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [modal, setModal] = useState<
      "approve" | "review_source" | "invite" | "join" | null
    >(null),
    [ack, setAck] = useState(false),
    [email, setEmail] = useState(""),
    [inviteLink, setInviteLink] = useState(""),
    [inviteToken, setInviteToken] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const authHeaders = useCallback(() => {
    return supabase.auth.getSession().then(({ data }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.session?.access_token) headers["Authorization"] = `Bearer ${data.session.access_token}`;
      return headers;
    });
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams(location.search);
      const suffix = q.get("workspace")
        ? `?workspace=${encodeURIComponent(q.get("workspace")!)}`
        : "";
      const headers = await authHeaders();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mandate-api${suffix}`, { headers });
      const json = (await r.json()) as ApiResult;
      if (!r.ok) throw new Error(json.error || "Unable to load workspace.");
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (authLoading) return;
    load();
    const token = new URLSearchParams(location.search).get("invite");
    if (token) {
      setInviteToken(token);
      setModal("join");
    }
    if (location.hash === "#signin") setShowAuth(true);
    const onHash = () => setShowAuth(location.hash === "#signin");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [load, authLoading, user?.id]);
  async function post(path: string, body: unknown) {
    setBusy(true);
    try {
      const headers = await authHeaders();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mandate-api/${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
        j = (await r.json()) as ApiResult;
      if (j.workspace) setData(j);
      if (!r.ok)
        throw new Error(j.blocked?.message || j.error || "Action failed.");
      return j;
    } finally {
      setBusy(false);
    }
  }
  const current =
    data.workspace.engagements.find((e) => e.id === selected) ||
    data.workspace.engagements[0];
  const isPreview = data.mode === "preview";
  const role = data.memberships.find(
    (m) => m.userId === data.actor?.id && m.engagementId === current?.id,
  )?.role;
  async function command(action: string, extra: Record<string, unknown> = {}) {
    try {
      const j = await post("command", {
        workspaceId: data.workspace.id,
        engagementId: current.id,
        revision: data.workspace.revision,
        action,
        ...extra,
      });
      toast.success(
        j.replayed
          ? "Existing sandbox receipt retrieved."
          : action === "release"
            ? "Internal sandbox receipt recorded."
            : "Workspace updated.",
      );
      setModal(null);
      setAck(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const work = data.workspace.engagements.filter(
    (e) =>
      (service === "all" || e.service === service) &&
      `${e.title} ${data.workspace.companies.find((c) => c.id === e.companyId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const docs = data.workspace.engagements.flatMap((e) => e.documents);
  function docUrl(d: DocumentRecord) {
    return isPreview
      ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mandate-api/sample?document=${d.id}`
      : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mandate-api/document?workspace=${data.workspace.id}&engagement=${d.engagementId}&document=${d.id}`;
  }
  function choose(e: Engagement) {
    setSelected(e.id);
    setSection("work");
  }
  const pending = data.workspace.engagements.filter(
    (e) => e.request && e.request.status !== "recorded",
  ).length;
  return (
    <SidebarProvider>
      <Toaster position="top-right" richColors />
      <a href="#main-content" className="skip-link">
        Skip to workspace
      </a>
      <Sidebar className="mandate-sidebar">
        <SidebarHeader className="brand">
          <span className="brand-mark">M</span>
          <div>
            <strong>Mandate</strong>
            <span>
              Corporate actions,
              <br />
              properly authorised.
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="practice-label">WORKSPACE</div>
          <div className="practice-name">
            <Building2 size={18} />
            <span>
              Demo Practice One<small>Synthetic records</small>
            </span>
          </div>
          <SidebarMenu className="nav-menu">
            {nav.map((n) => (
              <SidebarMenuItem key={n.id}>
                <SidebarMenuButton
                  size="lg"
                  isActive={section === n.id}
                  onClick={() => {
                    setSection(n.id);
                    setSearch("");
                  }}
                >
                  <n.icon size={18} />
                  <span>{n.label}</span>
                  {n.id === "approvals" && (
                    <span className="nav-count">{pending}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="connection-note">
            <LockKeyhole size={17} />
            <div>
              Terminal 3<small>Live execution not connected</small>
            </div>
          </div>
          <div className="profile">
            <span className="avatar">
              {data.actor?.name.slice(0, 1) || "D"}
            </span>
            <div>
              {data.actor?.name || "Demo visitor"}
              <small>
                {isPreview
                  ? "Read-only exploration"
                  : readable(role || "member")}
              </small>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>Practice workspace</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === section)?.label}</strong>
          </div>
          <div className="top-actions">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh workspace"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </Button>
            {user ? (
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                Sign out
              </Button>
            ) : (
              <Button asChild variant="outline">
                <a href="#signin">
                  <LogIn size={15} />
                  Sign in
                </a>
              </Button>
            )}
          </div>
        </header>
        <Dialog open={showAuth && !user} onOpenChange={(open) => {
          if (!open) { setShowAuth(false); location.hash = ""; }
        }}>
          <DialogContent className="mandate-dialog">
            <DialogHeader>
              <DialogTitle>{authMode === "signin" ? "Sign in" : "Create account"}</DialogTitle>
              <DialogDescription>
                {authMode === "signin"
                  ? "Sign in to create your isolated sandbox and work with synthetic engagements."
                  : "Create an account to start your own synthetic sandbox."}
              </DialogDescription>
            </DialogHeader>
            <div className="dialog-fields">
              <label htmlFor="auth-email">Email</label>
              <Input id="auth-email" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" />
              <label htmlFor="auth-password">Password</label>
              <Input id="auth-password" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="At least 6 characters" />
              <Button
                disabled={authBusy || !authEmail || !authPassword}
                onClick={async () => {
                  setAuthBusy(true);
                  try {
                    if (authMode === "signin") await signIn(authEmail, authPassword);
                    else await signUp(authEmail, authPassword);
                    setShowAuth(false);
                    location.hash = "";
                    toast.success(authMode === "signin" ? "Signed in." : "Account created. You are signed in.");
                    load();
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setAuthBusy(false);
                  }
                }}
              >
                {authBusy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}
              </Button>
              <button
                className="auth-toggle"
                onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
              >
                {authMode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
        <div className="demo-banner">
          <ShieldCheck size={16} />
          <span>Synthetic demo data — no real client records</span>
          <span className="banner-mode">
            {isPreview ? "Read-only preview" : "Isolated sandbox"}
          </span>
        </div>
        <div id="main-content" className="workspace-main">
          {error && (
            <div role="alert" className="error-banner">
              <CircleAlert size={18} />
              <span>{error}</span>
              <Button variant="outline" onClick={load}>
                Retry
              </Button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <h1>
                {section === "work"
                  ? "Work queue"
                  : nav.find((n) => n.id === section)?.label}
              </h1>
              <p>
                {section === "work"
                  ? "The right documents. The right approval. Before anything leaves."
                  : section === "clients"
                    ? "One client record, separately authorised engagements."
                    : section === "documents"
                      ? "Review the exact file and version behind each action."
                      : section === "approvals"
                        ? "Professional judgement stays with an independent reviewer."
                        : "A record of actual workspace actions and their outcomes."}
              </p>
            </div>
            {isPreview ? (
              <Button
                onClick={async () => {
                  if (!user) {
                    location.hash = "signin";
                    return;
                  }
                  try {
                    const j = await post("create", {});
                    setData(j);
                    toast.success("Your synthetic workspace is ready.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
                disabled={busy || loading || !user}
              >
                <Plus size={16} />
                {user ? "Create my sandbox" : "Sandbox needs sign-in"}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setInviteLink("");
                  setModal("invite");
                }}
                disabled={role !== "preparer"}
              >
                <Users size={16} />
                Invite reviewer
              </Button>
            )}
          </div>
          {section === "work" && (
            <>
              <div className="summary-strip">
                <div>
                  <span>Open engagements</span>
                  <strong>
                    {data.workspace.engagements.length
                      .toString()
                      .padStart(2, "0")}
                  </strong>
                </div>
                <div>
                  <span>Awaiting release review</span>
                  <strong>{pending.toString().padStart(2, "0")}</strong>
                </div>
                <div>
                  <span>Documents on file</span>
                  <strong>{docs.length.toString().padStart(2, "0")}</strong>
                </div>
                <div className="summary-note">
                  <ShieldCheck />
                  <p>
                    Approval follows
                    <br />
                    <b>the exact document.</b>
                  </p>
                </div>
              </div>
              <div className="work-layout">
                <section className="queue-panel">
                  <div className="queue-tools">
                    <Tabs value={service} onValueChange={setService}>
                      <TabsList>
                        <TabsTrigger value="all">All work</TabsTrigger>
                        <TabsTrigger value="secretarial">CoSec</TabsTrigger>
                        <TabsTrigger value="accounting">Accounts</TabsTrigger>
                        <TabsTrigger value="taxation">Tax</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <div className="search-field">
                      <Search size={16} />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Find client or work…"
                        aria-label="Find client or work"
                      />
                    </div>
                  </div>
                  <div className="queue-list">
                    {work.length === 0 ? (
                      <p className="empty-state">
                        No work matches this search.
                      </p>
                    ) : (
                      work.map((e) => (
                        <button
                          key={e.id}
                          className={`work-row ${current?.id === e.id ? "selected" : ""}`}
                          onClick={() => setSelected(e.id)}
                          aria-pressed={current?.id === e.id}
                        >
                          <span className={`service-icon ${e.service}`}>
                            <BriefcaseBusiness size={18} />
                          </span>
                          <span className="work-row-content">
                            <span className="client-name">
                              {
                                data.workspace.companies.find(
                                  (c) => c.id === e.companyId,
                                )?.name
                              }
                            </span>
                            <strong>{e.title}</strong>
                            <span className="row-meta">
                              {e.service === "secretarial"
                                ? "Company secretarial"
                                : e.service === "accounting"
                                  ? "Accounting"
                                  : "Taxation"}{" "}
                              · {e.documents.length} documents
                            </span>
                          </span>
                          <Status value={e.request?.status || e.stage} />
                          <ChevronRight size={16} />
                        </button>
                      ))
                    )}
                  </div>
                  <div className="queue-foot">
                    <LockKeyhole size={15} />
                    {isPreview
                      ? "Preview includes fictional engagements across services."
                      : "Only engagements assigned to your identity appear here."}
                  </div>
                </section>
                {current && (
                  <EngagementPanel
                    current={current}
                    preview={isPreview}
                    role={role}
                    busy={busy}
                    docUrl={docUrl}
                    command={command}
                    review={(type) => {
                      setAck(false);
                      setModal(type);
                    }}
                  />
                )}
              </div>
            </>
          )}
          {section === "clients" && (
            <section className="white-panel">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client company</TableHead>
                    <TableHead>Engagements in view</TableHead>
                    <TableHead>Next action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.workspace.companies.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="table-client">
                          <span className="avatar light">
                            {c.name.endsWith("Alpha") ? "A" : "B"}
                          </span>
                          <strong>{c.name}</strong>
                        </div>
                      </TableCell>
                      <TableCell>
                        {data.workspace.engagements
                          .filter((e) => e.companyId === c.id)
                          .map((e) => (
                            <span className="service-tag" key={e.id}>
                              {e.service}
                            </span>
                          ))}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            choose(
                              data.workspace.engagements.find(
                                (e) => e.companyId === c.id,
                              )!,
                            )
                          }
                        >
                          Open work
                          <ArrowUpRight size={15} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="panel-note">
                All companies are invented. Access to one company’s secretarial
                work does not grant access to its accounting or tax files.
              </div>
            </section>
          )}
          {section === "documents" && (
            <section className="white-panel">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>SHA-256</TableHead>
                    <TableHead>File</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="table-client">
                          <FileText size={20} />
                          <div>
                            <strong>{d.title}</strong>
                            <small>
                              {
                                data.workspace.engagements.find(
                                  (e) => e.id === d.engagementId,
                                )?.service
                              }
                            </small>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>v{d.version}</TableCell>
                      <TableCell>
                        <code title={d.sha256}>{d.sha256.slice(0, 16)}…</code>
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost">
                          <a href={docUrl(d)} target="_blank" rel="noreferrer">
                            Open PDF
                            <ArrowUpRight size={15} />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="panel-note">
                Synthetic PDF fixtures. General client uploads and AutoCount
                imports are outside this first build.
              </div>
            </section>
          )}
          {section === "approvals" && (
            <section className="approval-list">
              {data.workspace.engagements
                .filter((e) => e.request)
                .map((e) => (
                  <article className="approval-card" key={e.id}>
                    <div className="approval-card-icon">
                      <ShieldCheck size={28} />
                    </div>
                    <div>
                      <span className="client-name">
                        {
                          data.workspace.companies.find(
                            (c) => c.id === e.companyId,
                          )?.name
                        }
                      </span>
                      <h2>{e.title}</h2>
                      <p>
                        Exact package, recipient, source authority and execution
                        mode.
                      </p>
                      <Status value={e.request!.status} />
                    </div>
                    <Button onClick={() => choose(e)}>
                      Review package
                      <ArrowRight size={16} />
                    </Button>
                  </article>
                ))}
              <div className="panel-note">
                <LockKeyhole size={17} />A separate signed-in reviewer must
                establish the source and approve the package. The preparer’s
                account cannot approve.
              </div>
            </section>
          )}
          {section === "evidence" && (
            <section className="white-panel">
              <div className="panel-header">
                <h2>Activity record</h2>
                <Button asChild variant="outline" disabled={isPreview}>
                  {isPreview ? (
                    <span>
                      <Download size={16} />
                      Export requires a workspace
                    </span>
                  ) : (
                    <a
                      href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mandate-api/evidence?workspace=${data.workspace.id}`}
                    >
                      <Download size={16} />
                      Export evidence
                    </a>
                  )}
                </Button>
              </div>
              {data.workspace.events.length ? (
                <ol className="timeline">
                  {[...data.workspace.events].reverse().map((e) => (
                    <li key={e.id}>
                      <span
                        className={`event-icon ${e.outcome === "blocked" ? "danger" : ""}`}
                      >
                        {e.outcome === "blocked" ? (
                          <LockKeyhole size={16} />
                        ) : (
                          <Check size={16} />
                        )}
                      </span>
                      <div>
                        <strong>{readable(e.action)}</strong>
                        <p>{e.details}</p>
                        <small>
                          {new Date(e.at).toLocaleString()} · Actor{" "}
                          {e.actorId.slice(0, 12)}
                        </small>
                      </div>
                      <Status value={e.outcome} />
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="empty-state roomy">
                  <History size={32} />
                  <h2>No actions recorded yet</h2>
                  <p>
                    Your review decisions and release attempts will appear here.
                    <br />
                    No approvals, receipts or provider proofs are pre-filled.
                  </p>
                </div>
              )}
              <div className="panel-note">
                This is an application activity log. It is not an immutable
                audit trail or evidence of legal validity.
              </div>
            </section>
          )}
          <footer className="workspace-footer">
            <span>Mandate · Working prototype</span>
            <span>CoSec first. AutoCount stays in place.</span>
          </footer>
        </div>
      </SidebarInset>
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open && !busy) setModal(null);
        }}
      >
        <DialogContent className="mandate-dialog">
          <DialogHeader>
            <DialogTitle>
              {modal === "invite"
                ? "Invite an independent reviewer"
                : modal === "join"
                  ? "Join the review workspace"
                  : modal === "review_source"
                    ? "Establish source authority"
                    : "Approve this exact package"}
            </DialogTitle>
            <DialogDescription>
              {modal === "invite"
                ? "Only the named email can accept this invitation, using a separate ChatGPT identity."
                : modal === "join"
                  ? "Sign in with the email named in the invitation, then accept."
                  : "This is your professional review of synthetic documents. It does not assert legal validity."}
            </DialogDescription>
          </DialogHeader>
          {modal === "invite" ? (
            <div className="dialog-fields">
              <label htmlFor="reviewer-email">Reviewer’s email</label>
              <Input
                id="reviewer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="reviewer@example.com"
              />
              {inviteLink ? (
                <>
                  <label htmlFor="invite-link">
                    Invitation link · valid for 24 hours
                  </label>
                  <Input id="invite-link" readOnly value={inviteLink} />
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteLink);
                        toast.success("Link copied.");
                      } catch {
                        toast.error("Select and copy the link above.");
                      }
                    }}
                  >
                    Copy invitation link
                  </Button>
                  <p className="small-note">
                    Share this link yourself. Mandate has not sent an email.
                  </p>
                </>
              ) : (
                <Button
                  disabled={busy || !email}
                  onClick={async () => {
                    try {
                      const j = await post("invite", {
                        workspaceId: data.workspace.id,
                        engagementId: current.id,
                        email,
                      });
                      setInviteLink(location.origin + j.invitePath);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Create invitation
                </Button>
              )}
            </div>
          ) : modal === "join" ? (
            <div className="dialog-fields">
              {data.actor ? (
                <Button
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const j = await post("join", { token: inviteToken });
                      setData(j);
                      history.replaceState(
                        {},
                        "",
                        `/?workspace=${j.workspace.id}`,
                      );
                      setModal(null);
                      toast.success("Reviewer access granted.");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Accept reviewer invitation
                </Button>
              ) : (
                <Button asChild>
                  <a
                    target="_top"
                    href={`#signin?return_to=${encodeURIComponent("/?invite=" + inviteToken)}`}
                  >
                    Sign in to accept
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <div className="dialog-fields">
              <dl className="approval-summary">
                <div>
                  <dt>Source</dt>
                  <dd>BR-001 · A + B jointly</dd>
                </div>
                <div>
                  <dt>Package</dt>
                  <dd>{current?.request?.documentId}</dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd>{readable(current?.request?.destination || "")}</dd>
                </div>
                <div>
                  <dt>Execution</dt>
                  <dd>
                    {current?.request?.mode === "sandbox"
                      ? "Internal sandbox only"
                      : "Terminal 3 — not connected"}
                  </dd>
                </div>
              </dl>
              <label className="check-label">
                <Checkbox
                  checked={ack}
                  onCheckedChange={(v) => setAck(v === true)}
                />
                <span>
                  I reviewed the source and exact document version, signatories
                  and recipient shown here.
                </span>
              </label>
              <Button
                disabled={!ack || busy}
                onClick={() => command(modal!, { acknowledgement: ack })}
              >
                {busy
                  ? "Saving…"
                  : modal === "review_source"
                    ? "Confirm source review"
                    : "Approve exact snapshot"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
