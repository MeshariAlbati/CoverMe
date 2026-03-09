'use client'

import { useEffect, useRef } from 'react'
import { Renderer, Program, Mesh, Triangle } from 'ogl'

interface LightRaysProps {
  raysOrigin?: 'top-center' | 'top-left' | 'top-right' | 'center'
  raysColor?: string
  raysSpeed?: number
  lightSpread?: number
  rayLength?: number
  followMouse?: boolean
  mouseInfluence?: number
  noiseAmount?: number
  distortion?: number
  className?: string
  pulsating?: boolean
  fadeDistance?: number
  saturation?: number
}

const vertexShader = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_origin;
uniform vec3 u_color;
uniform float u_speed;
uniform float u_spread;
uniform float u_rayLength;
uniform float u_noiseAmount;
uniform float u_distortion;
uniform float u_fadeDistance;
uniform float u_pulsating;
uniform vec2 u_mouse;
uniform float u_mouseInfluence;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;

  vec2 origin = u_origin;
  origin += u_mouse * u_mouseInfluence;

  vec2 dir = uv - origin;
  dir.x *= aspect;

  float angle = atan(dir.y, dir.x);
  float dist = length(dir);

  float t = u_time * u_speed;

  float n = noise(vec2(angle * 3.0 + t * 0.3, t * 0.2)) * u_noiseAmount;
  float angleN = angle + n;

  float spread = u_spread;
  float numRays = 12.0;
  float rayIndex = floor((angleN + 3.14159) / (2.0 * 3.14159 / numRays));
  float rayCenter = (rayIndex + 0.5) * (2.0 * 3.14159 / numRays) - 3.14159;
  float angleDiff = abs(mod(angleN - rayCenter + 3.14159, 2.0 * 3.14159) - 3.14159);
  float ray = smoothstep(spread, 0.0, angleDiff);

  float flicker = noise(vec2(rayIndex * 7.3, t * 0.8)) * 0.4 + 0.6;
  ray *= flicker;

  float pulseFactor = u_pulsating > 0.5 ? (sin(t * 1.5 + rayIndex * 0.7) * 0.15 + 0.85) : 1.0;
  ray *= pulseFactor;

  float falloff = 1.0 - smoothstep(0.0, u_rayLength * u_fadeDistance, dist);
  falloff = pow(falloff, 1.5);

  float distort = u_distortion * noise(vec2(dist * 3.0 - t, angle * 2.0)) * (1.0 - dist);
  float intensity = ray * falloff * (1.0 + distort);

  intensity = clamp(intensity, 0.0, 1.0);
  intensity *= 0.55;

  vec3 col = u_color * intensity;

  gl_FragColor = vec4(col, intensity);
}
`

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [1, 1, 1]
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ]
}

function getOriginUV(origin: string): [number, number] {
  switch (origin) {
    case 'top-left': return [0.1, 1.05]
    case 'top-right': return [0.9, 1.05]
    case 'center': return [0.5, 0.5]
    case 'top-center':
    default: return [0.5, 1.05]
  }
}

export default function LightRays({
  raysOrigin = 'top-center',
  raysColor = '#ffffff',
  raysSpeed = 1,
  lightSpread = 0.5,
  rayLength = 3,
  followMouse = true,
  mouseInfluence = 0.1,
  noiseAmount = 0,
  distortion = 0,
  className = '',
  pulsating = false,
  fadeDistance = 1,
  saturation = 1,
}: LightRaysProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false })
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    container.appendChild(gl.canvas)

    const resize = () => {
      renderer.setSize(container.offsetWidth, container.offsetHeight)
    }
    resize()
    window.addEventListener('resize', resize)

    const geometry = new Triangle(gl)
    const [r, g, b] = hexToRgb(raysColor)
    const [ox, oy] = getOriginUV(raysOrigin)

    const mouse = { x: 0, y: 0 }
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouse.x = (e.clientX - rect.left) / rect.width - 0.5
      mouse.y = -((e.clientY - rect.top) / rect.height - 0.5)
    }
    if (followMouse) window.addEventListener('mousemove', handleMouseMove)

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        u_resolution: { value: [container.offsetWidth, container.offsetHeight] },
        u_time: { value: 0 },
        u_origin: { value: [ox, oy] },
        u_color: { value: [r * saturation + (1 - saturation), g * saturation + (1 - saturation), b * saturation + (1 - saturation)] },
        u_speed: { value: raysSpeed },
        u_spread: { value: lightSpread * 0.4 },
        u_rayLength: { value: rayLength },
        u_noiseAmount: { value: noiseAmount },
        u_distortion: { value: distortion },
        u_fadeDistance: { value: fadeDistance },
        u_pulsating: { value: pulsating ? 1.0 : 0.0 },
        u_mouse: { value: [0, 0] },
        u_mouseInfluence: { value: mouseInfluence },
      },
      transparent: true,
    })

    const mesh = new Mesh(gl, { geometry, program })

    let raf: number
    let start = performance.now()

    const render = () => {
      raf = requestAnimationFrame(render)
      const elapsed = (performance.now() - start) / 1000
      program.uniforms.u_time.value = elapsed
      program.uniforms.u_resolution.value = [container.offsetWidth, container.offsetHeight]
      if (followMouse) {
        program.uniforms.u_mouse.value = [mouse.x, mouse.y]
      }
      renderer.render({ scene: mesh })
    }

    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      if (followMouse) window.removeEventListener('mousemove', handleMouseMove)
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [raysOrigin, raysColor, raysSpeed, lightSpread, rayLength, followMouse, mouseInfluence, noiseAmount, distortion, pulsating, fadeDistance, saturation])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  )
}
