let modInfo = {
	name: "The Shattered Upgrade Tree",
	id: "the-shattered-upgrade-tree",
	author: "Marioispro1",
	pointsName: "Dust",
	modFiles: ["layers.js", "tree.js"],

	discordName: "",
	discordLink: "",
	initialStartPoints: new Decimal (10), // Used for hard resets and new players
	offlineLimit: 4,  // In hours
}

// Set your version in num and name
let VERSION = {
	num: "1.0",
	name: "The Last Mender",
}

let changelog = `<h1>Changelog:</h1><br>
	<h3>v1.0: The Last Mender</h3><br>
		- The Tree is shattered. Please mend it.<br>
		- Dust, Fragments, Stabilizers, Matter, Time, Order, Chaos, Laws and the Core.<br>
		- Repair upgrades, Entropy, Resonance, Recovered Memories and Echoes.<br>
		- The House, the Song and the Hollow.`

let winText = `The Tree is whole, and it has seams, and nothing is alone.<br><br>Thank you for mending it.`

// If you add new functions anywhere inside of a layer, and those functions have an effect when called, add them here.
// (The ones here are examples, all official functions are already taken care of)
var doNotCallTheseFunctionsEveryTick = ["repairClick", "structureBoost", "massBoost", "axiomsSpent", "costDiv", "costs"]

function getStartPoints(){
	let start = new Decimal(modInfo.initialStartPoints)
	if (player && player.f && hasMilestone("f", 1)) start = start.max(1000)
	return start
}

// Determines if it should show points/sec
function canGenPoints(){
	return true
}

// Calculate points/sec!
function getPointGen() {
	if(!canGenPoints())
		return new Decimal(0)

	let gain = new Decimal(1)
	for (let id of [11, 12, 13]) gain = gain.times(upgValue("d", id))
	gain = gain.times(resonanceMult("d"))

	gain = gain.times(tmp.f.effect)
	for (let id of [11, 21, 31, 34]) gain = gain.times(upgValue("f", id))
	if (hasMilestone("f", 1)) gain = gain.times(2)

	gain = gain.times(tmp.s.effect)

	gain = gain.times(buyableEffect("m", 12))
	for (let id of [11, 13, 23]) gain = gain.times(upgValue("m", id))
	gain = gain.times(tmp.t.effect)
	for (let id of [12, 21]) gain = gain.times(upgValue("t", id))

	if (onPath("o")) {
		gain = gain.times(tmp.o.effect)
		for (let id of [13, 14]) gain = gain.times(upgValue("o", id))
	}
	if (onPath("c")) gain = gain.times(tmp.c.effect)

	gain = gain.times(tmp.l.effect).times(upgValue("l", 13))
	gain = gain.times(Decimal.pow(BAL.lawDust[11], lawParts(11)))
	gain = gain.times(Decimal.pow(BAL.lawDust[12], lawParts(12)))
	gain = gain.times(Decimal.pow(BAL.lawDust[13], lawParts(13)))
	gain = gain.times(Decimal.pow(BAL.lawDust[14], lawParts(14)))

	gain = gain.times(tmp.h.effect).times(tmp.n.effect).times(upgValue("v", 13))
	gain = gain.times(tmp.core.effect)
	gain = gain.times(tmp.e.effect)

	return gain.pow(dustEntropyExp())
}

// You can add non-layer related variables that should to into "player" and be saved here, along with default values
function addedPlayerData() { return {
}}

// Display extra things at the top of the page
var displayThings = [
	function () {
		if (!player.f.unlocked) return ""
		let e = player.d.entropy
		let color = mixColor("#8fb0c0", "#e0625c", e / 90)
		let flow = timeFlow()
		return "<span style='color: " + color + "'>Entropy: " + format(e) + "%</span>" + (Math.abs(flow - 1) > 0.001 ? " · Time flows ×" + format(flow) : "")
	},
	function () { return "<span class='voiceLine'>" + glitchSwap(currentVoice(), {id: "voice-" + hashVoice()}) + "</span>" },
]

function hashVoice() {
	return VOICE.map(v => v.line).indexOf(currentVoice())
}

// Determines when the game "ends"
function isEndgame() {
	return player.core.ended
}

// Less important things beyond this point!

var backgroundStyle = function () {
	let healed = Math.round(textClarity() * 40) / 40
	return {"background-image": "radial-gradient(ellipse at 50% 90%, " + mixColor("#17121f", "#4a3a26", healed) + " 0%, " + mixColor("#08080c", "#14110e", healed) + " 70%)"}
}

// You can change this if you have things that can be messed up by long tick lengths
function maxTickLength() {
	return(3600) // Default is 1 hour which is just arbitrarily large
}

// Use this if you need to undo inflation from an older version. If the version is older than the version that fixed the issue,
// you can cap their current resources with this.
function fixOldSave(oldVersion){
}
