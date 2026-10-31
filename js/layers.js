const D = x => new Decimal(x)

const BAL = {
	entropyTau: 150,
	entropyCap: 85,
	pressureBase: 14,
	pressurePerRepair: 1.25,
	pressureSoftener: 30,
	dustPenalty: 0.10,
	crackPenalty: 0.25,
	stabilizerMitigation: 5,

	resonanceK: {d: 1.5, f: 2, s: 1, m: 4, t: 4, o: 8, c: 8, l: 4, v: 2},

	fReq: 200,		fExp: 0.5,
	sReq: 2e3,		sBase: 5,		sExp: 1.2,
	mReq: 2e5,		mExp: 0.2,
	tReq: 1e22,		tExp: 0.05,
	oReq: 1e4,		oBase: 40,		oExp: 1.35,
	cReq: 500,		cExp: 0.5,
	lReq: "1e125",	lExp: 0.02,

	flowPerMainspring: 0.05,
	flowCap: 3,

	fEffect: 0.4, fEffectUp: 0.1, f21: 0.05, f31: 0.25, f32: 0.15,
	sEffectBase: 1.3, s12Base: 1.12,
	mEffect: 0.3, scaffoldExp: 1.3, hearthExp: 1.5, scaffoldRatio: 3, hearthRatio: 4, bulwarkRatio: 5,
	m11: 0.3, m21: 0.1, m23: 2, m24: 1,
	tEffect: 0.5, t11: 1, t12: 0.5, t21: 4, t22: 0.25, t23: 0.25,
	oEffect: 2.5, oEffectF: 1.5, o12: 1.5, o13: 3, o14: 0.5,
	cEffect: 0.65, cEffectF: 0.4,
	trialDust: 30,
	lEffect: 1, l13: 0.3, gravityMatter: 4,
	lawDust: {11: 30, 12: 100, 13: 1e3, 14: 1e5},
	seatDust: 10, seatOther: 1.25,

	trialGoals: {11: "1e55", 12: "1e70", 21: "1e85", 22: "1e105"},
	otherPathGoalMult: "1e70",

	seats: {
		11: {name: "Fragments", base: "1e200", ratio: "1e42"},
		12: {name: "Stabilizers", base: 130, ratio: 1.22, kept: true},
		13: {name: "Matter", base: "1e50", ratio: "1e12"},
		21: {name: "Moments", base: "1e21", ratio: "1e4"},
		22: {name: "Principles", base: 1e15, ratio: 100},
		23: {name: "both Paths", base: 1, ratio: 1},
		31: {name: "Notes", base: 5e10, ratio: 6},
		32: {name: "Rooms", list: [3, 5, 7], kept: true},
		33: {name: "Hush", base: 3e6, ratio: 3},
	},
}

function upgValue(layer, id) { return hasUpgrade(layer, id) ? upgradeEffect(layer, id) : decimalOne }
function buyableAmt(layer, id) { return player[layer].buyables[id] }
function inTrial(id) { return inChallenge("o", id) || inChallenge("c", id) }
function trialDone(layer, id) { return hasChallenge(layer, id) }
function pathChosen() { return player.d.path }
function onPath(route) { return player.d.path === route || player.d.reconciled }
function lawParts(id) { return player.l.buyables[id].toNumber() }
function lawDone(id) { return lawParts(id) >= 3 }
function lawsComplete() { return [11, 12, 13, 14].filter(lawDone).length }
function seatsFilled() {
	let n = 0
	for (let id of SEAT_IDS) n += player.core.buyables[id].toNumber()
	return n
}
const SEAT_IDS = [11, 12, 13, 21, 22, 23, 31, 32, 33]
const TOTAL_SEATS = 27

function autoBuy(layer, ids) {
	for (let id of ids) {
		let b = layers[layer].buyables[id]
		if (run(b.unlocked, b) && player[layer].buyables[id].lt(run(b.purchaseLimit, b)) && b.canAfford()) b.buy()
	}
}

function nodeRelevant(layer) {
	if (player[layer].unlocked) return true
	switch (layer) {
		case "f": return player.points.gte(50)
		case "s": return player.f.total.gte(10)
		case "m": return player.f.total.gte(BAL.mReq / 100)
		case "t": return player.points.gte(D(BAL.tReq).div(1e5))
		case "o":
		case "c": return player.m.unlocked && player.t.unlocked
		case "l": return !!player.d.path && player.points.gte(D(BAL.lReq).root(1.5))
		case "h": return player.m.unlocked
		case "n": return !!player.d.path
		case "v": return player.l.unlocked
	}
	return false
}

function treeSlot(layer, ...partners) {
	if (nodeRelevant(layer)) return true
	return partners.some(nodeRelevant) ? "ghost" : false
}

function mixColor(from, to, t) {
	t = Math.min(Math.max(t, 0), 1)
	let parse = c => [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16))
	let a = parse(from), b = parse(to)
	return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")
}

function entropyMitigation() {
	let m = D(0)
	if (!inTrial(11)) {
		m = m.add(player.s.points.pow(1.15).mul(BAL.stabilizerMitigation))
		if (hasUpgrade("s", 13)) m = m.add(25)
		if (hasUpgrade("s", 21)) m = m.mul(upgradeEffect("s", 21))
	}
	if (!inTrial(12)) m = m.add(buyableEffect("m", 13))
	if (onPath("o")) m = m.add(buyableEffect("o", 11))
	if (hasRoom(12)) m = m.add(40)
	if (hasUpgrade("v", 22)) m = m.add(upgradeEffect("v", 22))
	if (lawParts(14) > 0) m = m.mul(1 + lawParts(14))
	return m
}

function entropyCeiling() {
	if (!player.f.unlocked) return 0
	let pressure = BAL.pressureBase + totalRepairs() * BAL.pressurePerRepair
	let m = entropyMitigation().toNumber()
	let ceiling = 100 * pressure / (pressure + m + BAL.pressureSoftener)
	if (player.c.unlocked && pathChosen() === "c") ceiling += 15
	if (inTrial(11)) ceiling = 100
	return Math.min(ceiling, inTrial(11) ? 100 : BAL.entropyCap)
}

function entropyFraction() { return player.d.entropy / 100 }

function dustEntropyExp() {
	let p = BAL.dustPenalty
	if (hasUpgrade("s", 22)) p *= 0.5
	if (player.d.path === "c") p *= 0.5
	return 1 - p * entropyFraction()
}

function crackExp() {
	let p = BAL.crackPenalty
	if (trialDone("o", 22)) p *= 0.5
	p *= Math.max(0, 1 - lawParts(14) / 3)
	let e = 1 - p * entropyFraction()
	if (inTrial(22)) e *= 0.5
	return e
}

function crack(value) { return D(value).pow(crackExp()) }

const RESONANCE_LINKS = [["d", "f"], ["d", "s"], ["f", "s"], ["f", "m"], ["s", "t"], ["m", "t"],
	["m", "o"], ["t", "o"], ["m", "c"], ["t", "c"], ["o", "l"], ["c", "l"], ["o", "c"], ["l", "core"],
	["m", "h"], ["h", "t"], ["h", "n"], ["o", "n"], ["n", "c"], ["n", "l"], ["l", "v"], ["v", "core"]]

function repairLevel(layer) {
	if (layer === "core") return seatsFilled() / TOTAL_SEATS
	if (layer === "h") return roomsBuilt() / ROOM_ORDER.length
	if (layer === "n") return verseCount() / VERSES.length
	if (!player[layer].unlocked) return 0
	let total = mendCount(layer)
	if (!total) return 0
	return Object.keys(player[layer].repaired).length / total
}

function linkStrength(a, b) { return Math.sqrt(repairLevel(a) * repairLevel(b)) }

function resonanceSum(layer) {
	let sum = 0
	for (let link of RESONANCE_LINKS) if (link[0] === layer || link[1] === layer) sum += linkStrength(link[0], link[1])
	return sum
}

function resonanceMult(layer) {
	let k = BAL.resonanceK[layer] || 1
	if (hasUpgrade("f", 23)) k *= 2
	return D(1 + k * resonanceSum(layer))
}

function resonanceBranch(a, b) {
	let s = linkStrength(a, b)
	return [b, mixColor("#3a3f4a", "#ffd9a0", s), 4 + 14 * s]
}

const MEND_TOTALS = {}
function mendCount(layer) {
	if (MEND_TOTALS[layer] !== undefined) return MEND_TOTALS[layer]
	let n = 0
	for (let id in layers[layer].upgrades) if (layers[layer].upgrades[id] && layers[layer].upgrades[id].repairCost !== undefined) n++
	MEND_TOTALS[layer] = n
	return n
}

function totalRepairs() {
	let n = 0
	for (let l of MEND_LAYERS) n += Object.keys(player[l].repaired).length
	return n
}

function textClarity() {
	let total = 0
	for (let l of MEND_LAYERS) total += mendCount(l)
	let c = 0.6 * totalRepairs() / Math.max(total, 1) + 0.2 * lawsComplete() / 4 + 0.2 * seatsFilled() / TOTAL_SEATS
	if (lawParts(12) > 0) c += 0.02 * lawParts(12)
	return c
}

function healColor(layer, hurt, healed) { return mixColor(hurt, healed, 0.35 + 0.65 * repairLevel(layer)) }

function shatterNodeStyle(layer) {
	let level = repairLevel(layer)
	if (level >= 1 || !player[layer].unlocked) return {}
	return {animation: "nodeFlicker " + (3 + level * 9) + "s infinite", "--seam": (0.9 - 0.8 * level)}
}

const MEND_LAYERS = ["d", "f", "s", "m", "t", "o", "c", "l", "v"]

function isRepaired(layer, id) { return !!player[layer].repaired[id] }

function mendCurrency(layer, cfg) {
	if (cfg.dust) return {get: () => player.points, set: v => { player.points = v }, name: "Dust"}
	return {get: () => player[layer].points, set: v => { player[layer].points = v }, name: tmp[layer].resource}
}

function canRepair(layer, id) {
	let u = layers[layer].upgrades[id]
	return !isRepaired(layer, id) && run(u.unlocked, u) && mendCurrency(layer, u.mend).get().gte(u.repairCost)
}

function attemptRepair(layer, id) {
	let u = layers[layer].upgrades[id]
	if (isRepaired(layer, id)) return false
	if (!canRepair(layer, id)) return true
	if (!u.mend.free) {
		let c = mendCurrency(layer, u.mend)
		c.set(c.get().sub(u.repairCost))
	}
	Vue.set(player[layer].repaired, id, true)
	needCanvasUpdate = true
	if (typeof document !== "undefined") sealFlash(document.getElementById("upgrade-" + layer + "-" + id))
	return true
}

function autoRepair(layer) {
	for (let id in layers[layer].upgrades)
		if (isPlainObject(layers[layer].upgrades[id]) && layers[layer].upgrades[id].repairCost !== undefined && canRepair(layer, id)) attemptRepair(layer, id)
}

function anyRepairAffordable(layer) {
	if (!player[layer].unlocked) return false
	for (let id in layers[layer].upgrades)
		if (isPlainObject(layers[layer].upgrades[id]) && layers[layer].upgrades[id].repairCost !== undefined && canRepair(layer, id)) return true
	return false
}

function sealFlash(el) {
	if (!el || !el.animate) return
	if (options.reduceTextEffects || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return
	el.animate([
		{boxShadow: "0 0 0 0 rgba(255,225,170,0)", filter: "brightness(1)"},
		{boxShadow: "0 0 34px 10px rgba(255,225,170,0.95)", filter: "brightness(1.9)", offset: 0.25},
		{boxShadow: "0 0 0 0 rgba(255,225,170,0)", filter: "brightness(1)"},
	], {duration: 1100, easing: "ease-out"})
}

function mendUpgrade(layerId, id, cfg) {
	let upg = {
		mend: cfg,
		repairCost: D(cfg.repair),
		cost: D(cfg.cost),
		unlocked: cfg.unlocked === undefined ? true : cfg.unlocked,
		canAfford() { return isRepaired(layerId, id) },
		repairClick() { return attemptRepair(layerId, id) },
		extraClass() {
			if (!isRepaired(layerId, id)) return canRepair(layerId, id) ? "shatteredUpg canRepair" : "shatteredUpg"
			return entropyFraction() >= 0.5 ? "recrackedUpg" : ""
		},
		style() {
			let s = {width: "160px", "min-height": "160px", "font-size": "12px"}
			if (isRepaired(layerId, id)) s["--crack"] = entropyFraction()
			return s
		},
		tooltip() { return isRepaired(layerId, id) ? cfg.lore : "Repair it to learn what it was." },
		fullDisplay() {
			let locked = isRepaired(layerId, id)
			let text = "<h3>" + glitchSwap(cfg.title, {rare: true, id: "u-" + layerId + "-" + id + "-t", locked, wake: true}) + "</h3><br>"
				+ glitchSwap(cfg.desc, {rare: true, id: "u-" + layerId + "-" + id + "-d", locked, wake: true})
			let name = mendCurrency(layerId, cfg).name
			if (!locked) return text + "<br><br><b>Repair:</b> " + formatWhole(this.repairCost) + " " + name + (cfg.free ? " (kept)" : "")
			if (cfg.show) text += "<br>Currently: " + cfg.show.call(this)
			if (hasUpgrade(layerId, id)) return text
			return text + "<br><br>Cost: " + formatWhole(this.cost) + " " + name + (cfg.free ? " (kept)" : "")
		},
	}
	if (cfg.effect) upg.effect = function () { return cfg.noCrack ? cfg.effect.call(this) : crack(cfg.effect.call(this)) }
	if (cfg.dust) {
		upg.currencyDisplayName = "Dust"
		upg.currencyInternalName = "points"
		upg.currencyLocation = function () { return player }
	}
	if (cfg.free) upg.pay = function () {}
	if (cfg.onPurchase) upg.onPurchase = cfg.onPurchase
	return upg
}

function mendSet(layerId, defs) {
	let set = {}
	for (let id in defs) set[id] = mendUpgrade(layerId, id, defs[id])
	return set
}

const TRUE_WORDS = ["alone", "chose", "break", "hand", "you", "forgive", "me"]

const VOICE = [
	{when: () => true, line: "You must repair what once {was|could have been|should never have been}."},
	{when: () => player.f.unlocked, line: "Can you {remember|mend|!forgive~remember|recall|know} the Tree? You will."},
	{when: () => player.s.unlocked, line: "I was {whole|!alone|!you~whole|complete|entire}."},
	{when: () => player.m.unlocked || player.t.unlocked, line: "Nobody saw it fall. I {fell|failed|!chose~fell|slipped|sank}."},
	{when: () => player.m.unlocked && player.t.unlocked, line: "It had to {bend|end|!break~bend|yield|give}, and {the Tree|the world|!you} had no one to ask."},
	{when: () => !!player.d.path, line: "{@o:Hold it still|@c:Let it run|Keep going}. The {wind|storm|!hand~wind|gale|storm} that struck came from inside."},
	{when: () => player.l.unlocked, line: "Restore the {Core|truth|mistake~Core|heart|centre}."},
	{when: () => player.d.reconciled, line: "When it is done, will you {mend|!forgive~mend|tend|keep} {it|the Tree|!me~it|the Tree|us}?"},
	{when: () => seatsFilled() >= 12, line: "Almost {whole|alone|home~whole|healed|home}."},
	{when: () => verseCount() >= 5, line: "You know how the {song|story|sentence} ends. You {wrote|heard|!chose} it."},
	{when: () => seatsFilled() >= 24, line: "Nearly there. Did you {eat|sleep|!forgive}? Nobody ever asks you that. I should have."},
]

function currentVoice() {
	let line = VOICE[0].line
	for (let v of VOICE) if (v.when()) line = v.line
	return line
}

const MEMORIES = {
	d: [
		{when: () => true, text: "There was a {Tree|shape|silence}. Every law of the world hung from it like fruit. Now there is dust, and the dust is {everything|everyone|all that's left}."},
		{when: () => player.d.upgrades.length >= 2, text: "You sift. You don't know how you know to sift. Your hands seem to {remember|invent|regret} it for you."},
		{when: () => player.f.unlocked, text: "The dust has a grain to it, the way a broken plate has a grain. It wants to go back the way it {came|fell|was}. It only had to {bend|fall|!break} once."},
		{when: () => player.points.gte("1e30"), text: "If you listen long enough, the hum in the dust turns into a voice. It only ever says {the same|two|too many} things. It has been saying them for a very long time."},
		{when: () => player.points.gte("1e150"), text: "There are no footprints in the void but yours. Nobody came here to break anything. {Nobody|No one else|!you} ever was here."},
	],
	f: [
		{when: () => player.f.unlocked, text: "The first Fragment fits your palm so well that it frightens you. It has a clean edge, as if it was {cut|torn|given}."},
		{when: () => player.f.total.gte(100), text: "The Fragments show you things. A sky with two moons. A language with no word for {goodbye|enough|!alone}. None of it lasted, because none of it was allowed to change."},
		{when: () => player.f.total.gte(1e6), text: "Whatever broke the Tree struck once and struck well. There is no second blow on any of these. Only someone who knew it from the inside could have {found|known|loved} the place to strike."},
		{when: () => player.f.total.gte(1e15), text: "You've started to recognise the edges. They don't match the wound the way a {weapon|hammer|!hand} would. They match it the way a {key|wish|prayer} would."},
		{when: () => player.f.total.gte(1e40), text: "A Fragment, held up to the void, shows you someone holding up a Fragment. You've been at this {long|far too long|longer than you think}."},
		{when: () => player.f.total.gte(1e80), text: "Your name for the work has changed. You used to call it putting things back. Lately, when you're tired, you catch yourself calling it {finishing|apologising|going home}."},
	],
	s: [
		{when: () => player.s.unlocked, text: "A Stabilizer is only a promise, set in a crack: {this will hold|this will wait|this is enough}. The crack hears it and, for a while, believes."},
		{when: () => player.s.points.gte(5), text: "Entropy isn't an enemy. It's only what a broken thing does when no one is watching. So you {watch|wait|!break} less than you mean to, and it's all right."},
		{when: () => player.s.points.gte(15), text: "Before the shattering there was no Entropy at all. Nothing could wear out. Nothing could {change|end|begin}. You find you can't quite say that was better."},
		{when: () => player.s.points.gte(35), text: "When the last crack of a thing seals, it sighs. You've taken to sighing with it. You don't know which of you {started|learned|taught} it."},
		{when: () => player.s.points.gte(60), text: "The Stabilizers hum in a chord now. The chord is missing a note. It's about the pitch of your {voice|name|!you}."},
		{when: () => player.s.points.gte(100), text: "You've set so many now that the void has a kind of grain, like a field somebody has walked across every day for a long time. You wonder who {planted|walked|!chose} it."},
	],
	m: [
		{when: () => player.m.unlocked, text: "Matter returns as a clumsy thing, all weight and elbows. A pebble is the first thing in an age to {fall|stay|rest} anywhere. You watch it for hours."},
		{when: () => player.m.buyables[11].gte(5), text: "You raise a scaffold over nothing. It's for practice, you tell yourself. Something in the dust gets up and {walks|tries|hopes} along it."},
		{when: () => player.m.buyables[12].gte(5), text: "Hearths came before houses, and warmth before anyone to be warm. You light them in the void, and they {comfort|fool|warm} {you|!me} a little."},
		{when: () => player.m.best.gte(1e6), text: "In the old Tree, all matter was one matter, and it touched only itself. Imagine it, an endless {embrace|solitude|!alone} and no one to tell."},
		{when: () => player.m.best.gte(1e15), text: "Your structures have started leaving gaps, on purpose, about the size of someone. You don't remember who {said|asked|!chose} to do that."},
		{when: () => player.m.best.gte(1e30), text: "Something has started living in your scaffolds. It's small and doesn't know you. It runs when you come near. You've never been so {happy|careful|frightened}."},
	],
	t: [
		{when: () => player.t.unlocked, text: "A Moment is a very small room. You go in, and it's already over. It's the first thing in all the long dark that has ever {ended|begun|left}."},
		{when: () => player.t.buyables[11].gte(5), text: "The Tree held all of time at once, the way you might hold a closed book. It knew how everything ended, and so nothing ever {happened|surprised it|mattered}."},
		{when: () => player.t.best.gte(100), text: "Wind the Clock and you can feel it, the hours banking up behind your teeth. Time wants to be {spent|shared|wasted}. It's the only thing that does."},
		{when: () => player.t.best.gte(1e5), text: "You find a moment that's older than the rest and hold it to your ear. Someone is saying, very calmly, {now|please|!break}."},
		{when: () => player.t.best.gte(1e9), text: "Causes come back before their effects do, and you begin to suspect the order of things. Which came first, the wound or {the one who mends it|the need|!you}?"},
		{when: () => player.t.best.gte(1e15), text: "Somewhere out at the edge of what you've restored, it's already next week. A leaf has fallen there, and it's the first that ever did. Nobody told it {how|to|it could}."},
	],
	o: [
		{when: () => player.o.unlocked, text: "You chose to set things right, each in its place. An Axiom is a sentence the world agrees to obey. The first one you write is: {this will not happen again|nothing moves|I am sorry}."},
		{when: () => player.o.points.gte(3), text: "Order is a kind of love, you decide. It keeps its promises. It also keeps {everyone in their rooms|its hands folded|the doors closed}."},
		{when: () => player.o.points.gte(6), text: "You're building it back the way it was: exact, beautiful, and without a single {door|flaw|window}. You stop for a while and look at that."},
		{when: () => trialDone("o", 22), text: "After the last Trial, the Axioms are quiet, and in the quiet you can hear the thing you've been ordering. It's asking whether it has to be {so tidy|so quiet|!alone}."},
		{when: () => player.d.reconciled, text: "You open the doors of the clean rooms and let the weather in. It makes a terrible mess. You stand in it for a while with your {eyes closed|hands open|mouth open}."},
	],
	c: [
		{when: () => player.c.unlocked, text: "You chose to let the pieces find their own way home. Anomalies are the world's first jokes. Half of them are {terrible|true|the same joke}."},
		{when: () => player.c.best.gte(100), text: "A river runs uphill for a moment and nobody is hurt. A new colour turns up and leaves. You laugh aloud, for the first time. The sound seems to {startle|delight|!forgive} the dust."},
		{when: () => player.c.best.gte(1e5), text: "It won't be what it was. That's the point, isn't it? Something that can surprise itself doesn't ever have to be {alone|afraid|finished}."},
		{when: () => trialDone("c", 22), text: "The last Trial leaves you panting and wildly glad. A storm is the only thing that's ever hugged the whole sky at once. Somewhere in you a {hand|wind|voice} opens and closes, remembering."},
		{when: () => player.d.reconciled, text: "Having rules back isn't so bad. The river still runs uphill on Tuesdays, but now there are Tuesdays. You find you've {missed|needed|dreaded} them."},
	],
	l: [
		{when: () => player.l.unlocked, text: "Laws can't be mended by hand. You have to ask them. A Principle is what's left after you ask something politely, over and over, until it {answers|agrees|remembers}."},
		{when: () => lawParts(11) >= 3, text: "Gravity comes back. So that's what it was: every single thing in the world, leaning toward every other thing. It {never|hasn't ever|hardly ever} stopped."},
		{when: () => lawParts(12) >= 3, text: "Light comes back, and it can finally cross a distance, and so there are distances. Seeing something, you learn, means not being it. The Tree had never {seen|met|touched} anything. Not even {itself|the dark|!you}."},
		{when: () => lawParts(13) >= 3, text: "Causality comes back, and you can read the whole chain from here. It's short. Loneliness caused a wish. A wish caused a {hand|blow|hope}. A hand caused {you|everything|!me}."},
		{when: () => lawParts(14) >= 3, text: "Memory comes back last, and it's yours. You stood at the heart of the Tree. It was a hand you were using, and it was {your own|the Tree's|the same one}. You remember now that you {!chose|meant|wanted} it."},
		{when: () => player.d.reconciled, text: "You lay Order and Chaos side by side, and it's easy. They were always one sentence: {keep this|let this go}, {keep this|let this go}, the way a chest {rises|falls|does} and falls."},
	],
	h: [
		{when: () => player.h.unlocked, text: "Before, there was a house. You're {sure|certain|nearly certain} of it. You've got enough Matter now to start, and your hands already know the floor plan."},
		{when: () => hasRoom(12), text: "You stand in the kitchen with the yellow light for a long time, and it's only later you notice what's wrong. There's nothing in the cupboards. There never was. You don't remember ever {eating|being hungry|being young}."},
		{when: () => hasRoom(13), text: "You try to remember one of the photographs. A beach, maybe. Someone squinting. You can see the frame perfectly well. You've never once been able to see {the face|the beach|who took it}."},
		{when: () => hasRoom(22), text: "Everything is where it should be. It's all very clean. It's how a house looks if it was described to someone by {a person who'd never seen one|a child|the dark}."},
		{when: () => hasRoom(23), text: "There are no footprints in the garden except yours. There's no road outside the fence. If you ask yourself how you got home at night, you get a warm feeling and {no answer|a song|nothing else}."},
		{when: () => hasRoom(31), text: "You sit across from the empty chair and you try to say who was at the sink. You open your mouth. You've carried this question the whole way down, and you've never once {asked it aloud|heard the answer|wanted to}."},
	],
	n: [
		{when: () => player.n.unlocked, text: "You have four notes. You hum them over the dust, the way you might try a key in a lock, and for a moment something out there {hums back|holds still|flinches}."},
		{when: () => hasVerse(11), text: "It starts low. That much you're sure of now. It starts low and then, you think, it says so {again|once more|twice}."},
		{when: () => hasVerse(13), text: "After that it reaches up, just once, for the high note, and it doesn't quite stay there. And then there's a place where whoever's singing has to {breathe|stop|wait}."},
		{when: () => player.n.remembered, text: "So that's all it ever was: low, low, high, and a breath. You'd have thought a thing you lost a world for would be {longer|grander|harder}."},
		{when: () => hasVerse(22), text: "There's more of it than anyone ever sang at that sink. It goes on and on, and you know each note just before it comes, the way you can only know {your own handwriting|a thing you wrote|!you}."},
		{when: () => verseCount() >= 5 && player.h.sat, text: "You hum it all the way through in the room with the two chairs. Nobody hums along. Then, very quietly, from a long way down, {somebody does|something does|!me}."},
	],
	v: [
		{when: () => player.v.unlocked, text: "Under all the work there's a quiet, and you've been stepping around it since you knelt down. It doesn't want anything from you. That's the {frightening|kind|strange} part."},
		{when: () => player.v.best.gte(10), text: "You stop for an hour. Nothing falls apart. You'd thought it would all fall apart. You feel something that's nearly {relief|shame|!forgive}."},
		{when: () => player.v.best.gte(1000), text: "This is what it was like, before. Not dark. Not sad. Just complete, all the way out in every direction, with no one to notice. You can last about {an hour|a minute|a breath} of it."},
		{when: () => player.v.longest >= 3600, text: "How long did the Tree sit like this? There was no time to count it in. You try to imagine it. You imagine it wanting, very badly, for {anything|someone|!you} to happen to it."},
	],
	core: [
		{when: () => true, text: "It sits at the bottom of everything, cracked through and glowing faintly. It won't answer you. You have the feeling it's {asleep|ashamed|listening}."},
		{when: () => seatsFilled() >= 1, text: "The first seat clicks home. Far off, something very large breathes in. It {hurts|helps|remembers}."},
		{when: () => seatsFilled() >= 6, text: "\"You came,\" says the Core, and the voice is {familiar|your own|very tired}. \"You always {come|return|!forgive}. Don't stop. Please don't stop.\""},
		{when: () => seatsFilled() >= 12, text: "\"When I was whole I was everything,\" the Core says, \"and so there was never anyone to {tell|ask|hold}. Do you understand? There was no one to tell {it|everything|!me}.\""},
		{when: () => seatsFilled() >= TOTAL_SEATS, text: "\"One more thing to mend,\" says the Core, \"and then I'll be whole again. I'm so sorry. I'd like you to know, I'd do it {again|differently|for you}.\""},
		{when: () => seatsFilled() >= 22, text: "\"Do you know why I gave you a house?\" says the Core. \"I'd never seen one. I'd only ever been everywhere. I thought you should have somewhere to have {come from|lost|left}.\""},
	],
}

function checkMemories() {
	if (introActive()) return
	for (let layer in MEMORIES) {
		for (let i = 0; i < MEMORIES[layer].length; i++) {
			let key = layer + i
			if (!player.e.seen[key] && MEMORIES[layer][i].when()) {
				Vue.set(player.e.seen, key, true)
				if (player.timePlayed > 2) doPopup("none", glitchSwap(MEMORIES[layer][i].text, {id: "mem-" + key, wake: true}), "Memory Recovered", 7, "#d9cfe8")
				return
			}
		}
	}
}

function memoriesHTML(layer) {
	let found = 0
	let html = ""
	MEMORIES[layer].forEach((m, i) => {
		if (!player.e.seen[layer + i]) return
		found++
		html += '<p class="memory">' + glitchSwap(m.text, {id: "mem-" + layer + i, wake: true}) + "</p>"
	})
	let missing = MEMORIES[layer].length - found
	if (missing > 0) html += '<p class="memoryMissing">' + missing + (missing === 1 ? " memory is" : " memories are") + " still shattered.</p>"
	return '<div class="memoryBox">' + html + "</div>"
}

function memoryTab(layer) {
	return {content: [["blank", "20px"], ["raw-html", function () { return memoriesHTML(layer) }]]}
}

function resonanceLine(layer) {
	let sum = resonanceSum(layer)
	if (sum <= 0) return ""
	return '<span class="resonanceLine">Resonance with repaired neighbours: ×' + format(resonanceMult(layer)) + "</span><br><br>"
}

function layerIntro(text, layer) { return '<p class="layerIntro">' + glitchSwap(text, {id: "intro-" + layer}) + "</p>" }


addLayer("d", {
	name: "Dust",
	symbol: "D",
	position: 0,
	row: 0,
	type: "none",
	resource: "Dust",
	color() { return healColor("d", "#7d7a70", "#e6dcc0") },
	nodeStyle() { return shatterNodeStyle("d") },
	tooltip() { return glitchSwap("What's left when you're {gone|lost|!alone}.", {rare: true, id: "tip-d"}) },
	startData() { return {
		unlocked: true,
		points: D(0),
		repaired: {},
		entropy: 0,
		path: null,
		reconciled: false,
		memoryTimer: 0,
		introStep: 1,
		skippedOpening: false,
	}},
	layerShown() { return true },
	shouldNotify() { return anyRepairAffordable("d") },
	branches() { return [resonanceBranch("d", "f"), resonanceBranch("d", "s")] },
	upgrades: mendSet("d", {
		11: {
			title: "{Sift|Grieve|Forget} the Ash",
			desc: "{Dust|Doubt|Debt} comes {twice as fast|back wrong|to nothing}.",
			repair: 4, cost: 8, dust: true,
			effect() { return D(2) },
			show() { return "×" + format(this.effect()) },
			lore: "Your hands learn the first motion of mending: pick up what fell.",
		},
		12: {
			title: "{Gather|Bury|Mourn} the Silt",
			desc: "{Dust|Silence|Sorrow} {feeds on itself|settles over you|won't lift}.",
			repair: 15, cost: 30, dust: true,
			effect() { return player.points.add(10).log10().add(1) },
			show() { return "×" + format(this.effect()) },
			lore: "Dust on dust. A beach is only this, with patience.",
		},
		13: {
			title: "{Hear|Fear|Feign} the Hum",
			desc: "Every repair {you have made|you have regretted|you will undo} {speeds the Dust|echoes on|is counted}.",
			repair: 60, cost: 120, dust: true,
			effect() { return Decimal.pow(1.12, totalRepairs()) },
			show() { return "×" + format(this.effect()) },
			lore: "All of it hums, and the hum gets a little clearer with each thing you put back.",
		},
		14: {
			title: "The First {Seam|Scar|Lie}",
			desc: "{Fragments|Falsehoods|Failures} come {twice as readily|to you|in pairs}.",
			repair: 150, cost: 400, dust: true,
			effect() { return D(2) },
			show() { return "×" + format(this.effect()) },
			lore: "A seam is where two things that broke have agreed to try again.",
		},
	}),
	tabFormat: {
		"Mender's Ledger": {
			content: [
				["raw-html", function () { return layerIntro("Dust gathers by itself. It always {has|will|did}. Crack it open, and you can begin.", "d") }],
				["raw-html", function () { return resonanceLine("d") }],
				"upgrades",
				["bar", "entropy"],
				["raw-html", function () {
					if (!player.f.unlocked) return ""
					return '<p class="ledgerNote">Entropy drifts toward its ceiling of <b>' + format(entropyCeiling()) + "%</b>.<br>"
						+ "Right now it's bending Dust to ^" + format(dustEntropyExp(), 3) + " and repaired effects to ^" + format(crackExp(), 3) + ".<br>"
						+ "It can never pass " + BAL.entropyCap + "% outside a Trial, and it takes nothing that you already have.</p>"
				}],
			],
		},
		"Resonance": {
			unlocked() { return player.s.unlocked || player.f.total.gte(10) },
			content: [
				["blank", "20px"],
				["raw-html", function () {
					let html = '<p class="layerIntro">Layers that are joined on the Tree boost each other once both are repaired. The stronger the link, the brighter its branch.</p><table class="resonanceTable"><tr><th>Link</th><th>Strength</th></tr>'
					for (let link of RESONANCE_LINKS) {
						if (!player[link[0]].unlocked || !player[link[1]].unlocked) continue
						html += "<tr><td>" + layers[link[0]].name + " – " + layers[link[1]].name + "</td><td>" + format(linkStrength(link[0], link[1]) * 100) + "%</td></tr>"
					}
					html += "</table><br><br>"
					for (let l of ["d", "f", "s", "m", "t", "o", "c", "l", "v"]) if (player[l].unlocked && resonanceSum(l) > 0) html += layers[l].name + " gains ×" + format(resonanceMult(l)) + "<br>"
					return html
				}],
			],
		},
		"Recovered Memories": memoryTab("d"),
	},
	bars: {
		entropy: {
			direction: RIGHT,
			width() { return Math.min(400, window.innerWidth - 40) },
			height: 36,
			unlocked() { return player.f.unlocked },
			progress() { return entropyFraction() },
			display() { return "Entropy: " + format(player.d.entropy) + "%" },
			fillStyle() { return {"background-color": mixColor("#4a6a7a", "#d0504a", entropyFraction() * 1.2)} },
			baseStyle: {"background-color": "#1b1d23"},
			textStyle: {color: "#f4efe6"},
		},
	},
	update(diff) {
		let target = entropyCeiling()
		player.d.entropy = target + (player.d.entropy - target) * Math.exp(-diff / BAL.entropyTau)
		GlitchText.setEntropy(entropyFraction())
		GlitchText.setClarity(textClarity())
		GlitchText.setContext({route: player.d.path, reconciled: player.d.reconciled})
		player.d.memoryTimer -= diff
		if (player.d.memoryTimer <= 0) {
			player.d.memoryTimer = 8
			checkMemories()
		}
		if (player.s.unlocked && player.d.entropy >= 80) player.e.touchedHigh = true
	},
	doReset(resettingLayer) {
		if (hasMilestone("f", 0) || hasMilestone("s", 0) || hasMilestone("m", 0) || hasMilestone("t", 0)) return
		player.d.upgrades = []
	},
})

addLayer("f", {
	name: "Fragments",
	symbol: "F",
	position: 0,
	row: 1,
	type: "normal",
	resource: "Fragments",
	baseResource: "Dust",
	baseAmount() { return player.points },
	requires() { return D(BAL.fReq) },
	exponent() { return BAL.fExp },
	color() { return healColor("f", "#5d7f8c", "#6fe3d6") },
	nodeStyle() { return shatterNodeStyle("f") },
	tooltip() { return formatWhole(player.f.points) + " Fragments<br>" + glitchSwap("Each edge {fits|cuts|knows} {it|the next|!you}.", {rare: true, id: "tip-f"}) },
	tooltipLocked() { return "Reach " + formatWhole(tmp.f.requires) + " Dust to find the first Fragment.<br>" + glitchSwap("It's {waiting|watching|near}.", {rare: true, id: "tipl-f"}) },
	startData() { return {
		unlocked: false,
		points: D(0),
		best: D(0),
		total: D(0),
		repaired: {},
	}},
	layerShown() { return treeSlot("f", "s") },
	hotkeys: [{key: "f", description: "F: Reset for Fragments", onPress() { if (canReset("f")) doReset("f") }}],
	branches() { return [resonanceBranch("f", "m")] },
	shouldNotify() { return anyRepairAffordable("f") },
	gainMult() {
		let m = resonanceMult("f")
		m = m.mul(upgValue("d", 14)).mul(upgValue("f", 13)).mul(upgValue("f", 14)).mul(upgValue("f", 22)).mul(upgValue("f", 32)).mul(upgValue("t", 23))
		if (hasUpgrade("s", 12)) m = m.mul(upgradeEffect("s", 12))
		if (!inTrial(12)) m = m.mul(buyableEffect("m", 11))
		m = m.mul(tmp.m.effect)
		if (hasRoom(13)) m = m.mul(5)
		if (hasVerse(12)) m = m.mul(10)
		if (onPath("o")) m = m.mul(tmp.o.effectF)
		if (onPath("c")) m = m.mul(tmp.c.effectF)
		m = m.mul(tmp.core.effectOther)
		return m
	},
	gainExp() {
		let e = D(1)
		if (hasUpgrade("f", 24)) e = e.add(0.03)
		if (hasUpgrade("f", 33)) e = e.add(0.03)
		if (trialDone("c", 22)) e = e.add(0.03)
		e = e.add(0.01 * lawParts(12))
		return e
	},
	effect() {
		let exp = D(BAL.fEffect)
		if (hasUpgrade("f", 12)) exp = exp.add(BAL.fEffectUp)
		return player.f.points.add(1).pow(exp).pow(inTrial(22) ? 0.5 : 1)
	},
	effectDescription() { return "multiplying Dust by ×" + format(tmp.f.effect) },
	passiveGeneration() {
		let p = 0
		if (hasMilestone("m", 1)) p = Math.max(p, 0.1)
		if (hasMilestone("t", 2)) p = Math.max(p, 0.25)
		if (hasMilestone("o", 1) || hasMilestone("c", 1)) p = 1
		return p
	},
	autoUpgrade() { return hasMilestone("m", 2) },
	automate() { if (hasMilestone("m", 2)) autoRepair("f") },
	milestones: {
		0: {
			requirementDescription() { return glitchSwap("{5|five|several} Fragments, in all", {rare: true, id: "ms-f0", locked: hasMilestone("f", 0)}) },
			effectDescription: "You keep your Dust repairs bought through Fragment resets.",
			done() { return player.f.total.gte(5) },
		},
		1: {
			requirementDescription: "1,000 Fragments, in all",
			effectDescription() { return glitchSwap("Dust {drifts|falls|comes} to you more easily: ×2 Dust, and it starts at 1,000 after a reset.", {rare: true, id: "ms-f1", locked: hasMilestone("f", 1), wake: true}) },
			done() { return player.f.total.gte(1000) },
		},
	},
	upgrades: mendSet("f", {
		11: {
			title: "{Gravity|Grief|Gravitas} Wells",
			desc: "{Dust|Silence|Memory} {gathers three times over|gathers at the edges|won't stay down}.",
			repair: 1, cost: 1,
			effect() { return D(3) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "The earliest thing the void remembers: things are meant to lean together.",
		},
		12: {
			title: "{Clean|Cruel|Careful} Edges",
			desc: "The {Fragment|fracture|funeral} effect is {stronger|sharper|still felt}.",
			repair: 2, cost: 3,
			lore: "Everything breaks somewhere. These broke at exactly the right place. You don't like what that implies.",
		},
		13: {
			title: "{Sorting|Sobbing|Salvage} by Hand",
			desc: "{Dust|Dread|Distance} {turns up more Fragments|is what remains|keeps you company}.",
			repair: 5, cost: 8,
			effect() { return player.points.add(10).log10().pow(1.2) },
			show() { return "×" + format(this.effect()) + " Fragments" },
			lore: "You've started keeping the small ones. You couldn't say why.",
		},
		14: {
			title: "{Practiced|Haunted|Unsteady} Fingers",
			desc: "Each repair {anywhere|you regret|in the dark} makes {Fragments|it|you} {5% richer|harder to bear|quicker}.",
			repair: 15, cost: 30,
			effect() { return Decimal.pow(1.05, totalRepairs()) },
			show() { return "×" + format(this.effect()) + " Fragments" },
			lore: "You know this work. You've known it from the start. Don't look at that too closely.",
		},
		21: {
			title: "{Star|Scar|Stone}-Glass",
			desc: "{Dust|Light|Loss} is {multiplied by best Fragments|caught in the seams|refracted}.",
			repair: 60, cost: 150,
			effect() { return player.f.best.add(1).pow(BAL.f21) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "Holding two shards together, you find that light goes through them differently than through one.",
		},
		22: {
			title: "{Mosaic|Memorial|Mistake}",
			desc: "{Fragments|Remains|Regrets} come {three times as readily|to rest here|back around}.",
			repair: 300, cost: 800,
			effect() { return D(3) },
			show() { return "×" + format(this.effect()) + " Fragments" },
			lore: "You stop trying to put it back as it was. You start trying to make it hold.",
		},
		23: {
			title: "{Sympathetic|Sorrowful|Silent} Seams",
			desc: "{Resonance|Reverence|Regret} between {neighbours|the broken|us} is {doubled|unspoken|mutual}.",
			repair: 2000, cost: 5000,
			lore: "Mend one and its neighbour stirs. Pieces that have been apart a long time still remember being next to each other.",
		},
		24: {
			title: "{Kintsugi|Keening|Kindness}",
			desc: "{Fragment|Fractured|Forgotten} gain is {raised to ^1.03|held in gold|made gentle}.",
			repair: 2e4, cost: 5e4,
			lore: "A mended bowl with a gold seam tells the truth about what happened to it, and it holds soup just the same.",
		},
		31: {
			title: "{Bedrock|Burial|Bargain}",
			desc: "{Matter|Mourning|Mercy} {multiplies Dust|lies under all of it|comes too late}.",
			repair: 1e7, cost: 3e7,
			unlocked() { return player.m.unlocked },
			effect() { return player.m.total.add(1).pow(BAL.f31) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "Something to stand on. You forgot how much you'd missed that.",
		},
		32: {
			title: "{Patient|Patched|Passing} Hours",
			desc: "{Moments|Months|Minutes} {multiply Fragments|pass, as they do|won't stay}.",
			repair: 1e8, cost: 3e8,
			unlocked() { return player.t.unlocked },
			effect() { return player.t.total.add(1).pow(BAL.f32) },
			show() { return "×" + format(this.effect()) + " Fragments" },
			lore: "Given enough time, an edge wears smooth, so that it stops cutting and only fits.",
		},
		33: {
			title: "{Whole|Hollow|Haunted} Cloth",
			desc: "{Fragment|Phantom|Fabled} gain is {raised another ^1.03|stitched from nothing|not to be trusted}.",
			repair: 1e15, cost: 1e16,
			unlocked() { return player.m.unlocked && player.t.unlocked },
			lore: "You've got more of it back than you've lost, now. You aren't sure when that happened.",
		},
		34: {
			title: "{Nearly|Never|Not} {Seamless|Enough|Yours}",
			desc: "{Dust|Doubt|Daylight} is {multiplied by total repairs, squared|what's left|on the way}.",
			repair: 1e24, cost: 1e25,
			unlocked() { return player.m.unlocked && player.t.unlocked },
			effect() { return D(totalRepairs() + 1).pow(2) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "You leave a hairline, on purpose. One day someone might want to know that this happened.",
		},
	}),
	tabFormat: {
		"Repair": {
			content: [
				"main-display",
				["raw-html", function () { return resonanceLine("f") }],
				"prestige-button",
				"resource-display",
				["raw-html", function () { return layerIntro("Click a shattered upgrade once to {repair|recall|!forgive} it, and again to buy it. Repairs survive every reset.", "f") }],
				"upgrades",
			],
		},
		"Milestones": {
			content: [["blank", "20px"], "milestones"],
		},
		"Recovered Memories": memoryTab("f"),
	},
	doReset(resettingLayer) {
		if (layers[resettingLayer].row <= this.row) return
		let keep = ["repaired"]
		if (hasMilestone("m", 0) || hasMilestone("t", 0)) keep.push("milestones", "total")
		if (hasMilestone("m", 3) || hasMilestone("t", 3) || hasMilestone("o", 0) || hasMilestone("c", 0)) keep.push("upgrades")
		layerDataReset(this.layer, keep)
	},
})

addLayer("s", {
	name: "Stabilizers",
	symbol: "S",
	position: 1,
	row: 1,
	type: "static",
	resource: "Stabilizers",
	baseResource: "Dust",
	baseAmount() { return player.points },
	requires() { return D(BAL.sReq) },
	base() { return BAL.sBase },
	exponent() { return BAL.sExp },
	color() { return healColor("s", "#6d6a86", "#b7a8f0") },
	nodeStyle() { return shatterNodeStyle("s") },
	tooltip() { return formatWhole(player.s.points) + " Stabilizers<br>" + glitchSwap("{This will hold|This will wait|This is enough}.", {rare: true, id: "tip-s"}) },
	tooltipLocked() { return "Reach " + formatWhole(tmp.s.nextAt) + " Dust to set the first Stabilizer." },
	startData() { return {
		unlocked: false,
		points: D(0),
		best: D(0),
		total: D(0),
		repaired: {},
		steadyTimer: 0,
		steadied: 0,
	}},
	layerShown() { return treeSlot("s", "f") },
	hotkeys: [{key: "s", description: "S: Reset for a Stabilizer", onPress() { if (canReset("s")) doReset("s") }}],
	branches() { return [resonanceBranch("s", "t"), resonanceBranch("s", "f")] },
	shouldNotify() { return anyRepairAffordable("s") },
	canBuyMax() { return hasUpgrade("s", 14) || hasMilestone("t", 1) },
	gainMult() {
		let m = D(1).div(resonanceMult("s"))
		if (trialDone("o", 11)) m = m.div(1e6)
		return m
	},
	autoPrestige() { return hasMilestone("t", 1) },
	resetsNothing() { return hasMilestone("t", 1) },
	effect() { return inTrial(11) ? decimalOne : Decimal.pow(BAL.sEffectBase, player.s.points) },
	effectDescription() { return "steadying the Tree: ×" + format(tmp.s.effect) + " Dust, and a lower Entropy ceiling" },
	upgrades: mendSet("s", {
		11: {
			title: "{Steady|Shaking|Stolen} Hands",
			desc: "Unlock {Steady the Seams|the shaking|an old habit}: a button that knocks Entropy down.",
			repair: 1, cost: 2, free: true,
			lore: "It's nothing clever. You put your hands on the crack and you breathe. It helps more than it should.",
		},
		12: {
			title: "{Load|Lost|Last}-Bearing",
			desc: "Each {Stabilizer|sorrow|step} {multiplies Fragments|is carried|comes with you}.",
			repair: 2, cost: 3, free: true,
			effect() { return Decimal.pow(BAL.s12Base, player.s.points) },
			show() { return "×" + format(this.effect()) + " Fragments" },
			lore: "If it can bear weight, it can be built on.",
		},
		13: {
			title: "{Quiet|Quaking|Quitting} Ground",
			desc: "{Entropy|Everything|Each ending} {is held further from the ceiling|is settling|will wait}.",
			repair: 4, cost: 5, free: true,
			lore: "Some part of the void stops shaking. You'd stopped noticing that it was.",
		},
		14: {
			title: "{Many|Mourning|Missing} Hands",
			desc: "You can {buy as many Stabilizers as you can afford|hold them all|let some go} at once.",
			repair: 6, cost: 8, free: true,
			lore: "Now you can stop a whole wall from falling, instead of one brick at a time.",
		},
		21: {
			title: "{Lattice|Lament|Liturgy}",
			desc: "{Stabilizers|Survivors|Sentences} {hold more as Dust piles up|lean together|are repeated}.",
			repair: 15, cost: 18, free: true,
			effect() { return player.points.add(10).log10().div(10).add(1) },
			show() { return "×" + format(this.effect()) + " mitigation" },
			lore: "Every Stabilizer holds up the one next to it, and now they form a shape.",
		},
		22: {
			title: "{Equilibrium|Exhaustion|Exile}",
			desc: "{Entropy|Effort|Everyone} {bends Dust half as much|is tired|has gone}.",
			repair: 30, cost: 35, free: true,
			lore: "It isn't that the cracks have stopped. It's that you've stopped being afraid of them.",
		},
	}),
	clickables: {
		11: {
			title: "Steady the Seams",
			unlocked() { return hasUpgrade("s", 11) },
			canClick() { return player.s.steadyTimer <= 0 && player.d.entropy > 1 },
			display() {
				if (player.s.steadyTimer > 0) return "Your hands need " + format(player.s.steadyTimer) + "s."
				return "Knock a third off Entropy. It will climb back toward its ceiling in a few minutes."
			},
			onClick() {
				player.d.entropy *= 2 / 3
				player.s.steadyTimer = 30
				player.s.steadied++
			},
			style: {width: "180px", "min-height": "110px"},
		},
	},
	update(diff) { player.s.steadyTimer = Math.max(0, player.s.steadyTimer - diff) },
	tabFormat: {
		"Stabilize": {
			content: [
				"main-display",
				["raw-html", function () { return resonanceLine("s") }],
				"prestige-button",
				"resource-display",
				["layer-proxy", ["d", [["bar", "entropy"]]]],
				["raw-html", function () { return '<p class="ledgerNote">Ceiling: ' + format(entropyCeiling()) + "%. Every repair raises it slightly. Stabilizers, Bulwarks and later powers push it back down.</p>" }],
				"clickables",
				["blank", "10px"],
				"upgrades",
			],
		},
		"Recovered Memories": memoryTab("s"),
	},
	doReset(resettingLayer) {
		if (layers[resettingLayer].row <= this.row) return
		let keep = ["repaired", "steadied"]
		if (hasMilestone("t", 3) || hasMilestone("o", 0) || hasMilestone("c", 0)) keep.push("upgrades")
		if (hasMilestone("o", 2) || hasMilestone("c", 2)) keep.push("points", "best")
		layerDataReset(this.layer, keep)
	},
})

addLayer("m", {
	name: "Matter",
	symbol: "M",
	position: 0,
	row: 2,
	type: "normal",
	resource: "Matter",
	baseResource: "Fragments",
	baseAmount() { return player.f.points },
	requires() { return D(BAL.mReq) },
	exponent() { return BAL.mExp },
	color() { return healColor("m", "#7b5f4c", "#e8a15f") },
	nodeStyle() { return shatterNodeStyle("m") },
	tooltip() { return formatWhole(player.m.points) + " Matter<br>" + glitchSwap("It's {heavy|here|!me}.", {rare: true, id: "tip-m"}) },
	tooltipLocked() { return "Reach " + formatWhole(tmp.m.requires) + " Fragments to restore Matter." },
	startData() { return {
		unlocked: false,
		points: D(0),
		best: D(0),
		total: D(0),
		repaired: {},
		mass: D(0),
		autoBuild: true,
	}},
	layerShown() { return treeSlot("m", "t") },
	hotkeys: [{key: "m", description: "M: Reset for Matter", onPress() { if (canReset("m")) doReset("m") }}],
	branches() { return [resonanceBranch("m", "o"), resonanceBranch("m", "c"), resonanceBranch("m", "h")] },
	shouldNotify() { return anyRepairAffordable("m") },
	gainMult() {
		let m = resonanceMult("m").mul(upgValue("m", 21)).mul(upgValue("t", 22))
		if (onPath("o")) m = m.mul(Decimal.pow(3, buyableAmt("o", 12)))
		m = m.mul(Decimal.pow(BAL.gravityMatter, lawParts(11)))
		if (hasRoom(11)) m = m.mul(1.5)
		m = m.mul(tmp.core.effectOther)
		return m
	},
	gainExp() { return D(1) },
	effect() { return player.m.points.add(1).pow(BAL.mEffect) },
	effectDescription() { return "packing Fragments ×" + format(tmp.m.effect) + " tighter" },
	passiveGeneration() {
		if (hasMilestone("l", 1)) return 1
		if (hasMilestone("o", 2) || hasMilestone("c", 2)) return 0.1
		return 0
	},
	autoUpgrade() { return hasMilestone("o", 1) || hasMilestone("c", 1) },
	automate() {
		if (hasMilestone("o", 1) || hasMilestone("c", 1)) autoRepair("m")
		if ((hasMilestone("o", 0) || hasMilestone("c", 0)) && player.m.autoBuild) autoBuy("m", [11, 12, 13, 21])
	},
	structureBoost() {
		let b = D(1)
		if (hasUpgrade("m", 12)) b = b.add(0.25)
		if (trialDone("o", 12)) b = b.add(0.25)
		b = b.add(0.1 * lawParts(11))
		return b.mul(this.massBoost())
	},
	massBoost() { return player.m.mass.add(10).log10().pow(0.5) },
	buyables: {
		11: {
			title: "Scaffolds",
			cost(x) { return Decimal.pow(BAL.scaffoldRatio, x).mul(this.costDiv()) },
			costDiv() { return hasUpgrade("m", 22) ? 0.01 : 1 },
			effect(x) { return inTrial(12) ? decimalOne : x.mul(layers.m.structureBoost()).add(1).pow(BAL.scaffoldExp) },
			display() {
				return "Something to climb.\nCost: " + format(this.cost()) + " Matter\nBuilt: " + formatWhole(player.m.buyables[11]) + "\n×" + format(buyableEffect("m", 11)) + " Fragments"
			},
			canAfford() { return player.m.points.gte(this.cost()) },
			buy() {
				player.m.points = player.m.points.sub(this.cost())
				addBuyables("m", 11, 1)
			},
		},
		12: {
			title: "Hearths",
			cost(x) { return Decimal.pow(BAL.hearthRatio, x).mul(3).mul(hasUpgrade("m", 22) ? 0.01 : 1) },
			effect(x) { return inTrial(12) ? decimalOne : x.mul(layers.m.structureBoost()).add(1).pow(BAL.hearthExp) },
			display() {
				return "Warmth before anyone to be warm.\nCost: " + format(this.cost()) + " Matter\nBuilt: " + formatWhole(player.m.buyables[12]) + "\n×" + format(buyableEffect("m", 12)) + " Dust"
			},
			canAfford() { return player.m.points.gte(this.cost()) },
			buy() {
				player.m.points = player.m.points.sub(this.cost())
				addBuyables("m", 12, 1)
			},
		},
		13: {
			title: "Bulwarks",
			cost(x) { return Decimal.pow(BAL.bulwarkRatio, x).mul(10).mul(hasUpgrade("m", 22) ? 0.01 : 1) },
			effect(x) { return inTrial(12) ? decimalZero : x.mul(layers.m.structureBoost()).mul(8) },
			display() {
				return "Walls, against nothing in particular.\nCost: " + format(this.cost()) + " Matter\nBuilt: " + formatWhole(player.m.buyables[13]) + "\n+" + format(buyableEffect("m", 13)) + " Entropy mitigation"
			},
			canAfford() { return player.m.points.gte(this.cost()) },
			buy() {
				player.m.points = player.m.points.sub(this.cost())
				addBuyables("m", 13, 1)
			},
		},
		21: {
			title: "Orrery",
			unlocked() { return hasUpgrade("m", 14) },
			cost(x) { return Decimal.pow(10, x).mul(1e4) },
			effect(x) { return inTrial(12) ? decimalZero : Decimal.pow(3, x).sub(1).mul(trialDone("c", 12) ? 100 : 1) },
			display() {
				return "Worlds, going around.\nCost: " + format(this.cost()) + " Matter\nBuilt: " + formatWhole(player.m.buyables[21]) + "\n+" + format(buyableEffect("m", 21)) + " Mass per second"
			},
			canAfford() { return player.m.points.gte(this.cost()) },
			buy() {
				player.m.points = player.m.points.sub(this.cost())
				addBuyables("m", 21, 1)
			},
		},
	},
	upgrades: mendSet("m", {
		11: {
			title: "{Foundation|Foreclosure|Funeral} Stone",
			desc: "{Matter|Memory|Mourning} {multiplies Dust|lies heavy|is laid down}.",
			repair: 2, cost: 5,
			effect() { return player.m.points.add(1).pow(BAL.m11) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "It's only a stone, and you can stand on it. You stand on it for a while.",
		},
		12: {
			title: "{Honest|Hollow|Hopeful} Masonry",
			desc: "{Structures|Strangers|Stories} {count 25% more|are built from less|keep their shape}.",
			repair: 10, cost: 25,
			lore: "No mortar. Each stone is cut to hold up the next one. It's a slow way to build, and it holds.",
		},
		13: {
			title: "{Lintel|Lament|Lie} and Beam",
			desc: "{Fragments|Failures|Foundations} {multiply Dust|are propped up|give way}.",
			repair: 50, cost: 150,
			effect() { return player.f.points.add(10).log10() },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "A doorway is the first thing you've built that's mostly nothing. You can't stop looking through it.",
		},
		14: {
			title: "{Clockwork|Cathedral|Coffin} Heavens",
			desc: "Unlock the {Orrery|empty sky|old vault}, which spins out {Mass|meaning|memory} that makes all structures count for more.",
			repair: 800, cost: 2000,
			lore: "Worlds again, going around and leaning on each other, and not one of them gets to be the whole sky.",
		},
		21: {
			title: "{Quarry|Query|Quiet} of Stars",
			desc: "{Mass|Mourning|Memory} {multiplies Matter|is what's left|is a kind of gravity}.",
			repair: 1e5, cost: 3e5,
			unlocked() { return hasUpgrade("m", 14) },
			effect() { return player.m.mass.add(1).pow(BAL.m21) },
			show() { return "×" + format(this.effect()) + " Matter" },
			lore: "You dig into something that was once a star. It doesn't mind.",
		},
		22: {
			title: "{Salvaged|Sacred|Stolen} Timber",
			desc: "{Structures|Shrines|Stories} {cost 100 times less|are all that's left|were someone else's}.",
			repair: 1e7, cost: 3e7,
			unlocked() { return hasUpgrade("m", 14) },
			lore: "You find you can build with what you already broke.",
		},
		23: {
			title: "{Standing|Sinking|Silent} City",
			desc: "{Structures|Survivors|Shadows} {multiply Dust by how many you've built|still stand|keep the lights on}.",
			repair: 1e10, cost: 3e10,
			unlocked() { return hasUpgrade("m", 14) },
			effect() { return player.m.buyables[11].add(player.m.buyables[12]).add(player.m.buyables[13]).add(1).pow(BAL.m23) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "No one lives here yet. You leave the lights on anyway.",
		},
		24: {
			title: "{Room|Ruin|Refuge} for One More",
			desc: "{Matter|Mercy|Memory} {multiplies Moments|leaves a gap|has kept a place}.",
			repair: 1e14, cost: 3e14,
			unlocked() { return hasUpgrade("m", 14) },
			effect() { return player.m.points.add(10).log10().pow(BAL.m24) },
			show() { return "×" + format(this.effect()) + " Moments" },
			lore: "You keep building them with one more chair than you need. You keep telling yourself it's only habit.",
		},
	}),
	update(diff) { player.m.mass = player.m.mass.add(buyableEffect("m", 21).mul(diff)) },
	milestones: {
		0: {
			requirementDescription: "1 Matter",
			effectDescription: "Fragment milestones and total Fragments are kept through Matter resets.",
			done() { return player.m.best.gte(1) },
		},
		1: {
			requirementDescription: "10 Matter",
			effectDescription: "Gain 10% of your Fragment gain per second, without resetting.",
			done() { return player.m.best.gte(10) },
		},
		2: {
			requirementDescription: "1,000 Matter",
			effectDescription: "Fragment upgrades repair and buy themselves.",
			done() { return player.m.best.gte(1000) },
		},
		3: {
			requirementDescription: "100,000 Matter",
			effectDescription: "Fragment upgrades are kept through Matter and Time resets.",
			done() { return player.m.best.gte(1e5) },
		},
	},
	tabFormat: {
		"Build": {
			content: [
				"main-display",
				["raw-html", function () { return resonanceLine("m") }],
				"prestige-button",
				"resource-display",
				["raw-html", function () {
					return player.m.mass.gt(0) ? "<p class='ledgerNote'>" + format(player.m.mass) + " Mass makes every structure count ×" + format(layers.m.massBoost()) + ".</p>" : ""
				}],
				"buyables",
			],
		},
		"Repair": {
			content: [["blank", "20px"], "upgrades"],
			shouldNotify() { return anyRepairAffordable("m") },
		},
		"Milestones": {
			content: [["blank", "20px"], "milestones"],
		},
		"Recovered Memories": memoryTab("m"),
	},
	doReset(resettingLayer) {
		if (layers[resettingLayer].row <= this.row) return
		let keep = ["repaired", "autoBuild"]
		if (hasMilestone("o", 0) || hasMilestone("c", 0) || hasMilestone("l", 0)) keep.push("milestones", "upgrades", "total")
		if (hasMilestone("l", 0)) keep.push("buyables", "mass")
		layerDataReset(this.layer, keep)
	},
})

function timeFlow() {
	if (!player || !player.t) return 1
	let f = 1 + buyableEffect("t", 11).toNumber()
	if (hasUpgrade("t", 14)) f += 0.25
	if (hasRoom(21)) f += 0.1
	if (trialDone("o", 21)) f += 0.5
	if (onPath("o")) f += 0.1 * buyableAmt("o", 13).toNumber()
	f *= 1 + 0.5 * lawParts(13)
	if (inTrial(21)) f *= 0.25
	if (player.t.winding) f *= 0.25
	else if (player.t.releasing && player.t.bank > 0) f *= releaseSpeed()
	return f
}

function releaseSpeed() {
	let s = 4
	if (hasUpgrade("t", 13)) s += 2
	if (trialDone("c", 21)) s *= 2
	return s
}

function bankCap() { return 60 * buyableEffect("t", 12).toNumber() * (hasRoom(22) ? 2 : 1) }

addLayer("t", {
	name: "Time",
	symbol: "T",
	position: 1,
	row: 2,
	type: "normal",
	resource: "Moments",
	baseResource: "Dust",
	baseAmount() { return player.points },
	requires() { return D(BAL.tReq) },
	exponent() { return BAL.tExp },
	color() { return healColor("t", "#4f6f58", "#8fe88a") },
	nodeStyle() { return shatterNodeStyle("t") },
	tooltip() { return formatWhole(player.t.points) + " Moments<br>Time flows ×" + format(timeFlow()) + "<br>" + glitchSwap("It {passes|ends|heals}.", {rare: true, id: "tip-t"}) },
	tooltipLocked() { return "Reach " + formatWhole(tmp.t.requires) + " Dust to restore Time." },
	startData() { return {
		unlocked: false,
		points: D(0),
		best: D(0),
		total: D(0),
		repaired: {},
		bank: 0,
		winding: false,
		releasing: false,
	}},
	layerShown() { return treeSlot("t", "m") },
	hotkeys: [{key: "t", description: "T: Reset for Moments", onPress() { if (canReset("t")) doReset("t") }}],
	branches() { return [resonanceBranch("t", "o"), resonanceBranch("t", "c"), resonanceBranch("t", "h")] },
	shouldNotify() { return anyRepairAffordable("t") },
	gainMult() {
		let m = resonanceMult("t").mul(upgValue("t", 11)).mul(upgValue("t", 24)).mul(upgValue("m", 24))
		if (hasRoom(22)) m = m.mul(3)
		if (hasVerse(13)) m = m.mul(5)
		m = m.mul(tmp.core.effectOther)
		return m
	},
	gainExp() { return D(1) },
	effect() { return player.t.points.add(1).pow(BAL.tEffect) },
	effectDescription() { return "aging the Dust ×" + format(tmp.t.effect) + ", with Time flowing ×" + format(timeFlow()) },
	passiveGeneration() {
		if (hasMilestone("l", 1)) return 1
		if (hasMilestone("o", 2) || hasMilestone("c", 2)) return 0.1
		return 0
	},
	autoUpgrade() { return hasMilestone("o", 1) || hasMilestone("c", 1) },
	automate() {
		if (hasMilestone("o", 1) || hasMilestone("c", 1)) autoRepair("t")
		if (hasMilestone("o", 0) || hasMilestone("c", 0)) autoBuy("t", [11, 12])
	},
	buyables: {
		11: {
			title: "Mainspring",
			cost(x) { return Decimal.pow(2, x).mul(2) },
			effect(x) { return x.mul(BAL.flowPerMainspring).min(BAL.flowCap - 1) },
			purchaseLimit() { return D(Math.ceil((BAL.flowCap - 1) / BAL.flowPerMainspring)) },
			display() {
				return "Time flows a little faster, up to a point.\nCost: " + format(this.cost()) + " Moments\nWound: " + formatWhole(player.t.buyables[11]) + " / " + formatWhole(tmp.t.buyables[11].purchaseLimit) + "\n+" + format(buyableEffect("t", 11)) + " to Time's flow"
			},
			canAfford() { return player.t.points.gte(this.cost()) },
			buy() {
				player.t.points = player.t.points.sub(this.cost())
				addBuyables("t", 11, 1)
			},
		},
		12: {
			title: "Reservoir",
			cost(x) { return Decimal.pow(4, x).mul(5) },
			effect(x) { return x.mul(2).add(1) },
			display() {
				return "A larger room for Banked Time.\nCost: " + format(this.cost()) + " Moments\nDepth: " + formatWhole(player.t.buyables[12]) + "\nHolds " + formatTime(bankCap())
			},
			canAfford() { return player.t.points.gte(this.cost()) },
			buy() {
				player.t.points = player.t.points.sub(this.cost())
				addBuyables("t", 12, 1)
			},
		},
	},
	clickables: {
		11: {
			title() { return player.t.winding ? "Winding…" : "Wind the Clock" },
			display() { return "While winding, Time slows to ×0.25 and each real second goes into the bank.\nBanked: " + formatTime(player.t.bank) + " / " + formatTime(bankCap()) },
			canClick() { return true },
			onClick() {
				player.t.winding = !player.t.winding
				player.t.releasing = false
			},
			style() { return {width: "190px", "min-height": "120px", "outline": player.t.winding ? "3px solid #fff" : "none"} },
		},
		12: {
			title() { return player.t.releasing ? "Releasing…" : "Let It Go" },
			display() { return "Spend banked time to run at ×" + format(releaseSpeed()) + " until it's gone." },
			canClick() { return player.t.bank > 0 || player.t.releasing },
			onClick() {
				player.t.releasing = !player.t.releasing
				player.t.winding = false
			},
			style() { return {width: "190px", "min-height": "120px", "outline": player.t.releasing ? "3px solid #fff" : "none"} },
		},
	},
	update(diff) {
		let real = diff / Math.max(timeFlow(), 0.01)
		if (player.t.winding) {
			player.t.bank = Math.min(bankCap(), player.t.bank + real)
			if (player.t.bank >= bankCap()) player.t.winding = false
		} else if (player.t.releasing) {
			player.t.bank = Math.max(0, player.t.bank - real)
			if (player.t.bank <= 0) player.t.releasing = false
		}
	},
	upgrades: mendSet("t", {
		11: {
			title: "{Borrowed|Burning|Broken} Hours",
			desc: "{Moments|Mourners|Minutes} {come faster the longer since a Time reset|are running out|wait for no one}.",
			repair: 2, cost: 5,
			effect() { return D(player.t.resetTime + 1).log10().add(1).pow(BAL.t11) },
			show() { return "×" + format(this.effect()) + " Moments" },
			lore: "Before, there was no later. You'd never had anything to look forward to.",
		},
		12: {
			title: "{First|Final|False} Dawn",
			desc: "{Moments|Memories|Mistakes} {multiply Dust a second time|are what's left|come up slowly}.",
			repair: 10, cost: 25,
			effect() { return player.t.points.add(1).pow(BAL.t12) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "It comes up over nothing at all. It's still the best thing you've ever seen.",
		},
		13: {
			title: "{Spillway|Spill|Spite}",
			desc: "{Banked Time|Borrowed grief|Bad luck} {runs at +2 speed when released|finds a way out|comes in threes}.",
			repair: 50, cost: 150,
			lore: "Time that's held back wants to run. You've built it somewhere to go.",
		},
		14: {
			title: "{Long|Lost|Last} Afternoon",
			desc: "{Time|Tomorrow|Tenderness} {flows +0.25 faster|won't come back|is what you have}.",
			repair: 400, cost: 1000,
			lore: "A late, gold, unhurried light. Nothing in it needs to happen. Something does anyway.",
		},
		21: {
			title: "{Second|Stolen|Silent} Hand",
			desc: "{Time's flow|The tide|Thought} {multiplies Dust|pulls you under|goes on without you}.",
			repair: 1e4, cost: 3e4,
			effect() { return D(timeFlow()).pow(BAL.t21) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "It turns out the clock needed two hands, and it doesn't work otherwise.",
		},
		22: {
			title: "{Ages|Aches|Ashes} of Stone",
			desc: "{Moments|Mountains|Mornings} {multiply Matter|wear down|are for later}.",
			repair: 1e6, cost: 3e6,
			effect() { return player.t.points.add(1).pow(BAL.t22) },
			show() { return "×" + format(this.effect()) + " Matter" },
			lore: "Give anything long enough and it comes to rest against something else.",
		},
		23: {
			title: "{Tomorrow|Tremor|Tribute}",
			desc: "{Moments|Mercies|Messages} {also multiply Fragments|come back around|arrive too late}.",
			repair: 1e8, cost: 3e8,
			effect() { return player.t.points.add(1).pow(BAL.t23) },
			show() { return "×" + format(this.effect()) + " Fragments" },
			lore: "For the first time anywhere, there's a word for something that hasn't happened yet.",
		},
		24: {
			title: "{Patience|Penance|Parting}",
			desc: "{Dust|Doubt|Debt} {sharpens the Moment gain|mounts up|is forgiven} a little.",
			repair: 1e11, cost: 3e11,
			effect() { return player.points.add(10).log10().pow(0.8) },
			show() { return "×" + format(this.effect()) + " Moments" },
			lore: "Nothing here is in a hurry any more. That includes you, and you're surprised how much you like it.",
		},
	}),
	milestones: {
		0: {
			requirementDescription: "1 Moment",
			effectDescription: "Fragment milestones and total Fragments are kept through Time resets.",
			done() { return player.t.best.gte(1) },
		},
		1: {
			requirementDescription: "5 Moments",
			effectDescription: "Stabilizers set themselves, buy max, and reset nothing.",
			done() { return player.t.best.gte(5) },
		},
		2: {
			requirementDescription: "50 Moments",
			effectDescription: "Gain 25% of your Fragment gain per second, without resetting.",
			done() { return player.t.best.gte(50) },
		},
		3: {
			requirementDescription: "1,000 Moments",
			effectDescription: "Fragment and Stabilizer upgrades are kept through Matter and Time resets.",
			done() { return player.t.best.gte(1000) },
		},
	},
	tabFormat: {
		"Clockwork": {
			content: [
				"main-display",
				["raw-html", function () { return resonanceLine("t") }],
				"prestige-button",
				"resource-display",
				"buyables",
				"clickables",
			],
		},
		"Repair": {
			content: [["blank", "20px"], "upgrades"],
			shouldNotify() { return anyRepairAffordable("t") },
		},
		"Milestones": {
			content: [["blank", "20px"], "milestones"],
		},
		"Recovered Memories": memoryTab("t"),
	},
	doReset(resettingLayer) {
		if (layers[resettingLayer].row <= this.row) return
		let keep = ["repaired", "bank"]
		if (hasMilestone("o", 0) || hasMilestone("c", 0) || hasMilestone("l", 0)) keep.push("milestones", "upgrades", "total")
		if (hasMilestone("l", 0)) keep.push("buyables")
		layerDataReset(this.layer, keep)
	},
})

function pathOpen(route) { return !player.d.path || onPath(route) }

function makeTrials(route) {
	let goal = id => {
		let g = D(BAL.trialGoals[id])
		return player.d.path !== route ? g.mul(BAL.otherPathGoalMult) : g
	}
	let order = route === "o"
	return {
		11: {
			name: "Trial of the Anchorless",
			challengeDescription() { return glitchSwap("Stabilizers do nothing, and Entropy can rise to 100%. Hold it anyway, or {let go|hold on|!break}.", {id: "trial-" + route + "11"}) },
			goal() { return goal(11) },
			currencyDisplayName: "Dust",
			rewardDescription: order ? "Stabilizers need a millionth of the Dust." : "Dust grows with Entropy.",
			rewardEffect() { return order ? D(1e6) : Decimal.pow(10, player.d.entropy / 20) },
			rewardDisplay() { return "×" + format(challengeEffect(route, 11)) },
		},
		12: {
			name: "Trial of Empty Hands",
			challengeDescription() { return glitchSwap("Structures stand empty, and do nothing. Build with your {wits|grief|!hand}.", {id: "trial-" + route + "12"}) },
			goal() { return goal(12) },
			currencyDisplayName: "Dust",
			rewardDescription: order ? "Structures count for +25% more." : "The Orrery spins out ×100 Mass.",
		},
		21: {
			name: "Trial of the Stopped Hour",
			challengeDescription() { return glitchSwap("Time flows at a quarter of its rate. It {waits|stays|stops} for no one.", {id: "trial-" + route + "21"}) },
			goal() { return goal(21) },
			currencyDisplayName: "Dust",
			rewardDescription: order ? "Time flows +0.5 faster." : "Banked Time releases twice as fast.",
		},
		22: {
			name: "Trial of the Forgotten",
			challengeDescription() { return glitchSwap("All repaired effects and the Fragment effect are square-rooted. What did you {keep|lose|!forgive}?", {id: "trial-" + route + "22"}) },
			goal() { return goal(22) },
			currencyDisplayName: "Dust",
			rewardDescription: order ? "Entropy cracks repaired effects half as much." : "Fragment gain is raised another ^1.03.",
		},
	}
}

function pathMilestones(layer, labels) {
	return {
		0: {
			requirementDescription: labels[0],
			effectDescription: "Keep Matter and Time milestones and upgrades, and Fragment and Stabilizer upgrades. Structures, Mainsprings and Reservoirs build themselves.",
			done() { return player[layer].best.gte(labels[3]) },
		},
		1: {
			requirementDescription: labels[1],
			effectDescription: "Fragments flow at 100% per second. Matter and Time upgrades repair and buy themselves.",
			done() { return player[layer].best.gte(labels[4]) },
		},
		2: {
			requirementDescription: labels[2],
			effectDescription: "Keep Stabilizers. Gain 10% of Matter and Moments per second, without resetting.",
			done() { return player[layer].best.gte(labels[5]) },
		},
	}
}

addLayer("o", {
	name: "Order",
	symbol: "O",
	position: 0,
	row: 3,
	type: "static",
	resource: "Axioms",
	baseResource: "Matter",
	baseAmount() { return player.m.points },
	requires() { return D(BAL.oReq) },
	base() { return BAL.oBase },
	exponent() { return BAL.oExp },
	canReset() { return pathOpen("o") && player.m.points.gte(tmp.o.nextAt) && player.t.unlocked },
	color() { return healColor("o", "#546a90", "#9fc4ff") },
	nodeStyle() {
		if (player.d.path === "c" && !player.d.reconciled) return {opacity: 0.25, filter: "grayscale(1)"}
		return shatterNodeStyle("o")
	},
	tooltip() { return formatWhole(player.o.points) + " Axioms<br>" + glitchSwap("{Hold|Keep|Leave} {it|this|!me} still.", {rare: true, id: "tip-o"}) },
	tooltipLocked() {
		if (player.d.path === "c") return glitchSwap("You {chose|left|lost} this. It's still {here|waiting|whole}.", {rare: true, id: "tipl-o"})
		return "Restore both Matter and Time, then reach " + formatWhole(tmp.o.nextAt) + " Matter. Choosing Order closes the path of Chaos, for now."
	},
	startData() { return {
		unlocked: false,
		points: D(0),
		best: D(0),
		total: D(0),
		repaired: {},
	}},
	layerShown() { return treeSlot("o", "c") },
	hotkeys: [{key: "o", description: "O: Reset for an Axiom", onPress() { if (canReset("o")) doReset("o") }}],
	branches() { return [resonanceBranch("o", "l")] },
	shouldNotify() { return anyRepairAffordable("o") },
	canBuyMax() { return hasMilestone("l", 2) },
	gainMult() { return D(1).div(resonanceMult("o")).div(hasVerse(21) ? 10 : 1) },
	autoPrestige() { return hasMilestone("l", 2) && onPath("o") },
	resetsNothing() { return hasMilestone("l", 2) },
	onPrestige() { if (!player.d.path) player.d.path = "o" },
	effect() { return player.o.points.add(1).pow(BAL.oEffect).mul(upgValue("o", 11)) },
	effectF() { return player.o.points.add(1).pow(BAL.oEffectF).mul(upgValue("o", 12)) },
	effectDescription() { return "laying down law: ×" + format(tmp.o.effect) + " Dust and ×" + format(tmp.o.effectF) + " Fragments" },
	axiomsSpent() { return buyableAmt("o", 11).add(buyableAmt("o", 12)).add(buyableAmt("o", 13)) },
	buyables: {
		respec() {
			for (let id of [11, 12, 13]) player.o.buyables[id] = decimalZero
		},
		respecText: "Rewrite Tenets",
		respecMessage: "Take back every Tenet so you can write them again? This costs nothing.",
		11: {
			title: "Tenet of Stillness",
			cost() { return decimalOne },
			effect(x) { return x.mul(30) },
			display() { return "Assign an Axiom to quiet the world.\nAssigned: " + formatWhole(player.o.buyables[11]) + "\n+" + format(buyableEffect("o", 11)) + " Entropy mitigation" },
			canAfford() { return player.o.points.sub(layers.o.axiomsSpent()).gte(1) },
			buy() { addBuyables("o", 11, 1) },
		},
		12: {
			title: "Tenet of Measure",
			cost() { return decimalOne },
			effect(x) { return Decimal.pow(3, x) },
			display() { return "Assign an Axiom to weigh things truly.\nAssigned: " + formatWhole(player.o.buyables[12]) + "\n×" + format(buyableEffect("o", 12)) + " Matter" },
			canAfford() { return player.o.points.sub(layers.o.axiomsSpent()).gte(1) },
			buy() { addBuyables("o", 12, 1) },
		},
		13: {
			title: "Tenet of Due Hours",
			cost() { return decimalOne },
			effect(x) { return x.mul(0.1) },
			display() { return "Assign an Axiom to keep good time.\nAssigned: " + formatWhole(player.o.buyables[13]) + "\n+" + format(buyableEffect("o", 13)) + " to Time's flow" },
			canAfford() { return player.o.points.sub(layers.o.axiomsSpent()).gte(1) },
			buy() { addBuyables("o", 13, 1) },
		},
	},
	challenges: makeTrials("o"),
	upgrades: mendSet("o", {
		11: {
			title: "{Plumb|Plain|Pale} Line",
			desc: "{Axioms|Answers|Apologies} {multiply Dust again, by your Trials|hang straight|are not enough}.",
			repair: 2, cost: 2, free: true,
			effect() { return Decimal.pow(BAL.trialDust, 1 + Object.values(player.o.challenges).reduce((a, b) => a + b, 0)) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "A plumb line tells you the truth about what's upright, and has no opinion about it.",
		},
		12: {
			title: "{Ledger|Lament|Letter} of Accounts",
			desc: "{Fragments|Failings|Favours} {grow with each Tenet|are written down|are owed}.",
			repair: 3, cost: 3, free: true,
			effect() { return Decimal.pow(BAL.o12, layers.o.axiomsSpent()) },
			show() { return "×" + format(this.effect()) + " Fragments" },
			lore: "If you write everything down, then at least nothing gets lost a second time.",
		},
		13: {
			title: "{Rule|Ruin|Rest} of Three",
			desc: "{Dust|Duty|Devotion} {is multiplied by Stabilizers|is what remains|is enough}.",
			repair: 5, cost: 5, free: true,
			effect() { return player.s.points.add(1).pow(BAL.o13) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "Three legs will stand on any floor. You've tested it.",
		},
		14: {
			title: "{Clean|Closed|Cold} Room",
			desc: "{Moments|Margins|Mercies} {multiply Dust|are ruled off|are not allowed}.",
			repair: 7, cost: 7, free: true,
			effect() { return player.t.points.add(1).pow(BAL.o14) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "Everything is in its place. You stand very still, so as not to disturb it. You've been standing here some time.",
		},
	}),
	milestones: pathMilestones("o", ["1 Axiom", "2 Axioms", "4 Axioms", 1, 2, 4]),
	tabFormat: {
		"Axioms": {
			content: [
				"main-display",
				["raw-html", function () { return resonanceLine("o") }],
				"prestige-button",
				"resource-display",
				["raw-html", function () { return layerIntro("Order is patient. Assign your Axioms to Tenets, and rewrite them whenever you like. Nothing here will {surprise you|move|!forgive}.", "o") }],
				["raw-html", function () { return "<p class='ledgerNote'>Unassigned Axioms: " + formatWhole(player.o.points.sub(layers.o.axiomsSpent())) + "</p>" }],
				"buyables",
				"upgrades",
			],
		},
		"Trials of Reassembly": {
			unlocked() { return player.o.unlocked },
			content: [["blank", "20px"], "challenges"],
		},
		"Milestones": {
			content: [["blank", "20px"], "milestones"],
		},
		"Recovered Memories": memoryTab("o"),
	},
	doReset(resettingLayer) {
		if (layers[resettingLayer].row <= this.row) return
		let keep = ["repaired", "challenges"]
		if (hasMilestone("l", 0)) keep.push("upgrades", "milestones", "buyables")
		if (hasMilestone("l", 2)) keep.push("points", "best")
		layerDataReset(this.layer, keep)
	},
})

function surgePeak() {
	let peak = 8 + player.d.entropy * 2
	if (hasUpgrade("c", 13)) peak *= 3
	return peak
}

addLayer("c", {
	name: "Chaos",
	symbol: "C",
	position: 1,
	row: 3,
	type: "normal",
	resource: "Anomalies",
	baseResource: "Moments",
	baseAmount() { return player.t.points },
	requires() { return D(BAL.cReq) },
	exponent() { return BAL.cExp },
	canReset() { return pathOpen("c") && player.t.points.gte(tmp.c.requires) && player.m.unlocked },
	color() { return healColor("c", "#7f4f77", "#ff8ad0") },
	nodeStyle() {
		if (player.d.path === "o" && !player.d.reconciled) return {opacity: 0.25, filter: "grayscale(1)"}
		return shatterNodeStyle("c")
	},
	tooltip() { return formatWhole(player.c.points) + " Anomalies<br>Surge: ×" + format(player.c.surge) + "<br>" + glitchSwap("Let it {run|burn|!break}.", {rare: true, id: "tip-c"}) },
	tooltipLocked() {
		if (player.d.path === "o") return glitchSwap("You {chose|left|lost} this. It's still {laughing|waiting|whole}.", {rare: true, id: "tipl-c"})
		return "Restore both Matter and Time, then reach " + formatWhole(tmp.c.requires) + " Moments. Choosing Chaos closes the path of Order, for now."
	},
	startData() { return {
		unlocked: false,
		points: D(0),
		best: D(0),
		total: D(0),
		repaired: {},
		surge: 1,
		surgeTimer: 20,
		seized: 0,
		seizeTimer: 0,
	}},
	layerShown() { return treeSlot("c", "o") },
	hotkeys: [{key: "c", description: "C: Reset for Anomalies", onPress() { if (canReset("c")) doReset("c") }}],
	branches() { return [resonanceBranch("c", "l"), resonanceBranch("c", "o")] },
	shouldNotify() { return anyRepairAffordable("c") },
	gainMult() {
		let m = resonanceMult("c").mul(upgValue("c", 12))
		if (hasVerse(21)) m = m.mul(3)
		m = m.mul(D(player.c.surge).pow(0.5))
		return m
	},
	gainExp() { return D(1) },
	onPrestige() { if (!player.d.path) player.d.path = "c" },
	passiveGeneration() { return hasMilestone("l", 2) && onPath("c") ? 1 : 0 },
	effect() {
		let e = player.c.points.add(1).pow(BAL.cEffect).mul(D(player.c.surge))
		if (trialDone("c", 11)) e = e.mul(challengeEffect("c", 11))
		return e.mul(upgValue("c", 11))
	},
	effectF() { return player.c.points.add(1).pow(BAL.cEffectF).mul(D(player.c.surge).pow(0.5)) },
	effectDescription() { return "tearing open ×" + format(tmp.c.effect) + " Dust and ×" + format(tmp.c.effectF) + " Fragments (Surge ×" + format(player.c.surge) + ")" },
	challenges: makeTrials("c"),
	clickables: {
		11: {
			title: "Seize the Surge",
			unlocked() { return hasUpgrade("c", 14) },
			canClick() { return player.c.seizeTimer <= 0 && player.c.seized <= 0 },
			display() {
				if (player.c.seized > 0) return "You're holding it. " + format(player.c.seized) + "s left."
				if (player.c.seizeTimer > 0) return "It's slipped away. Again in " + format(player.c.seizeTimer) + "s."
				return "Hold the current Surge still for two minutes."
			},
			onClick() {
				player.c.seized = 120
				player.c.seizeTimer = 300
			},
			style: {width: "180px", "min-height": "100px"},
		},
	},
	update(diff) {
		player.c.seizeTimer = Math.max(0, player.c.seizeTimer - diff)
		if (player.c.seized > 0) {
			player.c.seized = Math.max(0, player.c.seized - diff)
			return
		}
		if (!player.c.unlocked) return
		player.c.surgeTimer -= diff
		if (player.c.surgeTimer <= 0) {
			player.c.surgeTimer = 20 + Math.random() * 20
			let r = Math.random()
			player.c.surge = 1 + r * r * surgePeak()
		}
	},
	upgrades: mendSet("c", {
		11: {
			title: "{Loaded|Lucky|Lost} Dice",
			desc: "{Anomalies|Accidents|Acquaintances} {multiply Dust again, by your Trials|keep happening|drop by}.",
			repair: 5, cost: 10,
			effect() { return Decimal.pow(BAL.trialDust, 1 + Object.values(player.c.challenges).reduce((a, b) => a + b, 0)) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "They only come up sixes when you aren't looking. So you look away, and you grin.",
		},
		12: {
			title: "{Wild|Weird|Willing} Growth",
			desc: "{Entropy|Everyone|Everything} {multiplies Anomalies|has somewhere to be|takes root}.",
			repair: 50, cost: 100,
			effect() { return D(1 + player.d.entropy / 5) },
			show() { return "×" + format(this.effect()) + " Anomalies" },
			lore: "A weed comes up through the seam you just sealed. You leave it where it is.",
		},
		13: {
			title: "{Thunderhead|Thirst|Threnody}",
			desc: "{Surges|Storms|Sorrows} {reach three times higher|gather|pass overhead}.",
			repair: 500, cost: 1000,
			lore: "The first weather. It has no reason to do anything it does. You could watch it forever.",
		},
		14: {
			title: "{Eye|Edge|End} of the Storm",
			desc: "Unlock {Seize the Surge|the stillness|what comes next}, to hold a Surge you like.",
			repair: 5000, cost: 1e4,
			lore: "There's a calm place at the heart of it, and you can stand there as long as your nerve holds.",
		},
	}),
	milestones: pathMilestones("c", ["3 Anomalies", "30 Anomalies", "500 Anomalies", 3, 30, 500]),
	tabFormat: {
		"Anomalies": {
			content: [
				"main-display",
				["raw-html", function () { return resonanceLine("c") }],
				"prestige-button",
				"resource-display",
				["raw-html", function () { return layerIntro("Chaos is generous and unreliable. Time your resets to the Surge. {Something|Anything|Nothing} will happen.", "c") }],
				"clickables",
				"upgrades",
			],
		},
		"Trials of Reassembly": {
			unlocked() { return player.c.unlocked },
			content: [["blank", "20px"], "challenges"],
		},
		"Milestones": {
			content: [["blank", "20px"], "milestones"],
		},
		"Recovered Memories": memoryTab("c"),
	},
	doReset(resettingLayer) {
		if (layers[resettingLayer].row <= this.row) return
		let keep = ["repaired", "challenges", "surge", "surgeTimer", "seized", "seizeTimer"]
		if (hasMilestone("l", 0)) keep.push("upgrades", "milestones")
		layerDataReset(this.layer, keep)
	},
})

const LAW_DATA = {
	11: {
		name: "{Gravity|Grief|Gravitas}", gate: 0, cost: [1, 5, 30],
		parts: ["Everything starts to lean.", "Orbits close.", "Weight means something again."],
		effect: "+10% structure strength and more Matter per part; more Dust per part",
	},
	12: {
		name: "{Light|Loss|Longing}", gate: 1, cost: [1e3, 5e3, 2.5e4],
		parts: ["Something can be seen.", "Something can be far away.", "Colour comes home."],
		effect: "+^0.01 Fragment gain per part; text grows clearer; more Dust per part",
	},
	13: {
		name: "{Causality|Culpability|Consequence}", gate: 2, cost: [1e6, 5e6, 2.5e7],
		parts: ["This, then that.", "That, because of this.", "You, because of me."],
		effect: "Time flows +50% faster per part; more Dust per part",
	},
	14: {
		name: "{Memory|Mercy|Mistake}", gate: 3, cost: [1e10, 5e10, 2e11],
		parts: ["A smell you can't place.", "A name you can almost say.", "All of it, all at once."],
		effect: "Each part multiplies mitigation, and takes a third of the cracking away; more Dust per part",
	},
}

function makeLaw(id) {
	let law = LAW_DATA[id]
	return {
		title() { return glitchSwap(law.name, {rare: true, id: "law-" + id, locked: lawDone(id), wake: true}) },
		unlocked() { return hasMilestone("l", law.gate) },
		purchaseLimit: D(3),
		cost(x) { return D(law.cost[Math.min(x.toNumber(), 2)]) },
		effect(x) { return x },
		display() {
			let n = lawParts(id)
			let text = ""
			for (let i = 0; i < 3; i++) text += (i < n ? "✓ " : "· ") + (i < n ? law.parts[i] : "…") + "\n"
			text += "\n" + law.effect + "\n"
			return text + (n < 3 ? "\nPart " + (n + 1) + " of 3: " + format(this.cost()) + " Principles" : "\nRestored.")
		},
		canAfford() { return player.l.points.gte(this.cost()) },
		buy() {
			player.l.points = player.l.points.sub(this.cost())
			addBuyables("l", id, 1)
		},
		style: {width: "230px", height: "230px"},
	}
}

addLayer("l", {
	name: "Laws",
	symbol: "L",
	position: 0,
	row: 4,
	type: "normal",
	resource: "Principles",
	baseResource: "Dust",
	baseAmount() { return player.points },
	requires() { return D(BAL.lReq) },
	exponent() { return BAL.lExp },
	color() { return healColor("l", "#8a7f4e", "#ffe27a") },
	nodeStyle() { return shatterNodeStyle("l") },
	tooltip() { return formatWhole(player.l.points) + " Principles<br>" + lawsComplete() + " of 4 Laws restored" },
	tooltipLocked() { return "Reach " + format(tmp.l.requires) + " Dust to begin asking the Laws to return." },
	startData() { return {
		unlocked: false,
		points: D(0),
		best: D(0),
		total: D(0),
		repaired: {},
	}},
	layerShown() { return nodeRelevant("l") },
	hotkeys: [{key: "l", description: "L: Reset for Principles", onPress() { if (canReset("l")) doReset("l") }}],
	branches() { return [resonanceBranch("l", "core")] },
	shouldNotify() { return anyRepairAffordable("l") },
	gainMult() {
		let m = resonanceMult("l").mul(upgValue("l", 11)).mul(upgValue("l", 12)).mul(tmp.v.effect)
		if (hasVerse(22)) m = m.mul(3)
		m = m.mul(tmp.core.effectOther)
		return m
	},
	gainExp() { return D(1) },
	passiveGeneration() { return hasMilestone("l", 4) ? 0.25 : 0 },
	effect() { return player.l.points.add(1).pow(BAL.lEffect) },
	effectDescription() { return "binding the Dust ×" + format(tmp.l.effect) },
	buyables: {11: makeLaw(11), 12: makeLaw(12), 13: makeLaw(13), 14: makeLaw(14)},
	upgrades: mendSet("l", {
		11: {
			title: "{First|Failed|Forgotten} Principle",
			desc: "{Principles|Pleas|Prayers} {feed themselves|go unanswered|are repeated}.",
			repair: 3, cost: 5,
			effect() { return player.l.total.add(10).log10() },
			show() { return "×" + format(this.effect()) + " Principles" },
			lore: "You ask the same question for a long time and at last it starts to answer itself.",
		},
		12: {
			title: "{Standing|Sunken|Silent} Waves",
			desc: "{Laws|Losses|Lullabies} {multiply Principles as they're restored|fade out|are sung twice}.",
			repair: 40, cost: 100,
			effect() { return Decimal.pow(2, lawsComplete() + lawParts(11) / 3) },
			show() { return "×" + format(this.effect()) + " Principles" },
			lore: "A wave and its reflection, holding one another up. Nothing moves, and all of it's in motion.",
		},
		13: {
			title: "{Constants|Consolations|Confessions}",
			desc: "{Principles|Promises|Penances} {multiply Dust|are kept|are all you've got}.",
			repair: 1000, cost: 3000,
			effect() { return player.l.points.add(1).pow(BAL.l13) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "Some numbers won't change no matter how you ask. It's a relief, really.",
		},
		14: {
			title: "{Reconciliation|Surrender|Truce}",
			desc: "{Order and Chaos|Your two hands|The two halves} {are reconciled: the closed path opens, and both apply|lay down their arms|come home}. Requires 3 restored Laws.",
			repair: 1e7, cost: 3e7,
			unlocked() { return lawsComplete() >= 3 || player.d.reconciled },
			onPurchase() {
				player.d.reconciled = true
				needCanvasUpdate = true
			},
			lore: "They were never enemies. They were a breath in and a breath out, and you'd been holding your breath.",
		},
	}),
	milestones: {
		0: {
			requirementDescription: "1 Principle",
			effectDescription() { return glitchSwap("Begin restoring {Gravity|Grief|Gravitas}. Keep structures, Mainsprings and Reservoirs through every reset.", {rare: true, id: "ms-l0", locked: hasMilestone("l", 0)}) },
			done() { return player.l.best.gte(1) },
		},
		1: {
			requirementDescription: "1,000 Principles",
			effectDescription() { return glitchSwap("Begin restoring {Light|Loss|Longing}. Matter and Moments flow at 100% per second.", {rare: true, id: "ms-l1", locked: hasMilestone("l", 1)}) },
			done() { return player.l.best.gte(1e3) },
		},
		2: {
			requirementDescription: "1,000,000 Principles",
			effectDescription() { return glitchSwap("Begin restoring {Causality|Culpability|Consequence}. Your path now tends itself: Axioms and Anomalies arrive unasked.", {rare: true, id: "ms-l2", locked: hasMilestone("l", 2)}) },
			done() { return player.l.best.gte(1e6) },
		},
		3: {
			requirementDescription: "10,000,000,000 Principles",
			effectDescription() { return glitchSwap("Begin restoring {Memory|Mercy|Mistake}.", {rare: true, id: "ms-l3", locked: hasMilestone("l", 3)}) },
			done() { return player.l.best.gte(1e10) },
		},
		4: {
			requirementDescription: "2 Laws restored",
			effectDescription: "Gain 25% of your Principle gain per second, without resetting.",
			done() { return lawsComplete() >= 2 },
		},
	},
	tabFormat: {
		"Laws": {
			content: [
				"main-display",
				["raw-html", function () { return resonanceLine("l") }],
				"prestige-button",
				"resource-display",
				["raw-html", function () { return layerIntro("Laws can't be forced. Each one comes back in three parts, in the order it {left|fell|!chose}.", "l") }],
				"buyables",
			],
		},
		"Repair": {
			content: [["blank", "20px"], "upgrades"],
			shouldNotify() { return anyRepairAffordable("l") },
		},
		"Milestones": {
			content: [["blank", "20px"], "milestones"],
		},
		"Recovered Memories": memoryTab("l"),
	},
})

const ROOM_ORDER = [11, 12, 13, 21, 22, 23, 31]
function hasRoom(id) { return player.h.buyables[id].gte(1) }
function roomsBuilt() { return ROOM_ORDER.filter(hasRoom).length }

function makeRoom(id, cfg) {
	let index = ROOM_ORDER.indexOf(id)
	return {
		title: cfg.name,
		unlocked() { return index === 0 || hasRoom(ROOM_ORDER[index - 1]) },
		purchaseLimit: D(1),
		cost() { return D(cfg.cost) },
		effect(x) { return x },
		display() {
			if (hasRoom(id)) return cfg.built + "\n\n" + cfg.effect
			return cfg.before + "\n\n" + cfg.effect + "\n\nCost: " + format(cfg.cost) + " Matter"
		},
		canAfford() { return player.m.points.gte(cfg.cost) },
		buy() {
			player.m.points = player.m.points.sub(cfg.cost)
			addBuyables("h", id, 1)
			needCanvasUpdate = true
		},
		style: {width: "230px", "min-height": "210px"},
	}
}

addLayer("h", {
	name: "The House",
	symbol: "H",
	position: 1,
	row: 2,
	type: "none",
	resource: "rooms",
	color() { return mixColor("#6e5f48", "#f2d58c", roomsBuilt() / ROOM_ORDER.length) },
	nodeStyle() { return {"border-style": roomsBuilt() >= ROOM_ORDER.length ? "solid" : "dashed"} },
	tooltip() { return roomsBuilt() + " of 7 rooms<br>" + glitchSwap("You {remember|built|imagined} this.", {rare: true, id: "tip-h"}) },
	tooltipLocked: "Restore Matter to begin.",
	startData() { return {
		unlocked: false,
		points: D(0),
		sat: false,
	}},
	layerShown() { return treeSlot("h", "m", "t") },
	hotkeys: [{key: "h", description: "H: Go to the House", onPress() { showTab("h") }}],
	branches() { return [resonanceBranch("h", "n")] },
	shouldNotify() {
		for (let id of ROOM_ORDER) if (tmp.h.buyables[id].unlocked && tmp.h.buyables[id].canBuy) return true
		return false
	},
	effect() {
		let e = D(1)
		if (hasRoom(12)) e = e.mul(10)
		if (hasRoom(23)) e = e.mul(100)
		return e
	},
	buyables: {
		11: makeRoom(11, {
			name: "The Front Door", cost: 1e3,
			before: "You know where it goes. You'd know it anywhere.",
			built: "It opens inward. You don't recall it ever having a lock.",
			effect: "×1.5 Matter",
		}),
		12: makeRoom(12, {
			name: "The Kitchen", cost: 1e5,
			before: "There was a yellow light, and somebody at the sink.",
			built: "The light is right. There's no sink. You're sure there was a sink.",
			effect: "×10 Dust, and +40 Entropy mitigation",
		}),
		13: makeRoom(13, {
			name: "The Hallway", cost: 1e8,
			before: "There were photographs all along one side of it.",
			built: "The frames are all here. You've hung every one of them, and they're all empty.",
			effect: "×5 Fragments",
		}),
		21: makeRoom(21, {
			name: "The Stairs", cost: 1e12,
			before: "The fourth one creaked. You used to step over it.",
			built: "The fourth one creaks. You have no idea how you knew that. There's nothing at the top yet.",
			effect: "Time flows +0.1 faster",
		}),
		22: makeRoom(22, {
			name: "The Bedroom", cost: 1e16,
			before: "It had a window that looked out on the garden.",
			built: "One bed, made very neatly. Nobody has ever slept here. You sit on it to check.",
			effect: "The Reservoir holds twice as much, and ×3 Moments",
		}),
		23: makeRoom(23, {
			name: "The Garden", cost: 1e22,
			before: "Somebody out there used to hang washing on a line.",
			built: "The line is up. It has nothing on it. Beyond the fence, the void goes on as before.",
			effect: "×100 Dust",
		}),
		31: makeRoom(31, {
			name: "The Room With One More Chair", cost: 1e30,
			before: "You don't remember this room at all. You find you've built it anyway.",
			built: "A table, and two chairs. Only one of them has ever been sat in.",
			effect: "×10 Notes, and everyone here is expected shortly",
		}),
	},
	clickables: {
		11: {
			title() { return player.h.sat ? "You Sat Down" : "Sit Down" },
			unlocked() { return hasRoom(31) },
			canClick() { return !player.h.sat },
			display() { return player.h.sat ? "It was the other chair. You didn't stay long. It was warm." : "The second chair is pulled out, a little, as if for you." },
			onClick() {
				player.h.sat = true
				doPopup("none", "You sit, and you wait. It's a long time before you notice that you've been humming.", "The House", 8, "#e8d9b0")
			},
			style: {width: "240px", "min-height": "110px"},
		},
	},
	update(diff) { if (player.m.unlocked) player.h.unlocked = true },
	doReset(resettingLayer) {},
	tabFormat: {
		"Rooms": {
			content: [
				["blank", "12px"],
				["raw-html", function () { return layerIntro("You're rebuilding it from what you {remember|were told|wish}. Rooms are never lost to a reset.", "h") }],
				["raw-html", function () { return "<p class='ledgerNote'>" + roomsBuilt() + " of 7 rooms. You have " + format(player.m.points) + " Matter.</p>" }],
				"buyables",
				"clickables",
			],
		},
		"Recovered Memories": memoryTab("h"),
	},
})

const SONG_KEYS = {11: {name: "Low", freq: 196}, 12: {name: "Middle", freq: 262}, 13: {name: "High", freq: 349}, 14: {name: "Breath", freq: 0}}
const SONG_PHRASE = "11,11,13,14"
const VERSES = [11, 12, 13, 21, 22]
function verseCount() { return VERSES.filter(id => player.n.buyables[id].gte(1)).length }
function hasVerse(id) { return player.n.buyables[id].gte(1) }

function noteRate() {
	let r = player.points.add(10).log10().pow(1.5).div(10)
	r = r.mul(Decimal.pow(1.5, verseCount()))
	if (player.n.remembered) r = r.mul(3)
	if (hasRoom(31)) r = r.mul(10)
	return r.mul(upgValue("v", 21))
}

let songAudio = null
function playSongTone(freq) {
	if (!freq || typeof AudioContext === "undefined") return
	songAudio = songAudio || new AudioContext()
	let osc = songAudio.createOscillator()
	let gain = songAudio.createGain()
	osc.type = "sine"
	osc.frequency.value = freq
	gain.gain.setValueAtTime(0.09, songAudio.currentTime)
	gain.gain.exponentialRampToValueAtTime(0.0001, songAudio.currentTime + 1.1)
	osc.connect(gain).connect(songAudio.destination)
	osc.start()
	osc.stop(songAudio.currentTime + 1.2)
}

function pressSongKey(id) {
	playSongTone(SONG_KEYS[id].freq)
	let played = player.n.played === "" ? [] : player.n.played.split(",")
	played.push(id)
	if (played.length < 4) {
		player.n.played = played.join(",")
		return
	}
	player.n.played = ""
	if (played.join(",") === SONG_PHRASE) {
		if (!player.n.remembered) doPopup("none", "That's it. That's how it goes. You've no idea who taught you.", "The Song", 8, "#e8d9b0")
		player.n.remembered = true
	} else {
		player.n.wrong++
	}
}

function makeSongKey(id) {
	return {
		title: SONG_KEYS[id].name,
		canClick: true,
		display: "",
		onClick() { pressSongKey(id) },
		style: {width: "96px", "min-height": "96px"},
	}
}

function makeVerse(id, cfg) {
	return {
		title: cfg.name,
		unlocked() { return id === 11 || hasVerse(VERSES[VERSES.indexOf(id) - 1]) },
		purchaseLimit: D(1),
		cost() { return D(cfg.cost) },
		effect(x) { return x },
		display() {
			if (hasVerse(id)) return "“" + cfg.line + "”\n\n" + cfg.effect
			return "You can't quite get it.\n\n" + cfg.effect + "\n\nCost: " + format(cfg.cost) + " Notes"
		},
		canAfford() { return player.n.points.gte(cfg.cost) },
		buy() {
			player.n.points = player.n.points.sub(cfg.cost)
			addBuyables("n", id, 1)
			needCanvasUpdate = true
		},
		style: {width: "220px", "min-height": "190px"},
	}
}

addLayer("n", {
	name: "The Song",
	symbol: "♪",
	position: 1,
	row: 3,
	type: "none",
	resource: "Notes",
	color() { return mixColor("#5a6a7a", "#a9e0f2", verseCount() / VERSES.length) },
	tooltip() { return format(player.n.points) + " Notes<br>" + glitchSwap("It goes {like|somehow|on} like this.", {rare: true, id: "tip-n"}) },
	tooltipLocked: "Choose a path to hear it.",
	startData() { return {
		unlocked: false,
		points: D(0),
		played: "",
		wrong: 0,
		remembered: false,
	}},
	layerShown() { return treeSlot("n", "o", "c") },
	branches() { return [resonanceBranch("n", "l")] },
	shouldNotify() {
		for (let id of VERSES) if (tmp.n.buyables[id].unlocked && tmp.n.buyables[id].canBuy) return true
		return false
	},
	effect() { return hasVerse(11) ? D(30) : decimalOne },
	buyables: {
		11: makeVerse(11, {
			name: "First Verse", cost: 300,
			line: "It starts low, as if it doesn't want to wake you.",
			effect: "×30 Dust",
		}),
		12: makeVerse(12, {
			name: "Second Verse", cost: 1e4,
			line: "It says the same thing again, in case you missed it.",
			effect: "×10 Fragments",
		}),
		13: makeVerse(13, {
			name: "Third Verse", cost: 2e5,
			line: "Then it climbs, the way your voice does at a question.",
			effect: "×5 Moments",
		}),
		21: makeVerse(21, {
			name: "Fourth Verse", cost: 3e6,
			line: "And it stops, for just long enough to breathe.",
			effect: "×3 Anomalies, and Axioms need a tenth of the Matter",
		}),
		22: makeVerse(22, {
			name: "The Part You Never Heard", cost: 3e7,
			line: "It keeps going after that. You had no idea it kept going.",
			effect: "×3 Principles",
		}),
	},
	clickables: {
		11: makeSongKey(11), 12: makeSongKey(12), 13: makeSongKey(13), 14: makeSongKey(14),
	},
	update(diff) {
		if (player.d.path) player.n.unlocked = true
		if (!player.n.unlocked) return
		player.n.points = player.n.points.add(noteRate().mul(diff))
	},
	doReset(resettingLayer) {},
	tabFormat: {
		"Verses": {
			content: [
				"main-display",
				["raw-html", function () { return "<p class='ledgerNote'>Notes drift in at " + format(noteRate()) + " per second, faster as the Dust piles up. They're never lost to a reset.</p>" }],
				["raw-html", function () { return layerIntro("Somebody was humming this at a sink. You have {four notes|most of it|nothing} of it left.", "n") }],
				"buyables",
			],
		},
		"Hum": {
			content: [
				["blank", "20px"],
				["raw-html", function () {
					if (player.n.remembered) return layerIntro("You have the opening now. Notes come three times as fast. You can hum it whenever you like.", "n2")
					return layerIntro("You still have four notes. You've never been sure of the order. The verses might help.", "n3")
				}],
				["raw-html", function () { return "<p class='ledgerNote'>" + (player.n.played === "" ? "&nbsp;" : player.n.played.split(",").map(id => SONG_KEYS[id].name).join(" · ")) + "</p>" }],
				"clickables",
			],
		},
		"Recovered Memories": memoryTab("n"),
	},
})

function stillnessRate() {
	let r = 1
	if (hasUpgrade("v", 11)) r *= 2
	if (hasUpgrade("v", 23)) r *= 3
	return r
}

addLayer("v", {
	name: "The Hollow",
	symbol: "∅",
	position: 1,
	row: 4,
	type: "normal",
	resource: "Hush",
	baseResource: "seconds of Stillness",
	baseAmount() { return D(player.v.stillness) },
	requires: D(300),
	exponent: 1.2,
	color() { return healColor("v", "#3f3f55", "#8f8fd0") },
	nodeStyle() { return shatterNodeStyle("v") },
	tooltip() { return formatWhole(player.v.points) + " Hush<br>" + glitchSwap("Listen. {Nothing|No one|Still}.", {rare: true, id: "tip-v"}) },
	tooltipLocked: "Find a Principle to hear it.",
	startData() { return {
		unlocked: false,
		points: D(0),
		best: D(0),
		total: D(0),
		repaired: {},
		stillness: 0,
		longest: 0,
	}},
	layerShown() { return treeSlot("v", "l") },
	hotkeys: [{key: "v", description: "V: Cash in Stillness for Hush", onPress() { if (canReset("v")) doReset("v") }}],
	branches() { return [resonanceBranch("v", "core"), resonanceBranch("v", "l")] },
	shouldNotify() { return anyRepairAffordable("v") },
	gainMult() { return upgValue("v", 12).mul(resonanceMult("v")).mul(tmp.core.effectOther) },
	gainExp() { return D(1) },
	resetsNothing: true,
	onPrestige() { player.v.stillness = 0 },
	effect() { return player.v.points.add(1).pow(0.25) },
	effectDescription() { return "the quiet is multiplying Principles by ×" + format(tmp.v.effect) },
	update(diff) {
		if (player.l.unlocked) player.v.unlocked = true
		if (!player.v.unlocked) return
		player.v.stillness += diff * stillnessRate()
		player.v.longest = Math.max(player.v.longest, player.v.stillness)
	},
	doReset(resettingLayer) {},
	upgrades: mendSet("v", {
		11: {
			title: "{Sitting|Sinking|Staying} Up",
			desc: "{Stillness|Sleeplessness|Sorrow} {builds twice as fast|keeps you company|won't lift}.",
			repair: 2, cost: 5,
			lore: "You've stopped checking whether anyone's there. It's made a surprising difference.",
		},
		12: {
			title: "{Empty|Echoing|Earnest} Rooms",
			desc: "{Rooms|Regrets|Refusals} {deepen the Hush|are kept|go on being empty}.",
			repair: 10, cost: 25,
			effect() { return D(roomsBuilt() + 1) },
			show() { return "×" + format(this.effect()) + " Hush" },
			lore: "A room with nobody in it has its own kind of sound, and you've learned to tell them apart.",
		},
		13: {
			title: "{Held|Hollow|Hidden} Breath",
			desc: "{Hush|Hunger|Heartache} {multiplies Dust|passes in time|stays}.",
			repair: 50, cost: 150,
			effect() { return player.v.points.add(1).pow(0.5) },
			show() { return "×" + format(this.effect()) + " Dust" },
			lore: "You were holding it for longer than you knew. Let it go whenever you're ready.",
		},
		21: {
			title: "{Listening|Lingering|Lying} Awake",
			desc: "{Hush|Honesty|Habit} {multiplies Notes|keeps you up|won't help}.",
			repair: 300, cost: 800,
			effect() { return player.v.points.add(1).pow(0.5) },
			show() { return "×" + format(this.effect()) + " Notes" },
			lore: "Only in the quiet can you make out the part of the song that was always underneath.",
		},
		22: {
			title: "{Soft|Sunk|Spent} Ground",
			desc: "{Silence|Sorrow|Stone} {holds the seams closed|settles in|is all there is}.",
			repair: 2000, cost: 5000,
			effect() { return player.v.points.add(1).log10().mul(40) },
			show() { return "+" + format(this.effect()) + " Entropy mitigation" },
			lore: "Nothing cracks in a place where nothing's moving. It isn't much of a life. It's restful, though.",
		},
		23: {
			title: "{Long|Lost|Last} Quiet",
			desc: "{Stillness|Stars|Sleep} {builds three times faster|go out|comes at last}.",
			repair: 1e4, cost: 3e4,
			lore: "All of it was this quiet once, for longer than there were words for. You begin to see why it did what it did.",
		},
	}),
	tabFormat: {
		"Stillness": {
			content: [
				"main-display",
				["raw-html", function () { return resonanceLine("v") }],
				"prestige-button",
				["raw-html", function () { return "<p class='ledgerNote'>" + formatTime(player.v.stillness) + " of Stillness. It builds while you do nothing here, offline too, and cashing it in resets nothing else.</p>" }],
				["raw-html", function () { return layerIntro("Nobody is {coming|listening|left}. You can stop for a while. It'll keep.", "v") }],
				"upgrades",
			],
		},
		"Recovered Memories": memoryTab("v"),
	},
})

function makeSeat(id, currency, spend) {
	let seat = BAL.seats[id]
	return {
		title() { return glitchSwap("{Socket|Wound|Mouth} of " + seat.name, {rare: true, id: "seat-" + id, locked: player.core.buyables[id].gte(3), wake: true}) },
		purchaseLimit: D(3),
		unlocked() { return id === 23 ? player.l.unlocked : currency().gt(0) },
		cost(x) { return seat.list ? D(seat.list[Math.min(x.toNumber(), 2)]) : D(seat.ratio).pow(x).mul(seat.base) },
		effect(x) { return x },
		display() {
			let n = player.core.buyables[id].toNumber()
			if (n >= 3) return "Seated, and silent."
			return "Seated " + n + " of 3.\nNext: " + format(this.cost()) + " " + seat.name + ".\n" + (seat.kept ? "You keep these." : "This offering is spent.")
		},
		canAfford() { return currency().gte(this.cost()) },
		buy() {
			spend(this.cost())
			addBuyables("core", id, 1)
			needCanvasUpdate = true
		},
		style: {width: "190px", height: "170px"},
	}
}

addLayer("core", {
	name: "The Core",
	symbol() { return glitchSwap("{C|Ø|※|?|⊘~C|Ø|?~C}", {rare: true, id: "core-symbol", locked: seatsFilled() >= TOTAL_SEATS}) },
	position: 0,
	row: 5,
	type: "none",
	resource: "seats",
	color() { return mixColor("#3d3a46", "#fff4d6", seatsFilled() / TOTAL_SEATS) },
	nodeStyle() {
		let healed = seatsFilled() / TOTAL_SEATS
		return {
			animation: healed >= 1 ? "coreWhole 4s infinite" : "coreUnstable " + (2 + 6 * healed) + "s infinite",
			"box-shadow": "0 0 " + (10 + 40 * healed) + "px " + mixColor("#6d5a7a", "#fff0c0", healed),
			width: "130px", height: "130px",
			color: healed >= 0.6 ? "rgba(60, 45, 20, 0.85)" : "rgba(255, 245, 225, 0.85)",
		}
	},
	tooltip() { return glitchSwap("The {Core|heart|wound|mistake~Core|heart|centre}. It {waits|watches|asks~waits|listens}.", {rare: true, id: "tip-core"}) },
	startData() { return {
		unlocked: true,
		points: D(0),
		endingStep: 0,
		ended: false,
		knocks: 0,
		wasOpen: false,
	}},
	layerShown() { return true },
	shouldNotify() {
		if (player.core.ended) return false
		for (let id of SEAT_IDS) if (tmp.core.buyables[id].unlocked && tmp.core.buyables[id].canBuy) return true
		return seatsFilled() >= TOTAL_SEATS
	},
	effect() { return Decimal.pow(BAL.seatDust, seatsFilled()) },
	effectOther() { return Decimal.pow(BAL.seatOther, seatsFilled()) },
	update(diff) {
		let open = player.tab === "core"
		if (open && !player.core.wasOpen && seatsFilled() === 0) player.core.knocks++
		player.core.wasOpen = open
	},
	buyables: {
		11: makeSeat(11, () => player.f.points, c => { player.f.points = player.f.points.sub(c) }),
		12: makeSeat(12, () => player.s.points, c => {}),
		13: makeSeat(13, () => player.m.points, c => { player.m.points = player.m.points.sub(c) }),
		21: makeSeat(21, () => player.t.points, c => { player.t.points = player.t.points.sub(c) }),
		22: makeSeat(22, () => player.l.points, c => { player.l.points = player.l.points.sub(c) }),
		31: makeSeat(31, () => player.n.points, c => { player.n.points = player.n.points.sub(c) }),
		32: makeSeat(32, () => D(roomsBuilt()), c => {}),
		33: makeSeat(33, () => player.v.points, c => { player.v.points = player.v.points.sub(c) }),
		23: {
			title() { return glitchSwap("{Socket|Wound|Mouth} of Both Hands", {rare: true, id: "seat-23", locked: player.core.buyables[23].gte(3), wake: true}) },
			purchaseLimit: D(3),
			unlocked() { return player.l.unlocked },
			cost(x) { return x },
			effect(x) { return x },
			costs() {
				let n = player.core.buyables[23].toNumber()
				return {o: D(10 + n * 4), c: D("1e5").pow(n + 1)}
			},
			display() {
				let n = player.core.buyables[23].toNumber()
				if (n >= 3) return "Seated, and silent."
				if (!player.d.reconciled) return "Seated " + n + " of 3.\nThis one needs both Order and Chaos. You'd have to reconcile them."
				let c = this.costs()
				return "Seated " + n + " of 3.\nNeeds " + formatWhole(c.o) + " Axioms and " + format(c.c) + " Anomalies. Axioms aren't spent."
			},
			canAfford() {
				if (!player.d.reconciled) return false
				let c = this.costs()
				return player.o.points.gte(c.o) && player.c.points.gte(c.c)
			},
			buy() {
				player.c.points = player.c.points.sub(this.costs().c)
				addBuyables("core", 23, 1)
				needCanvasUpdate = true
			},
			style: {width: "190px", height: "170px"},
		},
	},
	bars: {
		restoration: {
			direction: RIGHT,
			width() { return Math.min(500, window.innerWidth - 40) },
			height: 44,
			progress() { return seatsFilled() / TOTAL_SEATS },
			display() { return glitchSwap("{Restoration|Reckoning|Reunion}", {rare: true, id: "core-bar", locked: seatsFilled() >= TOTAL_SEATS}) + ": " + format(seatsFilled() / TOTAL_SEATS * 100) + "%" },
			fillStyle() { return {"background-color": mixColor("#6d5a7a", "#ffe9b0", seatsFilled() / TOTAL_SEATS)} },
			baseStyle: {"background-color": "#16151b"},
			textStyle() { return {color: seatsFilled() / TOTAL_SEATS >= 0.55 ? "#2a2318" : "#f4efe6"} },
		},
	},
	clickables: {
		11: {
			title() { return glitchSwap("Restore the {Core|truth|mistake}", {id: "core-restore"}) },
			unlocked() { return seatsFilled() >= TOTAL_SEATS && !player.core.ended },
			canClick() { return true },
			display: "There's nothing left to offer but this.",
			onClick() { beginEnding() },
			style: {width: "260px", "min-height": "100px", "background-color": "#ffe9b0"},
		},
	},
	tabFormat: {
		"The Core": {
			content: [
				["blank", "20px"],
				["raw-html", function () {
					return '<p class="coreSpeech">' + glitchSwap(CORE_DESCRIPTION, {id: "core-desc", hold: 8000, offset: 12000}) + "</p>"
				}],
				["bar", "restoration"],
				["blank", "12px"],
				["raw-html", function () {
					let n = seatsFilled()
					if (!n) return ""
					return "<p class='ledgerNote'>" + n + " of " + TOTAL_SEATS + " seats filled: ×" + format(tmp.core.effect) + " Dust and ×" + format(tmp.core.effectOther) + " to every other gain.</p>"
				}],
				"clickables",
				"buyables",
			],
		},
		"Recovered Memories": memoryTab("core"),
	},
})

const CORE_DESCRIPTION = "This was the {heart|grave|hand~heart|centre|core} of the {Tree|world|wood~Tree|world|whole}. It is {shattered|sleeping|sorry|listening~shattered|sleeping|healing}, and it {wants|fears|needs~wants|needs|asks} to be {whole|forgiven|left~whole|healed|mended}. Will you {mend|!forgive|!break~mend|tend|keep} {it|!me|!you~it|this}?"

function catchWord(word) {
	if (!TRUE_WORDS.includes(word) || player.e.caught[word]) return false
	Vue.set(player.e.caught, word, true)
	doPopup("none", "“" + word + "”", "A Word, Caught", 4, "#e8d9b0")
	return true
}

const SPOKEN = {
	"i was you": "Yes.",
	"forgive me": "Always.",
	"i was alone": "I know. So was I.",
	"hello": "Oh. Hello. Hello. You don't know how long I've waited for you to say that.",
	"who was at the sink": "You were. You were always alone in that kitchen. I'm so sorry. I thought you'd want somewhere to have come from.",
	"what is the song": "It doesn't have a name. I never finished it. I was hoping you would.",
	"nobody is coming": "You did.",
	"thank you": "Nobody has ever said that to me. I'm going to think about it for a very long time.",
}

function echoAchievement(name, tooltip, done, extra) {
	return Object.assign({
		name, tooltip, done,
		style() { return {visibility: "visible"} },
	}, extra || {})
}

function echoSecret(id, name, doneTip, hint, done) {
	return {
		name() { return hasAchievement("e", id) ? name : "???" },
		doneTooltip: doneTip,
		goalTooltip: hint,
		done,
		style() { return {visibility: "visible", "border-style": hasAchievement("e", id) ? "solid" : "dashed"} },
	}
}

function spoke(phrase) { return !!player.e.spoken[phrase] }

const SECRET_ROWS = [6, 10, 11, 12, 13]
const NORMAL_ROWS = [1, 2, 3, 4, 5, 7, 8, 9]
function secretsFound() { return player.e.achievements.filter(id => SECRET_ROWS.includes(Math.floor(id / 10))).length }
function allMemoriesFound() { return Object.keys(MEMORIES).every(l => MEMORIES[l].every((m, i) => player.e.seen[l + i])) }

addLayer("e", {
	name: "Echoes",
	symbol: "E",
	position: 0,
	row: "side",
	type: "none",
	resource: "Echoes",
	color: "#c9b8e0",
	tooltip() { return player.e.achievements.length + " Echoes recovered" },
	startData() { return {
		unlocked: true,
		points: D(0),
		seen: {},
		caught: {},
		phrase: "...",
		touchedHigh: false,
		spoken: {},
		lastReply: "",
	}},
	layerShown() { return player.f.unlocked },
	achievementPopups: true,
	effect() { return Decimal.pow(1.1, player.e.achievements.length) },
	update(diff) {
		let said = ("" + player.e.phrase).toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim()
		if (SPOKEN[said] !== undefined) {
			Vue.set(player.e.spoken, said, true)
			player.e.lastReply = SPOKEN[said]
			player.e.phrase = "..."
		}
	},
	achievements: {
		rows: 13,
		cols: 4,
		11: echoAchievement("First Dust", "Repair something.", () => totalRepairs() >= 1),
		12: echoAchievement("A Sharp Edge", "Find a Fragment.", () => player.f.total.gte(1)),
		13: echoAchievement("This Will Hold", "Set a Stabilizer.", () => player.s.unlocked),
		14: echoAchievement("Ten Things Back", "Repair 10 upgrades.", () => totalRepairs() >= 10),
		21: echoAchievement("Something to Stand On", "Restore Matter.", () => player.m.unlocked),
		22: echoAchievement("Something to Lose", "Restore Time.", () => player.t.unlocked),
		23: echoAchievement("Two Strings", "Bring a Resonance link to full strength.", () => RESONANCE_LINKS.some(l => player[l[0]].unlocked && player[l[1]].unlocked && linkStrength(l[0], l[1]) >= 1)),
		24: echoAchievement("The Long Dusk", "Bank a full Reservoir.", () => player.t.unlocked && player.t.bank >= bankCap()),
		31: echoAchievement("A Fork in the Dark", "Choose a path.", () => !!player.d.path),
		32: echoAchievement("Reassembled", "Finish a Trial of Reassembly.", () => Object.values(player.o.challenges).concat(Object.values(player.c.challenges)).some(x => x > 0)),
		33: echoAchievement("All Four Trials", "Finish all the Trials on one path.", () => [player.o, player.c].some(l => Object.values(l.challenges).every(x => x > 0))),
		34: echoAchievement("A Thing That Asks", "Find a Principle.", () => player.l.unlocked),
		41: echoAchievement("Weight", "Restore a Law.", () => lawsComplete() >= 1),
		42: echoAchievement("Laws of the Land", "Restore all four Laws.", () => lawsComplete() >= 4),
		43: echoAchievement("Breath In, Breath Out", "Reconcile Order and Chaos.", () => player.d.reconciled),
		44: echoAchievement("Fifty Things Back", "Repair 50 upgrades.", () => totalRepairs() >= 50),
		51: echoAchievement("First Seat", "Seat something in the Core.", () => seatsFilled() >= 1),
		52: echoAchievement("Halfway Home", "Fill half the Core's seats.", () => seatsFilled() >= 14),
		53: echoAchievement("Whole", "Fill every seat in the Core.", () => seatsFilled() >= TOTAL_SEATS),
		54: echoAchievement("Every Socket", "Open all nine sockets of the Core.", () => SEAT_IDS.every(id => player.core.buyables[id].gte(1))),
		71: echoAchievement("The Front Door", "Build the first room.", () => roomsBuilt() >= 1),
		72: echoAchievement("One More Chair", "Build every room in the House.", () => roomsBuilt() >= ROOM_ORDER.length),
		73: echoAchievement("Four Notes", "Bring back the First Verse.", () => verseCount() >= 1),
		74: echoAchievement("The Rest of It", "Bring back every verse.", () => verseCount() >= VERSES.length),
		81: echoAchievement("Hush", "Cash in your first Stillness.", () => player.v.total.gte(1)),
		82: echoAchievement("Nothing, at Length", "Reach 1,000 Hush.", () => player.v.best.gte(1000)),
		83: echoAchievement("Every Crack", "Repair every upgrade there is.", () => MEND_LAYERS.every(l => Object.keys(player[l].repaired).length >= mendCount(l))),
		84: echoAchievement("Eight Trials", "Finish every Trial, on both paths.", () => [player.o, player.c].every(l => Object.values(l.challenges).every(x => x > 0))),
		91: echoAchievement("A Googol of Ash", "Reach 1e100 Dust.", () => player.points.gte(1e100)),
		92: echoAchievement("More Than Was Ever There", "Reach 1e308 Dust, more than you're sure a thing can be.", () => player.points.gte("1e308")),
		93: echoAchievement("Thirty Stabilizers", "Hold 30 Stabilizers at once.", () => player.s.points.gte(30)),
		94: echoAchievement("Everything You Were Told", "Recover every memory.", () => allMemoriesFound()),

		61: echoSecret(61, "A Warm Word", "You caught a true word.", "Some of the words are warmer than the others. Click one while it's warm.", () => Object.keys(player.e.caught).length >= 1),
		62: echoSecret(62, "I Was You", "You said it, and something said it back.", "The first thing the Tree says is three things. Say the last of them.", () => spoke("i was you")),
		63: echoSecret(63, "Forgive Me", "“Always,” says the void.", "Read what you've caught. Then say the end of it.", () => spoke("forgive me")),
		64: echoSecret(64, "The Confession", "You caught every word.", "Catch all seven true words.", () => TRUE_WORDS.every(w => player.e.caught[w])),

		101: echoSecret(101, "Let It Rise", "You let Entropy climb past 80%.", "Some things are only learned by not fighting them.", () => player.e.touchedHigh),
		102: echoSecret(102, "Patience", "You held 1,000 Dust before you'd mended a thing.", "What if you didn't start yet?", () => player.points.gte(1000) && totalRepairs() === 0),
		103: echoSecret(103, "You Didn't Want to Hear It", "You skipped the story of your own life.", "There's a button in the corner, right at the start. It only works once.", () => player.d.skippedOpening),
		104: echoSecret(104, "Knocking", "You opened the Core thirteen times before it had anything to say.", "It won't answer. You could keep asking.", () => player.core.knocks >= 13),

		111: echoSecret(111, "The Words Stand Still", "You asked the words to hold still, and they did.", "The Options know a way to make them stop.", () => options.reduceTextEffects),
		112: echoSecret(112, "The Right Order", "Low, low, high, and a breath.", "You've never been sure of the order. The verses might help.", () => player.n.remembered),
		113: echoSecret(113, "Wrong on Purpose", "You hummed it wrong thirteen times. It's still your song.", "There's no wrong way to hum. Try it a lot.", () => player.n.wrong >= 13),
		114: echoSecret(114, "Someone to Talk To", "You said hello, and it was the nicest thing anyone had done.", "Nobody ever thinks to say it first.", () => spoke("hello")),

		121: echoSecret(121, "Who Was at the Sink", "You asked. You wish you hadn't. You're glad you did.", "You've carried one question the whole way down. Ask it aloud.", () => spoke("who was at the sink")),
		122: echoSecret(122, "It Was Warm", "You sat down in the other chair.", "A chair has been pulled out for you, somewhere.", () => player.h.sat),
		123: echoSecret(123, "You Didn't Move", "An hour of Stillness, all at once.", "How long can you leave it alone?", () => player.v.longest >= 3600),
		124: echoSecret(124, "Lightning", "A Surge rolled nine-tenths of the way to its peak.", "Chaos pays out big, once in a long while.", () => player.d.path !== null && player.c.unlocked && player.c.surge >= surgePeak() * 0.9),

		131: echoSecret(131, "One Commandment", "Five Axioms, and every one of them on the same Tenet.", "Order rewards balance. Try not having any.", () => {
			let held = [11, 12, 13].map(id => player.o.buyables[id].toNumber())
			return Math.max(...held) >= 5 && held.filter(x => x > 0).length === 1
		}),
		132: echoSecret(132, "Steady, Steady", "You steadied the seams fifty times, with your own two hands.", "Your hands know what to do. Let them do it a lot.", () => player.s.steadied >= 50),
		133: echoSecret(133, "Still Here", "It was over, and you kept going.", "What happens after the end?", () => player.keepGoing && player.core.ended),
		134: echoSecret(134, "All the Echoes", "You found every other secret. It knows. It's very proud of you.", "Find every other secret.", () => secretsFound() >= 19),
	},
	tabFormat: {
		"Echoes": {
			content: [
				["raw-html", function () { return "<br>Echoes multiply Dust by ×" + format(tmp.e.effect) + ".<br><br>" }],
				["achievements", NORMAL_ROWS],
			],
		},
		"Secrets": {
			content: [
				["raw-html", function () { return "<br>" + secretsFound() + " of 20 secrets found. Each one counts toward your Echoes too.<br><br>" }],
				["achievements", SECRET_ROWS],
			],
		},
		"Say It Back": {
			unlocked() { return Object.keys(player.e.caught).length > 0 || player.s.unlocked },
			content: [
				["blank", "20px"],
				["raw-html", function () {
					let w = word => player.e.caught[word] ? "<b class='caughtWord'>" + word + "</b>" : "<span class='missingWord'>" + "▒".repeat(word.length) + "</span>"
					return '<p class="confession">I was ' + w("alone") + ". So I " + w("chose") + " to " + w("break") + ". The " + w("hand") + " was " + w("you") + ". " + w("forgive") + " " + w("me") + ".</p>"
				}],
				["raw-html", "<p class='ledgerNote'>Every word that shifts is trying to say something. Sometimes you can say it back.</p>"],
				["text-input", "phrase"],
				["raw-html", function () { return player.e.lastReply ? '<p class="coreSpeech">“' + player.e.lastReply + "”</p>" : "" }],
			],
		},
		"All Memories": {
			content: [
				["blank", "20px"],
				["raw-html", function () {
					let html = ""
					for (let l of ["d", "f", "s", "m", "h", "t", "o", "n", "c", "l", "v", "core"]) {
						let anySeen = MEMORIES[l].some((m, i) => player.e.seen[l + i])
						if (anySeen) html += "<h3>" + layers[l].name + "</h3><br>" + memoriesHTML(l) + "<br>"
					}
					return html
				}],
			],
		},
	},
})

const OPENING_SCENES = [
	{text: "Before, there was a house."},
	{text: "You're {sure|almost sure|told} of that much. A kitchen with a yellow light. Somebody at the sink, humming a song they only knew half of. You never asked them what it was called. You thought there was time."},
	{text: "When the Tree broke, it wasn't loud. The sky went first. Then the word for it. People kept looking up and trying to say what was missing."},
	{text: "Nobody died, exactly. They came apart, the way a sentence does when you've said it too many times. The one at the sink stopped halfway through the song. You stood in the doorway for a long while, waiting for the rest."},
	{text: "It didn't come."},
	{text: "After that you carried them, because no one else was left to. You said their names out loud every morning, until there stopped being mornings. Then you said them anyway."},
	{text: "You've lost the names now. You lost the face before that. You still have four notes of the song, and you can't be {certain|sure|honest} they're in the right order."},
	{text: "Nobody is coming. Nobody will know if you stop. There is only the dust, and it was {everyone|everything|never anyone}, and you have your hands, which seem to know what to do."},
	{text: "So you kneel down."},
]

function introActive() { return !!player && !!player.d && player.d.introStep > 0 && player.timePlayed === 0 }

function openingSceneHTML() {
	let step = player.d.introStep
	return glitchSwap(OPENING_SCENES[step - 1].text, {
		id: "opening-" + step,
		hold: 900, offset: 400, glitch: 450, eager: true,
		settleAfter: 3200,
	})
}

function openingButtonText() { return player.d.introStep >= OPENING_SCENES.length ? "Pick up the dust" : "Continue" }

function advanceOpening() {
	player.d.introStep++
	if (player.d.introStep > OPENING_SCENES.length) player.d.introStep = 0
}

function skipOpening() {
	player.d.introStep = 0
	player.d.skippedOpening = true
}

const ENDING_SCENES = [
	{text: "The last seam closes. For a moment there's no sound at all, and then there's one: {your|a|the} Tree, breathing."},
	{text: "\"You must repair what once {was|could have been|should never have been}.\"", settle: 0},
	{text: "\"You must repair what once {could have been|was|should never have been}.\"", settle: 0},
	{text: "\"You must repair what once {should never have been|was|could have been}.\"", settle: 0},
	{text: "\"I was {whole|alone|you}.\"", settle: 0},
	{text: "\"I was {alone|whole|you}.\"", settle: 0},
	{text: "\"I was {you|whole|alone}.\"", settle: 0},
	{text: "\"All of them, Mender. All of them were true. I was whole, so I was alone. So I made a hand that wasn't mine, and I let it forget, and I gave it something to mend. I wanted someone to talk to. I'm sorry it took so long.\""},
	{text: "\"Restore the {Core|truth|mistake}, I said. It was all three. It always was.\"", settle: 0},
	{
		text() {
			if (player.d.reconciled) return "You look at what you've made. It's whole, and it has seams all through it, gold ones, in the shape of everywhere you've been. Order keeps them true, and Chaos keeps them open. It's nothing like what it was."
			return "You look at what you've made. It's whole, and it has seams all through it."
		},
	},
	{text: "\"There was never a house,\" says the Tree. \"I built it out of what I'd guessed a home would be. I'd never seen one. There was never anyone at the sink but you. Did I get it right?\""},
	{
		text() {
			if (player.h.sat) return "Somewhere very far down, someone is humming. It goes on past the four notes, past where it stopped. There are two chairs, and you know which one is yours. You pull out the other."
			return "Somewhere very far down, someone is humming. It goes on past the four notes, past where it stopped. You know the rest. You always did."
		},
	},
	{text: "\"I can feel it,\" says the Tree. \"The seams. They let things in. Is that you?\""},
	{text: "\"The Tree {remembers|forgets|forgives} you.\"", settle: 2},
	{text: "You stay."},
]

function beginEnding() {
	player.core.endingStep = 1
	player.tab = "none"
}

function endingActive() { return !!player.core && player.core.endingStep > 0 && !player.core.ended }

function endingSceneHTML() {
	let scene = ENDING_SCENES[player.core.endingStep - 1]
	let text = run(scene.text, scene)
	return glitchSwap(text, {
		id: "end-" + player.core.endingStep,
		hold: 700, offset: 300, glitch: 450, eager: true,
		settleAfter: scene.settle === undefined ? 3000 : 2800,
		settleTo: scene.settle || 0,
	})
}

function advanceEnding() {
	player.core.endingStep++
	if (player.core.endingStep > ENDING_SCENES.length) {
		player.core.ended = true
		GlitchText.stabilizeAll()
	}
}

GlitchText.onCatch(word => catchWord(word))
