// GPU skeletal animation for people and animals.
// Each vertex carries a joint id (aBone); each instance carries an animation clip + phase (aAnim).
// The vertex shader procedurally poses the joints, so motion is smooth and costs one draw call per model.

import * as THREE from 'three';
import type { FogUniforms } from './batches';
import { applyModelScans, type ScanAtlas } from './realism';

export const BN = {
  ROOT: 0, PELVIS: 1, TORSO: 2, HEAD: 3,
  UARM_R: 4, LARM_R: 5, HAND_R: 6, UARM_L: 7, LARM_L: 8, HAND_L: 9,
  THIGH_L: 10, SHIN_L: 11, THIGH_R: 12, SHIN_R: 13, CAPE: 14,
  Q_BODY: 16, Q_NECK: 17, Q_FL_U: 18, Q_FL_L: 19, Q_FR_U: 20, Q_FR_L: 21, Q_BL_U: 22, Q_BL_L: 23, Q_BR_U: 24, Q_BR_L: 25, Q_TAIL: 26,
} as const;
export const NUM_BONES = 27;

/** Human animation clips. */
export const CLIP = {
  IDLE: 0, WALK: 1, READY: 2, SWING: 3, THRUST: 4, BOW: 5, AIM: 6, THROW: 7, CHOP: 8, HOE: 9, FORAGE: 10,
  HAMMER: 11, PRAY: 12, CARRY: 13, DEAD: 14, HEAL: 15,
} as const;
/** Quadruped clips. */
export const QCLIP = { IDLE: 0, WALK: 1, GALLOP: 2, ATTACK: 3, DEAD: 4 } as const;

/** Weapon-holding styles (affects idle/walk arm poses). */
export const STYLE = { NONE: 0, ONEHAND: 1, SPEAR: 2, BOW: 3, GUN: 4, TWOHAND: 5, STAFF: 6, TOOL: 7, THROW: 8 } as const;

export interface Rig {
  piv: Float32Array; // NUM_BONES * 3
  mounted: boolean;
  quad: boolean;
  style: number;
  graze: boolean;
}

const GLSL = /* glsl */ `
attribute float aBone;
attribute float aTag;
attribute vec4 aAnim;
/** previous clip, its phase, previous mount clip, blend weight of the current pose (1 = no blend) */
attribute vec4 aAnimB;
attribute vec2 aShow;
uniform vec3 uPiv[${NUM_BONES}];
uniform float uMounted;
uniform float uQuad;
uniform float uStyle;
uniform float uGraze;

#define TAU 6.2831853

mat3 rx(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 ry(float a){ float c = cos(a), s = sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rz(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
void rotAbout(inout vec3 p, inout vec3 n, vec3 piv, mat3 R){ p = R * (p - piv) + piv; n = R * n; }

struct HP {
  float bob; float lean; float twist; float hz; float hy; float roll;
  float sR; float aR; float eR; float wR;
  float sL; float aL; float eL; float wL;
  float tL; float kL; float tR; float kR; float cape;
};

HP zeroHP(){ return HP(0.,0.,0.,0.,0.,0., 0.,0.,0.,0., 0.,0.,0.,0., 0.,0.,0.,0., 0.); }

HP mixHP(HP a, HP b, float w){
  return HP(mix(a.bob,b.bob,w), mix(a.lean,b.lean,w), mix(a.twist,b.twist,w), mix(a.hz,b.hz,w), mix(a.hy,b.hy,w), mix(a.roll,b.roll,w),
    mix(a.sR,b.sR,w), mix(a.aR,b.aR,w), mix(a.eR,b.eR,w), mix(a.wR,b.wR,w),
    mix(a.sL,b.sL,w), mix(a.aL,b.aL,w), mix(a.eL,b.eL,w), mix(a.wL,b.wL,w),
    mix(a.tL,b.tL,w), mix(a.kL,b.kL,w), mix(a.tR,b.tR,w), mix(a.kR,b.kR,w), mix(a.cape,b.cape,w));
}

float seq3(float h, float w, float s, float t){
  float k1 = smoothstep(0., .42, t), k2 = smoothstep(.42, .56, t), k3 = smoothstep(.64, 1., t);
  return mix(mix(mix(h, w, k1), s, k2), h, k3);
}

void holdPose(inout HP h, float st){
  if (st < .5)      { h.sR=.06; h.eR=.2;  h.sL=.06; h.eL=.2; }
  else if (st < 1.5){ h.sR=.3;  h.eR=1.;  h.wR=-.35; h.sL=.42; h.aL=.12; h.eL=1.25; h.wL=-.2; }
  else if (st < 2.5){ h.sR=.25; h.eR=.9;  h.wR=.3;   h.sL=.45; h.aL=.05; h.eL=.9; }
  else if (st < 3.5){ h.sR=.08; h.eR=.25; h.sL=.12; h.eL=.35; }
  else if (st < 4.5){ h.sR=.3;  h.eR=.95; h.wR=-.95; h.sL=.85; h.aL=-.35; h.eL=.95; }
  else if (st < 5.5){ h.sR=.35; h.eR=1.1; h.wR=-.2;  h.sL=.42; h.aL=-.42; h.eL=1.1; }
  else if (st < 6.5){ h.sR=.2;  h.eR=.95; h.wR=.45;  h.sL=.12; h.eL=.4; }
  else if (st < 7.5){ h.sR=.18; h.eR=.85; h.wR=.5;   h.sL=.06; h.eL=.25; }
  else              { h.sR=.3;  h.eR=1.;  h.wR=-.35; h.sL=.42; h.aL=.12; h.eL=1.25; h.wL=-.2; }
}

void walkLegs(inout HP h, float t, float armAmp){
  float w = TAU * t;
  float s = sin(w), c = cos(w);
  // thighs: longer forward reach than back swing
  h.tL = s > 0. ? .56 * s : .42 * s;
  h.tR = -s > 0. ? -.56 * s : -.42 * s;
  // knees lift on the forward swing, soften slightly on heel strike
  h.kL = -.12 - .95 * max(0., c) * max(0., c + .2) - .12 * max(0., -s);
  h.kR = -.12 - .95 * max(0., -c) * max(0., -c + .2) - .12 * max(0., s);
  // arms counter-swing; elbows lag behind and bend more going forward
  float sl = sin(w - .35);
  h.sR += armAmp * s; h.sL -= armAmp * s;
  h.eR += armAmp * (.35 + .55 * max(0., sl)); h.eL += armAmp * (.35 + .55 * max(0., -sl));
  h.aR += .06; h.aL += .06;
  // body: double-frequency bob, hip sway, shoulder counter-twist, steady head
  h.bob = .016 * (1. - abs(s)) - .009;
  h.roll = .045 * s;
  h.twist += .12 * s; h.lean += .08 + .02 * cos(2. * w);
  h.hy -= .09 * s; h.hz += .03 * cos(2. * w);
  h.cape += .32 + .12 * abs(s);
}

HP hpose(float clip, float t, float st){
  HP h = zeroHP();
  holdPose(h, st);
  HP a = h;
  bool armed = st > .5;
  if (clip < .5) {                       // IDLE
    float br = sin(TAU * t);
    float shift = smoothstep(-.4, .4, sin(TAU * t * .17));   // slow weight shift between legs
    h.roll = .035 * (shift * 2. - 1.);
    h.tL = .06 * shift; h.kL = -.14 * shift; h.tR = .06 * (1. - shift); h.kR = -.14 * (1. - shift);
    h.bob = .004 * br - .006; h.lean = .01 * br + .015;
    h.sR += .035 * br; h.sL += .035 * br; h.eR += .05; h.eL += .05;
    h.hy = .45 * sin(TAU * t * .21) * smoothstep(.3, .9, sin(TAU * t * .13));
    h.hz = .06 * sin(TAU * t * .5);
    h.cape = .08 + .05 * br;
  } else if (clip < 1.5) {               // WALK
    walkLegs(h, t, armed ? .12 : .45);
  } else if (clip < 2.5) {               // READY (combat stance)
    float br = sin(TAU * t);
    h.tL = .22; h.kL = -.32; h.tR = -.12; h.kR = -.25; h.bob = -.018 + .004 * br; h.lean = .12;
    h.sR += .05 * br; h.twist = -.08;
  } else if (clip < 3.5) {               // SWING (overhead strike)
    h.sR = seq3(a.sR, 2.75, .5, t); h.eR = seq3(a.eR, .45, .08, t); h.wR = seq3(a.wR, .25, -.45, t);
    h.sL = seq3(a.sL, a.sL + .15, a.sL - .15, t);
    h.lean = seq3(.05, -.14, .3, t); h.twist = seq3(0., -.32, .34, t);
    h.tL = seq3(.1, 0., .4, t); h.kL = seq3(-.15, -.1, -.3, t); h.tR = seq3(-.05, .05, -.3, t); h.kR = seq3(-.1, -.1, -.25, t);
    h.bob = seq3(0., .01, -.03, t); h.hz = seq3(0., -.1, .15, t);
  } else if (clip < 4.5) {               // THRUST
    h.sR = seq3(a.sR, .45, 1.45, t); h.eR = seq3(a.eR, 1.55, .12, t); h.wR = seq3(a.wR, -1.35, -1.47, t);
    h.sL = seq3(a.sL, .3, 1.2, t); h.eL = seq3(a.eL, 1.2, .3, t);
    h.lean = seq3(.05, -.1, .32, t); h.twist = seq3(0., -.35, .3, t);
    h.tL = seq3(.1, .05, .5, t); h.kL = seq3(-.15, -.1, -.35, t); h.tR = seq3(-.05, 0., -.35, t);
    h.bob = seq3(0., 0., -.03, t);
  } else if (clip < 5.5) {               // BOW
    float k1 = smoothstep(0., .5, t), k2 = smoothstep(.66, .72, t), k3 = smoothstep(.8, 1., t);
    HP d = a; d.sL = 1.52; d.aL = .05; d.eL = 0.; d.wL = -1.52; d.sR = 1.42; d.aR = .3; d.eR = 2.55; d.wR = 0.; d.twist = -.35; d.hy = .25; d.tL = .2; d.kL = -.15; d.tR = -.15;
    HP r = d; r.sR = 1.55; r.aR = .6; r.eR = 1.1;
    h.sL = mix(mix(mix(a.sL, d.sL, k1), r.sL, k2), a.sL, k3);
    h.aL = mix(mix(mix(a.aL, d.aL, k1), r.aL, k2), a.aL, k3);
    h.eL = mix(mix(mix(a.eL, d.eL, k1), r.eL, k2), a.eL, k3);
    h.wL = mix(mix(mix(a.wL, d.wL, k1), r.wL, k2), a.wL, k3);
    h.sR = mix(mix(mix(a.sR, d.sR, k1), r.sR, k2), a.sR, k3);
    h.aR = mix(mix(mix(a.aR, d.aR, k1), r.aR, k2), a.aR, k3);
    h.eR = mix(mix(mix(a.eR, d.eR, k1), r.eR, k2), a.eR, k3);
    h.twist = mix(mix(d.twist * k1, r.twist, k2), 0., k3);
    h.hy = mix(d.hy * k1, 0., k3);
    h.tL = mix(d.tL * k1, 0., k3); h.kL = mix(d.kL * k1, 0., k3); h.tR = mix(d.tR * k1, 0., k3);
  } else if (clip < 6.5) {               // AIM (crossbow / gun)
    float k1 = smoothstep(0., .35, t), kick = smoothstep(.45, .5, t) * (1. - smoothstep(.5, .75, t)), k3 = smoothstep(.82, 1., t);
    float k = k1 * (1. - k3);
    h.sR = mix(a.sR, 1.3, k) - .3 * kick; h.eR = mix(a.eR, .45, k); h.wR = mix(a.wR, -1.75, k);
    h.sL = mix(a.sL, 1.35, k) - .25 * kick; h.aL = mix(a.aL, -.5, k); h.eL = mix(a.eL, .45, k);
    h.twist = -.15 * k; h.lean = .05 * k - .12 * kick; h.hz = .12 * k;
    h.tL = .2 * k; h.kL = -.2 * k; h.tR = -.1 * k;
  } else if (clip < 7.5) {               // THROW
    h.sR = seq3(a.sR, 2.95, .75, t); h.eR = seq3(a.eR, .95, .05, t); h.wR = seq3(a.wR, .3, -.25, t);
    h.sL = seq3(a.sL, 1.1, -.2, t); h.eL = seq3(a.eL, .4, .2, t);
    h.lean = seq3(.05, -.18, .3, t); h.twist = seq3(0., -.38, .42, t);
    h.tL = seq3(.1, -.05, .4, t); h.kL = seq3(-.1, -.05, -.3, t); h.tR = seq3(-.05, .1, -.3, t);
  } else if (clip < 8.5) {               // CHOP / MINE (two-handed overhead, cyclic)
    float f = fract(t);
    h.sR = seq3(.7, 2.6, .72, f); h.eR = seq3(.4, .35, .08, f); h.wR = seq3(.3, .45, -1.12, f);
    h.sL = h.sR - .05; h.eL = h.eR; h.aR = -.22; h.aL = -.22;
    h.lean = seq3(.15, -.1, .38, f); h.twist = seq3(0., -.12, .1, f);
    h.tL = .18; h.kL = -.25; h.tR = -.08; h.kR = -.2; h.bob = seq3(-.01, 0., -.03, f);
  } else if (clip < 9.5) {               // HOE (farming)
    float f = fract(t);
    h.sR = seq3(.7, 1.85, .5, f); h.eR = seq3(.4, .35, .05, f); h.wR = seq3(.4, .2, -.75, f);
    h.sL = h.sR - .1; h.eL = h.eR + .1; h.aR = -.2; h.aL = -.2;
    h.lean = seq3(.3, .15, .45, f); h.tL = .25; h.kL = -.3; h.tR = -.1; h.kR = -.2; h.bob = -.02;
  } else if (clip < 10.5) {              // FORAGE / butcher (crouched, reaching)
    float s = sin(TAU * t);
    h.lean = .6; h.tL = .5; h.tR = .45; h.kL = -.75; h.kR = -.7; h.bob = -.06; h.hz = .35;
    h.sR = .95 + .38 * s; h.eR = .35 + .2 * max(0., -s); h.sL = .95 - .38 * s; h.eL = .35 + .2 * max(0., s);
    h.aR = -.1; h.aL = -.1;
  } else if (clip < 11.5) {              // HAMMER (kneeling builder)
    float f = fract(t);
    h.lean = .35; h.tR = .6; h.kR = -.8; h.tL = -.1; h.kL = -.15; h.bob = -.04; h.hz = .25;
    h.sR = seq3(.9, 1.85, .55, f); h.eR = seq3(1., 1.35, .3, f); h.wR = seq3(-.2, .15, -.6, f);
    h.sL = .85; h.eL = .7; h.aL = -.15;
  } else if (clip < 12.5) {              // PRAY / CONVERT
    float s = sin(TAU * t);
    h.sR = 2.3 + .18 * s; h.aR = .45; h.eR = .35; h.sL = 2.3 - .18 * s; h.aL = .45; h.eL = .35;
    h.lean = -.08 + .03 * s; h.hz = -.25; h.twist = .06 * s; h.cape = .2;
  } else if (clip < 13.5) {              // CARRY (walk with a load on the shoulder)
    walkLegs(h, t, .4);
    h.sL = 2.75; h.aL = .15; h.eL = 1.75; h.wL = 0.; h.twist *= .5;
  } else if (clip < 14.5) {              // DEAD
    h.sR = 2.4; h.aR = .9; h.eR = .3; h.sL = 2.; h.aL = 1.; h.eL = .4;
    h.tL = .25; h.kL = -.5; h.tR = -.15; h.kR = -.2; h.hz = .5;
  } else {                               // HEAL
    float s = sin(TAU * t);
    h.sR = 1.25 + .1 * s; h.aR = -.1; h.eR = .25; h.sL = 1.25 - .1 * s; h.aL = -.1; h.eL = .25; h.lean = .05;
  }
  if (uMounted > .5) {
    h.tL = 1.45; h.tR = 1.45; h.kL = -1.55; h.kR = -1.55; h.bob = 0.;
  }
  return h;
}

void humanChain(inout vec3 p, inout vec3 n, int b, HP h){
  if (b == 6) rotAbout(p, n, uPiv[6], rz(h.wR));
  if (b == 5 || b == 6) rotAbout(p, n, uPiv[5], rz(h.eR));
  if (b >= 4 && b <= 6) rotAbout(p, n, uPiv[4], rz(h.sR) * rx(-h.aR));
  if (b == 9) rotAbout(p, n, uPiv[9], rz(h.wL));
  if (b == 8 || b == 9) rotAbout(p, n, uPiv[8], rz(h.eL));
  if (b >= 7 && b <= 9) rotAbout(p, n, uPiv[7], rz(h.sL) * rx(h.aL));
  float ma = uMounted > .5 ? .42 : 0.;
  if (b == 11) rotAbout(p, n, uPiv[11], rz(h.kL));
  if (b == 10 || b == 11) rotAbout(p, n, uPiv[10], rz(h.tL) * rx(ma));
  if (b == 13) rotAbout(p, n, uPiv[13], rz(h.kR));
  if (b == 12 || b == 13) rotAbout(p, n, uPiv[12], rz(h.tR) * rx(-ma));
  if (b == 3) rotAbout(p, n, uPiv[3], ry(h.hy) * rz(-h.hz));
  if (b == 14) rotAbout(p, n, uPiv[14], rz(h.cape));
  if ((b >= 2 && b <= 9) || b == 14) rotAbout(p, n, uPiv[2], ry(h.twist) * rz(-h.lean) * rx(h.roll));
  if (b == 1) rotAbout(p, n, uPiv[1], rx(-h.roll * .6));
  if (b >= 1 && b <= 9 || b == 14) p.y += h.bob;
}

struct QP { float bob; float pitch; float neck; float tail; float fl; float fr; float bl; float br; float flk; float frk; float blk; float brk; };

QP mixQP(QP a, QP b, float w){
  return QP(mix(a.bob,b.bob,w), mix(a.pitch,b.pitch,w), mix(a.neck,b.neck,w), mix(a.tail,b.tail,w), mix(a.fl,b.fl,w), mix(a.fr,b.fr,w), mix(a.bl,b.bl,w), mix(a.br,b.br,w),
    mix(a.flk,b.flk,w), mix(a.frk,b.frk,w), mix(a.blk,b.blk,w), mix(a.brk,b.brk,w));
}

QP qpose(float clip, float t){
  QP q = QP(0.,0.,0.,0.,0.,0.,0.,0.,0.,0.,0.,0.);
  float w = TAU * t;
  if (clip < .5) {
    q.neck = .07 * sin(w * .5); q.tail = .3 * sin(w * 1.7);
    float g = smoothstep(.5, .6, fract(t * .12)) * (1. - smoothstep(.85, .95, fract(t * .12)));
    q.neck += g * 1.05 * uGraze; q.bob = .003 * sin(w);
  } else if (clip < 1.5) {
    float s = sin(w), c = cos(w);
    q.fl = .38 * s; q.br = .38 * s; q.fr = -.38 * s; q.bl = -.38 * s;
    q.flk = -.8 * max(0., c); q.brk = -.55 * max(0., c); q.frk = -.8 * max(0., -c); q.blk = -.55 * max(0., -c);
    q.bob = .012 * abs(c); q.neck = .07 * sin(2. * w); q.tail = .15 * s;
  } else if (clip < 2.5) {
    q.fl = .72 * sin(w); q.fr = .72 * sin(w - .6); q.bl = .62 * sin(w + 3.14); q.br = .62 * sin(w + 3.14 - .6);
    q.flk = -1.1 * max(0., cos(w)); q.frk = -1.1 * max(0., cos(w - .6));
    q.blk = -.7 * max(0., cos(w + 3.14)); q.brk = -.7 * max(0., cos(w + 2.54));
    q.pitch = .09 * sin(w + 1.57); q.bob = .035 * (.5 + .5 * sin(2. * w)); q.neck = -.16 * sin(w + 1.); q.tail = .35;
  } else if (clip < 3.5) {
    q.pitch = seq3(0., .14, -.1, t); q.neck = seq3(0., -.35, .55, t);
    q.fl = seq3(0., .5, -.2, t); q.fr = seq3(0., .4, -.1, t); q.flk = seq3(0., -.8, 0., t); q.frk = seq3(0., -.6, 0., t);
    q.bob = seq3(0., .04, -.01, t); q.tail = .3;
  } else {
    q.fl = .6; q.fr = .35; q.bl = -.5; q.br = -.3; q.flk = -.4; q.neck = .5;
  }
  return q;
}

void quadChain(inout vec3 p, inout vec3 n, int b, QP q){
  if (b == 19) rotAbout(p, n, uPiv[19], rz(q.flk));
  if (b == 18 || b == 19) rotAbout(p, n, uPiv[18], rz(q.fl));
  if (b == 21) rotAbout(p, n, uPiv[21], rz(q.frk));
  if (b == 20 || b == 21) rotAbout(p, n, uPiv[20], rz(q.fr));
  if (b == 23) rotAbout(p, n, uPiv[23], rz(q.blk));
  if (b == 22 || b == 23) rotAbout(p, n, uPiv[22], rz(q.bl));
  if (b == 25) rotAbout(p, n, uPiv[25], rz(q.brk));
  if (b == 24 || b == 25) rotAbout(p, n, uPiv[24], rz(q.br));
  if (b == 17) rotAbout(p, n, uPiv[17], rz(-q.neck));
  if (b == 26) rotAbout(p, n, uPiv[26], ry(q.tail) * rz(-.15 * abs(q.tail)));
  rotAbout(p, n, uPiv[16], rz(q.pitch));
  p.y += q.bob;
}

void rigPose(inout vec3 p, inout vec3 n){
  if (aTag > .5 && abs(aTag - aShow.x) > .5 && abs(aTag - aShow.y) > .5) { p = vec3(0., -60., 0.); return; }
  int b = int(aBone + .5);
  if (uQuad > .5) {
    QP q = qpose(aAnim.x, aAnim.y);
    if (aAnimB.w < .999) q = mixQP(qpose(aAnimB.x, aAnimB.y), q, aAnimB.w);
    if (b >= 16) quadChain(p, n, b, q);
    return;
  }
  float st = uStyle;
  if (st < .5 && aShow.x > .5 && aShow.x < 9.5) st = 7.;
  HP h = hpose(aAnim.x, aAnim.y, st);
  if (aAnimB.w < .999) h = mixHP(hpose(aAnimB.x, aAnimB.y, st), h, aAnimB.w);
  if (b > 0 && b < 16) humanChain(p, n, b, h);
  if (uMounted > .5) {
    QP q = qpose(aAnim.z, aAnim.w);
    if (aAnimB.w < .999) q = mixQP(qpose(aAnimB.z, aAnim.w), q, aAnimB.w);
    if (b >= 16) quadChain(p, n, b, q);
    else { rotAbout(p, n, uPiv[16], rz(q.pitch)); p.y += q.bob; }
  }
}
`;

export interface RigUniforms {
  uPiv: { value: THREE.Vector3[] };
  uMounted: { value: number };
  uQuad: { value: number };
  uStyle: { value: number };
  uGraze: { value: number };
}

function rigUniforms(r: Rig): RigUniforms {
  const v: THREE.Vector3[] = [];
  for (let i = 0; i < NUM_BONES; i++) v.push(new THREE.Vector3(r.piv[i * 3], r.piv[i * 3 + 1], r.piv[i * 3 + 2]));
  return { uPiv: { value: v }, uMounted: { value: r.mounted ? 1 : 0 }, uQuad: { value: r.quad ? 1 : 0 }, uStyle: { value: r.style }, uGraze: { value: r.graze ? 1 : 0 } };
}

function inject(shader: THREE.WebGLProgramParametersWithUniforms, u: RigUniforms, depth: boolean) {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + GLSL);
  if (depth) {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3( position );\nvec3 rigN = vec3(0., 1., 0.);\nrigPose( transformed, rigN );');
  } else {
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\nvec3 rigP = vec3( position );\nrigPose( rigP, objectNormal );')
      .replace('#include <begin_vertex>', 'vec3 transformed = rigP;');
  }
}

/** Lit material for a rigged model (fog-of-war + clouds + skeleton). */
export function makeRigMaterial(r: Rig, fog: FogUniforms | null, scans?: ScanAtlas, wind?: { value: number }): THREE.MeshLambertMaterial | THREE.MeshStandardMaterial {
  const u = rigUniforms(r);
  const m = scans
    ? new THREE.MeshStandardMaterial({ vertexColors: true, map: scans.color, normalMap: scans.normal, roughness: 0.95, normalScale: new THREE.Vector2(0.65, 0.65) })
    : new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    inject(shader, u, false);
    if (scans) applyModelScans(shader, scans, wind);
    if (fog) applyFogToShader(shader, fog);
  };
  m.customProgramCacheKey = () => `${scans ? 'realism-' : ''}${fog ? 'rig-fog' : 'rig'}`;
  return m;
}

export function makeRigDepthMaterial(r: Rig): THREE.MeshDepthMaterial {
  const u = rigUniforms(r);
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => inject(shader, u, true);
  m.customProgramCacheKey = () => 'rig-depth';
  return m;
}

/** Same fog / cloud injection used by the other lit materials (kept in sync with batches.applyFog). */
export function applyFogToShader(shader: THREE.WebGLProgramParametersWithUniforms, u: FogUniforms) {
  if (u.atmosphere) {
    Object.assign(shader.uniforms, u.atmosphere);
    // Evaluated per vertex and interpolated: no extra textures or rendering pass.
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying float vHaze;
      uniform float hazeNear;
      uniform float hazeRange;
      uniform float hazeStrength;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying float vHaze;
      uniform vec3 hazeColor;`);
  }
  shader.uniforms.fogMap = u.fogMap;
  shader.uniforms.fogSize = u.fogSize;
  shader.uniforms.cloudMap = u.cloudMap;
  shader.uniforms.cloudT = u.cloudT;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vFogUv;\nuniform float fogSize;')
    .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 fogWp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogWp = instanceMatrix * fogWp;
  #endif
  fogWp = modelMatrix * fogWp;
  vFogUv = fogWp.xz / fogSize;
  ${u.atmosphere ? `float hazeDepth = max(0.0, -(viewMatrix * fogWp).z - hazeNear) / hazeRange;
  float heightFalloff = exp(-max(0.0, fogWp.y) * 0.08);
  vHaze = min(0.38, (1.0 - exp(-hazeDepth * hazeDepth * hazeStrength)) * heightFalloff);` : ''}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vFogUv;\nuniform sampler2D fogMap;\nuniform sampler2D cloudMap;\nuniform float cloudT;\nuniform float fogSize;')
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  ${u.atmosphere ? 'gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, vHaze);' : ''}
  float fogV = texture2D( fogMap, vFogUv ).r;
  if (vFogUv.x < 0.0 || vFogUv.y < 0.0 || vFogUv.x > 1.0 || vFogUv.y > 1.0) fogV = 0.0;
  vec2 cuv = vFogUv * fogSize / 48.0 + vec2(cloudT * 0.006, cloudT * 0.0035);
  float cl = texture2D( cloudMap, cuv ).r;
  gl_FragColor.rgb *= fogV * mix(1.0, 0.8, smoothstep(0.45, 0.75, cl));`);
}
