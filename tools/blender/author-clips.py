"""Author the extra Quaternius clips: Guard, HitA, HitB, HitHeavy, TellJab, then export the GLB.
Usage: Blender -b --factory-startup --disable-autoexec --python tools/blender/author-clips.py -- <Animated Human.fbx> <ClothedLightSkin.png> <out.glb>
(the FBX and the palette PNG come from the Quaternius zip, see assets/quaternius-human/README.txt)
"""
import bpy, sys, itertools
from mathutils import Vector, Quaternion
src, tex, out = sys.argv[sys.argv.index("--") + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
mesh = [o for o in bpy.data.objects if o.type == "MESH"][0]
acts = {a.name.split("|")[-1]: a for a in bpy.data.actions}
pb = arm.pose.bones
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for b in pb: b.rotation_mode = "QUATERNION"
arm.animation_data_create()

def use(action):
    arm.animation_data.action = action
    if hasattr(arm.animation_data, "action_slot") and action.slots:
        arm.animation_data.action_slot = action.slots[0]
def at(action, frame):
    use(action); bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()
def capture(): return {b.name: (b.location.copy(), b.rotation_quaternion.copy()) for b in pb}
def apply(d):
    for n, (loc, q) in d.items(): pb[n].location = loc; pb[n].rotation_quaternion = q
    bpy.context.view_layer.update()
def new_action(name):
    a = bpy.data.actions.new(name); a.use_fake_user = True; return a
def key(action, frame, d):
    # no scene update between setting the pose and keying it: an update re-evaluates the assigned action and overwrites the pose
    if action.slots: use(action)
    else: arm.animation_data.action = action
    for n, (loc, q) in d.items():
        pb[n].location = loc.copy(); pb[n].rotation_quaternion = q.copy()
    for n in d:
        pb[n].keyframe_insert("rotation_quaternion", frame=frame)
        if n == "Hips": pb[n].keyframe_insert("location", frame=frame)
def offset(d, spec):
    out = {n: (l.copy(), q.copy()) for n, (l, q) in d.items()}
    for bone, axis, ang in spec:
        l, q = out[bone]; out[bone] = (l, q @ Quaternion(Vector(axis), ang))
    return out
def wp(n, tail=False): b = pb[n]; return arm.matrix_world @ (b.tail if tail else b.head)
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)

# axes: forward from the left foot, right from forward x up
at(acts["Idle"], 1)
foot = wp("LeftFoot"); toe = wp("LeftToeBase", True)
F = Vector((toe.x - foot.x, toe.y - foot.y, 0)).normalized(); R = F.cross(Vector((0, 0, 1))).normalized()
PLANE = wp("Hips")
def reflect(v): return v - 2 * ((v - PLANE).dot(R)) * R
def depth(b):
    d = 0; p = b.parent
    while p: d += 1; p = p.parent
    return d
order = [b.name for b in sorted(pb, key=depth)]
def partner(n): return n.replace("Left", "Right") if "Left" in n else (n.replace("Right", "Left") if "Right" in n else n)
SIGNS = [(1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)]
LOCS = list(itertools.product((1, -1), repeat=3))

# 1. Guard
at(acts["Punch"], 1); guard = capture()
a = new_action("Guard"); key(a, 1, guard); key(a, 12, guard)

# 3. hit reactions, from the guard pose
def hit(name, back, side, twist, frames):
    spec = lambda k: [("Spine", X, -back * k), ("Spine1", X, -back * k), ("Spine2", X, -back * k), ("Neck", X, -back * .6 * k),
                      ("Spine", Z, side * k), ("Spine1", Z, side * k), ("Spine2", Z, side * k), ("Spine1", Y, twist * k)]
    act = new_action(name)
    key(act, 1, guard); key(act, 1 + frames[0], offset(guard, spec(1.0))); key(act, 1 + frames[1], offset(guard, spec(.55)))
    key(act, 1 + frames[2], offset(guard, spec(.2))); key(act, 1 + frames[3], guard)
hit("HitA", .09, -.08, .12, (2, 5, 8, 11))
hit("HitB", .09, .08, -.12, (2, 5, 8, 11))
hit("HitHeavy", .17, -.12, .2, (3, 8, 13, 18))

# 4. tell: search the left (striking) arm and forearm angles that put the fist beside the ear
def solve_tell():
    target = hips_ref + F * 0.35 - R * 0.45 + Vector((0, 0, 1.70))
    params = [0.0] * 6
    def pose_for(pr):
        return offset(guard, [("LeftArm", X, pr[0]), ("LeftArm", Y, pr[1]), ("LeftArm", Z, pr[2]),
                              ("LeftForeArm", X, pr[3]), ("LeftForeArm", Y, pr[4]), ("LeftForeArm", Z, pr[5])])
    def err(pr):
        d = pose_for(pr)
        arm.animation_data.action = None
        for n, (l, q) in d.items(): pb[n].location = l; pb[n].rotation_quaternion = q
        bpy.context.view_layer.update()
        return (wp("LeftHand") - target).length
    step = 0.5; cur = err(params)
    for it in range(40):
        improved = False
        for i in range(6):
            for dirn in (1, -1):
                trial = params[:]; trial[i] += dirn * step
                if abs(trial[i]) > 2.2: continue
                e = err(trial)
                if e < cur: params, cur, improved = trial, e, True
        if not improved: step *= .5
        if step < .02: break
    print("TELLSOLVE params", [round(x, 2) for x in params], "residual", round(cur, 3))
    return pose_for(params)
at(acts["Punch"], 1)
hips_ref = wp("Hips")
tell = solve_tell()
tell = offset(tell, [("Spine", X, -.06), ("Spine1", X, -.04)])
a = new_action("TellJab"); key(a, 1, guard); key(a, 5, tell); key(a, 8, tell)

# diagnostics, evaluated with the slot bound
def rel(n):
    d = wp(n) - wp("Hips"); return "(F%+.2f R%+.2f U%+.2f)" % (d.dot(F), d.dot(R), d.z)
for name, frames in (("Punch", (1, 7, 14)), ("HitA", (1, 3, 6)), ("HitB", (3,)), ("HitHeavy", (4,)), ("TellJab", (1, 5))):
    act = [x for x in bpy.data.actions if x.name == name or x.name.endswith("|" + name)][0]
    for f in frames:
        at(act, f)
        print("DIAG", name, f, "head", rel("Head"), "LHand", rel("LeftHand"), "RHand", rel("RightHand"))
arm.animation_data.action = None
bpy.ops.object.mode_set(mode="OBJECT")

# foot faces to the shoes row, texture, material
me = mesh.data
names = {vg.index: vg.name for vg in mesh.vertex_groups}
foot_groups = {n for n in names.values() if any(k in n for k in ("Foot", "Toe"))}
def foot_weight(v): return sum(g.weight for g in v.groups if names.get(g.group) in foot_groups)
uv = me.uv_layers.active.data; V_SHOE = 1.0 - 29.5 / 32.0
for p in me.polygons:
    if sum(foot_weight(me.vertices[i]) for i in p.vertices) / len(p.vertices) > 0.5:
        for li in p.loop_indices: uv[li].uv = (uv[li].uv[0], V_SHOE)
mat = bpy.data.materials["Texture"]; nt = mat.node_tree
bsdf = [x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"][0]
bsdf.inputs["Metallic"].default_value = 0.0; bsdf.inputs["Roughness"].default_value = 0.85
img = bpy.data.images.load(tex); img.pack()
node = nt.nodes.new("ShaderNodeTexImage"); node.image = img; node.interpolation = "Closest"
nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=True, export_animation_mode="ACTIONS", export_apply=False)
print("EXPORTED", out)
