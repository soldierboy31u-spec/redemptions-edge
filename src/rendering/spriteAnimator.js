"use strict";

export class SpriteAnimator {
  constructor(manifest) {
    this.manifest = manifest;
    this.direction = manifest.directions?.[0] || "south";
    this.animationName = this.resolveAnimationName(manifest.fallbackAnimation);
    this.frameIndex = 0;
    this.elapsedMs = 0;
    this.finished = false;
  }

  setAnimation(name) {
    const next = this.resolveAnimationName(name);
    if (next === this.animationName) return;
    this.animationName = next;
    this.frameIndex = 0;
    this.elapsedMs = 0;
    this.finished = false;
  }

  setDirection(direction) {
    if (!this.manifest.directions?.includes(direction)) return;
    this.direction = direction;
  }

  update(deltaTimeMs) {
    const animation = this.getAnimation();
    if (!animation || this.finished) return;

    const frameDurationMs = Math.max(1, animation.frameDurationMs || 100);
    const frameCount = Math.max(1, animation.framesPerDirection || 1);
    this.elapsedMs += Math.max(0, deltaTimeMs);

    while (this.elapsedMs >= frameDurationMs && !this.finished) {
      this.elapsedMs -= frameDurationMs;
      this.frameIndex += 1;

      if (this.frameIndex >= frameCount) {
        if (animation.loop !== false) {
          this.frameIndex = 0;
        } else {
          this.frameIndex = frameCount - 1;
          this.finished = true;
        }
      }
    }
  }

  isFinished() {
    return this.finished;
  }

  getAnimation() {
    return this.manifest.animations?.[this.animationName] || null;
  }

  getCurrentFrame() {
    const animation = this.getAnimation();
    const directions = this.manifest.directions || [this.direction];
    const directionIndex = Math.max(0, directions.indexOf(this.direction));

    return {
      animationName: this.animationName,
      animation,
      direction: this.direction,
      directionIndex,
      frameIndex: this.frameIndex,
      frameWidth: this.manifest.frameWidth,
      frameHeight: this.manifest.frameHeight,
      sourceX: this.frameIndex * this.manifest.frameWidth,
      sourceY: directionIndex * this.manifest.frameHeight
    };
  }

  resolveAnimationName(name) {
    const animations = this.manifest.animations || {};
    const fallback = this.manifest.fallbackAnimation;
    const visited = new Set();
    let current = name;

    while (current && !visited.has(current)) {
      visited.add(current);
      if (animations[current]) return current;
      current = animations[current]?.fallback;
    }

    if (fallback && animations[fallback]) return fallback;
    return Object.keys(animations)[0] || "";
  }
}
