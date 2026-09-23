import React, { useEffect, useRef } from 'react';

// One eye of a side-by-side 180° video, shown as a normal flat view you can
// drag around — what Stash and PotPlayer call VR mode. The <video> keeps
// playing underneath (it still owns the clock, the controls and the Handy
// sync); this only draws its current frame.
//
// Done in a fragment shader rather than by mapping the video onto a sphere
// mesh: for every screen pixel, work out which way that pixel looks, then
// where that direction lands in the equirectangular frame. No 3D library,
// no geometry, and it is exact at every pixel.

// The browser's control bar is left uncovered so play/seek/volume still work.
// Like the scrubber inset, this is an approximation of a closed shadow root.
const NATIVE_CONTROLS_PX = 48;

const MIN_FOV = 30 * Math.PI / 180;
const MAX_FOV = 110 * Math.PI / 180;
const DEFAULT_FOV = 75 * Math.PI / 180;
// Less than this much pointer travel is a click (play/pause), not a drag.
const CLICK_SLOP_PX = 4;

const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_ndc;
void main() {
  v_ndc = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 v_ndc;
uniform sampler2D u_frame;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_tanHalfFov;
uniform float u_aspect;
const float PI = 3.14159265359;
void main() {
  vec3 d = vec3(v_ndc.x * u_tanHalfFov * u_aspect, v_ndc.y * u_tanHalfFov, 1.0);
  float cp = cos(u_pitch), sp = sin(u_pitch);
  d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
  float cy = cos(u_yaw), sy = sin(u_yaw);
  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
  d = normalize(d);

  float lon = atan(d.x, d.z);
  float lat = asin(d.y);
  if (abs(lon) > PI * 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  // Left eye is the left half of the frame; texture row 0 is the top.
  vec2 uv = vec2((lon / PI + 0.5) * 0.5, 0.5 - lat / PI);
  gl_FragColor = texture2D(u_frame, uv);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function VrView({ videoRef }) {
  const canvasRef = useRef(null);
  // Mutated by the pointer handlers and read by the draw loop, so a drag
  // never re-renders React.
  const viewRef = useRef({ yaw: 0, pitch: 0, fov: DEFAULT_FOV });
  const dragRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return undefined;

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    gl.useProgram(program);

    // Two triangles covering the screen.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Video frames are rarely power-of-two sized, which WebGL 1 only allows
    // with clamped edges and no mipmaps.
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const u = name => gl.getUniformLocation(program, name);
    const uYaw = u('u_yaw'), uPitch = u('u_pitch'), uTan = u('u_tanHalfFov'), uAspect = u('u_aspect');

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Redrawn every frame, not only on new video frames, so dragging while
    // paused still moves the view.
    let raf;
    const draw = () => {
      const video = videoRef.current;
      if (video && video.readyState >= video.HAVE_CURRENT_DATA) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
        const { yaw, pitch, fov } = viewRef.current;
        gl.uniform1f(uYaw, yaw);
        gl.uniform1f(uPitch, pitch);
        gl.uniform1f(uTan, Math.tan(fov / 2));
        gl.uniform1f(uAspect, canvas.width / canvas.height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      // Browsers cap live WebGL contexts, so give this one back now rather
      // than whenever the canvas is collected.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [videoRef]);

  // Wheel zoom needs preventDefault, which React's onWheel can't do (it is
  // registered passive), so it is attached by hand.
  useEffect(() => {
    const canvas = canvasRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const view = viewRef.current;
      view.fov = clamp(view.fov * Math.exp(e.deltaY * 0.001), MIN_FOV, MAX_FOV);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const view = viewRef.current;
    // Grab-the-world: the point under the pointer stays under it.
    const radPerPx = view.fov / e.currentTarget.clientHeight;
    view.yaw = clamp(view.yaw - (e.clientX - drag.x) * radPerPx, -Math.PI / 2, Math.PI / 2);
    view.pitch = clamp(view.pitch + (e.clientY - drag.y) * radPerPx, -Math.PI / 2, Math.PI / 2);
    drag.x = e.clientX;
    drag.y = e.clientY;
  };

  const onPointerUp = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    const video = videoRef.current;
    // Clicking the plain video plays/pauses it; keep that.
    if (moved < CLICK_SLOP_PX && video) {
      if (video.paused) video.play(); else video.pause();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-x-0 top-0 w-full cursor-grab active:cursor-grabbing touch-none"
      style={{ height: `calc(100% - ${NATIVE_CONTROLS_PX}px)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragRef.current = null; }}
      title="Drag to look around, scroll to zoom"
    />
  );
}
