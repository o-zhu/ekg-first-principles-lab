#!/usr/bin/env python3
"""Compile the actual scene GLSL and compare its field evaluator with JS.

Uses an already installed EGL/OpenGL ES runtime; no browser, network, window,
or third-party Python package. A missing optional GL runtime is a clear skip.
The shader is evaluated into a floating-point framebuffer, not compared via
screenshots or an independently reimplemented timing formula.
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


def ef(name, result, args):
    f = getattr(egl, name)
    f.restype, f.argtypes = result, args
    return f


def gf(name, result, args):
    f = getattr(gl, name)
    f.restype, f.argtypes = result, args
    return f


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
get_string = gf('glGetString', c.c_char_p, [U])
runtime = get_string(0x1F02).decode()
fixture = json.loads(subprocess.check_output(['node', str(ROOT / 'scripts/electrical-gpu-fixture.mjs')], cwd=ROOT))

create_shader = gf('glCreateShader', U, [U])
source_shader = gf('glShaderSource', None, [U, I, c.POINTER(c.c_char_p), c.POINTER(I)])
compile_shader = gf('glCompileShader', None, [U])
get_shader = gf('glGetShaderiv', None, [U, U, c.POINTER(I)])
shader_log = gf('glGetShaderInfoLog', None, [U, I, c.POINTER(I), P])
create_program = gf('glCreateProgram', U, [])
attach = gf('glAttachShader', None, [U, U])
link = gf('glLinkProgram', None, [U])
get_program = gf('glGetProgramiv', None, [U, U, c.POINTER(I)])
program_log = gf('glGetProgramInfoLog', None, [U, I, c.POINTER(I), P])
use = gf('glUseProgram', None, [U])


def compile_program(vertex, fragment):
    p = create_program()
    for kind, source in [(0x8B31, vertex), (0x8B30, fragment)]:
        sh, encoded = create_shader(kind), source.encode()
        source_shader(sh, 1, (c.c_char_p * 1)(encoded), None)
        compile_shader(sh)
        ok = I()
        get_shader(sh, 0x8B81, c.byref(ok))
        if not ok.value:
            log = c.create_string_buffer(16384)
            shader_log(sh, len(log), None, log)
            raise AssertionError(log.value.decode() + '\n' + source)
        attach(p, sh)
    link(p)
    ok = I()
    get_program(p, 0x8B82, c.byref(ok))
    if not ok.value:
        log = c.create_string_buffer(16384)
        program_log(p, len(log), None, log)
        raise AssertionError(log.value.decode())
    return p


def modern(source, fragment=False):
    source = re.sub(r'#include\s*<[^>]+>', '', source)
    source = source.replace('attribute ', 'in ').replace('varying ', 'in ' if fragment else 'out ').replace('texture2D(', 'texture(')
    prefix = '#version 300 es\nprecision highp float;\n'
    if fragment:
        prefix += 'out vec4 fragColor;\n'
        source = source.replace('gl_FragColor', 'fragColor')
    return prefix + source


# Compile the actual HeartScene material insertion, including rhythm masking,
# injury outline and every newly added uniform/varying, before numeric tests.
triangle = 'vec2 screen=gl_VertexID==0?vec2(-1.,-1.):gl_VertexID==1?vec2(3.,-1.):vec2(-1.,3.);gl_Position=vec4(screen,0.,1.);'
scene_vertex = fixture['sceneVertex'].replace('gl_Position=vec4(aRestPosition,1.0);', triangle)
scene_program = compile_program(modern(scene_vertex), modern(fixture['sceneFragment'], True))
vertex = '''#version 300 es
precision highp float;
out vec2 vElectricalReference;
void main(){vec2 p=gl_VertexID==0?vec2(-1.,-1.):gl_VertexID==1?vec2(3.,-1.):vec2(-1.,3.);gl_Position=vec4(p,0.,1.);vElectricalReference=vec2(0.);}
'''
fragment = modern(fixture['fieldGLSL'] + '''
uniform vec3 uTestPosition;
uniform vec2 uTestReference;
uniform vec2 uTestBlockReference;
uniform vec4 uTest1;
uniform vec4 uTest2;
uniform vec4 uTest3;
uniform float uTestPhase;
uniform int uTestOutput;
void main(){
 vec4 t=mappedElectricalTiming(uTestPosition,uTestReference,uTestBlockReference,uTest1.x,uTest1.y,uTest1.z,uTest1.w,uTest2.x,uTest2.y,uTest2.w,uTest3.x,uTest3.y,uTest3.z,uTest3.w);
 vec4 w=electricalWaveform(uTestPhase,t,uTest1.y);
 if(uTestOutput==0)gl_FragColor=t;
 else if(uTestOutput==1)gl_FragColor=w;
 else gl_FragColor=vec4(electricalDisplayColor(vec3(.35,.14,.11),w,t,uTestPhase,uTest1.y,uTest1.z,uTest1.w,uTest2.x,uTest2.y,uTest2.z,uTest2.w,1.0),1.0);
}
''', True)
program = compile_program(vertex, fragment)
use(program)
uniform_location = gf('glGetUniformLocation', I, [U, c.c_char_p])
uniform1f = gf('glUniform1f', None, [I, F])
uniform1i = gf('glUniform1i', None, [I, I])
uniforms = {n: gf('glUniform' + str(n) + 'fv', None, [I, I, c.POINTER(F)]) for n in [2, 3, 4]}


def set_f(name, value):
    loc = uniform_location(program, name.encode())
    if isinstance(value, (list, tuple)):
        uniforms[len(value)](loc, 1, (F * len(value))(*value))
    else:
        uniform1f(loc, value)


def set_i(name, value):
    uniform1i(uniform_location(program, name.encode()), value)


gen_texture = gf('glGenTextures', None, [I, c.POINTER(U)])
bind_texture = gf('glBindTexture', None, [U, U])
image_texture = gf('glTexImage2D', None, [U, I, I, I, I, I, U, U, P])
parameter = gf('glTexParameteri', None, [U, U, I])
active_texture = gf('glActiveTexture', None, [U])
texture = U()
gen_texture(1, c.byref(texture))
active_texture(0x84C0)
bind_texture(0x0DE1, texture)
image_texture(0x0DE1, 0, 0x1908, 2048, 2, 0, 0x1908, 0x1401, (c.c_ubyte * len(fixture['texture']))(*fixture['texture']))
for key, value in [(0x2801, 0x2600), (0x2800, 0x2600), (0x2802, 0x812F), (0x2803, 0x812F)]:
    parameter(0x0DE1, key, value)
set_i('uElectricalTemplate', 0)

output_texture, framebuffer = U(), U()
gen_texture(1, c.byref(output_texture))
active_texture(0x84C1)
bind_texture(0x0DE1, output_texture)
image_texture(0x0DE1, 0, 0x8814, 1, 1, 0, 0x1908, 0x1406, None)
gf('glGenFramebuffers', None, [I, c.POINTER(U)])(1, c.byref(framebuffer))
gf('glBindFramebuffer', None, [U, U])(0x8D40, framebuffer)
gf('glFramebufferTexture2D', None, [U, U, U, U, I])(0x8D40, 0x8CE0, 0x0DE1, output_texture, 0)
assert gf('glCheckFramebufferStatus', U, [U])(0x8D40) == 0x8CD5, 'Floating-point framebuffer required for numeric parity'
gf('glViewport', None, [I, I, I, I])(0, 0, 1, 1)
draw = gf('glDrawArrays', None, [U, I, I])
read = gf('glReadPixels', None, [I, I, I, I, U, U, P])
pixel = (F * 4)()
max_timing, max_wave, max_color, max_voltage_mv = 0, 0, 0, 0
worst_wave = None
for case in fixture['cases']:
    options = case['options']
    set_f('uTestPosition', case['position'])
    set_f('uTestReference', case['reference'])
    set_f('uTestBlockReference', case['blockReference'])
    set_f('uTest1', [options['lvWeight'], float(options.get('atrial', False)), options['pStart'], options['pEnd']])
    set_f('uTest2', [options['qrsStart'], options['qrsEnd'], options['tStart'], options['tEnd']])
    set_f('uTest3', [options['lvDelay'], options['rvDelay'], float(options.get('ectopic', False)), case['injury']])
    set_f('uRR', options['rr'])
    set_f('uTestPhase', case['phase'])
    for output in [0, 1, 2]:
        set_i('uTestOutput', output)
        for view in (range(5) if output == 2 else [0]):
            set_f('uElectricalView', view)
            draw(4, 0, 3)
            read(0, 0, 1, 1, 0x1908, 0x1406, pixel)
            actual = list(pixel)
            expected = case['expectedTiming'] if output == 0 else case['expectedWaveform'] if output == 1 else case['display'][str(view)] + [1]
            assert all(math.isfinite(v) for v in actual)
            error = max(abs(a - b) for a, b in zip(actual, expected))
            if output == 0:
                max_timing = max(max_timing, error)
            elif output == 1:
                max_voltage_mv = max(max_voltage_mv, abs(actual[0]-expected[0])*110)
                if error > max_wave:
                    worst_wave = {'position': case['position'], 'options': options, 'phase': case['phase'], 'actual': actual, 'expected': expected}
                max_wave = max(max_wave, error)
            else:
                max_color = max(max_color, error)
assert max_timing < 2e-6, max_timing
assert max_wave < .003, (max_wave, worst_wave)
assert max_color < .003, max_color
assert max_voltage_mv < .01, max_voltage_mv

# Render the actual scene fragment body at one constant myocardial point. Only
# the camera transform is replaced with a screen-filling triangle; every map
# availability condition and activation toggle is the shipped material code.
program = scene_program
use(program)
set_i('uElectricalTemplate', 0)
location_attribute = gf('glGetAttribLocation', I, [U, c.c_char_p])
attributes = {n: gf('glVertexAttrib' + str(n) + 'fv', None, [U, c.POINTER(F)]) for n in [1, 2, 3]}
for name, value in [('aRestPosition', [.6, -.8, .1]), ('aLVWeight', [1]), ('aTransmuralDepth', [.05]), ('aElectricalReference', fixture['cases'][0]['reference']), ('aElectricalBlockActivation', fixture['cases'][0]['blockReference'])]:
    loc = location_attribute(program, name.encode())
    if loc >= 0:
        attributes[len(value)](loc, (F * len(value))(*value))
base = {'uPhase': .06, 'uAtrialPhase': -.1, 'uAtrialAvailable': 1, 'uVentricularAvailable': 1,
        'uClock': 1, 'uPStart': -.16, 'uPEnd': -.06, 'uQStart': 0, 'uQEnd': .09,
        'uTStart': .20, 'uTEnd': .38, 'uActivation': 1, 'uAtrial': 0,
        'uAtrialFibrillation': 0, 'uAtrialFlutter': 0, 'uFlutterPhase': 0,
        'uVentricularMechanism': 0, 'uVentricularDisorganization': 0,
        'uLVDelay': 0, 'uRVDelay': .008, 'uEctopic': 0, 'uInjuryTerritory': 0,
        'uInjuryVisible': 0, 'uCutFace': 0, 'uHighlight': 0, 'uRR': 60/72, 'uInjurySeverity': .7}
neutral = [.35 + (.13-.35)*.55, .14 + (.25-.14)*.55, .11 + (.29-.11)*.55]
mask_checks = 0
for patch in [{'uAtrial': 1, 'uAtrialAvailable': 0},
              {'uVentricularAvailable': 0},
              {'uAtrial': 1, 'uAtrialFibrillation': 1},
              {'uAtrial': 1, 'uAtrialFlutter': 1},
              {'uVentricularAvailable': 0, 'uVentricularMechanism': 3},
              {'uVentricularMechanism': 2}, {'uVentricularMechanism': 1}]:
    for name, value in {**base, **patch}.items():
        set_f(name, value)
    for view in [2, 3, 4]:
        set_f('uElectricalView', view)
        draw(4, 0, 3)
        read(0, 0, 1, 1, 0x1908, 0x1406, pixel)
        assert max(abs(a-b) for a, b in zip(pixel, neutral)) < 1e-6, (patch, view, list(pixel))
        mask_checks += 1
    set_f('uActivation', 0)
    for view in [0, 1, 2, 3, 4]:
        set_f('uElectricalView', view)
        draw(4, 0, 3)
        read(0, 0, 1, 1, 0x1908, 0x1406, pixel)
        assert max(abs(a-b) for a, b in zip(pixel, [.35, .14, .11])) < 1e-6
for name, value in {**base, 'uAtrialFibrillation': 1, 'uElectricalView': 2}.items():
    set_f(name, value)
draw(4, 0, 3)
read(0, 0, 1, 1, 0x1908, 0x1406, pixel)
assert max(abs(a-b) for a, b in zip(pixel, neutral)) > .03, 'AF must not gray an independently timed ventricular map'
print(json.dumps({'passed': True, 'runtime': runtime, 'actualSceneShaderCompiled': True,
                  'numericCases': len(fixture['cases']), 'timingMaxErrorSeconds': max_timing,
                  'waveformAndFrontMaxError': max_wave, 'displayColorMaxError': max_color,
                  'voltageMaxErrorMv': max_voltage_mv,
                  'neutralMapChecks': mask_checks, 'activationOffChecks': 35,
                  'afPreservesTimedVentricularMap': True}, indent=2))
ef('eglMakeCurrent', U, [P, P, P, P])(display, None, None, None)
ef('eglDestroyContext', U, [P, P])(display, context)
ef('eglDestroySurface', U, [P, P])(display, surface)
ef('eglTerminate', U, [P])(display)
