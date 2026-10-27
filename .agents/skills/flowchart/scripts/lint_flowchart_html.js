#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const DETAIL_MIN_WORDS = 18;
const DETAIL_JARGON_PATTERNS = [
  { label: "LLM", pattern: /\bllm\b/i },
  { label: "API", pattern: /\bapi\b/i },
  { label: "SDK", pattern: /\bsdk\b/i },
  { label: "CLI", pattern: /\bcli\b/i },
  { label: "JSON", pattern: /\bjson\b/i },
  { label: "schema", pattern: /\bschema\b/i },
  { label: "implementation", pattern: /\bimplementation\b/i },
  { label: "orchestration", pattern: /\borchestrat(?:e|es|ed|ing|ion)\b/i },
  { label: "provider", pattern: /\bprovider\b/i },
  { label: "invocation", pattern: /\binvocation\b/i },
  { label: "artifact", pattern: /\bartifact\b/i },
  { label: "stateful/stateless", pattern: /\bstate(?:ful|less)\b/i },
  { label: "deterministic", pattern: /\bdeterministic\b/i },
  { label: "falsifiable", pattern: /\bfalsifiable\b/i },
  { label: "decision-controlling", pattern: /\bdecision-controlling\b/i },
  { label: "fallback chain", pattern: /\bfallback chain\b/i },
  { label: "payload", pattern: /\bpayload\b/i },
  { label: "handler", pattern: /\bhandler\b/i },
  { label: "callback", pattern: /\bcallback\b/i },
  { label: "deserialize", pattern: /\bde-?serializ(?:e|es|ed|ing|ation)\b/i },
  { label: "idempotent", pattern: /\bidempotent\b/i },
  { label: "AST", pattern: /\bast\b/i },
  { label: "DAG", pattern: /\bdag\b/i }
];

function emitLog(severity, event, fields = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    severity: severity.toUpperCase(),
    event,
    ...fields
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
}

function parseArgs(argv) {
  const args = {
    htmlPath: null,
    screenshotPath: null,
    viewport: { width: 1440, height: 1000 }
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--screenshot") {
      args.screenshotPath = argv[index + 1];
      index += 1;
    } else if (value === "--viewport") {
      const [width, height] = String(argv[index + 1] || "").split("x").map((part) => Number(part));
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error("--viewport must use WIDTHxHEIGHT, for example 1440x1000");
      }
      args.viewport = { width, height };
      index += 1;
    } else if (!args.htmlPath) {
      args.htmlPath = value;
    } else {
      throw new Error(`unexpected argument: ${value}`);
    }
  }

  if (!args.htmlPath) {
    throw new Error("usage: node flowchart/scripts/lint_flowchart_html.js output.html [--screenshot /tmp/output.png] [--viewport 1440x1000]");
  }

  return args;
}

function flattenIssues(reports) {
  const issues = [];
  for (const report of reports) {
    for (const issue of report.issues || []) {
      issues.push({ context: report.context, ...issue });
    }
  }
  return issues;
}

function extractFlowchartData(htmlContent) {
  const match = htmlContent.match(/<script id="flowchart-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    return {
      data: null,
      issues: [{
        severity: "error",
        type: "flowchart-data-missing",
        message: "HTML does not contain embedded flowchart data"
      }]
    };
  }

  try {
    return { data: JSON.parse(match[1]), issues: [] };
  } catch (error) {
    return {
      data: null,
      issues: [{
        severity: "error",
        type: "flowchart-data-invalid",
        message: `embedded flowchart data is not valid JSON: ${String(error && error.message ? error.message : error)}`
      }]
    };
  }
}

function nodeText(node) {
  return [
    node.label,
    node.type,
    node.summary,
    node.description,
    ...(Array.isArray(node.badges) ? node.badges : [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function plainWordCount(value) {
  return String(value || "").match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length || 0;
}

function detailJargonHits(value) {
  return DETAIL_JARGON_PATTERNS
    .filter(({ pattern }) => pattern.test(String(value || "")))
    .map(({ label }) => label);
}

function looksCodeLike(value) {
  const text = String(value || "");
  return /```|`[^`]+`|=>|::|\b[A-Za-z0-9_-]+\.(?:js|ts|py|json|yml|yaml|md|html|css)\b/.test(text);
}

function edgeCaptionText(edge) {
  return String((edge && (edge.summary || edge.label)) || "").trim();
}

function normalizedCaption(edge) {
  return edgeCaptionText(edge).toLowerCase().replace(/\s+/g, " ");
}

function auditHtmlShell(htmlContent) {
  const issues = [];
  if (/<h2>\s*Relationships\s*<\/h2>/i.test(htmlContent) || /\bfunction\s+renderRelationships\b/.test(htmlContent)) {
    issues.push({
      severity: "error",
      type: "relationship-section-present",
      message: "the inspector must not render a separate Relationships section"
    });
  }
  if (/Select a node to see[^<]*relationships/i.test(htmlContent)) {
    issues.push({
      severity: "error",
      type: "relationship-empty-state-present",
      message: "inspector empty text must not advertise relationships"
    });
  }
  return issues;
}

function llmFragmentRoles(node) {
  const text = nodeText(node);
  const roles = [];
  if ((node.type || "").toLowerCase() === "prompt" || /\b(prompt|template|rubric|system message|developer message|user message|messages?)\b/.test(text)) {
    roles.push("prompt-detail");
  }
  if (/\b(assemble|build|render|format|compose|fill|prepare)\b.{0,44}\b(prompt|template|message|context)\b/.test(text)) {
    roles.push("prompt-assembly");
  }
  if (/\b(call|invoke|query|ask|send|run|complete|infer)\b.{0,44}\b(llm|model|gpt|claude|openai|anthropic|completion|chat)\b/.test(text) || /\b(llm|model)\s+call\b/.test(text)) {
    roles.push("model-invocation");
  }
  if (/\b(parse|extract|deserialize|validate|normalize|repair)\b.{0,44}\b(response|json|schema|output|result|answer|structured output)\b/.test(text)) {
    roles.push("response-parsing");
  }
  if (/\b(write|save|capture|store)\b.{0,44}\b(response|output|result|answer|artifact)\b/.test(text)) {
    roles.push("output-capture");
  }
  return roles;
}

function isLlmCallNode(node) {
  return (node.type || "").toLowerCase() === "llm-call";
}

function hasPromptOrTemplateContent(node) {
  return (Array.isArray(node.prompts) ? node.prompts : []).some((item) => item && (item.content || item.excerpt));
}

function hasLlmCallSignals(node, roles) {
  const type = (node.type || "").toLowerCase();
  return Boolean(
    node.model
    || (type === "subagent" && hasPromptOrTemplateContent(node))
    || (roles.includes("model-invocation") && Array.isArray(node.prompts) && node.prompts.length)
  );
}

function hasOwnerAgentTurnSignals(node) {
  return /\b(owner step|owner-agent|owner agent|main agent|agent turn|model turn)\b/.test(nodeText(node));
}

function isAgentSkillMap(data) {
  const metadata = data && typeof data.metadata === "object" && data.metadata ? data.metadata : {};
  const text = [
    data.title,
    data.subtitle,
    metadata.purpose,
    metadata.sourceRoot,
    metadata.generatedBy
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(agent|skill|subagent)\b/.test(text) && (data.nodes || []).some(isLlmCallNode);
}

function hasSubstantialDeterministicEvidence(node) {
  const evidence = Array.isArray(node.evidence) ? node.evidence : [];
  return evidence.some((item) => {
    const pathText = String(item && item.path ? item.path : "").toLowerCase();
    const noteText = String(item && item.note ? item.note : "").toLowerCase();
    return /(^|\/)(scripts?|src|lib|bin|cmd|app|packages?)\//.test(pathText)
      || /\.(py|js|mjs|cjs|ts|tsx|jsx|go|rs|java|rb|php|sh|bash|zsh|ps1)$/.test(pathText)
      || /\b(script|tool|command|function|handler|module|deterministic)\b/.test(noteText);
  });
}

function isProcessDecisionOrNote(node) {
  return ["process", "decision", "note"].includes((node.type || "").toLowerCase());
}

function parentSuggestsCognitiveReview(node) {
  return /\b(evaluate|evaluation|judge|judging|review|reviewing|prune|pruning|choose|choosing|check|checking)\b/.test(nodeText(node));
}

function auditFlowchartData(data) {
  const issues = [];
  if (!data || !Array.isArray(data.nodes)) return issues;

  const childrenByParent = new Map();
  const nodeById = new Map();
  const groups = new Map();
  for (const node of data.nodes) {
    nodeById.set(node.id, node);
    const key = node.parent || "__root__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
    if (node.parent) {
      if (!childrenByParent.has(node.parent)) childrenByParent.set(node.parent, []);
      childrenByParent.get(node.parent).push(node.id);
    }
  }

  for (const node of data.nodes) {
    const description = String(node.description || "").trim();
    const summary = String(node.summary || "").trim();
    if (!description) {
      issues.push({
        severity: "error",
        type: "node-detail-missing",
        message: `${node.id} is missing plain-language Detail text`,
        node: node.id
      });
    } else {
      const summaryWords = plainWordCount(summary);
      const detailWords = plainWordCount(description);
      if (detailWords < DETAIL_MIN_WORDS || (summaryWords <= 24 && detailWords < summaryWords + 4)) {
        issues.push({
          severity: "error",
          type: "node-detail-too-short",
          message: `${node.id} Detail text should be somewhat longer than the summary and at least ${DETAIL_MIN_WORDS} words`,
          node: node.id,
          summaryWords,
          detailWords
        });
      }
      const jargon = detailJargonHits(description);
      if (jargon.length) {
        issues.push({
          severity: "error",
          type: "node-detail-jargon",
          message: `${node.id} Detail text should use plain language instead of implementation jargon`,
          node: node.id,
          jargon
        });
      }
      if (looksCodeLike(description)) {
        issues.push({
          severity: "error",
          type: "node-detail-code-like",
          message: `${node.id} Detail text should be prose, not code or file references`,
          node: node.id
        });
      }
    }

    for (const collectionName of ["prompts", "artifacts"]) {
      const collection = Array.isArray(node[collectionName]) ? node[collectionName] : [];
      collection.forEach((item, index) => {
        if (!item || !(item.content || item.excerpt)) return;
        if (!item.summary || !String(item.summary).trim()) {
          issues.push({
            severity: "error",
            type: "content-summary-missing",
            message: `${node.id} ${collectionName}[${index}] has text content but no prose summary`,
            node: node.id,
            collection: collectionName,
            index
          });
        }
      });
    }

    const roles = llmFragmentRoles(node);
    const childIds = childrenByParent.get(node.id) || [];
    if (isLlmCallNode(node)) {
      if (childIds.length) {
        issues.push({
          severity: "error",
          type: "llm-call-has-children",
          message: `${node.id} is an LLM-call node and must not be decomposed into child blocks`,
          node: node.id,
          children: childIds
        });
      }
      if (!node.model || !String(node.model).trim()) {
        issues.push({
          severity: "error",
          type: "llm-call-missing-model",
          message: `${node.id} is an LLM-call node but has no model`,
          node: node.id
        });
      }
      if (!hasPromptOrTemplateContent(node)) {
        issues.push({
          severity: "error",
          type: "llm-call-missing-prompt",
          message: `${node.id} is an LLM-call node but has no prompt/template content`,
          node: node.id
        });
      }
    } else if (hasLlmCallSignals(node, roles)) {
      issues.push({
        severity: "error",
        type: "llm-call-type-missing",
        message: `${node.id} appears to represent a model invocation; use type "llm-call" and include model plus prompt/template details`,
        node: node.id,
        roles
      });
    } else if (childIds.length && hasOwnerAgentTurnSignals(node)) {
      issues.push({
        severity: "error",
        type: "owner-agent-turn-decomposed",
        message: `${node.id} appears to decompose an owner/model turn into child blocks; keep internal reasoning and bookkeeping inside the call node`,
        node: node.id,
        children: childIds
      });
    }
  }

  if (isAgentSkillMap(data)) {
    for (const [parentId, childIds] of childrenByParent) {
      const parent = nodeById.get(parentId);
      const children = childIds.map((id) => nodeById.get(id)).filter(Boolean);
      const hasLlmChild = children.some(isLlmCallNode);
      const parentIsCognitiveReview = parent && parentSuggestsCognitiveReview(parent);
      if (!hasLlmChild && !parentIsCognitiveReview) continue;
      const weakChildren = children.filter((child) => (
        isProcessDecisionOrNote(child)
        && !hasSubstantialDeterministicEvidence(child)
      ));
      if (weakChildren.length) {
        issues.push({
          severity: "error",
          type: "agent-cognitive-child-node",
          message: `${parentId} has process/decision/note child nodes that look like owner-agent cognitive work; fold review/gate/check details into descriptions unless they are substantial deterministic code/tool work`,
          parent: parentId,
          nodes: weakChildren.map((child) => child.id)
        });
      }
    }
  }

  const colorGroupKeys = Array.from(new Set(data.nodes.map((node) => String(node.colorGroup || node.visualGroup || node.group || "").trim()).filter(Boolean)));
  const coloredNodeCount = data.nodes.filter((node) => String(node.colorGroup || node.visualGroup || node.group || "").trim()).length;
  const useColorGroups = colorGroupKeys.length >= 2
    && colorGroupKeys.length <= 6
    && colorGroupKeys.length <= Math.ceil(Math.max(coloredNodeCount, 1) * 0.6);
  const ungroupedCustomColors = data.nodes.filter((node) => node.color && !String(node.colorGroup || node.visualGroup || node.group || "").trim());
  if (ungroupedCustomColors.length) {
    issues.push({
      severity: "error",
      type: "ungrouped-node-color",
      message: "node colors must represent real groups; use colorGroup or omit color",
      nodes: ungroupedCustomColors.map((node) => node.id)
    });
  }
  if (colorGroupKeys.length && !useColorGroups) {
    issues.push({
      severity: "error",
      type: "too-many-color-groups",
      message: "color groups are too close to one color per node; omit color groups or consolidate them into real categories",
      colorGroups: colorGroupKeys,
      coloredNodeCount
    });
  }

  for (const [parentId, siblings] of groups) {
    const matched = siblings
      .map((node) => ({ node, roles: llmFragmentRoles(node) }))
      .filter((item) => item.roles.length);
    const roles = new Set(matched.flatMap((item) => item.roles));
    const hasPromptOnlyNode = matched.some((item) => item.roles.includes("prompt-detail") && !isLlmCallNode(item.node));
    const hasModelInvocationNode = matched.some((item) => item.roles.includes("model-invocation") || isLlmCallNode(item.node));
    if (hasPromptOnlyNode && hasModelInvocationNode) {
      issues.push({
        severity: "error",
        type: "llm-call-overfragmented",
        message: `sibling nodes under ${parentId} appear to split prompt/template text from a model call; attach prompt/template details to the llm-call node`,
        parent: parentId,
        nodes: matched.map((item) => item.node.id),
        roles: Array.from(roles)
      });
    }
  }

  const edges = Array.isArray(data.edges) ? data.edges.filter((edge) => edge && typeof edge === "object") : [];
  for (const [parentId, siblings] of groups) {
    if (parentId === "__root__" || siblings.length < 2) continue;
    const siblingIds = new Set(siblings.map((node) => node.id));
    const boundaryEdges = edges.filter((edge) => (
      edge.source === parentId
      || edge.target === parentId
      || (siblingIds.has(edge.source) && !siblingIds.has(edge.target))
      || (siblingIds.has(edge.target) && !siblingIds.has(edge.source))
    ));
    const weakBoundary = boundaryEdges.filter((edge) => plainWordCount(edgeCaptionText(edge)) < 3);
    if (weakBoundary.length) {
      issues.push({
        severity: "error",
        type: "subgraph-boundary-caption-missing",
        message: `${parentId} has parent-view boundary edges that need plain labels or summaries so readers can tell what enters or leaves the expanded graph`,
        parent: parentId,
        edges: weakBoundary.map((edge) => edge.id || `${edge.source}->${edge.target}`)
      });
    }

    const internalEdges = edges.filter((edge) => siblingIds.has(edge.source) && siblingIds.has(edge.target));
    const outgoingBySource = new Map();
    const incomingByTarget = new Map();
    for (const edge of internalEdges) {
      if (!outgoingBySource.has(edge.source)) outgoingBySource.set(edge.source, []);
      if (!incomingByTarget.has(edge.target)) incomingByTarget.set(edge.target, []);
      outgoingBySource.get(edge.source).push(edge);
      incomingByTarget.get(edge.target).push(edge);
    }

    for (const [sourceId, outgoing] of outgoingBySource) {
      if (outgoing.length <= 1) continue;
      const missing = outgoing.filter((edge) => plainWordCount(edgeCaptionText(edge)) < 3);
      if (missing.length) {
        issues.push({
          severity: "error",
          type: "branch-edge-caption-missing",
          message: `${sourceId} branches to multiple nodes; each branch needs a plain edge label or summary explaining why that path exists`,
          parent: parentId,
          node: sourceId,
          edges: missing.map((edge) => edge.id || `${edge.source}->${edge.target}`)
        });
      }
      const captions = outgoing.map(normalizedCaption).filter(Boolean);
      if (captions.length !== new Set(captions).size) {
        issues.push({
          severity: "error",
          type: "branch-edge-caption-duplicate",
          message: `${sourceId} has branch captions that are not distinct enough for a reader to tell the paths apart`,
          parent: parentId,
          node: sourceId,
          edges: outgoing.map((edge) => edge.id || `${edge.source}->${edge.target}`)
        });
      }
    }

    for (const [targetId, incoming] of incomingByTarget) {
      if (incoming.length <= 1) continue;
      const missing = incoming.filter((edge) => plainWordCount(edgeCaptionText(edge)) < 3);
      if (missing.length) {
        issues.push({
          severity: "error",
          type: "join-edge-caption-missing",
          message: `${targetId} joins multiple paths; each incoming path needs a plain edge label or summary`,
          parent: parentId,
          node: targetId,
          edges: missing.map((edge) => edge.id || `${edge.source}->${edge.target}`)
        });
      }
    }
  }

  return issues;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const htmlPath = path.resolve(args.htmlPath);
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML file does not exist: ${htmlPath}`);
  }
  const htmlContent = fs.readFileSync(htmlPath, "utf8");
  const dataAudit = extractFlowchartData(htmlContent);
  const currentPolicyIssues = [
    ...dataAudit.issues,
    ...auditFlowchartData(dataAudit.data),
    ...auditHtmlShell(htmlContent)
  ];

  const browserMessages = [];
  const executablePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  };
  if (fs.existsSync(executablePath)) {
    launchOptions.executablePath = executablePath;
  }

  emitLog("info", "flowchart_lint_started", {
    htmlPath,
    viewport: args.viewport,
    screenshotPath: args.screenshotPath || null
  });

  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({ viewport: args.viewport });
    page.on("console", (message) => {
      const type = message.type();
      const text = message.text();
      if (type === "warning" || type === "error") {
        browserMessages.push({ type, text });
      }
    });
    page.on("pageerror", (error) => {
      browserMessages.push({ type: "pageerror", text: String(error) });
    });

    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForFunction(() => window.flowchartApp && window.flowchartApp.audit, null, { timeout: 30000 });
    await page.waitForTimeout(250);

    const reports = [];
    reports.push(await page.evaluate(() => window.flowchartApp.audit()));
    reports[0].issues.push(...currentPolicyIssues);

    if (args.screenshotPath) {
      const screenshotPath = path.resolve(args.screenshotPath);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false });
      emitLog("info", "flowchart_lint_screenshot_written", { screenshotPath });
    }

    const expandableIds = await page.evaluate(() => window.flowchartApp.expandableIds());
    if (expandableIds.length) {
      await page.evaluate((nodeId) => {
        const point = window.flowchartApp.nodeCenterForAudit(nodeId, "main");
        if (!point) return;
        const scrollTarget = document.body.scrollHeight > document.documentElement.scrollHeight
          ? document.body
          : (document.scrollingElement || document.documentElement);
        const currentTop = scrollTarget.scrollTop || window.scrollY || 0;
        const absoluteY = currentTop + point.y;
        scrollTarget.scrollTop = Math.max(0, absoluteY - window.innerHeight / 2);
      }, expandableIds[0]);
      await page.waitForTimeout(100);
      const nodeClickTarget = await page.evaluate((nodeId) => window.flowchartApp.nodeCenterForAudit(nodeId, "main"), expandableIds[0]);
      if (nodeClickTarget) {
        await page.mouse.click(nodeClickTarget.x, nodeClickTarget.y);
        await page.waitForTimeout(250);
        reports.push(await page.evaluate((nodeId) => {
          const issues = [];
          const contentVisible = document.getElementById("content-modal").classList.contains("visible");
          const subgraphVisible = document.getElementById("subgraph-modal").classList.contains("visible");
          if (contentVisible || subgraphVisible) {
            issues.push({
              severity: "error",
              type: "node-body-opened-modal",
              message: "clicking an icon-bearing node body must select it only; use the corner icon to open subgraphs or content"
            });
          }
          if (window.flowchartApp.selectedId() !== nodeId) {
            issues.push({
              severity: "error",
              type: "node-body-did-not-select",
              message: "clicking a node body should select it for inspection",
              expected: nodeId,
              selected: window.flowchartApp.selectedId()
            });
          }
          return { context: "node-click-behavior", nodes: 0, edges: 0, zoom: null, issues };
        }, expandableIds[0]));
        await page.evaluate(() => window.flowchartApp.closeModal());
      }
    }

    for (const rootId of expandableIds) {
      await page.evaluate((id) => window.flowchartApp.openSubgraph(id), rootId);
      await page.waitForTimeout(250);
      const report = await page.evaluate(() => window.flowchartApp.auditActiveSubgraph());
      const modalCount = await page.evaluate(() => window.flowchartApp.modalCount());
      if (modalCount > 1) {
        report.issues.push({
          severity: "error",
          type: "modal-depth",
          message: `more than one modal is visible: ${modalCount}`,
          visibleModals: modalCount
        });
      }
      reports.push(report);
      reports.push(await page.evaluate((id) => {
        const data = window.flowchartApp.data();
        const nodes = data.nodes || [];
        const edges = data.edges || [];
        const childIds = new Set(nodes.filter((node) => node.parent === id).map((node) => node.id));
        const internal = edges.filter((edge) => childIds.has(edge.source) && childIds.has(edge.target));
        const hasExternalIncoming = edges.some((edge) => (
          edge.target === id
          || (childIds.has(edge.target) && !childIds.has(edge.source) && edge.source !== id)
        ));
        const hasExternalOutgoing = edges.some((edge) => (
          edge.source === id
          || (childIds.has(edge.source) && !childIds.has(edge.target) && edge.target !== id)
        ));
        const outgoing = new Map();
        for (const edge of internal) {
          outgoing.set(edge.source, (outgoing.get(edge.source) || 0) + 1);
        }
        const hasBranch = Array.from(outgoing.values()).some((count) => count > 1);
        const detailText = document.getElementById("subgraph-detail")?.textContent || "";
        const boundary = window.flowchartApp.activeSubgraphBoundaryForAudit();
        const issues = [];
        if (!/How It Connects/.test(detailText)) {
          issues.push({
            severity: "error",
            type: "subgraph-boundary-missing",
            message: `${id} expanded view must show where the subgraph comes from and where it goes`
          });
        }
        if (window.innerWidth > 700 && hasExternalIncoming && (!boundary.runIn || !boundary.runIn.length)) {
          issues.push({
            severity: "error",
            type: "subgraph-run-in-missing",
            message: `${id} expanded desktop view must show a run-in box/edge for incoming external flow`
          });
        }
        if (window.innerWidth > 700 && hasExternalOutgoing && (!boundary.runOut || !boundary.runOut.length)) {
          issues.push({
            severity: "error",
            type: "subgraph-run-out-missing",
            message: `${id} expanded desktop view must show a run-out box/edge for outgoing external flow`
          });
        }
        const boundaryStyles = window.flowchartApp.activeSubgraphBoundaryStylesForAudit
          ? window.flowchartApp.activeSubgraphBoundaryStylesForAudit()
          : [];
        for (const item of boundaryStyles.filter((style) => style.role === "run-out")) {
          if (item.opacity < 0.99) {
            issues.push({
              severity: "error",
              type: "run-out-node-opacity",
              message: `${id} run-out context box must not fade the whole node because the label must stay readable`,
              node: item.id,
              opacity: item.opacity
            });
          }
          if (item.backgroundOpacity < 0.65 || item.backgroundOpacity > 0.75 || item.borderOpacity < 0.65 || item.borderOpacity > 0.75) {
            issues.push({
              severity: "error",
              type: "run-out-shape-opacity",
              message: `${id} run-out context box shape should be visibly faded while its text stays fully readable`,
              node: item.id,
              backgroundOpacity: item.backgroundOpacity,
              borderOpacity: item.borderOpacity
            });
          }
          if (item.textOpacity < 0.99) {
            issues.push({
              severity: "error",
              type: "run-out-text-opacity",
              message: `${id} run-out context box text must remain fully opaque`,
              node: item.id,
              textOpacity: item.textOpacity
            });
          }
        }
        if (internal.length && !/Flow Notes/.test(detailText)) {
          issues.push({
            severity: "error",
            type: "subgraph-flow-notes-missing",
            message: `${id} expanded view must show edge captions in the sidebar`
          });
        }
        if (hasBranch && !/Branches At/.test(detailText)) {
          issues.push({
            severity: "error",
            type: "subgraph-branch-summary-missing",
            message: `${id} expanded view must make branch points visible in the sidebar`
          });
        }
        const firstBranch = Array.from(outgoing).find(([, count]) => count > 1);
        if (firstBranch) {
          const branchId = firstBranch[0];
          const selected = window.flowchartApp.selectSubgraphNodeForAudit(branchId);
          const selectedText = document.getElementById("subgraph-detail")?.textContent || "";
          if (!selected || !/Flow Notes/.test(selectedText)) {
            issues.push({
              severity: "error",
              type: "branch-node-flow-notes-missing",
              message: `${branchId} must show outgoing branch captions when selected`
            });
          }
          for (const edge of internal.filter((item) => item.source === branchId)) {
            const caption = String(edge.summary || edge.label || "").trim();
            const target = nodes.find((node) => node.id === edge.target)?.label || edge.target;
            if (caption && (!selectedText.includes(caption) || !selectedText.includes(target))) {
              issues.push({
                severity: "error",
                type: "branch-node-flow-caption-missing",
                message: `${branchId} selected Flow Notes must include the path to ${target} and its caption`
              });
            }
          }
        }
        return { context: `subgraph-ui:${id}`, nodes: childIds.size, edges: internal.length, zoom: null, issues };
      }, rootId));
    }

    const modalStructureReport = await page.evaluate(() => {
      const issues = [];
      for (const id of ["close-modal-button", "close-subgraph-button"]) {
        if (document.getElementById(id)) {
          issues.push({
            severity: "error",
            type: "modal-close-button",
            message: `${id} exists; clicking outside is the close affordance`
          });
        }
      }
      return { context: "modal-structure", nodes: 0, edges: 0, zoom: null, issues };
    });
    reports.push(modalStructureReport);

    const contentRenderingReport = await page.evaluate(() => {
      const issues = [];
      const tableHtml = window.flowchartApp.renderFormattedMarkdownForAudit([
        "| Field | Meaning |",
        "| --- | --- |",
        "| claim | Thing to verify |",
        "| evidence | Proof to cite |"
      ].join("\n"));
      const container = document.createElement("div");
      container.innerHTML = tableHtml;
      const table = container.querySelector("table");
      if (!table || table.querySelectorAll("thead th").length !== 2 || table.querySelectorAll("tbody tr").length !== 2) {
        issues.push({
          severity: "error",
          type: "formatted-table-rendering",
          message: "formatted Markdown view must render pipe tables as HTML tables"
        });
      }

      const data = window.flowchartApp.data();
      let target = null;
      for (const node of data.nodes || []) {
        for (const collectionName of ["prompts", "artifacts"]) {
          const collection = node[collectionName] || [];
          const index = collection.findIndex((item) => item && (item.content || item.excerpt));
          if (index >= 0) {
            target = { nodeId: node.id, collectionName, index };
            break;
          }
        }
        if (target) break;
      }
      if (target) {
        const opened = window.flowchartApp.openContentForAudit(target.nodeId, target.collectionName, target.index);
        const summaryText = document.getElementById("content-summary-text")?.textContent?.trim() || "";
        if (!opened || !summaryText) {
          issues.push({
            severity: "error",
            type: "content-summary-empty",
            message: "content modal must show a prose summary above the formatted/plain text tabs"
          });
        }
        const audit = window.flowchartApp.audit();
        for (const issue of audit.issues || []) {
          if (issue.type === "content-modal-horizontal-overflow") {
            issues.push(issue);
          }
        }
        window.flowchartApp.closeModal();
      }

      return { context: "content-rendering", nodes: 0, edges: 0, zoom: null, issues };
    });
    reports.push(contentRenderingReport);

    const contentTarget = await page.evaluate(() => {
      const data = window.flowchartApp.data();
      const nodes = data.nodes || [];
      const childrenOf = (id) => nodes.filter((node) => node.parent === id);
      const hasContent = (node) => (
        (node.prompts || []).some((item) => item.content || item.excerpt)
        || (node.artifacts || []).some((item) => item.content || item.excerpt)
      );
      for (const root of nodes) {
        const child = childrenOf(root.id).find(hasContent);
        if (child) return { rootId: root.id, nodeId: child.id };
      }
      return null;
    });

    if (contentTarget) {
      await page.evaluate((id) => window.flowchartApp.openSubgraph(id), contentTarget.rootId);
      await page.waitForTimeout(250);
      const clicked = await page.evaluate((nodeId) => {
        const button = Array.from(document.querySelectorAll("#subgraph-graph-overlay .node-action-badge.content"))
          .find((item) => item.dataset.nodeId === nodeId);
        if (!button) return false;
        button.click();
        return true;
      }, contentTarget.nodeId);
      if (clicked) {
        await page.waitForTimeout(250);
        reports.push(await page.evaluate(() => {
          const contentVisible = document.getElementById("content-modal").classList.contains("visible");
          const subgraphVisible = document.getElementById("subgraph-modal").classList.contains("visible");
          const backButton = document.getElementById("back-content-button");
          const issues = [];
          if (!contentVisible || subgraphVisible) {
            issues.push({
              severity: "error",
              type: "content-modal-state",
              message: "opening detail from a subgraph should replace the subgraph with one content modal"
            });
          }
          if (!backButton || backButton.classList.contains("hidden")) {
            issues.push({
              severity: "error",
              type: "content-back-missing",
              message: "content opened from a subgraph must show a prominent Back button"
            });
          }
          return { context: "content-navigation", nodes: 0, edges: 0, zoom: null, issues };
        }));
        await page.keyboard.press("Escape");
        await page.waitForTimeout(250);
        reports.push(await page.evaluate(() => {
          const contentVisible = document.getElementById("content-modal").classList.contains("visible");
          const subgraphVisible = document.getElementById("subgraph-modal").classList.contains("visible");
          const issues = [];
          if (contentVisible || !subgraphVisible) {
            issues.push({
              severity: "error",
              type: "escape-back-failed",
              message: "Escape from detail content should restore the previous subgraph view"
            });
          }
          return { context: "content-navigation-escape", nodes: 0, edges: 0, zoom: null, issues };
        }));
      }
    }
    await page.evaluate(() => window.flowchartApp.closeModal());

    for (const message of browserMessages) {
      reports[0].issues.push({
        severity: message.type === "warning" ? "warning" : "error",
        type: `browser-${message.type}`,
        message: message.text
      });
    }

    const issues = flattenIssues(reports);
    for (const report of reports) {
      emitLog("info", "flowchart_lint_context_checked", {
        context: report.context,
        nodes: report.nodes,
        edges: report.edges,
        zoom: report.zoom,
        issueCount: (report.issues || []).length
      });
    }

    if (issues.length) {
      for (const issue of issues) {
        emitLog(issue.severity || "error", "flowchart_lint_issue", issue);
      }
      return 1;
    }

    emitLog("info", "flowchart_lint_passed", {
      checkedContexts: reports.length,
      expandableCount: expandableIds.length
    });
    process.stdout.write("flowchart lint passed\n");
    return 0;
  } finally {
    await browser.close();
  }
}

main().then((exitCode) => {
  process.exit(exitCode);
}).catch((error) => {
  emitLog("error", "flowchart_lint_crashed", { error: String(error && error.stack ? error.stack : error) });
  process.exit(1);
});
