"use strict";

import { drawAnchoredSpriteFrame } from "./chrisSpriteRenderer.js";
import { EightDirectionResolver } from "./directionResolver.js";
import { SpriteAnimator } from "./spriteAnimator.js";

export class BanditAnimationController {
  constructor(animator, directionResolver = new EightDirectionResolver("south")) {
    this.animator = animator;
    this.directionResolver = directionResolver;
  }

  update(enemy, deltaTimeMs) {
    const state = resolveBanditAnimationState(enemy);
    const vector = resolveBanditFacingVector(enemy, state);
    if (vector) this.animator.setDirection(this.directionResolver.resolveVector(vector.x, vector.y));
    this.animator.setAnimation(state);
    this.animator.update(deltaTimeMs);
    return state;
  }
}

export class BanditSpriteRenderer {
  constructor({ assets, manifest }) {
    this.assets = assets;
    this.manifest = manifest;
    this.controllers = new WeakMap();
    this.imageSmoothingEnabled = false;
  }

  update(enemy, deltaTimeMs) {
    this.getController(enemy).update(enemy, deltaTimeMs);
  }

  render(ctx, enemy) {
    const controller = this.getController(enemy);
    const frame = this.getRenderableFrame(controller.animator.getCurrentFrame());
    if (!frame) return false;

    drawAnchoredSpriteFrame(ctx, frame.image, frame, this.manifest, enemy.x, enemy.y, {
      imageSmoothingEnabled: this.imageSmoothingEnabled,
      flash: enemy.hitFlash > 0
    });
    return true;
  }

  getController(enemy) {
    let controller = this.controllers.get(enemy);
    if (!controller) {
      controller = new BanditAnimationController(new SpriteAnimator(this.manifest));
      this.controllers.set(enemy, controller);
    }
    return controller;
  }

  getRenderableFrame(frame) {
    const animationName = frame.animationName;
    const animation = this.manifest.animations?.[animationName];
    const image = this.assets.getImage(banditAssetKey(animationName));
    if (!animation || !image) return null;

    const frameCount = Math.max(1, animation.framesPerDirection || 1);
    const frameIndex = Math.min(frame.frameIndex, frameCount - 1);
    return {
      ...frame,
      animation,
      image,
      frameIndex,
      sourceX: frameIndex * this.manifest.frameWidth,
      sourceY: frame.directionIndex * this.manifest.frameHeight
    };
  }
}

export function banditAssetKey(animationName) {
  return `bandit:${animationName}`;
}

export function resolveBanditAnimationState(enemy) {
  if (Math.hypot(enemy.vx || 0, enemy.vy || 0) > 8) return "walk";
  return "idle";
}

export function resolveBanditFacingVector(enemy, state = "idle") {
  if (state === "walk") {
    return {
      x: enemy.vx,
      y: enemy.vy
    };
  }

  if (Number.isFinite(enemy.tellAngle) && (enemy.aimWindup > 0 || enemy.cooldown < 0.2)) {
    return {
      x: Math.cos(enemy.tellAngle),
      y: Math.sin(enemy.tellAngle)
    };
  }

  return null;
}
