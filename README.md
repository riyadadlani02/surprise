# surprise

An agent that learns a world by predicting what will happen, being surprised when it is wrong, and rewriting its own understanding. Every belief is written down where you can read it.

The loop is domain-agnostic. The first environment is a 3D playroom, because surprise is visible there: you can watch a tower fall that the agent expected to stand. The others are text worlds: a phone call, a web-shop checkout, a team's ticket queue, one person's habits, and rock-paper-scissors against an opponent with a habit. The same agent runs in all of them.

```
perceive  →  predict  →  act  →  compare
   ↑                                 │
   └── assimilate (matched) ─────────┤
   └── accommodate (surprised) ──────┤   Fable rewrites the model
   └── escalate (low confidence) ────┘   a human answers; the answer becomes an example
```

Two models share the work. A fast, cheap one (Jev, TypeSafe AI) makes moment-to-moment guesses as calibrated probabilities. A slow, smart one (Claude Fable 5.1) steps in only when a confident guess fails, to explain the surprise and patch the world model. Both are optional: a hand-written rule predictor and a heuristic accommodator run the whole loop with no API keys, and remain the fallback when a call fails.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # physics truths, world model, curriculum learning curve, call adapter
npm run typecheck
```

In the browser: press **Curriculum round** and answer the agent's questions when it is unsure (or untick *ask me when unsure*). Run a second round and watch accuracy rise and escalations fall. Then interfere: drag an object, hide the ball under the cup, lower gravity, make a block heavy. Each is a deliberate surprise.

To use the real models, paste keys in the top bar and switch the two selects. Keys live in your browser's `localStorage` only; the Fable call goes straight from the browser to the Anthropic API, so treat this as a local demo, not a deployment.

## What is on screen

| Panel | What it shows |
|---|---|
| Prediction | Before each action: each yes/no question, Jev's (or the rules') probability and confidence. After: the truth and whether it matched, surprised, or asked a human. |
| State | The serialized world as a graph: objects as nodes, binary relations as edges, unary relations under each node. Only relations whose concept is active are shown. |
| World model | Active concepts, and every rule: action, preconditions, question, p(yes), confidence, evidence count, provenance. |
| Surprise log | Every revision as a readable diff: trigger, explanation, rules added and removed, concepts activated. |
| Metrics | Accuracy per curriculum stage, a calibration curve (does 80% mean 80%?), accommodation value (did each revision help the next predictions?), and the escalation curve. |

## How it works

**World model** (`src/model/worldmodel.ts`). An explicit, versioned JSON object: active concepts plus causal rules. A rule says: for this action, when these relations hold beforehand, this question has this probability. Probabilities come from observed counts, so confidence grows with evidence. Every change goes through one function that also prunes uninformative rules and appends a diff to the history.

**Serializer** (`src/env/playroom/serializer.ts`). Turns the scene into relations such as `on(red,blue)`, `inside(ball,cup)`, `held(green)`. Some relations are gated behind concepts the agent has not acquired yet: `hidden(ball,cup)` needs *object_permanence*, `overhang(green,blue)` needs *support*, `round(ball)` needs *shape*. Until a concept is active, the agent literally cannot see what it describes. A covered ball vanishes from the state.

**Accommodation** (`src/model/rules.ts`, `src/model/fable.ts`). On a confident wrong prediction, the accommodator receives the full trace including the relations the agent could not see. It returns a patch: an explanation, concepts to activate, rules to add or remove. The heuristic version splits the failed rule on one distinguishing relation, preferring an inactive concept. The Fable version does the same with judgement, via structured output.

**Curriculum** (`src/curriculum.ts`). Six stages in the order children acquire them: objects fall, objects persist when hidden, containers hold things, supports need to be under things, ramps make round things roll, one object can move another. Each trial is one loop tick with a known correct answer, so the tests assert the learning curve, not just that the code runs.

**Text adapters** (`src/env/*/index.ts`). Each is a small simulator with hidden dynamics and a few latent concepts: a caller with an intent and a mood, an undocumented checkout flow, a ticket that may or may not close by Friday, a person who only takes morning slots on sunny weekdays, an opponent who counters your last move. Same agent, same world model code, same metrics.

## Measured results

Every environment ran three times from an empty world model: the hand-written rule predictor alone, Jev with no context beyond the state and action (zero-shot), and Jev with the learned rules in its context. No human answered escalations, so learning came only from outcomes. Brier score is the headline (lower is better; a coin flip scores 0.25). Generated 2026-09-20 by `npm run scenarios`; raw JSON in `public/results/`.

| Environment | Predictions | Brier: rules | Brier: Jev zero-shot | Brier: Jev + learned rules | Concepts acquired |
|---|---|---|---|---|---|
| 3D playroom, curriculum | 164 | 0.116 | 0.207 | 0.126 | shape, layout |
| 3D playroom, free play | 159 | 0.159 | 0.174 | 0.185 | shape, layout, object_permanence |
| Phone call | 600 | 0.092 | 0.263 | 0.109 | urgency, history |
| Web-shop checkout | 900 | 0.051 | 0.151 | 0.054 | session, validation |
| Team tickets | 600 | 0.187 | 0.158 | 0.174 | capacity, dependencies |
| One person's habits | 600 | 0.099 | 0.268 | 0.099 | weather, energy, history |
| Rock-paper-scissors | 600 | 0.234 | 0.246 | 0.231 | history, opponent_model |

Jev on this workload, measured from Node with fourteen runs in flight:

| Calls | Mean latency per call | Input tokens | Total cost |
|---|---|---|---|
| 3398 | 389 ms | 1,437,895 | $0.060 |

What the numbers say:

- Learning is real in every environment: the Brier score falls across thirds of each run, escalations fall to near zero for the rule predictor, and every environment acquired the concepts its serializer had kept latent.
- Jev zero-shot is close to a coin flip on people-shaped worlds (phone call, habits) and useful on the ticket queue, where its priors about workload beat the empty rule set.
- Jev with the learned rules in context tracks the rule predictor closely and beats it slightly on habits. The rules carry most of the signal; Jev adds calibrated priors on unseen situations.
- Rock-paper-scissors stays hard for all three: the opponent switches habit every sixty rounds, and the world model's rules average over both regimes.
- Latency measured about 0.9 s per call in isolation and about 389 ms per call under concurrency, against the vendor's stated 70 to 500 ms. Cost was negligible: about six cents for the whole suite of 3,398 calls.
- The Jev API refuses browser origins, so the published demo cannot call it directly; results above come from Node runs. Add a small proxy to use Jev live in the browser.

## Pages

- Landing page and results: https://riyadadlani02.github.io/surprise/
- Interactive playroom (Three.js + Rapier): `./demo.html`
- Live scenarios console for the five text worlds, with real Jev when served by the dev server: `./scenarios.html`
- Voice-guided navigation aid for blind users: `./navigate.html`. A simulated room, a live camera mode, and a photo mode (any still image, for example an auditorium you are about to enter) that serialize the scene through Claude vision. Prototype only: not a substitute for a white cane, a guide dog, or mobility training.
- Loom demo script: `docs/demo-script.md`
- Unity playroom: `./unity.html`. The Unity project lives in `unity/`; it was written without a Unity install and has not been compiled. Build it with the command in `unity/README.md` and the page picks up `public/unity`.

## Adding an environment

Implement `Environment<Obs>` from `src/types.ts`: `observe`, `serialize`, `latent`, `act`, `questionsFor`, `randomAction`, and a list of latent concepts. Nothing else changes.

## Honest framing

This is a neurosymbolic world model. Learning lives in the explicit schema and in the accommodator's revisions, not in any model's weights. That is the point: every decision carries a probability, a trace, and a diff history. Jev cannot do arithmetic, so all numbers are bucketed into categories before they reach it. The serializer's starting vocabulary caps what can be learned; growing it is the main lever.

Sources: [TypeSafe AI docs](https://docs.typesafe.ai/introduction) · [Jev on Vercel AI Gateway](https://vercel.com/kb/guide/typesafe-jev-and-ai-sdk) · [A deep dive into Jev](https://flaviocopes.com/jev/) · [World Models in AI: Sensing, Learning, and Reasoning Like a Child](https://arxiv.org/abs/2503.15168)
