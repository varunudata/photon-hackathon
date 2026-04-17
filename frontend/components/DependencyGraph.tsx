"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphData, GraphNode } from "@/lib/api";
import { langColor } from "@/lib/utils";
import React from "react";

// ─── Cluster colour palette ───────────────────────────────────────────────────
const COMMUNITY_COLORS = [
  "#6366f1",
  "#22d3ee",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
];

function communityColor(id: number): string {
  return COMMUNITY_COLORS[id % COMMUNITY_COLORS.length];
}

function buildReactFlowGraph(data: GraphData): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = data.nodes.map((n: GraphNode) => ({
    id: n.id,
    type: "default",
    position: { x: (n.x ?? 0) * 3, y: (n.y ?? 0) * 3 },
    data: {
      label: n.label || n.path.split("/").pop(),
      node: n,
    },
    style: {
      background: "var(--bg-card)",
      border: `2px solid ${n.community !== undefined ? communityColor(n.community) : langColor(n.language)}`,
      borderRadius: 8,
      color: "var(--text-primary)",
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
      padding: "6px 10px",
      minWidth: 90,
      boxShadow: `0 0 12px ${n.community !== undefined ? communityColor(n.community) : "transparent"}22`,
    },
  }));

  const edges: Edge[] = data.edges.map((e, i) => ({
    id: `e-${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.type,
    labelStyle: { fontSize: 9, fill: "var(--text-muted)" },
    style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(255,255,255,0.2)" },
    animated: false,
  }));

  return { nodes, edges };
}

interface DependencyGraphProps {
  data: GraphData;
  onNodeClick?: (node: GraphNode) => void;
}

export default function DependencyGraph({
  data,
  onNodeClick,
}: DependencyGraphProps) {
  const { nodes: initNodes, edges: initEdges } = buildReactFlowGraph(data);
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildReactFlowGraph(data);
    setNodes(n);
    setEdges(e);
  }, [data]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.data.node as GraphNode);
    },
    [onNodeClick],
  );

  // Build legend from unique communities
  const usedCommunities = [
    ...new Set(
      data.nodes.map((n) => n.community).filter((c) => c !== undefined),
    ),
  ] as number[];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.05}
        maxZoom={3}
        attributionPosition="bottom-left"
      >
        <Background color="rgba(255,255,255,0.03)" gap={32} />
        <Controls
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--bg-card-border)",
            borderRadius: "var(--radius-md)",
          }}
        />
        <MiniMap
          nodeColor={(n: Node) => {
            const gn = n.data.node as GraphNode;
            return gn.community !== undefined
              ? communityColor(gn.community)
              : langColor(gn.language);
          }}
          style={{
            background: "var(--bg-base)",
            border: "1px solid var(--bg-card-border)",
            borderRadius: "var(--radius-md)",
          }}
        />

        {/* Legend panel */}
        {usedCommunities.length > 0 && (
          <Panel position="top-right">
            <div
              className="card"
              style={{ padding: "0.75rem 1rem", minWidth: 140 }}
            >
              <p
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                  marginBottom: "0.5rem",
                }}
              >
                Clusters
              </p>
              {usedCommunities.slice(0, 8).map((c) => (
                <div
                  key={c}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: "0.78rem",
                    marginBottom: 4,
                    color: "var(--text-secondary)",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: communityColor(c),
                      flexShrink: 0,
                    }}
                  />
                  Cluster {c + 1}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
