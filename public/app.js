const elements = {
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  sourceType: document.getElementById("sourceType"),
  templateName: document.getElementById("templateName"),
  deterministic: document.getElementById("deterministic"),
  strictness: document.getElementById("strictness"),
  strictnessLabel: document.getElementById("strictnessLabel"),
  promptVersion: document.getElementById("promptVersion"),
  sourceText: document.getElementById("sourceText"),
  outputPreview: document.getElementById("outputPreview"),
  loadExample: document.getElementById("loadExample"),
  generate: document.getElementById("generate"),
  copyJson: document.getElementById("copyJson"),
  exportMd: document.getElementById("exportMd"),
  exportHtml: document.getElementById("exportHtml"),
  exportDocx: document.getElementById("exportDocx")
};

let state = {
  config: null,
  lastOutput: null,
  exampleIdx: 0
};

const saveLocalSettings = () => {
  const settings = {
    model: elements.model.value,
    templateName: elements.templateName.value,
    deterministic: elements.deterministic.checked,
    strictness: elements.strictness.value,
    promptVersion: elements.promptVersion.value
  };
  localStorage.setItem("faqGeneratorSettings", JSON.stringify(settings));
};

const loadLocalSettings = () => {
  const savedRaw = localStorage.getItem("faqGeneratorSettings");
  if (!savedRaw) return;
  try {
    const saved = JSON.parse(savedRaw);
    if (saved.model) elements.model.value = saved.model;
    if (saved.templateName) elements.templateName.value = saved.templateName;
    elements.deterministic.checked = Boolean(saved.deterministic);
    if (saved.strictness) elements.strictness.value = saved.strictness;
    if (saved.promptVersion) elements.promptVersion.value = saved.promptVersion;
  } catch {
    // Ignore corrupted local storage.
  }
};

const populateConfig = async () => {
  const response = await fetch("/api/config");
  const config = await response.json();
  state.config = config;

  elements.model.innerHTML = config.models
    .map((model) => `<option value="${model}">${model}</option>`)
    .join("");

  const templateKeys = Object.keys(config.templates);
  elements.templateName.innerHTML = templateKeys
    .map((key) => `<option value="${key}">${config.templates[key].name}</option>`)
    .join("");

  elements.promptVersion.value = config.templateVersion;
  loadLocalSettings();
  updateStrictnessLabel();
};

const updateStrictnessLabel = () => {
  elements.strictnessLabel.textContent = Number(elements.strictness.value).toFixed(2);
};

const renderOutput = (output) => {
  state.lastOutput = output;
  elements.outputPreview.textContent = JSON.stringify(output, null, 2);
};

const pickExample = () => {
  if (!state.config?.examples?.length) return;
  const example = state.config.examples[state.exampleIdx % state.config.examples.length];
  state.exampleIdx += 1;

  elements.sourceType.value = example.sourceType;
  elements.sourceText.value = example.input;
};

const generate = async () => {
  const body = {
    apiKey: elements.apiKey.value.trim(),
    model: elements.model.value,
    sourceType: elements.sourceType.value,
    templateName: elements.templateName.value,
    deterministic: elements.deterministic.checked,
    strictness: Number(elements.strictness.value),
    promptVersion: elements.promptVersion.value.trim(),
    sourceText: elements.sourceText.value.trim()
  };

  elements.generate.disabled = true;
  elements.generate.textContent = "Generating...";

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.details || result.error || "Generation failed");
    }

    renderOutput(result.data);
    saveLocalSettings();
  } catch (error) {
    renderOutput({ error: error.message });
  } finally {
    elements.generate.disabled = false;
    elements.generate.textContent = "Generate FAQ Output";
  }
};

const downloadText = (filename, text, type = "text/plain") => {
  const blob = new Blob([text], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const toMarkdown = (output) => {
  const escalations = output.escalationGuidance
    .map((x) => `- **${x.trigger}** → ${x.team}: ${x.reason}`)
    .join("\n");

  const related = output.relatedFaqs.map((x) => `- ${x}`).join("\n");

  const checks = output.hallucinationChecklist
    .map((x) => `- [${x.status.toUpperCase()}] ${x.check}: ${x.notes}`)
    .join("\n");

  return `# FAQ Generator Output\n\n## Question Rewrite\n${output.questionRewrite}\n\n## Short Answer\n${output.shortAnswer}\n\n## Full Answer\n${output.fullAnswer}\n\n## Escalation Guidance\n${escalations}\n\n## Related FAQs\n${related}\n\n## Schema-ready Output\n\n\`\`\`json\n${JSON.stringify(output.schemaReadyOutput, null, 2)}\n\`\`\`\n\n## Hallucination Checklist\n${checks}\n`;
};

const exportAll = (format) => {
  if (!state.lastOutput) return;

  if (format === "json") {
    downloadText("faq-output.json", JSON.stringify(state.lastOutput, null, 2), "application/json");
  }

  if (format === "md") {
    downloadText("faq-output.md", toMarkdown(state.lastOutput), "text/markdown");
  }

  if (format === "html") {
    const html = `<html><body><pre>${toMarkdown(state.lastOutput)}</pre></body></html>`;
    downloadText("faq-output.html", html, "text/html");
  }

  if (format === "docx") {
    const docxCompatibleHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><body><pre>${toMarkdown(state.lastOutput)}</pre></body></html>`;
    downloadText(
      "faq-output.docx",
      docxCompatibleHtml,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  }
};

const copyJson = async () => {
  if (!state.lastOutput) return;
  await navigator.clipboard.writeText(JSON.stringify(state.lastOutput, null, 2));
};

elements.strictness.addEventListener("input", updateStrictnessLabel);
elements.loadExample.addEventListener("click", pickExample);
elements.generate.addEventListener("click", generate);
elements.copyJson.addEventListener("click", copyJson);
elements.exportMd.addEventListener("click", () => exportAll("md"));
elements.exportHtml.addEventListener("click", () => exportAll("html"));
elements.exportDocx.addEventListener("click", () => exportAll("docx"));

populateConfig().catch((error) => {
  elements.outputPreview.textContent = `Failed to load config: ${error.message}`;
});
