import * as THREE from "three";
import type { WorldCollision } from "./WorldCollision";

export interface PropSpec {
  x: number;
  z: number;
  yaw: number;
}

interface PoolInstance {
  x: number;
  z: number;
  yaw: number;
  scale?: number;
}

/**
 * Reusable low-poly city props.
 *
 * Shared geometries and materials keep memory and draw calls down. Repeated
 * props (dumpsters, containers, crates, cones, bollards, AC units) are built
 * as InstancedMesh; larger props like parked cars are individual groups. Every
 * solid prop registers its footprint with the WorldCollision.
 */
export class PropFactory {
  private readonly scene: THREE.Scene;
  private readonly collision: WorldCollision;

  private readonly wheelMat = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.9 });
  private readonly darkMetal = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.6, metalness: 0.6 });
  private readonly greenMetal = new THREE.MeshStandardMaterial({ color: 0x2f4a35, roughness: 0.5, metalness: 0.4 });
  private readonly blueMetal = new THREE.MeshStandardMaterial({ color: 0x1f3a52, roughness: 0.5, metalness: 0.5 });
  private readonly concreteMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.9 });
  private readonly coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a28, roughness: 0.6 });

  constructor(scene: THREE.Scene, collision: WorldCollision) {
    this.scene = scene;
    this.collision = collision;
  }

  /** Parks a static car with a collision box. `color` is the body paint. */
  parkCar(x: number, z: number, yaw: number, color: number): THREE.Group {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.5, 4.2),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 }),
    );
    body.position.y = 0.55;
    group.add(body);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.48, 2.1),
      new THREE.MeshStandardMaterial({ color: 0x0d1520, metalness: 0.9, roughness: 0.2 }),
    );
    glass.position.set(0, 1.05, -0.2);
    group.add(glass);

    const wheelBase = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.34, 4.0), this.wheelMat);
    wheelBase.position.y = 0.22;
    group.add(wheelBase);

    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    this.scene.add(group);
    this.collision.addBox(x - 0.95, z - 2.1, x + 0.95, z + 2.1, 1.3);
    return group;
  }

  /** Builds an instanced set of identical props, registering a collider each. */
  private pool(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    instances: PoolInstance[],
    colliderWidth: number,
    colliderDepth: number,
    colliderHeight: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const m = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const scale = new THREE.Vector3();
      const solid = colliderWidth > 0 && colliderDepth > 0;
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        const s = inst.scale ?? 1;
        pos.set(inst.x, 0, inst.z);
        scale.set(s, s, s);
        m.compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), inst.yaw), scale);
        mesh.setMatrixAt(i, m);
        if (solid) {
          this.collision.addBox(
            inst.x - colliderWidth * 0.5 * s,
            inst.z - colliderDepth * 0.5 * s,
            inst.x + colliderWidth * 0.5 * s,
            inst.z + colliderDepth * 0.5 * s,
            colliderHeight * s,
          );
        }
      }
    this.scene.add(mesh);
    return mesh;
  }

  private readonly dumpsterGeo = new THREE.BoxGeometry(1.4, 1.0, 2.0);
  private readonly containerGeo = new THREE.BoxGeometry(2.5, 2.6, 6.0);
  private readonly crateGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  private readonly coneGeo = new THREE.ConeGeometry(0.28, 0.7, 8);
  private readonly bollardGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.9, 8);
  private readonly acUnitGeo = new THREE.BoxGeometry(1.0, 0.8, 0.8);

  dumpsters(instances: PoolInstance[]): void {
    this.pool(this.dumpsterGeo, this.greenMetal, instances, 1.4, 2.0, 1.0);
  }

  containers(instances: PoolInstance[]): void {
    this.pool(this.containerGeo, this.blueMetal, instances, 2.5, 6.0, 2.6);
  }

  crates(instances: PoolInstance[]): void {
    this.pool(this.crateGeo, this.concreteMat, instances, 0.8, 0.8, 0.8);
  }

  cones(instances: PoolInstance[]): void {
    this.pool(this.coneGeo, this.coneMat, instances, 0.0, 0.0, 0.0);
  }

  bollards(instances: PoolInstance[]): void {
    this.pool(this.bollardGeo, this.concreteMat, instances, 0.35, 0.35, 0.9);
  }

  acUnits(instances: PoolInstance[]): void {
    this.pool(this.acUnitGeo, this.concreteMat, instances, 0.0, 0.0, 0.0);
  }

  bench(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), this.concreteMat);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), this.concreteMat);
    back.position.set(0, 0.72, -0.24);
    const legA = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.4), this.darkMetal);
    legA.position.set(-0.75, 0.22, 0);
    const legB = legA.clone();
    legB.position.x = 0.75;
    group.add(seat, back, legA, legB);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    this.scene.add(group);
  }

  utilityBox(x: number, z: number, yaw: number): void {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.5, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.6, metalness: 0.4 }),
    );
    box.position.y = 0.75;
    const group = new THREE.Group();
    group.add(box);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    this.scene.add(group);
    this.collision.addBox(x - 0.6, z - 0.4, x + 0.6, z + 0.4, 1.5);
  }

  trashBags(x: number, z: number, yaw: number): void {
    const group = new THREE.Group();
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 1 });
    for (const [bx, bz, r, h] of [
      [0, 0, 0.22, 0.42],
      [0.16, 0.1, 0.18, 0.3],
      [-0.14, 0.12, 0.16, 0.26],
    ] as const) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), bagMat);
      bag.position.set(bx, h * 0.5, bz);
      bag.scale.y = 0.7;
      group.add(bag);
    }
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    this.scene.add(group);
  }

  barrier(x: number, z: number, yaw: number, length = 3.0): void {
    const group = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(length, 0.14, 0.16), this.coneMat);
    bar.position.y = 0.32;
    const legA = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.4), this.coneMat);
    legA.position.set(-length * 0.5 + 0.3, 0.15, 0);
    const legB = legA.clone();
    legB.position.x = length * 0.5 - 0.3;
    group.add(bar, legA, legB);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    this.scene.add(group);
    this.collision.addBox(x - length * 0.5, z - 0.2, x + length * 0.5, z + 0.2, 0.7);
  }

  /** Runs a thin fence segment between two points, blocking movement. */
  fence(x1: number, z1: number, x2: number, z2: number, height = 1.6): void {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);

    const group = new THREE.Group();
    const railMat = new THREE.MeshStandardMaterial({ color: 0x2a313a, roughness: 0.7, metalness: 0.5 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, length), railMat);
    rail.position.y = height * 0.5;
    group.add(rail);

    const postCount = Math.max(2, Math.round(length / 3));
    for (let i = 0; i < postCount; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, height + 0.3, 0.12), railMat);
      post.position.set(0, height * 0.5 + 0.15, -length * 0.5 + (i / (postCount - 1)) * length);
      group.add(post);
    }

    group.position.set(x1, 0, z1);
    group.rotation.y = yaw;
    this.scene.add(group);
    this.collision.addBox(Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2), height);
  }

  trafficSign(x: number, z: number, yaw: number, kind: "stop" | "yield" | "noEntry" = "stop"): void {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.7 });
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6), poleMat);
    pole.position.y = 1.15;
    group.add(pole);

    const faceColor = kind === "stop" ? 0xff2222 : kind === "yield" ? 0xffd23a : 0xff5a3a;
    const sign = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 12),
      new THREE.MeshStandardMaterial({ color: faceColor, roughness: 0.6 }),
    );
    sign.position.y = 2.3;
    sign.rotation.x = -0.1;
    group.add(sign);

    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    this.scene.add(group);
  }

  streetSign(x: number, z: number, yaw: number, color: number): void {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a525c, roughness: 0.6, metalness: 0.4 });
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), poleMat);
    pole.position.y = 1.3;
    group.add(pole);
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.4, 0.06),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 }),
    );
    panel.position.y = 2.7;
    group.add(panel);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    this.scene.add(group);
  }
}
