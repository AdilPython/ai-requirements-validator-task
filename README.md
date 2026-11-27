# AI Requirements Validator (`Агент проверки требований`)

**Automated static quality audit for fintech software specifications — built for the BCC-HUB × MNU FinTech Hackathon.**

AI Requirements Validator audits functional, non-functional, data, and REST API specifications in **Markdown**, **TXT**, and **PDF** against **ISO/IEC/IEEE 29148** and **ISO/IEC 25010** engineering standards. Every finding is grounded in exact line- or page-level citations from the source document and compiled into a structured, audit-ready **Russian-language report** across **PDF**, **Markdown**, and **JSON**.

---

## 1. Project Overview & Value Proposition

Reviewing fintech specifications manually before sprint kickoff is slow and error-prone—especially when parent business requirements drift out of sync with child REST API contracts. AI Requirements Validator solves this by acting as a deterministic pre-development quality gate:

- **Multi-Format Ingestion with Source Traceability**: Parses `.md`, `.txt`, and `.pdf` (via `pdfjs-dist`) while preserving exact line numbers, section paths, and page coordinates, with section-aware chunking for large documents.
- **Standards-Aligned Quality Audit**: Separates true requirements from headings/metadata, assigns stable IDs (`REQ-001`, …), evaluates each requirement across **7 IEEE 29148 / ISO 25010 criteria**, and performs a **7-axis cross-document audit** covering contradictions, gaps, duplicates, terminology/unit drift, edge cases, parent–child spec conflicts, and integration readiness.
- **Evidence-First Findings & Go/No-Go Verdict**: Classifies every issue (`Critical`, `High`, `Medium`, `Low`) as either a `confirmed_defect` (with verbatim evidence) or a `question_or_risk`, ending with an actionable **Development & QA Readiness Verdict**.
- **Cross-Platform Multi-Format Reporting**: Single command exports a print-ready Cyrillic **PDF** (bundled `DejaVuSans` fonts via `pdfkit`), **Markdown**, and **JSON**, plus an optional interactive React workspace (`npm run dev`).

---

## 2. Audit Highlights (`docs/requirements.md` Case Study)

Running the agent directly against the hackathon target specification ([`docs/requirements.md`](docs/requirements.md) — *«Уведомление о расходах по карте»*) produced the following verified audit artifacts:

- **PDF Report**: [`output/report.pdf`](output/report.pdf)
- **Markdown Report**: [`output/report.md`](output/report.md)
- **Structured JSON**: [`output/report.json`](output/report.json)

### Audit Summary

| Metric | Result |
| :--- | :--- |
| **Target Specification** | `docs/requirements.md` (199 lines, 34 sections) |
| **Model & Execution** | `gemini-3.5-flash-lite` · 1 holistic pass · ~14.01 s (`git:4c79feb`) |
| **Extracted Requirements** | **8** (`REQ-001`–`REQ-008`: 4 functional, 1 non-functional, 1 data, 1 integration, 1 acceptance) |
| **Confirmed Defects** | **7** (`FND-001`–`FND-007`: **3 High**, **4 Medium**, 0 Critical) |
| **Final Verdict** | **Requires Revision / Not Ready for Dev or QA** (*«Требуется доработка» — Разработка: Нет, Тестирование: Нет*) |

### Key Uncovered Defects (with Exact Line Citations)

- **State-Mutating `GET` Endpoint (`FND-001` · High · Lines 104, 108–109)**: `REST type | GET` is specified for `/alerts/saveLimit` with sensitive/state-changing parameters (`cardId=demo-42&amount=50000&enabled=1`) passed in URL query strings instead of a `POST` or `PUT` JSON body.
- **`Content-Type` vs. Empty Body Contradiction (`FND-002` · Medium · Lines 147–148)**: Request headers mandate `Content-Type: application/json`, while the very next line states `Тело не используется.` (*"Body is not used."*).
- **Business Validation Errors Returned as `HTTP 200 OK` (`FND-003` · High · Lines 165, 171)**: Under `#### 200. Successful — Created`, failed validation returns `{"result":"ERROR","message":"Проверьте сумму"}` instead of proper client error status codes (`400 Bad Request` / `422 Unprocessable Entity`).
- **Missing Read-Settings Endpoint (`FND-005` · High · Line 103)**: Parent requirements (`ИНТ-1` / `REQ-007`) and the API description explicitly require reading the threshold (*«Функциональные требования: чтение порога»*), yet Child Spec `Часть B` defines only a write/save operation and omits any read endpoint.
- **Request vs. Response Type Mismatch (`FND-006` · Medium · Lines 156–157)**: `amount` and `enabled` are accepted as `integer` in the request parameters, but documented as `string` (`limit_kzt`, `"0"`/`"1"`) in the response table.
- **Missing Production & Swagger Metadata (`FND-004`, `FND-007` · Medium · Lines 108, 110)**: Production Base URL (`Prod: —`) and OpenAPI/Swagger specification link (`Swagger: —`) are left blank, blocking production integration planning and contract testing.

---

## 3. Architecture & Zero-Hallucination Design

The validation engine (`src/server/validator.ts`) executes a strict **two-stage pipeline** backed by Gemini structured outputs and runtime validation:

1. **Stage 1 — Document Ingestion & Per-Requirement Extraction**:
   - `documentProcessor.ts` normalizes Markdown/TXT/PDF content into numbered lines or pages and groups sections without silently dropping content (`25,000`-character default threshold keeps medium specs in one holistic pass while supporting large multi-chunk PDFs).
   - Gemini extracts true requirements (filtering out titles, table boilerplate, and metadata) and scores each requirement across **7 individual criteria**: *Unambiguity, Completeness, Verifiability, Feasibility, Necessity, Consistency,* and *Terminology*.
2. **Stage 2 — Holistic Cross-Document Audit, Deduplication & Schema Enforcement**:
   - A second structured pass evaluates the full requirement set across **7 document-level aspects** (including parent–child spec alignment and integration completeness) without duplicating Stage 1 findings.
   - `deduplicateFindings()` merges overlapping defects across chunks/passes by normalized evidence, source location, and issue summary before assigning sequential `FND-001..` IDs and computing statistics.
   - **Zero-Hallucination & Runtime Safety**: Prompts strictly prohibit inventing quotes—unproven concerns must be tagged `question_or_risk` rather than `confirmed_defect`. Every Gemini response is constrained via `responseSchema` (`@google/genai`) and strictly re-validated at runtime with **Zod** (`src/server/schemas.ts`), with server-only `GEMINI_API_KEY` isolation.

---

## 4. Quick Start (CLI & Web UI)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` from `.env.example` and add your [Google AI Studio API key](https://aistudio.google.com/apikey) (`.env` is gitignored):

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

### 3. Run CLI Audit, Web UI, or Automated Tests

```bash
# Run reproducible CLI audit (automatically writes .pdf, .md, and .json to output/)
npm run analyze -- --input docs/requirements.md --output output/report.pdf

# Launch optional Web UI on http://localhost:3000 (server-side API key proxy)
npm run dev

# Run the 10 automated tests (parsing, schemas, deduplication, CLI, PDF/MD formatting)
npm test
```

> You can also target `--output output/report.md` or `--output output/report.json` directly, or pass a `.pdf` specification via `--input path/to/spec.pdf`.

---

## 5. Repository Structure

```text
.
├── docs/
│   └── requirements.md            # Target fintech specification audited by the agent
├── output/
│   ├── report.pdf                 # Generated Russian audit report (PDF with DejaVuSans Cyrillic)
│   ├── report.md                  # Generated Russian audit report (Markdown)
│   └── report.json                # Machine-readable validated audit output (JSON)
├── scripts/
│   └── analyze.ts                 # Reproducible CLI runner (`npm run analyze`)
├── src/
│   ├── components/                # React workspace UI (upload, report tabs, source viewer, standards)
│   ├── data/
│   │   └── standards.ts           # ISO/IEC/IEEE 29148 & ISO 25010 audit criteria reference
│   ├── server/
│   │   ├── documentProcessor.ts   # Markdown/TXT/PDF parser & section-preserving chunker
│   │   ├── pdfFormatter.ts        # Cross-platform Cyrillic PDF renderer (pdfkit + dejavu-fonts-ttf)
│   │   ├── reportFormatter.ts     # Structured Russian Markdown report generator
│   │   ├── schemas.ts             # Gemini responseSchema definitions & Zod runtime validators
│   │   └── validator.ts           # Two-stage LLM validation pipeline & finding deduplicator
│   ├── types/
│   │   └── validation.ts          # Shared TypeScript interfaces
│   ├── App.tsx                    # Web application entry component
│   └── main.tsx                   # React DOM bootstrap
├── tests/
│   └── validator.test.ts          # 10 unit/integration tests across 4 suites
├── .env.example                   # Environment template (no secrets)
├── package.json                   # Scripts & dependencies
└── server.ts                      # Express + Vite server (port 3000)
```
