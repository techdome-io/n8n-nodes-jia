import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class JiaApi implements ICredentialType {
	name = 'jiaApi';

	displayName = 'JIA API';

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
			description: 'The URL of the JIA backend API, without a trailing slash',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Create a key in JIA under Settings → API Keys',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-JIA-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/org/api-key/me',
			method: 'GET',
		},
	};
}
