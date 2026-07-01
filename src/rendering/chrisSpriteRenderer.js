"use strict";

import { EightDirectionResolver } from "./directionResolver.js";

export const CHRIS_ANIMATION_STATE_PRIORITY = [
  "hurt",
  "mounted",
  "shoot",
  "aim",
  "dash",
  "walk",
  "idle"
];

export class ChrisAnimationController {
  constructor(animator, directionResolver = new EightDirectionResolver("south")) {
    this.animator = animator;
    this.directionResolver = directionResolver;
    this.lastState = "idle";
  }

  update(player, context, deltaTimeMs) {
    const state = resolveChrisAnimationState(player, context, this.animator);
    const vector = resolveChrisFacingVector(player, context, state);
    if (vector) this.animator.setDirection(this.directionResolver.resolveVector(vector.x, vector.y));
    this.animator.setAnimation(state);
    this.animator.update(deltaTimeMs);
    this.lastState = state;
    return state;
  }
}

export class ChrisSpriteRenderer {
  constructor({ assets, manifest, animator, controller }) {
    this.assets = assets;
    this.manifest = manifest;
    this.animator = animator;
    this.controller = controller;
    this.imageSmoothingEnabled = false;
  }

  render(ctx, player, context, deltaTimeMs) {
    this.controller.update(player, context, deltaTimeMs);
    const frame = this.getRenderableFrame(this.animator.getCurrentFrame());
    if (!frame) return false;

    drawAnchoredSpriteFrame(ctx, frame.image, frame, this.manifest, player.x, player.y, {
      imageSmoothingEnabled: this.imageSmoothingEnabled,
      flash: player.hitFlash > 0
    });
    return true;
  }

  getRenderableFrame(frame) {
    let animationName = frame.animationName;
    const visited = new Set();

    while (animationName && !visited.has(animationName)) {
      visited.add(animationName);
      const animation = this.manifest.animations?.[animationName];
      const image = this.assets.getImage(chrisAssetKey(animationName));
      if (animation && image) {
        const frameCount = Math.max(1, animation.framesPerDirection || 1);
        const frameIndex = Math.min(frame.frameIndex, frameCount - 1);
        return {
          ...frame,
          animationName,
          animation,
          image,
          frameIndex,
          sourceX: frameIndex * this.manifest.frameWidth,
          sourceY: frame.directionIndex * this.manifest.frameHeight
        };
      }
      animationName = animation?.fallback || this.manifest.fallbackAnimation;
    }

    return null;
  }
}

export function drawAnchoredSpriteFrame(ctx, image, frame, manifest, x, y, options = {}) {
  const scale = manifest.drawScale ?? 1;
  const frameWidth = manifest.frameWidth;
  const frameHeight = manifest.frameHeight;
  const anchorX = (manifest.anchor?.x ?? frameWidth / 2) * scale;
  const anchorY = (manifest.anchor?.y ?? frameHeight) * scale;
  const drawWidth = frameWidth * scale;
  const drawHeight = frameHeight * scale;

  ctx.save();
  ctx.imageSmoothingEnabled = options.imageSmoothingEnabled ?? false;
  ctx.drawImage(
    image,
    frame.sourceX,
    frame.sourceY,
    frameWidth,
    frameHeight,
    x - anchorX,
    y - anchorY,
    drawWidth,
    drawHeight
  );

  if (options.flash) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(255, 194, 142, 0.45)";
    ctx.fillRect(x - anchorX, y - anchorY, drawWidth, drawHeight);
  }

  ctx.restore();
}

export function chrisAssetKey(animationName) {
  return `chris:${animationName}`;
}

export function resolveChrisAnimationState(player, context = {}, animator = null) {
  if (animator?.getCurrentFrame().animationName === "shoot" && !animator.isFinished()) return "shoot";
  if (player.hitFlash > 0) return "hurt";
  if (player.mounted) return "mounted";
  if (player.recoil > 0) return "shoot";
  if (context.isAiming) return "aim";
  if (player.dashTimer > 0) return "dash";
  if (Math.hypot(player.vx, player.vy) > 8) return "walk";
  return "idle";
}

export function resolveChrisFacingVector(player, context = {}, state = "idle") {
  if (state === "aim" || state === "shoot") {
    return {
      x: Math.cos(player.lastAim),
      y: Math.sin(player.lastAim)
    };
  }

  if (state === "dash") {
    return {
      x: player.dashDirX,
      y: player.dashDirY
    };
  }

  if (state === "walk" || state === "mounted") {
    return {
      x: player.vx,
      y: player.vy
    };
  }

  return null;
}
