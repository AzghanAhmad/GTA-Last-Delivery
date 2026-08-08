import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/**
 * Vite-indexed model and texture URLs under src/assets/.
 *
 * Files are never downloaded automatically; anything the developer drops into
 * the asset folders is registered here at build time. The resolved URL string
 * is produced by Vite, so no asset URL is ever invented in code.
 */
const modelGlobs = import.meta.glob("/src/assets/**/*.glb", { query: "?url", import: "default" });
const gltfGlobs = import.meta.glob("/src/assets/**/*.gltf", { query: "?url", import: "default" });
const textureGlobs = import.meta.glob("/src/assets/**/*.{png,jpg,jpeg,webp}", {
  query: "?url",
  import: "default",
});

type UrlLoader = () => Promise<string>;

export interface AssetLoadState {
  total: number;
  loaded: number;
  failed: number;
  pending: number;
  errors: readonly string[];
}

/**
 * Loads, caches and clones GLTF/GLB assets and textures.
 *
 * Responsibilities: one loader instance, cache by asset id, deduplication of
 * concurrent requests, clone-on-demand of reusable models, error capture with
 * a loading state report, and an optional DRACO decoder for compressed GLBs.
 */
export class AssetManager {
  private readonly loader: GLTFLoader;
  private readonly draco: DRACOLoader;
  private readonly models = new Map<string, UrlLoader>();
  private readonly textures = new Map<string, UrlLoader>();
  private readonly gltfCache = new Map<string, Promise<GLTF>>();
  private readonly textureCache = new Map<string, Promise<THREE.Texture>>();
  private readonly gltfResults = new Map<string, GLTF>();
  private readonly textureResults = new Map<string, THREE.Texture>();
  private readonly errors: string[] = [];
  private loadedCount = 0;
  private failedCount = 0;

  constructor(decoderPath = "/draco/") {
    this.draco = new DRACOLoader();
    this.draco.setDecoderPath(decoderPath);
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(this.draco);
    this.indexAssets();
  }

  /** Builds the id -> loader index from the Vite glob results. */
  private indexAssets(): void {
    const modelEntries: Record<string, UrlLoader> = {
      ...(modelGlobs as Record<string, UrlLoader>),
      ...(gltfGlobs as Record<string, UrlLoader>),
    };
    for (const [key, load] of Object.entries(modelEntries)) {
      this.models.set(toId(key), load);
    }
    for (const [key, load] of Object.entries(textureGlobs as Record<string, UrlLoader>)) {
      this.textures.set(toId(key), load);
    }
  }

  /** True when a model is registered under this asset id. */
  hasModel(id: string): boolean {
    return this.models.has(id);
  }

  /** True when a texture is registered under this asset id. */
  hasTexture(id: string): boolean {
    return this.textures.has(id);
  }

  /** All registered model ids (for debug/tooling). */
  availableModels(): string[] {
    return [...this.models.keys()];
  }

  /** Current loading status, for debug overlays and loading screens. */
  get loadingState(): AssetLoadState {
    return {
      total: this.models.size + this.textures.size,
      loaded: this.loadedCount,
      failed: this.failedCount,
      pending: Math.max(0, this.gltfCache.size + this.textureCache.size - this.loadedCount - this.failedCount),
      errors: this.errors,
    };
  }

  /**
   * Loads (or returns the cached) GLTF for an asset id like "vehicles/supercar".
   * Concurrent calls share one request. The promise is evicted from the cache
   * on failure so a later attempt can retry.
   */
  loadModel(id: string): Promise<GLTF> {
    const loader = this.models.get(id);
    if (!loader) {
      this.failedCount++;
      const message = `[AssetManager] No model registered as "${id}". Place it in src/assets/ (see src/assets/README.md).`;
      this.errors.push(message);
      return Promise.reject(new Error(message));
    }
    const cached = this.gltfCache.get(id);
    if (cached) return cached;

    const promise = loader()
      .then((url) => this.loader.loadAsync(url))
      .then((gltf) => {
        this.loadedCount++;
        this.gltfResults.set(id, gltf);
        return gltf;
      });
    promise.catch((error: unknown) => {
      this.failedCount++;
      this.errors.push(`[AssetManager] Failed to load "${id}": ${String(error)}`);
      this.gltfCache.delete(id);
    });
    this.gltfCache.set(id, promise);
    return promise;
  }

  /** Synchronous access to an already-loaded model (undefined if not ready). */
  getModel(id: string): GLTF | undefined {
    return this.gltfResults.get(id);
  }

  /** Synchronous access to an already-loaded texture (undefined if not ready). */
  getTexture(id: string): THREE.Texture | undefined {
    return this.textureResults.get(id);
  }

  /** Clones the loaded model's scene, ready to be added to the world. */
  cloneModel(id: string): Promise<THREE.Group> {
    return this.loadModel(id).then((gltf) => {
      const root = gltf.scene.clone(true);
      root.traverse((object) => {
        object.frustumCulled = true;
      });
      return root;
    });
  }

  /** Loads a texture by asset id (cached, deduplicated). */
  loadTexture(id: string): Promise<THREE.Texture> {
    const loader = this.textures.get(id);
    if (!loader) {
      this.failedCount++;
      const message = `[AssetManager] No texture registered as "${id}". Place it in src/assets/.`;
      this.errors.push(message);
      return Promise.reject(new Error(message));
    }
    const cached = this.textureCache.get(id);
    if (cached) return cached;

    const promise = loader()
      .then((url) => new THREE.TextureLoader().loadAsync(url))
      .then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        this.loadedCount++;
        this.textureResults.set(id, texture);
        return texture;
      });
    promise.catch((error: unknown) => {
      this.failedCount++;
      this.errors.push(`[AssetManager] Failed to load texture "${id}": ${String(error)}`);
      this.textureCache.delete(id);
    });
    this.textureCache.set(id, promise);
    return promise;
  }
}

/** Strips the src/assets/ prefix and the file extension to build an asset id. */
function toId(key: string): string {
  const withoutPrefix = key.replace(/^\/src\/assets\//, "");
  return withoutPrefix.replace(/\.[a-z0-9]+$/i, "");
}
