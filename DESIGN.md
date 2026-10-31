# The Shattered Upgrade Tree: design notes

The universe was one perfect structure, the Tree. It shattered. You are the last Mender, putting it back.

## Layers

| Row | Layer | Currency | Type | What's unique |
|---|---|---|---|---|
| 0 | Dust (D) | Dust (the points) | hub | Teaches repair. Holds the Entropy bar, the Resonance table and the path choice. |
| 1 | Fragments (F) | Fragments | normal | The main repair currency. |
| 1 | Stabilizers (S) | Stabilizers | static | Lowers the Entropy ceiling. "Steady the Seams" is an optional button that knocks Entropy down. |
| 2 | Matter (M) | Matter | normal | Buyable structures: Scaffolds, Hearths, Bulwarks, and an Orrery that makes Mass. |
| 2 | Time (T) | Moments | normal | Scales the whole tick. Wind the Clock (slow down and bank real seconds), then Let It Go (spend them at high speed). |
| side | Echoes (E) | Achievements | none | Secrets, caught words, a "say it back" text box and a log of every memory. |
| 3 | Order (O) | Axioms | static | Predictable. Assign Axioms to three Tenets and rewrite them freely. Crushes Entropy. |
| 3 | Chaos (C) | Anomalies | normal | Swingy. A random Surge multiplier that grows with Entropy, and a button to hold a good one. |
| 4 | Laws (L) | Principles | normal | Gravity, Light, Causality and Memory, each a three-part repair gated by milestones. Reconciliation is here. |
| 2 | The House (H) | Rooms | none | Seven rooms built from Matter and never lost. Each is slightly wrong, because there was never a house. |
| 3 | The Song (♪) | Notes | none | Notes drift in with Dust. Five verses, and four keys for a phrase the memories teach you. |
| 4 | The Hollow (∅) | Hush | normal | Earns from Stillness, which only builds while you leave it alone. Cashing it in resets nothing else. |
| 5 | The Core | Seats | none | Open from the first second. 27 seats across nine sockets, fed by every layer. |

## How the pillars work

- **Repair.** A shattered upgrade has two prices: one click to repair, one to buy. Repairs survive every reset, so you never pay for the same one twice. Purchases reset as usual.
- **Entropy.** It drifts toward a ceiling, capped at 85% outside the Trial of the Anchorless, and only bends gains through capped exponents. It never removes anything you own. Each repair raises the pressure slightly. The drift is an exponential approach, so long offline ticks are safe.
- **Resonance.** Each link's strength is the geometric mean of how repaired its two ends are, so both neighbours must be healed. Links multiply gains, and their branches on the tree get thicker and brighter.
- **The choice.** The first Order or Chaos reset closes the other path. The Laws upgrade "Reconciliation" reopens it, and the final Core socket needs both.

## The hidden truth

The Tree was perfect and it was alone. Nothing could happen to it, because everything already had. So it broke itself, and made from its first shard someone who could mend it and wouldn't remember. The Mender is the hand that struck.

The "wrong" variants point at this. Warm-coloured words are true words, and clicking one catches it. Catching all seven fills in the confession in Echoes:

> I was alone. So I chose to break. The hand was you. Forgive me.

The ending settles each swapped word in turn ("I was whole." "I was alone." "I was you.") and then says that all of them were true. What's left is a Tree that is whole and has seams, so it isn't alone any more.

## Glitch text

The markup is `{a|b|c}`. The first variant is the true identity. `!word` is a catchable true word, `@o:` and `@c:` limit a variant to one route, and `~` separates clarity tiers.

- All animation state lives outside the rendered HTML, so Vue never re-renders for a frame of animation.
- One word glitches at a time, with a 7–16s gap between words.
- Upgrades and names (`rare: true`) share a much longer 45–120s gap. Words still settle when you repair them.

## Where I adapted to the engine

- **Dust is both the point counter and a `type: "none"` layer.** TMT points aren't a layer, and the hub needed somewhere to live.
- **Five small engine edits.** One line in `buyUpg` offers the click to repair first, because TMT has no two-step upgrade. One `extraClass` binding in the upgrade component, because upgrades can't otherwise take a CSS class. A `timeFlow()` multiplier in `gameLoop`, placed after `addTime` so real time played stays honest. The `reduceTextEffects` option and its button.
- **`css/shattered.css`, not `style.css`.** This version of TMT has no `style.css`.
- **`index.html` had no charset.** I added `<meta charset="utf-8">`, without which the glyphs turn to mojibake.
- **Reconciliation applies on purchase.** It sets `player.d.reconciled` the moment it's bought.
- **The helper is `resonanceBranch`, not `branch`.** The engine uses `branch` as an implicit global loop variable and overwrites anything by that name.

## Balance knobs

The numbers are in `BAL` at the top of `js/layers.js`. Check any change with the bot:

```bash
node tools/simulate.js --path=o --hours=9 --verbose
```

- `pressureBase`, `pressurePerRepair`, `pressureSoftener`, `dustPenalty`, `crackPenalty`: how much Entropy matters.
- `resonanceK`: how much repairing neighbours pays, per layer.
- `fReq` through `lReq`, with their `*Exp` values: when each layer arrives.
- `fEffect`, `mEffect`, `tEffect` and the other push-down exponents: **change these gently.** If their combined effect on Dust nears 1, growth stops being a power law and the game finishes itself in minutes.
- `trialGoals`, `otherPathGoalMult`: how hard the Trials are.
- `seats`: the length of the finale.
- `RARE_GAP_MIN_MS`, `GAP_MIN_MS` in `js/glitchText.js`: how often text glitches.

## Ideas for future content

- A second Mender run ("New Seam") that keeps memories and adds a third route after the ending.
- More secret phrases in Echoes, plus an ending variant for players who caught every word before restoring the Core.
- A fifth Law, Change, that only exists because the seams were left in.
- Optional "Fault Lines": challenges that raise the Entropy cap in exchange for permanent boosts.
