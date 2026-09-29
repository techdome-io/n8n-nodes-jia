import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { errorHint } from './transform';

/** JIA runs LLM calls inside the request; its own server limit is 180 s. */
export const REQUEST_TIMEOUT_MS = 120_000;

const readDetail = (body: unknown, statusCode: number): string => {
	const detail = (body as JsonObject | undefined)?.detail;
	if (typeof detail === 'string' && detail) return detail;
	if (detail !== undefined && detail !== null) return JSON.stringify(detail);
	if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 300);
	return `JIA returned HTTP ${statusCode}`;
};

/**
 * Call the JIA API with the JIA API credential. JIA always reports errors as
 * `{"detail": "..."}`; that text becomes the n8n error message, with a hint
 * for the common cases.
 *
 * HTTP errors are returned rather than thrown (`ignoreHttpStatusErrors`),
 * because n8n's own wrapping of a thrown HTTP error keeps only a generic
 * message and drops the response body that carries JIA's `detail`.
 */
export async function jiaApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('jiaApi');
	const baseURL = String(credentials.baseUrl ?? '').replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		baseURL,
		url: path,
		json: true,
		timeout: REQUEST_TIMEOUT_MS,
		ignoreHttpStatusErrors: true,
		returnFullResponse: true,
		// FastAPI reads a repeated query parameter as a list: statuses=a&statuses=b.
		arrayFormat: 'repeat',
	};
	if (body !== undefined) options.body = body;
	if (qs !== undefined) options.qs = qs;

	let response: { statusCode: number; body: unknown };
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(this, 'jiaApi', options)) as {
			statusCode: number;
			body: unknown;
		};
	} catch (error) {
		// Network failure, timeout, or an unusable credential: no JIA response to read.
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			message: `Could not reach JIA at ${baseURL || '(no Base URL set)'}`,
			description: (error as Error).message,
		});
	}

	if (response.statusCode >= 400) {
		const detail = readDetail(response.body, response.statusCode);
		throw new NodeApiError(
			this.getNode(),
			{ message: detail, httpCode: String(response.statusCode) } as JsonObject,
			{
				message: detail,
				description: errorHint(response.statusCode, detail),
				httpCode: String(response.statusCode),
			},
		);
	}
	return (response.body ?? {}) as IDataObject;
}
