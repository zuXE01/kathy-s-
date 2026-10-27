#!/usr/bin/env python3
"""Render a composed flowchart JSON file into the bundled interactive HTML shell."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = SKILL_ROOT / "assets" / "flowchart-template.html"
SENTINEL = "__FLOWCHART_DATA__"
DETAIL_MIN_WORDS = 18
DETAIL_JARGON_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("LLM", re.compile(r"\bllm\b", re.IGNORECASE)),
    ("API", re.compile(r"\bapi\b", re.IGNORECASE)),
    ("SDK", re.compile(r"\bsdk\b", re.IGNORECASE)),
    ("CLI", re.compile(r"\bcli\b", re.IGNORECASE)),
    ("JSON", re.compile(r"\bjson\b", re.IGNORECASE)),
    ("schema", re.compile(r"\bschema\b", re.IGNORECASE)),
    ("implementation", re.compile(r"\bimplementation\b", re.IGNORECASE)),
    ("orchestration", re.compile(r"\borchestrat(?:e|es|ed|ing|ion)\b", re.IGNORECASE)),
    ("provider", re.compile(r"\bprovider\b", re.IGNORECASE)),
    ("invocation", re.compile(r"\binvocation\b", re.IGNORECASE)),
    ("artifact", re.compile(r"\bartifact\b", re.IGNORECASE)),
    ("stateful/stateless", re.compile(r"\bstate(?:ful|less)\b", re.IGNORECASE)),
    ("deterministic", re.compile(r"\bdeterministic\b", re.IGNORECASE)),
    ("falsifiable", re.compile(r"\bfalsifiable\b", re.IGNORECASE)),
    ("decision-controlling", re.compile(r"\bdecision-controlling\b", re.IGNORECASE)),
    ("fallback chain", re.compile(r"\bfallback chain\b", re.IGNORECASE)),
    ("payload", re.compile(r"\bpayload\b", re.IGNORECASE)),
    ("handler", re.compile(r"\bhandler\b", re.IGNORECASE)),
    ("callback", re.compile(r"\bcallback\b", re.IGNORECASE)),
    ("deserialize", re.compile(r"\bde-?serializ(?:e|es|ed|ing|ation)\b", re.IGNORECASE)),
    ("idempotent", re.compile(r"\bidempotent\b", re.IGNORECASE)),
    ("AST", re.compile(r"\bast\b", re.IGNORECASE)),
    ("DAG", re.compile(r"\bdag\b", re.IGNORECASE)),
)
CODE_LIKE_DETAIL_RE = re.compile(
    r"```|`[^`]+`|=>|::|\b[A-Za-z0-9_-]+\.(?:js|ts|py|json|yml|yaml|md|html|css)\b"
)


def emit_log(severity: str, event: str, **fields: Any) -> None:
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "severity": severity.upper(),
        "event": event,
        **fields,
    }
    print(json.dumps(payload, ensure_ascii=True, sort_keys=True), file=sys.stderr)


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as input_file:
            data = json.load(input_file)
    except OSError as exc:
        emit_log("error", "flowchart_data_read_failed", path=str(path), error=str(exc))
        raise
    except json.JSONDecodeError as exc:
        emit_log(
            "error",
            "flowchart_data_parse_failed",
            path=str(path),
            line=exc.lineno,
            column=exc.colno,
            error=exc.msg,
        )
        raise

    if not isinstance(data, dict):
        raise ValueError("flowchart data must be a JSON object")
    return data


def plain_word_count(value: Any) -> int:
    return len(re.findall(r"[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?", str(value or "")))


def detail_jargon_hits(value: str) -> list[str]:
    return [label for label, pattern in DETAIL_JARGON_PATTERNS if pattern.search(value)]


def edge_caption_text(edge: dict[str, Any]) -> str:
    return str(edge.get("summary") or edge.get("label") or "").strip()


def validate_flowchart(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    if not isinstance(data.get("title"), str) or not data["title"].strip():
        errors.append("top-level title must be a non-empty string")

    nodes = data.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        errors.append("top-level nodes must be a non-empty array")
        nodes = []

    edges = data.get("edges")
    if edges is None:
        data["edges"] = []
        edges = []
    if not isinstance(edges, list):
        errors.append("top-level edges must be an array")
        edges = []

    node_ids: set[str] = set()
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            errors.append(f"nodes[{index}] must be an object")
            continue
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id.strip():
            errors.append(f"nodes[{index}].id must be a non-empty string")
            continue
        if node_id in node_ids:
            errors.append(f"duplicate node id: {node_id}")
        node_ids.add(node_id)

        for field_name in ("label", "type", "summary", "description"):
            if not isinstance(node.get(field_name), str) or not node[field_name].strip():
                errors.append(f"node {node_id} missing non-empty {field_name}")

        description = str(node.get("description") or "").strip()
        summary = str(node.get("summary") or "").strip()
        if description:
            summary_words = plain_word_count(summary)
            detail_words = plain_word_count(description)
            if detail_words < DETAIL_MIN_WORDS or (summary_words <= 24 and detail_words < summary_words + 4):
                errors.append(
                    f"node {node_id} description must be plain Detail text of at least "
                    f"{DETAIL_MIN_WORDS} words and somewhat longer than a short summary "
                    f"(summary_words={summary_words}, detail_words={detail_words})"
                )

            jargon = detail_jargon_hits(description)
            if jargon:
                errors.append(
                    f"node {node_id} description uses implementation jargon instead of plain prose: "
                    f"{', '.join(jargon)}"
                )

            if CODE_LIKE_DETAIL_RE.search(description):
                errors.append(f"node {node_id} description must be prose, not code or file references")

        parent_id = node.get("parent")
        if parent_id is not None and (not isinstance(parent_id, str) or not parent_id.strip()):
            errors.append(f"node {node_id} parent must be a non-empty string when present")

        position = node.get("position")
        if position is not None:
            if not isinstance(position, dict):
                errors.append(f"node {node_id} position must be an object")
            else:
                for axis in ("x", "y"):
                    if not isinstance(position.get(axis), (int, float)):
                        errors.append(f"node {node_id} position.{axis} must be numeric")

        for collection_name in ("prompts", "artifacts", "evidence"):
            collection = node.get(collection_name, [])
            if collection is None:
                continue
            if not isinstance(collection, list):
                errors.append(f"node {node_id} {collection_name} must be an array")

        for collection_name in ("prompts", "artifacts"):
            collection = node.get(collection_name, [])
            if not isinstance(collection, list):
                continue
            for item_index, item in enumerate(collection):
                if not isinstance(item, dict):
                    continue
                if item.get("content") or item.get("excerpt"):
                    summary = item.get("summary")
                    if not isinstance(summary, str) or not summary.strip():
                        errors.append(
                            f"node {node_id} {collection_name}[{item_index}] has text content but no prose summary"
                        )

        if node.get("type") == "llm-call":
            model = node.get("model")
            if not isinstance(model, str) or not model.strip():
                errors.append(f"llm-call node {node_id} missing non-empty model")

            prompts = node.get("prompts")
            if not isinstance(prompts, list) or not any(
                isinstance(item, dict) and (item.get("content") or item.get("excerpt"))
                for item in prompts
            ):
                errors.append(f"llm-call node {node_id} missing prompt/template content")

    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = node.get("id")
        parent_id = node.get("parent")
        if isinstance(node_id, str) and isinstance(parent_id, str) and parent_id not in node_ids:
            errors.append(f"node {node_id} parent does not exist: {parent_id}")
        if isinstance(node_id, str) and node.get("type") == "llm-call":
            child_ids = [
                child.get("id")
                for child in nodes
                if isinstance(child, dict) and child.get("parent") == node_id
            ]
            if child_ids:
                errors.append(f"llm-call node {node_id} must not have child nodes: {', '.join(str(item) for item in child_ids)}")

    edge_ids: set[str] = set()
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            errors.append(f"edges[{index}] must be an object")
            continue
        source = edge.get("source")
        target = edge.get("target")
        edge_type = edge.get("type")
        edge_id = edge.get("id")

        if edge_id is None:
            edge["id"] = f"edge-{index + 1}"
        elif not isinstance(edge_id, str) or not edge_id.strip():
            errors.append(f"edges[{index}].id must be a non-empty string when present")
        elif edge_id in edge_ids:
            errors.append(f"duplicate edge id: {edge_id}")
        if isinstance(edge.get("id"), str):
            edge_ids.add(edge["id"])

        if not isinstance(source, str) or source not in node_ids:
            errors.append(f"edge {edge.get('id', index)} source does not exist: {source}")
        if not isinstance(target, str) or target not in node_ids:
            errors.append(f"edge {edge.get('id', index)} target does not exist: {target}")
        if not isinstance(edge_type, str) or not edge_type.strip():
            errors.append(f"edge {edge.get('id', index)} missing non-empty type")

    children_by_parent: dict[str, list[dict[str, Any]]] = {}
    for node in nodes:
        if not isinstance(node, dict):
            continue
        parent_id = node.get("parent")
        node_id = node.get("id")
        if isinstance(parent_id, str) and isinstance(node_id, str):
            children_by_parent.setdefault(parent_id, []).append(node)

    valid_edges = [
        edge
        for edge in edges
        if isinstance(edge, dict)
        and isinstance(edge.get("source"), str)
        and isinstance(edge.get("target"), str)
    ]
    for parent_id, children in children_by_parent.items():
        if len(children) < 2:
            continue
        child_ids = {str(child["id"]) for child in children if isinstance(child.get("id"), str)}
        boundary_edges = [
            edge
            for edge in valid_edges
            if edge.get("source") == parent_id
            or edge.get("target") == parent_id
            or (edge.get("source") in child_ids and edge.get("target") not in child_ids)
            or (edge.get("target") in child_ids and edge.get("source") not in child_ids)
        ]
        weak_boundary = [edge for edge in boundary_edges if plain_word_count(edge_caption_text(edge)) < 3]
        if weak_boundary:
            edge_names = ", ".join(str(edge.get("id") or f"{edge.get('source')}->{edge.get('target')}") for edge in weak_boundary)
            errors.append(
                f"subgraph {parent_id} has boundary edges that need plain labels or summaries of at "
                f"least 3 words so readers can tell what enters or leaves: {edge_names}"
            )

        internal_edges = [
            edge
            for edge in valid_edges
            if edge.get("source") in child_ids and edge.get("target") in child_ids
        ]
        outgoing_by_source: dict[str, list[dict[str, Any]]] = {}
        incoming_by_target: dict[str, list[dict[str, Any]]] = {}
        for edge in internal_edges:
            outgoing_by_source.setdefault(str(edge["source"]), []).append(edge)
            incoming_by_target.setdefault(str(edge["target"]), []).append(edge)

        for source_id, outgoing in outgoing_by_source.items():
            if len(outgoing) <= 1:
                continue
            weak = [edge for edge in outgoing if plain_word_count(edge_caption_text(edge)) < 3]
            if weak:
                edge_names = ", ".join(str(edge.get("id") or f"{edge.get('source')}->{edge.get('target')}") for edge in weak)
                errors.append(
                    f"node {source_id} branches inside {parent_id}; each branch edge needs a plain label "
                    f"or summary of at least 3 words: {edge_names}"
                )

            captions = [
                " ".join(edge_caption_text(edge).lower().split())
                for edge in outgoing
                if edge_caption_text(edge)
            ]
            if len(captions) != len(set(captions)):
                edge_names = ", ".join(str(edge.get("id") or f"{edge.get('source')}->{edge.get('target')}") for edge in outgoing)
                errors.append(
                    f"node {source_id} branch edge captions inside {parent_id} are not distinct enough: {edge_names}"
                )

        for target_id, incoming in incoming_by_target.items():
            if len(incoming) <= 1:
                continue
            weak = [edge for edge in incoming if plain_word_count(edge_caption_text(edge)) < 3]
            if weak:
                edge_names = ", ".join(str(edge.get("id") or f"{edge.get('source')}->{edge.get('target')}") for edge in weak)
                errors.append(
                    f"node {target_id} joins paths inside {parent_id}; each incoming edge needs a plain "
                    f"label or summary of at least 3 words: {edge_names}"
                )

    views = data.get("views", [])
    if views is None:
        return errors
    if not isinstance(views, list):
        errors.append("views must be an array when present")
        return errors

    view_ids: set[str] = set()
    for index, view in enumerate(views):
        if not isinstance(view, dict):
            errors.append(f"views[{index}] must be an object")
            continue
        view_id = view.get("id")
        if not isinstance(view_id, str) or not view_id.strip():
            errors.append(f"views[{index}].id must be a non-empty string")
        elif view_id in view_ids:
            errors.append(f"duplicate view id: {view_id}")
        else:
            view_ids.add(view_id)

        for field_name in ("rootNodeIds", "highlightNodeIds"):
            ids = view.get(field_name, [])
            if ids is None:
                continue
            if not isinstance(ids, list):
                errors.append(f"view {view_id} {field_name} must be an array")
                continue
            for node_id in ids:
                if node_id not in node_ids:
                    errors.append(f"view {view_id} references unknown node {node_id}")

    return errors


def json_for_script(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=True, indent=2).replace("</", "<\\/")


def render_html(data: dict[str, Any], output_path: Path) -> None:
    try:
        template = TEMPLATE_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        emit_log("error", "template_read_failed", path=str(TEMPLATE_PATH), error=str(exc))
        raise

    if SENTINEL not in template:
        raise RuntimeError(f"template sentinel not found: {SENTINEL}")

    html = template.replace(SENTINEL, json_for_script(data))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    emit_log(
        "info",
        "flowchart_html_written",
        output_path=str(output_path),
        node_count=len(data.get("nodes", [])),
        edge_count=len(data.get("edges", [])),
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render an interactive flowchart HTML file.")
    parser.add_argument("data", help="Path to flowchart JSON data")
    parser.add_argument("output", nargs="?", help="Path to output HTML file")
    parser.add_argument("--validate-only", action="store_true", help="Validate JSON and exit")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    data_path = Path(args.data)

    try:
        data = load_json(data_path)
        errors = validate_flowchart(data)
    except Exception as exc:
        emit_log("error", "flowchart_validation_crashed", error=str(exc))
        return 1

    if errors:
        for error in errors:
            emit_log("error", "flowchart_validation_error", message=error)
        return 1

    emit_log(
        "info",
        "flowchart_data_validated",
        data_path=str(data_path),
        node_count=len(data.get("nodes", [])),
        edge_count=len(data.get("edges", [])),
    )

    if args.validate_only:
        return 0

    if not args.output:
        emit_log("error", "flowchart_output_missing", message="output path required unless --validate-only is set")
        return 1

    try:
        render_html(data, Path(args.output))
    except Exception as exc:
        emit_log("error", "flowchart_render_failed", error=str(exc))
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
