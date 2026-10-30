# Changelog

## 1.0.0 (2026-10-30)

Needs the JIA backend with the `/v1` API.

- Display names are now **JustInterview** and **JustInterview API** (the internal names `jia` and `jiaApi` are unchanged, so existing workflows and credentials keep working).
- The credential sends the key as `Authorization: Bearer` and tests it with `GET /v1/me`. Keys can carry permissions (scopes), and `jia_test_` keys run in sandbox mode.
- Resume > **Analyze** (`POST /v1/resumes/analyze`): file or https link, returns score, matched and missing skills and a shortlist / review / reject recommendation.
- **Interview** resource: **Send Invite** (AI voice interview) and **Get Status**.
- The Job picker uses `GET /v1/jobs`.
- **JustInterview Trigger** node: *Interview Completed* and *Resume Analyzed*, with signed deliveries.
- Example workflows in `workflows/`.

## 0.2.0 (unreleased)

- Resume resource with a Screen operation: scores a PDF or DOCX resume from an input binary field against an existing JIA job or job description text, and returns the score, summary, strengths, gaps, scored attributes and parsed candidate details. Needs the JIA backend with `POST /org/screen-resume` (JIAD-2090).

## 0.1.2 (2026-09-30)

- Node category is `Productivity` only. `HITL` is not an allowed community node category and failed n8n's verification scan.

## 0.1.1 (2026-09-30)

- Published from GitHub Actions with npm provenance (required for n8n verification).
- The package no longer ships the TypeScript build cache (`tsconfig.tsbuildinfo`).
- `repository.url` uses the canonical `git+https` form.
- README: team setup for credentials, and the release process.

## 0.1.0 (2026-09-30)

- JIA API credential (base URL + API key, sent as `X-JIA-API-Key`).
- Job Description resource: Generate, Create, Get and Get Many operations, with a searchable job picker.
