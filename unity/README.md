# unity/ — the playroom in Unity

The same eight toys as the Rapier playroom (`src/env/playroom/physics.ts`), rebuilt procedurally in Unity 6 and driven from the browser over a tiny JSON bridge. The agent, world model and UI are the TypeScript ones; Unity only replaces the physics and the picture. `unity.html` loads the WebGL build from `public/unity/` and talks to it through `src/env/playroom/unityRoom.ts`.

**This project was written without a Unity install and has never been compiled or run.** Treat it as a careful first draft, not a tested build.

## Build (macOS)

Requirements: Unity Hub with an editor that has the **WebGL Build Support** module. The project pins `6000.0.58f1`; if you have another 6000.x version Unity will offer to upgrade the project — accept.

From the repo root:

```bash
/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity \
  -batchmode -quit -projectPath "$(pwd)/unity" -executeMethod BuildWebGL.Build -logFile -
```

`BuildWebGL.Build` (Assets/Editor/BuildWebGL.cs) creates the scene (camera, light, a `Bridge` object carrying `Bridge` + `PlayroomWorld`), saves it to `Assets/Scenes/Playroom.unity`, disables WebGL compression so GitHub Pages can serve the files as-is, and writes the player to `public/unity/` (`Build/surprise.loader.js`, `.data`, `.framework.js`, `.wasm`). The site then serves it at `./unity/`; open `unity.html`.

## How it talks to the page

- JS → Unity: `unityInstance.SendMessage("Bridge", "Command", json)` with a flat object `{cmd, id, x,y,z, qx,qy,qz,qw, dx,dz,strength, g, heavy}`; `cmd` is one of `place hold release push setGravity setHeavy reset`.
- Unity → JS: after every command, every `FixedUpdate` and once on `Start`, `Bridge` calls the jslib function `SurprisePublish`, which sets `window.__surprise = {still, snapshot}` and calls `window.__surpriseOnPublish` if present. `snapshot` has exactly the TS `Snapshot` shape.

## Coordinates

Rapier and Three.js are right-handed, Unity is left-handed. Commands arrive in Rapier coordinates and `PlayroomWorld` converts them on the way in: `unity.z = -rapier.z`, quaternion `(x,y,z,w) → (-x,-y,z,w)`. The snapshot is published in raw Unity coordinates and `unityRoom.ts` applies the same mirror on the way out (the mapping is its own inverse). Push directions are Rapier-space: left `(-1,0,0)`, right `(1,0,0)`, forward `(0,0,-1)`, back `(0,0,1)`.

## If it fails, check first

1. Compile errors in `PlayroomWorld.cs`: `Rigidbody.linearDamping` / `angularDamping` / `linearVelocity` are the Unity 6 names (older editors want `drag` / `angularDrag` / `velocity`); `PhysicsMaterial` was `PhysicMaterial` before Unity 6.
2. Objects rendering magenta: `BuildWebGL.Build` writes `Assets/Resources/Standard.mat` so the Standard shader ships with the player and `Mat()` loads it via `Resources.Load`; if it is still magenta, add `Standard` to Project Settings → Graphics → Always Included Shaders.
3. `SurprisePublish` unresolved at link time: `Assets/Plugins/WebGL/SurpriseBridge.jslib` must have its platform set to WebGL in the Inspector (Unity does this automatically for the `Plugins/WebGL` folder).
4. `PlayerSettings.WebGL.template = "APPLICATION:Default"`: if the build complains, delete that line; the default template is what you get anyway.
5. Page says the build is missing: the loader must be at `public/unity/Build/surprise.loader.js`; the file stem follows `PlayerSettings.productName`.
6. `JsonUtility.FromJson` is strict about types: booleans must be JSON `true/false`, numbers plain (both are what `unityRoom.ts` sends).
