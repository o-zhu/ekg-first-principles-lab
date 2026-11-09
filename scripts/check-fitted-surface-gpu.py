#!/usr/bin/env python3
"""Compile the shipped fit-viewer shaders and verify signed front colors.

This independent check uses an already installed surfaceless EGL runtime. It
does not require a browser, window, network, or nonstandard Python package.
The complete, unmodified GLSL ES 1.00 pair is compiled and rendered. Expected
palette colors come from the actual JavaScript software-renderer functions;
only the shader's lighting expression is evaluated independently here.

Run: python scripts/check-fitted-surface-gpu.py
"""
import ctypes as c
import ctypes.util
import json
import math
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault('LIBGL_ALWAYS_SOFTWARE', '1')
os.environ.setdefault('MESA_SHADER_CACHE_DISABLE', 'true')
try:
    egl = c.CDLL(ctypes.util.find_library('EGL') or 'libEGL.so.1')
    gl = c.CDLL(ctypes.util.find_library('GL') or 'libGL.so.1')
except OSError as error:
    raise SystemExit('SKIP: installed EGL/OpenGL runtime unavailable: ' + str(error))
I, U, P, F = c.c_int, c.c_uint, c.c_void_p, c.c_float


def api(lib, name, result, args):
    f = getattr(lib, name)
    f.restype, f.argtypes = result, args
    return f


def ef(name, result, args):
    return api(egl, name, result, args)


def gf(name, result, args):
    return api(gl, name, result, args)


display = ef('eglGetPlatformDisplay', P, [U, P, c.POINTER(I)])(0x31DD, None, None)
major, minor = I(), I()
if not ef('eglInitialize', U, [P, c.POINTER(I), c.POINTER(I)])(display, c.byref(major), c.byref(minor)):
    raise SystemExit('SKIP: surfaceless EGL display unavailable')
ef('eglBindAPI', U, [U])(0x30A0)
config, count = P(), I()
attrs = (I * 13)(0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3033, 1, 0x3040, 4, 0x3021, 8, 0x3038)
assert ef('eglChooseConfig', U, [P, c.POINTER(I), c.POINTER(P), I, c.POINTER(I)])(display, attrs, c.byref(config), 1, c.byref(count)) and count.value
context = ef('eglCreateContext', P, [P, P, P, c.POINTER(I)])(display, config, None, (I * 3)(0x3098, 3, 0x3038))
surface = ef('eglCreatePbufferSurface', P, [P, P, c.POINTER(I)])(display, config, (I * 5)(0x3057, 2, 0x3056, 2, 0x3038))
assert context and surface and ef('eglMakeCurrent', U, [P, P, P, P])(display, surface, surface, context)
runtime = gf('glGetString', c.c_char_p, [U])(0x1F02).decode()

source = (ROOT / 'dist/fit-surface.js').read_text()
shader_source = {name: re.search(r'const ' + name + r'=`([^`]+)`;', source).group(1) for name in ['vs', 'fs']}
create_shader = gf('glCreateShader', U, [U])
set_shader_source = gf('glShaderSource', None, [U, I, c.POINTER(c.c_char_p), c.POINTER(I)])
compile_shader = gf('glCompileShader', None, [U])
get_shader = gf('glGetShaderiv', None, [U, U, c.POINTER(I)])
shader_log = gf('glGetShaderInfoLog', None, [U, I, c.POINTER(I), P])
program = gf('glCreateProgram', U, [])()
for kind, name in [(0x8B31, 'vs'), (0x8B30, 'fs')]:
    shader, encoded = create_shader(kind), shader_source[name].encode()
    set_shader_source(shader, 1, (c.c_char_p * 1)(encoded), None)
    compile_shader(shader)
    ok = I()
    get_shader(shader, 0x8B81, c.byref(ok))
    if not ok.value:
        log = c.create_string_buffer(16384)
        shader_log(shader, len(log), None, log)
        raise AssertionError(name + ': ' + log.value.decode())
    gf('glAttachShader', None, [U, U])(program, shader)
gf('glLinkProgram', None, [U])(program)
ok = I()
gf('glGetProgramiv', None, [U, U, c.POINTER(I)])(program, 0x8B82, c.byref(ok))
if not ok.value:
    log = c.create_string_buffer(16384)
    gf('glGetProgramInfoLog', None, [U, I, c.POINTER(I), P])(program, len(log), None, log)
    raise AssertionError(log.value.decode())
gf('glUseProgram', None, [U])(program)
location = gf('glGetUniformLocation', I, [U, c.c_char_p])
uniform1f = gf('glUniform1f', None, [I, F])
uniform2f = gf('glUniform2f', None, [I, F, F])
uniform3f = gf('glUniform3f', None, [I, F, F, F])
uniform_matrix = gf('glUniformMatrix3fv', None, [I, I, U, c.POINTER(F)])


def set_uniform(name, value):
    loc = location(program, name.encode())
    if isinstance(value, (list, tuple)):
        {2: uniform2f, 3: uniform3f}[len(value)](loc, *value)
    else:
        uniform1f(loc, value)


uniform_matrix(location(program, b'rotation'), 1, 0, (F * 9)(1, 0, 0, 0, 1, 0, 0, 0, 1))
for name, value in {'center': [0, 0, 0], 'scale': [1, 1], 'cut': 0,
                    'cutNormal': [0, 0, 1], 'cutOffset': 0, 'isCap': 0}.items():
    set_uniform(name, value)

buffer = U()
gf('glGenBuffers', None, [I, c.POINTER(U)])(1, c.byref(buffer))
gf('glBindBuffer', None, [U, U])(0x8892, buffer)
triangle = (F * 9)(-1, -1, 0, 3, -1, 0, -1, 3, 0)
gf('glBufferData', None, [U, c.c_ssize_t, P, U])(0x8892, c.sizeof(triangle), triangle, 0x88E4)
attribute = gf('glGetAttribLocation', I, [U, c.c_char_p])
position_location = attribute(program, b'position')
gf('glVertexAttribPointer', None, [U, I, U, U, I, P])(position_location, 3, 0x1406, 0, 0, None)
gf('glEnableVertexAttribArray', None, [U])(position_location)
gf('glVertexAttrib3f', None, [U, F, F, F])(attribute(program, b'normal'), 0, 0, 1)
set_value = gf('glVertexAttrib1f', None, [U, F])
value_location = attribute(program, b'value')

output_texture, framebuffer = U(), U()
gf('glGenTextures', None, [I, c.POINTER(U)])(1, c.byref(output_texture))
gf('glBindTexture', None, [U, U])(0x0DE1, output_texture)
gf('glTexImage2D', None, [U, I, I, I, I, I, U, U, P])(0x0DE1, 0, 0x8814, 1, 1, 0, 0x1908, 0x1406, None)
gf('glGenFramebuffers', None, [I, c.POINTER(U)])(1, c.byref(framebuffer))
gf('glBindFramebuffer', None, [U, U])(0x8D40, framebuffer)
gf('glFramebufferTexture2D', None, [U, U, U, U, I])(0x8D40, 0x8CE0, 0x0DE1, output_texture, 0)
assert gf('glCheckFramebufferStatus', U, [U])(0x8D40) == 0x8CD5, 'Floating-point framebuffer required'
gf('glViewport', None, [I, I, I, I])(0, 0, 1, 1)
gf('glDisable', None, [U])(0x0B71)
gf('glDisable', None, [U])(0x0B44)
gf('glClearColor', None, [F, F, F, F])(0, 0, 0, 0)
clear = gf('glClear', None, [U])
draw = gf('glDrawArrays', None, [U, I, I])
read = gf('glReadPixels', None, [I, I, I, I, U, U, P])
pixel = (F * 4)()


def render(value):
    set_value(value_location, value)
    clear(0x4000)
    draw(4, 0, 3)
    read(0, 0, 1, 1, 0x1908, 0x1406, pixel)
    return list(pixel)


# The private frontColor is exported only in an in-memory test module. The
# actual source file and public renderer API remain unchanged.
node_source = r'''
import {readFileSync} from 'node:fs';
const source=readFileSync('dist/fit-surface.js','utf8')+'\nexport {frontColor};';
const {frontColor,mapColor}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const values=[-2,-1,-.5,-.1,-.01,0,.01,.1,.5,1,2];
console.log(JSON.stringify(values.map(value=>({value,front:frontColor(value),voltage:mapColor(value)}))));
'''
fixtures = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', node_source], cwd=ROOT))
light = .38 + .58 * 1.4 / math.sqrt(.45**2 + .8**2 + 1.4**2) + .12 * .3 / math.sqrt(.8**2 + .2**2 + .3**2)
max_error, color_checks = 0, 0
for cap in [0, 1]:
    set_uniform('isCap', cap)
    shine = (.035 if cap else .15) * (1.4 / math.sqrt(.45**2 + .8**2 + 1.4**2))**35
    for mode, name in [(0, 'voltage'), (1, 'front')]:
        set_uniform('frontMode', mode)
        for case in fixtures:
            actual = render(case['value'])
            expected = [v * light + shine for v in case[name]] + [1]
            error = max(abs(a - b) for a, b in zip(actual, expected))
            max_error = max(max_error, error)
            assert error < 2e-6, (cap, mode, case['value'], actual, expected)
            color_checks += 1

set_uniform('isCap', 0)
set_uniform('frontMode', 1)
negative, zero, positive = render(-1), render(0), render(1)
assert positive[0] > negative[0] and negative[2] > positive[2], 'Signed front hues must differ'
assert all(zero[i] < min(negative[i], positive[i]) for i in range(3)), 'Zero derivative must remain dark'

clip_checks = 0
for cut, cap, offset, visible in [(1, 0, -.1, False), (1, 0, .1, True), (1, 1, -.1, True), (0, 0, -.1, True)]:
    set_uniform('cut', cut)
    set_uniform('isCap', cap)
    set_uniform('cutOffset', offset)
    actual = render(1)
    assert actual[3] == (1 if visible else 0), (cut, cap, offset, actual)
    clip_checks += 1

report = {'passed': True, 'runtime': runtime,
          'shaderFile': 'dist/fit-surface.js',
          'unmodifiedGlslEs100PairCompiled': True,
          'actualSoftwarePaletteComparedWithActualFragment': True,
          'paletteChecks': color_checks, 'paletteAndLightingMaxError': max_error,
          'signedFrontGoldCyanDarkCheck': True, 'cutPlaneChecks': clip_checks,
          'scope': 'Complete shader compile; palette/lighting at a constant normal; clipping. Canvas gradient rasterization and browser rendering remain separate visual checks.'}
print(json.dumps(report, indent=2))
ef('eglMakeCurrent', U, [P, P, P, P])(display, None, None, None)
ef('eglDestroyContext', U, [P, P])(display, context)
ef('eglDestroySurface', U, [P, P])(display, surface)
ef('eglTerminate', U, [P])(display)
