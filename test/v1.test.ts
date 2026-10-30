import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';

import { buildInviteBody, buildMultipartBody, normaliseAnalysis, signatureProblem } from '../nodes/Jia/transform';

describe('normaliseAnalysis', () => {
	it('flattens skills and keeps the recommendation', () => {
		const out = normaliseAnalysis(
			{ score: 82, recommendation: 'shortlist', skills: { matched: ['Python'], missing: ['Go'] }, test: true },
			'cv.pdf',
		);
		expect(out).toMatchObject({
			score: 82,
			recommendation: 'shortlist',
			skills_matched: ['Python'],
			skills_missing: ['Go'],
			test: true,
			source: 'cv.pdf',
		});
	});

	it('fills defaults for a sparse response', () => {
		const out = normaliseAnalysis({}, 'https://x/cv.pdf');
		expect(out.skills_matched).toEqual([]);
		expect(out.recommendation).toBeNull();
		expect(out.test).toBe(false);
	});
});

describe('buildInviteBody', () => {
	const base = { candidateName: ' Jane ', candidateEmail: 'jane@example.com', jobId: '812' };

	it('builds the request body', () => {
		expect(buildInviteBody({ ...base, deadline: '2030-01-01T00:00:00Z', resumeUrl: 'https://x/cv.pdf' })).toEqual({
			body: {
				candidate_name: 'Jane',
				candidate_email: 'jane@example.com',
				job_id: 812,
				deadline: '2030-01-01T00:00:00Z',
				resume_url: 'https://x/cv.pdf',
			},
		});
	});

	it('omits empty optional fields', () => {
		expect(buildInviteBody({ ...base, deadline: '', resumeUrl: ' ' }).body).toEqual({
			candidate_name: 'Jane',
			candidate_email: 'jane@example.com',
			job_id: 812,
		});
	});

	it.each([
		[{ candidateName: '' }, /Name/],
		[{ candidateEmail: 'nope' }, /valid email/],
		[{ jobId: 'abc' }, /numeric/],
		[{ resumeUrl: 'http://x/cv.pdf' }, /https/],
	])('rejects %o', (override, message) => {
		expect(buildInviteBody({ ...base, ...override }).error).toMatch(message);
	});
});

describe('buildMultipartBody without a file', () => {
	it('sends only the fields', () => {
		const { body } = buildMultipartBody({ resume_url: 'https://x/cv.pdf' }, undefined, 'B');
		expect(body.toString()).toBe(
			'--B\r\nContent-Disposition: form-data; name="resume_url"\r\n\r\nhttps://x/cv.pdf\r\n--B--\r\n',
		);
	});
});

describe('signatureProblem', () => {
	const secret = 's3cret';
	const hex = (payload: string) => createHmac('sha256', secret).update(payload).digest('hex');
	const body = '{"event":"interview.completed"}';
	const now = 1_800_000_000;
	const header = `t=${now},v1=${hex(`${now}.${body}`)}`;

	it('accepts a valid, fresh signature', () => {
		expect(signatureProblem(header, body, hex, now + 10)).toBeUndefined();
	});

	it('rejects tampering, staleness and malformed headers', () => {
		expect(signatureProblem(header, body + ' ', hex, now)).toBe('signature mismatch');
		expect(signatureProblem(header, body, hex, now + 301)).toBe('signature too old');
		expect(signatureProblem(undefined, body, hex, now)).toBe('missing signature');
		expect(signatureProblem('garbage', body, hex, now)).toBe('malformed signature');
	});
});
