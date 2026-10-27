# Flowchart Data Model

Author a working JSON file, then render it with `scripts/render_flowchart.py`. The JSON is an intermediate authoring format. Unless the user explicitly asks for source data, the final deliverable should be only the rendered HTML file.

## Top Level

```json
{
  "title": "System Name",
  "subtitle": "What this visualization explains",
  "metadata": {
    "purpose": "onboarding | debugging | change-planning",
    "sourceRoot": "/path/to/source",
    "generatedBy": "flowchart skill"
  },
  "views": [],
  "nodes": [],
  "edges": [],
  "colorGroups": {
    "owner": { "label": "Owner", "color": "#dbeafe" },
    "worker": { "label": "Worker", "color": "#dcfce7" }
  }
}
```

`title`, `nodes`, and `edges` are required. `subtitle`, `metadata`, `views`, and `colorGroups` are optional.

## Nodes

```json
{
  "id": "generate-short",
  "label": "Generate Short Summary",
  "type": "phase",
  "level": 2,
  "lane": "LLM pipeline",
  "colorGroup": "worker",
  "parent": "final-summary",
  "position": { "x": 820, "y": 260 },
  "summary": "Builds briefing and final-block prompts from the long narrative.",
  "description": "This step prepares the text the model will read before writing the short summary. It keeps the prompt and model details with the call so the reader sees one complete action.",
  "badges": ["2 model calls", "writes prompts"],
  "expanded": false,
  "evidence": [
    { "label": "stage_generate_short", "path": "summary_writer.py", "lines": "998-1068" }
  ],
  "prompts": [
    {
      "label": "Final summary prompt",
      "language": "python",
      "path": "summary_writer.py",
      "summary": "This template turns the briefing into the final user-facing short summary.",
      "content": "FINAL_SUMMARY_FROM_BRIEFING = \"\"\"...\"\"\""
    }
  ],
  "artifacts": [
    {
      "label": "final_prompt_short.txt",
      "language": "markdown",
      "summary": "This artifact is the generated prompt text passed to the summary model.",
      "content": "Plain-language description of a useful artifact, not a code dump."
    }
  ]
}
```

LLM calls are special atomic nodes:

```json
{
  "id": "finder-agent-call",
  "label": "Finder Agent",
  "type": "llm-call",
  "level": 2,
  "lane": "Agents",
  "position": { "x": 620, "y": 180 },
  "summary": "Finds falsifiable assumptions the plan depends on.",
  "description": "One model call reads the goal and surrounding context, then returns candidate assumptions for the owner to review. The prompt and model choice stay on this node so the call remains easy to understand.",
  "model": "default Codex model",
  "modelSelection": "Uses the session's default agent model unless the caller explicitly requests a different agent size.",
  "tools": ["repo read access"],
  "prompts": [
    {
      "label": "Finder prompt template",
      "language": "markdown",
      "sourcePath": "skills/example/references/prompts.md",
      "summary": "This prompt asks the finder to identify assumptions in the framed plan.",
      "content": "You are finding the assumptions in a plan..."
    }
  ]
}
```

Required node fields: `id`, `label`, `type`, `summary`, `description`.

Important fields:

- `parent`: creates an expandable subtree. Parent IDs must exist. Rendered expansion opens in a single modal layer; it must not add children to the main canvas.
- `level`: hierarchy/sequence depth. The template uses it for fallback x-position.
- `lane`: vertical grouping. The template uses it for fallback y-position.
- `position`: hand-tuned absolute canvas coordinates. Prefer this for final output.
- `expanded`: set true only for nodes whose children should be visible on first load.
- `description`: inspector Detail text. Make this somewhat longer than the summary when the summary is short, usually two plain sentences or more. Use short, to-the-point text that is information dense without relying on jargon, unless that jargon is part of the product or domain being explained.
- `prompts`: long prompts, rubrics, model instructions, and templates. These open in the highlighted modal. A node may contain one or more prompts; use multiple entries for system/developer/user messages or multiple calls owned by the same workflow node.
- Prompt and template items with `content` or `excerpt` must include a short prose `summary`; the modal shows it above both formatted and plain text views. They should include `path` or `sourcePath` when the original file is known so the HTML can link back to the source.
- `colorGroup`: optional. Use color to show which nodes are similar, such as actor, subsystem, trust boundary, runtime, or owner. A color should usually apply to a meaningful group of nodes. Avoid using a unique color for a single node unless that node is genuinely an outlier. The renderer shows a legend only when there are 2-6 meaningful groups and the groups are not effectively one color per node.
- `model`: required for `type: "llm-call"`. Name the model used by default.
- `modelSelection`: optional short prose for `type: "llm-call"` when model choice is dynamic or non-obvious.
- `tools`: optional short string or string array for `type: "llm-call"` when tool/function access materially affects what happens.
- `artifacts`: files, outputs, schemas, generated prompts, or reports. Use `content` for friendly prose or compact examples, not broad code dumps. Artifact items with `content` or `excerpt` must include a short prose `summary`.
- `evidence`: source pointers for future debugging or change planning.

## Edges

```json
{
  "id": "named-to-long",
  "source": "identify-speakers",
  "target": "generate-long",
  "type": "flow",
  "label": "named transcript",
  "summary": "The named transcript becomes the input for the long narrative prompt.",
  "evidence": [
    { "label": "next_actions", "path": "summary_writer.py", "lines": "936-941" }
  ]
}
```

Required edge fields: `source`, `target`, `type`.

Use these edge types unless a better domain-specific type is needed:

- `flow`: ordinary sequence
- `data`: data/artifact transfer
- `control`: decision, gate, fan-out, or join
- `prompt`: prompt/template/model-call relationship
- `error`: failure, retry, fallback, blocked path
- `evidence`: test/eval/source support

The HTML renderer keeps edge labels off the graph canvas and does not show a separate Relationships section. In expanded subgraphs, the sidebar uses edge `label` and `summary` values as flow notes. Write terse condition labels such as `passes`, `fails`, `retry`, `continue`, or `blocked` when they explain boundary context, branch reasons, joins, retries, or exits. Put longer explanation in node Detail text.

For branch edges, make the path difference explicit:

```json
[
  {
    "id": "brief-safe-check",
    "source": "target-brief",
    "target": "safe-validator",
    "type": "control",
    "label": "safe check",
    "summary": "This path can gather proof without changing files or outside systems."
  },
  {
    "id": "brief-approval-check",
    "source": "target-brief",
    "target": "approval-validator",
    "type": "control",
    "label": "may need approval",
    "summary": "This path stops if the proof would require a change that needs the user's approval."
  }
]
```

## Views

Views are optional. Use them to provide task-specific filters or highlights without creating multiple HTML files.

```json
{
  "id": "debugging",
  "label": "Debug",
  "description": "Highlights failure and retry paths.",
  "rootNodeIds": ["pipeline"],
  "highlightNodeIds": ["call-llm", "transcription-retry", "stage-failure"]
}
```

`rootNodeIds` limits the visible graph to those subtrees. `highlightNodeIds` adds visual emphasis.

## Authoring Rules

- Use stable IDs in lowercase kebab-case.
- Keep labels short enough to fit in nodes.
- Give every top-level node a position.
- Keep child nodes near the parent. Children should form a readable grid.
- In each subgraph, make the entry node and exit node obvious from the edge structure. The expanded sidebar will infer "comes from", "starts inside", "goes to", and "ends inside" from the parent edges and child edges.
- On desktop-sized expanded views, the renderer adds run-in and run-out context boxes from parent and external edges. Keep parent-level incoming/outgoing edges accurate so those outside blocks can be shown on the canvas. Run-out context boxes show where work leaves for other blocks and are rendered with a faded block shape while preserving fully readable text. On narrow mobile views, the sidebar boundary text remains the fallback when extra boxes would make the graph too dense.
- If one child node fans out to multiple child nodes, each outgoing branch edge must have distinct plain `label` or `summary` text. The reader should be able to tell why each path exists by selecting the branch node.
- If multiple paths join, each incoming edge should explain what that path contributes before the join.
- Space sibling nodes so their rendered shapes do not overlap, and route edges so they do not pass behind unrelated sibling nodes.
- Use `type: "llm-call"` for model invocations when the model call matters to understanding the workflow.
- Every `llm-call` node must have a non-empty `model` and at least one `prompts[]` item with `content` or `excerpt`.
- Do not give an `llm-call` node children. One model call is already the lowest LLM decomposition level.
- Do not split one model call into sibling nodes for prompt text, provider invocation, ordinary response handling, or ordinary model output handoff. Attach the prompt/template and model details through `prompts`, `model`, `modelSelection`, and `tools`.
- Deterministic prompt construction or response post-processing may be a separate normal code node only when it is extensive or complex enough to matter as its own behavior. Otherwise fold it into the LLM-call node.
- In agent-skill maps, do not use child `process`, `decision`, or `note` nodes for owner/main-agent cognitive gates such as reviewing, pruning, judging, ranking, choosing, grouping, scoping, or checking. Those belong in descriptions unless they are separate `llm-call` nodes or substantial deterministic tool/script work with clear source evidence.
- Prefer left-to-right canvas edges, but make loops explicit when repetition matters. A loop should have a visible return edge from the repeated branch back to the step where repetition resumes.
- Show loop exits separately. If a process can either finish or repeat, render both branches clearly, such as `continue -> next step` and `retry -> earlier step`.
- Route loopbacks predictably above or below the main path, preferably as dashed return paths with enough spacing that they do not read like normal forward steps. If a loopback cannot be routed cleanly without crossing unrelated nodes, simplify the view or move detail into a drilldown before omitting the loop from the canvas.
- Narrow mobile views may also omit backward, long skip, or node-crossing edges from the canvas to preserve legibility. Put the important branch, join, and boundary meaning into edge `label` or `summary` values so the sidebar still explains the flow.
- Attach prompts and templates to the phase that consumes them.
- Put generated files and persistent state as `artifact` nodes when they affect debugging or change planning.
- Show prompts and prompt templates verbatim. For non-prompt details, use short, to-the-point text that is information dense without relying on jargon, unless that jargon is part of the product or domain being explained. Put long text in `prompts` or `artifacts`, not in `label`.
- Use `colorGroup` only for meaningful categories. Color should show which nodes are similar. Do not set individual `color` values just to make nodes look different, and avoid one-off colors unless the node is genuinely an outlier. If almost every colored node would have its own group, omit color groups and let the renderer hide the legend.
- Use normal-weight labels and short wrapped text. The renderer uses a standard box size and wraps only at word boundaries; rename labels instead of relying on wider boxes, tiny fonts, or mid-word breaks.
- Keep exploration affordances outside labels. Expandable/content-bearing nodes will receive top-right action badges, so labels should not include manual icons.
- The node body is for selection and inspection only. Expansion and content opening happen from the top-right action badges.
- Use clear edge structure and positions for parallel paths. The renderer offsets fan-out, fan-in, and same-corridor edges with visible whitespace between strokes, but readable source/target placement still matters.
- Validate before rendering: `python3 flowchart/scripts/render_flowchart.py data.json --validate-only`.
- Lint after rendering: `node flowchart/scripts/lint_flowchart_html.js output.html`. Use `--screenshot /tmp/output.png` for temporary PNG inspection, not as a delivered artifact.
- Remove the working JSON from the deliverable/output directory after rendering unless the user requested it.
