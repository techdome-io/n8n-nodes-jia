import type { INodeProperties } from 'n8n-workflow';

import { jobResourceLocator } from './JobDescriptionDescription';

const show = (operation: string[], extra: Record<string, string[]> = {}) => ({
	show: { resource: ['resume'], operation, ...extra },
});

export const resumeOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['resume'] } },
		options: [
			{
				name: 'Analyze',
				value: 'analyze',
				description: 'Score a resume (file or link) against a job: score, skills and a shortlist / review / reject recommendation',
				action: 'Analyze a resume',
			},
			{
				name: 'Screen',
				value: 'screen',
				description: 'Score a resume file against a job description (original endpoint; use Analyze for new workflows)',
				action: 'Screen a resume',
			},
		],
		default: 'analyze',
	},
];

export const resumeFields: INodeProperties[] = [
	{
		displayName: 'Resume Source',
		name: 'resumeSource',
		type: 'options',
		noDataExpression: true,
		default: 'binary',
		displayOptions: show(['analyze']),
		options: [
			{ name: 'File', value: 'binary', description: 'A PDF or DOCX in an input binary field' },
			{ name: 'Link', value: 'url', description: 'A public https:// link to the resume' },
		],
	},
	{
		displayName: 'Input Binary Field',
		name: 'analyzeBinaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: show(['analyze'], { resumeSource: ['binary'] }),
		placeholder: 'e.g. data or attachment_0',
		hint: 'The name of the input binary field that holds the resume (PDF or DOCX, up to 10 MB)',
	},
	{
		displayName: 'Resume URL',
		name: 'resumeUrl',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['analyze'], { resumeSource: ['url'] }),
		placeholder: 'https://files.example.com/jane-doe.pdf',
		description: 'A public https:// link to a PDF or DOCX resume',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: { show: { resource: ['resume'], operation: ['screen'] } },
		placeholder: 'e.g. data or attachment_0',
		hint: 'The name of the input binary field that holds the resume (PDF or DOCX, up to 10 MB)',
	},
	{
		displayName: 'Job Description Source',
		name: 'jdSource',
		type: 'options',
		noDataExpression: true,
		default: 'existingJob',
		displayOptions: show(['screen', 'analyze']),
		options: [
			{
				name: 'Existing Job',
				value: 'existingJob',
				description: 'Screen against a job in your JIA organization',
			},
			{
				name: 'Job Description Text',
				value: 'jdText',
				description: 'Screen against job description text you provide',
			},
		],
	},
	{
		...jobResourceLocator(['screen', 'analyze'], 'resume'),
		// Its own name: n8n resolves a parameter's value against the first property
		// with that name, so sharing 'jobId' with Job Description > Get would hand
		// Screen that property's (hidden) value.
		name: 'screenJobId',
		displayOptions: show(['screen', 'analyze'], { jdSource: ['existingJob'] }),
		description: 'The JIA job to screen against',
	},
	{
		displayName: 'Job Description Text',
		name: 'jdText',
		type: 'string',
		typeOptions: { rows: 6 },
		required: true,
		default: '',
		displayOptions: show(['screen', 'analyze'], { jdSource: ['jdText'] }),
		description: 'The job description to screen against (at least 50 characters)',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['screen', 'analyze']),
		options: [
			{
				displayName: 'Include Input Binary',
				name: 'includeBinary',
				type: 'boolean',
				default: false,
				description: 'Whether to pass the resume file through to the output, for later steps such as emailing it',
			},
		],
	},
];
