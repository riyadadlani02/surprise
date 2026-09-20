// The Rapier playroom (src/env/playroom/physics.ts) rebuilt in Unity. Numbers mirror physics.ts exactly.
//
// COORDINATES. Rapier/Three.js are right-handed, Unity is left-handed. Everything that crosses the
// bridge is converted here, once, on the way IN (JS sends Rapier coordinates):
//   unity.pos = (x, y, -z)            unity.quat = (-qx, -qy, qz, qw)
// The snapshot is published in raw Unity coordinates and src/env/playroom/unityRoom.ts applies the
// exact inverse (negate z, negate quaternion x and y) on the way OUT. Push directions arrive in
// Rapier space: left=(-1,0,0) right=(1,0,0) forward=(0,0,-1) back=(0,0,1).
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;

public class PlayroomWorld : MonoBehaviour
{
    class Spec
    {
        public string id, kind; public Vector3 half; public Color color; public Vector3 home; // home in Rapier space
        public Spec(string id, string kind, float hx, float hy, float hz, uint rgb, float x, float y, float z)
        { this.id = id; this.kind = kind; half = new Vector3(hx, hy, hz); home = new Vector3(x, y, z);
          color = new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f); }
    }

    static readonly Spec[] SPECS = {
        new Spec("red",   "block", 0.2f,  0.2f,  0.2f,  0xd94a3d, -1.5f, 0.2f,  0f),
        new Spec("blue",  "block", 0.25f, 0.25f, 0.25f, 0x3b6fd9, -0.5f, 0.25f, 0f),
        new Spec("green", "block", 0.15f, 0.15f, 0.15f, 0x3fa35b,  0.4f, 0.15f, 0f),
        new Spec("ball",  "ball",  0.18f, 0.18f, 0.18f, 0xf2b134,  1.3f, 0.18f, 0f),
        new Spec("cup",   "cup",   0.32f, 0.3f,  0.32f, 0xcfcfd6,  0f,   0.3f,  1.3f),
        new Spec("box",   "box",   0.45f, 0.35f, 0.45f, 0x8a6a4a, -1.6f, 0.35f, -1.4f),
        new Spec("lid",   "lid",   0.45f, 0.03f, 0.45f, 0x6a4a2a, -0.5f, 0.03f, -1.6f),
        new Spec("ramp",  "ramp",  0.9f,  0.05f, 0.6f,  0x7a7a88,  1.6f, 0.35f, -1.3f),
    };
    const float WALL = 0.03f;           // container wall thickness
    static readonly Quaternion RAMP_ROT = ToUnity(new Quaternion(0f, 0f, Mathf.Sin(-0.42f / 2f), Mathf.Cos(-0.42f / 2f)));

    readonly Dictionary<string, Spec> specs = new Dictionary<string, Spec>();
    readonly Dictionary<string, Rigidbody> bodies = new Dictionary<string, Rigidbody>();
    readonly Dictionary<string, float> baseMass = new Dictionary<string, float>();
    readonly HashSet<string> held = new HashSet<string>();
    readonly HashSet<string> heavy = new HashSet<string>();
    Material template;

    // ---- coordinate conversion (see header) ----
    public static Vector3 ToUnity(Vector3 v) => new Vector3(v.x, v.y, -v.z);
    public static Quaternion ToUnity(Quaternion q) => new Quaternion(-q.x, -q.y, q.z, q.w);

    void Awake()
    {
        Physics.gravity = new Vector3(0f, -9.81f, 0f);
        var floorMat = new PhysicsMaterial { staticFriction = 0.8f, dynamicFriction = 0.8f, bounciness = 0f };
        Box("floor", Vector3.zero, new Vector3(0f, -0.1f, 0f), new Vector3(6f, 0.1f, 6f), new Color(0.97f, 0.97f, 0.97f), floorMat);
        var wallMat = new PhysicsMaterial { staticFriction = 0.5f, dynamicFriction = 0.5f, bounciness = 0f };
        Box("wall+x", Vector3.zero, new Vector3(4f, 0.4f, 0f), new Vector3(0.1f, 0.4f, 4f), Color.clear, wallMat);
        Box("wall-x", Vector3.zero, new Vector3(-4f, 0.4f, 0f), new Vector3(0.1f, 0.4f, 4f), Color.clear, wallMat);
        Box("wall+z", Vector3.zero, new Vector3(0f, 0.4f, 4f), new Vector3(4f, 0.4f, 0.1f), Color.clear, wallMat);
        Box("wall-z", Vector3.zero, new Vector3(0f, 0.4f, -4f), new Vector3(4f, 0.4f, 0.1f), Color.clear, wallMat);
        foreach (var s in SPECS) { specs[s.id] = s; Spawn(s); }
    }

    Material Mat(Color c)
    {
        if (template == null) template = Resources.Load<Material>("Standard");   // shipped by BuildWebGL so the shader is not stripped
        if (template == null)
        {
            var shader = Shader.Find("Standard") ?? Shader.Find("Universal Render Pipeline/Lit");
            if (shader != null) template = new Material(shader);
            else { var probe = GameObject.CreatePrimitive(PrimitiveType.Cube); template = new Material(probe.GetComponent<Renderer>().sharedMaterial); Destroy(probe); }
        }
        var m = new Material(template) { color = c };
        return m;
    }

    /// A cube primitive (visual + BoxCollider) of the given half extents under `parent` (null = world root).
    GameObject Box(string name, Vector3 localPos, Vector3 worldPos, Vector3 half, Color color, PhysicsMaterial pm, Transform parent = null)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = name;
        go.transform.localScale = half * 2f;
        if (parent != null) { go.transform.SetParent(parent, false); go.transform.localPosition = localPos; }
        else go.transform.position = worldPos;
        go.GetComponent<Collider>().material = pm;
        var r = go.GetComponent<Renderer>();
        if (color.a == 0f) Destroy(r); else r.sharedMaterial = Mat(color);
        return go;
    }

    void Spawn(Spec s)
    {
        var root = new GameObject(s.id);
        root.transform.SetPositionAndRotation(ToUnity(s.home), s.id == "ramp" ? RAMP_ROT : Quaternion.identity);
        var pm = new PhysicsMaterial { staticFriction = 0.7f, dynamicFriction = 0.7f, bounciness = s.kind == "ball" ? 0.3f : 0.05f };
        var h = s.half;
        float volume;
        switch (s.kind)
        {
            case "ball":
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                go.name = "ball-mesh"; go.transform.SetParent(root.transform, false); go.transform.localScale = Vector3.one * h.x * 2f;
                go.GetComponent<Collider>().material = pm; go.GetComponent<Renderer>().sharedMaterial = Mat(s.color);
                volume = 4f / 3f * Mathf.PI * h.x * h.x * h.x;
                break;
            }
            case "cup": case "box":
            {
                // Open container: bottom plus four walls, exactly the Rapier compound (wall thickness 0.03).
                float t = WALL;
                var parts = new[] {
                    (new Vector3(0f, -h.y + t, 0f), new Vector3(h.x, t, h.z)),
                    (new Vector3(-h.x + t, 0f, 0f), new Vector3(t, h.y, h.z)),
                    (new Vector3(h.x - t, 0f, 0f),  new Vector3(t, h.y, h.z)),
                    (new Vector3(0f, 0f, -h.z + t), new Vector3(h.x, h.y, t)),
                    (new Vector3(0f, 0f, h.z - t),  new Vector3(h.x, h.y, t)),
                };
                volume = 0f;
                foreach (var (pos, half) in parts) { Box(s.id + "-part", pos, Vector3.zero, half, s.color, pm, root.transform); volume += 8f * half.x * half.y * half.z; }
                break;
            }
            default:
                Box(s.id + "-mesh", Vector3.zero, Vector3.zero, h, s.color, pm, root.transform);
                volume = 8f * h.x * h.y * h.z;
                break;
        }
        var rb = root.AddComponent<Rigidbody>();
        rb.mass = volume;                       // Rapier density 1
        rb.linearDamping = 0.2f; rb.angularDamping = 0.5f;
        rb.interpolation = RigidbodyInterpolation.Interpolate;
        rb.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;   // valid on kinematic bodies too (Hold sets isKinematic)
        if (s.id == "ramp") rb.isKinematic = true;
        bodies[s.id] = rb; baseMass[s.id] = volume;
    }

    // ---- Room operations (arguments in Rapier space) ----
    public void Place(string id, float x, float y, float z, Quaternion q)
    {
        if (!bodies.TryGetValue(id, out var rb)) return;
        var p = ToUnity(new Vector3(x, y, z)); var r = ToUnity(q);
        rb.transform.SetPositionAndRotation(p, r);
        rb.position = p; rb.rotation = r;
        if (!rb.isKinematic) { rb.linearVelocity = Vector3.zero; rb.angularVelocity = Vector3.zero; rb.WakeUp(); }
    }
    public void Hold(string id)
    {
        if (id == "ramp" || !bodies.TryGetValue(id, out var rb)) return;
        rb.isKinematic = true; held.Add(id);
    }
    public void Release(string id)
    {
        if (id == "ramp" || !held.Contains(id) || !bodies.TryGetValue(id, out var rb)) return;
        rb.isKinematic = false; rb.WakeUp(); held.Remove(id);
    }
    public void Push(string id, float dx, float dz, float strength)
    {
        if (!bodies.TryGetValue(id, out var rb) || rb.isKinematic) return;
        float m = rb.mass;
        rb.WakeUp();
        rb.AddForce(ToUnity(new Vector3(dx * strength * m * 2.2f, 0.2f * m, dz * strength * m * 2.2f)), ForceMode.Impulse);
    }
    public void SetGravity(float g) { Physics.gravity = new Vector3(0f, g, 0f); foreach (var rb in bodies.Values) rb.WakeUp(); }
    public void SetHeavy(string id, bool on)
    {
        if (!bodies.TryGetValue(id, out var rb)) return;
        rb.mass = baseMass[id] * (on ? 8f : 1f);
        if (on) heavy.Add(id); else heavy.Remove(id);
    }
    public void Reset()
    {
        foreach (var s in SPECS)
        {
            Release(s.id);
            Place(s.id, s.home.x, s.home.y, s.home.z, s.id == "ramp" ? new Quaternion(0f, 0f, Mathf.Sin(-0.42f / 2f), Mathf.Cos(-0.42f / 2f)) : Quaternion.identity);
        }
        SetGravity(-9.81f);
    }
    public bool IsStill()
    {
        foreach (var rb in bodies.Values)
            if (!rb.isKinematic && (rb.linearVelocity.magnitude >= 0.02f || rb.angularVelocity.magnitude >= 0.05f)) return false;
        return true;
    }

    /// JSON in the TS Snapshot shape, raw Unity coordinates (unityRoom.ts converts). JsonUtility cannot
    /// serialise dictionaries, so it is written by hand with invariant-culture numbers.
    public string Snapshot()
    {
        var sb = new StringBuilder(2048);
        sb.Append("{\"objs\":{");
        bool first = true;
        foreach (var s in SPECS)
        {
            var rb = bodies[s.id]; var t = rb.transform;
            var v = rb.isKinematic ? Vector3.zero : rb.linearVelocity;
            if (!first) sb.Append(','); first = false;
            sb.Append('"').Append(s.id).Append("\":{\"id\":\"").Append(s.id).Append("\",\"kind\":\"").Append(s.kind).Append("\",");
            Vec(sb, "pos", t.position); sb.Append(',');
            Quat(sb, "rot", t.rotation); sb.Append(',');
            Vec(sb, "half", s.half); sb.Append(',');
            Vec(sb, "vel", v); sb.Append(',');
            Vec(sb, "up", t.up); sb.Append(',');
            sb.Append("\"held\":").Append(held.Contains(s.id) ? "true" : "false").Append(",\"heavy\":").Append(heavy.Contains(s.id) ? "true" : "false").Append('}');
        }
        sb.Append("},\"gravity\":").Append(F(Physics.gravity.y)).Append('}');
        return sb.ToString();
    }

    static string F(float x) => (float.IsNaN(x) || float.IsInfinity(x) ? 0f : x).ToString("R", CultureInfo.InvariantCulture);
    static void Vec(StringBuilder sb, string k, Vector3 v) => sb.Append('"').Append(k).Append("\":[").Append(F(v.x)).Append(',').Append(F(v.y)).Append(',').Append(F(v.z)).Append(']');
    static void Quat(StringBuilder sb, string k, Quaternion q) => sb.Append('"').Append(k).Append("\":[").Append(F(q.x)).Append(',').Append(F(q.y)).Append(',').Append(F(q.z)).Append(',').Append(F(q.w)).Append(']');
}
