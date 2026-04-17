from __future__ import annotations
from typing import Optional
from collections import deque

from neo4j import AsyncGraphDatabase, AsyncDriver

from app.config import get_settings

settings = get_settings()


class Neo4jClient:
    """Async Neo4j client for graph operations."""

    def __init__(self):
        self._driver: AsyncDriver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )

    async def close(self):
        await self._driver.close()

    async def ensure_schema(self):
        """Create indexes and constraints."""
        async with self._driver.session() as s:
            await s.run(
                "CREATE CONSTRAINT IF NOT EXISTS FOR (m:Module) REQUIRE m.node_id IS UNIQUE"
            )
            await s.run(
                "CREATE CONSTRAINT IF NOT EXISTS FOR (sym:Symbol) REQUIRE sym.node_id IS UNIQUE"
            )
            await s.run(
                "CREATE INDEX IF NOT EXISTS FOR (m:Module) ON (m.repo_id)"
            )

    async def upsert_module(
        self,
        repo_id: str,
        rel_path: str,
        language: str,
        size_bytes: int,
    ) -> str:
        """Create or update a Module node. Returns the node_id."""
        node_id = f"{repo_id}::{rel_path}"
        async with self._driver.session() as s:
            await s.run(
                """
                MERGE (m:Module {node_id: $node_id})
                SET m.repo_id   = $repo_id,
                    m.path      = $path,
                    m.language  = $language,
                    m.size_bytes = $size_bytes
                """,
                node_id=node_id,
                repo_id=repo_id,
                path=rel_path,
                language=language,
                size_bytes=size_bytes,
            )
        return node_id

    async def upsert_symbol(
        self,
        repo_id: str,
        module_node_id: str,
        name: str,
        kind: str,
        start_line: int,
        end_line: int,
        docstring: Optional[str],
    ) -> str:
        node_id = f"{module_node_id}::{kind}::{name}"
        async with self._driver.session() as s:
            await s.run(
                """
                MERGE (sym:Symbol {node_id: $node_id})
                SET sym.repo_id    = $repo_id,
                    sym.name       = $name,
                    sym.kind       = $kind,
                    sym.start_line = $start_line,
                    sym.end_line   = $end_line,
                    sym.docstring  = $docstring
                WITH sym
                MATCH (m:Module {node_id: $module_node_id})
                MERGE (m)-[:DEFINES]->(sym)
                """,
                node_id=node_id,
                repo_id=repo_id,
                name=name,
                kind=kind,
                start_line=start_line,
                end_line=end_line,
                docstring=docstring or "",
                module_node_id=module_node_id,
            )
        return node_id

    async def upsert_import_edge(
        self,
        from_module_id: str,
        target_path_fragment: str,
        repo_id: str,
    ) -> None:
        """Create an IMPORTS edge between modules if the target exists."""
        async with self._driver.session() as s:
            await s.run(
                """
                MATCH (src:Module {node_id: $from_id})
                MATCH (tgt:Module)
                WHERE tgt.repo_id = $repo_id
                  AND tgt.path CONTAINS $fragment
                MERGE (src)-[:IMPORTS]->(tgt)
                """,
                from_id=from_module_id,
                repo_id=repo_id,
                fragment=target_path_fragment,
            )

    async def get_repo_graph(self, repo_id: str, depth: int = 2) -> dict:
        """Return all Module nodes and IMPORTS edges for a repo."""
        async with self._driver.session() as s:
            node_result = await s.run(
                """
                MATCH (m:Module {repo_id: $repo_id})
                RETURN m.node_id AS id, m.path AS path,
                       m.language AS language, m.size_bytes AS size_bytes
                """,
                repo_id=repo_id,
            )
            nodes = [dict(r) for r in await node_result.data()]

            edge_result = await s.run(
                """
                MATCH (a:Module {repo_id: $repo_id})-[r:IMPORTS]->(b:Module {repo_id: $repo_id})
                RETURN a.node_id AS source, b.node_id AS target, type(r) AS label
                """,
                repo_id=repo_id,
            )
            edges = [dict(r) for r in await edge_result.data()]

        return {"nodes": nodes, "edges": edges}

    async def get_subgraph(self, node_id: str, repo_id: str) -> dict:
        """Return the immediate neighbors of a node."""
        async with self._driver.session() as s:
            result = await s.run(
                """
                MATCH (m:Module {node_id: $node_id})-[r]-(neighbor:Module {repo_id: $repo_id})
                RETURN
                  m.node_id AS src_id, m.path AS src_path, m.language AS src_lang,
                  neighbor.node_id AS nb_id, neighbor.path AS nb_path,
                  neighbor.language AS nb_lang,
                  type(r) AS label,
                  startNode(r).node_id AS edge_src, endNode(r).node_id AS edge_tgt
                """,
                node_id=node_id,
                repo_id=repo_id,
            )
            rows = await result.data()

        seen_nodes: dict[str, dict] = {}
        edges: list[dict] = []
        for row in rows:
            seen_nodes[row["src_id"]] = {"id": row["src_id"], "path": row["src_path"], "language": row["src_lang"]}
            seen_nodes[row["nb_id"]] = {"id": row["nb_id"], "path": row["nb_path"], "language": row["nb_lang"]}
            edges.append({"source": row["edge_src"], "target": row["edge_tgt"], "label": row["label"]})

        return {"nodes": list(seen_nodes.values()), "edges": edges}

    async def get_neighbors(self, node_id: str, repo_id: str, hops: int = 2) -> list[dict]:
        """Return node metadata for nodes within `hops` of a given node."""
        async with self._driver.session() as s:
            result = await s.run(
                f"""
                MATCH (src:Module {{node_id: $node_id}})
                MATCH (src)-[*1..{hops}]-(neighbor:Module {{repo_id: $repo_id}})
                RETURN DISTINCT neighbor.node_id AS id,
                       neighbor.path AS path,
                       neighbor.language AS language
                """,
                node_id=node_id,
                repo_id=repo_id,
            )
            return [dict(r) for r in await result.data()]

    async def search_modules_by_path(self, repo_id: str, fragment: str) -> list[dict]:
        async with self._driver.session() as s:
            result = await s.run(
                """
                MATCH (m:Module {repo_id: $repo_id})
                WHERE m.path CONTAINS $fragment
                RETURN m.node_id AS id, m.path AS path, m.language AS language
                LIMIT 20
                """,
                repo_id=repo_id,
                fragment=fragment,
            )
            return [dict(r) for r in await result.data()]

    async def analyze_impact(self, node_id: str, repo_id: str) -> dict:
        """
        Compute impact analysis for a module node:
        - affected_nodes: all downstream nodes reachable via IMPORTS
        - reverse_affected: all upstream nodes (who imports this)
        - max_depth: longest downstream path
        - fan_out: direct children
        - fan_in: direct parents
        Returns a dict with score, risk, metrics, affected_ids, explanation.
        """
        async with self._driver.session() as s:
            # Downstream (forward) reachability — what this node affects
            fwd = await s.run(
                """
                MATCH (src:Module {node_id: $node_id})
                MATCH path = (src)-[:IMPORTS*1..]->(downstream:Module {repo_id: $repo_id})
                RETURN DISTINCT downstream.node_id AS id,
                       downstream.path AS path,
                       length(path) AS depth
                """,
                node_id=node_id,
                repo_id=repo_id,
            )
            fwd_rows = await fwd.data()

            # Upstream (reverse) reachability — who depends on this node
            rev = await s.run(
                """
                MATCH (src:Module {node_id: $node_id})
                MATCH (upstream:Module {repo_id: $repo_id})-[:IMPORTS*1..]->(src)
                RETURN DISTINCT upstream.node_id AS id, upstream.path AS path
                """,
                node_id=node_id,
                repo_id=repo_id,
            )
            rev_rows = await rev.data()

            # Direct fan-out (immediate children)
            fanout_res = await s.run(
                "MATCH (src:Module {node_id: $node_id})-[:IMPORTS]->(c) RETURN count(c) AS n",
                node_id=node_id,
            )
            fanout_data = await fanout_res.data()
            fan_out = fanout_data[0]["n"] if fanout_data else 0

            # Direct fan-in (immediate parents)
            fanin_res = await s.run(
                "MATCH (p)-[:IMPORTS]->(src:Module {node_id: $node_id}) RETURN count(p) AS n",
                node_id=node_id,
            )
            fanin_data = await fanin_res.data()
            fan_in = fanin_data[0]["n"] if fanin_data else 0

        affected_count = len(fwd_rows)
        upstream_count = len(rev_rows)
        max_depth = max((r["depth"] for r in fwd_rows), default=0)

        # Normalize score against a practical max
        raw = (affected_count * 2) + (max_depth * 5) + (fan_out * 3) + (fan_in * 4)
        max_possible = 200  # practical ceiling for typical repos
        impact_score = min(100, int((raw / max_possible) * 100)) if raw > 0 else 0

        if impact_score < 30:
            risk_level = "LOW"
            risk_emoji = "🟢"
        elif impact_score < 70:
            risk_level = "MEDIUM"
            risk_emoji = "🟡"
        else:
            risk_level = "HIGH"
            risk_emoji = "🔴"

        explanation = (
            f"This module has {risk_level} impact. "
            f"It directly or indirectly affects {affected_count} downstream module(s) "
            f"with a maximum dependency depth of {max_depth}. "
            f"{upstream_count} module(s) depend on it (fan-in: {fan_in} direct). "
            f"Changing this file risks breaking {upstream_count} upstream dependent(s)."
        )

        return {
            "node_id": node_id,
            "impact_score": impact_score,
            "risk_level": risk_level,
            "risk_emoji": risk_emoji,
            "metrics": {
                "affected_count": affected_count,
                "upstream_count": upstream_count,
                "max_depth": max_depth,
                "fan_out": fan_out,
                "fan_in": fan_in,
            },
            "affected_nodes": [{"id": r["id"], "path": r["path"], "depth": r["depth"]} for r in fwd_rows],
            "upstream_nodes": [{"id": r["id"], "path": r["path"]} for r in rev_rows],
            "explanation": explanation,
        }

