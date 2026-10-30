import { createHmac } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { jiaApiRequest } from '../Jia/GenericFunctions';
import { signatureProblem } from '../Jia/transform';

/**
 * Starts a workflow when JustInterview sends an event. Activating the workflow registers
 * this node's webhook URL with POST /v1/webhooks; deactivating it removes it. Every
 * delivery is checked against the HMAC secret JIA returned at registration.
 */
export class JiaTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'JustInterview Trigger',
		name: 'jiaTrigger',
		icon: { light: 'file:../Jia/jia.svg', dark: 'file:../Jia/jia.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when an interview is completed or a resume is analyzed in JustInterview',
		defaults: { name: 'JustInterview Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'jiaApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['interview.completed'],
				options: [
					{
						name: 'Interview Completed',
						value: 'interview.completed',
						description: 'An AI interview finished and its evaluation report is ready',
					},
					{
						name: 'Resume Analyzed',
						value: 'resume.analyzed',
						description: 'A resume was analyzed through the API',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (staticData.webhookId === undefined) return false;
				const response = await jiaApiRequest.call(this, 'GET', '/v1/webhooks');
				const hooks = (response.data as IDataObject[] | undefined) ?? [];
				const url = this.getNodeWebhookUrl('default');
				const events = [...(this.getNodeParameter('events') as string[])].sort().join(' ');
				const match = hooks.find(
					(h) => h.id === staticData.webhookId && h.url === url && (h.events as string[]).join(' ') === events,
				);
				if (match) return true;
				delete staticData.webhookId;
				delete staticData.secret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const response = await jiaApiRequest.call(this, 'POST', '/v1/webhooks', {
					url: this.getNodeWebhookUrl('default'),
					events: this.getNodeParameter('events') as string[],
				});
				if (response.id === undefined || !response.secret) return false;
				const staticData = this.getWorkflowStaticData('node');
				staticData.webhookId = response.id;
				staticData.secret = response.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (staticData.webhookId !== undefined) {
					try {
						await jiaApiRequest.call(this, 'DELETE', `/v1/webhooks/${String(staticData.webhookId)}`);
					} catch (error) {
						// Usually already gone (key revoked or removed in JIA): nothing left to clean up.
						this.logger.warn(`JustInterview webhook ${String(staticData.webhookId)} could not be removed: ${(error as Error).message}`);
					}
					delete staticData.webhookId;
					delete staticData.secret;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject() as unknown as { rawBody?: Buffer; body: unknown };
		const secret = this.getWorkflowStaticData('node').secret as string | undefined;
		const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
		const header = this.getHeaderData()['x-jia-signature'] as string | undefined;

		const problem = secret
			? signatureProblem(
					header,
					rawBody,
					(payload) => createHmac('sha256', secret).update(payload).digest('hex'),
					Math.floor(Date.now() / 1000),
				)
			: 'webhook is not registered';
		if (problem) {
			const res = this.getResponseObject();
			res.status(401).json({ detail: problem });
			return { noWebhookResponse: true };
		}

		const body = this.getBodyData() as IDataObject;
		const data = (body.data as IDataObject | undefined) ?? {};
		return {
			workflowData: [
				this.helpers.returnJsonArray([
					{ event: body.event, event_id: body.id, test: body.test ?? false, created_at: body.created_at, ...data },
				]),
			],
		};
	}
}
