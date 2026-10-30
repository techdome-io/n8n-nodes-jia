#!/usr/bin/env node
/**
 * End-to-end check of the JustInterview /v1 API that the node and trigger use.
 *
 *   JIA_BASE_URL=https://api.example.com JIA_API_KEY=jia_test_... \
 *   JIA_RESUME=./resume.pdf [JIA_JOB_ID=812] [JIA_WEBHOOK_URL=https://n8n.example.com/webhook/x] \
 *   node scripts/e2e-v1.mjs
 *
 * Use a jia_test_ key: it scores the resume for real but spends no credits, and the invite is
 * simulated (no email, nothing saved). With a live key the invite is real and uses a credit,
 * so the script refuses one unless JIA_ALLOW_LIVE=1.
 * Exits non-zero on the first failed step. No dependencies (Node 20+).
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const base = (process.env.JIA_BASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.JIA_API_KEY ?? '';
const resumePath = process.env.JIA_RESUME;
if (!base || !key || !resumePath) {
	console.error('Set JIA_BASE_URL, JIA_API_KEY and JIA_RESUME.');
	process.exit(2);
}
if (!key.startsWith('jia_test_') && process.env.JIA_ALLOW_LIVE !== '1') {
	console.error('Not a jia_test_ key: the invite would be real. Set JIA_ALLOW_LIVE=1 to run anyway.');
	process.exit(2);
}

const auth = { Authorization: `Bearer ${key}` };
let step = 0;

async function call(name, method, path, { json, form, expect = 200 } = {}) {
	step++;
	const init = { method, headers: { ...auth } };
	if (json) {
		init.headers['Content-Type'] = 'application/json';
		init.body = JSON.stringify(json);
	} else if (form) {
		init.body = form;
	}
	const res = await fetch(`${base}${path}`, init);
	const text = await res.text();
	let body;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}
	const ok = res.status === expect;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${step}. ${name}: HTTP ${res.status}`);
	if (!ok) {
		console.log(typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body, null, 2));
		process.exit(1);
	}
	return body;
}

function check(name, condition, detail) {
	step++;
	console.log(`${condition ? 'PASS' : 'FAIL'} ${step}. ${name}${condition ? '' : `: ${detail}`}`);
	if (!condition) process.exit(1);
}

// 1. Auth
const noKey = await fetch(`${base}/v1/me`);
check('request without a key is 401', noKey.status === 401, `got ${noKey.status}`);
const me = await call('GET /v1/me', 'GET', '/v1/me');
console.log(`   org ${me.org_name} (#${me.org_id}), plan ${me.plan}, test=${me.test}, scopes ${me.scopes.join(' ')}`);

// 2. Jobs
const jobs = await call('GET /v1/jobs', 'GET', '/v1/jobs?status=active&limit=5');
const jobId = Number(process.env.JIA_JOB_ID ?? jobs.data?.[0]?.id);
check('an active job to use', Number.isInteger(jobId) && jobId > 0, 'no active job; create one or set JIA_JOB_ID');
console.log(`   using job #${jobId}`);

// 3. Resume analysis
const form = new FormData();
form.append('job_id', String(jobId));
form.append('resume', new Blob([await readFile(resumePath)]), basename(resumePath));
const analysis = await call('POST /v1/resumes/analyze', 'POST', '/v1/resumes/analyze', { form });
check('analysis has a score and recommendation', typeof analysis.score === 'number' && !!analysis.recommendation,
	JSON.stringify(analysis).slice(0, 300));
console.log(`   score ${analysis.score}, ${analysis.recommendation}, matched ${analysis.skills?.matched?.length ?? 0} skills`);
if (key.startsWith('jia_test_')) check('sandbox analysis is not charged', analysis.credits_remaining === null, analysis.credits_remaining);

const badUrl = new FormData();
badUrl.append('job_id', String(jobId));
badUrl.append('resume_url', 'https://169.254.169.254/latest/meta-data');
await call('internal resume_url is refused', 'POST', '/v1/resumes/analyze', { form: badUrl, expect: 422 });

// 4. Interview invite + status
const invite = await call('POST /v1/interviews/invite', 'POST', '/v1/interviews/invite', {
	json: { candidate_name: 'E2E Candidate', candidate_email: `e2e+${Date.now()}@example.com`, job_id: jobId },
});
console.log(`   interview ${invite.interview_id}, ${invite.status}, test=${invite.test}`);
const status = await call('GET /v1/interviews/{id}', 'GET', `/v1/interviews/${encodeURIComponent(invite.interview_id)}`);
check('status is invited', status.status === 'invited', status.status);
await call('deadline under 24 h is refused', 'POST', '/v1/interviews/invite', {
	json: {
		candidate_name: 'E2E', candidate_email: 'e2e@example.com', job_id: jobId,
		deadline: new Date(Date.now() + 3600_000).toISOString(),
	},
	expect: 422,
});

// 5. Webhooks (needs a public https URL, e.g. an n8n webhook or webhook.site)
const hookUrl = process.env.JIA_WEBHOOK_URL;
if (hookUrl) {
	const hook = await call('POST /v1/webhooks', 'POST', '/v1/webhooks', {
		json: { url: hookUrl, events: ['resume.analyzed', 'interview.completed'] },
	});
	check('webhook secret returned once', typeof hook.secret === 'string' && hook.secret.length === 64, hook.secret);
	const list = await call('GET /v1/webhooks', 'GET', '/v1/webhooks');
	check('webhook listed without its secret', list.data.some((h) => h.id === hook.id && !('secret' in h)), JSON.stringify(list));
	const again = new FormData();
	again.append('job_id', String(jobId));
	again.append('resume', new Blob([await readFile(resumePath)]), basename(resumePath));
	await call('analysis fires resume.analyzed', 'POST', '/v1/resumes/analyze', { form: again });
	console.log(`   check ${hookUrl} for a signed resume.analyzed delivery (X-JIA-Signature)`);
	await call('DELETE /v1/webhooks/{id}', 'DELETE', `/v1/webhooks/${hook.id}`, { expect: 204 });
} else {
	console.log('SKIP webhooks: set JIA_WEBHOOK_URL to test them');
}

console.log(`\nAll ${step} checks passed.`);
