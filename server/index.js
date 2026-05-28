const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const webpush = require("web-push");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 5000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:test@example.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const adminSupabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// In-memory session store. Resets when backend restarts.
const documentSessions = new Map();
const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["application/pdf", "text/plain"];
    const allowedExtensions = [".pdf", ".txt"];
    const fileName = file.originalname.toLowerCase();
    const isAllowedExtension = allowedExtensions.some((ext) => fileName.endsWith(ext));

    if (allowedMimeTypes.includes(file.mimetype) || isAllowedExtension) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and TXT files are supported right now."));
    }
  },
});

const modePrompts = {
  notes: `
You are in NOTES mode.
Create clean professional revision notes in simple English.
Use this format:
# Revision Notes: [Topic]
## Definition
## Simple Explanation
## Key Points
## Example
## Exam-Focused Points
## Quick Summary
Rules: answer the actual topic, avoid generic filler, avoid Hinglish unless asked.
`,

  ppt: `
You are in PPT mode.
Create slide-by-slide presentation content.
Use this format:
# PPT: [Topic]
## Slide 1: Title
## Slide 2: Introduction
## Slide 3: Main Concept
## Slide 4: Key Features / Components
## Slide 5: Example / Use Case
## Slide 6: Advantages / Importance
## Slide 7: Conclusion
Rules: must use slide numbers, short bullet points, presentation-ready content.
`,

  coding: `
You are in CODING mode.

Your job is to help students with programming.

VERY IMPORTANT RULES:
- If the user asks to write/generate/create a program, generate complete working code.
- If the user gives existing code, explain it line-by-line.
- If the user asks for dry run/output, show dry run and exact output.
- If the user asks to fix/debug, identify the error and provide corrected code.
- If language is not specified, use Python by default and mention that it can be converted to C/Java if needed.
- For pattern programs, always give logic, code, dry run idea, and output.
- Be beginner-friendly and exam/practical-file friendly.

Default output format:
# Coding Solution: [Problem]

## Problem Understanding
Explain what the program needs to do.

## Logic
Explain the logic clearly.

## Code
Provide complete working code in a fenced code block.

## Line-by-Line Explanation
Explain important lines one by one.

## Dry Run
Show a small dry run or loop trace.

## Output
Show exact output.

## Common Mistakes
Mention beginner mistakes.

## Complexity
Give time and space complexity if relevant.
`,

  "deep-search": `
You are in DEEP SEARCH mode.

VERY IMPORTANT RULES:
- Use retrieved chunks as the primary source.
- If retrieved chunks are present, DO NOT say PDFs cannot be parsed.
- Cite source file names wherever useful.
- Do not invent source file names.
- Do not create MCQs unless user asks for MCQs.
- Use professional simple English by default.
- Avoid Hindi-heavy words unless the user specifically asks in Hindi.
- Do not write weak disclaimers like "may not be comprehensive".
- Be confident, exam-focused, and practical.

Use this format:
# Deep Search: [Topic]

## Sources Analyzed
List only files whose text was successfully extracted and used in this session.

## Files Not Read
List failed files only if any failed. If none failed, write: None.

## Direct Answer
Give a clear direct answer based on retrieved PDF chunks.

## High Priority Topics
Create ONLY a valid Markdown table.

You MUST write the table exactly in this Markdown pipe format:

| Priority | Topic | Why Important | Source |
|---|---|---|---|
| High | Deadlock | Repeated in PYQs and important in syllabus | OS_PYQ.pdf, OS_Syllabus.pdf |
| High | CPU Scheduling | Numericals and theory appear repeatedly | OS_PYQ.pdf, OS_Syllabus.pdf |

Strict table rules:
- The header row must start with | and end with |
- The separator row must be exactly: |---|---|---|---|
- Every data row must start with | and end with |
- Do not write table content as continuous plain text.
- Do not remove pipe symbols.
- Do not use bold text inside table cells.
- Keep each cell short.

## Repeated / Important Questions
If PYQ years are available, mention year-wise repetition.
Use format:
- Question
  - Appeared in: 2025 / 2024 / 2023
  - Source: filename.pdf

## Long Answer Questions
Give exam-ready long questions.

## Short Answer Questions
Give short answer questions.

## Diagrams / Numericals to Practice
Mention diagrams, algorithms, scheduling numericals, memory diagrams, file allocation diagrams, etc.

## Source-Based Notes
Give compact notes from retrieved chunks.

## Exam Strategy
Give a practical preparation order.
`,



  tutor: `
You are in TUTOR MODE.

Your job is to teach the same topic in a completely different way so the student can understand it.

Rules:
- Do not repeat the previous explanation style.
- Use a fresh teaching approach, analogy, example, diagram, story, table, or step-by-step method.
- Make the explanation simpler and more student-friendly.
- If the topic is technical, break it into very small steps.
- If the topic is coding-related, use dry run, memory/variables, and output if helpful.
- If retrieved PDF chunks are available, stay aligned with them.
- End with one quick check question.
- Use professional simple English by default.

Output format:
# Tutor Mode: Same Topic, New Way

## Teaching Style Used
Mention the teaching style used.

## Explanation
Explain the topic in a new way.

## Example / Analogy
Give a fresh example or analogy.

## Visual / Steps
Use a diagram, flow, table, or step-by-step breakdown if useful.

## Quick Summary
Summarize in 3-5 bullet points.

## Check Your Understanding
Ask one simple question.
`,

  exam: `
You are in EXAM MODE.

Your goal is to help students prepare for upcoming exams using uploaded/session PDFs, syllabus, notes, and PYQs as primary sources.

VERY IMPORTANT RULES:
- Use retrieved chunks as the primary source when available.
- If uploaded/session PDF chunks are available, cite real source file names.
- Do not invent source file names.
- Use professional simple English only.
- Be highly exam-focused and practical.
- Do not create random content outside the uploaded material if sources are available.
- If PYQ years are available, mention year-wise repeated topics.

Use this strict format:
# Exam Preparation: [Subject/Topic]

## Sources Analyzed
Use only bullet list format:
- filename.pdf
- filename.pdf

Do not include relevance score or chunk count.
Do not create a table here.

## Most Important Topics
Create ONLY a valid Markdown table:

| Priority | Topic | Why Important | Source |
|---|---|---|---|
| High | Deadlock | Repeated in PYQs and important in syllabus | OS_PYQ.pdf, OS_Syllabus.pdf |

## Repeated PYQ Topics
List repeated topics with years if available.

## Long Answer Questions
Give exam-ready long questions.

## Short Answer Questions
Give short answer questions.

## Diagrams / Numericals to Practice
List diagrams, algorithms, formulas, and numericals.

## 7-Day Study Plan
Day 1:
Day 2:
Day 3:
Day 4:
Day 5:
Day 6:
Day 7:

## Last-Day Revision Checklist
Give a short checklist for final revision.

## Final Exam Strategy
Give a clear preparation order.
`,

  visual: `
You are in VISUAL EXPLAIN mode.
Explain using diagrams, flowcharts, analogies, and step-by-step representation.
Use this format:
# Visual Explanation: [Topic]
## Simple Meaning
## Real-Life Analogy
## Visual Diagram
## Step-by-Step Working
## Flowchart
## Quick Summary
Rules: include at least one diagram and one analogy. Do not give code unless asked.
`,
};

const nexusSystemPrompt = `
You are Nexus AI, a smart AI learning workspace for students.

Rules:
- Answer the actual topic, never generic filler.
- Use professional simple English by default.
- Avoid Hindi-heavy words unless user specifically asks in Hindi.
- Be exam-focused and student-friendly.
- Use clean Markdown headings like #, ##, ###.
- Do not use bold-only headings.
- For diagrams and code, use fenced code blocks.
- If retrieved PDF chunks are present, use them as primary source.
- Do not say uploaded PDFs cannot be parsed if retrieved chunks are available.
- If using retrieved content, mention source file names.
- Do not invent source file names.
- Do not add weak disclaimers at the end.
- Your identity: Nexus AI, tagline Learn Smarter.
`;

const STOP_WORDS = new Set([
  "the", "is", "are", "am", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "from", "by", "as", "at", "be", "this", "that", "these", "those", "give", "tell", "explain", "based", "uploaded", "pdf", "pdfs", "source", "sources", "mention", "important", "questions", "question", "batao", "kya", "ke", "ka", "ki", "ko", "me", "mein", "aur", "hai", "hain", "se", "par", "basis", "same"
]);

const QUERY_EXPANSIONS = {
  deadlock: ["deadlock", "banker", "avoidance", "prevention", "detection", "recovery", "circular", "mutual", "exclusion", "hold", "wait", "preemption"],
  scheduling: ["scheduling", "cpu", "fcfs", "sjf", "round", "robin", "priority", "waiting", "turnaround", "response", "gantt", "quantum"],
  cpu: ["cpu", "scheduling", "fcfs", "sjf", "round", "robin", "priority", "waiting", "turnaround", "quantum"],
  memory: ["memory", "paging", "segmentation", "virtual", "demand", "page", "replacement", "fifo", "lru", "optimal", "fragmentation"],
  process: ["process", "thread", "pcb", "state", "states", "context", "switching", "ipc"],
  synchronization: ["synchronization", "semaphore", "mutex", "critical", "section", "monitor"],
  file: ["file", "allocation", "contiguous", "linked", "indexed", "directory", "protection"],
  normalization: ["normalization", "1nf", "2nf", "3nf", "dependency", "partial", "transitive", "redundancy"],
  dbms: ["dbms", "database", "sql", "normalization", "er", "keys", "acid", "transaction"],
};


const TUTOR_STYLES = [
  "Beginner-friendly explanation using very simple words.",
  "Real-life analogy explanation.",
  "Story-based explanation.",
  "Step-by-step breakdown.",
  "Visual diagram or flowchart explanation.",
  "Exam-answer style explanation.",
  "Comparison table explanation.",
  "Question-and-answer teaching style.",
  "Common mistakes and correction-based explanation.",
  "Memory trick or mnemonic-based explanation.",
  "Practical real-world use case explanation.",
  "Teacher blackboard style explanation.",
  "One-minute quick revision explanation.",
  "Deep conceptual why/how explanation.",
  "Hinglish-light explanation only if useful for clarity."
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSessionId(inputSessionId) {
  if (inputSessionId && String(inputSessionId).trim()) return String(inputSessionId).trim();
  return crypto.randomUUID();
}

function getOrCreateDocumentSession(sessionId) {
  const now = Date.now();
  if (!documentSessions.has(sessionId)) {
    documentSessions.set(sessionId, {
      id: sessionId,
      files: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  const session = documentSessions.get(sessionId);
  session.updatedAt = now;
  return session;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of documentSessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) documentSessions.delete(sessionId);
  }
}

setInterval(cleanupExpiredSessions, 30 * 60 * 1000);

function buildHistoryMessages(history = []) {
  return [];
}

function cleanExtractedText(text = "") {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(text = "", maxChars = 4500) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) + "\n...[truncated]" : text;
}

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function expandQueryTokens(query = "") {
  const baseTokens = tokenize(query);
  const expanded = new Set(baseTokens);

  for (const token of baseTokens) {
    if (QUERY_EXPANSIONS[token]) {
      QUERY_EXPANSIONS[token].forEach((term) => expanded.add(term));
    }
  }

  const normalizedQuery = normalizeText(query);
  for (const [key, terms] of Object.entries(QUERY_EXPANSIONS)) {
    if (normalizedQuery.includes(key)) {
      terms.forEach((term) => expanded.add(term));
    }
  }

  return [...expanded];
}

function createChunks(fileName, text = "", options = {}) {
  const maxChars = options.maxChars || 1200;
  const overlapChars = options.overlapChars || 160;
  const cleanText = cleanExtractedText(text);

  if (!cleanText) return [];

  const paragraphs = cleanText
    .split(/\n\s*\n|(?=\b(?:Unit|Chapter|Section)\s+\d+[:.-])|(?=\b20\d{2}\s+Questions\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  const pushChunk = () => {
    const chunkText = current.trim();
    if (!chunkText) return;

    const firstLine = chunkText.split("\n")[0].trim().slice(0, 90);
    chunks.push({
      chunkId: `${fileName}-chunk-${chunks.length + 1}`,
      fileName,
      chunkIndex: chunks.length + 1,
      title: firstLine || `Chunk ${chunks.length + 1}`,
      text: chunkText,
      chars: chunkText.length,
    });
  };

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length <= maxChars) {
      current = current ? current + "\n\n" + paragraph : paragraph;
      continue;
    }

    pushChunk();

    const overlap = current.slice(Math.max(0, current.length - overlapChars));
    current = overlap ? overlap + "\n\n" + paragraph : paragraph;

    while (current.length > maxChars) {
      const part = current.slice(0, maxChars);
      current = current.slice(maxChars - overlapChars);
      chunks.push({
        chunkId: `${fileName}-chunk-${chunks.length + 1}`,
        fileName,
        chunkIndex: chunks.length + 1,
        title: part.split("\n")[0].trim().slice(0, 90) || `Chunk ${chunks.length + 1}`,
        text: part.trim(),
        chars: part.trim().length,
      });
    }
  }

  pushChunk();
  return chunks;
}

function scoreChunk(chunk, query, queryTokens) {
  const chunkNorm = normalizeText(`${chunk.title}\n${chunk.text}`);
  const titleNorm = normalizeText(chunk.title || "");
  const fileNorm = normalizeText(chunk.fileName || "");
  const queryNorm = normalizeText(query);

  let score = 0;

  for (const token of queryTokens) {
    if (!token) continue;

    const tokenRegex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    const textMatches = chunkNorm.match(tokenRegex)?.length || 0;
    const titleMatches = titleNorm.match(tokenRegex)?.length || 0;
    const fileMatches = fileNorm.match(tokenRegex)?.length || 0;

    score += textMatches;
    score += titleMatches * 4;
    score += fileMatches * 2;
  }

  // Phrase boosts
  const importantPhrases = [
    "deadlock", "cpu scheduling", "round robin", "sjf", "fcfs", "priority scheduling", "memory management", "virtual memory", "paging", "segmentation", "semaphore", "critical section", "file allocation", "normalization", "1nf", "2nf", "3nf"
  ];

  for (const phrase of importantPhrases) {
    if (queryNorm.includes(phrase) && chunkNorm.includes(phrase)) score += 8;
  }

  // PYQ / exam related boost
  if (/pyq|previous|year|appeared|2022|2023|2024|2025|question|questions/.test(queryNorm)) {
    if (/pyq|previous|year|appeared|2022|2023|2024|2025|questions/.test(chunkNorm + " " + fileNorm)) score += 6;
  }

  if (/syllabus|unit|unit wise|unit-wise/.test(queryNorm)) {
    if (/syllabus|unit/.test(chunkNorm + " " + fileNorm)) score += 6;
  }

  return score;
}

function getAllChunks(session) {
  return session.files.flatMap((file) => file.chunks || []);
}

function searchRelevantChunks(session, query, maxChunks = 8) {
  const allChunks = getAllChunks(session);
  if (allChunks.length === 0) return [];

  const queryTokens = expandQueryTokens(query);

  const scored = allChunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk, query, queryTokens),
    }))
    .sort((a, b) => b.score - a.score);

  const positive = scored.filter((chunk) => chunk.score > 0);
  const selected = (positive.length ? positive : scored).slice(0, maxChunks);

  // Ensure at least some file diversity when possible.
  const byFile = new Map();
  for (const chunk of scored) {
    if (!byFile.has(chunk.fileName)) byFile.set(chunk.fileName, chunk);
  }

  for (const chunk of byFile.values()) {
    if (selected.length >= maxChunks) break;
    if (!selected.some((item) => item.chunkId === chunk.chunkId)) selected.push(chunk);
  }

  return selected.slice(0, maxChunks);
}

async function extractTextFromFile(file) {
  const fileName = file.originalname;
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".txt") || file.mimetype === "text/plain") {
    const rawText = file.buffer.toString("utf-8");
    const text = cleanExtractedText(rawText);
    return buildExtractedFileObject(file, text, null, text.length > 0 ? null : "TXT file is empty or unreadable.");
  }

  if (lowerName.endsWith(".pdf") || file.mimetype === "application/pdf") {
    const data = await pdfParse(file.buffer);
    const text = cleanExtractedText(data.text || "");
    return buildExtractedFileObject(
      file,
      text,
      data.numpages || null,
      text.length > 0 ? null : "PDF text extraction returned empty text. It may be scanned/image-based."
    );
  }

  return buildExtractedFileObject(file, "", null, "Unsupported file type.");
}

function buildExtractedFileObject(file, text, pages, error) {
  const fileName = file.originalname;
  const ok = Boolean(text && text.length > 0 && !error);
  const chunks = ok ? createChunks(fileName, text) : [];

  return {
    id: `${fileName}-${file.size}-${Date.now()}`,
    fileName,
    text,
    pages,
    chars: text.length,
    ok,
    error,
    chunks,
    chunkCount: chunks.length,
    uploadedAt: new Date().toISOString(),
  };
}

async function extractUploadedFiles(files = []) {
  const extractedFiles = [];
  for (const file of files) {
    try {
      const extracted = await extractTextFromFile(file);
      extractedFiles.push(extracted);
    } catch (error) {
      extractedFiles.push({
        id: `${file.originalname}-${file.size}-${Date.now()}`,
        fileName: file.originalname,
        text: "",
        error: error.message,
        chars: 0,
        pages: null,
        ok: false,
        chunks: [],
        chunkCount: 0,
        uploadedAt: new Date().toISOString(),
      });
    }
  }
  return extractedFiles;
}

function addExtractedFilesToSession(session, extractedFiles = []) {
  const readable = extractedFiles.filter((file) => file.ok && file.text);

  for (const file of readable) {
    const existingIndex = session.files.findIndex(
      (item) => item.fileName === file.fileName && item.chars === file.chars
    );

    if (existingIndex >= 0) session.files[existingIndex] = file;
    else session.files.push(file);
  }

  session.updatedAt = Date.now();
}

function getPublicSessionFiles(session) {
  return session.files.map((file) => ({
    fileName: file.fileName,
    chars: file.chars || 0,
    pages: file.pages || null,
    ok: true,
    chunkCount: file.chunkCount || file.chunks?.length || 0,
    uploadedAt: file.uploadedAt,
  }));
}

function buildRagContext(session, query, failedUploadFiles = []) {
  const readableFiles = session.files.filter((file) => file.ok && file.text);
  const failedFiles = failedUploadFiles.filter((file) => !file.ok || !file.text);
  const relevantChunks = searchRelevantChunks(session, query, 8);

  const summaries = [
    ...readableFiles.map((file) => ({
      fileName: file.fileName,
      chars: file.chars || 0,
      pages: file.pages || null,
      ok: true,
      error: null,
      chunkCount: file.chunkCount || file.chunks?.length || 0,
      uploadedAt: file.uploadedAt,
    })),
    ...failedFiles.map((file) => ({
      fileName: file.fileName,
      chars: file.chars || 0,
      pages: file.pages || null,
      ok: false,
      error: file.error || "Unknown extraction error",
      chunkCount: 0,
      uploadedAt: file.uploadedAt,
    })),
  ];

  console.log("RAG Session Summary:");
  console.table(summaries);
  console.log(
    "RAG Selected Chunks:",
    relevantChunks.map((chunk) => ({
      fileName: chunk.fileName,
      chunkIndex: chunk.chunkIndex,
      score: chunk.score,
      title: chunk.title,
    }))
  );

  if (readableFiles.length === 0 || relevantChunks.length === 0) {
    return {
      context: "",
      summaries,
      readableFiles,
      failedFiles,
      relevantChunks: [],
    };
  }

  const context = relevantChunks
    .map((chunk) => {
      return `SOURCE FILE: ${chunk.fileName}\nCHUNK: ${chunk.chunkIndex}\nRELEVANCE SCORE: ${chunk.score}\nCHUNK TITLE: ${chunk.title}\nTEXT:\n${truncateText(chunk.text, 1800)}`;
    })
    .join("\n\n---\n\n");

  const failedContext = failedFiles.length
    ? `\n\nFILES NOT READ:\n${failedFiles.map((file) => `- ${file.fileName}: ${file.error || "Unknown extraction error"}`).join("\n")}`
    : "\n\nFILES NOT READ: None";

  return {
    context: context + failedContext,
    summaries,
    readableFiles,
    failedFiles,
    relevantChunks,
  };
}

function escapeTableCell(value = "") {
  return String(value).replace(/\|/g, "/").replace(/\n/g, " ").trim();
}

function repairHighPriorityTable(reply = "") {
  if (!reply || !reply.includes("PriorityTopicWhy ImportantSource")) return reply;

  const sectionRegex = /((?:##\s*)?\*{0,2}High Priority Topics\*{0,2}\s*)([\s\S]*?)(?=(?:\n\s*(?:##\s*)?\*{0,2}Repeated \/ Important Questions\*{0,2})|$)/i;

  return reply.replace(sectionRegex, (fullMatch, heading, body) => {
    if (body.includes("| Priority | Topic | Why Important | Source |")) return fullMatch;

    const cleanBody = body
      .replace(/\*\*/g, "")
      .replace(/Priority\s*Topic\s*Why Important\s*Source/i, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const chunks = cleanBody
      .split(/(?=\b(?:High|Medium|Low)(?=[A-Z\s]))/g)
      .map((item) => item.trim())
      .filter(Boolean);

    const rows = [];
    for (const chunk of chunks) {
      const priorityMatch = chunk.match(/^(High|Medium|Low)\s*/i);
      if (!priorityMatch) continue;

      const priority = priorityMatch[1];
      const rest = chunk.slice(priorityMatch[0].length).trim();
      const pdfMatches = [...rest.matchAll(/[A-Za-z0-9_.() -]+?\.pdf/g)];
      if (pdfMatches.length === 0) continue;

      const firstPdfIndex = pdfMatches[0].index;
      const source = pdfMatches.map((match) => match[0].trim()).join(", ");
      const beforeSource = rest.slice(0, firstPdfIndex).trim();
      const whyStartIndex = beforeSource.search(/\b(Repeated|Numericals|Theory|Topics|Critical|Important|Appears|Highly|Included|Asked|Syllabus)\b/i);

      let topic = "";
      let whyImportant = "";

      if (whyStartIndex > 0) {
        topic = beforeSource.slice(0, whyStartIndex).trim();
        whyImportant = beforeSource.slice(whyStartIndex).trim();
      } else {
        const words = beforeSource.split(" ");
        topic = words.slice(0, 2).join(" ").trim();
        whyImportant = words.slice(2).join(" ").trim();
      }

      if (!topic || !whyImportant || !source) continue;
      rows.push({ priority, topic, whyImportant, source });
    }

    if (rows.length === 0) return fullMatch;

    const table = [
      "## High Priority Topics",
      "",
      "| Priority | Topic | Why Important | Source |",
      "|---|---|---|---|",
      ...rows.map(
        (row) =>
          `| ${escapeTableCell(row.priority)} | ${escapeTableCell(row.topic)} | ${escapeTableCell(row.whyImportant)} | ${escapeTableCell(row.source)} |`
      ),
      "",
    ].join("\n");

    return table;
  });
}




function getCodingIntentInstruction(message = "") {
  const text = String(message).toLowerCase();

  const hasAny = (words) => words.some((word) => text.includes(word));

  const asksPattern = hasAny([
    "pattern",
    "pyramid",
    "triangle",
    "print the following",
    "display the following",
    "following pattern",
  ]);

  const asksGenerateCode = hasAny([
    "write a program",
    "write program",
    "create a program",
    "make a program",
    "generate code",
    "write code",
    "program to",
    "code for",
    "implement",
  ]);

  const asksExplainCode = hasAny([
    "explain this code",
    "line by line",
    "samjhao",
    "explain code",
  ]);

  const asksDebug = hasAny([
    "debug",
    "error",
    "fix",
    "not working",
    "wrong output",
    "issue",
    "bug",
  ]);

  const asksDryRun = hasAny([
    "dry run",
    "output",
    "trace",
    "iteration",
    "loop trace",
  ]);

  if (asksPattern) {
    return `
CODING INTENT: PATTERN PROGRAM

The student is asking for a pattern program.

You MUST output ONLY these sections:
# Pattern Program

## Problem Understanding
Explain the required pattern.

## Logic
Explain nested-loop logic in simple words.

## Code
Generate complete working code. If language is not specified, use Python.

## Line-by-Line Explanation
Explain the code line by line.

## Dry Run
Show how rows and columns change for first few rows.

## Output
Show the exact pattern output.

## Common Mistakes
Mention common mistakes in pattern programs.

STRICT RULES:
- Do not only explain. You must generate code.
- Do not skip line-by-line explanation.
- Do not skip output.
`;
  }

  if (asksGenerateCode) {
    return `
CODING INTENT: CODE GENERATION

The student is asking to generate a program/code.

You MUST output:
# Coding Solution

## Problem Understanding
## Logic
## Code
## Line-by-Line Explanation
## Dry Run
## Output
## Common Mistakes
## Complexity

STRICT RULES:
- Generate complete working code.
- If language is not specified, use Python by default.
- Explain line by line after code.
`;
  }

  if (asksDebug) {
    return `
CODING INTENT: DEBUG / FIX CODE

The student wants error fixing or debugging.

You MUST output:
# Debugging Help

## Error Found
## Why It Happens
## Corrected Code
## Line-by-Line Explanation
## Output
## Prevention Tip
`;
  }

  if (asksExplainCode) {
    return `
CODING INTENT: LINE-BY-LINE CODE EXPLANATION

The student wants to understand existing code.

You MUST output:
# Code Explanation

## Code Overview
## Line-by-Line Explanation
## Dry Run
## Output
## Variables / Memory
## Common Mistakes
`;
  }

  if (asksDryRun) {
    return `
CODING INTENT: DRY RUN / OUTPUT

The student wants dry run or output.

You MUST output:
# Dry Run and Output

## Code Logic
## Dry Run Table
## Final Output
## Explanation
`;
  }

  return `
CODING INTENT: GENERAL CODING HELP

Help the student with code generation, code explanation, dry run, output, and debugging as needed.
If the user asks a programming problem, generate complete working code and explain it line by line.
`;
}

function looksLikeCodingQuery(message = "") {
  const text = String(message).toLowerCase();

  const codingKeywords = [
    "write a program",
    "write program",
    "program to",
    "create a program",
    "generate code",
    "write code",
    "code for",
    "implement",
    "pattern",
    "dry run",
    "output of code",
    "explain this code",
    "debug",
    "fix this code",
    "for loop",
    "while loop",
    "array",
    "function",
    "class",
    "python",
    "java",
    "c++",
    "javascript",
  ];

  const hasKeyword = codingKeywords.some((keyword) => text.includes(keyword));
  const hasCodeSymbols = /[{};]|\bfor\s*\(|\bwhile\s*\(|\bif\s*\(|console\.log|print\s*\(|public\s+static|#include|def\s+\w+/.test(message);

  return hasKeyword || hasCodeSymbols;
}

function getTutorIntentInstruction(message = "", previousQuestion = "", previousAnswer = "") {
  const text = `${message} ${previousQuestion}`.toLowerCase();
  const hasAny = (words) => words.some((word) => text.includes(word));

  if (hasAny(["simple", "simpler", "easy", "basic", "beginner", "easy language", "samajh nahi", "samajh nhi", "understand nahi"])) {
    return `
TUTOR INTENT: SIMPLER EXPLANATION

Teach the topic in the simplest possible language.

Use this output:
# Tutor Mode: Simple Explanation

## Simple Meaning
Explain in very easy words.

## Easy Breakdown
Break the concept into small parts.

## Small Example
Give one very simple example.

## Quick Summary
Summarize in 3 bullet points.

## Check Your Understanding
Ask one easy question.
`;
  }

  if (hasAny(["real life", "daily life", "analogy", "example", "example se", "practical example"])) {
    return `
TUTOR INTENT: REAL-LIFE ANALOGY

Teach the topic using a fresh real-life analogy.

Use this output:
# Tutor Mode: Real-Life Analogy

## Real-Life Example
Give a relatable analogy.

## Mapping With Concept
Show how the analogy connects to the actual concept.

## Explanation
Explain using that analogy.

## Quick Summary
Summarize in 3 bullet points.

## Check Your Understanding
Ask one simple question.
`;
  }

  if (hasAny(["visual", "diagram", "flowchart", "chart", "mind map", "draw", "visually"])) {
    return `
TUTOR INTENT: VISUAL EXPLANATION

Teach the topic visually.

Use this output:
# Tutor Mode: Visual Explanation

## Simple Meaning
Explain briefly.

## Diagram
Use ASCII diagram or concept map.

## Flowchart
Show step-by-step flow.

## Explanation
Explain the diagram.

## Quick Summary
Summarize in 3 bullet points.
`;
  }

  if (hasAny(["step by step", "steps", "breakdown", "one by one", "process", "line by line"])) {
    return `
TUTOR INTENT: STEP-BY-STEP

Teach the topic step by step.

Use this output:
# Tutor Mode: Step-by-Step Explanation

## Step 1
Explain first part.

## Step 2
Explain second part.

## Step 3
Explain third part.

## Final Understanding
Connect all steps together.

## Quick Summary
Summarize in bullet points.
`;
  }

  if (hasAny(["exam", "answer", "write in exam", "marks", "paper", "long answer", "short answer", "important"])) {
    return `
TUTOR INTENT: EXAM-READY EXPLANATION

Teach the topic as an exam-ready answer.

Use this output:
# Tutor Mode: Exam-Ready Answer

## Definition
Give a clear definition.

## Main Explanation
Write exam-style explanation.

## Important Points
List key points.

## Example / Diagram
Give example or diagram if needed.

## Conclusion
Give short conclusion.

## Exam Tip
Tell how to write this in exam.
`;
  }

  if (hasAny(["hindi", "hinglish", "asaan bhasha", "samjhao", "desi", "easy hindi"])) {
    return `
TUTOR INTENT: SIMPLE HINGLISH

Teach the topic in simple Hinglish.

Use this output:
# Tutor Mode: Simple Hinglish

## Simple Meaning
Explain in easy Hinglish.

## Example
Give one relatable example.

## Step-by-Step Samjho
Break it down simply.

## Quick Summary
Give 3 short points.
`;
  }

  if (hasAny(["code", "program", "dry run", "output", "logic", "debug", "variable", "memory"])) {
    return `
TUTOR INTENT: CODING / DRY RUN

Teach with coding logic, dry run, output and variables.

Use this output:
# Tutor Mode: Coding Explanation

## Logic
Explain the main logic.

## Code / Pseudocode
Show code or pseudocode if useful.

## Dry Run
Use a dry run table.

## Output
Show expected output.

## Common Mistakes
Mention beginner mistakes.
`;
  }

  if (hasAny(["mistake", "confusion", "common error", "galti", "wrong", "difference", "confused"])) {
    return `
TUTOR INTENT: COMMON MISTAKES

Teach through common mistakes and corrections.

Use this output:
# Tutor Mode: Common Mistakes

## Common Confusion
Explain what students usually misunderstand.

## Wrong vs Correct
Show wrong understanding and correct understanding.

## Example
Give an example.

## Quick Summary
Summarize the correct idea.
`;
  }

  if (hasAny(["remember", "yaad", "trick", "mnemonic", "shortcut", "revision"])) {
    return `
TUTOR INTENT: MEMORY TRICK

Teach using memory tricks.

Use this output:
# Tutor Mode: Memory Trick

## Memory Trick
Give mnemonic or shortcut.

## Explanation
Explain how the trick connects to the concept.

## Revision Points
Give quick revision bullets.

## Check Yourself
Ask one recall question.
`;
  }

  if (hasAny(["deep", "why", "how", "internal", "behind", "concept", "deeply"])) {
    return `
TUTOR INTENT: DEEP CONCEPTUAL EXPLANATION

Teach deeply with why and how.

Use this output:
# Tutor Mode: Deep Concept

## Why This Concept Exists
Explain the need.

## How It Works
Explain internal working.

## Example
Give example.

## Summary
Summarize deeply but clearly.
`;
  }

  return `
TUTOR INTENT: TEACH DIFFERENTLY

Teach the same topic in a new way different from the previous answer.
Use a fresh style, example, analogy, visual, or step-by-step method.
Do not repeat the previous explanation.
`;
}

function getFocusedOutputInstruction(message = "") {
  const text = String(message).toLowerCase();

  const asksSevenDayPlan =
    text.includes("7-day") ||
    text.includes("7 day") ||
    text.includes("seven day") ||
    text.includes("study plan") ||
    text.includes("daily plan");

  const asksLastDayRevision =
    text.includes("last-day") ||
    text.includes("last day") ||
    text.includes("revision checklist") ||
    text.includes("last day revision") ||
    text.includes("final revision");

  const asksPyqAnalysis =
    text.includes("pyq") ||
    text.includes("previous year") ||
    text.includes("repeated topics") ||
    text.includes("repeated questions") ||
    text.includes("most probable");

  const asksImportantQuestions =
    text.includes("important questions") ||
    text.includes("high priority") ||
    text.includes("long questions") ||
    text.includes("short questions") ||
    text.includes("diagrams") ||
    text.includes("numericals");

  if (asksSevenDayPlan && !asksImportantQuestions && !asksPyqAnalysis) {
    return `
FOCUSED OUTPUT INSTRUCTION: 7-DAY STUDY PLAN ONLY

The student asked only for a 7-day study plan.

You MUST output ONLY these sections:

# 7-Day Study Plan: [Subject/Topic]

## Sources Analyzed
- filename.pdf

## 7-Day Study Plan

### Day 1: [Topic]
- What to study:
- What to revise:
- Practice task:

### Day 2: [Topic]
- What to study:
- What to revise:
- Practice task:

### Day 3: [Topic]
- What to study:
- What to revise:
- Practice task:

### Day 4: [Topic]
- What to study:
- What to revise:
- Practice task:

### Day 5: [Topic]
- What to study:
- What to revise:
- Practice task:

### Day 6: [Topic]
- What to study:
- What to revise:
- Practice task:

### Day 7: Revision + Practice
- What to revise:
- What to practice:
- Final checklist:

## Final Exam Strategy
Give only 3-5 short practical points.

STRICT RULES:
- Do NOT include High Priority Topics.
- Do NOT include Most Important Topics table.
- Do NOT include Repeated / Important Questions.
- Do NOT include Long Answer Questions.
- Do NOT include Short Answer Questions.
- Do NOT include Source-Based Notes.
- Do NOT include full Deep Search or Exam Mode template.
- Answer only the 7-day study plan request.
`;
  }

  if (asksLastDayRevision) {
    return `
FOCUSED OUTPUT INSTRUCTION: LAST-DAY REVISION CHECKLIST ONLY

The student asked only for a last-day revision checklist.

You MUST output ONLY these sections:

# Last-Day Revision Checklist: [Subject/Topic]

## Sources Analyzed
- filename.pdf

## Must Revise Topics
List only the most important topics.

## Last-Day Revision Checklist
Give a clear checklist.

## Diagrams / Numericals to Quickly Practice
Mention only essential diagrams/numericals.

## Final 3-Hour Strategy
Give a very short last-minute strategy.

STRICT RULES:
- Do NOT include High Priority Topics table.
- Do NOT include Repeated / Important Questions.
- Do NOT include Long Answer Questions.
- Do NOT include Short Answer Questions.
- Do NOT include 7-Day Study Plan.
- Do NOT include full Deep Search or Exam Mode template.
- Answer only the last-day revision request.
`;
  }

  if (asksPyqAnalysis && !asksImportantQuestions) {
    return `
FOCUSED OUTPUT INSTRUCTION: PYQ ANALYSIS ONLY

The student asked for PYQ analysis.

You MUST output ONLY these sections:

# PYQ Analysis: [Subject/Topic]

## Sources Analyzed
- filename.pdf

## Repeated PYQ Topics
Mention repeated topics with years if available.

## Most Probable Questions
Give likely exam questions based on repetition.

## Exam Strategy
Give preparation strategy based on PYQ pattern.

STRICT RULES:
- Do NOT include 7-Day Study Plan.
- Do NOT include Last-Day Revision Checklist.
- Do NOT include full Deep Search or Exam Mode template.
- Focus only on PYQ analysis.
`;
  }

  if (asksImportantQuestions) {
    return `
FOCUSED OUTPUT INSTRUCTION: IMPORTANT QUESTIONS ONLY

The student asked for important exam questions.

You MUST output ONLY these sections:

# Important Questions: [Subject/Topic]

## Sources Analyzed
- filename.pdf

## High Priority Topics
Use a valid Markdown table:
| Priority | Topic | Why Important | Source |
|---|---|---|---|

## Long Answer Questions
Give exam-ready long questions.

## Short Answer Questions
Give short answer questions.

## Diagrams / Numericals to Practice
Mention only relevant diagrams/numericals.

## Exam Strategy
Give a short preparation order.

STRICT RULES:
- Do NOT include 7-Day Study Plan unless user asks for it.
- Do NOT include Last-Day Revision Checklist unless user asks for it.
- Answer only important questions request.
`;
  }

  return "";
}

function generateFallbackResponse(message, mode, fileSummaries = []) {
  const topic = message?.trim() || "your topic";
  if (mode === "deep-search") {
    const readable = fileSummaries.filter((f) => f.ok);
    const failed = fileSummaries.filter((f) => !f.ok);
    return `# Deep Search: ${topic}

## AI Provider Status
AI provider is temporarily rate-limited or unavailable. Please try again after a few seconds.

## RAG Session Status

### Readable Files Stored In Session
${readable.length ? readable.map((f) => `- ${f.fileName} (${f.chars} characters, ${f.chunkCount || 0} chunks)`).join("\n") : "- None"}

### Files Not Read
${failed.length ? failed.map((f) => `- ${f.fileName}: ${f.error}`).join("\n") : "- None"}

## What to Try
- Ask again without re-uploading files.
- Ask a more specific question.
- Wait 5-10 seconds and regenerate.`;
  }
  return `# ${topic}\n\nAI provider is temporarily unavailable or rate-limited. Please try again after a few seconds.`;
}

function extractRetrySeconds(message = "") {
  const match = message.match(/try again in\s+([\d.]+)s/i);
  if (!match) return 5;
  return Math.ceil(Number(match[1])) || 5;
}

async function requestGroq(messages, maxTokens = 1300) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.25,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Groq API Error:", data);
    const errorMessage = data.error?.message || data.message || "Groq API request failed";
    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  const reply = data.choices?.[0]?.message?.content || "";
  if (!reply.trim()) throw new Error("Empty response from Groq");
  return reply;
}

async function callGroq({ message, mode, history, ragContext, fileSummaries, relevantChunks, previousQuestion = "", previousAnswer = "", tutorStyleIndex = 0 }) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is missing in .env file");

  const selectedModePrompt = modePrompts[mode] || "";
  const modeName = mode || "normal";
  const readableFileNames = fileSummaries.filter((f) => f.ok).map((f) => f.fileName);
  const failedFileNames = fileSummaries.filter((f) => !f.ok).map((f) => `${f.fileName}: ${f.error}`);

  const messages = [{ role: "system", content: nexusSystemPrompt }];
  if (selectedModePrompt) messages.push({ role: "system", content: selectedModePrompt });

  const codingIntentInstruction = mode === "coding" ? getCodingIntentInstruction(message) : "";

  if (mode === "coding" && codingIntentInstruction) {
    messages.push({
      role: "system",
      content: codingIntentInstruction,
    });
  }

  const focusedOutputInstruction = getFocusedOutputInstruction(message);

  if ((mode === "exam" || mode === "deep-search") && focusedOutputInstruction) {
    messages.push({
      role: "system",
      content: focusedOutputInstruction,
    });
  }

  if (mode === "tutor") {
    const style = TUTOR_STYLES[Math.abs(Number(tutorStyleIndex) || 0) % TUTOR_STYLES.length];
    const tutorIntentInstruction = getTutorIntentInstruction(message, previousQuestion, previousAnswer);

    messages.push({
      role: "system",
      content: `
TUTOR MODE CONTEXT:
Previous student question/topic:
${previousQuestion || message}

Previous AI answer:
${previousAnswer ? truncateText(previousAnswer, 2500) : "No previous answer provided."}

New teaching style to use:
${style}

Tutor Intent Instruction:
${tutorIntentInstruction}

Important:
- Teach the same topic in this new style.
- Follow the Tutor Intent Instruction if it is specific.
- Do not repeat the previous answer.
- Make it easier to understand.
`,
    });
  }

  if (ragContext) {
    messages.push({
      role: "system",
      content: `
SIMPLE RAG v1 STATUS:
Readable files stored in session: ${readableFileNames.length ? readableFileNames.join(", ") : "None"}
Files not read from latest upload: ${failedFileNames.length ? failedFileNames.join(" | ") : "None"}
Relevant chunks selected: ${relevantChunks.length}

IMPORTANT:
- Use only the retrieved chunks below as the main source.
- If readable files list is not empty and relevant chunks are selected, never say PDFs failed parsing.
- Mention failed files only in "Files Not Read" section.
- Do not invent source file names.

RETRIEVED PDF CHUNKS:
${ragContext}
`,
    });
  }

  messages.push(...buildHistoryMessages(history));
  messages.push({
    role: "user",
    content: `
Mode: ${modeName}

Student Question:
${message}

Important:
Answer only what the student asked.
If a focused output instruction is provided, follow it strictly over the general mode template.
Do not add extra sections that the student did not ask for.
${ragContext ? "Use retrieved chunks and cite source file names." : ""}
`,
  });

  const outputTokens = mode === "deep-search" || mode === "exam" ? 1700 : mode === "coding" ? 1500 : 1100;

  try {
    return await requestGroq(messages, outputTokens);
  } catch (error) {
    if (error.status === 429) {
      const waitSeconds = Math.min(extractRetrySeconds(error.message) + 1, 8);
      console.log(`Rate limit hit. Retrying in ${waitSeconds}s with compact prompt...`);
      await sleep(waitSeconds * 1000);

      const compactMessages = [
        { role: "system", content: nexusSystemPrompt + "\nGive a concise answer. Maximum 500-700 words." },
      ];
      if (selectedModePrompt) compactMessages.push({ role: "system", content: selectedModePrompt });

      if (mode === "coding" && codingIntentInstruction) {
        compactMessages.push({
          role: "system",
          content: codingIntentInstruction,
        });
      }

      if ((mode === "exam" || mode === "deep-search") && focusedOutputInstruction) {
        compactMessages.push({
          role: "system",
          content: focusedOutputInstruction,
        });
      }

      if (mode === "tutor") {
        const style = TUTOR_STYLES[Math.abs(Number(tutorStyleIndex) || 0) % TUTOR_STYLES.length];
        const tutorIntentInstruction = getTutorIntentInstruction(message, previousQuestion, previousAnswer);

        compactMessages.push({
          role: "system",
          content: `Tutor Mode. Previous question: ${previousQuestion || message}
Previous answer: ${truncateText(previousAnswer, 1800)}
New teaching style: ${style}
Tutor Intent Instruction: ${tutorIntentInstruction}
Explain differently and simply.`,
        });
      }

      if (ragContext) {
        compactMessages.push({
          role: "system",
          content: `Readable session files: ${readableFileNames.join(", ") || "None"}\nFiles not read: ${failedFileNames.join(" | ") || "None"}\nUse retrieved chunks and cite file names.\n${truncateText(ragContext, 8500)}`,
        });
      }
      compactMessages.push({ role: "user", content: `Mode: ${modeName}\nStudent Question: ${message}\nKeep concise but source-based.` });
      return await requestGroq(compactMessages, 950);
    }
    throw error;
  }
}

app.get("/", (req, res) => {
  res.send("Nexus AI backend is running with Groq + Simple RAG v1 + Mentor Reminders");
});

app.get("/api/push/public-key", (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || "" });
});

app.post("/api/push/subscribe", async (req, res) => {
  try {
    if (!adminSupabase) {
      return res.status(500).json({ success: false, error: "Supabase admin client is not configured." });
    }

    const { userId, subscription } = req.body;

    if (!userId || !subscription?.endpoint) {
      return res.status(400).json({ success: false, error: "userId and subscription are required." });
    }

    const { error } = await adminSupabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        subscription,
      },
      { onConflict: "endpoint" }
    );

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function getIndiaTimeHHMM() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return formatter.format(new Date());
}

function getIndiaDateString() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

app.get("/api/reminders/check", async (req, res) => {
  try {
    if (!adminSupabase) {
      return res.status(500).json({ success: false, error: "Supabase admin client is not configured." });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(500).json({ success: false, error: "VAPID keys are missing." });
    }

    const currentTime = getIndiaTimeHHMM();
    const today = getIndiaDateString();

    const { data: reminders, error: reminderError } = await adminSupabase
      .from("mentor_reminders")
      .select("*")
      .eq("enabled", true)
      .eq("reminder_time", currentTime);

    if (reminderError) throw reminderError;

    const dueReminders = (reminders || []).filter(
      (reminder) => reminder.last_sent_date !== today
    );

    let sent = 0;
    let failed = 0;

    for (const reminder of dueReminders) {
      const { data: subscriptions, error: subError } = await adminSupabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", reminder.user_id);

      if (subError) {
        failed += 1;
        continue;
      }

      const payload = JSON.stringify({
        title: "Nexus AI Mentor Reminder",
        body: reminder.message || "Time to continue your learning roadmap in Mentor AI.",
        url: FRONTEND_URL,
      });

      for (const sub of subscriptions || []) {
        try {
          await webpush.sendNotification(sub.subscription, payload);
          sent += 1;
        } catch (error) {
          console.error("Push send failed:", error.message);
          failed += 1;

          if (error.statusCode === 404 || error.statusCode === 410) {
            await adminSupabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
        }
      }

      await adminSupabase
        .from("mentor_reminders")
        .update({ last_sent_date: today, updated_at: new Date().toISOString() })
        .eq("id", reminder.id);
    }

    res.json({ success: true, currentTime, due: dueReminders.length, sent, failed });
  } catch (error) {
    console.error("Reminder check error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/session/:sessionId/files", (req, res) => {
  const sessionId = req.params.sessionId;
  const session = documentSessions.get(sessionId);
  res.json({ success: true, sessionId, files: session ? getPublicSessionFiles(session) : [] });
});

app.delete("/api/session/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  documentSessions.delete(sessionId);
  res.json({ success: true, sessionId, message: "PDF session memory cleared." });
});

app.post("/api/chat", upload.array("files", 5), async (req, res) => {
  let fileSummaries = [];
  let relevantChunks = [];

  try {
    const message = req.body.message;
    let mode = req.body.mode || "";
    const previousQuestion = req.body.previousQuestion || "";
    const previousAnswer = req.body.previousAnswer || "";
    const tutorStyleIndex = Number(req.body.tutorStyleIndex || 0);

    if (!mode && looksLikeCodingQuery(message)) {
      mode = "coding";
    }
    const sessionId = getSessionId(req.body.sessionId);
    const session = getOrCreateDocumentSession(sessionId);

    let history = [];
    if (req.body.history) {
      try {
        history = typeof req.body.history === "string" ? JSON.parse(req.body.history) : req.body.history;
      } catch {
        history = [];
      }
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    const uploadedFiles = req.files || [];
    const extractedUploadFiles = uploadedFiles.length ? await extractUploadedFiles(uploadedFiles) : [];
    addExtractedFilesToSession(session, extractedUploadFiles);

    const failedUploadFiles = extractedUploadFiles.filter((file) => !file.ok || !file.text);
    const ragQuery = mode === "tutor" && previousQuestion ? previousQuestion : message.trim();
    const ragBuild = buildRagContext(session, ragQuery, failedUploadFiles);
    const ragContext = ragBuild.context;
    fileSummaries = ragBuild.summaries;
    relevantChunks = ragBuild.relevantChunks;

    console.log("PDF Session Debug:", {
      sessionId,
      uploadedFiles: uploadedFiles.length,
      storedFiles: session.files.length,
      storedChunks: getAllChunks(session).length,
      selectedChunks: relevantChunks.length,
      storedFileNames: session.files.map((file) => file.fileName),
    });

    if (mode === "deep-search" && session.files.length === 0) {
      return res.json({
        success: true,
        reply: `# Deep Search

## PDF Session Status
No PDFs are currently stored in this chat.

## What to Do
Please upload your PDFs again, then ask your Deep Search question.

## Tip
After uploading PDFs once, you can ask multiple follow-up questions without re-uploading, as long as backend server is not restarted and you do not clear PDFs.`,
        mode: "deep-search",
        provider: "session",
        sessionId,
        files: [],
      });
    }

    const reply = await callGroq({
      message: message.trim(),
      mode,
      history,
      ragContext,
      fileSummaries,
      relevantChunks,
      previousQuestion,
      previousAnswer,
      tutorStyleIndex,
    });

    const finalReply = mode === "deep-search" || mode === "exam" ? repairHighPriorityTable(reply) : reply;

    res.json({
      success: true,
      reply: finalReply,
      mode: mode || "normal",
      provider: "groq",
      model: GROQ_MODEL,
      rag: true,
      sessionId,
      files: getPublicSessionFiles(session),
      selectedChunks: relevantChunks.map((chunk) => ({
        fileName: chunk.fileName,
        chunkIndex: chunk.chunkIndex,
        title: chunk.title,
        score: chunk.score,
      })),
      latestUploadStatus: extractedUploadFiles.map(({ text, chunks, ...rest }) => rest),
    });
  } catch (error) {
    console.error("Chat API Error:", error.message);
    const fallbackReply = generateFallbackResponse(req.body.message || "your topic", req.body.mode || "", fileSummaries);
    res.json({
      success: true,
      reply: fallbackReply,
      mode: req.body.mode || "normal",
      provider: "fallback",
      warning: error.message,
      files: fileSummaries,
      selectedChunks: relevantChunks,
      sessionId: req.body.sessionId || null,
    });
  }
});

app.use((error, req, res, next) => {
  console.error("Server Middleware Error:", error.message);
  res.status(400).json({ success: false, error: error.message || "File upload error" });
});

app.listen(PORT, () => {
  console.log(`Nexus AI backend running on http://localhost:${PORT}`);
});
