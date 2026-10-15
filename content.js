(() => {
	// CONFIGURABLE VARIABLES //
	const ANIMATION_DURATION = 1; // s for transitions
	const ANIMATION_DELAY = 0; // ms before starting animation
	const ANIMATION_OFFSET = 0; // px for translateY animation
	const REQUEST_DELAY = 2500; // ms between profile card requests
	const REQUEST_JITTER = 1500; // extra random ms added to each delay
	const REQUEST_TIMEOUT = 15000; // ms to wait for one profile card
	const MAX_FAILURES = 3; // consecutive failed requests before pausing for this page
	const MAX_REQUESTS = 300; // safety cap on requests per page load
	const RENDER_INTERVAL = 3000; // ms between sweeps for comments not rendered yet
	const DEBUG = false; // true = log what the add-on is doing to the console

	// UI STYLE CONSTANTS //
	const PADDING = "4px 8px";
	const BORDER_RADIUS = "4px";
	const FONT_SIZE = "1rem";
	const SMALL_FONT_SIZE = "0.9rem";
	const BORDER_STYLE = "1px solid rgba(128,128,128,0.2)";
	const GENERAL_BACKGROUND = "var(--yt-sys-color-baseline--base-background)";
	const TEXT_COLOR = "var(--yt-sys-color-baseline--text-primary)";
	const BOX_SHADOW = "0 2px 8px rgba(0,0,0,0.15)";
	const POPUP_ZINDEX = "1000000";
	const COLUMN_GAP_SM = "4px";
	const ICON_SIZE = "16px";
	const SUB_COLUMNS = 4; // subscriptions grid: avatars per row
	const SUB_AVATAR_SIZE = 48; // px, subscription avatar diameter
	const SUB_CELL_WIDTH = "88px"; // width of one avatar + name cell; long names wrap inside it
	const RECENT_TITLE_WIDTH = "110px"; // recent comments menu: video title column
	const RECENT_COMMENT_WIDTH = "260px"; // recent comments menu: comment column
	const RECENT_MAX_HEIGHT = "400px"; // the menu scrolls beyond this height
	const RECENT_COMMENT_MAX_LINES = 6; // longer comments fade out; click the arrow to expand

	const debugLog = (...args) => {
		if (DEBUG) console.log(...args);
	};

	debugLog("[WIP] YouTube Profile Card Info: Add-on started");

	// UI HELPERS //
	let activeCloser = null; // closes whichever dropdown is open, so only one is open at a time

	function applyAnimationStyles(el) {
		el.style.transition = "transform 0.3s ease, opacity 0.3s ease";
		el.style.transform = "translateY(-10px)";
		el.style.opacity = "0";
	}

	function styleInfoBox(el) {
		debugLog("[WIP] YouTube Profile Card Info: Styling info box");
		el.style.background = GENERAL_BACKGROUND;
		el.style.color = TEXT_COLOR;
		el.style.padding = PADDING;
		el.style.borderRadius = BORDER_RADIUS;
		el.style.border = BORDER_STYLE;
		el.style.fontSize = FONT_SIZE;
		el.style.width = "fit-content";
		el.style.position = "relative";
	}

	function createInfoBox(icon, text) {
		debugLog("[WIP] YouTube Profile Card Info: Creating info box", {
			icon,
			text,
		});
		if (!text || text === "N/A") return null;
		const box = document.createElement("div");
		box.className = "yt-enhanced-info-item";
		const iconSpan = document.createElement("span");
		iconSpan.textContent = icon;
		const textSpan = document.createElement("span");
		textSpan.textContent = " " + text;
		box.appendChild(iconSpan);
		box.appendChild(textSpan);
		styleInfoBox(box);
		return box;
	}

	function createBadgeBox(icon, badgeTitle, badgeSubtitle) {
		debugLog("[WIP] YouTube Profile Card Info: Creating badge box", {
			icon,
			badgeTitle,
			badgeSubtitle,
		});
		if (!badgeTitle) return null;
		const box = document.createElement("div");
		box.className = "yt-enhanced-badge-item";

		const container = document.createElement("div");
		container.style.display = "flex";
		container.style.alignItems = "center";
		container.style.gap = "0px";

		const iconSpan = document.createElement("div");
		if (typeof icon === "string" && icon.startsWith("<img")) {
			const img = document.createElement("img");
			const srcMatch = icon.match(/src="([^"]+)"/);
			const styleMatch = icon.match(/style="([^"]+)"/);
			if (srcMatch) img.src = srcMatch[1];
			if (styleMatch) img.style.cssText = styleMatch[1];
			iconSpan.appendChild(img);
		} else {
			iconSpan.textContent = icon;
		}
		iconSpan.style.marginRight = "8px";
		iconSpan.style.display = "flex";
		iconSpan.style.alignItems = "center";
		iconSpan.style.height = "100%";

		const textContainer = document.createElement("div");
		textContainer.style.display = "flex";
		textContainer.style.flexDirection = "column";

		const titleElem = document.createElement("div");
		titleElem.textContent = badgeTitle;
		titleElem.style.fontWeight = "bold";
		textContainer.appendChild(titleElem);

		if (badgeSubtitle) {
			const subtitleElem = document.createElement("div");
			subtitleElem.textContent = badgeSubtitle;
			subtitleElem.style.fontSize = SMALL_FONT_SIZE;
			subtitleElem.style.marginTop = "2px";
			textContainer.appendChild(subtitleElem);
		}

		container.appendChild(iconSpan);
		container.appendChild(textContainer);
		box.appendChild(container);
		styleInfoBox(box);
		box.style.minWidth = "180px";
		return box;
	}

	function createRecentCommentsBox(label, commentEntries) {
		if (!label || !commentEntries || commentEntries.length === 0) return null;

		const wrapper = document.createElement("div");
		wrapper.style.position = "relative";
		wrapper.style.width = "fit-content";

		const box = document.createElement("div");
		box.className = "yt-enhanced-info-item";
		box.textContent = "🗨️ " + label;
		styleInfoBox(box);
		box.style.cursor = "pointer";
		wrapper.appendChild(box);

		let dropdown = null;
		let isOpen = false;

		function closeDropdown() {
			if (dropdown) {
				dropdown.style.transform = "translateY(-10px)";
				dropdown.style.opacity = "0";
				setTimeout(() => {
					if (dropdown) {
						dropdown.remove();
						dropdown = null;
					}
				}, 300);
			}
			isOpen = false;
			if (activeCloser === closeDropdown) activeCloser = null;
		}

		box.addEventListener("click", (e) => {
			e.stopPropagation();

			if (isOpen && dropdown) {
				closeDropdown();
				return;
			}
			if (activeCloser) activeCloser();

			dropdown = document.createElement("div");
			dropdown.style.position = "absolute";
			dropdown.style.background = GENERAL_BACKGROUND;
			dropdown.style.color = TEXT_COLOR;
			dropdown.style.border = BORDER_STYLE;
			dropdown.style.borderRadius = BORDER_RADIUS;
			dropdown.style.boxShadow = BOX_SHADOW;
			dropdown.style.zIndex = POPUP_ZINDEX;
			dropdown.style.display = "grid";
			dropdown.style.gridTemplateColumns =
				RECENT_TITLE_WIDTH + " " + RECENT_COMMENT_WIDTH;
			dropdown.style.gap = COLUMN_GAP_SM;
			dropdown.style.padding = COLUMN_GAP_SM;
			dropdown.style.maxHeight = RECENT_MAX_HEIGHT;
			dropdown.style.overflowY = "auto";
			applyAnimationStyles(dropdown);

			const commentTexts = [];
			const clampedHeight =
				Math.round(RECENT_COMMENT_MAX_LINES * 130) / 100 + "em";

			commentEntries.forEach((entry) => {
				if (!entry.videoTitle && !entry.commentContent) return;

				const titleCell = document.createElement("div");
				titleCell.style.display = "flex";
				titleCell.style.alignItems = "center";
				titleCell.style.minWidth = "0";
				titleCell.style.padding = PADDING;
				titleCell.style.border = BORDER_STYLE;
				titleCell.style.borderRadius = BORDER_RADIUS;
				titleCell.style.fontSize = SMALL_FONT_SIZE;
				titleCell.style.fontWeight = "bold";
				titleCell.style.whiteSpace = "normal";
				titleCell.style.wordBreak = "break-word";
				titleCell.style.overflowWrap = "anywhere";
				titleCell.textContent = entry.videoTitle || "";

				const contentCell = document.createElement("div");
				contentCell.style.display = "flex";
				contentCell.style.flexDirection = "column";
				contentCell.style.justifyContent = "center";
				contentCell.style.minWidth = "0";
				contentCell.style.padding = PADDING;
				contentCell.style.border = BORDER_STYLE;
				contentCell.style.borderRadius = BORDER_RADIUS;
				contentCell.style.fontSize = SMALL_FONT_SIZE;

				// the comment itself: at most RECENT_COMMENT_MAX_LINES lines unless expanded
				const text = document.createElement("div");
				text.style.lineHeight = "1.3";
				text.style.whiteSpace = "normal";
				text.style.wordBreak = "break-word";
				text.style.overflowWrap = "anywhere";
				text.style.overflow = "hidden";
				text.style.maxHeight = clampedHeight;
				text.textContent = entry.commentContent || "";
				contentCell.appendChild(text);

				dropdown.appendChild(titleCell);
				dropdown.appendChild(contentCell);
				commentTexts.push({ text, contentCell });
			});

			document.body.appendChild(dropdown);
			isOpen = true;
			activeCloser = closeDropdown;

			// Only comments that really are longer than the limit get the fade and the arrow.
			// (Needs the menu to be in the page so the heights can be measured.)
			commentTexts.forEach(({ text, contentCell }) => {
				if (text.scrollHeight <= text.clientHeight + 1) return;

				const FADE =
					"linear-gradient(to bottom, #000 calc(100% - 2em), transparent)";
				const setFade = (on) => {
					text.style.webkitMaskImage = on ? FADE : "none";
					text.style.maskImage = on ? FADE : "none";
				};
				setFade(true);

				const toggle = document.createElement("div");
				toggle.textContent = "▾";
				toggle.setAttribute("role", "button");
				toggle.setAttribute("aria-expanded", "false");
				toggle.style.cursor = "pointer";
				toggle.style.textAlign = "center";
				toggle.style.lineHeight = "1";
				toggle.style.padding = "4px 0 2px";
				toggle.style.opacity = "0.7";
				toggle.addEventListener("click", () => {
					const expanded = toggle.getAttribute("aria-expanded") === "true";
					text.style.maxHeight = expanded ? clampedHeight : "none";
					setFade(expanded);
					toggle.textContent = expanded ? "▾" : "▴";
					toggle.setAttribute("aria-expanded", String(!expanded));
				});
				contentCell.appendChild(toggle);
			});

			// open under the button, but keep the whole menu inside the window
			const rect = box.getBoundingClientRect();
			const maxLeft =
				document.documentElement.clientWidth - dropdown.offsetWidth - 8;
			dropdown.style.top = rect.bottom + window.scrollY + 4 + "px";
			dropdown.style.left =
				Math.max(8, Math.min(rect.left, maxLeft)) + window.scrollX + "px";

			requestAnimationFrame(() => {
				dropdown.style.transform = "translateY(0)";
				dropdown.style.opacity = "1";
			});

			const currentDropdown = dropdown;
			function onClickOutside(ev) {
				if (
					!wrapper.contains(ev.target) &&
					!currentDropdown.contains(ev.target)
				) {
					closeDropdown();
					document.removeEventListener("click", onClickOutside);
				}
			}
			document.addEventListener("click", onClickOutside);
		});

		return wrapper;
	}

	function createSubscriptionsBox(label, subEntries) {
		const entries = (subEntries || []).filter(
			(e) => e.avatarSrc || e.channelName,
		);
		if (!label || entries.length === 0) return null;

		const wrapper = document.createElement("div");
		wrapper.style.position = "relative";
		wrapper.style.width = "fit-content";

		const box = document.createElement("div");
		box.className = "yt-enhanced-info-item";
		box.textContent = "🔔 " + label;
		styleInfoBox(box);
		box.style.cursor = "pointer";
		wrapper.appendChild(box);

		let dropdown = null;
		let isOpen = false;

		function closeDropdown() {
			if (dropdown) {
				dropdown.style.transform = "translateY(-10px)";
				dropdown.style.opacity = "0";
				setTimeout(() => {
					if (dropdown) {
						dropdown.remove();
						dropdown = null;
					}
				}, 300);
			}
			isOpen = false;
			if (activeCloser === closeDropdown) activeCloser = null;
		}

		box.addEventListener("click", (e) => {
			e.stopPropagation();

			if (isOpen && dropdown) {
				closeDropdown();
				return;
			}
			if (activeCloser) activeCloser();

			// Grid of round avatars with the channel name centered underneath.
			// Names wrap onto as many lines as they need: no "..." and no cut-off.
			dropdown = document.createElement("div");
			dropdown.style.position = "absolute";
			dropdown.style.background = GENERAL_BACKGROUND;
			dropdown.style.color = TEXT_COLOR;
			dropdown.style.border = BORDER_STYLE;
			dropdown.style.borderRadius = BORDER_RADIUS;
			dropdown.style.boxShadow = BOX_SHADOW;
			dropdown.style.zIndex = POPUP_ZINDEX;
			dropdown.style.display = "grid";
			dropdown.style.gridTemplateColumns =
				"repeat(" +
				Math.min(SUB_COLUMNS, entries.length) +
				", " +
				SUB_CELL_WIDTH +
				")";
			dropdown.style.gap = "12px 8px";
			dropdown.style.alignItems = "start";
			dropdown.style.padding = "12px";
			dropdown.style.maxHeight = "320px";
			dropdown.style.overflowY = "auto";
			applyAnimationStyles(dropdown);

			entries.forEach((entry) => {
				const cell = document.createElement("div");
				cell.style.display = "flex";
				cell.style.flexDirection = "column";
				cell.style.alignItems = "center";
				cell.style.gap = "6px";
				cell.style.minWidth = "0";

				const size = SUB_AVATAR_SIZE + "px";
				let avatar;
				if (entry.avatarSrc) {
					avatar = document.createElement("img");
					avatar.src = entry.avatarSrc;
					avatar.alt = entry.channelName || "";
					avatar.style.objectFit = "cover";
				} else {
					avatar = document.createElement("div");
					avatar.style.background = "rgba(128,128,128,0.2)";
				}
				avatar.style.width = size;
				avatar.style.height = size;
				avatar.style.borderRadius = "50%";
				avatar.style.flex = "none";
				cell.appendChild(avatar);

				if (entry.channelName) {
					const name = document.createElement("div");
					name.textContent = entry.channelName;
					name.style.fontSize = SMALL_FONT_SIZE;
					name.style.lineHeight = "1.25";
					name.style.textAlign = "center";
					name.style.maxWidth = "100%";
					name.style.whiteSpace = "normal";
					name.style.overflowWrap = "anywhere";
					name.style.wordBreak = "break-word";
					cell.appendChild(name);
				}

				dropdown.appendChild(cell);
			});

			document.body.appendChild(dropdown);
			isOpen = true;
			activeCloser = closeDropdown;

			// open under the button, but keep the whole grid inside the window
			const rect = box.getBoundingClientRect();
			const maxLeft =
				document.documentElement.clientWidth - dropdown.offsetWidth - 8;
			dropdown.style.top = rect.bottom + window.scrollY + 4 + "px";
			dropdown.style.left =
				Math.max(8, Math.min(rect.left, maxLeft)) + window.scrollX + "px";

			requestAnimationFrame(() => {
				dropdown.style.transform = "translateY(0)";
				dropdown.style.opacity = "1";
			});

			const currentDropdown = dropdown;
			function onClickOutside(ev) {
				if (
					!wrapper.contains(ev.target) &&
					!currentDropdown.contains(ev.target)
				) {
					closeDropdown();
					document.removeEventListener("click", onClickOutside);
				}
			}
			document.addEventListener("click", onClickOutside);
		});

		return wrapper;
	}

	// DATA LAYER //
	// youtubei.js (runs in YouTube's own JS world) collects the profile card tokens from
	// the comment data and performs the get_profile_card requests. This script only asks it
	// for cards (via window.postMessage) and renders the result.
	const NS = "ytpci";
	const post = (msg) => window.postMessage({ ns: NS, ...msg }, location.origin);
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	const byHandle = new Map(); // "@handle" (lowercase) -> info
	const byChannelId = new Map(); // "UC..." -> info
	const queued = new Set(); // channel ids already requested or waiting
	const waiters = new Map(); // channel id -> resolve function of the in-flight request
	let pending = [];
	let pumping = false;
	let halted = false;
	let failures = 0;
	let requestCount = 0;
	let generation = 0; // bumped on every page navigation so late responses are ignored

	// plain string, or { content: "..." } text object
	function txt(v) {
		if (typeof v === "string") return v.trim() || null;
		if (v && typeof v.content === "string") return v.content.trim() || null;
		return null;
	}

	function httpsUrl(u) {
		return typeof u === "string" && u.startsWith("https://") ? u : null;
	}

	// smallest image that is at least minWidth wide (sharp on high-DPI screens), else the largest
	function pickImage(sources, minWidth) {
		const list = (sources || []).filter((x) => httpsUrl(x?.url));
		if (!list.length) return null;
		const big = list
			.filter((x) => (x.width || 0) >= minWidth)
			.sort((a, b) => a.width - b.width)[0];
		return (big || list.sort((a, b) => (b.width || 0) - (a.width || 0))[0]).url;
	}

	// Turn a get_profile_card response into the object the UI helpers expect.
	// Paths verified against real responses:
	//   profileCard.profileCardViewModel.profileIdentityInfo.profileIdentityInfoViewModel
	//   profileCard.profileCardViewModel.profileInfo.profileInfoViewModel
	function parseProfileCard(json) {
		const card = json?.profileCard?.profileCardViewModel;
		const identity = card?.profileIdentityInfo?.profileIdentityInfoViewModel;
		if (!identity) return null;
		const body = card?.profileInfo?.profileInfoViewModel || {};
		const wide = body.profileBadgeInfoChannelWide || {};

		const info = {
			userName: txt(identity.channelHandle),
			displayName: txt(identity.channelDisplayName),
			commentsCount: txt(wide.commentBadge?.commentDesc),
			// Confirmed on a real response (e.g. "16 received"); only present for commenters who have hearts
			heartsReceived: txt(wide.commentBadge?.blackHeartDesc),
			pronouns: txt(identity.channelPronouns), // optional, e.g. "he/him"
			badges: [],
			recentCommentsLabel: txt(body.commentsInteractionTitle),
			recentComments: [],
			subscriptionsLabel: txt(body.sharedSubscriptionsTitle),
			subscriptions: [],
		};

		for (const b of wide.badges || []) {
			const title = txt(b?.badgeDesc);
			if (title) {
				info.badges.push({
					title,
					subtitle: txt(b.badgeSubtitle),
					icon: httpsUrl(b.badgeIconUrl),
				});
			}
		}

		for (const c of body.comments || []) {
			const v = c?.commentInteractionViewModel;
			const videoTitle = txt(v?.videoTitle);
			const commentContent = txt(v?.commentContent);
			if (videoTitle || commentContent)
				info.recentComments.push({ videoTitle, commentContent });
		}

		for (const s of body.sharedSubscriptions || []) {
			const v = s?.sharedSubscriptionViewModel;
			const channelName = txt(v?.channelName);
			const avatarSrc = pickImage(
				v?.avatar?.avatarViewModel?.image?.sources,
				SUB_AVATAR_SIZE * 2,
			);
			if (channelName || avatarSrc)
				info.subscriptions.push({ avatarSrc, channelName });
		}

		return info;
	}

	function requestCard(channelId) {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				waiters.delete(channelId);
				resolve({ ok: false, status: 0, reason: "timeout" });
			}, REQUEST_TIMEOUT);
			waiters.set(channelId, (msg) => {
				clearTimeout(timer);
				waiters.delete(channelId);
				resolve(msg);
			});
			post({ type: "fetch", channelId });
		});
	}

	// One request at a time, with a delay between them
	async function pump() {
		if (pumping) return;
		pumping = true;
		try {
			while (pending.length && !halted && requestCount < MAX_REQUESTS) {
				const gen = generation;
				const channelId = pending.shift();
				requestCount++;
				const res = await requestCard(channelId);
				if (gen === generation) {
					const info = res.ok ? parseProfileCard(res.card) : null;
					if (info) {
						failures = 0;
						info.channelId = channelId;
						byChannelId.set(channelId, info);
						if (info.userName) byHandle.set(info.userName.toLowerCase(), info);
						renderAll();
					} else if (++failures >= MAX_FAILURES) {
						halted = true;
						console.warn(
							"[WIP] YouTube Profile Card Info: paused after repeated failures",
							res.status,
							res.reason || "",
						);
					}
				}
				await sleep(REQUEST_DELAY + Math.random() * REQUEST_JITTER);
			}
		} finally {
			pumping = false;
		}
	}

	window.addEventListener("message", (e) => {
		if (e.source !== window || e.origin !== location.origin) return;
		const m = e.data;
		if (!m || m.ns !== NS) return;
		if (m.type === "pairs" && Array.isArray(m.channelIds)) {
			for (const id of m.channelIds) {
				if (typeof id === "string" && !queued.has(id) && !byChannelId.has(id)) {
					queued.add(id);
					pending.push(id);
				}
			}
			pump();
		} else if (m.type === "card") {
			const resolve = waiters.get(m.channelId);
			if (resolve) resolve(m);
		}
	});

	// Profile card stats are per video/channel, so start fresh on every navigation
	document.addEventListener("yt-navigate-start", () => {
		generation++;
		pending = [];
		queued.clear();
		byHandle.clear();
		byChannelId.clear();
	});

	// Find the cached info that belongs to a comment element.
	// The author link is /@handle (or /channel/UC... for channels without a handle).
	function infoForComment(comment) {
		const link = comment.querySelector("a#author-text");
		if (!link) return null;
		let segment = null;
		const href = link.getAttribute("href");
		if (href) {
			try {
				segment = decodeURIComponent(href.split("?")[0])
					.split("/")
					.filter(Boolean)
					.pop();
			} catch (e) {
				segment = null;
			}
		}
		return (
			(segment &&
				(byChannelId.get(segment) || byHandle.get(segment.toLowerCase()))) ||
			byHandle.get(link.textContent.trim().toLowerCase()) ||
			null
		);
	}

	// COMMENT PROCESSING //
	function renderProfileInfo(commentElement, profileInfo) {
		if (commentElement.querySelector(".yt-profile-info")) return true;

		const authorElement = commentElement.querySelector(
			"div#header-author, .author",
		);
		if (!authorElement) return false;

		const infoContainer = document.createElement("div");
		infoContainer.className = "yt-profile-info";
		infoContainer.style.display = "flex";
		infoContainer.style.flexWrap = "wrap";
		infoContainer.style.gap = "8px";
		infoContainer.style.marginTop = "4px";
		infoContainer.style.marginBottom = "4px";
		infoContainer.style.width = "100%";
		infoContainer.style.maxWidth = "800px";
		authorElement.parentNode.insertBefore(
			infoContainer,
			authorElement.nextSibling,
		);

		try {
			// left column: comments count, hearts received, pronouns
			const leftColumn = document.createElement("div");
			leftColumn.style.display = "flex";
			leftColumn.style.flexDirection = "column";
			leftColumn.style.gap = COLUMN_GAP_SM;

			// middle column: badges
			const middleColumn = document.createElement("div");
			middleColumn.style.display = "flex";
			middleColumn.style.flexDirection = "column";
			middleColumn.style.gap = "8px";

			// right column: recent comments, subscriptions
			const rightColumn = document.createElement("div");
			rightColumn.style.display = "flex";
			rightColumn.style.flexDirection = "column";
			rightColumn.style.gap = COLUMN_GAP_SM;

			if (profileInfo.commentsCount) {
				const commentsBox = createInfoBox("💬", profileInfo.commentsCount);
				if (commentsBox) leftColumn.appendChild(commentsBox);
			}
			if (profileInfo.heartsReceived) {
				const heartsBox = createInfoBox("❤️", profileInfo.heartsReceived);
				if (heartsBox) leftColumn.appendChild(heartsBox);
			}
			if (profileInfo.pronouns) {
				const pronounsBox = createInfoBox("👤", profileInfo.pronouns);
				if (pronounsBox) leftColumn.appendChild(pronounsBox);
			}

			if (profileInfo.badges.length > 0) {
				profileInfo.badges.forEach((badge) => {
					const badgeIcon = badge.icon
						? `<img src="${badge.icon}" style="height:${ICON_SIZE};width:${ICON_SIZE};vertical-align:middle;">`
						: "";
					const badgeBox = createBadgeBox(
						badgeIcon,
						badge.title,
						badge.subtitle,
					);
					if (badgeBox) middleColumn.appendChild(badgeBox);
				});
			}

			if (
				profileInfo.recentCommentsLabel &&
				profileInfo.recentComments.length > 0
			) {
				const recentCommentsBox = createRecentCommentsBox(
					profileInfo.recentCommentsLabel,
					profileInfo.recentComments,
				);
				if (recentCommentsBox) rightColumn.appendChild(recentCommentsBox);
			}
			if (
				profileInfo.subscriptionsLabel &&
				profileInfo.subscriptions.length > 0
			) {
				const subscriptionsBox = createSubscriptionsBox(
					profileInfo.subscriptionsLabel,
					profileInfo.subscriptions,
				);
				if (subscriptionsBox) rightColumn.appendChild(subscriptionsBox);
			}

			if (leftColumn.children.length > 0) infoContainer.appendChild(leftColumn);
			if (middleColumn.children.length > 0)
				infoContainer.appendChild(middleColumn);
			if (rightColumn.children.length > 0)
				infoContainer.appendChild(rightColumn);

			if (infoContainer.children.length === 0) {
				debugLog(
					"[WIP] YouTube Profile Card Info: No info to display, removing container",
				);
				infoContainer.remove();
			} else {
				infoContainer.style.opacity = "0";
				infoContainer.style.transform = `translateY(-${ANIMATION_OFFSET}px)`;
				setTimeout(() => {
					infoContainer.style.transition = `transform ${ANIMATION_DURATION}s ease, opacity ${ANIMATION_DURATION}s ease`;
					infoContainer.style.transform = "translateY(0)";
					infoContainer.style.opacity = "1";
					debugLog(
						"[WIP] YouTube Profile Card Info: Info container animated in",
					);
				}, ANIMATION_DELAY);
			}
		} catch (error) {
			debugLog(
				"[WIP] YouTube Profile Card Info: Error adding profile info",
				error,
			);
			infoContainer.remove();
		}
		return true;
	}

	function tryRender(comment) {
		if (comment.dataset.ytpciDone === "true") return;
		if (comment.querySelector(".yt-profile-info")) {
			comment.dataset.ytpciDone = "true";
			return;
		}
		const info = infoForComment(comment);
		if (info && renderProfileInfo(comment, info))
			comment.dataset.ytpciDone = "true";
	}

	function renderAll() {
		document.querySelectorAll("ytd-comment-view-model").forEach(tryRender);
	}

	// OBSERVERS & INIT //
	const commentObserver = new MutationObserver((mutationsList) => {
		for (const mutation of mutationsList) {
			mutation.addedNodes.forEach((node) => {
				if (node.nodeType !== 1) return;
				if (node.tagName === "YTD-COMMENT-VIEW-MODEL") {
					tryRender(node);
				} else if (node.querySelectorAll) {
					node.querySelectorAll("ytd-comment-view-model").forEach(tryRender);
				}
			});
		}
	});

	function initialize() {
		debugLog("[WIP] YouTube Profile Card Info: Initializing");
		post({ type: "sync" }); // ask youtubei.js to replay tokens it collected before we loaded
		renderAll();
		commentObserver.observe(document.body, { childList: true, subtree: true });
		setInterval(renderAll, RENDER_INTERVAL);
	}

	if (document.readyState === "complete") {
		initialize();
	} else {
		window.addEventListener("load", initialize);
	}
})();
