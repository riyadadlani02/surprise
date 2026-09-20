# Demo script: surprise, live, 7 to 9 minutes

A Loom recording of the whole project running locally, with the published site as a backup. Every number below comes from `README.md` and `public/results/index.json` (generated 2026-09-20). Every command below is one the pages accept today.

## Setup checklist

Do all of this before pressing record.

- Terminal: `cd /Users/riyadadlani/surprise && npm run dev`. Confirm it prints `http://localhost:5173`. Leave the terminal open in a second desktop, not on screen.
- `.env` in the repo root holds `JEV_API_KEY=...`. Without it the dev server starts no proxy and every Jev select falls back to rules with a warning in the prediction window. Check the key works before recording: open `http://localhost:5173/demo.html`, set predictor to Jev, run one action, and confirm the prediction window says `via jev`, not `via rules`.
- Browser: Chrome, one window, 1440 by 900 or larger. Loom at 1080p. Zoom 100 percent. Close every extension popup.
- Tabs, in this order, all on localhost:
  1. `./index.html` (landing, results table loaded from `./results/index.json`)
  2. `./demo.html` (playroom)
  3. `./scenarios.html` (live console)
  4. `./navigate.html` (voice guide)
  5. `./unity.html`
  6. `https://riyadadlani02.github.io/surprise/` (published, in case localhost dies)
- Microphone: on `./navigate.html` press Listen once, allow the microphone in the Chrome prompt, say "help", confirm the log shows a `heard` line, then press Listening to stop. Chrome remembers the grant for localhost.
- Sound: system output on, volume at a level Loom picks up, because the guide speaks with the browser voice. Say "unmute" if the Mute button shows pressed.
- Keys in the browser (`localStorage`, never in code):
  - Anthropic key: needed only for camera or photo mode on the guide and for the Fable accommodator on the playroom. Paste it under Camera settings on `./navigate.html`; the playroom page shares the same stored value.
  - Jev key: not pasted anywhere. The dev server adds it from `.env`.
- Reset before recording:
  - `./demo.html`: press "forget model", then "reset scene". Set predictor to rules, accommodator to heuristic (or Fable if you want the explanations written by Fable and accept the latency). Tick "ask me when unsure".
  - `./scenarios.html`: reload the tab so the world model is empty, then untick "ask me when unsure". It comes back ticked on every reload, and while it is ticked each unsure prediction opens a blocking Yes, No, Don't know dialog (measured: 15 percent of Jev predictions on the phone call, 49 percent zero-shot, two questions per tick), which would stop "demo run" and the zero-shot steps.
  - `./navigate.html`: reload the tab. Untick "Use camera". The model is empty after a reload, so the first "forward" says the unsure line (segment 5 uses that as the escalation beat) and "take me to the cup" pauses at once until one step has been taken. If you would rather it walk straight away, press "Let the agent explore" once (forty random moves, about ten seconds) and skip the unsure beat.
- Optional photo: have the auditorium photo ready in Finder for "Use a photo" (segment 5). The repo also ships `public/photos/auditorium.jpg` behind "Sample: auditorium".
- Have this script open on a second screen or printed. Do not read the "Say" column word for word; it is a spine, not a teleprompter.

Total planned running time: 8 minutes 15 seconds, with 45 seconds of slack to stay under 9.

---

## Segment 1: the idea, on the landing page

### Time

0:00 to 0:40

### On screen

Tab 1, `./index.html`, scrolled to the top. Headline "Predict. Be Surprised. Rewrite The Model." Scroll slowly once through "the loop" (perceive, predict, act, compare) and stop at "two models share the work". Do not open the results yet.

### Say

This is surprise. It is an agent that learns a world by predicting what will happen next, noticing when it is wrong, and rewriting its own model. The model is not weights. It is a JSON object of concepts and rules, and every change to it is a diff you can read.

The loop is the same everywhere: perceive the state as relations, predict yes or no questions about the next action, act, compare. A matched prediction adds evidence to the rule that made it. A confident miss is a surprise, and a slow model patches the world model. A low confidence guess asks a human, and the answer becomes an example.

Two models share the work. Jev, from TypeSafe, makes the fast guesses as probabilities. Claude Fable 5.1 is called only on a surprise, to explain it and write the patch. Both are optional. A rule predictor and a heuristic accommodator run the whole loop with no keys.

### If it fails

If the results table shows "Loading" for more than a few seconds, keep talking and switch to the published tab 6 for segment 3. The words above need no data.

---

## Segment 2: the playroom

### Time

0:40 to 3:00

### On screen

Tab 2, `./demo.html`. The 3D scene on the left, the side panel on the right with six stats (ticks, accuracy, brier, escalation, version, rules), then the prediction, state, world model, surprise log and metrics windows.

1. Point at the stats: ticks 0, rules 0, version v0. "ask me when unsure" is ticked.
2. Press "curriculum round". The 23 trials run in order: objects fall, object permanence, containers, support, ramps, tools. The scene flashes the object being acted on.
3. The first dialog appears: "the agent isn't sure" with the question "Will red fall while held?" and Yes, No, Don't know. Press No. The next dialog asks about a drop; press Yes for "Will red reach the floor?". After the second answer, untick "ask me when unsure" so the round finishes on outcomes alone.
4. While it runs, point at the prediction window: each question, a probability bar, the confidence, "actual: yes or no", and a tag: matched, surprised, asked human, or wrong but unsure.
5. Around the containers stage, a drop over the cup will be tagged "surprised" (the agent learned that dropped things reach the floor, and this one does not). Point at the surprise log: a new version, the trigger line "surprise: drop ball → Will ball reach the floor?", the explanation, the rules added with a plus and any removed with a minus.
6. Around the support stage, the overhanging stack ("stack green blue offset=0.9") is another surprise. If the log shows "+ concept support", point at it and at the concept chip in the world model window.
7. When the round ends, the metrics window shows accuracy per stage and the escalation curve.
8. Interfere. Press "reset scene", then "hide ball": the cup lands upside down over the ball. The state graph does not redraw yet; it shows the post-state of the last tick. Choose "wait" in the action select and press "do it" (question "Will anything move?"). Now point at the state graph: the ball node is gone, because `hidden(ball,cup)` belongs to the object_permanence concept and the agent cannot emit it until that concept is active.
9. In the action select choose "uncover", press "do it". The question is "Will lifting the cup reveal something underneath?". Read the probability and the tag.

### Say

Empty model, zero rules. I will run one curriculum round: six stages in the order children acquire them, 23 trials, each one a real physics step.

It is unsure straight away, so it asks me. Will the red block fall while held? No. Will it reach the floor when dropped? Yes. Each answer becomes a rule with a human as its source. I will stop answering now and let it learn from outcomes.

Watch the prediction window. Every question gets a probability and a confidence. Matched means the rule that predicted it gets one more piece of evidence. Surprised means it was confident and wrong.

Here is one. It learned that dropped things reach the floor. This ball was dropped over the cup and did not. The surprise log shows the diff: the trigger, the explanation, the rule it added with a precondition, the rule it removed. That is the whole learning mechanism, and it is readable.

Now I interfere. I hide the ball under the cup and let one tick pass. Look at the state graph: the ball has vanished. The relation that would say hidden ball cup belongs to a concept the agent has not acquired, so it literally cannot see it. When I lift the cup, that is exactly the kind of surprise that activates object permanence.

### If it fails

- No dialog appears: the model already had confidence from a previous run. Press "forget model" and start the round again; it takes about ten seconds to reach the first question.
- No surprise in the containers stage: keep going, the support stage overhang almost always surprises. If neither does, use the manual action "stack green on blue, overhanging" via "do it" after the round.
- The scene freezes or objects fly: press "reset scene". Physics is Rapier in WebAssembly; a tab that lost focus for a while can need a reload, and the world model survives a reload only if you export it, so do not reload mid round.
- Fable accommodator errors: the warning line appears in the prediction window and the heuristic patch is used. Say so; the fallback is part of the design.

---

## Segment 3: the results

### Time

3:00 to 4:15

### On screen

Tab 1, `./index.html`, scroll to "Seven Worlds, Three Predictors". Point along one row at a time. Then the "summary · all scenarios" window and the measurement note under it. Then "What This Is Not".

### Say

These were measured on 2026-09-20 with npm run scenarios, from Node, three predictors per world, no human answering. Brier score is the headline: mean squared error of the probabilities, lower is better, a coin flip is 0.25.

Three numbers matter.

First, learning is real in every world. Brier falls across the thirds of each run. Phone call, rules alone: 0.105 in the first third, 0.076 in the last. Escalation for the rule predictor falls to zero in the last third of every text world.

Second, the honest one about Jev zero-shot. With only the state and no rules, it scores 0.263 on the phone call and 0.268 on one person's habits. That is a coin flip on people shaped worlds. It is useful on the ticket queue, 0.158 against the rules' 0.187, because its priors about workload beat an empty rule set.

Third, the rules carry the signal. Jev given the learned rules tracks the rule predictor closely: 0.109 against 0.092 on the call, 0.054 against 0.051 on checkout, and it edges ahead on habits, 0.099 to 0.099 with higher accuracy. Rock paper scissors stays hard for all three because the opponent changes habit every sixty rounds.

Latency and cost were measured, not copied. 3,398 Jev calls, 389 milliseconds mean per call with fourteen runs in flight, and about 0.9 seconds per call in isolation. The vendor quotes 70 to 500 milliseconds. Total cost for the whole suite: six cents.

### If it fails

The table does not load on localhost: switch to tab 6, the published page, which serves the same `./results/index.json`. If both fail, the same table is in `README.md` under "Measured results"; open it in the editor and read from there.

---

## Segment 4: the live scenarios console

### Time

4:15 to 5:45

### On screen

Tab 3, `./scenarios.html`. The console lists the five text worlds: phone call, web shop checkout, team tickets, one person's habits, rock paper scissors.

1. Pick the phone call. Set predictor to Jev. Point at the state relations: `intent(...)`, `mood(...)`, `details(missing)`, `turn(first)`.
2. Press "demo run". Watch predictions arrive tagged `via jev`; each tick asks two questions, "Will "..." resolve the call?" and "Will the caller get more frustrated?".
3. Press "demo run" again to stop it (the button loses its pressed state; it also stops by itself after 30 ticks). Steer one manual action: press "ask details" twice on the same caller. The second one worsens the mood; the environment punishes asking twice. Point at the mood relation changing and at whether the prediction of "Will the caller get more frustrated?" matched.
4. Switch the predictor select to Jev zero-shot. Check "ask me when unsure" is still unticked, otherwise about half of these predictions open a dialog (answer Don't know if one appears). Step three or four times. Point at the wider, less confident probabilities and at the escalations or "wrong, unsure" tags. Switch back to Jev.

### Say

Same agent, same world model code, a different serializer. This is the phone call: a caller with an intent, a mood, and hidden dynamics. Urgent results must be transferred, asking for details twice annoys people, and the agent has to discover both.

Jev is live here. The dev server proxies the call and adds the key, because the Jev API refuses browser origins. Each tick, two questions: will this reply resolve the call, will the caller get more frustrated.

Let me steer. I ask for details, then ask again. Watch the mood. The agent had to learn that a repeated question worsens it, and that relation, asked details repeated, sits behind the history concept until a surprise activates it.

Now zero-shot, the state alone with no rules in the context. The probabilities widen and the confidence drops. This is the 0.263 from the results table happening live: without the rules, Jev is guessing on a people world.

### If it fails

- Jev latency spikes or a call fails: the prediction is tagged `via rules` and a warning line appears. Say "that is the fallback: the loop never waits on a vendor". Continue on rules.
- The console is not finished or does not load: skip to segment 5 and cover the same points on tab 1 with the phone call row of the results table. Segment 4 then takes 40 seconds instead of 90.

---

## Segment 5: the navigation aid

### Time

5:45 to 7:30

### On screen

Tab 4, `./navigate.html`. Safety notice at the top. "guide 0.1" window with the last spoken sentence in large type, the Listen button, Mute, Repeat, Help, a typed command field, and a direction pad: Forward, Left, Back, Right, Around me, Where am I. Right column: the simulated room with a white avatar and a pink arrow for heading, and the log.

1. Press Listen. Say "where am I". The guide answers in the form "You face north. The cup is ahead of you, a few steps away." The log shows the `heard` line and the `said` line.
2. Say "forward" or press Forward. On the empty model it says "I am not sure what is ahead; check with your cane." and then steps: "Stepped." or "Blocked. You did not move." Say "forward" again. Now there is a rule, so before the step it says "Step forward is likely clear, 90 percent." or "Stop. The cup is one step ahead."
3. Only after at least one forward (otherwise it pauses immediately): type `take me to the cup` in the command field and press Send. It says "Taking you to the cup. Say stop at any time." and walks step by step, turning when needed, until "You have arrived at the cup."
4. Point at "what the agent believes": the `blocked` prediction with its probability and confidence meter, the concept chips, the rule table.
5. Optional, only if an Anthropic key is stored under Camera settings: press "Use a photo" and pick the auditorium image from Finder (no camera needed; the page leaves "Use camera" unticked). The photo appears in the right column, the mode line reads `photo · <file name>`, and the guide says "Looking at the photo." then describes what is ahead, left and right. Hazards are spoken as "Hazard: ...". The log shows a `photo` line and a `camera` line like `obstacle one_step ahead · conf 70% · hazards: ...`. Say "forward"; it asks "Clear or bumped?" and waits up to twenty seconds, answer "clear" or "bumped". Press "Back to the room" to return; it says "Back to the simulated room." "Sample: auditorium" loads the bundled `./photos/auditorium.jpg` and does the same with a key; without a key it reads a saved, hand-written description instead and says so.

### Say

Same loop, an assistive use. This is a prototype and the page says so first: not a substitute for a white cane, a guide dog, or mobility training.

Where am I. It answers with heading and where the target is. Forward. It has no rules yet, so it says it is not sure and tells me to check with my cane. That is the escalation, and it is the default, not the exception. Forward again. Now it has one piece of evidence and says likely clear with a percentage, or stop with what is ahead. It never says safe.

Take me to the cup. It walks one step at a time, each step a prediction, each outcome a piece of evidence.

The rule for the escalation: whenever confidence on the blocked question is below 30 percent, it says I am not sure and points at the cane. On a guided walk it pauses and hands control back. The cane is the human in the loop.

Photo mode swaps the simulated room for one still image, and camera mode does the same with a frame every two and a half seconds. Claude describes it through vision into the same relations: what is ahead, how far, hazards. The truth comes from you: after each step you say clear or bumped, and that answer is what the model learns from. Here is an auditorium: a sofa one step ahead, the stair aisle behind it, rows of seats.

### If it fails

- Microphone denied: it says "Microphone access was denied. Type commands instead, or allow the microphone and press Listen again." Type every command into the field; the demo is identical.
- No speech output: press Mute then Mute again, or read the large "Last spoken" text aloud yourself; it mirrors every sentence.
- Photo mode refuses ("Photo mode needs an Anthropic API key in camera settings. Staying in the simulated room."), or the photo call fails ("The photo could not be used: ..."): skip step 5, say the words about camera mode over the simulated room, and move on. Do not paste a key on camera.
- The walk pauses on "Paused. Say forward to try the step yourself, or stop.": say "forward" once, then "take me to the cup" again. This is the escalation working, so name it.

---

## Segment 6: what is real and what is not

### Time

7:30 to 8:15

### On screen

Tab 5, `./unity.html`, showing the build instructions rather than a scene. Then back to tab 1, scrolled to "What This Is Not". Hold there for the close.

### Say

Three honest lines.

This is a neurosymbolic world model. The learning lives in the explicit schema and the accommodator's revisions, not in any weights. That gives you a probability, a trace, and a diff for every decision, and it caps what can be learned at what the serializer can say.

The Unity playroom is written but not compiled. It was built without a Unity install; the page shows the build command and picks up the WebGL output when someone runs it.

The navigation aid is a prototype, not a mobility aid. And Jev runs server side: the API refuses browser origins, so on the published site the agent falls back to rules and says so. In this recording it was real because the dev server proxied it.

Everything you saw is on GitHub, with the results JSON, the tests that assert the learning curve, and this script.

### If it fails

Nothing here depends on the network. If a tab is lost, read the close over the terminal or over this document.

---

## Timing summary

| Segment | Start | Length |
|---|---|---|
| 1 The idea | 0:00 | 0:40 |
| 2 The playroom | 0:40 | 2:20 |
| 3 The results | 3:00 | 1:15 |
| 4 Live scenarios | 4:15 | 1:30 |
| 5 Navigation aid | 5:45 | 1:45 |
| 6 Close | 7:30 | 0:45 |

If the recording runs long, cut the zero-shot switch in segment 4 (30 seconds) and the camera step in segment 5 (40 seconds) first.
