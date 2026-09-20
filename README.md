# surprise

An agent that learns a world by predicting what will happen, being surprised when it is wrong, and rewriting its own understanding. Every belief is written down where you can read it.

The loop is domain-agnostic. The first environment is a 3D playroom, because surprise is visible there: you can watch a tower fall that the agent expected to stand. The second is a synthetic phone call, to show the loop is not a physics trick.

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

**Second adapter** (`src/env/call/index.ts`). A synthetic caller with an intent, a mood, and hidden dynamics. Same agent, same world model code, same metrics. It learns that urgent results must be transferred, that asking for details twice annoys people, and that an apology only works once.

## Adding an environment

Implement `Environment<Obs>` from `src/types.ts`: `observe`, `serialize`, `latent`, `act`, `questionsFor`, `randomAction`, and a list of latent concepts. Nothing else changes.

## Honest framing

This is a neurosymbolic world model. Learning lives in the explicit schema and in the accommodator's revisions, not in any model's weights. That is the point: every decision carries a probability, a trace, and a diff history. Jev cannot do arithmetic, so all numbers are bucketed into categories before they reach it. The serializer's starting vocabulary caps what can be learned; growing it is the main lever.

Sources: [TypeSafe AI docs](https://docs.typesafe.ai/introduction) · [Jev on Vercel AI Gateway](https://vercel.com/kb/guide/typesafe-jev-and-ai-sdk) · [A deep dive into Jev](https://flaviocopes.com/jev/) · [World Models in AI: Sensing, Learning, and Reasoning Like a Child](https://arxiv.org/abs/2503.15168)
