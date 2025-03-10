import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseOBJ, parseOFF, parseSTL, parseGLTF, parsePLY, interpolate_heat_color } from './utils.js';

let numpy;
let uploadedFile = null;
let pyodideLoaded = false;
let PYODIDE;

loadPyodide().then(async (pyodide) => {
    await pyodide.loadPackage(["scipy", "numpy"]); // Load scipy and numpy
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
let ORIGINS;
let VN;
let V;
let F;
let L;
let A;
let DIV;
let GRAD;

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
});

document.getElementById('upload-mesh').addEventListener('click', () => {
    document.getElementById('fileElem').click();
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFFFF)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// const camera = new THREE.OrthographicCamera(window.innerWidth / -2, window.innerWidth / 2,  window.innerHeight / -2, window.innerHeight / 2, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.z = 1;

// Orbit Controls for rotation
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
        A = PYODIDE.globals.get("vertex_area")(V,F);
        DIV = PYODIDE.globals.get("div")(V, F)
        GRAD = PYODIDE.globals.get("face_grad")(V,F)
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
    for(let i = 0 ; i < floatVertices.length ; i++) {
        largest = Math.max(largest, Math.abs(floatVertices[i]));
    }
    floatVertices = floatVertices.map(v => v / largest);

    geometry.setAttribute('position', new THREE.BufferAttribute(floatVertices, 3));
    let indexArray = new Uint32Array(meshInfo.faces.flat());
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
    geometry.computeVertexNormals();
    const colors = new Float32Array(floatVertices.length);
    for(let i = 0 ; i < floatVertices.length ; i++) {
        let color = new THREE.Color(0xFFFF00);
        colors[3*i] = color.r;
        colors[3*i+1] = color.g;
        colors[3*i+2] = color.b;
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
    const center = box.getCenter(new THREE.Vector3());
    MESH.position.sub(center);
}

// Vertex Picking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let startX;
let startY;
let isDragging;
const dragThreshold = 0.1;

function displayRay() {

    const origin = raycaster.ray.origin;
    const direction = raycaster.ray.direction;

    // Calculate a point far along the ray.
    const farPoint = new THREE.Vector3();
    farPoint.copy(origin).add(direction.clone().multiplyScalar(1000)); // Adjust the multiplier as needed

    // Create a line geometry and material.
    const geometry = new THREE.BufferGeometry().setFromPoints([origin, farPoint]);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 }); // Red line

    // Create the line and add it to the scene.
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    // Return the line so you can remove it later if needed.
    return line;
}


function onMouseUp(event) {
    if (!isDragging) {
        if (MESH) {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            // displayRay();
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
                for(let i = 0 ; i < distance.length ; i++) {
                    maximumDistance = Math.max(maximumDistance, distance[i]);
                }

                const colors = new Float32Array(VN*3);
                for(let i = 0 ; i < distance.length ; i++) {
                    if (!isNaN(distance[i] / maximumDistance)) {
                        let color = interpolate_heat_color(distance[i] / maximumDistance);
                        colors[3*i] = color.r;
                        colors[3*i + 1] = color.g;
                        colors[3*i + 2] = color.b;
                    }
                }
                geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            }
        }
    }
}

window.addEventListener('mousedown', (event) => {
    startX = event.clientX;
    startY = event.clientY;
    isDragging=false;
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