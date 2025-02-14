// SPDX-FileCopyrightText: 2024 Dyne.org foundation
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import test from 'ava';
import { Slangroom } from '@slangroom/core';
import { redis } from '@slangroom/redis';

test('Redis write and read back', async (t) => {
	const obj = {
		name: 'test person',
		age: Math.floor(Math.random() * 100).toString(),
	};
	const writeRedis = `
Rule unknown ignore
Given I connect to 'redis' and send key 'key1' and send object 'object1' and write object into key in redis
Given I connect to 'redis' and send key 'key1' and read key from redis and output into 'read1'
Given I have a 'string dictionary' named 'read1'

Then print data
Then I connect to 'redis' and send key 'key1' and delete key from redis
Then I connect to 'redis' and send key 'key1' and read key from redis and output into 'read2'
`;
	const slangroom = new Slangroom(redis);
	const res = await slangroom.execute(writeRedis, {
		keys: {
			redis: 'redis://localhost:6379',
			object1: obj,
			key1: 'persona',
		},
	});
	t.deepEqual(res['result']['read1'], obj);
	t.deepEqual(res['result']['read2'], {});
});
