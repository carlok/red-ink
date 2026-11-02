/**
 * Tree-shaken Babylon.js 9.30 entry for Sublevel Three.
 * esbuild bundles this into lib/babylon.js (IIFE, global BABYLON).
 * Only the symbols the game touches are exported. Side-effect imports
 * register mesh builders, the outline renderer, and the glTF 2.0 loader.
 */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { SpotLight } from "@babylonjs/core/Lights/spotLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { CreateLathe } from "@babylonjs/core/Meshes/Builders/latheBuilder.js";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.js";

import "@babylonjs/core/Rendering/outlineRenderer.js";
import "@babylonjs/core/Engines/Extensions/engine.query.js";
import "@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery.js";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_transform.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_unlit.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_pbrSpecularGlossiness.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_specular.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_ior.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_emissive_strength.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_lights_punctual.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/ExtrasAsMetadata.js";

export const MeshBuilder = {
  CreateSphere,
  CreateCapsule,
  CreateBox,
  CreateGround,
  CreateCylinder,
  CreatePlane,
  CreateLathe,
  CreateTorus,
};

export {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  FreeCamera,
  Camera,
  HemisphericLight,
  SpotLight,
  PointLight,
  StandardMaterial,
  FresnelParameters,
  ImageProcessingConfiguration,
  ShadowGenerator,
  DynamicTexture,
  Texture,
  ParticleSystem,
  TransformNode,
  Mesh,
  SceneLoader,
  EngineInstrumentation,
  SceneInstrumentation,
};
