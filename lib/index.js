/**
 * Audio/video previews, Host half.
 *
 * Registers one authenticated Fetch route, `/api/media`, that streams a file
 * with HTTP byte-range support. Because the route lives under `/api`, the
 * Connection carrier applies its Host/Origin fence and browser authentication
 * before this handler runs — the same boundary `/api/file` uses.
 *
 * Why a second file route instead of `/api/file`:
 *  - `/api/file` answers the complete body with `200` and ignores `Range`, so a
 *    remote `<video>` cannot seek until the whole file has downloaded, and its
 *    byte cap is the image-attachment limit (~20 MB).
 *  - This route answers `206 Partial Content` with `Content-Range`, streams in
 *    chunks instead of buffering, and has no image-sized cap, so multi-hundred
 *    megabyte media plays and seeks in the browser.
 *
 * The route is deliberately not restricted by extension: authentication is the
 * access boundary, exactly as it is for `/api/file`.
 */
import { basename, extname, isAbsolute } from "node:path";

/** Exact pathname claimed on the shared `/api` Fetch channel. */
const ROUTE_PATH = "/api/media";

/** Bytes read from the filesystem per stream pull; also the seek granularity. */
const CHUNK_BYTES = 1024 * 1024;

/** Media types the browser can hand to a `<video>`/`<audio>` element. */
const MEDIA_TYPES = Object.freeze({
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
});

/** Headers every response carries: private, sniff-proof, and not cached. */
const BASE_HEADERS = Object.freeze({
	"Cache-Control": "private, no-store",
	"X-Content-Type-Options": "nosniff"
});

/**
 * Resolve a filename to the media type its element needs.
 * @param {string} path - File path or display path.
 * @returns {string} a media type, or `application/octet-stream` when unknown.
 */
function mediaTypeOf(path) {
	const extension = extname(path).slice(1).toLowerCase();
	return MEDIA_TYPES[extension] ?? "application/octet-stream";
}

/**
 * Plain-text failure with the same private cache policy as a success.
 * @param {number} status - HTTP status.
 * @param {string} message - Body text.
 * @returns {Response} the failure response.
 */
function failure(status, message) {
	return new Response(message, {
		status,
		headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8" }
	});
}

/**
 * Parse one single-range `Range` header against a known size.
 *
 * Multiple ranges are intentionally unsupported: browsers only use them for
 * exotic media, and a `200` full response is a valid fallback for anything this
 * parser does not understand.
 * @param {string | null} header - Raw `Range` header.
 * @param {number} size - Complete file size in bytes.
 * @returns {{start: number, end: number} | "invalid" | undefined} the window,
 *   `"invalid"` when the header asks outside the file, or `undefined` to serve
 *   the complete body.
 */
function parseRange(header, size) {
	if (header === null) return undefined;
	const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
	if (match === null) return undefined;
	const [, first, last] = match;
	if (first === "" && last === "") return undefined;
	if (first === "") {
		const suffix = Number(last);
		if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) return "invalid";
		return { start: Math.max(0, size - suffix), end: size - 1 };
	}
	const start = Number(first);
	if (!Number.isSafeInteger(start) || start >= size) return "invalid";
	const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
	if (!Number.isSafeInteger(end) || end < start) return "invalid";
	return { start, end };
}

/**
 * Stream `[start, start + length)` out of one resolved file without buffering
 * the complete content.
 * @param {object} fs - Host filesystem service.
 * @param {object} target - Resolved filesystem target.
 * @param {number} start - 0-based first byte.
 * @param {number} length - Byte count to send.
 * @param {AbortSignal} signal - Request lifetime; aborts a read when the client leaves.
 * @returns {ReadableStream<Uint8Array>} the response body.
 */
function streamBytes(fs, target, start, length, signal) {
	let offset = start;
	let remaining = length;
	return new ReadableStream({
		async pull(controller) {
			if (remaining <= 0) {
				controller.close();
				return;
			}
			const want = Math.min(CHUNK_BYTES, remaining);
			let bytes;
			try {
				bytes = await fs.readByteRange(target, { offset, length: want }, signal);
			} catch (error) {
				// A vanished client aborts the read; closing is the clean end of an
				// already-gone response, while a real read fault must surface.
				if (signal.aborted) {
					try {
						controller.close();
					} catch {
						/* The stream is already closed by the client. */
					}
					return;
				}
				controller.error(error);
				return;
			}
			if (bytes.byteLength === 0) {
				controller.close();
				return;
			}
			try {
				controller.enqueue(bytes);
			} catch {
				return;
			}
			offset += bytes.byteLength;
			remaining -= bytes.byteLength;
		}
	});
}

/**
 * Serve one file: metadata, HEAD, and byte ranges over a chunked stream.
 * @param {Request} request - Authenticated Fetch request.
 * @param {object} fs - Host filesystem service.
 * @returns {Promise<Response>} the complete response.
 */
async function serve(request, fs) {
	const path = new URL(request.url).searchParams.get("path");
	if (path === null || path.length === 0) return failure(400, "missing path");
	if (path.includes("\0") || !isAbsolute(path)) return failure(400, "absolute path required");

	let target;
	let info;
	try {
		target = await fs.resolve(path, { signal: request.signal });
		info = await fs.stat(target, request.signal);
	} catch (error) {
		if (error instanceof Error && typeof error.code === "string") {
			return failure({ FS_NOT_FOUND: 404, FS_PERMISSION_DENIED: 403, FS_SANDBOX_DENIED: 403, FS_ABORTED: 499 }[error.code] ?? 500, error.code);
		}
		throw error;
	}
	if (info === undefined) return failure(404, "not found");
	if (info.type !== "file") return failure(403, "not a regular file");

	const size = info.size ?? 0;
	const type = mediaTypeOf(target.displayPath ?? path);
	const range = parseRange(request.headers.get("range"), size);

	/** @type {Record<string, string>} */
	const headers = {
		...BASE_HEADERS,
		"Accept-Ranges": "bytes",
		"Content-Type": type
	};
	if (new URL(request.url).searchParams.get("download") === "1") {
		const name = basename(target.displayPath ?? path);
		const safe = name.replace(/["\\\r\n]/gu, "_");
		headers["Content-Disposition"] = `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`;
	}

	if (range === "invalid") {
		headers["Content-Range"] = `bytes */${String(size)}`;
		return new Response(null, { status: 416, headers });
	}

	const window = range === undefined ? { start: 0, end: size - 1 } : range;
	const length = size === 0 ? 0 : window.end - window.start + 1;
	if (range !== undefined) headers["Content-Range"] = `bytes ${String(window.start)}-${String(window.end)}/${String(size)}`;
	headers["Content-Length"] = String(length);

	if (request.method === "HEAD" || length === 0) {
		return new Response(null, { status: range === undefined ? 200 : 206, headers });
	}
	return new Response(streamBytes(fs, target, window.start, length, request.signal), {
		status: range === undefined ? 200 : 206,
		headers
	});
}

/**
 * Host plugin body: claim `/api/media` for the plugin lifetime.
 *
 * `connection` supplies the authenticated Fetch channel (and therefore the
 * trust fence); `fs` supplies paths, reads, and the execution world's access
 * policy, so this route reads exactly the files the Host already exposes.
 * @param {object} ctx - Host context carrying `connection` and `fs`.
 */
function apply(ctx) {
	ctx.effect(() => ctx.connection.fetch.register({
		path: ROUTE_PATH,
		methods: ["GET", "HEAD"],
		requestBody: "buffered",
		fetch: (request) => serve(request, ctx.fs)
	}), `media-web-preview: GET ${ROUTE_PATH}`);
}

const inject = ["connection", "fs"];

export { apply, inject, mediaTypeOf, parseRange };
