import test from 'ava';
import { Slangroom, type PluginContext, type PluginResult } from '@slangroom/core';

test('runs all unknown statements', async (t) => {
	let usedP0 = false;
	let usedP1 = false;
	let usedP2 = false;

	const p0 = (ctx: PluginContext): PluginResult => {
		if (ctx.phrase === 'a') {
			usedP0 = true;
			return ctx.pass('foo');
		}
		return ctx.fail('Unkown phrase');
	};

	const p1 = (ctx: PluginContext): PluginResult => {
		if (ctx.phrase === 'b') {
			usedP1 = true;
			t.is(ctx.fetch('a'), 'foo');
			return ctx.pass('bar');
		}
		return ctx.fail('Unknown phrase');
	};

	const p2 = (ctx: PluginContext): PluginResult => {
		if (ctx.phrase === 'c d') {
			usedP2 = true;
			t.is(ctx.fetch('a'), 'bar');
			return ctx.pass('foobar');
		}
		return ctx.fail('Unkown phrase');
	};

	const script = `
Rule caller restroom-mw
Given I A and output into 'a'

Given I have a 'string' named 'a'
Then print 'a'

Then I pass a 'a' and B and output into 'b'
Then I pass a 'b' and  c D
Then I pass a 'b' and  C d and output into 'mimmo'
`;
	const slangroom = new Slangroom(p0, [p1, new Set([p2])]);
	const res = await slangroom.execute(script);
	t.true(usedP0);
	t.true(usedP1);
	t.true(usedP2);
	t.deepEqual(res.result, { a: 'foo', b: 'bar', mimmo: 'foobar' }, res.logs);
});
