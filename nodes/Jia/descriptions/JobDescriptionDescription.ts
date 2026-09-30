import type { INodeProperties } from 'n8n-workflow';

import { EMPLOYMENT_TYPES } from '../transform';

const show = (operation: string[]) => ({ show: { resource: ['jobDescription'], operation } });

const employmentTypeOptions = EMPLOYMENT_TYPES.map((value) => ({
	name: value
		.split('_')
		.map((w) => w.charAt(0) + w.slice(1).toLowerCase())
		.join(' '),
	value,
}));

/** Fields shared by Generate (as overrides of the AI draft) and Create. */
const jobFields = (operations: string[], includeCoreFields: boolean): INodeProperties => ({
	displayName: includeCoreFields ? 'Override Fields' : 'Additional Fields',
	name: 'additionalFields',
	type: 'collection',
	placeholder: includeCoreFields ? 'Add Override' : 'Add Field',
	default: {},
	displayOptions: show(operations),
	description: includeCoreFields
		? 'Values set here replace what the AI generates'
		: undefined,
	options: [
		...(includeCoreFields
			? ([
					{
						displayName: 'Department',
						name: 'department',
						type: 'string',
						default: '',
						description: 'Defaults to "General" when neither you nor the AI provide one',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						typeOptions: { rows: 6 },
						default: '',
					},
					{
						displayName: 'Experience',
						name: 'experience',
						type: 'string',
						default: '',
						placeholder: 'e.g. 3-5 years',
					},
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						default: '',
					},
				] as INodeProperties[])
			: []),
		{
			displayName: 'Application Deadline',
			name: 'applicationDeadline',
			type: 'dateTime',
			default: '',
			description: 'Must be a future date',
		},
		{
			displayName: 'Custom Interview Questions',
			name: 'customQuestions',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true, maxAllowedFields: 5 },
			default: {},
			description: 'Up to 5 questions, at most 3 of them required',
			options: [
				{
					displayName: 'Question',
					name: 'question',
					values: [
						{ displayName: 'Text', name: 'text', type: 'string', default: '' },
						{ displayName: 'Required', name: 'required', type: 'boolean', default: false },
					],
				},
			],
		},
		{
			displayName: 'Employment Type',
			name: 'employmentType',
			type: 'options',
			options: employmentTypeOptions,
			default: 'FULL_TIME',
		},
		{
			displayName: 'Locations',
			name: 'locations',
			type: 'string',
			default: '',
			placeholder: 'e.g. Bengaluru, Remote',
			description: 'Comma-separated list, or an expression that returns an array',
		},
		{
			displayName: 'Questionnaire',
			name: 'questionnaire',
			type: 'string',
			typeOptions: { rows: 4 },
			default: '',
		},
		{
			displayName: 'Salary Max',
			name: 'salaryMax',
			type: 'number',
			default: 0,
			description: 'Annual salary in INR',
		},
		{
			displayName: 'Salary Min',
			name: 'salaryMin',
			type: 'number',
			default: 0,
			description: 'Annual salary in INR',
		},
		{
			displayName: 'Shift Timings',
			name: 'shiftTimings',
			type: 'string',
			default: '',
			placeholder: 'e.g. 10 AM - 7 PM IST',
		},
		{
			displayName: 'Skills',
			name: 'skills',
			type: 'string',
			default: '',
			placeholder: 'e.g. Python, FastAPI, PostgreSQL',
			description: 'Comma-separated list, or an expression that returns an array',
		},
	],
});

export const jobDescriptionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['jobDescription'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a job description from fields you provide',
				action: 'Create a job description',
			},
			{
				name: 'Generate',
				value: 'generate',
				description: 'Generate a job description with JIA AI, and optionally save it',
				action: 'Generate a job description',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a job description',
				action: 'Get a job description',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many job descriptions',
				action: 'Get many job descriptions',
			},
		],
		default: 'generate',
	},
];

export const jobResourceLocator = (operations: string[], resource: string): INodeProperties => ({
	displayName: 'Job',
	name: 'jobId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	displayOptions: { show: { resource: [resource], operation: operations } },
	description: 'The JIA job description',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchJobs', searchable: true },
		},
		{
			displayName: 'ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 812',
			validation: [
				{
					type: 'regex',
					properties: { regex: '^[0-9]+$', errorMessage: 'The job ID must be a number' },
				},
			],
		},
	],
});

export const jobDescriptionFields: INodeProperties[] = [
	// ---------------------------------------------------------------- generate
	{
		displayName: 'Job Details',
		name: 'jobDetails',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		displayOptions: show(['generate']),
		placeholder: 'e.g. Senior backend engineer, Python and FastAPI, 5+ years, Bengaluru',
		description: 'Describe the role in plain language. JIA AI writes the job description from this.',
	},
	{
		displayName: 'Save to JIA',
		name: 'saveToJia',
		type: 'boolean',
		default: true,
		displayOptions: show(['generate']),
		description:
			'Whether to save the generated job description in JIA. Saving uses 1 JD credit and publishes the job immediately. When off, only the draft is returned.',
	},
	jobFields(['generate'], true),

	// ------------------------------------------------------------------ create
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: { rows: 6 },
		required: true,
		default: '',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Experience',
		name: 'experience',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 3-5 years',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Department',
		name: 'department',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['create']),
	},
	jobFields(['create'], false),

	// --------------------------------------------------------------------- get
	jobResourceLocator(['get'], 'jobDescription'),

	// ------------------------------------------------------------------ getAll
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: show(['getAll']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['jobDescription'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				displayName: 'Department',
				name: 'department',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Text to search for in job descriptions',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Active', value: 'active' },
					{ name: 'Expired', value: 'expired' },
					{ name: 'Inactive', value: 'inactive' },
				],
				default: 'active',
			},
		],
	},
];
