import { describe, expect, it } from 'vitest';

import {
	buildJdPayload,
	DEFAULT_DEPARTMENT,
	DEFAULT_EXPERIENCE,
	errorHint,
	normaliseJd,
	parseJsonField,
	toDateOnly,
	toList,
} from '../nodes/Jia/transform';

const NOW = new Date('2026-09-29T10:00:00Z');

const AI_DRAFT = {
	title: 'Senior Backend Engineer',
	description: 'About the role',
	skills: ['Python', 'FastAPI', ' '],
	experience: '3-5 years',
	departmentName: 'Engineering',
	employment_type: 'full_time',
	job_location: ['Bengaluru'],
	salary_min: 1800000.4,
	salary_max: 2600000,
	application_deadline: '2026-11-30',
	questionnaire: null,
};

describe('toList', () => {
	it('splits comma strings and cleans arrays', () => {
		expect(toList('a, b,,c ')).toEqual(['a', 'b', 'c']);
		expect(toList([' x ', '', 'y'])).toEqual(['x', 'y']);
		expect(toList(null)).toEqual([]);
		expect(toList('')).toEqual([]);
	});
	it("strips the parentheses JIA's AI wraps skills in", () => {
		expect(toList('(Python, FastAPI, Azure)')).toEqual(['Python', 'FastAPI', 'Azure']);
		expect(toList('Go (Golang), Rust')).toEqual(['Go (Golang)', 'Rust']);
	});
});

describe('toDateOnly', () => {
	it('keeps the date part of ISO strings', () => {
		expect(toDateOnly('2026-11-30T00:00:00')).toBe('2026-11-30');
		expect(toDateOnly('2026-11-30')).toBe('2026-11-30');
	});
	it('returns undefined for blanks and garbage', () => {
		expect(toDateOnly('')).toBeUndefined();
		expect(toDateOnly('not a date')).toBeUndefined();
	});
});

describe('parseJsonField', () => {
	it('parses JSON strings and passes other values through', () => {
		expect(parseJsonField('["a"]', [])).toEqual(['a']);
		expect(parseJsonField(['b'], [])).toEqual(['b']);
		expect(parseJsonField('{bad', [])).toEqual([]);
		expect(parseJsonField(null, [])).toEqual([]);
	});
});

describe('buildJdPayload', () => {
	it('maps an AI draft into a valid create body', () => {
		expect(buildJdPayload(AI_DRAFT, {}, 'ai_generated', NOW)).toEqual({
			title: 'Senior Backend Engineer',
			description: 'About the role',
			experience: '3-5 years',
			departmentName: 'Engineering',
			jd_creation_mode: 'ai_generated',
			skills: 'Python, FastAPI',
			job_location: ['Bengaluru'],
			employment_type: 'FULL_TIME',
			salary_min: 1800000,
			salary_max: 2600000,
			application_deadline: '2026-11-30',
		});
	});

	it('lets user values override the AI', () => {
		const payload = buildJdPayload(
			AI_DRAFT,
			{ title: 'Staff Engineer', skills: 'Go, Rust', department: 'Platform', locations: ['Remote'] },
			'ai_generated',
			NOW,
		);
		expect(payload.title).toBe('Staff Engineer');
		expect(payload.skills).toBe('Go, Rust');
		expect(payload.departmentName).toBe('Platform');
		expect(payload.job_location).toEqual(['Remote']);
	});

	it('treats blank user values as not provided', () => {
		const payload = buildJdPayload(AI_DRAFT, { title: '  ', skills: '' }, 'ai_generated', NOW);
		expect(payload.title).toBe('Senior Backend Engineer');
		expect(payload.skills).toBe('Python, FastAPI');
	});

	it('fills required fields the AI left null', () => {
		const payload = buildJdPayload(
			{ ...AI_DRAFT, experience: null, departmentName: null },
			{},
			'ai_generated',
			NOW,
		);
		expect(payload.experience).toBe(DEFAULT_EXPERIENCE);
		expect(payload.departmentName).toBe(DEFAULT_DEPARTMENT);
	});

	it('drops a past AI deadline but keeps a past user deadline', () => {
		const pastAi = buildJdPayload({ ...AI_DRAFT, application_deadline: '2026-01-01' }, {}, 'ai_generated', NOW);
		expect(pastAi.application_deadline).toBeUndefined();
		const pastUser = buildJdPayload(AI_DRAFT, { applicationDeadline: '2026-01-01T00:00:00' }, 'ai_generated', NOW);
		expect(pastUser.application_deadline).toBe('2026-01-01');
	});

	it('numbers custom questions and skips blank ones', () => {
		const payload = buildJdPayload(
			{},
			{
				title: 't',
				description: 'd',
				experience: 'e',
				department: 'x',
				customQuestions: [{ text: 'Why us?', required: true }, { text: ' ' }, { text: 'Notice period?' }],
			},
			'manual',
			NOW,
		);
		expect(payload.custom_interview_questions).toEqual([
			{ text: 'Why us?', required: true, order: 0 },
			{ text: 'Notice period?', required: false, order: 1 },
		]);
		expect(payload.jd_creation_mode).toBe('manual');
	});

	it('leaves optional fields out when nothing provides them', () => {
		const payload = buildJdPayload({}, { title: 't', description: 'd', experience: 'e', department: 'x' }, 'manual', NOW);
		expect(Object.keys(payload).sort()).toEqual(
			['departmentName', 'description', 'experience', 'jd_creation_mode', 'title'].sort(),
		);
	});
});

describe('normaliseJd', () => {
	it('parses JSON-string columns from a saved JIA record', () => {
		const out = normaliseJd(
			{
				job_id: 812,
				public_jd_id: '1000812',
				title: 'T',
				skills: 'Python, FastAPI',
				job_position: 'Engineering',
				job_location: '["Bengaluru, Karnataka"]',
				custom_interview_questions: '[{"text":"Why?","required":true,"order":0}]',
				application_deadline: '2026-11-30T00:00:00',
				is_active: true,
			},
			true,
		);
		expect(out.job_id).toBe(812);
		expect(out.department).toBe('Engineering');
		expect(out.skills).toEqual(['Python', 'FastAPI']);
		expect(out.job_location).toEqual(['Bengaluru, Karnataka']);
		expect(out.custom_interview_questions).toEqual([{ text: 'Why?', required: true, order: 0 }]);
		expect(out.application_deadline).toBe('2026-11-30');
		expect(out.saved).toBe(true);
	});

	it('marks a draft as unsaved with no job_id', () => {
		const out = normaliseJd({ title: 'T', departmentName: 'Eng', job_location: ['Remote'] }, false);
		expect(out.job_id).toBeNull();
		expect(out.saved).toBe(false);
		expect(out.department).toBe('Eng');
		expect(out.job_location).toEqual(['Remote']);
	});
});

describe('errorHint', () => {
	it('covers the common JIA error cases', () => {
		expect(errorHint(401, 'Invalid API key')).toMatch(/API key/);
		expect(errorHint(400, 'JD credit limit exceeded. Please upgrade your plan.')).toMatch(/credits/);
		expect(errorHint(402, 'No resume screening credits available.')).toMatch(/credits/);
		expect(errorHint(429, 'Too many requests')).toMatch(/rate limit/);
		expect(errorHint(500, 'boom')).toMatch(/duplicate/);
		expect(errorHint(422, 'application_deadline must be a future date')).toBeUndefined();
	});
});
