"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  ArrowDownToLine,
  ArrowUpToLine,
  GitBranch,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { GraphNode, ImpactAnalysis } from "@/lib/api";
import { api } from "@/lib/api";
import { formatBytes, langColor } from "@/lib/utils";
import React from "react";

interface GraphContextPanelProps {
  repoId: string;
  node: GraphNode | null;
  onNavigate?: (path: string) => void;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "#10b981",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
};

function ImpactPanel({ repoId, nodeId }: { repoId: string; nodeId: string }) {
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAffected, setShowAffected] = useState(false);
  const [showUpstream, setShowUpstream] = useState(false);

  useEffect(() => {
    setLoading(true);
    setImpact(null);
    api.graph
      .getImpact(repoId, nodeId)
      .then(setImpact)
      .finally(() => setLoading(false));
  }, [repoId, nodeId]);

  if (loading)
    return (
      <p
        style={{
          fontSize: "0.8rem",
          color: "var(--text-muted)",
          padding: "0.5rem 0",
        }}
      >
        Analysing impact...
      </p>
    );
  if (!impact) return null;

  const riskColor = RISK_COLORS[impact.risk_level] ?? "#6366f1";
  const scorePercent = impact.impact_score;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Score bar */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.35rem",
          }}
        >
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
            }}
          >
            Impact Score
          </span>
          <span style={{ fontSize: "1rem", fontWeight: 700, color: riskColor }}>
            {scorePercent} / 100
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "var(--bg-elevated)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${scorePercent}%`,
              background: riskColor,
              borderRadius: 4,
              transition: "width 0.5s ease",
            }}
          />
        </div>
      </div>

      {/* Risk badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.3rem 0.75rem",
          borderRadius: "999px",
          background: `${riskColor}22`,
          border: `1px solid ${riskColor}55`,
          fontSize: "0.8rem",
          fontWeight: 700,
          color: riskColor,
          alignSelf: "flex-start",
        }}
      >
        {impact.risk_emoji} {impact.risk_level} RISK
      </div>

      {/* Metric cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.4rem",
        }}
      >
        {[
          { label: "Affected", value: impact.metrics.affected_count },
          { label: "Dependents", value: impact.metrics.upstream_count },
          { label: "Max Depth", value: impact.metrics.max_depth },
          { label: "Fan-Out", value: impact.metrics.fan_out },
          { label: "Fan-In", value: impact.metrics.fan_in },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="stat-card"
            style={{ padding: "0.5rem 0.6rem" }}
          >
            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {value}
            </div>
            <div
              style={{
                fontSize: "0.68rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Explanation */}
      <p
        style={{
          fontSize: "0.77rem",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {impact.explanation}
      </p>

      {/* Affected nodes collapsible */}
      {impact.affected_nodes.length > 0 && (
        <div>
          <button
            onClick={() => setShowAffected((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <ArrowDownToLine size={11} /> Downstream (
            {impact.affected_nodes.length})
            {showAffected ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {showAffected && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                marginTop: "0.4rem",
              }}
            >
              {impact.affected_nodes.map((n) => (
                <div
                  key={n.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#ef444411",
                    border: "1px solid #ef444433",
                    borderRadius: "var(--radius-sm)",
                    padding: "3px 8px",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.72rem",
                    color: "#ef4444",
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {n.path.split("/").pop()}
                  </span>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      opacity: 0.7,
                      flexShrink: 0,
                      marginLeft: 6,
                    }}
                  >
                    depth {n.depth}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upstream nodes collapsible */}
      {impact.upstream_nodes.length > 0 && (
        <div>
          <button
            onClick={() => setShowUpstream((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <ArrowUpToLine size={11} /> Dependents (
            {impact.upstream_nodes.length})
            {showUpstream ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {showUpstream && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                marginTop: "0.4rem",
              }}
            >
              {impact.upstream_nodes.map((n) => (
                <div
                  key={n.id}
                  style={{
                    background: "#f59e0b11",
                    border: "1px solid #f59e0b33",
                    borderRadius: "var(--radius-sm)",
                    padding: "3px 8px",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.72rem",
                    color: "#f59e0b",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {n.path.split("/").pop()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface GraphContextPanelProps {
  repoId: string;
  node: GraphNode | null;
  onNavigate?: (path: string) => void;
}

export default function GraphContextPanel({
  repoId,
  node,
  onNavigate,
}: GraphContextPanelProps) {
  const [importers, setImporters] = useState<GraphNode[]>([]);
  const [importees, setImportees] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"deps" | "impact">("deps");

  useEffect(() => {
    if (!node) return;
    setTab("deps");
    setLoading(true);
    // Fetch subgraph to get neighbors
    api.graph
      .getSubgraph(repoId, node.id)
      .then((data) => {
        const others = data.nodes.filter((n) => n.id !== node.id);
        const edgeTargets = new Set(
          data.edges.filter((e) => e.source === node.id).map((e) => e.target),
        );
        const edgeSources = new Set(
          data.edges.filter((e) => e.target === node.id).map((e) => e.source),
        );
        setImportees(others.filter((n) => edgeTargets.has(n.id)));
        setImporters(others.filter((n) => edgeSources.has(n.id)));
      })
      .finally(() => setLoading(false));
  }, [node, repoId]);

  if (!node) {
    return (
      <div className="empty-state" style={{ padding: "2rem" }}>
        <GitBranch size={28} style={{ opacity: 0.3 }} />
        <p style={{ fontSize: "0.82rem" }}>Click a node to inspect it</p>
      </div>
    );
  }

  const color = langColor(node.language);

  return (
    <div
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      {/* Node header */}
      <div>
        <div className="flex-gap-2" style={{ marginBottom: "0.5rem" }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.82rem",
              color: "var(--text-primary)",
              fontWeight: 600,
            }}
          >
            {node.label}
          </span>
        </div>
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.72rem",
            color: "var(--text-muted)",
            wordBreak: "break-all",
          }}
        >
          {node.path}
        </p>
      </div>

      {/* Stats */}
      <div className="grid-2" style={{ gap: "0.5rem" }}>
        <div className="stat-card" style={{ padding: "0.75rem" }}>
          <div className="stat-value" style={{ fontSize: "1.25rem" }}>
            {node.language}
          </div>
          <div className="stat-label">Language</div>
        </div>
        <div className="stat-card" style={{ padding: "0.75rem" }}>
          <div className="stat-value" style={{ fontSize: "1.25rem" }}>
            {formatBytes(node.size_bytes)}
          </div>
          <div className="stat-label">File size</div>
        </div>
      </div>

      {/* Open file */}
      <button
        className="btn btn-ghost"
        style={{ justifyContent: "center" }}
        onClick={() => onNavigate?.(node.path)}
      >
        <ExternalLink size={14} /> View File
      </button>

      {/* Tab switcher */}
      <div
        style={{
          display: "flex",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          border: "1px solid var(--bg-card-border)",
        }}
      >
        {(["deps", "impact"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "0.4rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              border: "none",
              cursor: "pointer",
              background: tab === t ? "var(--accent)" : "var(--bg-elevated)",
              color: tab === t ? "#fff" : "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.3rem",
            }}
          >
            {t === "deps" ? <GitBranch size={11} /> : <Zap size={11} />}
            {t === "deps" ? "Deps" : "Impact"}
          </button>
        ))}
      </div>

      {tab === "deps" && (
        <>
          <div className="divider" />
          {/* Importers */}
          <div>
            <div
              className="flex-gap-2"
              style={{
                marginBottom: "0.5rem",
                color: "var(--text-muted)",
                fontSize: "0.75rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <ArrowDownToLine size={12} /> Imported by ({importers.length})
            </div>
            {loading ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Loading...
              </p>
            ) : importers.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                No importers found
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                {importers.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onNavigate?.(n.path)}
                    style={{
                      textAlign: "left",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--bg-card-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 8px",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "var(--text-primary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--text-secondary)")
                    }
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="divider" />

          {/* Importees */}
          <div>
            <div
              className="flex-gap-2"
              style={{
                marginBottom: "0.5rem",
                color: "var(--text-muted)",
                fontSize: "0.75rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <ArrowUpToLine size={12} /> Imports ({importees.length})
            </div>
            {loading ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Loading...
              </p>
            ) : importees.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                No imports found
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                {importees.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onNavigate?.(n.path)}
                    style={{
                      textAlign: "left",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--bg-card-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 8px",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "var(--text-primary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--text-secondary)")
                    }
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "impact" && (
        <>
          <div className="divider" />
          <ImpactPanel repoId={repoId} nodeId={node.id} />
        </>
      )}
    </div>
  );
}
