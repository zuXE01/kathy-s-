# Flowchart Composition Guide

Use this guide to turn a complicated thing into a calm, explorable flowchart.

## Extraction Pass

Build the map from source artifacts before designing the graph.

- **Codebases**: identify CLI entrypoints, request handlers, scheduled jobs, service boundaries, imports, data stores, output artifacts, tests, and error paths.
- **Agent skills**: identify trigger, goal, phases, checkpoints, subagents, prompts, references, scripts, validation loops, and reporting shape.
- **Prompt/data pipelines**: identify raw inputs, preprocessing, prompt assembly, model calls, parsing/validation, retries, generated artifacts, evals, and final outputs. Treat model calls as special atomic nodes; treat deterministic code around them as normal code when it is substantial enough to explain separately.
- **Process maps**: identify actors, decisions, handoffs, required evidence, blocked states, side effects, and completion criteria.

Record long prompts and templates verbatim for drilldown. For everything else, use short, to-the-point text that is information dense without relying on jargon, unless that jargon is part of the product or domain being explained. Keep source paths and short line notes where they help a future agent debug or plan changes, but do not make source confidence the product and do not turn the flowchart into a code viewer.

## Hierarchy

Create the overview first as a narrative spine:

1. Entry or trigger
2. Primary transformation phases
3. Decisions or branches that change the path
4. External services or subagents only when they shape the main flow
5. Persistent artifacts and final outputs

Then add drilldown:

- Put retry behavior, failure handling, eval configs, helper functions, prompt text, schemas, and generated files under the node where a reader needs them.
- Usually use one drilldown level for simple repos and two for larger systems.
- Make a node a parent when its children answer "what happens inside this box?" Avoid parent groups that are only visual categories.
- Use `type: "llm-call"` for an LLM invocation. The node must include the prompt or prompt template in `prompts[]` and the default model in `model`. Add short `modelSelection` prose or `tools` only when those details materially change what the reader needs to understand.
- Do not decompose an LLM call below the call boundary. Do not make separate sibling nodes for prompt text, provider/model invocation, ordinary response handling, and ordinary model output handoff. They are details of the `llm-call` node.
- Owner-agent turns, subagent calls, provider API calls, and tool-mediated model calls all count as LLM calls. Do not split internal reasoning, bookkeeping, or plan-framing performed inside one model turn into child nodes.
- For agent skills, do not expand main-agent or owner-agent review into cognitive gate nodes such as "review", "prune", "judge", "rank", "choose", "group", "scope", "gate", or "check" when those happen inside one turn. Keep those as description text, or use separate `llm-call` nodes only when there are distinct model invocations with prompt/template and model details.
- If an agent-skill phase has an `llm-call` child, sibling `process`, `decision`, or `note` children must be substantial deterministic code/tool work with clear source evidence. Prompt context, review rubrics, qualification gates, method ladders, safety checks, grouping decisions, and pruning/merging decisions should be prose on the phase or call node, not child blocks.
- Deterministic prompt construction and deterministic response post-processing may be normal code nodes only when they are extensive or complex enough to matter as their own behavior. Otherwise fold them into the LLM-call node.

## Layout

Compose low-level subtrees first, then place their parents.

- Flow left-to-right. Use x-position for sequence and y-position for parallelism.
- Stack parallel branches vertically, centered around the parent phase.
- Put shared inputs slightly above the flow and shared outputs slightly below it when that reduces crossings.
- Place decisions before the branch they control; place joins where branches reconverge.
- Keep leaf grids regular: columns are steps, rows are alternatives or collaborators.
- Keep spacing compact and regular. Large empty horizontal gaps force zoomed-out detail graphs and make fonts harder to read.
- Route exceptional paths below the main line unless they are the main subject of the user's request.
- If an edge must cross, make it cross at a clear angle and away from labels.

Prefer hand-adjusted `position` values over automatic layout. Automatic layout is acceptable only as a starting point; final output should look composed.

## Visual Grammar

Use a small set of node types and edge types.

Recommended node types:

- `entry`: user action, trigger, CLI, request, schedule
- `phase`: major workflow phase or process box
- `process`: ordinary computation or transformation
- `decision`: branch, validation, gate, checkpoint
- `artifact`: file, generated output, persisted state, report
- `prompt`: prompt, template, rubric, model instruction
- `llm-call`: atomic model invocation with prompt/template and model details
- `external`: API, model provider, database, browser, service
- `subagent`: delegated agent, worker, validator
- `failure`: failure state, blocked state, retry exhaustion
- `note`: context or constraint that affects interpretation

Recommended edge types:

- `flow`: normal sequence
- `data`: data or artifact movement
- `control`: decision/control relationship
- `prompt`: prompt/template/model-call relationship
- `error`: failure, retry, blocked, fallback path
- `evidence`: source/eval/test support

Color should show which nodes are similar. Use `colorGroup` for meaningful groups such as actor, subsystem, trust boundary, runtime, or owner. A color should usually apply to a meaningful group of nodes; avoid using a unique color for a single node unless that node is genuinely an outlier. Do not color by node type by default. If there are not 2-6 meaningful groups, use no node color and no legend.

## Loops

Make loops explicit when repetition matters. A loop should have a visible return edge from the repeated branch back to the step where repetition resumes.

Show loop exits separately. If a process can either finish or repeat, render both branches clearly, such as `continue -> next step` and `retry -> earlier step`.

Route loopbacks predictably above or below the main path, preferably as dashed return paths with enough spacing that they do not read like normal forward steps. If the loopback is hard to draw in the overview, move the loop into a drilldown rather than hiding the repetition.

Label branch conditions tersely. Use short labels like `passes`, `fails`, `retry`, `continue`, or `blocked` instead of long explanatory edge text.

## Labels And Detail

Write graph labels like product UI, not code comments.

- Node label: 2-5 words, specific noun or verb phrase.
- Use short words that wrap cleanly. The renderer will not split a long word in the middle, so abbreviate or rename labels before accepting overflow.
- Summary: one sentence that explains why the node matters.
- Description: a short paragraph or bullets for the inspector.
- Badge: terse state or role, such as `stateful`, `retry`, `JSON`, `external`, `side effect`.

For LLM-call, prompt, and template details:

- Copy prompts and prompt templates verbatim into `prompts[].content`.
- Add a short prose `summary` to every prompt, template, or artifact item that has `content` or `excerpt`; the viewer shows this above both formatted and plain text tabs.
- For non-prompt artifacts and details, use short plain-language prose. Include code only when the user specifically needs code-level inspection.
- Set `language` to `markdown`, `python`, `javascript`, `typescript`, `bash`, `json`, `yaml`, `jinja2`, or another Prism-supported language.
- Markdown pipe tables are allowed in content and render as tables in the formatted view. Keep tables narrow enough to scan, and put the original text in the plain text tab.
- Keep the graph label short; let the modal carry the long text.
- Prefer attaching prompt/template content to the workflow node that consumes it. A node can and often should contain multiple `prompts[]` entries, such as system, developer, and user prompts. Create a separate prompt node only when the prompt itself is a reusable artifact or a branch point, not merely because an LLM call has prompt text.
- Every `llm-call` node needs `model` plus at least one prompt/template entry. Add `modelSelection` and `tools` only as short comprehension notes.

## Calibration Notes

For an agent workflow skill, the overview should show: frame goal, discover inputs, choose an approach, run worker agents or tools, evaluate results, report. Finder, strategist, and validator model invocations should be `llm-call` nodes with prompts and model details. Owner/main-agent pruning, judging, and reporting responsibilities should stay in descriptions unless they are separate model invocations.

For a repo like `summarize-dnd`, the overview should show: choose input, transcribe or read transcript, identify speakers, generate long narrative, generate final summary, write artifacts. Prompt constants, generated prompt files, AssemblyAI state, LiteLLM retries, eval templates, and promptfoo configs belong under those phases.

## Final Review

Ask these questions while looking at the rendered HTML:

- What can the viewer understand before clicking anything?
- Which node would they click first to debug a failure?
- Which node would they click first to plan a change?
- Are prompts and templates close to the phase that uses them?
- Are error paths visible enough to be found but not loud enough to dominate?
