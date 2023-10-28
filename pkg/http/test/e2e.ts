import test from 'ava';
import nock from 'nock';
import { Slangroom } from '@slangroom/core';
import { http } from '@slangroom/http';

nock('http://localhost')
	.get('/greeting-es')
	.reply(200, { req: 'Hola chico!' })
	.get('/greeting-en')
	.reply(200, { req: 'Hi!' })
	.post('/sendresult')
	.reply((_, body: any) => {
		const req = body['req'];
		if (req?.includes('Hola') || req?.includes('Hi')) return [200, 'received result'];
		return [500, 'Did not receive the result'];
	})
	.persist();

test('Full script that uses http plugin', async (t) => {
	const script = `
Rule caller restroom-mw
Given I connect to 'greeting_es' and do get and output into 'es'
Given I connect to 'greeting_en' and do get and output into 'en'

Given I have a 'string dictionary' named 'result' in 'es'
Given I rename 'result' to 'result es'
Given I have a 'string dictionary' named 'result' in 'en'
Given I rename 'result' to 'result en'


Given I have a 'string array' named 'final endpoints'
When I create the 'string array'
When I move 'result_es' in 'string array'
When I move 'result_en' in 'string array'
Then print data
Then I connect to 'final_endpoints' and send object 'string_array' and do parallel post and output into 'results'
`;
	const slangroom = new Slangroom(http);
	const res = await slangroom.execute(script, {
		data: {
			greeting_es: 'http://localhost/greeting-es',
			greeting_en: 'http://localhost/greeting-en',
			final_endpoints: ['http://localhost/sendresult', 'http://localhost/sendresult'],
		},
	});
	t.deepEqual(
		res.result,
		{
			final_endpoints: ['http://localhost/sendresult', 'http://localhost/sendresult'],
			string_array: [{ req: 'Hola chico!' }, { req: 'Hi!' }],
			results: [
				{ status: 200, result: 'received result' },
				{ status: 200, result: 'received result' },
			],
		},
		res.logs
	);
});
