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
