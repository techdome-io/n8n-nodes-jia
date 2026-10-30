import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	JsonObject as JsonObjectN8n,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { interviewFields, interviewOperations } from './descriptions/InterviewDescription';
import { jobDescriptionFields, jobDescriptionOperations } from './descriptions/JobDescriptionDescription';
import { resumeFields, resumeOperations } from './descriptions/ResumeDescription';
import { jiaApiRequest, jiaApiUploadRequest } from './GenericFunctions';
import type { CustomQuestionInput, JdOverrides, JsonObject } from './transform';
import {
	buildInviteBody,
	buildJdPayload,
	MIN_JD_TEXT_CHARS,
	normaliseAnalysis,
	normaliseJd,
	normaliseScreening,
	resumeFileProblem,
} from './transform';

/** Page size for Get Many and the job picker. */
const PAGE_SIZE = 50;

/*
 * Programmatic rather than declarative: Generate chains two calls (AI draft,
 * then save) with a merge step between them, and the AI draft has to be
 * normalised before JIA will accept it. Declarative routing can't express that.
 */
export class Jia implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'JustInterview',
		name: 'jia',
		icon: { light: 'file:jia.svg', dark: 'file:jia.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Analyze resumes, send AI voice interviews and generate job descriptions with JustInterview (JIA)',
		defaults: { name: 'JustInterview' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'jiaApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Interview', value: 'interview' },
					{ name: 'Job Description', value: 'jobDescription' },
					{ name: 'Resume', value: 'resume' },
				],
				default: 'resume',
			},
			...interviewOperations,
			...interviewFields,
			...jobDescriptionOperations,
			...jobDescriptionFields,
			...resumeOperations,
			...resumeFields,
		],
	};

	methods = {
		listSearch: {
			async searchJobs(
				this: ILoadOptionsFunctions,
				filter?: string,
				paginationToken?: string,
			): Promise<INodeListSearchResult> {
				const page = paginationToken ? Number(paginationToken) : 1;
				const qs: IDataObject = { page, limit: PAGE_SIZE, status: 'active' };
				if (filter) qs.search = filter;
				const response = await jiaApiRequest.call(this, 'GET', '/v1/jobs', undefined, qs);
				const jobs = (response.data as JsonObject[] | undefined) ?? [];
				return {
					results: jobs.map((job) => ({
						name: `${String(job.title ?? 'Untitled')} (#${String(job.id)})`,
						value: String(job.id),
					})),
					paginationToken: response.has_more ? String(page + 1) : undefined,
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'resume') {
					if (operation === 'analyze') {
						returnData.push(await analyzeResume.call(this, i, items[i]));
					} else if (operation === 'screen') {
						returnData.push(await screenResume.call(this, i, items[i]));
					} else {
						throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex: i });
					}
					continue;
				}
				if (resource === 'interview') {
					returnData.push({ json: await runInterview.call(this, operation, i), pairedItem: { item: i } });
					continue;
				}
				if (resource !== 'jobDescription') {
					throw new NodeOperationError(this.getNode(), `Unsupported resource "${resource}"`, { itemIndex: i });
				}

				if (operation === 'generate') {
					const jobDetails = (this.getNodeParameter('jobDetails', i) as string).trim();
					if (!jobDetails) {
						throw new NodeOperationError(this.getNode(), 'Job Details is required', { itemIndex: i });
					}
					const overrides = readOverrides(this.getNodeParameter('additionalFields', i, {}) as IDataObject);
					const draft = (await jiaApiRequest.call(this, 'POST', '/org/create-jd-ai', {
						job_data: jobDetails,
					})) as JsonObject;
					const payload = buildJdPayload(draft, overrides, 'ai_generated');

					if (this.getNodeParameter('saveToJia', i, true) as boolean) {
						// Never retried: a repeat would create a duplicate JD and spend another credit.
						const saved = await jiaApiRequest.call(this, 'POST', '/org/create-job-description', payload as IDataObject);
						returnData.push({ json: normaliseJd(saved as JsonObject, true) as IDataObject, pairedItem: { item: i } });
					} else {
						returnData.push({ json: normaliseJd(payload, false) as IDataObject, pairedItem: { item: i } });
					}
				} else if (operation === 'create') {
					const overrides: JdOverrides = {
						...readOverrides(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
						title: this.getNodeParameter('title', i) as string,
						description: this.getNodeParameter('description', i) as string,
						experience: this.getNodeParameter('experience', i) as string,
						department: this.getNodeParameter('department', i) as string,
					};
					for (const [label, value] of [
						['Title', overrides.title],
						['Description', overrides.description],
						['Experience', overrides.experience],
						['Department', overrides.department],
					] as const) {
						if (!value || !value.trim()) {
							throw new NodeOperationError(this.getNode(), `${label} is required`, { itemIndex: i });
						}
					}
					const payload = buildJdPayload({}, overrides, 'manual');
					const saved = await jiaApiRequest.call(this, 'POST', '/org/create-job-description', payload as IDataObject);
					returnData.push({ json: normaliseJd(saved as JsonObject, true) as IDataObject, pairedItem: { item: i } });
				} else if (operation === 'get') {
					const jobId = this.getNodeParameter('jobId', i, '', { extractValue: true }) as string;
					if (!/^\d+$/.test(String(jobId))) {
						throw new NodeOperationError(this.getNode(), 'Job must be a numeric JIA job ID', { itemIndex: i });
					}
					const job = await jiaApiRequest.call(this, 'GET', `/org/job-descriptions/${jobId}`);
					returnData.push({ json: normaliseJd(job as JsonObject, true) as IDataObject, pairedItem: { item: i } });
				} else if (operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const qs: IDataObject = { pageLimit: Math.min(PAGE_SIZE, limit) };
					if (filters.search) qs.searchText = filters.search;
					if (filters.status) qs.statuses = filters.status;
					if (filters.department) qs.departments = filters.department;

					let page = 1;
					let collected = 0;
					for (;;) {
						const response = await jiaApiRequest.call(this, 'GET', '/org/job-descriptions', undefined, { ...qs, pageNo: page });
						const jobs = (response.data as JsonObject[] | undefined) ?? [];
						for (const job of jobs) {
							if (collected >= limit) break;
							returnData.push({ json: normaliseJd(job, true) as IDataObject, pairedItem: { item: i } });
							collected++;
						}
						const hasNext = Boolean((response.pagination as JsonObject | undefined)?.hasNext);
						if (!hasNext || collected >= limit || jobs.length === 0) break;
						page++;
					}
				} else {
					throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex: i });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message, httpCode: (error as { httpCode?: string }).httpCode ?? null },
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors hand back an error that is already of their type, so an
				// API error from jiaApiRequest keeps its message and HTTP code here.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObjectN8n, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

/** Read the Override Fields / Additional Fields collection into JdOverrides. */
function readOverrides(fields: IDataObject): JdOverrides {
	const questions = ((fields.customQuestions as IDataObject | undefined)?.question as CustomQuestionInput[] | undefined) ?? [];
	return {
		title: fields.title as string | undefined,
		description: fields.description as string | undefined,
		department: fields.department as string | undefined,
		experience: fields.experience as string | undefined,
		skills: fields.skills as string | string[] | undefined,
		employmentType: fields.employmentType as string | undefined,
		locations: fields.locations as string | string[] | undefined,
		salaryMin: fields.salaryMin as number | undefined,
		salaryMax: fields.salaryMax as number | undefined,
		applicationDeadline: fields.applicationDeadline as string | undefined,
		shiftTimings: fields.shiftTimings as string | undefined,
		questionnaire: fields.questionnaire as string | undefined,
		customQuestions: questions,
	};
}

/**
 * Resume > Screen: send one binary resume to POST /org/screen-resume. Each item is
 * screened on its own, so a batch of resumes becomes one result per resume.
 * Never retried: a repeat would spend another screening credit.
 */
async function screenResume(
	this: IExecuteFunctions,
	itemIndex: number,
	item: INodeExecutionData,
): Promise<INodeExecutionData> {
	const binaryPropertyName = (this.getNodeParameter('binaryPropertyName', itemIndex) as string).trim();
	const binary = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
	const data = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const fileName = binary.fileName ?? 'resume';

	const problem = resumeFileProblem(data, fileName);
	if (problem) {
		throw new NodeOperationError(this.getNode(), problem, { itemIndex });
	}

	const fields: Record<string, string> = {};
	const jdSource = this.getNodeParameter('jdSource', itemIndex) as string;
	if (jdSource === 'existingJob') {
		const jobId = String(this.getNodeParameter('screenJobId', itemIndex, '', { extractValue: true }) ?? '').trim();
		if (!/^\d+$/.test(jobId)) {
			throw new NodeOperationError(this.getNode(), 'Job must be a numeric JIA job ID', { itemIndex });
		}
		fields.job_id = jobId;
	} else {
		const jdText = (this.getNodeParameter('jdText', itemIndex) as string).trim();
		if (jdText.length < MIN_JD_TEXT_CHARS) {
			throw new NodeOperationError(
				this.getNode(),
				`Job Description Text must be at least ${MIN_JD_TEXT_CHARS} characters`,
				{ itemIndex },
			);
		}
		fields.jd_text = jdText;
	}

	const result = await jiaApiUploadRequest.call(this, '/org/screen-resume', fields, {
		fieldName: 'resume',
		fileName,
		mimeType: binary.mimeType,
		data,
	});

	const includeBinary = (this.getNodeParameter('options', itemIndex, {}) as IDataObject).includeBinary === true;
	return {
		json: normaliseScreening(result as JsonObject, fileName) as IDataObject,
		...(includeBinary && item.binary ? { binary: item.binary } : {}),
		pairedItem: { item: itemIndex },
	};
}

/** The JD source shared by Screen and Analyze: a `job_id` or `jd_text` form field. */
function readJdFields(this: IExecuteFunctions, itemIndex: number): Record<string, string> {
	const jdSource = this.getNodeParameter('jdSource', itemIndex) as string;
	if (jdSource === 'existingJob') {
		const jobId = String(this.getNodeParameter('screenJobId', itemIndex, '', { extractValue: true }) ?? '').trim();
		if (!/^\d+$/.test(jobId)) {
			throw new NodeOperationError(this.getNode(), 'Job must be a numeric JIA job ID', { itemIndex });
		}
		return { job_id: jobId };
	}
	const jdText = (this.getNodeParameter('jdText', itemIndex) as string).trim();
	if (jdText.length < MIN_JD_TEXT_CHARS) {
		throw new NodeOperationError(
			this.getNode(),
			`Job Description Text must be at least ${MIN_JD_TEXT_CHARS} characters`,
			{ itemIndex },
		);
	}
	return { jd_text: jdText };
}

/**
 * Resume > Analyze: POST /v1/resumes/analyze with a binary file or a public https link.
 * Never retried: a repeat would spend another screening credit.
 */
async function analyzeResume(
	this: IExecuteFunctions,
	itemIndex: number,
	item: INodeExecutionData,
): Promise<INodeExecutionData> {
	const fields = readJdFields.call(this, itemIndex);
	const resumeSource = this.getNodeParameter('resumeSource', itemIndex) as string;
	let result: IDataObject;
	let source: string;

	if (resumeSource === 'url') {
		const resumeUrl = (this.getNodeParameter('resumeUrl', itemIndex) as string).trim();
		if (!/^https:\/\//i.test(resumeUrl)) {
			throw new NodeOperationError(this.getNode(), 'Resume URL must start with https://', { itemIndex });
		}
		result = await jiaApiUploadRequest.call(this, '/v1/resumes/analyze', { ...fields, resume_url: resumeUrl });
		source = resumeUrl;
	} else {
		const binaryPropertyName = (this.getNodeParameter('analyzeBinaryPropertyName', itemIndex) as string).trim();
		const binary = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
		const data = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
		const fileName = binary.fileName ?? 'resume';
		const problem = resumeFileProblem(data, fileName);
		if (problem) {
			throw new NodeOperationError(this.getNode(), problem, { itemIndex });
		}
		result = await jiaApiUploadRequest.call(this, '/v1/resumes/analyze', fields, {
			fieldName: 'resume',
			fileName,
			mimeType: binary.mimeType,
			data,
		});
		source = fileName;
	}

	const includeBinary = (this.getNodeParameter('options', itemIndex, {}) as IDataObject).includeBinary === true;
	return {
		json: normaliseAnalysis(result as JsonObject, source) as IDataObject,
		...(includeBinary && item.binary ? { binary: item.binary } : {}),
		pairedItem: { item: itemIndex },
	};
}

/** Interview > Send Invite / Get Status. Send Invite is never retried: a repeat would spend a credit. */
async function runInterview(this: IExecuteFunctions, operation: string, itemIndex: number): Promise<IDataObject> {
	if (operation === 'sendInvite') {
		const extra = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
		const { error, body } = buildInviteBody({
			candidateName: this.getNodeParameter('candidateName', itemIndex) as string,
			candidateEmail: this.getNodeParameter('candidateEmail', itemIndex) as string,
			jobId: String(this.getNodeParameter('inviteJobId', itemIndex, '', { extractValue: true }) ?? ''),
			deadline: extra.deadline as string | undefined,
			resumeUrl: extra.resumeUrl as string | undefined,
		});
		if (error) throw new NodeOperationError(this.getNode(), error, { itemIndex });
		return await jiaApiRequest.call(this, 'POST', '/v1/interviews/invite', body as IDataObject);
	}
	if (operation === 'getStatus') {
		const interviewId = String(this.getNodeParameter('interviewId', itemIndex) ?? '').trim();
		if (!/^(\d+|test_[0-9a-f]+)$/.test(interviewId)) {
			throw new NodeOperationError(this.getNode(), 'Interview ID must be the interview_id JIA returned', { itemIndex });
		}
		return await jiaApiRequest.call(this, 'GET', `/v1/interviews/${encodeURIComponent(interviewId)}`);
	}
	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex });
}
