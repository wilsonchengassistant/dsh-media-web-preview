import assert from "node:assert/strict";
import test from "node:test";

import { mediaTypeOf, parseRange } from "../lib/index.js";

test("mediaTypeOf maps every documented suffix to a media type", () => {
	const expected = {
		mp4: "video/mp4",
		m4v: "video/x-m4v",
		mov: "video/quicktime",
		webm: "video/webm",
		ogv: "video/ogg",
		mkv: "video/x-matroska",
		avi: "video/x-msvideo",
		mpg: "video/mpeg",
		mpeg: "video/mpeg",
		"3gp": "video/3gpp",
		"3g2": "video/3gpp2",
		ts: "video/mp2t",
		m2ts: "video/mp2t",
		mp3: "audio/mpeg",
		m4a: "audio/mp4",
		m4b: "audio/mp4",
		aac: "audio/aac",
		wav: "audio/wav",
		flac: "audio/flac",
		ogg: "audio/ogg",
		oga: "audio/ogg",
		opus: "audio/ogg",
		weba: "audio/webm",
		aiff: "audio/aiff",
		aif: "audio/aiff",
		wma: "audio/x-ms-wma",
		mid: "audio/midi",
		midi: "audio/midi"
	};
	for (const [suffix, type] of Object.entries(expected)) {
		assert.equal(mediaTypeOf(`clip.${suffix}`), type, `suffix .${suffix}`);
	}
});

test("mediaTypeOf is case-insensitive and tolerates a display path", () => {
	assert.equal(mediaTypeOf("CLIP.MP4"), "video/mp4");
	assert.equal(mediaTypeOf("/Users/me/Movies/clip.Mp3"), "audio/mpeg");
});

test("mediaTypeOf falls back to octet-stream for anything unknown", () => {
	assert.equal(mediaTypeOf("notes.txt"), "application/octet-stream");
	assert.equal(mediaTypeOf("archive"), "application/octet-stream");
});

test("parseRange returns undefined for a full-body request", () => {
	assert.equal(parseRange(null, 1000), undefined);
	assert.equal(parseRange("items=0-10", 1000), undefined);
	assert.equal(parseRange("bytes=", 1000), undefined);
});

test("parseRange resolves an explicit closed window", () => {
	assert.deepEqual(parseRange("bytes=0-1023", 3458679), { start: 0, end: 1023 });
	assert.deepEqual(parseRange("bytes=100-199", 1000), { start: 100, end: 199 });
});

test("parseRange clamps an end past EOF to the last byte", () => {
	assert.deepEqual(parseRange("bytes=900-99999", 1000), { start: 900, end: 999 });
});

test("parseRange treats an open end as through EOF", () => {
	assert.deepEqual(parseRange("bytes=500-", 1000), { start: 500, end: 999 });
});

test("parseRange resolves a suffix range against the tail", () => {
	assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
	// A suffix longer than the file yields the whole file, not an error.
	assert.deepEqual(parseRange("bytes-", 1000), undefined);
	assert.deepEqual(parseRange("bytes=-5000", 1000), { start: 0, end: 999 });
});

test("parseRange reports unsatisfiable windows as invalid", () => {
	// Start at or past EOF.
	assert.equal(parseRange("bytes=1000-", 1000), "invalid");
	assert.equal(parseRange("bytes=5000-6000", 1000), "invalid");
	// End before start.
	assert.equal(parseRange("bytes=200-100", 1000), "invalid");
	// A suffix range against an empty file.
	assert.equal(parseRange("bytes=-10", 0), "invalid");
});
