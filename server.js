import express from "express";
import dotenv from "dotenv";
import Ajv from "ajv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_INPUT_LEN = 12000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const templatesPath = path.join(__dirname, "data", "prompt-templates.json");
const schemaPath = path.join(__dirname, "data", "faq-output-schema.json");
const examplesPath = path.join(__dirname, "data", "example-dataset.json");

const ajv = new Ajv({ allErrors: true, strict: false });

const [templatesRaw, schemaRaw] = await Promise.all([
  fs.readFile(templatesPath, "utf8"),
  fs.readFile(schemaPath, "utf8")
]);

const templatesConfig = JSON.parse(templatesRaw);
const faqSchema = JSON.parse(schemaRaw);
const validateFaqOutput = ajv.compile(faqSchema);

const reusableResponseWrapper = async ({ apiKey, model, input, temperature, deterministic }) => {
  const temp = deterministic ? 0 : temperature;

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: temp,
      text: {
        format: {
          type: "json_schema",
          name: "faq_generator_output",
          schema: faqSchema,
          strict: true
        }
      },
      input
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errText}`);
  }

  return response.json();
};

const extractStructuredOutput = (responsesPayload) => {
  const output = responsesPayload?.output || [];
  for (const item of output) {
    if (!item?.content) continue;
    for (const part of item.content) {
      if (part?.type === "output_text" && part?.text) {
        return JSON.parse(part.text);
      }
    }
  }

  const fallbackText = responsesPayload?.output_text;
  if (fallbackText) {
    return JSON.parse(fallbackText);
  }

  throw new Error("No structured output text was returned by the model.");
};

app.get("/api/config", async (_req, res) => {
  try {
    const examples = JSON.parse(await fs.readFile(examplesPath, "utf8"));
    res.json({
      templateVersion: templatesConfig.version,
      templates: templatesConfig.templates,
      models: ["gpt-4.1-mini", "gpt-4.1", "gpt-5-mini"],
      examples
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load app config.",
      details: error.message
    });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const {
      apiKey,
      model,
      templateName = "default",
      sourceText,
      sourceType,
      deterministic = false,
      strictness = 0.7,
      promptVersion = templatesConfig.version
    } = req.body || {};

    if (!apiKey || typeof apiKey !== "string") {
      return res.status(400).json({ error: "A valid API key is required." });
    }

    if (!sourceText || sourceText.length < 20) {
      return res.status(400).json({ error: "Please provide at least 20 characters of source text." });
    }

    if (sourceText.length > MAX_INPUT_LEN) {
      return res.status(400).json({ error: `Source text exceeds ${MAX_INPUT_LEN} characters.` });
    }

    const template = templatesConfig.templates[templateName] || templatesConfig.templates.default;
    const strictnessClamped = Math.max(0, Math.min(1, Number(strictness)));
    const creativityTemperature = Number((1 - strictnessClamped).toFixed(2));

    const input = [
      { role: "system", content: template.systemPrompt },
      {
        role: "user",
        content: [
          `Prompt Template Version: ${promptVersion}`,
          `Source Type: ${sourceType || "unspecified"}`,
          "Instructions:",
          ...template.instructions.map((line, idx) => `${idx + 1}. ${line}`),
          "Return only valid JSON that matches the schema.",
          "Source Content:",
          sourceText
        ].join("\n")
      }
    ];

    const apiPayload = await reusableResponseWrapper({
      apiKey,
      model: model || "gpt-4.1-mini",
      input,
      deterministic,
      temperature: creativityTemperature
    });

    const structured = extractStructuredOutput(apiPayload);
    const valid = validateFaqOutput(structured);

    if (!valid) {
      return res.status(422).json({
        error: "Model output failed schema validation.",
        validationErrors: validateFaqOutput.errors
      });
    }

    res.json({
      ok: true,
      data: structured,
      metadata: {
        deterministic,
        strictness: strictnessClamped,
        promptVersion,
        model: model || "gpt-4.1-mini",
        templateName
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate FAQ output.",
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`FAQ Generator AI server running at http://localhost:${port}`);
});
