const fs = require("fs")
const path = require("path")
const vm = require("vm")

const args = Object.fromEntries(process.argv.slice(2).map(a => {
	let [k, v] = a.replace(/^--/, "").split("=")
	return [k, v === undefined ? true : v]
}))
const ROUTE = args.path || "o"
const MAX_HOURS = Number(args.hours || 12)
const DT = Number(args.dt || 2)

const root = path.join(__dirname, "..")
const noop = () => {}
const sandbox = {
	console,
	setInterval: noop, clearInterval: noop, setTimeout: noop, alert: msg => { throw new Error("alert: " + msg) },
	localStorage: {getItem: () => null, setItem: noop},
	Vue: {set(obj, key, val) { obj[key] = val }, component: noop},
	document: {
		title: "", getElementById: () => null, addEventListener: noop, createElement: () => ({setAttribute: noop}),
		head: {insertBefore: noop}, readyState: "loading", body: null,
	},
	addEventListener: noop, innerWidth: 1600, innerHeight: 900, atob: noop, btoa: noop,
	getComputedStyle: () => ({}), requestAnimationFrame: noop,
}
sandbox.window = sandbox
vm.createContext(sandbox)

for (const file of ["technical/break_eternity.js", "technical/layerSupport.js", "glitchText.js", "mod.js", "technical/temp.js",
	"technical/displays.js", "game.js", "utils.js", "utils/easyAccess.js", "technical/particleSystem.js", "utils/NumberFormating.js",
	"utils/options.js", "utils/save.js", "utils/themes.js", "layers.js", "tree.js"]) {
	vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), sandbox, {filename: file})
}

const bot = `
var __log = []
var __marks = {}
function __mark(name) {
	if (__marks[name]) return
	__marks[name] = player.timePlayed
	__log.push([player.timePlayed, name, format(player.points)])
}

function __afford(lid) {
	for (let rounds = 0; rounds < 3; rounds++) {
		autoRepair(lid)
		for (let id in layers[lid].upgrades) {
			if (isPlainObject(layers[lid].upgrades[id]) && layers[lid].upgrades[id].repairCost !== undefined && tmp[lid].upgrades[id].unlocked && isRepaired(lid, id) && !hasUpgrade(lid, id))
				buyUpg(lid, id)
		}
	}
}

function __reset(lid, ratio, wait) {
	if (!tmp[lid].canReset) return false
	if (tmp[lid].type === "normal") {
		if (tmp[lid].passiveGeneration > 0) return false
		if (player[lid].resetTime < wait && player[lid].points.gt(0)) return false
		if (tmp[lid].resetGain.lt(player[lid].points.mul(ratio))) return false
	}
	if (tmp[lid].resetsNothing || tmp[lid].autoPrestige) return false
	doReset(lid)
	return true
}

var __trial = null
var __trialStart = 0
function __trials() {
	for (let lid of ["o", "c"]) {
		if (!player[lid].unlocked) continue
		let active = player[lid].activeChallenge
		if (active) {
			if (canCompleteChallenge(lid, active)) {
				startChallenge(lid, active)
				__mark("trial " + lid + active)
				__trial = null
			} else if (player.timePlayed - __trialStart > 1500) {
				startChallenge(lid, active)
				__trial = null
				__cool[lid + active] = player.timePlayed + 1200
			}
			return true
		}
	}
	for (let lid of ["o", "c"]) {
		if (!player[lid].unlocked || !onPath(lid)) continue
		for (let id of [11, 12, 21, 22]) {
			if (player[lid].challenges[id] > 0) continue
			if (__cool[lid + id] && player.timePlayed < __cool[lid + id]) continue
			let goal = tmp[lid].challenges[id].goal
			if (player.points.gte(goal.pow(1.05))) {
				startChallenge(lid, id)
				__trialStart = player.timePlayed
				return true
			}
		}
	}
	return false
}
var __cool = {}

function __bot() {
	if (__trials()) {
	}
	for (let lid of MEND_LAYERS) if (player[lid].unlocked) __afford(lid)

	if (hasUpgrade("s", 11) && tmp.s.clickables[11].canClick && player.d.entropy > 25) layers.s.clickables[11].onClick()

	for (let id of [13, 12, 11, 21]) if (player.m.unlocked && tmp.m.buyables[id].unlocked) for (let i = 0; i < 4; i++) { updateBuyableTemp("m"); if (tmp.m.buyables[id].canBuy) layers.m.buyables[id].buy() }
	for (let id of [11, 12]) if (player.t.unlocked) { updateBuyableTemp("t"); if (tmp.t.buyables[id].canBuy) layers.t.buyables[id].buy() }
	for (let id of [11, 12, 13, 14]) if (player.l.unlocked && tmp.l.buyables[id].unlocked) { updateBuyableTemp("l"); if (tmp.l.buyables[id].canBuy) layers.l.buyables[id].buy() }
	for (let i = 0; i < 3; i++) for (let id of [11, 12, 13]) if (onPath("o") && player.o.unlocked) { updateBuyableTemp("o"); if (tmp.o.buyables[id].canBuy) layers.o.buyables[id].buy() }
	for (let id of ROOM_ORDER) { updateBuyableTemp("h"); if (tmp.h.buyables[id].unlocked && tmp.h.buyables[id].canBuy) { layers.h.buyables[id].buy(); __mark("room " + roomsBuilt()) } }
	for (let id of VERSES) { updateBuyableTemp("n"); if (tmp.n.buyables[id].unlocked && tmp.n.buyables[id].canBuy) { layers.n.buyables[id].buy(); __mark("verse " + verseCount()) } }
	if (player.v.unlocked) {
		if (tmp.v.canReset && player.v.stillness > 900) doReset("v")
		if (player.v.total.gt(0)) __mark("Hush")
	}
	for (let id of SEAT_IDS) { updateBuyableTemp("core"); if (tmp.core.buyables[id].unlocked && tmp.core.buyables[id].canBuy) layers.core.buyables[id].buy() }

	if (hasUpgrade("c", 14) && tmp.c.clickables[11].canClick && player.c.surge > surgePeak() * 0.3) layers.c.clickables[11].onClick()

	if (player.d.reconciled) __mark("reconciled")

	if (player.l.unlocked || tmp.l.canReset) __reset("l", 0.25, 120)
	if (__route === "o" || player.d.reconciled) __reset("o", 0, 0)
	if (__route === "c" || player.d.reconciled) __reset("c", 0.5, 45)
	__reset("m", 0.5, 25)
	__reset("t", 0.5, 25)
	__reset("s", 0, 0)
	__reset("f", 0.5, 8)

	if (player.f.unlocked) __mark("Fragments")
	if (player.s.unlocked) __mark("Stabilizers")
	if (player.m.unlocked) __mark("Matter")
	if (player.t.unlocked) __mark("Time")
	if (player.o.unlocked) __mark("Order")
	if (player.c.unlocked) __mark("Chaos")
	if (player.l.unlocked) __mark("Laws")
	for (let id of [11, 12, 13, 14]) if (lawDone(id)) __mark("law " + id)
	for (let n of [1, 3, 6, 9, 12, 15, 18, 21, 24, 27]) if (seatsFilled() >= n) __mark("seats " + n)
}

function __start(route) {
	options = getStartOptions()
	player = getStartPlayer()
	player.d.introStep = 0
	updateLayers()
	setupModInfo()
	setupTemp()
	updateTemp()
	updateTemp()
	colors_theme = colors.default
	__route = route
}
var __route

var __since = 0
function __step(dt) {
	updateTemp()
	gameLoop(dt)
	__since += dt
	if (__since >= 5 || player.timePlayed < 600) {
		__since = 0
		__bot()
	}
}

function __nanCheck() {
	let bad = []
	;(function walk(o, name) {
		for (let k in o) {
			let v = o[k]
			if (v instanceof Decimal) { if (v.sign !== v.sign || v.mag !== v.mag || v.layer !== v.layer) bad.push(name + "." + k) }
			else if (typeof v === "number") { if (v !== v) bad.push(name + "." + k) }
			else if (v && typeof v === "object") walk(v, name + "." + k)
		}
	})(player, "player")
	return bad
}

function __status() {
	return "dust " + format(player.points) + " | F " + format(player.f.points) + " | S " + format(player.s.points) + " | M " + format(player.m.points) + " | T " + format(player.t.points)
		+ " | O " + format(player.o.points) + " | C " + format(player.c.points) + " | L " + format(player.l.points) + " | seats " + seatsFilled() + " | E " + player.d.entropy.toFixed(1) + " | flow " + timeFlow().toFixed(2) + " | repairs " + totalRepairs()
}
`
vm.runInContext(bot, sandbox, {filename: "bot"})
const run = code => vm.runInContext(code, sandbox)

run(`__start(${JSON.stringify(ROUTE)})`)
const fmt = s => { const m = Math.floor(s / 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m` }
const steps = MAX_HOURS * 3600 / DT
let printed = 0
const t0 = Date.now()
const step = vm.runInContext(`(function(dt){__step(dt)})`, sandbox)
let lastStatus = 0
let finished = false
for (let i = 0; i < steps; i++) {
	step(DT)
	if (i % 900 === 0) {
		const bad = run("__nanCheck()")
		if (bad.length) { console.log("NaN at", i, bad); break }
	}
	const log = run("__log")
	while (printed < log.length) {
		const [time, name, dust] = log[printed++]
		console.log(fmt(time).padEnd(7), name.padEnd(16), "dust", dust)
	}
	if (args.verbose && i - lastStatus >= 900 / DT) {
		lastStatus = i
		console.log("   ", fmt(i * DT), run("__status()"))
	}
	if (run("seatsFilled() >= TOTAL_SEATS")) { finished = true; break }
}
console.log(finished ? "FINISHED at " + fmt(run("player.timePlayed")) : "NOT finished after " + MAX_HOURS + "h")
console.log(run("__status()"))
console.log("sim took", ((Date.now() - t0) / 1000).toFixed(1) + "s")
