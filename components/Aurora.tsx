'use client'

import { useEffect, useRef } from 'react'

interface AuroraProps {
  colorStops?: string[]
  amplitude?: number
  blend?: number
  speed?: number
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  return shader
}

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform float u_amplitude;
uniform float u_blend;
uniform vec3  u_c0;
uniform vec3  u_c1;
uniform vec3  u_c2;

float band(vec2 uv, float offset, float freq, float speed) {
  float t = u_time * speed + offset;
  float wave =
    sin(uv.x * freq        + t * 1.0 ) * 0.35 +
    sin(uv.x * freq * 1.7  + t * 0.8 ) * 0.25 +
    sin(uv.x * freq * 0.5  + t * 1.3 ) * 0.20 +
    sin(uv.x * freq * 2.3  + t * 0.6 ) * 0.12;
  wave *= u_amplitude;
  float dist = uv.y - (0.45 + wave * 0.35);
  return exp(-dist * dist * 10.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;

  float b0 = band(uv, 0.00, 1.8, 0.18);
  float b1 = band(uv, 2.09, 2.2, 0.14);
  float b2 = band(uv, 4.19, 1.4, 0.22);

  vec3 col = u_c0 * b0 + u_c1 * b1 + u_c2 * b2;

  float alpha = clamp((b0 + b1 + b2) * u_blend * 1.4, 0.0, 1.0);
  gl_FragColor = vec4(col * u_blend, alpha);
}
`

export default function Aurora({
  colorStops = ['#00d8ff', '#7928ca', '#ff0080'],
  amplitude = 1.0,
  blend = 0.5,
  speed = 1.0,
}: AuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true })
    if (!gl) return

    const vert = compileShader(gl, gl.VERTEX_SHADER, VERT)
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG)

    const prog = gl.createProgram()!
    gl.attachShader(prog, vert)
    gl.attachShader(prog, frag)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    // Full-screen quad
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const posLoc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const stops = [...colorStops]
    while (stops.length < 3) stops.push(stops[stops.length - 1])

    const [r0, g0, b0] = hexToRgb(stops[0])
    const [r1, g1, b1] = hexToRgb(stops[1])
    const [r2, g2, b2] = hexToRgb(stops[2])

    const uRes       = gl.getUniformLocation(prog, 'u_res')
    const uTime      = gl.getUniformLocation(prog, 'u_time')
    const uAmplitude = gl.getUniformLocation(prog, 'u_amplitude')
    const uBlend     = gl.getUniformLocation(prog, 'u_blend')
    const uC0        = gl.getUniformLocation(prog, 'u_c0')
    const uC1        = gl.getUniformLocation(prog, 'u_c1')
    const uC2        = gl.getUniformLocation(prog, 'u_c2')

    gl.uniform3f(uC0, r0, g0, b0)
    gl.uniform3f(uC1, r1, g1, b1)
    gl.uniform3f(uC2, r2, g2, b2)
    gl.uniform1f(uAmplitude, amplitude)
    gl.uniform1f(uBlend, blend)

    const start = performance.now()
    let raf: number

    function resize() {
      const w = canvas!.clientWidth
      const h = canvas!.clientHeight
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width  = w
        canvas!.height = h
        gl!.viewport(0, 0, w, h)
      }
    }

    function render() {
      resize()
      const t = ((performance.now() - start) / 1000) * speed
      gl!.clearColor(0, 0, 0, 0)
      gl!.clear(gl!.COLOR_BUFFER_BIT)
      gl!.uniform2f(uRes, canvas!.width, canvas!.height)
      gl!.uniform1f(uTime, t)
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)
      raf = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(raf)
  }, [colorStops, amplitude, blend, speed])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
