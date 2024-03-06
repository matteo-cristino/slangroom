import { Client, User, Request, Response, InvalidScopeError, AuthorizationCode } from "@node-oauth/oauth2-server";
import { InvalidArgumentError, InvalidClientError, InvalidRequestError, UnsupportedResponseTypeError, OAuthError, ServerError, UnauthorizedClientError, AccessDeniedError } from '@node-oauth/oauth2-server';
import url from 'node:url';
import { InMemoryCache, AuthenticateHandler, pkce, isFormat } from '@slangroom/oauth';
import { createHash, randomBytes } from "crypto";


/**
 * Response types.
 */
const respType = class CodeResponseType {
	code: string;

	constructor(code: string) {
		if (!code) {
			throw new InvalidArgumentError('Missing parameter: `code`');
		}

		this.code = code;
	}

	buildRedirectUri(redirectUri: string) {
		if (!redirectUri) {
			throw new InvalidArgumentError('Missing parameter: `redirectUri`');
		}

		const uri = url.parse(redirectUri, true);

		uri.query["code"] = this.code;
		uri.search = null;

		return uri;
	}
}

const responseTypes: { [key: string]: any } = {
	code: respType,
};


export class AuthorizeHandler {

	allowEmptyState: boolean;
	authenticateHandler: any;
	authorizationCodeLifetime: number;
	model: InMemoryCache;

	constructor(options: any) {
		options = options || {};

		if (options.authenticateHandler && !options.authenticateHandler.handle) {
			throw new InvalidArgumentError(
				'Invalid argument: authenticateHandler does not implement `handle()`',
			);
		}

		if (!options.authorizationCodeLifetime) {
			throw new InvalidArgumentError('Missing parameter: `authorizationCodeLifetime`');
		}

		if (!options.model) {
			throw new InvalidArgumentError('Missing parameter: `model`');
		}

		if (!options.model.getClient) {
			throw new InvalidArgumentError(
				'Invalid argument: model does not implement `getClient()`',
			);
		}

		if (!options.model.saveAuthorizationCode) {
			throw new InvalidArgumentError(
				'Invalid argument: model does not implement `saveAuthorizationCode()`',
			);
		}

		this.allowEmptyState = options.allowEmptyState;
		this.authenticateHandler = options.authenticateHandler;
		this.authorizationCodeLifetime = options.authorizationCodeLifetime;
		this.model = options.model;
	}

	/**
	 * Authorize Handler.
	 */
	// handle /authorize request containing request_uri and client_id
	async handle(request: Request, response: Response) {
		if (!(request instanceof Request)) {
			throw new InvalidArgumentError(
				'Invalid argument: `request` must be an instance of Request',
			);
		}

		if (!(response instanceof Response)) {
			throw new InvalidArgumentError(
				'Invalid argument: `response` must be an instance of Response',
			);
		}

		if(!request.body.request_uri) throw new InvalidRequestError("Missing parameter: request_uri");

		const client = await this.getClient(request);
		const user = await this.getUser(request, response);
		// NOTE: this call the Authentication handler and do authenticate
		//		in the previous version the clientSecret used to authenticate was in request.body
		//		here it should be obtained from the request_uri
		if(!user) throw Error("Authentication failed");

		let uri;
		let state;

		try {

			// the following should be changed so that the data are retrieved starting from the
			// request_uri and client_id in the Request object
			//--------------------------------------------
			uri = this.getRedirectUri(request, client);
			state = this.getState(request);
			const code = this.getAuthorizationCode();
			// -------------------------------------------

			const ResponseType = this.getResponseType(request);

			const responseTypeInstance = new ResponseType(code.authorizationCode);
			const redirectUri = this.buildSuccessRedirectUri(uri, responseTypeInstance);

			this.updateResponse(response, redirectUri, state);

			return code;
		} catch (err) {
			let e = err;

			if (!(e instanceof OAuthError)) {
				e = new ServerError(e);
			}
			const redirectUri = this.buildErrorRedirectUri(uri, e);
			this.updateResponse(response, redirectUri, state);

			throw e;
		}
	}

	getAuthorizationCode(): any {
		//TODO
		return false;
	}

	/**
	 * Pushed Authorization Request Handler.
	 */
	// handle /as/par request with input all the client data
	async handle_par(request: Request, response: Response) {
		if (!(request instanceof Request)) {
			throw new InvalidArgumentError(
				'Invalid argument: `request` must be an instance of Request',
			);
		}

		if (!(response instanceof Response)) {
			throw new InvalidArgumentError(
				'Invalid argument: `response` must be an instance of Response',
			);
		}

		if(request.body.request_uri) throw new InvalidRequestError("Found request_uri parameter in the request");

		const expiresAt = this.getAuthorizationCodeLifetime();
		const client = await this.getClient(request);
		const user = await this.getUser(request, response);

		if (!user) throw new UnauthorizedClientError("Client authentication failed");

		let uri;
		let state;

		try {
			uri = this.getRedirectUri(request, client);
			state = this.getState(request);
			if (request.query) {
				if (request.query["allowed"] === 'false' || request.body.allowed === 'false') {
					throw new AccessDeniedError('Access denied: user denied access to application');
				}
			}

			const resource = request.body.resource;
			const requestedScope = this.getScope(request);
			var validScope = await this.validateScope(user, client, requestedScope!, resource);
			const authorizationCode = await this.generateAuthorizationCode(client);

			const ResponseType = this.getResponseType(request);
			const codeChallenge = this.getCodeChallenge(request);
			const codeChallengeMethod = this.getCodeChallengeMethod(request);

			const code = await this.saveAuthorizationCode(
				authorizationCode,
				expiresAt,
				uri,
				validScope,
				client,
				user,
				codeChallenge,
				codeChallengeMethod,
			);
			if(!code) { throw Error("Failed to create the Authorization Code"); }

			const base_uri = "urn:ietf:params:oauth:request_uri:";
			const rand_uri = randomBytes(20).toString('hex');
			const expires_in = 300;

			const responseTypeInstance = new ResponseType(code.authorizationCode);
			const redirectUri = this.buildSuccessRedirectUri(uri, responseTypeInstance);
			this.updateResponse(response, redirectUri, state);

			return { base_uri:base_uri, rand_uri: rand_uri, expires_in: expires_in, authorizationCode: code };

		} catch (err) {
			let e = err;

			if (!(e instanceof OAuthError)) {
				e = new ServerError(e);
			}
			const redirectUri = this.buildErrorRedirectUri(uri, e);
			this.updateResponse(response, redirectUri, state);

			throw e;
		}
	}

	/**
	 * Generate authorization code.
	 */

	async generateAuthorizationCode(client: Client) {
		if (this.model.generateAuthorizationCode) {
			return this.model.generateAuthorizationCode(client);
		}
		else {
			const buffer = randomBytes(256);
			return createHash('SHA256').update(buffer).digest().toString('hex');
		}
	}

	/**
	 * Get authorization code lifetime.
	 */

	getAuthorizationCodeLifetime() {
		const expires = new Date();

		expires.setSeconds(expires.getSeconds() + this.authorizationCodeLifetime);
		return expires;
	}

	/**
	 * Get the client from the model.
	 */

	async getClient(request: Request) {
		const clientId = request.body.client_id || request.query!["client_id"];

		if (!clientId) {
			throw new InvalidRequestError('Missing parameter: `client_id`');
		}

		if (!isFormat.vschar(clientId)) {
			throw new InvalidRequestError('Invalid parameter: `client_id`');
		}

		const redirectUri = request.body.redirect_uri || request.query!["redirect_uri"];

		if (redirectUri && !isFormat.uri(redirectUri)) {
			throw new InvalidRequestError('Invalid request: `redirect_uri` is not a valid URI');
		}
		const clientSecret = request.body.client_secret;
		const client = await this.model.getClient(clientId, clientSecret);

		if (!client) {
			throw new InvalidClientError('Invalid client: client credentials are invalid');
		}

		if (!client.grants) {
			throw new InvalidClientError('Invalid client: missing client `grants`');
		}

		if (!Array.isArray(client.grants) || !client.grants.includes('authorization_code')) {
			throw new UnauthorizedClientError('Unauthorized client: `grant_type` is invalid');
		}

		if (!client.redirectUris || 0 === client.redirectUris.length) {
			throw new InvalidClientError('Invalid client: missing client `redirectUri`');
		}

		if (redirectUri) {
			const valid = await this.validateRedirectUri(redirectUri, client);

			if (!valid) {
				throw new InvalidClientError(
					'Invalid client: `redirect_uri` does not match client value',
				);
			}
		}

		return client;
	}

	/**
	 * Validate requested scope.
	 */
	async validateScope (user:User, client:Client, scope:string[], resource:string) {
		if (this.model.validateScope) {
			const validatedScope = await this.model.validateScope(user, client, scope, resource);

			if (!validatedScope) {
				throw new InvalidScopeError('Invalid scope: Requested scope is invalid');
			}

			return validatedScope;
		}

		return scope;
	}

	/**
	 * Get scope from the request.
	 */

	getScope(request: Request) {
		const scope = request.body.scope || request.query!["scope"];

		return this.parseScope(scope);
	}

	/**
	 * Get state from the request.
	 */

	getState(request: Request) {
		const state = request.body.state || request.query!["state"];
		const stateExists = state && state.length > 0;
		const stateIsValid = stateExists ? isFormat.vschar(state) : this.allowEmptyState;

		if (!stateIsValid) {
			const message = !stateExists ? 'Missing' : 'Invalid';
			throw new InvalidRequestError(`${message} parameter: \`state\``);
		}

		return state;
	}

	/**
	 * Get user by calling the authenticate middleware.
	 */

	async getUser(request: Request, response: Response) {
		if (this.authenticateHandler instanceof AuthenticateHandler) {
			const handled = await this.authenticateHandler.handle(request, response);
			return handled ? handled : undefined;
		}

		const user = await this.authenticateHandler.handle(request, response);

		if (!user) {
			throw new ServerError('Server error: `handle()` did not return a `user` object');
		}

		return user;
	}

	/**
	 * Get redirect URI.
	 */

	getRedirectUri(request: Request, client: Client) {
		return request.body.redirect_uri || request.query!["redirect_uri"] || client.redirectUris![0];
	}

	/**
	 * Save authorization code.
	 */

	async saveAuthorizationCode(authorizationCode: string, expiresAt: Date, redirectUri: string, scope: string[], client: Client, user: User, codeChallenge: string, codeChallengeMethod: string,) {
		let code: AuthorizationCode = {
			authorizationCode: authorizationCode,
			expiresAt: expiresAt,
			redirectUri: redirectUri,
			scope: scope,
			user: user,
			client: client
		};

		if (codeChallenge && codeChallengeMethod) {
			code = Object.assign(
				{
					codeChallenge: codeChallenge,
					codeChallengeMethod: codeChallengeMethod,
				},
				code,
			);
		}

		return this.model.saveAuthorizationCode(code, client, user);
	}

	async validateRedirectUri(redirectUri: string, client: Client) {
		if (this.model.validateRedirectUri) {
			return this.model.validateRedirectUri(redirectUri, client);
		}

		return client.redirectUris!.includes(redirectUri);
	}
	/**
	 * Get response type.
	 */

	getResponseType(request: Request) {
		const responseType = request.body.response_type || request.query!["response_type"];

		if (!responseType) {
			throw new InvalidRequestError('Missing parameter: `response_type`');
		}

		if (!Object.prototype.hasOwnProperty.call(responseTypes, responseType)) {
			throw new UnsupportedResponseTypeError(
				'Unsupported response type: `response_type` is not supported',
			);
		}

		return responseTypes[responseType];
	}

	/**
	 * Build a successful response that redirects the user-agent to the client-provided url.
	 */

	buildSuccessRedirectUri(redirectUri: string, responseType: any) {
		return responseType.buildRedirectUri(redirectUri);
	}

	/**
	 * Build an error response that redirects the user-agent to the client-provided url.
	 */

	buildErrorRedirectUri(redirectUri: string, error: Error) {
		//TODO
		const uri = url.parse(redirectUri);
		console.log(error);
		// uri.query = {
		// 	error: error.name,
		// };

		// if (error.message) {
		// 	uri.query.error_description = error.message;
		// }

		return uri;
	}

	/**
	 * Update response with the redirect uri and the state parameter, if available.
	 */

	updateResponse(response: Response, redirectUri: any, state: any) {
		redirectUri.query = redirectUri.query || {};

		if (state) {
			redirectUri.query.state = state;
		}

		response.redirect(url.format(redirectUri));
	}

	getCodeChallenge(request: Request) {
		return request.body.code_challenge || request.query!["code_challenge"];
	}

	/**
	 * Get code challenge method from request or defaults to plain.
	 * https://www.rfc-editor.org/rfc/rfc7636#section-4.3
	 *
	 * @throws {InvalidRequestError} if request contains unsupported code_challenge_method
	 *  (see https://www.rfc-editor.org/rfc/rfc7636#section-4.4)
	 */
	getCodeChallengeMethod(request: Request) {
		const algorithm = request.body.code_challenge_method || request.query!["code_challenge_method"];

		if (algorithm && !pkce.isValidMethod(algorithm)) {
			throw new InvalidRequestError(
				`Invalid request: transform algorithm '${algorithm}' not supported`,
			);
		}

		return algorithm || 'plain';
	}

	parseScope(requestedScope: string) {
		const whiteSpace = /\s+/g;
		if (requestedScope == null) {
			return undefined;
		}

		if (typeof requestedScope !== 'string') {
			throw new InvalidScopeError('Invalid parameter: `scope`');
		}

		// XXX: this prevents spaced-only strings to become
		// treated as valid nqchar by making them empty strings
		requestedScope = requestedScope.trim();

		if (!isFormat.nqschar(requestedScope)) {
			throw new InvalidScopeError('Invalid parameter: `scope`');
		}

		return requestedScope.split(whiteSpace);
	}

}
