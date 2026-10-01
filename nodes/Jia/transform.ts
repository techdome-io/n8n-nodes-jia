/**
 * Pure helpers that shape data between n8n and the JIA API. Kept free of n8n
 * runtime imports so they can be unit-tested directly.
 */

export type JsonObject = { [key: string]: unknown };

export const DEFAULT_DEPARTMENT = 'General';
export const DEFAULT_EXPERIENCE = 'Not specified';

export const EMPLOYMENT_TYPES = [
	'FULL_TIME',
	'PART_TIME',
	'CONTRACTOR',
	'TEMPORARY',
	'INTERN',
	'OTHER',
] as const;

const isBlank = (value: unknown): boolean =>
	value === undefined ||
	value === null ||
	(typeof value === 'string' && value.trim() === '') ||
	(Array.isArray(value) && value.length === 0);

/**
 * "a, b" or ["a", "b"] → ["a", "b"]. Blank entries are dropped. JIA's AI
 * prompt asks for skills as "(a, b, c)", so one pair of wrapping parentheses
 * around the whole string is removed.
 */
export function toList(value: unknown): string[] {
	if (isBlank(value)) return [];
	const text = Array.isArray(value) ? '' : String(value).trim().replace(/^\((.*)\)$/s, '$1');
	const parts = Array.isArray(value) ? value : text.split(',');
	return parts.map((p) => String(p).trim()).filter((p) => p !== '');
}

/** JIA stores some list/object columns as JSON strings; parse them when needed. */
export function parseJsonField<T>(value: unknown, fallback: T): T {
	if (value === undefined || value === null || value === '') return fallback;
	if (typeof value !== 'string') return value as T;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

/** Any date-ish value → "YYYY-MM-DD", or undefined if it can't be read. */
export function toDateOnly(value: unknown): string | undefined {
	if (isBlank(value)) return undefined;
	const text = String(value).trim();
	const direct = /^(\d{4}-\d{2}-\d{2})/.exec(text);
	if (direct) return direct[1];
	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

const todayUtc = (now: Date): string => now.toISOString().slice(0, 10);

export interface CustomQuestionInput {
	text?: string;
	required?: boolean;
}

/**
 * Overrides the user typed into the node. Any field left blank falls back to
 * the AI value, then to a safe default.
 */
export interface JdOverrides {
	title?: string;
	description?: string;
	department?: string;
	experience?: string;
	skills?: string | string[];
	employmentType?: string;
	locations?: string | string[];
	salaryMin?: number;
	salaryMax?: number;
	applicationDeadline?: string;
	shiftTimings?: string;
	questionnaire?: string;
	customQuestions?: CustomQuestionInput[];
}

/**
 * Build the body for POST /org/create-job-description.
 *
 * `ai` is the draft from /org/create-jd-ai (or `{}` for a plain Create). User
 * values win over AI values. Required fields JIA may leave null are filled
 * with defaults, and an AI-suggested deadline that is already past is
 * dropped, because JIA rejects past deadlines. A past deadline the *user*
 * typed is kept, so JIA's validation error reaches them.
 */
export function buildJdPayload(
	ai: JsonObject,
	overrides: JdOverrides,
	mode: 'manual' | 'ai_generated',
	now: Date = new Date(),
): JsonObject {
	const pick = <T>(userValue: T | undefined, aiValue: unknown): unknown =>
		isBlank(userValue) ? aiValue : userValue;

	const payload: JsonObject = {
		title: pick(overrides.title, ai.title),
		description: pick(overrides.description, ai.description),
		experience: pick(overrides.experience, ai.experience),
		departmentName: pick(overrides.department, ai.departmentName ?? ai.job_position),
		jd_creation_mode: mode,
	};
	if (isBlank(payload.experience)) payload.experience = DEFAULT_EXPERIENCE;
	if (isBlank(payload.departmentName)) payload.departmentName = DEFAULT_DEPARTMENT;

	const skills = toList(pick(overrides.skills, ai.skills));
	if (skills.length) payload.skills = skills.join(', ');

	const locations = toList(pick(overrides.locations, ai.job_location));
	if (locations.length) payload.job_location = locations;

	const employmentType = pick(overrides.employmentType, ai.employment_type);
	if (!isBlank(employmentType)) payload.employment_type = String(employmentType).toUpperCase();

	for (const [key, user, aiKey] of [
		['salary_min', overrides.salaryMin, 'salary_min'],
		['salary_max', overrides.salaryMax, 'salary_max'],
	] as const) {
		const value = pick(user, ai[aiKey]);
		if (!isBlank(value) && Number.isFinite(Number(value))) payload[key] = Math.round(Number(value));
	}

	for (const [key, user, aiKey] of [
		['shift_timings', overrides.shiftTimings, 'shift_timings'],
		['questionnaire', overrides.questionnaire, 'questionnaire'],
	] as const) {
		const value = pick(user, ai[aiKey]);
		if (!isBlank(value)) payload[key] = String(value);
	}

	const userDeadline = toDateOnly(overrides.applicationDeadline);
	if (userDeadline) {
		payload.application_deadline = userDeadline;
	} else {
		const aiDeadline = toDateOnly(ai.application_deadline);
		if (aiDeadline && aiDeadline > todayUtc(now)) payload.application_deadline = aiDeadline;
	}

	const questions = (overrides.customQuestions ?? [])
		.filter((q) => !isBlank(q.text))
		.map((q, order) => ({ text: String(q.text).trim(), required: Boolean(q.required), order }));
	if (questions.length) payload.custom_interview_questions = questions;

	return payload;
}

/** Turn a JIA job-description record (or an unsaved draft) into clean node output. */
export function normaliseJd(raw: JsonObject, saved: boolean): JsonObject {
	const jobId = raw.job_id ?? null;
	return {
		job_id: saved ? jobId : null,
		public_jd_id: raw.public_jd_id ?? null,
		title: raw.title ?? null,
		description: raw.description ?? null,
		skills: toList(raw.skills),
		experience: raw.experience ?? null,
		department: raw.departmentName ?? raw.job_position ?? null,
		employment_type: raw.employment_type ?? null,
		job_location: toList(parseJsonField<unknown>(raw.job_location, [])),
		salary_min: raw.salary_min ?? null,
		salary_max: raw.salary_max ?? null,
		shift_timings: raw.shift_timings ?? null,
		application_deadline: toDateOnly(raw.application_deadline) ?? null,
		questionnaire: raw.questionnaire ?? null,
		custom_interview_questions: parseJsonField<unknown[]>(raw.custom_interview_questions, []),
		is_active: raw.is_active ?? (saved ? true : null),
		jd_creation_mode: raw.jd_creation_mode ?? null,
		created_at: raw.created_at ?? null,
		saved,
	};
}

/** Friendly hint shown under JIA's own error message, keyed by HTTP status. */
export function errorHint(status: number | undefined, detail: string): string | undefined {
	const text = detail.toLowerCase();
	if (status === 401) {
		return 'Check the API key in the JIA API credential. Create a new key in JIA under Settings → API Keys if it was revoked.';
	}
	if (status === 402 || (status === 400 && text.includes('credit'))) {
		return 'Your JIA organization is out of credits for this action. Top up in JIA Billing.';
	}
	if (status === 403) return "The API key's user does not have permission for this action in JIA.";
	if (status === 404) return 'The record was not found in your JIA organization.';
	if (status === 429) return 'JIA rate limit reached. Enable Retry On Fail with a wait, or slow the workflow down.';
	if (status !== undefined && status >= 500) return 'JIA had a server error. Check JIA before retrying a save, so you do not create a duplicate.';
	return undefined;
}

// ------------------------------------------------------------------ resume

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const MIN_JD_TEXT_CHARS = 50;

export interface MultipartFile {
	fieldName: string;
	fileName: string;
	mimeType: string;
	data: Buffer;
}

const PDF_MAGIC = Buffer.from('%PDF');
const DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Why this file can't be sent as a resume, or undefined if it can. JIA accepts
 * PDF and DOCX and checks the bytes, not the name, so the node does the same to
 * fail fast with a clear message instead of spending a request.
 */
export function resumeFileProblem(data: Buffer, fileName: string): string | undefined {
	if (data.length === 0) return `"${fileName}" is empty`;
	if (data.length > MAX_RESUME_BYTES) return `"${fileName}" is larger than 10 MB`;
	const head = data.subarray(0, 4);
	if (!head.equals(PDF_MAGIC) && !head.equals(DOCX_MAGIC)) {
		return `"${fileName}" is not a PDF or DOCX file. JIA screens PDF and DOCX resumes only.`;
	}
	return undefined;
}

/** Build a multipart/form-data body without any runtime dependency. */
export function buildMultipartBody(
	fields: Record<string, string>,
	file: MultipartFile,
	boundary = `----n8nJia${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`,
): { body: Buffer; contentType: string } {
	const quote = (value: string) => value.replace(/[\r\n"]/g, (c) => (c === '"' ? '%22' : ' '));
	const parts: Buffer[] = [];
	for (const [name, value] of Object.entries(fields)) {
		parts.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="${quote(name)}"\r\n\r\n${value}\r\n`,
				'utf8',
			),
		);
	}
	parts.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="${quote(file.fieldName)}"; filename="${quote(file.fileName)}"\r\n` +
				`Content-Type: ${file.mimeType || 'application/octet-stream'}\r\n\r\n`,
			'utf8',
		),
		file.data,
		Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
	);
	return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Flat screening output; `score` stays top level so an IF node can branch on it. */
export function normaliseScreening(raw: JsonObject, fileName: string): JsonObject {
	return {
		score: raw.score ?? null,
		composite_score: raw.composite_score ?? null,
		summary: raw.summary ?? '',
		strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
		gaps: Array.isArray(raw.gaps) ? raw.gaps : [],
		attributes: raw.attributes ?? {},
		experience_gap_months: raw.experience_gap_months ?? 0,
		candidate: raw.candidate ?? {},
		job_id: raw.job_id ?? null,
		injection_detected: raw.injection_detected ?? false,
		credits_remaining: raw.credits_remaining ?? null,
		file_name: fileName,
	};
}
