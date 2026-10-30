# n8n-nodes-jia

This is an n8n community node. It lets you use [JustInterview (JIA)](https://justinterview.ai) in your n8n workflows.

JustInterview is an AI hiring platform. The **JustInterview** node analyzes resumes, sends AI voice interview invites, checks interview results and manages job descriptions. The **JustInterview Trigger** starts a workflow when an interview is completed or a resume is analyzed.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) ·
[Credentials](#credentials) ·
[Operations](#operations) ·
[Trigger](#trigger) ·
[Example workflows](#example-workflows) ·
[Usage](#usage) ·
[Limits](#limits) ·
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation, and install the package `n8n-nodes-jia`.

On self-hosted n8n, an instance **owner or admin** installs it once from **Settings → Community nodes → Install**; the node and credential are then available to every user of that instance. If the menu is missing, set `N8N_COMMUNITY_PACKAGES_ENABLED=true`. In queue mode, also set `N8N_REINSTALL_MISSING_PACKAGES=true` so workers install it too.

## Credentials

The nodes use a **JustInterview API** credential (named *JIA API* before 1.0.0).

1. In JIA, open **Settings → API Keys** (organization owners only) and create a key. Pick its **permissions** (Analyze resumes, Send interview invites, Read jobs, Read interview results) and copy it: JIA shows the full key only once.
2. In n8n, create a **JustInterview API** credential:
   - **Base URL**: the URL of your JIA backend API, without a trailing slash.
   - **API Key**: the key from step 1.
3. Click **Test**. n8n calls `GET /v1/me` without using any credits.

The key is sent as `Authorization: Bearer <key>`.

**Test keys.** A key that starts with `jia_test_` (tick *Test key* when creating it) runs in sandbox mode: Analyze scores resumes for real but uses no credits, Send Invite is simulated (no email, nothing saved, the `interview_id` starts with `test_`), and the Trigger only receives sandbox events. Test keys can't use the Job Description operations.

**Rotating a key.** *Regenerate* in **Settings → API Keys** replaces a key with a new one with the same permissions; the old one stops at once.

A key acts as the JIA member who created it. It stops working as soon as it is revoked in JIA, that member is deactivated, or that member changes their password or signs out everywhere.

### Setting up JIA for a team

Each key belongs to one JIA organization, so use one credential per organization (for example **JIA – QA** and **JIA – Production**).

1. A JIA organization owner creates one key per environment.
2. An n8n admin creates a project (for example **JIA Hiring**), adds the **JIA API** credential to it, and adds the people who build hiring workflows as project members.
3. Members pick the shared credential in the JIA node. They can run workflows with it but can't see the key.
4. To rotate a key, revoke it in JIA, create a new one, and update the single credential; every workflow keeps working.

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

### Resume

| Operation | What it does |
|---|---|
| **Analyze** | Scores one resume against a job and returns the score, matched and missing skills and a recommendation (`shortlist` at 70+, `review` at 50–69, `reject` below 50). The resume is a **File** from an input binary field or a public `https://` **Link**. Uses `POST /v1/resumes/analyze`. |
| **Screen** | Scores one resume against a job with JIA AI. The resume comes from an input binary field (default `data`), for example a Gmail attachment (`attachment_0`), an HTTP download or a form upload. Choose **Existing Job** to screen against a job in JIA, or **Job Description Text** to paste one. |

Each input item is screened separately, so 10 resumes in give 10 results out. JIA accepts **PDF and DOCX** up to 10 MB; scanned (image-only) PDFs can't be read.

#### Screening output

```json
{
  "score": 88,
  "composite_score": 85.7,
  "summary": "Strong fit for the Senior Backend Engineer role…",
  "strengths": ["Relevant experience", "Relevant projects", "Certifications", "Resume quality"],
  "gaps": [],
  "attributes": { "relevant_experience_score": 92, "relevant_projects_score": 85, "certifications_score": 80, "resume_quality_score": 95 },
  "experience_gap_months": 0,
  "candidate": { "name": "Aarav Test", "email": "aarav.test@example.com", "phone": "+919800000010", "years_of_experience": 6 },
  "job_id": 7980,
  "injection_detected": false,
  "credits_remaining": 2,
  "file_name": "resume.pdf"
}
```

Analyze returns the same fields plus `recommendation`, `skills_matched`, `skills_missing`, `test` and `source` (the file name or link).

`score` is top level so an IF node can branch on it, for example `{{ $json.score >= 70 }}`. `composite_score` uses the job's evaluation profile and is `null` when screening against pasted text. Turn on **Include Input Binary** to pass the resume file on to later steps.

### Interview

| Operation | What it does |
|---|---|
| **Send Invite** | Emails a candidate an AI voice interview for a job: Candidate Name, Candidate Email and Job, plus an optional **Deadline** (24 hours to 7 days from now) and **Resume URL**. Uses 1 AI interview credit. |
| **Get Status** | Returns an interview's `status` (`invited`, `in_progress`, `evaluating`, `completed`, `expired`), `score` (0–100) and `report_url`. |

```json
{
  "interview_id": "5512",
  "status": "invited",
  "invite_link": "https://app.justinterview.ai/interview/…",
  "expires_at": "2026-11-06T10:00:00",
  "job_id": 812,
  "candidate_email": "jane@example.com",
  "test": false
}
```

The **Job** picker on Analyze and Send Invite lists your active jobs (`GET /v1/jobs`).

## Trigger

The **JustInterview Trigger** registers its webhook URL with JIA when the workflow is activated and removes it when deactivated. Events:

- **Interview Completed** (`interview.completed`): the interview is over and its evaluation report is ready. The item has the Get Status fields: `interview_id`, `candidate_name`, `candidate_email`, `job_id`, `score`, `report_url`, `completed_at`.
- **Resume Analyzed** (`resume.analyzed`): a resume was analyzed through the API. The item has the Analyze fields.

Every delivery is signed (`X-JIA-Signature`, HMAC-SHA256) with a secret JIA gives the trigger at registration; unsigned or stale requests are refused. JIA retries a failed delivery for about 1.5 hours. The n8n instance must be reachable from JIA over `https`.

## Example workflows

Import these from [`workflows/`](workflows) (**Workflows → Import from File**), then pick your credential and job in each JustInterview node.

1. [Resume analysis per job](workflows/01-resume-analysis-per-job.json): a form takes a candidate's resume, *Resume: Analyze* scores it against a job, and the result is split into shortlist / review / reject.
2. [Invite top candidates](workflows/02-invite-top-candidates.json): analyzes each applicant and sends an AI voice interview to everyone scoring above 70; a second branch uses the Trigger to collect completed interview scores.

### Checking a JIA environment

`scripts/e2e-v1.mjs` runs the API the node uses end to end (auth, jobs, analyze, invite, status and, with `JIA_WEBHOOK_URL`, webhooks). Use a `jia_test_` key so nothing is charged or emailed:

```bash
JIA_BASE_URL=https://your-jia-backend.example.com JIA_API_KEY=jia_test_... JIA_RESUME=./resume.pdf node scripts/e2e-v1.mjs
```

## Usage

**Sheet row to published job**: Google Sheets Trigger (new row) → JIA *Job Description: Generate* with **Job Details** set to `{{ $json.role }}, {{ $json.experience }}, {{ $json.location }}` → Slack message with the new `job_id`.

**Screen inbound applications**: Gmail Trigger (has attachment) → JIA *Resume: Screen* with **Input Binary Field** `attachment_0` and an **Existing Job** → IF `{{ $json.score >= 70 }}` → notify the recruiter.

**Draft for review**: JIA *Generate* with **Save to JIA** off → send the draft for approval → JIA *Create* with the approved fields.

## Limits

- **Saving uses a JD credit.** Generate (with Save on) and Create each use 1 JD credit. When the organization is out of credits, JIA returns an error and nothing is saved.
- **Saved jobs are published immediately.** JIA has no draft state for jobs; use Generate with Save off if you need a review step.
- **Saves are not retried automatically**, because a retry would create a duplicate job and use another credit. If you enable n8n's *Retry On Fail*, check JIA for duplicates.
- **Generation takes time.** AI generation typically takes a few seconds and up to about 20 seconds. The node waits up to 120 seconds per request.
- **Past deadlines.** JIA rejects deadlines in the past. A past deadline suggested by the AI is dropped; a past deadline you set yourself is sent, and JIA returns an error.
- **Screening uses a resume-screening credit**, only when a score is produced. Unreadable files and errors are not charged. Screens are not retried automatically.
- **Invites use an AI interview credit** and are not retried automatically. A candidate who already has an active invite for the job gets a 409 error instead of a second invite.
- **Rate limit.** Each API key is limited to 60 requests per minute. A 429 response carries `Retry-After` (seconds).

Errors from JIA appear in n8n with JIA's own message and HTTP status. With *Continue On Fail* on, a failed item returns `{ "error": "…", "httpCode": "…" }` and the other items keep running.

## Compatibility

Built with `@n8n/node-cli` and tested against n8n 2.x.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Releasing (maintainers)

`main` only accepts reviewed pull requests, so releases are cut by tag:

1. Open a PR that bumps `version` in `package.json` and `package-lock.json` and adds a `CHANGELOG.md` entry. Merge it after review.
2. Tag the merged commit and push only the tag:
   ```bash
   git switch main && git pull
   git tag 0.1.2
   git push origin 0.1.2
   ```
3. The tag runs `.github/workflows/publish.yml`, which lints, builds and publishes to npm with provenance through npm Trusted Publishing.

## Version history

See [CHANGELOG.md](CHANGELOG.md).
