import type { INodeProperties } from 'n8n-workflow';

import { jobResourceLocator } from './JobDescriptionDescription';

const show = (operation: string[]) => ({ show: { resource: ['interview'], operation } });

export const interviewOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['interview'] } },
		options: [
			{
				name: 'Send Invite',
				value: 'sendInvite',
				description: 'Email a candidate an AI voice interview for a job (uses 1 AI interview credit)',
				action: 'Send an interview invite',
			},
			{
				name: 'Get Status',
				value: 'getStatus',
				description: "Get an interview's status, score and report link",
				action: 'Get interview status',
			},
		],
		default: 'sendInvite',
	},
];

export const interviewFields: INodeProperties[] = [
	{
		displayName: 'Candidate Name',
		name: 'candidateName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['sendInvite']),
		placeholder: 'e.g. Jane Doe',
	},
	{
		displayName: 'Candidate Email',
		name: 'candidateEmail',
		type: 'string',
		placeholder: 'name@email.com',
		required: true,
		default: '',
		displayOptions: show(['sendInvite']),
		description: 'The invite is sent to this address',
	},
	{
		...jobResourceLocator(['sendInvite'], 'interview'),
		// Own name, for the same reason as Resume > Analyze's screenJobId.
		name: 'inviteJobId',
		description: 'The JIA job the interview is for',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['sendInvite']),
		options: [
			{
				displayName: 'Deadline',
				name: 'deadline',
				type: 'dateTime',
				default: '',
				description: 'When the interview link expires: 24 hours to 7 days from now. Empty uses your organization default.',
			},
			{
				displayName: 'Resume URL',
				name: 'resumeUrl',
				type: 'string',
				default: '',
				placeholder: 'https://files.example.com/jane-doe.pdf',
				description: "A public https:// link to the candidate's resume, kept with the interview",
			},
		],
	},
	{
		displayName: 'Interview ID',
		name: 'interviewId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['getStatus']),
		placeholder: 'e.g. 5512',
		description: 'The interview_id returned by Send Invite or the Interview Completed trigger',
	},
];
