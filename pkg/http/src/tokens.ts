import { createToken } from '@slangroom/deps/chevrotain';
import { Whitespace } from '@slangroom/shared';

export const Get = createToken({
	name: 'Get',
	pattern: /get/i,
});

export const Post = createToken({
	name: 'Post',
	pattern: /post/i,
});

export const Do = createToken({
	name: 'Do',
	pattern: /do/i,
});

export const Parallel = createToken({
	name: 'Parallel',
	pattern: /parallel/i,
});

export const Same = createToken({
	name: 'Same',
	pattern: /same/i,
});

export const Sequential = createToken({
	name: 'Sequential',
	pattern: /sequential/i,
});

export const allTokens = [Whitespace, Get, Post, Parallel, Sequential, Same, Do];