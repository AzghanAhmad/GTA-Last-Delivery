import * as THREE from "three";

export interface StreetLightDef {
  x: number;
  z: number;
  /** Heading; the lamp arm extends +X in local space. */
  yaw: number;
  /** Whether this light casts a real PointLight (use sparingly). */
  withLight: boolean;
}

/**
 * Street lights built as two InstancedMesh (poles + lamp heads) so a whole
 * street stays at two draw calls. Emissive heads provide the glow; only a
 * small, explicit subset also gets a real PointLight to keep the light count
 * low on modest GPUs.
 */
export class StreetLightManager {
  private readonly defs: StreetLightDef[] = [];

  add(def: StreetLightDef): void {
    this.defs.push(def);
  }

  get count(): number {
    return this.defs.length;
  }

  build(scene: THREE.Scene): void {
    if (this.defs.length === 0) return;

    const poleGeo = new THREE.BoxGeometry(0.16, 5.2, 0.16);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x1b222e,
      roughness: 0.6,
      metalness: 0.5,
    });
    const headGeo = new THREE.BoxGeometry(1.0, 0.2, 0.3);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff2d0,
      emissive: 0xffd9a0,
      emissiveIntensity: 1.6,
    });

    const poles = new THREE.InstancedMesh(poleGeo, poleMat, this.defs.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, this.defs.length);
    poles.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    heads.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const m = new THREE.Matrix4();
    const rotation = new THREE.Matrix4();
    const offset = new THREE.Matrix4().makeTranslation(0.58, 0, 0);
    const pos = new THREE.Vector3();

    for (let i = 0; i < this.defs.length; i++) {
      const def = this.defs[i];
      rotation.makeRotationY(def.yaw);

      pos.set(def.x, 2.6, def.z);
      m.copy(rotation);
      m.setPosition(pos);
      poles.setMatrixAt(i, m);

      pos.set(def.x, 4.95, def.z);
      m.copy(rotation).multiply(offset);
      m.setPosition(pos);
      heads.setMatrixAt(i, m);

      if (def.withLight) {
        const light = new THREE.PointLight(0xffd9a0, 30, 22, 2);
        light.position.set(
          def.x + Math.cos(def.yaw) * 0.5,
          4.7,
          def.z + Math.sin(def.yaw) * 0.5,
        );
        scene.add(light);
      }
    }

    scene.add(poles, heads);
  }
}
