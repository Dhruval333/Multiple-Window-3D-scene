
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r124/three.module.js';
import { WindowManager } from './WindowManager.js';

let camera, scene, renderer, world;
let pixR = window.devicePixelRatio ? window.devicePixelRatio : 1;
let spheres = [];
let sceneOffsetTarget = { x: 0, y: 0 };
let sceneOffset = { x: 0, y: 0 };

let today = new Date();
today.setHours(0); today.setMinutes(0); today.setSeconds(0); today.setMilliseconds(0);
today = today.getTime();

let internalTime = getTime();
let windowManager;
let initialized = false;

function getTime() {
    return (new Date().getTime() - today) / 1000.0;
}

if (new URLSearchParams(window.location.search).get("clear")) {
    localStorage.clear();
}
else {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState != 'hidden' && !initialized) {
            init();
        }
    });

    window.onload = () => {
        if (document.visibilityState != 'hidden') {
            init();
        }
    };

    function init() {
        initialized = true;
        setTimeout(() => {
            setupScene();
            setupWindowManager();
            resize();
            updateWindowShape(false);
            render();
            window.addEventListener('resize', resize);
        }, 500)
    }

    function setupScene() {
        camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10000);
        camera.position.z = 1000;
        camera.lookAt(0, 0, 0);

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0.0);

        renderer = new THREE.WebGLRenderer({ antialias: true, depthBuffer: true });
        renderer.setPixelRatio(pixR);

        world = new THREE.Object3D();
        scene.add(world);

        renderer.domElement.setAttribute("id", "scene");
        document.body.appendChild(renderer.domElement);
    }

    function setupWindowManager() {
        windowManager = new WindowManager();
        windowManager.setWinShapeChangeCallback(updateWindowShape);
        windowManager.setWinChangeCallback(updateWindowShape);
        let metaData = { foo: "bar" };
        windowManager.init(metaData);
        updateWindowShape(false);
    }

    function updateWindowShape(easing = true) {
        sceneOffsetTarget = { x: -window.screenX - window.innerWidth / 2, y: -window.screenY - window.innerHeight / 2 };
        if (!easing) sceneOffset = sceneOffsetTarget;
    }

    const vertexShader = `
    uniform float uTime;
    uniform vec3 uOtherPos;
    uniform float uHasOther;
    uniform vec3 uVelocity; 
    
    varying float vAlpha;
    varying vec3 vPos;
    varying float vMixColor; 

    // Simplex Noise
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) { 
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;

        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );

        vec3 x1 = x0 - i1 + 1.0 * C.xxx;
        vec3 x2 = x0 - i2 + 2.0 * C.xxx;
        vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

        i = mod289(i); 
        vec4 p = permute( permute( permute( 
                     i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                   + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

        float n_ = 1.0/7.0; 
        vec3  ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  

        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );    

        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );

        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);

        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                      dot(p2,x2), dot(p3,x3) ) );
    }

    void main() {
        vec3 localPos = position; 
        vMixColor = 0.0;
        
        // 1. Turbulent Motion
        float noiseFreq = 0.02;
        float noise = snoise(vec3(localPos.x * noiseFreq + uTime * 0.5, localPos.y * noiseFreq + uTime * 0.5, localPos.z * noiseFreq));
        localPos += normal * noise * 20.0;

        // 2. Inertia
        float elastic = smoothstep(0.0, 300.0, length(localPos));
        localPos -= uVelocity * elastic * 0.5;

        // 3. World Position
        vec4 worldPos = modelMatrix * vec4(localPos, 1.0);
        vPos = worldPos.xyz;
        
        // 4. Interaction Logic
        if (uHasOther > 0.5) {
            vec3 myCenter = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
            float distToOther = distance(worldPos.xyz, uOtherPos);
            float bridgeDist = 1500.0; 
            
            if (distToOther < bridgeDist) {
                // "Suction View" Structure
                // A static structural bridge that forms between the windows.
                // 50% particles stay as Shell (Border)
                // 50% particles form the Suction Tunnel -> Nucleus (Inner Core of other)
                
                // Stable ID 0..1
                float id = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 45.5432))) * 43758.5453);
                
                // Distribute: 0.0-0.5 = Shell, 0.5-1.0 = Tunnel
                float isTunnel = step(0.5, id); 

                // Transition factor based on distance
                // Starts forming at 1500, fully formed at 800
                float formFactor = smoothstep(bridgeDist, 600.0, distToOther); // 0 far, 1 close? 
                // Actually smoothstep(edge0, edge1, x) returns 0 at edge0, 1 at edge1.
                // We want 0 at 1500, 1 at 600? No, standard is min->max.
                // Let's use 1.0 - smoothstep.
                float connectionStrength = 1.0 - smoothstep(400.0, bridgeDist, distToOther);
                
                if (isTunnel > 0.5) {
                    // Map ID fraction to Path position 0..1
                    float t = (id - 0.5) * 2.0; 
                    
                    // Add animation flow to t? 
                    // The user asked for "Structure", so distinct particles staying in place is better 
                    // than flowing dots for a "View". Keeping them static along the path forms a solid shape.
                    
                    // Interpolate Center Position along the path
                    // Use a curve for easing
                    float pathT = smoothstep(0.0, 1.0, t);
                    vec3 pathCenter = mix(myCenter, uOtherPos, pathT);
                    
                    // Radius Profile:
                    // Start (t=0): 200 (Shell)
                    // Middle (t=0.5): 40 (Neck/Suction)
                    // End (t=1): 80 (Nucleus)
                    float rStart = 200.0;
                    float rMid = 30.0;
                    float rEnd = 70.0; // Inner Core size
                    
                    // Bezier-ish radius
                    float currentR = mix(rStart, rEnd, t);
                    // Pinch in the middle
                    float pinch = sin(t * 3.14159);
                    currentR = mix(currentR, rMid, pinch * 0.8); 
                    
                    // Radial Offset
                    // We need a vector perpendicular to the axis, but rotating?
                    // Simplest is to just use the original particle's direction relative to center
                    // But filtered to be perpendicular?
                    // Actually, just using localPos direction is fine, the "tube" will twist if axis rotates.
                    // For stability, let's just scale localPos to current Radius.
                    vec3 tubeRadial = normalize(localPos) * currentR;
                    
                    // Target Position for this particle in the Tunnel
                    vec3 tunnelPos = pathCenter + tubeRadial;
                    
                    // Apply Noise for liquid look
                    vec3 noiseOffset = vec3(
                        snoise(vec3(pathT * 5.0, uTime * 0.2, 0.0)),
                        snoise(vec3(0.0, pathT * 5.0, uTime * 0.2)),
                        snoise(vec3(uTime * 0.2, 0.0, pathT * 5.0))
                    ) * 20.0;
                    tunnelPos += noiseOffset;
                    
                    // Mix from Original(Shell) to Tunnel Shape based on proximity
                    worldPos.xyz = mix(worldPos.xyz, tunnelPos, connectionStrength);
                    
                    // Nucleus color mix?
                    // User: "one color outrange, other inner core". 
                    // Since this particle forms the inner core (at t=1), it stays MY color.
                    // The OTHER window will send THEIR particles to MY core.
                    // So visually: Green Shell -> Green Tunnel -> Green Core (inside Red).
                    // Red Shell -> Red Tunnel -> Red Core (inside Green).
                    // This creates the perfect bi-color nucleus effect.
                    // So NO color mixing needed.
                } 
                else {
                    // Shell Particles
                    // They stay at home, but maybe distort towards the suction point?
                    vec3 axis = normalize(uOtherPos - myCenter);
                    float projection = dot(normalize(localPos), axis);
                    
                    if (projection > 0.5) {
                         // Pull slightly into the funnel start
                         worldPos.xyz += axis * (30.0 * connectionStrength * snoise(vec3(localPos.x, uTime, 0.0)));
                    }
                }
            }
        }

        vAlpha = 1.0;
        gl_Position = projectionMatrix * viewMatrix * worldPos;

        gl_PointSize = 400.0 / max(1.0, gl_Position.w); 
        if (gl_PointSize < 4.0) gl_PointSize = 4.0;
        if (gl_PointSize > 60.0) gl_PointSize = 60.0;
    }
    `;

    const fragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uOtherColor; 
    varying float vAlpha;
    varying float vMixColor;
    
    void main() {
        vec2 cxy = 2.0 * gl_PointCoord - 1.0;
        float r = dot(cxy, cxy);
        if (r > 1.0) discard;

        float alpha = 1.0 - sqrt(r);
        alpha = pow(alpha, 2.0); 
        
        vec3 finalColor = mix(uColor, uOtherColor, clamp(vMixColor, 0.0, 1.0));

        gl_FragColor = vec4(finalColor, alpha * vAlpha * 0.6); 
    }
    `;

    function render() {
        let t = getTime();
        windowManager.update();

        let falloff = .05;
        sceneOffset.x = sceneOffset.x + ((sceneOffsetTarget.x - sceneOffset.x) * falloff);
        sceneOffset.y = sceneOffset.y + ((sceneOffsetTarget.y - sceneOffset.y) * falloff);

        world.position.x = sceneOffset.x;
        world.position.y = sceneOffset.y;

        let wins = windowManager.getWindows();
        let winCount = wins.length;

        if (spheres.length < winCount) {
            for (let i = spheres.length; i < winCount; i++) {
                let win = wins[i];
                let c = new THREE.Color();
                let hue = (i * 0.3) % 1.0;
                c.setHSL(hue, 0.9, 0.6);

                const particleCount = 30000;
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array(particleCount * 3);
                const normals = new Float32Array(particleCount * 3);

                const r = 200;
                for (let j = 0; j < particleCount; j++) {
                    let u = Math.random();
                    let v = Math.random();
                    let theta = 2 * Math.PI * u;
                    let phi = Math.acos(2 * v - 1);

                    let x = Math.sin(phi) * Math.cos(theta);
                    let y = Math.sin(phi) * Math.sin(theta);
                    let z = Math.cos(phi);

                    let radius = r + (Math.random() - 0.5) * 60.0;
                    if (Math.random() > 0.8) radius *= 1.25;

                    positions[j * 3] = x * radius;
                    positions[j * 3 + 1] = y * radius;
                    positions[j * 3 + 2] = z * radius;

                    normals[j * 3] = x;
                    normals[j * 3 + 1] = y;
                    normals[j * 3 + 2] = z;
                }

                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

                const material = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 },
                        uColor: { value: c },
                        uOtherColor: { value: new THREE.Color(0, 0, 0) },
                        uOtherPos: { value: new THREE.Vector3() },
                        uHasOther: { value: 0.0 },
                        uVelocity: { value: new THREE.Vector3(0, 0, 0) }
                    },
                    vertexShader: vertexShader,
                    fragmentShader: fragmentShader,
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending
                });

                const points = new THREE.Points(geometry, material);
                let wx = win.shape.x + (win.shape.w * .5);
                let wy = win.shape.y + (win.shape.h * .5);
                points.position.set(wx, wy, 0);

                world.add(points);
                spheres.push({
                    mesh: points,
                    id: win.id,
                    baseColor: c
                });
            }
        }

        while (spheres.length > winCount) {
            let s = spheres.pop();
            world.remove(s.mesh);
        }

        for (let i = 0; i < spheres.length; i++) {
            let sphereObj = spheres[i];
            let mesh = sphereObj.mesh;
            let win = wins[i];

            if (win) {
                let targetX = win.shape.x + (win.shape.w * .5);
                let targetY = win.shape.y + (win.shape.h * .5);

                mesh.position.x = mesh.position.x + (targetX - mesh.position.x) * falloff;
                mesh.position.y = mesh.position.y + (targetY - mesh.position.y) * falloff;

                let lagX = (targetX - mesh.position.x);
                let lagY = (targetY - mesh.position.y);

                mesh.material.uniforms.uVelocity.value.set(lagX * 2.0, lagY * 2.0, 0);
                mesh.rotation.y = t * 0.1;
                mesh.material.uniforms.uTime.value = t;
                mesh.material.uniforms.uColor.value = sphereObj.baseColor;

                let closestDist = Infinity;
                let closestPos = new THREE.Vector3();
                let closestColor = new THREE.Color(0, 0, 0);
                let found = false;

                for (let j = 0; j < wins.length; j++) {
                    if (i == j) continue;
                    let otherWin = wins[j];
                    let ox = otherWin.shape.x + (otherWin.shape.w * .5);
                    let oy = otherWin.shape.y + (otherWin.shape.h * .5);
                    let d = Math.sqrt(Math.pow(targetX - ox, 2) + Math.pow(targetY - oy, 2));

                    if (d < closestDist) {
                        closestDist = d;
                        closestPos.set(ox, oy, 0);
                        if (spheres[j]) closestColor = spheres[j].baseColor;
                        found = true;
                    }
                }

                if (found && closestDist < 1500) {
                    mesh.material.uniforms.uHasOther.value = 1.0;
                    mesh.material.uniforms.uOtherPos.value.copy(closestPos);
                    mesh.material.uniforms.uOtherColor.value.copy(closestColor);
                } else {
                    mesh.material.uniforms.uHasOther.value = 0.0;
                }
            }
        }

        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }

    function resize() {
        let width = window.innerWidth;
        let height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
}
