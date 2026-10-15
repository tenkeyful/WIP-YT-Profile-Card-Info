// page-bridge.js
// Runs in YouTube's own JavaScript world ("world": "MAIN" in manifest.json, run_at document_start).
//
// 1. Watches /youtubei/v1/next responses (the comment data) for the profile card tokens
//    YouTube already sends with every comment:
//    profileCardCommand: { profileOwnerExternalChannelId, profileCardContext }
// 2. When content.js asks for a card, calls /youtubei/v1/account/get_profile_card from inside
//    the page, so cookies, Origin and visitor data are the real ones.
//
// content.js (isolated world) and this file talk through window.postMessage.
(() => {
	"use strict";

	const NS = "ytpci";
	const ORIGIN = "https://www.youtube.com";
	if (window.__ytpciBridge) return;
	window.__ytpciBridge = true;

	const tokens = new Map(); // channelId -> profileCardContext (latest seen)
	const post = (msg) => window.postMessage({ ns: NS, ...msg }, window.location.origin);

	// 1. Collect tokens from comment responses

	function collectPairs(node, out) {
		if (!node || typeof node !== "object") return;
		if (Array.isArray(node)) {
			for (const v of node) collectPairs(v, out);
			return;
		}
		if (
			typeof node.profileCardContext === "string" &&
			typeof node.profileOwnerExternalChannelId === "string"
		) {
			out.set(node.profileOwnerExternalChannelId, node.profileCardContext);
		}
		for (const k in node) collectPairs(node[k], out);
	}

	function ingest(json) {
		const found = new Map();
		collectPairs(json, found);
		if (!found.size) return;
		for (const [id, ctx] of found) tokens.set(id, ctx);
		// Always announce every id; content.js de-duplicates. (Tokens are per video/channel
		// context, so the same commenter on another video needs a fresh request.)
		post({ type: "pairs", channelIds: [...found.keys()] });
	}

	const origFetch = window.fetch;
	window.fetch = function (...args) {
		const promise = origFetch.apply(this, args);
		try {
			const first = args[0];
			const url = typeof first === "string" ? first : (first && first.url) || String(first);
			if (url.includes("/youtubei/v1/next")) {
				promise
					.then((res) => res.clone().json())
					.then(ingest)
					.catch(() => {});
			}
		} catch (e) {
			/* never break YouTube's own fetch */
		}
		return promise;
	};

	// 2. Fetch a profile card on request

	function cookie(name) {
		const m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
		return m ? m[1] : null;
	}

	// SAPISIDHASH = SHA1(timestamp + " " + SAPISID + " " + origin). Must be fresh per request.
	async function authorizationHeader() {
		const sapisid = cookie("SAPISID") || cookie("__Secure-3PAPISID");
		if (!sapisid) return null;
		const ts = Math.floor(Date.now() / 1000);
		const bytes = new TextEncoder().encode(`${ts} ${sapisid} ${ORIGIN}`);
		const digest = await crypto.subtle.digest("SHA-1", bytes);
		const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
		return `SAPISIDHASH ${ts}_${hex}`;
	}

	function cfg(key) {
		try {
			return window.ytcfg && window.ytcfg.get ? window.ytcfg.get(key) : undefined;
		} catch (e) {
			return undefined;
		}
	}

	async function fetchCard(channelId) {
		const profileCardContext = tokens.get(channelId);
		if (!profileCardContext) return { ok: false, status: 0, reason: "no-token" };

		const context = cfg("INNERTUBE_CONTEXT") || {
			client: {
				clientName: "WEB",
				clientVersion: cfg("INNERTUBE_CLIENT_VERSION"),
				hl: cfg("HL") || "en",
			},
		};
		const auth = await authorizationHeader();
		const headers = {
			"Content-Type": "application/json",
			"X-Origin": ORIGIN,
			"X-Goog-AuthUser": String(cfg("SESSION_INDEX") ?? 0),
			"X-Youtube-Client-Name": String(cfg("INNERTUBE_CONTEXT_CLIENT_NAME") ?? 1),
			"X-Youtube-Client-Version": String(cfg("INNERTUBE_CLIENT_VERSION") ?? ""),
			"X-Youtube-Bootstrap-Logged-In": String(Boolean(auth)),
		};
		const visitorData = cfg("VISITOR_DATA");
		if (visitorData) headers["X-Goog-Visitor-Id"] = visitorData;
		if (auth) headers.Authorization = auth;

		const res = await origFetch.call(window, "/youtubei/v1/account/get_profile_card?prettyPrint=false", {
			method: "POST",
			credentials: "include",
			headers,
			body: JSON.stringify({
				context,
				profileOwnerExternalChannelId: channelId,
				profileCardContext,
			}),
		});
		const card = await res.json().catch(() => null);
		window.__ytpciLastCard = card; // for debugging in DevTools: copy(JSON.stringify(__ytpciLastCard))
		return { ok: res.ok, status: res.status, card };
	}

	window.addEventListener("message", async (e) => {
		if (e.source !== window || e.origin !== window.location.origin) return;
		const m = e.data;
		if (!m || m.ns !== NS) return;

		if (m.type === "sync") {
			// content.js starts later than this script; replay what we already collected
			if (tokens.size) post({ type: "pairs", channelIds: [...tokens.keys()] });
		} else if (m.type === "fetch" && typeof m.channelId === "string") {
			let result;
			try {
				result = await fetchCard(m.channelId);
			} catch (err) {
				result = { ok: false, status: 0, reason: String(err) };
			}
			post({ type: "card", channelId: m.channelId, ...result });
		}
	});
})();
