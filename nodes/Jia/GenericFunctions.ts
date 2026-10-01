import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { buildMultipartBody, errorHint } from './transform';
import type { MultipartFile } from './transform';

/** JIA runs LLM calls inside the request; its own server limit is 180 s. */
export const REQUEST_TIMEOUT_MS = 120_000;

const readDetail = (body: unknown, statusCode: number): string => {
	let parsed = body;
	if (typeof body === 'string') {
		try {
			parsed = JSON.parse(body);
		} catch {
			// Not JSON: fall through and report the text itself.
		}
	}
	const detail = (parsed as JsonObject | undefined)?.detail;
	if (typeof detail === 'string' && detail) return detail;
	if (detail !== undefined && detail !== null) return JSON.stringify(detail);
	if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 300);
	return `JIA returned HTTP ${statusCode}`;
};

/**
 * Send a request with the JIA API credential and return the parsed body.
 *
 * HTTP errors are returned rather than thrown (`ignoreHttpStatusErrors`),
 * because n8n's own wrapping of a thrown HTTP error keeps only a generic
 * message and drops the response body that carries JIA's `detail`. JIA always
 * reports errors as `{"detail": "..."}`; that text becomes the n8n error
 * message, with a hint for the common cases.
 */
async function send(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	options: IHttpRequestOptions,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('jiaApi');
	const baseURL = String(credentials.baseUrl ?? '').replace(/\/+$/, '');

	let response: { statusCode: number; body: unknown };
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(this, 'jiaApi', {
			...options,
			baseURL,
			timeout: REQUEST_TIMEOUT_MS,
			ignoreHttpStatusErrors: true,
			returnFullResponse: true,
		})) as { statusCode: number; body: unknown };
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

	let body = response.body;
	if (typeof body === 'string') {
		try {
			body = JSON.parse(body);
		} catch {
			// Leave non-JSON text as-is.
		}
	}
	return (body ?? {}) as IDataObject;
}

/** JSON request to JIA. */
export async function jiaApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: path,
		json: true,
		// FastAPI reads a repeated query parameter as a list: statuses=a&statuses=b.
		arrayFormat: 'repeat',
	};
	if (body !== undefined) options.body = body;
	if (qs !== undefined) options.qs = qs;
	return await send.call(this, options);
}

/**
 * multipart/form-data upload to JIA. The body is built by hand, because
 * verified community nodes can't depend on a form-data library and n8n's
 * request helper doesn't take a native FormData body on every version.
 */
export async function jiaApiUploadRequest(
	this: IExecuteFunctions,
	path: string,
	fields: Record<string, string>,
	file: MultipartFile,
): Promise<IDataObject> {
	const { body, contentType } = buildMultipartBody(fields, file);
	return await send.call(this, {
		method: 'POST',
		url: path,
		body,
		headers: { 'Content-Type': contentType },
		json: false,
	});
}
