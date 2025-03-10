import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseOBJ, parseOFF, parseSTL, parseGLTF, parsePLY, interpolate_heat_color } from './utils.js';

let numpy;
let uploadedFile = null;
let pyodideLoaded = false;
let PYODIDE;

loadPyodide().then(async (pyodide) => {
    await pyodide.loadPackage(["scipy", "numpy"]); 
    numpy = pyodide.pyimport("numpy");
    pyodide.runPython(await (await fetch("./cotangent.py")).text())
    pyodideLoaded = true;
    PYODIDE = pyodide;
    if (uploadedFile) {
        console.log("Please process")
        processFile(uploadedFile);
    }
    return pyodide;
});

let MESH;
let CENTER;
let ORIGINS;
let VN;
let V;
let F;
let L;
let A;
let DIV;
let GRAD;
let ISOLINES;

document.getElementById('fileSelect').addEventListener('click', () => {
    document.getElementById('fileElem').click();
});

document.getElementById('fileElem').addEventListener('change', handleFiles);
document.getElementById('drop-area').addEventListener('dragover', (event) => {
    event.preventDefault();
});

document.getElementById('drop-area').addEventListener('drop', (event) => {
    event.preventDefault();
});

document.getElementById('clear-origins').addEventListener('click', () => {
    ORIGINS = [];
    if (MESH) {
        const colors = new Float32Array(VN * 3);
        for (let i = 0; i < VN; i++) {
            let color = new THREE.Color(0xFFFF00);
            colors[3 * i] = color.r;
            colors[3 * i + 1] = color.g;
            colors[3 * i + 2] = color.b;
        }
        MESH.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    if (ISOLINES) {
        scene.remove(ISOLINES);
        ISOLINES.geometry.dispose();
        ISOLINES.material.dispose();
        ISOLINES = null;
    }
});

document.getElementById('upload-mesh').addEventListener('click', () => {
    console.log("Reupload...")
    document.getElementById('fileElem').click();
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFFFF)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.z = 1;

const controls = new OrbitControls(camera, renderer.domElement);
// controls.enableDamping = true;
// controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(1, 1, 1);
const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight2.position.set(-1, -1, -1);
scene.add(directionalLight2);
const directionalLight3 = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight3.position.set(1, -1, 1);
scene.add(directionalLight3);
const directionalLight4 = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight4.position.set(-1, 1, -1);
scene.add(directionalLight4);

function handleFiles(event) {
    const file = event.target.files[0];
    uploadedFile = file;

    document.getElementById('drop-area').style.display = 'none';
    document.getElementById('blur-overlay').style.visibility = 'visible';
    if (pyodideLoaded) {
        processFile(file);
    }
}

function processFile(file) {
    const reader = new FileReader();

    reader.onload = function (event) {
        const fileContent = event.target.result;
        const fileName = file.name.toLowerCase();

        // Remove the existing mesh from the scene
        if (MESH) {
            scene.remove(MESH);
            MESH.geometry.dispose();
            MESH.material.dispose();
            MESH = null;
        }
        if (ISOLINES) {
            scene.remove(ISOLINES);
            ISOLINES.geometry.dispose();
            ISOLINES.material.dispose();
            ISOLINES = null;
        }


        let meshInfo;
        if (fileName.endsWith('.obj')) {
            meshInfo = parseOBJ(fileContent);
        } else if (fileName.endsWith('.off')) {
            meshInfo = parseOFF(fileContent);
        } else if (fileName.endsWith('.stl')) {
            meshInfo = parseSTL(fileContent);
        } else if (fileName.endsWith('.gltf') || fileName.endsWith('.glb')) {
            meshInfo = parseGLTF(fileContent);
        } else if (fileName.endsWith('.ply')) {
            meshInfo = parsePLY(fileContent);
        } else {
            alert('Unsupported file format.');
        }

        constructMesh(meshInfo);
        V = numpy.array(meshInfo.vertices);
        VN = meshInfo.vertices.length;
        F = numpy.array(meshInfo.faces);
        L = PYODIDE.globals.get("cotangent_laplacian")(V, F);
        A = PYODIDE.globals.get("vertex_area")(V, F);
        DIV = PYODIDE.globals.get("div")(V, F)
        GRAD = PYODIDE.globals.get("face_grad")(V, F)
        ORIGINS = null
        console.log("Precompute finished")
        document.getElementById('blur-overlay').style.visibility = 'hidden';
    };

    reader.readAsText(file);
}

function constructMesh(meshInfo) {
    const geometry = new THREE.BufferGeometry();
    let floatVertices = new Float32Array(meshInfo.vertices.flat());
    let largest = 0.0;
    for (let i = 0; i < floatVertices.length; i++) {
        largest = Math.max(largest, Math.abs(floatVertices[i]));
    }
    floatVertices = floatVertices.map(v => v / largest);

    geometry.setAttribute('position', new THREE.BufferAttribute(floatVertices, 3));
    let indexArray = new Uint32Array(meshInfo.faces.flat());
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
    geometry.computeVertexNormals();
    const colors = new Float32Array(floatVertices.length);
    for (let i = 0; i < floatVertices.length; i++) {
        let color = new THREE.Color(0xFFFF00);
        colors[3 * i] = color.r;
        colors[3 * i + 1] = color.g;
        colors[3 * i + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.MeshPhongMaterial({ vertexColors: true });

    MESH = new THREE.Mesh(geometry, material);
    console.log(MESH)

    scene.add(MESH);
    centerMesh();

}

function centerMesh() {
    const box = new THREE.Box3().setFromObject(MESH);
    CENTER = box.getCenter(new THREE.Vector3());
    MESH.position.sub(CENTER);
}

// Vertex Picking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let startX;
let startY;
let isDragging;
const dragThreshold = 0.1;

function onMouseUp(event) {
    if (!isDragging) {
        if (MESH) {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(MESH);

            if (intersects.length > 0) {
                const intersection = intersects[0];
                const vertexIndex = intersection.face.a; // Just an example, for triangles.
                console.log("selected vertex ", vertexIndex)
                const vertex = intersection.object.geometry.attributes.position.array.slice(vertexIndex * 3, vertexIndex * 3 + 3);

                if (ORIGINS == null) {
                    ORIGINS = []
                }
                ORIGINS.push(vertexIndex)
                ORIGINS = [...new Set(ORIGINS)];

                let origins = numpy.array(ORIGINS)
                let distance = PYODIDE.globals.get("heat_method")(origins, V, F, L, A, GRAD, DIV);

                distance = distance.toJs();

                let geometry = MESH.geometry;
                let maximumDistance = 0.0
                for (let i = 0; i < distance.length; i++) {
                    maximumDistance = Math.max(maximumDistance, distance[i]);
                }

                const colors = new Float32Array(VN * 3);
                for (let i = 0; i < distance.length; i++) {
                    if (!isNaN(distance[i] / maximumDistance)) {
                        let color = interpolate_heat_color(distance[i] / maximumDistance);
                        colors[3 * i] = color.r;
                        colors[3 * i + 1] = color.g;
                        colors[3 * i + 2] = color.b;
                    }
                }
                geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                updateIsolines(distance);
            }
        }
    }
}

window.addEventListener('mousedown', (event) => {
    startX = event.clientX;
    startY = event.clientY;
    isDragging = false;
})

document.addEventListener("mousemove", (event) => {
    const deltaX = Math.abs(event.clientX - startX);
    const deltaY = Math.abs(event.clientY - startY);

    if (deltaX > dragThreshold || deltaY > dragThreshold) {
        isDragging = true;
    }
});
window.addEventListener('mouseup', onMouseUp, false);

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Update orbit controls
    renderer.render(scene, camera);
}

animate();

// Resize Handling
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
})

function updateIsolines(distance) {
    if (ISOLINES) {
        scene.remove(ISOLINES);
        ISOLINES.geometry.dispose();
        ISOLINES.material.dispose();
        ISOLINES = null;
    }
    let isolinesGeometry = new THREE.BufferGeometry();
    let isolinesMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
    });

    ISOLINES = new THREE.LineSegments(isolinesGeometry, isolinesMaterial);

    const maxDistance = distance.reduce((a, b) => Math.max(a, b), -Infinity);
    let isolinesPositions = [];
    const M = 20;
    let distBetweenLines = maxDistance / M;
    console.log("max distance ", maxDistance, " ; M ", M);
    console.log("delta ", distBetweenLines);

    let intersectionDict = {};
    let vertices = MESH.geometry.attributes.position.array;
    let faces = MESH.geometry.index.array
    
    for (let level = 1; level < M; level++) {
        console.log("Level = ", level, " at ", level * distBetweenLines)
        for (let f = 0; f < faces.length; f += 3) {
            let face = faces.slice(f, f + 3);
            let segment = []
            let crosses = 0;
            for (let i = 0; i < 3; i++) {
                let ii = face[i % 3];
                let jj = face[(i + 1) % 3];
                let key = `${Math.min(ii, jj)}-${Math.max(ii, jj)}`;
                let region1 = Math.floor(distance[ii] / distBetweenLines);
                let region2 = Math.floor(distance[jj] / distBetweenLines);
                if (region1 != region2) {
                    let lambda = (region1 < region2) ?
                        (level * distBetweenLines - distance[ii]) / (distance[jj] - distance[ii]) :
                        (level * distBetweenLines - distance[jj]) / (distance[ii] - distance[jj])
                    if (0 <= lambda && lambda <= 1) {
                        crosses += 1;
                        let v1 = vertices.slice(3 * ii, 3 * ii + 3);
                        let v2 = vertices.slice(3 * jj, 3 * jj + 3);
                        let x = [
                            v1[0] * lambda + v2[0] * (1 - lambda),
                            v1[1] * lambda + v2[1] * (1 - lambda),
                            v1[2] * lambda + v2[2] * (1 - lambda)
                        ]
                        // TODO: Hack, but why is the intersection different each time?
                        if (intersectionDict[key] !== undefined) {
                            console.log("DEFINED ALREADY")
                            x = intersectionDict[key];
                        }
                        intersectionDict[key] = x;
                        segment.push(x)
                    }
                }
            }

            if (segment.length == 2) {
                isolinesPositions.push(...segment.flat());
            }
            // if (crosses > 0) {
            //     // set this face's color to blue
            //     let colors = MESH.geometry.attributes.color.array;
            //     for (let i = 0; i < 3; i++) {
            //         const vertexIndex = face[i];
            //         colors[3 * vertexIndex] = faceColor.r;
            //         colors[3 * vertexIndex + 1] = faceColor.g;
            //         colors[3 * vertexIndex + 2] = faceColor.b;
            //     }
            //     MESH.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            //     console.log("*****")
            // }

        }
    }

    console.log(isolinesPositions);
    isolinesGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(isolinesPositions), 3))
    scene.add(ISOLINES);
    ISOLINES.position.sub(CENTER);
    console.log("isolines constructed")


    //         for (let h of f.adjacentHalfedges()) {
    //             let v1 = h.vertex;
    //             let v2 = h.twin.vertex;
    //             let i = heatMethod.vertexIndex[v1];
    //             let j = heatMethod.vertexIndex[v2];
    //             let region1 = Math.floor(phi.get(i, 0) / distBetweenLines);
    //             let region2 = Math.floor(phi.get(j, 0) / distBetweenLines);

    //             if (region1 !== region2) {
    //                 let p1 = geometry.positions[v1];
    //                 let p2 = geometry.positions[v2];
    //                 let p = p1.plus(p2.minus(p1).times(lambda));

    //                 segment.push(p);
    //             }
    //         }

    //         if (segment.length === 2) {
    //             for (let i = 0; i < 2; i++) {
    //                 isolinesPositions.push(segment[i].x);
    //                 isolinesPositions.push(segment[i].y);
    //                 isolinesPositions.push(segment[i].z);
    //             }
    //         }
    //     }

    //     isolinesMesh.geometry.addAttribute("position", new THREE.BufferAttribute(new Float32Array(isolinesPositions), 3));
}