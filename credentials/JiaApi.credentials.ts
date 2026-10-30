import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class JiaApi implements ICredentialType {
	name = 'jiaApi';

	displayName = 'JustInterview API';

	icon: Icon = { light: 'file:../nodes/Jia/jia.svg', dark: 'file:../nodes/Jia/jia.dark.svg' };

	documentationUrl = 'https://github.com/techdome-io/n8n-nodes-jia#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://your-jia-backend.example.com',
			description: 'The URL of the JustInterview (JIA) backend API, without a trailing slash',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create a key in JustInterview under Settings → API Keys. A jia_test_ key runs in sandbox mode: no credits are used and no emails are sent.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/v1/me',
			method: 'GET',
		},
	};
}
