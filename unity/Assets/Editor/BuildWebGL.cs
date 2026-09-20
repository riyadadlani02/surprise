// Headless WebGL build: Unity -batchmode -quit -projectPath unity -executeMethod BuildWebGL.Build
// Builds the scene procedurally (no .unity asset is checked in) and writes to ../public/unity.
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class BuildWebGL
{
    const string ScenePath = "Assets/Scenes/Playroom.unity";
    const string MatPath = "Assets/Resources/Standard.mat";

    public static void Build()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
        var cam = camGo.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0xFE / 255f, 0xFE / 255f, 0xFE / 255f);
        camGo.transform.position = new Vector3(4.5f, 3.8f, -5.5f);
        camGo.transform.LookAt(new Vector3(0f, 0.3f, 0f));

        var lightGo = new GameObject("Directional Light");
        var light = lightGo.AddComponent<Light>();
        light.type = LightType.Directional; light.intensity = 1.1f; light.shadows = LightShadows.Soft;
        lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

        var bridge = new GameObject("Bridge");
        bridge.AddComponent<PlayroomWorld>();
        bridge.AddComponent<Bridge>();

        // A material asset in Resources keeps the Standard shader from being stripped out of the WebGL player.
        Directory.CreateDirectory("Assets/Resources");
        if (AssetDatabase.LoadAssetAtPath<Material>(MatPath) == null)
            AssetDatabase.CreateAsset(new Material(Shader.Find("Standard")), MatPath);

        Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
        if (!EditorSceneManager.SaveScene(scene, ScenePath)) throw new Exception("could not save " + ScenePath);
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };

        PlayerSettings.companyName = "surprise";
        PlayerSettings.productName = "surprise";            // file names: surprise.loader.js / .data / .framework.js / .wasm
        PlayerSettings.bundleVersion = "0.1";
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;   // GitHub Pages serves plain files
        PlayerSettings.WebGL.template = "APPLICATION:Default";
        PlayerSettings.runInBackground = true;

        var outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "public", "unity"));
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { ScenePath }, locationPathName = outDir, target = BuildTarget.WebGL, options = BuildOptions.None,
        });
        if (report.summary.result != BuildResult.Succeeded) throw new Exception("WebGL build failed: " + report.summary.result);
        Debug.Log("WebGL build written to " + outDir);
    }
}
