/**
 * Audio/video previews, browser half.
 *
 * Registers two document renderers (`video` and `audio`) in the Sidebar's
 * extensible preview registry, so a media file opens as a browser player
 * instead of the "Preview is not available for this file type yet" state whose
 * only action launches a native application on the Host.
 *
 * The bytes come from `/api/media` (Host half of this plugin), which is
 * authenticated by the Connection carrier and honours `Range`, so a remote
 * browser seeks without downloading the complete file.
 *
 * This file is served raw as a classic script: every side effect, including
 * JSX runtime work, belongs inside the factory.
 */
window.__ModuleLoader__.load({
	id: "dsh-media-web-preview",
	factory(require) {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var react_jsx_runtime = require("react/jsx-runtime");

		/** Locale namespace owned by this plugin. */
		const NS = "mediaPreview";

		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"viewer.video": "视频",
			"viewer.audio": "音频",
			"status.loading": "正在载入媒体…",
			"status.path": "无法读取此文件的路径。",
			"status.playback": "此浏览器无法播放这个格式。",
			"status.hint": "可以下载后使用本机播放器打开。",
			"action.download": "下载",
			"action.openTab": "在新标签页打开"
		};

		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"viewer.video": "Video",
			"viewer.audio": "Audio",
			"status.loading": "Loading media…",
			"status.path": "This file's path is unavailable.",
			"status.playback": "This browser cannot play this format.",
			"status.hint": "You can download it and open it in a local player.",
			"action.download": "Download",
			"action.openTab": "Open in new tab"
		};

		/** Implementation identities; each is also the keyed body slot key. */
		const VIDEO_ID = "dsh-media-web-preview/video";
		const AUDIO_ID = "dsh-media-web-preview/audio";

		/** Video containers and codecs browsers commonly expose in `<video>`. */
		const VIDEO_EXTENSIONS = [
			"mp4",
			"m4v",
			"webm",
			"ogv",
			"mov",
			"mkv",
			"avi",
			"mpg",
			"mpeg",
			"3gp",
			"3g2",
			"ts",
			"m2ts"
		];

		/** Audio containers and codecs browsers commonly expose in `<audio>`. */
		const AUDIO_EXTENSIONS = [
			"mp3",
			"m4a",
			"m4b",
			"aac",
			"wav",
			"flac",
			"ogg",
			"oga",
			"opus",
			"weba",
			"aiff",
			"aif",
			"wma",
			"mid",
			"midi"
		];

		/** Required browser services: slot registry, copy, and the preview registry. */
		const inject = ["slots", "locale", "documentPreviews"];

		/**
		 * Build the authenticated media URL for one absolute path.
		 *
		 * App-owned browser routes are document-relative (the same rule the
		 * built-in image/markdown previews follow), so the URL is resolved
		 * against `document.baseURI` rather than hard-coding a leading slash.
		 * @param {string} path - Absolute path reported by the file resource.
		 * @param {boolean} [download] - Ask the Host for an attachment response.
		 * @returns {string | undefined} the URL, or undefined for an unsupported base.
		 */
		function mediaUrl(path, download) {
			try {
				const suffix = download === true ? "&download=1" : "";
				return new URL(`api/media?path=${encodeURIComponent(path)}${suffix}`, document.baseURI).href;
			} catch {
				return undefined;
			}
		}

		/**
		 * Final path segment for display, accepting either separator.
		 * @param {string} path - Absolute or workspace path.
		 * @returns {string} the file name.
		 */
		function basenameOf(path) {
			const normalized = path.replaceAll("\\", "/");
			return normalized.slice(normalized.lastIndexOf("/") + 1);
		}

		/**
		 * Human byte size for the footer.
		 * @param {number | undefined} bytes - File size.
		 * @returns {string} e.g. `15.9 MB`, or an empty string when unknown.
		 */
		function formatBytes(bytes) {
			if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
			if (bytes < 1024) return `${String(bytes)} B`;
			const units = ["KB", "MB", "GB", "TB"];
			let value = bytes / 1024;
			let unit = 0;
			while (value >= 1024 && unit < units.length - 1) {
				value /= 1024;
				unit += 1;
			}
			return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
		}

		const styles = {
			frame: {
				boxSizing: "border-box",
				display: "flex",
				flexDirection: "column",
				gap: "10px",
				alignItems: "center",
				justifyContent: "center",
				width: "100%",
				height: "100%",
				minHeight: "0",
				padding: "12px",
				overflow: "auto",
				fontFamily: "var(--dsw-font, sans-serif)",
				fontSize: "13px",
				color: "var(--dsw-alias-label-secondary, #666)"
			},
			stage: {
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: "100%",
				minHeight: "0",
				flex: "0 1 auto"
			},
			video: {
				display: "block",
				maxWidth: "100%",
				maxHeight: "72vh",
				background: "#000",
				borderRadius: "8px",
				outline: "none"
			},
			audioCard: {
				boxSizing: "border-box",
				display: "flex",
				flexDirection: "column",
				gap: "12px",
				width: "100%",
				maxWidth: "520px",
				padding: "16px",
				borderRadius: "12px",
				background: "var(--dsw-alias-bg-secondary, rgba(127, 127, 127, 0.08))"
			},
			audio: {
				width: "100%",
				outline: "none"
			},
			audioName: {
				fontWeight: "600",
				overflowWrap: "anywhere",
				color: "var(--dsw-alias-label-primary, inherit)"
			},
			footer: {
				display: "flex",
				flexWrap: "wrap",
				gap: "8px 14px",
				alignItems: "center",
				justifyContent: "center",
				maxWidth: "100%",
				fontSize: "12px"
			},
			name: {
				overflowWrap: "anywhere",
				color: "var(--dsw-alias-label-primary, inherit)"
			},
			link: {
				color: "var(--dsw-alias-link, #2f6fed)",
				textDecoration: "none"
			},
			status: {
				margin: "0",
				textAlign: "center",
				lineHeight: "1.5",
				maxWidth: "34em"
			}
		};

		/**
		 * Report the loaded resource version once, so the document owner can
		 * retire its loading state and re-render on file changes without a loop.
		 * @param {object | undefined} content - Renderer-owned content handle.
		 * @param {string | undefined} version - Resource version from metadata.
		 * @returns {void}
		 */
		function useRendererLoaded(content, version) {
			const reported = react.useRef(void 0);
			react.useEffect(() => {
				if (content === void 0 || content.kind !== "renderer" || version === void 0 || reported.current === version) return;
				reported.current = version;
				content.loaded(version);
			}, [
				content,
				version
			]);
		}

		/**
		 * Shared media body for both renderers.
		 * @param {object} props - Standard document-body props plus the media kind.
		 * @returns {object} the player, a status line, or a load failure.
		 */
		function MediaBody(props) {
			const { kind, content, resourceAddress, useResource, t } = props;
			const meta = useResource(resourceAddress);
			const absolutePath = meta?.value?.absolutePath;
			const version = meta?.value?.version;
			const size = meta?.value?.size;
			const [failed, setFailed] = react.useState(false);
			useRendererLoaded(content, version);

			const remote = typeof absolutePath === "string" ? mediaUrl(absolutePath) : undefined;
			const download = typeof absolutePath === "string" ? mediaUrl(absolutePath, true) : undefined;
			const name = typeof absolutePath === "string" ? basenameOf(absolutePath) : "";
			const bytes = formatBytes(size);
			const metaLine = bytes === "" ? name : `${name} · ${bytes}`;

			react.useEffect(() => {
				setFailed(false);
			}, [remote]);

			if (remote === undefined) return react_jsx_runtime.jsx("p", {
				style: styles.status,
				role: "alert",
				children: absolutePath === void 0 ? t("status.path") : t("status.loading")
			});

			const element = failed ? react_jsx_runtime.jsx("p", {
				style: styles.status,
				role: "alert",
				children: `${t("status.playback")} ${t("status.hint")}`
			}) : kind === "video" ? react_jsx_runtime.jsx("video", {
				key: `${remote}|${String(version ?? "")}`,
				src: remote,
				controls: true,
				playsInline: true,
				preload: "metadata",
				style: styles.video,
				onError: () => setFailed(true)
			}) : react_jsx_runtime.jsx("audio", {
				key: `${remote}|${String(version ?? "")}`,
				src: remote,
				controls: true,
				preload: "metadata",
				style: styles.audio,
				onError: () => setFailed(true)
			});

			const stage = kind === "audio" && !failed ? react_jsx_runtime.jsxs("div", {
				style: styles.audioCard,
				children: [
					react_jsx_runtime.jsx("div", {
						style: styles.audioName,
						children: metaLine
					}, "name"),
					element
				]
			}) : element;

			return react_jsx_runtime.jsxs("div", {
				style: styles.frame,
				"data-media-web-preview": kind,
				children: [
					react_jsx_runtime.jsx("div", {
						style: styles.stage,
						children: stage
					}, "stage"),
					react_jsx_runtime.jsxs("div", {
						style: styles.footer,
						children: [
							kind === "audio" ? null : react_jsx_runtime.jsx("span", {
								style: styles.name,
								children: metaLine
							}, "meta"),
							download === undefined ? null : react_jsx_runtime.jsx("a", {
								style: styles.link,
								href: download,
								download: name,
								children: t("action.download")
							}, "download"),
							react_jsx_runtime.jsx("a", {
								style: styles.link,
								href: remote,
								target: "_blank",
								rel: "noreferrer",
								children: t("action.openTab")
							}, "open")
						]
					}, "footer")
				]
			});
		}

		/** Video renderer wrapper: the shared body with the video kind bound. */
		function VideoBody(props) {
			return react_jsx_runtime.jsx(MediaBody, {
				...props,
				kind: "video"
			});
		}

		/** Audio renderer wrapper: the shared body with the audio kind bound. */
		function AudioBody(props) {
			return react_jsx_runtime.jsx(MediaBody, {
				...props,
				kind: "audio"
			});
		}

		/**
		 * Describe one renderer independently of its keyed body component.
		 * @param {string} id - Unique implementation identity.
		 * @param {readonly string[]} extensions - Suffixes this renderer owns.
		 * @param {() => string} title - Localized viewer label.
		 * @returns {object} preview registry metadata.
		 */
		function definition(id, extensions, title) {
			return {
				id,
				extensions,
				binaryExtensions: extensions,
				priority: "extension",
				title,
				loading: "renderer",
				wrap: false
			};
		}

		/**
		 * Register dictionaries, both renderers, and their keyed bodies.
		 * @param {object} ctx - Client root context.
		 * @returns {void}
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "media-web-preview: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.documentPreviews.register(definition(VIDEO_ID, VIDEO_EXTENSIONS, () => t("viewer.video"))), "media-web-preview: video metadata");
			ctx.effect(() => ctx.documentPreviews.register(definition(AUDIO_ID, AUDIO_EXTENSIONS, () => t("viewer.audio"))), "media-web-preview: audio metadata");
			ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
				name: "sidebar.right.tab.document",
				key: VIDEO_ID,
				locale: NS
			}, VideoBody)), "media-web-preview: video body");
			ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
				name: "sidebar.right.tab.document",
				key: AUDIO_ID,
				locale: NS
			}, AudioBody)), "media-web-preview: audio body");
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
