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
				name: 'Screen',
				value: 'screen',
				description: 'Score a resume against a job description with JIA AI',
				action: 'Screen a resume',
			},
		],
		default: 'screen',
	},
];

export const resumeFields: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: show(['screen']),
		placeholder: 'e.g. data or attachment_0',
		hint: 'The name of the input binary field that holds the resume (PDF or DOCX, up to 10 MB)',
	},
	{
		displayName: 'Job Description Source',
		name: 'jdSource',
		type: 'options',
		noDataExpression: true,
		default: 'existingJob',
		displayOptions: show(['screen']),
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
		...jobResourceLocator(['screen'], 'resume'),
		// Its own name: n8n resolves a parameter's value against the first property
		// with that name, so sharing 'jobId' with Job Description > Get would hand
		// Screen that property's (hidden) value.
		name: 'screenJobId',
		displayOptions: show(['screen'], { jdSource: ['existingJob'] }),
		description: 'The JIA job to screen against',
	},
	{
		displayName: 'Job Description Text',
		name: 'jdText',
		type: 'string',
		typeOptions: { rows: 6 },
		required: true,
		default: '',
		displayOptions: show(['screen'], { jdSource: ['jdText'] }),
		description: 'The job description to screen against (at least 50 characters)',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['screen']),
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
