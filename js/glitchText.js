const GlitchText = (function () {
	const GLYPHS = "█▓▒░∆∑≠※⌀⊘⌇⍉⍜⟊⧖⧗∴∵≋".split("")
	const FRAME_MS = 45
	const SCHEDULE_MS = 120
	const WAKE_FROM = 0.6

	const GAP_MIN_MS = 7000
	const GAP_RANDOM_MS = 9000
	const WAKE_GAP_MS = 25000
	const RARE_GAP_MIN_MS = 45000
	const RARE_GAP_RANDOM_MS = 75000

	const segments = new Map()
	const htmlCache = new Map()
	const active = new Set()

	let clarity = 0
	let entropy = 0
	let context = {route: null, reconciled: false}
	let stabilized = false
	let catchHandler = null
	let lastSchedule = 0
	let lastWake = 0
	let quietUntil = 0
	let rareUntil = 0
	let lastReduced = null
	let started = false

	const reducedMotionQuery = (typeof window !== "undefined" && window.matchMedia) ? window.matchMedia("(prefers-reduced-motion: reduce)") : null

	function reduced() {
		if (typeof options !== "undefined" && options && options.reduceTextEffects) return true
		return !!(reducedMotionQuery && reducedMotionQuery.matches)
	}

	function hash(str) {
		let h = 5381
		for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0
		return h.toString(36)
	}

	function parseVariant(raw) {
		let v = {text: raw, isTrue: false, route: null}
		let tag = /^@([ocb]):/.exec(v.text)
		if (tag) {
			v.route = tag[1]
			v.text = v.text.slice(tag[0].length)
		}
		if (v.text.charAt(0) === "!") {
			v.isTrue = true
			v.text = v.text.slice(1)
		}
		return v
	}

	function resolveLock(locked, segIndex) {
		if (Array.isArray(locked)) return resolveLock(locked[segIndex], 0)
		if (locked === undefined || locked === null || locked === false) return null
		return locked === true ? 0 : locked
	}

	function lockTarget(seg, lock) {
		if (typeof lock === "string") return seg.all.find(v => v.text === lock) || seg.all[0]
		return seg.all[lock] || seg.all[0]
	}

	function routeAllows(v) {
		if (!v.route) return true
		if (v.route === "b") return context.reconciled
		return context.reconciled || context.route === v.route
	}

	function pool(seg) {
		let tier = seg.tiers[Math.min(seg.tiers.length - 1, Math.floor(clarity * seg.tiers.length))]
		let usable = tier.filter(routeAllows)
		return usable.length ? usable : seg.all.slice(0, 1)
	}

	function pickNext(seg) {
		let choices = pool(seg).filter(v => v.text !== seg.current.text)
		if (!choices.length) return null
		return choices[Math.floor(Math.random() * choices.length)]
	}

	function holdLength(seg) {
		let stretch = 1 + clarity * clarity * 7
		return (seg.hold + Math.random() * seg.offset) * stretch
	}

	function register(id, body, opts, segIndex) {
		let seg = segments.get(id)
		let lock = resolveLock(opts.locked, segIndex)
		if (stabilized && lock === null) lock = 0
		if (!seg) {
			let tiers = body.split("~").map(tier => tier.split("|").map(parseVariant))
			let all = [].concat.apply([], tiers)
			seg = {
				id, tiers, all,
				hold: opts.hold === undefined ? 20000 : opts.hold,
				glitch: opts.glitch === undefined ? 650 : opts.glitch,
				offset: opts.offset === undefined ? 40000 : opts.offset,
				rare: !!opts.rare,
				eager: !!opts.eager,
				wake: !!opts.wake,
				settleAfter: opts.settleAfter,
				settleTo: opts.settleTo,
				current: all[0],
				display: all[0].text,
				phase: "hold",
				from: "", to: "",
				startedAt: 0, lastFrame: 0,
				returnTo: null, wakeUntil: 0,
				nextAt: 0, bornAt: 0,
				lock: null,
				els: new Set(),
			}
			if (lock !== null) {
				seg.lock = lock
				seg.current = lockTarget(seg, lock)
				seg.display = seg.current.text
				seg.phase = "locked"
			} else {
				let p = pool(seg)
				seg.current = p[Math.floor(Math.random() * p.length)]
				seg.display = seg.current.text
			}
			segments.set(id, seg)
		} else if (lock !== seg.lock) {
			setLock(seg, lock)
		}
		return seg
	}

	function setLock(seg, lock) {
		seg.lock = lock
		if (lock === null) {
			if (seg.phase === "locked") {
				seg.phase = "hold"
				seg.nextAt = now() + 400 + Math.random() * 1200
				applyClasses(seg)
			}
			return
		}
		let target = lockTarget(seg, lock)
		seg.returnTo = null
		if (reduced() || seg.els.size === 0) {
			seg.current = target
			seg.display = target.text
			seg.phase = "locked"
			active.delete(seg)
			writeText(seg)
			applyClasses(seg)
			return
		}
		beginGlitch(seg, target, true)
	}

	function now() {
		return (typeof performance !== "undefined") ? performance.now() : Date.now()
	}

	function beginGlitch(seg, target, settling) {
		seg.from = seg.display
		seg.to = target.text
		seg.target = target
		seg.settling = !!settling
		seg.phase = "glitch"
		seg.startedAt = now()
		seg.lastFrame = 0
		active.add(seg)
		applyClasses(seg)
	}

	function ease(t) {
		return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
	}

	function scramble(seg, p) {
		let length = Math.round(seg.from.length + (seg.to.length - seg.from.length) * ease(p))
		let resolved = Math.floor(Math.max(0, (p - 0.3) / 0.7) * seg.to.length)
		let out = ""
		for (let i = 0; i < length; i++) {
			if (i < resolved) out += seg.to.charAt(i)
			else if (seg.to.charAt(i) === " " && p > 0.5) out += " "
			else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
		}
		return out
	}

	function writeText(seg) {
		seg.els.forEach(el => {
			if (!el.firstChild) el.appendChild(document.createTextNode(seg.display))
			else if (el.firstChild.nodeValue !== seg.display) el.firstChild.nodeValue = seg.display
		})
	}

	function applyClasses(seg) {
		let isReduced = reduced()
		let locked = seg.phase === "locked"
		let title = ""
		if (isReduced && !locked) title = "Could also read: " + [...new Set(seg.all.filter(v => v.text !== seg.current.text && routeAllows(v)).map(v => v.text))].join(" / ")
		seg.els.forEach(el => {
			el.classList.toggle("gs-glitching", seg.phase === "glitch")
			el.classList.toggle("gs-locked", locked)
			el.classList.toggle("gs-true", seg.phase !== "glitch" && seg.current.isTrue)
			el.classList.toggle("gs-static", isReduced && !locked)
			if (title) el.setAttribute("title", title)
			else el.removeAttribute("title")
		})
	}

	function finishGlitch(seg) {
		seg.current = seg.target
		seg.display = seg.to
		writeText(seg)
		active.delete(seg)
		if (seg.settling && seg.lock !== null) {
			seg.phase = "locked"
			seg.els.forEach(el => {
				el.classList.remove("gs-settle")
				void el.offsetWidth
				el.classList.add("gs-settle")
			})
		} else {
			seg.phase = "hold"
			seg.nextAt = seg.returnTo ? seg.wakeUntil : now() + holdLength(seg)
		}
		applyClasses(seg)
	}

	function attach(el) {
		let seg = segments.get(el.getAttribute("data-gs"))
		if (!seg) return
		seg.els.add(el)
		if (!el.firstChild) el.appendChild(document.createTextNode(seg.display))
		else el.firstChild.nodeValue = seg.display
		if (seg.settleAfter !== undefined && !seg.bornAt) seg.bornAt = now()
		if (seg.nextAt === 0 && seg.phase === "hold") seg.nextAt = now() + Math.random() * (seg.hold + seg.offset)
		applyClasses(seg)
	}

	function scan(root) {
		if (root.nodeType !== 1) return
		if (root.hasAttribute("data-gs")) attach(root)
		root.querySelectorAll("[data-gs]").forEach(attach)
	}

	function wakeOne(t) {
		if (entropy < WAKE_FROM || stabilized || reduced()) return
		if (t - lastWake < WAKE_GAP_MS) return
		lastWake = t
		if (Math.random() > (entropy - WAKE_FROM) / (1 - WAKE_FROM) * 0.5 + 0.1) return
		let candidates = []
		segments.forEach(seg => {
			if (seg.phase === "locked" && seg.wake && seg.els.size && seg.all.length > 1) candidates.push(seg)
		})
		if (!candidates.length) return
		let seg = candidates[Math.floor(Math.random() * candidates.length)]
		let alts = seg.all.filter(v => v.text !== seg.current.text)
		seg.returnTo = seg.current
		seg.wakeUntil = t + 1300
		beginGlitch(seg, alts[Math.floor(Math.random() * alts.length)], false)
	}

	function schedule(t) {
		let isReduced = reduced()
		if (isReduced !== lastReduced) {
			lastReduced = isReduced
			segments.forEach(seg => {
				if (isReduced && (seg.phase === "glitch" || seg.returnTo)) {
					if (seg.returnTo) seg.current = seg.returnTo
					else if (seg.settling) seg.current = seg.target
					seg.display = seg.current.text
					seg.phase = seg.lock !== null ? "locked" : "hold"
					seg.returnTo = null
					active.delete(seg)
					writeText(seg)
				}
				applyClasses(seg)
			})
		}
		let due = []
		segments.forEach(seg => {
			if (seg.els.size === 0) return
			seg.els.forEach(el => { if (!el.isConnected) seg.els.delete(el) })
			if (seg.els.size === 0) return
			if (seg.settleAfter !== undefined && seg.lock === null && seg.bornAt && t - seg.bornAt >= seg.settleAfter) {
				setLock(seg, seg.settleTo === undefined ? 0 : seg.settleTo)
				return
			}
			if (seg.phase !== "hold" || isReduced || stabilized) return
			if (t < seg.nextAt) return
			if (seg.returnTo) {
				let back = seg.returnTo
				seg.returnTo = null
				beginGlitch(seg, back, true)
				return
			}
			if (seg.rare && t < rareUntil) return
			if (seg.eager) {
				let next = pickNext(seg)
				if (next) beginGlitch(seg, next, false)
				else seg.nextAt = t + holdLength(seg)
			} else due.push(seg)
		})
		if (due.length && active.size === 0 && t >= quietUntil) {
			let seg = due[Math.floor(Math.random() * due.length)]
			let next = pickNext(seg)
			if (next) {
				beginGlitch(seg, next, false)
				quietUntil = t + GAP_MIN_MS + Math.random() * GAP_RANDOM_MS
				if (seg.rare) rareUntil = t + RARE_GAP_MIN_MS + Math.random() * RARE_GAP_RANDOM_MS
			} else seg.nextAt = t + holdLength(seg)
		}
		wakeOne(t)
	}

	function frame() {
		let t = now()
		if (t - lastSchedule >= SCHEDULE_MS) {
			lastSchedule = t
			schedule(t)
		}
		active.forEach(seg => {
			let p = (t - seg.startedAt) / seg.glitch
			if (p >= 1) finishGlitch(seg)
			else if (t - seg.lastFrame >= FRAME_MS) {
				seg.lastFrame = t
				seg.display = scramble(seg, p)
				writeText(seg)
			}
		})
		window.requestAnimationFrame(frame)
	}

	function onClick(e) {
		if (!catchHandler || !e.target || !e.target.closest) return
		let el = e.target.closest("[data-gs]")
		if (!el) return
		let seg = segments.get(el.getAttribute("data-gs"))
		if (!seg || seg.phase === "glitch" || !seg.current.isTrue) return
		if (catchHandler(seg.current.text)) {
			el.classList.remove("gs-caught")
			void el.offsetWidth
			el.classList.add("gs-caught")
		}
	}

	function start() {
		if (started || typeof document === "undefined" || !document.body) return
		started = true
		new MutationObserver(records => {
			for (let r of records) r.addedNodes.forEach(scan)
		}).observe(document.body, {childList: true, subtree: true})
		scan(document.body)
		document.addEventListener("click", onClick)
		window.requestAnimationFrame(frame)
	}

	function render(text, opts) {
		opts = opts || {}
		let id = opts.id || "gs" + hash(text)
		let key = id + "\u0000" + text
		let entry = htmlCache.get(key)
		if (entry) {
			if (opts.locked !== undefined) {
				for (let i = 0; i < entry.segs.length; i++) {
					let lock = resolveLock(opts.locked, i)
					if (lock !== entry.segs[i].lock && !(stabilized && lock === null)) setLock(entry.segs[i], lock)
				}
			}
			return entry.html
		}
		let segs = []
		let html = text.replace(/\{([^{}]*)\}/g, (match, body) => {
			let segId = id + ":" + segs.length
			segs.push(register(segId, body, opts, segs.length))
			return '<span class="gs" data-gs="' + segId + '"></span>'
		})
		htmlCache.set(key, {html, segs})
		return html
	}

	function plain(text, index) {
		return text.replace(/\{([^{}]*)\}/g, (match, body) => {
			let vs = body.split("~")[0].split("|").map(parseVariant)
			return (vs[index || 0] || vs[0]).text
		})
	}

	return {
		render, plain, start,
		setClarity(c) { clarity = Math.min(Math.max(c, 0), 1) },
		setEntropy(e) { entropy = Math.min(Math.max(e, 0), 1) },
		setContext(c) { Object.assign(context, c) },
		stabilizeAll() {
			if (stabilized) return
			stabilized = true
			segments.forEach(seg => { if (seg.lock === null) setLock(seg, 0) })
		},
		onCatch(fn) { catchHandler = fn },
		get activeCount() { return active.size },
		get segmentCount() { return segments.size },
	}
})()

function glitchSwap(text, options) {
	return GlitchText.render(text, options)
}

if (typeof document !== "undefined") {
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", GlitchText.start)
	else GlitchText.start()
}
