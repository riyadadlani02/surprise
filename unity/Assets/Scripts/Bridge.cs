// JS <-> Unity bridge. JS calls unityInstance.SendMessage("Bridge", "Command", json); Unity publishes
// {"still":bool,"snapshot":{...}} to window.__surprise through SurprisePublish (Plugins/WebGL/SurpriseBridge.jslib)
// after every command, every FixedUpdate, and once on Start so JS knows Unity is ready.
using System;
using System.Runtime.InteropServices;
using UnityEngine;

public class Bridge : MonoBehaviour
{
    [Serializable]
    public class Cmd
    {
        public string cmd; public string id;
        public float x, y, z, qx, qy, qz, qw = 1f;
        public float dx, dz, strength = 1f, g = -9.81f;
        public bool heavy;
    }

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern void SurprisePublish(string json);
#else
    int logEvery;
#endif

    PlayroomWorld world;

    void Awake() { world = GetComponent<PlayroomWorld>(); if (world == null) world = gameObject.AddComponent<PlayroomWorld>(); }
    void Start() { Publish(); }
    void FixedUpdate() { Publish(); }

    public void Command(string json)
    {
        Cmd c;
        try { c = JsonUtility.FromJson<Cmd>(json); }
        catch (Exception e) { Debug.LogWarning("Bridge: bad command " + json + " (" + e.Message + ")"); return; }
        if (c == null || string.IsNullOrEmpty(c.cmd)) return;
        switch (c.cmd)
        {
            case "place": world.Place(c.id, c.x, c.y, c.z, new Quaternion(c.qx, c.qy, c.qz, c.qw)); break;
            case "hold": world.Hold(c.id); break;
            case "release": world.Release(c.id); break;
            case "push": world.Push(c.id, c.dx, c.dz, c.strength); break;
            case "setGravity": world.SetGravity(c.g); break;
            case "setHeavy": world.SetHeavy(c.id, c.heavy); break;
            case "reset": world.Reset(); break;
            default: Debug.LogWarning("Bridge: unknown command " + c.cmd); break;
        }
        Publish();
    }

    void Publish()
    {
        var json = "{\"still\":" + (world.IsStill() ? "true" : "false") + ",\"snapshot\":" + world.Snapshot() + "}";
#if UNITY_WEBGL && !UNITY_EDITOR
        SurprisePublish(json);
#else
        if (++logEvery % 120 == 0) Debug.Log(json);
#endif
    }
}
