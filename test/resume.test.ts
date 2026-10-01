import { describe, expect, it } from 'vitest';

import { buildMultipartBody, MAX_RESUME_BYTES, normaliseScreening, resumeFileProblem } from '../nodes/Jia/transform';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('resume body')]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('docx body')]);

describe('resumeFileProblem', () => {
	it('accepts PDF and DOCX by content', () => {
		expect(resumeFileProblem(PDF, 'cv.pdf')).toBeUndefined();
		expect(resumeFileProblem(DOCX, 'cv.docx')).toBeUndefined();
		// The name doesn't matter; the bytes do.
		expect(resumeFileProblem(PDF, 'download')).toBeUndefined();
	});

	it('rejects empty, oversized and other file types', () => {
		expect(resumeFileProblem(Buffer.alloc(0), 'a.pdf')).toMatch(/empty/);
		expect(resumeFileProblem(Buffer.concat([PDF, Buffer.alloc(MAX_RESUME_BYTES)]), 'big.pdf')).toMatch(/10 MB/);
		expect(resumeFileProblem(Buffer.from('\x89PNG\r\n'), 'photo.png')).toMatch(/not a PDF or DOCX/);
		expect(resumeFileProblem(Buffer.from('plain text resume'), 'cv.pdf')).toMatch(/not a PDF or DOCX/);
	});
});

describe('buildMultipartBody', () => {
	it('encodes fields and the file with a fixed boundary', () => {
		const { body, contentType } = buildMultipartBody(
			{ job_id: '812' },
			{ fieldName: 'resume', fileName: 'Jane Doe.pdf', mimeType: 'application/pdf', data: PDF },
			'BOUNDARY',
		);
		expect(contentType).toBe('multipart/form-data; boundary=BOUNDARY');
		const text = body.toString('latin1');
		expect(text).toContain('--BOUNDARY\r\nContent-Disposition: form-data; name="job_id"\r\n\r\n812\r\n');
		expect(text).toContain(
			'--BOUNDARY\r\nContent-Disposition: form-data; name="resume"; filename="Jane Doe.pdf"\r\nContent-Type: application/pdf\r\n\r\n',
		);
		expect(text.endsWith('\r\n--BOUNDARY--\r\n')).toBe(true);
	});

	it('keeps the file bytes intact', () => {
		const binary = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x0d, 0x0a, 0x80]);
		const { body } = buildMultipartBody({}, { fieldName: 'resume', fileName: 'x.pdf', mimeType: '', data: binary }, 'B');
		expect(body.includes(binary)).toBe(true);
		expect(body.toString('latin1')).toContain('Content-Type: application/octet-stream');
	});

	it('cannot be broken out of by a hostile file name', () => {
		const { body } = buildMultipartBody(
			{},
			{ fieldName: 'resume', fileName: 'a"\r\nX-Injected: 1.pdf', mimeType: 'application/pdf', data: PDF },
			'B',
		);
		const header = body.toString('latin1').split('\r\n\r\n')[0];
		expect(header).not.toContain('\r\nX-Injected');
		expect(header).toContain('filename="a%22  X-Injected: 1.pdf"');
	});
});

describe('normaliseScreening', () => {
	it('keeps score at the top level and adds the file name', () => {
		const out = normaliseScreening(
			{
				score: 74,
				composite_score: 74.2,
				summary: 'Good fit',
				strengths: ['Relevant experience'],
				gaps: [],
				attributes: { role_match: 75 },
				experience_gap_months: 3,
				candidate: { name: 'Jane Doe' },
				job_id: 812,
				injection_detected: false,
				credits_remaining: 431,
			},
			'jane.pdf',
		);
		expect(out.score).toBe(74);
		expect(out.job_id).toBe(812);
		expect(out.file_name).toBe('jane.pdf');
		expect(out.attributes).toEqual({ role_match: 75 });
	});

	it('fills safe defaults when fields are missing', () => {
		const out = normaliseScreening({}, 'x.pdf');
		expect(out).toMatchObject({ score: null, strengths: [], gaps: [], job_id: null, injection_detected: false });
	});
});
