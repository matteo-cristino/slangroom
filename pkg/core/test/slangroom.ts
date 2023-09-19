import test from 'ava';
import { BeforePlugin, AfterPlugin, Slangroom } from '@slangroom/core';

test('adding a plugin correctly falls into either before or after', (t) => {
	const before = new BeforePlugin(() => {
		return;
	});
	const after = new AfterPlugin(() => {
		return;
	});
	const slang = new Slangroom(before, after);

	t.is(slang.beforeExecution.size, 1);
	t.true(slang.beforeExecution.has(before));

	t.is(slang.afterExecution.size, 1);
	t.true(slang.afterExecution.has(after));
});

test('no plugins are executed if no ignored statemnets are found', async (t) => {
	let hasBeforeRan = false;
	let hasAfterRan = false;
	const before = new BeforePlugin(() => {
		hasBeforeRan = true;
		return;
	});
	const after = new BeforePlugin(() => {
		hasAfterRan = true;
		return;
	});
	const slang = new Slangroom([before, after]);
	const contract = `Given I have nothing
Then I print the string 'I love you'
`;
	await slang.execute(contract);
	t.false(hasBeforeRan);
	t.false(hasAfterRan);
});

test('before-plugins runs before the actual execution and after-plugins runs after', async (t) => {
	let hasBeforeRan = false;
	let hasAfterRan = false;
	const before = new BeforePlugin(() => {
		t.false(hasBeforeRan);
		t.false(hasAfterRan);
		hasBeforeRan = true;
		return;
	});
	const after = new AfterPlugin(() => {
		t.true(hasBeforeRan);
		t.false(hasAfterRan);
		hasAfterRan = true;
		return;
	});
	const slang = new Slangroom(new Set([before, after]));
	const contract = `Rule unknown ignore

Given I have nothing
Then I print the string 'I love you'
Then this statement does not exist
`;
	await slang.execute(contract);
	t.true(hasBeforeRan);
	t.true(hasAfterRan);
});

test('before-plugins can inject parameters', async (t) => {
	const before = new BeforePlugin(() => {
		console.log("foobarbra")
		return {foo: 'bar' };
	});
	const slang = new Slangroom(before);
	const contract = `Rule unknown ignore

Given I have a 'string' named 'foo'
When I need an ignored statement
Then I print 'foo'
`;
	const zout = await slang.execute(contract);
	t.is(zout.result['foo'] as string, 'bar');
});

test('after-plugins can return values', async (t) => {
	const before = new AfterPlugin(() => {
		return { foo: "bar" };
	});
	const slang = new Slangroom(before);
	const contract = `Rule unknown ignore
Given nothing
Then done
Then I need an ignored statement
`;
	const zout = await slang.execute(contract);
	t.is(zout.result['foo'] as string, 'bar');
});

test('check statements order', async (t) => {
	const beforeA = new BeforePlugin((ctx) => {
		if(!ctx.params?.data) return
		if(ctx.statement == "Given A" && ctx.params?.data['state'] == "BEGIN") {
			return {state: "A"}
		}
		return
	});
	const beforeB = new BeforePlugin((ctx) => {
		if(!ctx.params?.data) return
		if(ctx.statement == "Given B" && ctx.params?.data['state'] == "A") {
			return {state: "B"}
		}
		return
	});
	const afterC = new BeforePlugin((ctx) => {
		if(!ctx.params?.data) return
		if(ctx.statement == "Then C" && ctx.params?.data['state'] == "B") {
			return {state: "C"}
		}
		return
	});
	const afterD = new BeforePlugin((ctx) => {
		if(!ctx.params?.data) return
		if(ctx.statement == "Then D" && ctx.params?.data['state'] == "C") {
			return {state: "D"}
		}
		return
	});
	const slang = new Slangroom(beforeA, beforeB, afterC, afterD);
	const contract = `Rule unknown ignore
Given A
Given B
Given I have a 'string' named 'state'
Then print the 'state'
Then C
Then D
`;
	const zout = await slang.execute(contract, { data: { state: "BEGIN" } });
	t.is(zout.result['state'] as string, 'D');
});
