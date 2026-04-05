import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import mapboxgl from "mapbox-gl";

/** Only draw the tent at this zoom or higher (fly-to uses ~14.5). */
export const TENT_MIN_ZOOM = 14;

export const CAMPSITE_TENT_LAYER_ID = "campsite-tent-3d";
const LAYER_ID = CAMPSITE_TENT_LAYER_ID;
const MODEL_URL = `${import.meta.env.BASE_URL}models/camping-tent.glb`;

/** Target footprint size in meters (width/depth scale hint). */
const TARGET_SIZE_M = 4;

/**
 * @typedef {{ lngLat: [number, number] | null }} TentPlacement
 * Mutate `placement.lngLat` to move the model; set `null` to hide (or zoom &lt; TENT_MIN_ZOOM hides).
 */

/**
 * @param {mapboxgl.Map} map
 * @param {TentPlacement} placement
 * @param {{ beforeId?: string }} [options]
 */
export function addCampsiteTentLayer(map, placement, options = {}) {
  const { beforeId } = options;

  const customLayer = {
    id: LAYER_ID,
    type: "custom",
    renderingMode: "3d",

    onAdd(mapInstance, gl) {
      this.map = mapInstance;
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      const light1 = new THREE.DirectionalLight(0xffffff, 0.9);
      light1.position.set(50, -90, 120).normalize();
      this.scene.add(light1);
      const light2 = new THREE.DirectionalLight(0xffffff, 0.45);
      light2.position.set(-40, 60, 80).normalize();
      this.scene.add(light2);
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

      this.modelRoot = new THREE.Group();
      this.scene.add(this.modelRoot);

      const loader = new GLTFLoader();
      loader.load(
        MODEL_URL,
        (gltf) => {
          const root = gltf.scene;
          root.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });

          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);
          const s = TARGET_SIZE_M / maxDim;
          root.scale.setScalar(s);

          const b2 = new THREE.Box3().setFromObject(root);
          const cx = (b2.min.x + b2.max.x) / 2;
          const cz = (b2.min.z + b2.max.z) / 2;
          root.position.set(-cx, -b2.min.y, -cz);

          this.modelRoot.add(root);
          this.modelRoot.visible = false;
          this.map.triggerRepaint();
        },
        undefined,
        (err) => {
          console.warn(
            "[campsite-tent] Could not load 3D model from",
            MODEL_URL,
            err
          );
        }
      );

      this.renderer = new THREE.WebGLRenderer({
        canvas: mapInstance.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
    },

    render(_gl, matrix) {
      const zoom = this.map.getZoom();
      const lngLat = placement.lngLat;
      const show =
        lngLat &&
        zoom >= TENT_MIN_ZOOM &&
        this.modelRoot &&
        this.modelRoot.children.length > 0;

      if (!show) {
        if (this.modelRoot) this.modelRoot.visible = false;
        return;
      }

      this.modelRoot.visible = true;

      const elev =
        this.map.queryTerrainElevation(lngLat, { exaggerated: true }) ?? 0;
      const mc = mapboxgl.MercatorCoordinate.fromLngLat(lngLat, elev);
      const meterScale = mc.meterInMercatorCoordinateUnits();

      const rotateY = THREE.MathUtils.degToRad(-this.map.getBearing());

      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );
      const rotationY = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 1, 0),
        rotateY
      );
      const rotationZ = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 0, 1),
        0
      );

      const m = new THREE.Matrix4().fromArray(matrix);
      const l = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX)
        .multiply(rotationY)
        .multiply(rotationZ);

      this.camera.projectionMatrix = m.multiply(l);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
  };

  if (map.getLayer(LAYER_ID)) {
    map.removeLayer(LAYER_ID);
  }
  map.addLayer(customLayer, beforeId);
}

export function removeCampsiteTentLayer(map) {
  if (map.getLayer(LAYER_ID)) {
    map.removeLayer(LAYER_ID);
  }
}
