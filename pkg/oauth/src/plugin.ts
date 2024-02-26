import { Plugin } from '@slangroom/core';
import OAuth2Server from '@node-oauth/oauth2-server';
import { Request, Response } from '@node-oauth/oauth2-server';
import { AuthenticateHandler, InMemoryCache } from '@slangroom/oauth';
import { JsonableObject } from '@slangroom/shared';
import { JWK } from 'jose';

const p = new Plugin();

/* Parse QueryString using String Splitting */
function parseQueryStringToDictionary(queryString: string) {
	var dictionary: { [key: string]: string } = {};

	// remove the '?' from the beginning of the
	// if it exists
	if (queryString.indexOf('?') === 0) {
		queryString = queryString.substr(1);
	}

	// Step 1: separate out each key/value pair
	var parts = queryString.split('&');

	for (var i = 0; i < parts.length; i++) {
		var p = parts[i];
		// Step 2: Split Key/Value pair
		var keyValuePair = p!.split('=');

		// Step 3: Add Key/Value pair to Dictionary object
		var key = keyValuePair[0];
		var value = keyValuePair[1];

		// decode URI encoded string
		value = decodeURIComponent(value!);
		value = value.replace(/\+/g, ' ');
		if (key != undefined) {
			dictionary[key] = value;
		}
	}

	// Step 4: Return Dictionary Object
	return dictionary;
}

let inMemoryCache: InMemoryCache | null = null;
const getInMemoryCache = (serverData: { jwk: JWK, url: string }, options?: JsonableObject): InMemoryCache => {
	if (!inMemoryCache) {
		inMemoryCache = new InMemoryCache( serverData, options);
	}
	return inMemoryCache;
};

let authenticateHandler: any;
const getAuthenticateHandler = (model: InMemoryCache, authenticationUrl:string): any => {
	if (!authenticateHandler) {
		authenticateHandler = new AuthenticateHandler({ model: model },  authenticationUrl);
	}
	return authenticateHandler;
};

/**
 * @internal
 */

//Add sentence that allows to generate and output a valid access token from an auth server backend
export const createToken = p.new(
	['request', 'code', 'server_data'],
	'generate access token',
	async (ctx) => {
		const params = ctx.fetch('request') as JsonableObject;
		const body = params['body'];
		const headers = params['headers'];
		if(!body || !headers) throw Error("Input request is not valid");
		if(typeof body !== 'string') throw Error("Request body must be a string");
		const authCode = ctx.fetch('code') as JsonableObject;
		const serverData = ctx.fetch('server_data') as { jwk: JWK, url: string , authenticationUrl: string };
		if(!serverData['jwk'] || !serverData['url']) throw Error("Server data is missing some parameters");

		const request = new Request({
			body: parseQueryStringToDictionary(body),
			headers: headers,
			method: 'POST',
			query: {},
		});

		const response = new Response();

		const options = {
			accessTokenLifetime: 60 * 60, // 1 hour.
			refreshTokenLifetime: 60 * 60 * 24 * 14, // 2 weeks.
			allowExtendedTokenAttributes: true,
			requireClientAuthentication: {}, // defaults to true for all grant types
		};

		const model = getInMemoryCache(serverData, options);
		const handler = getAuthenticateHandler(model, serverData.authenticationUrl);
		var server = new OAuth2Server({
			model: model,
			authenticateHandler: handler,
		});

		const code = await model.setupTokenRequest(authCode, request);
		if (!code) throw Error('Invalid token request');

		const res_token = await server.token(request, response, options);

		//we remove the client and user object from the token
		const token: JsonableObject = {
			accessToken: res_token.accessToken,
			accessTokenExpiresAt: res_token.accessTokenExpiresAt!.toString(),
			authorizationCode: res_token['authorizationCode'],
			c_nonce: res_token['c_nonce'],
			c_nonce_expires_in: res_token['c_nonce_expires_in'],
			jkt: res_token['jkt'],
			refreshToken: res_token.refreshToken!,
			refreshTokenExpiresAt: res_token.refreshTokenExpiresAt!.toString(),
			scope: res_token.scope!,
		};

		return ctx.pass(token);
	},
);

/**
 * @internal
 */
//Add sentence that allows to generate and output a valid authorization code for an authenticated request
export const createAuthorizationCode = p.new(
	['request', 'client', 'server_data'],
	'generate authorization code',
	async (ctx) => {
		const params = ctx.fetch('request') as JsonableObject;
		const body = params['body'];
		const headers = params['headers'];
		if(!body || !headers) throw Error("Input request is not valid");
		if(typeof body !== 'string') throw Error("Request body must be a string");
		const client = ctx.fetch('client') as JsonableObject;
		const serverData = ctx.fetch('server_data') as { jwk: JWK, url: string , authenticationUrl: string };
		if(!serverData['jwk'] || !serverData['url']) throw Error("Server data is missing some parameters");

		const request = new Request({
			body: parseQueryStringToDictionary(body),
			headers: headers,
			method: 'GET',
			query: {},
		});

		const response = new Response();

		const options = {
			accessTokenLifetime: 60 * 60, // 1 hour.
			refreshTokenLifetime: 60 * 60 * 24 * 14, // 2 weeks.
			allowExtendedTokenAttributes: true,
			requireClientAuthentication: {}, // defaults to true for all grant types
		};

		const model = getInMemoryCache(serverData, options);
		const handler = getAuthenticateHandler(model, serverData.authenticationUrl);
		var server = new OAuth2Server({
			model: model,
			authenticateHandler: handler,
		});

		const cl = model.setClient(client);
		if (!cl) {
			throw Error('Client is not valid');
		}

		return ctx.pass(await server.authorize(request, response));
	},
);

export const oauth = p;