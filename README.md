# n8n-nodes-jia

This is an n8n community node. It lets you use [JIA (Just Interview AI)](https://justinterview.ai) in your n8n workflows.

JIA is an AI hiring platform. This node lets a workflow generate and manage job descriptions in your JIA organization.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) ·
[Credentials](#credentials) ·
[Operations](#operations) ·
[Usage](#usage) ·
[Limits](#limits) ·
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation, and install the package `n8n-nodes-jia`.

## Credentials

The node uses a **JIA API** credential.

1. In JIA, open **Settings → API Keys** (organization owners only) and create a key. Copy it: JIA shows the full key only once.
2. In n8n, create a **JIA API** credential:
   - **Base URL**: the URL of your JIA backend API, without a trailing slash.
   - **API Key**: the key from step 1.
3. Click **Test**. n8n checks the key against JIA without using any credits.

A key acts as the JIA member who created it. It stops working as soon as it is revoked in JIA, or that member is deactivated.

## Operations

### Job Description

| Operation | What it does |
|---|---|
| **Generate** | Writes a job description with JIA AI from a short description of the role. With **Save to JIA** on (the default) it also saves the job in JIA; with it off, it only returns the draft. **Override Fields** replace what the AI writes. |
| **Create** | Saves a job description from fields you provide: Title, Description, Experience and Department are required. |
| **Get** | Gets one job description, picked from a searchable list or by ID. |
| **Get Many** | Lists job descriptions, with optional search, status and department filters. |

Every field accepts n8n expressions, so values can come from earlier nodes, for example `{{ $json.role }}`.

#### Output

Each job description is returned as one item:

```json
{
  "job_id": 812,
  "public_jd_id": "1000812",
  "title": "Senior Backend Engineer",
  "description": "…",
  "skills": ["Python", "FastAPI", "PostgreSQL"],
  "experience": "3-5 years",
  "department": "Engineering",
  "employment_type": "FULL_TIME",
  "job_location": ["Bengaluru, Karnataka"],
  "salary_min": 1800000,
  "salary_max": 2600000,
  "application_deadline": "2026-11-30",
  "custom_interview_questions": [],
  "is_active": true,
  "saved": true
}
```

A draft that was not saved has `"saved": false` and `"job_id": null`.

## Usage

**Sheet row to published job**: Google Sheets Trigger (new row) → JIA *Job Description: Generate* with **Job Details** set to `{{ $json.role }}, {{ $json.experience }}, {{ $json.location }}` → Slack message with the new `job_id`.

**Draft for review**: JIA *Generate* with **Save to JIA** off → send the draft for approval → JIA *Create* with the approved fields.

## Limits

- **Saving uses a JD credit.** Generate (with Save on) and Create each use 1 JD credit. When the organization is out of credits, JIA returns an error and nothing is saved.
- **Saved jobs are published immediately.** JIA has no draft state for jobs; use Generate with Save off if you need a review step.
- **Saves are not retried automatically**, because a retry would create a duplicate job and use another credit. If you enable n8n's *Retry On Fail*, check JIA for duplicates.
- **Generation takes time.** AI generation typically takes a few seconds and up to about 20 seconds. The node waits up to 120 seconds per request.
- **Past deadlines.** JIA rejects deadlines in the past. A past deadline suggested by the AI is dropped; a past deadline you set yourself is sent, and JIA returns an error.
- **Rate limit.** Each API key is limited to 60 requests per minute.

Errors from JIA appear in n8n with JIA's own message and HTTP status. With *Continue On Fail* on, a failed item returns `{ "error": "…", "httpCode": "…" }` and the other items keep running.

## Compatibility

Built with `@n8n/node-cli` and tested against n8n 2.x.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Version history

See [CHANGELOG.md](CHANGELOG.md).
