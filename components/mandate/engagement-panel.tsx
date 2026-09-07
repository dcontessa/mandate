"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  FileText,
  ShieldCheck,
  LockKeyhole,
  Check,
  ChevronRight,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Engagement, DocumentRecord, Role } from "@/lib/types";
import { Status, readable } from "./workspace";
type Props = {
  current: Engagement;
  preview: boolean;
  role?: Role;
  busy: boolean;
  docUrl: (d: DocumentRecord) => string;
  command: (a: string, b?: Record<string, unknown>) => Promise<void>;
  review: (type: "approve" | "review_source") => void;
};
export function EngagementPanel({
  current: e,
  preview,
  role,
  busy,
  docUrl,
  command,
  review,
}: Props) {
  const [tab, setTab] = useState("package"),
    [version, setVersion] = useState(
      e.request?.documentId || e.documents[0]?.id,
    );
  useEffect(() => {
    setVersion(e.request?.documentId || e.documents[0]?.id);
    setTab("package");
  }, [e.id, e.request?.documentId]);
  const doc = e.documents.find((d) => d.id === version),
    r = e.request;
  const maker =
    role === "preparer" && !preview && !busy && r?.status !== "recorded";
  return (
    <aside className="detail-panel">
      <div className="detail-heading">
        <span className="detail-kicker">
          {e.service === "secretarial"
            ? "COMPANY SECRETARIAL"
            : e.service.toUpperCase()}
        </span>
        <h2>{e.title}</h2>
        <div className="detail-heading-meta">
          <span>
            {e.id === "eng_alpha_sec"
              ? "REQ-001"
              : e.id === "eng_beta_sec"
                ? "REQ-002"
                : "Reference engagement"}
          </span>
          <Status value={r?.status || e.stage} />
        </div>
      </div>
      {r ? (
        <>
          <div className="workflow-track">
            {[
              { name: "Prepare", done: true },
              { name: "Review", done: !!r.approval },
              { name: "Record", done: !!r.receipt },
            ].map((s, i) => (
              <div key={s.name} className={s.done ? "done" : ""}>
                <span>{s.done ? <Check size={13} /> : i + 1}</span>
                {s.name}
                {i < 2 && <ChevronRight size={13} />}
              </div>
            ))}
          </div>
          <Tabs value={tab} onValueChange={setTab} className="detail-tabs">
            <TabsList>
              <TabsTrigger value="package">Package</TabsTrigger>
              <TabsTrigger value="authority">Authority</TabsTrigger>
              <TabsTrigger value="release">Release</TabsTrigger>
            </TabsList>
            <TabsContent value="package">
              <div className="detail-body">
                <label className="field-label" htmlFor="package-version">
                  Document version
                </label>
                <Select value={version} onValueChange={setVersion}>
                  <SelectTrigger id="package-version">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {e.documents
                      .filter((d) => d.kind === "release_package")
                      .map((d) => (
                        <SelectItem value={d.id} key={d.id}>
                          v{d.version} ·{" "}
                          {d.version === 1
                            ? "Original A + B"
                            : d.version === 2
                              ? "Changed terms, same A + B"
                              : "A + B + C"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {doc && (
                  <>
                    <a
                      className="document-preview"
                      href={docUrl(doc)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="document-head">
                        <FileText size={21} />
                        <span>PDF · SYNTHETIC</span>
                        <ArrowUpRight size={16} />
                      </div>
                      <div className="document-page">
                        <span>DEMO COMPANY ALPHA</span>
                        <h3>
                          Banking
                          <br />
                          arrangement
                        </h3>
                        <p>Authorised signatories</p>
                        <strong>
                          {doc.signatories
                            .map((s) => s.replace("person_", "").toUpperCase())
                            .join(" + ")}
                        </strong>
                        <div className="document-rule" />
                        <small>
                          Package version {doc.version} · fictional record
                        </small>
                      </div>
                      <span className="document-open">
                        Open exact PDF
                        <ArrowUpRight size={15} />
                      </span>
                    </a>
                    <div className="hash-label">
                      <span>FILE SHA-256</span>
                      <code title={doc.sha256}>{doc.sha256.slice(0, 24)}…</code>
                    </div>
                    {doc.version === 2 && (
                      <p className="notice amber">
                        <CircleAlert size={16} />
                        Terms changed. Keeping A + B does not preserve an
                        earlier approval.
                      </p>
                    )}
                    {doc.version === 3 && (
                      <p className="notice red">
                        <LockKeyhole size={16} />
                        Person C is outside the source authority. Release must
                        be blocked.
                      </p>
                    )}
                    {version !== r.documentId && (
                      <div className="selection-note">
                        <p>You are comparing a different version.</p>
                        <Button
                          disabled={!maker}
                          onClick={() =>
                            command("change_package", { documentId: version })
                          }
                        >
                          Use this version for review
                        </Button>
                      </div>
                    )}
                  </>
                )}
                <div className="detail-actions">
                  <Button variant="outline" onClick={() => setTab("authority")}>
                    Review authority
                    <ChevronRight size={15} />
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="authority">
              <div className="detail-body">
                <div className="authority-box">
                  <ShieldCheck size={26} />
                  <span>Source record · BR-001</span>
                  <h3>A + B, jointly.</h3>
                  <p>
                    The source permits exactly two named signatories. An agent
                    cannot add another person.
                  </p>
                  <Status
                    value={
                      e.source?.reviewedBy ? "reviewed" : "review_required"
                    }
                  />
                </div>
                <a
                  className="text-link"
                  href={docUrl(
                    e.documents.find((d) => d.id === e.source!.documentId)!,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open board source PDF
                  <ArrowUpRight size={15} />
                </a>
                <dl className="facts">
                  <div>
                    <dt>Scope</dt>
                    <dd>Alpha · secretarial engagement</dd>
                  </div>
                  <div>
                    <dt>Source review</dt>
                    <dd>
                      {e.source?.reviewedAt
                        ? new Date(e.source.reviewedAt).toLocaleString()
                        : "No live review yet"}
                    </dd>
                  </div>
                  <div>
                    <dt>Validity</dt>
                    <dd>One hour from source review</dd>
                  </div>
                </dl>
                <p className="small-note">
                  A professional establishes business authority. Terminal 3
                  identity would not prove board approval or legal validity.
                </p>
                <Button
                  className="full-width"
                  disabled={
                    preview ||
                    role !== "reviewer" ||
                    busy ||
                    r.status === "recorded"
                  }
                  onClick={() => review("review_source")}
                >
                  Establish source authority
                </Button>
                {(preview || role !== "reviewer") && (
                  <p className="small-note">
                    Requires an assigned, independent reviewer.
                  </p>
                )}
              </div>
            </TabsContent>
            <TabsContent value="release">
              <div className="detail-body">
                <label className="field-label">Recipient</label>
                <Select
                  value={r.destination}
                  disabled={!maker}
                  onValueChange={(destination) =>
                    command("change_recipient", { destination })
                  }
                >
                  <SelectTrigger aria-label="Release recipient">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox_primary">
                      Internal sandbox · primary
                    </SelectItem>
                    <SelectItem value="sandbox_alternate">
                      Internal sandbox · alternate
                    </SelectItem>
                  </SelectContent>
                </Select>
                <label className="field-label">Execution mode</label>
                <Select
                  value={r.mode}
                  disabled={!maker}
                  onValueChange={(mode) => command("set_mode", { mode })}
                >
                  <SelectTrigger aria-label="Execution mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">
                      Internal sandbox record
                    </SelectItem>
                    <SelectItem value="terminal3">
                      Terminal 3 · not connected
                    </SelectItem>
                  </SelectContent>
                </Select>
                <dl className="facts">
                  <div>
                    <dt>Current package</dt>
                    <dd>
                      {e.documents.find((d) => d.id === r.documentId)?.title}
                    </dd>
                  </div>
                  <div>
                    <dt>Approval</dt>
                    <dd>
                      {r.approval
                        ? `Snapshot ${r.approval.snapshot.slice(0, 12)}…`
                        : "Independent review required"}
                    </dd>
                  </div>
                  <div>
                    <dt>Approval expiry</dt>
                    <dd>
                      {r.approval
                        ? new Date(r.approval.expiresAt).toLocaleTimeString()
                        : "—"}
                    </dd>
                  </div>
                </dl>
                {r.receipt ? (
                  <div className="receipt-box">
                    <Check size={24} />
                    <h3>Sandbox receipt recorded</h3>
                    <code>{r.receipt.id}</code>
                    <p>No external delivery or Terminal 3 call occurred.</p>
                  </div>
                ) : (
                  <>
                    <p className="notice amber">
                      <CircleAlert size={16} />
                      {r.mode === "terminal3"
                        ? "Live Terminal 3 execution is unavailable. This action will fail closed."
                        : "Records an internal receipt only. Nothing is sent to a bank, client or external service."}
                    </p>
                    <Button
                      className="full-width"
                      disabled={preview || role !== "reviewer" || busy}
                      onClick={() => review("approve")}
                    >
                      Approve exact package
                    </Button>
                    <Button
                      className="full-width lime-button"
                      disabled={!maker}
                      onClick={() => command("release")}
                    >
                      <LockKeyhole size={16} />
                      {r.mode === "sandbox"
                        ? "Check & record in sandbox"
                        : "Attempt Terminal 3 release"}
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
          {preview && (
            <div className="preview-note">
              <LockKeyhole size={15} />
              <p>
                Explore the documents here. Create a signed-in sandbox to record
                real review actions.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="detail-body">
          <p className="reference-note">
            {e.service === "accounting"
              ? "Illustrative management figures. This is not an AutoCount export or a replacement ledger."
              : e.service === "taxation"
                ? "A document collection example. No statutory deadlines or tax computations are activated."
                : "No documents have been prepared for this fictional engagement."}
          </p>
          {e.documents.map((d) => (
            <a
              key={d.id}
              className="reference-file"
              href={docUrl(d)}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={22} />
              <span>
                {d.title}
                <small>Open synthetic PDF</small>
              </span>
              <ArrowUpRight size={16} />
            </a>
          ))}
          {e.service === "taxation" && (
            <ul className="checklist">
              <li>
                <Status value="missing" />
                Year-end trial balance
              </li>
              <li>
                <Status value="requested" />
                Fixed asset schedule
              </li>
              <li>
                <Status value="pending_review" />
                Prior working papers
              </li>
            </ul>
          )}
          <p className="small-note">
            The complete approval-and-release workflow is implemented for the
            secretarial engagement first.
          </p>
        </div>
      )}
    </aside>
  );
}
