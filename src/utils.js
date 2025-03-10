import {Color} from 'three';
export function parseOBJ(objText) {
    const vertices = [];
    const normals = [];
    const textures = [];
    const faces = [];

    const lines = objText.split('\n');

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const type = parts[0];

        switch (type) {
            case 'v':
                vertices.push(parts.slice(1).map(parseFloat));
                break;
            case 'vn':
                normals.push(parts.slice(1).map(parseFloat));
                break;
            case 'vt':
                textures.push(parts.slice(1).map(parseFloat));
                break;
            case 'f':
                const v_indices = [];
                const t_indices = [];
                const n_indices = [];
                for (let i = 1; i < parts.length; i++) {
                    const indices = parts[i].split('/').map((index) => {
                        if (index) {
                            return parseInt(index, 10) - 1; // OBJ indices are 1-based, JavaScript arrays are 0-based
                        }
                        return null;
                    });
                    // face.push(indices)
                    let v_index = indices[0];
                    let t_index = indices[1];
                    let n_index = indices[2];
                    if (v_index !== undefined) {
                        v_indices.push(v_index);
                    }
                    if (t_index !== undefined) {
                        t_indices.push(t_index);
                    }
                    if (n_index !== undefined) {
                        n_indices.push(n_index);
                    }
                }
                if (v_indices.length == 3) {
                    faces.push(v_indices.flat());
                }
                else if (v_indices.length > 3) {
                    for (let i = 0; i + 3 <= v_indices.length; i++) {
                        faces.push(v_indices.slice(i, i + 3).flat())
                    }
                    faces.push([...v_indices.slice(-2), v_indices[0]].flat())
                }
                break;
            default:
                break;
        }
    }

    return {
        vertices,
        normals,
        textures,
        faces,
    };
}

export function parseOFF(objText) {
    const vertices = [];
    const normals = [];
    const textures = [];
    const faces = [];

    const lines = objText.split('\n');
    if (lines.length < 2) {
        throw MediaError("Wrong file type...")
    }

    if (lines[0] != "OFF") {
        // TODO: Don't make this an error...
        throw MediaError("Wrong file type...")
    }

    const stats = lines[1].split(/\s+/).map((x) => {
        return parseInt(x, 10)
    });

    for (let i = 0; i < stats[0]; i++) {
        const line = lines[i + 2];
        const parts = line.trim().split(/\s+/);
        vertices.push(parts.map(parseFloat));
    }

    for (let i = 0; i < stats[1]; i++) {
        const line = lines[i + 2 + stats[0]];
        const parts = line.trim().split(/\s+/)
        const values = parts.map(x=>parseInt(x))
        const v_count = values[0];
        const face = values.slice(1, 1 + v_count)

        if (face.length == 3) {
            faces.push(face);
        } else if (face.length > 3) {
            for (let i = 0; i + 3 <= face.length; i++) {
                faces.push(face.slice(i, i + 3))
            }
            faces.push([...face.slice(-2), face[0]])
        }
    }

    return {
        vertices,
        faces
    }

}

export function parseSTL(objText) {
    throw new Error("parseSTL function is not implemented yet.");
}

export function parseGLTF(objText) {
    throw new Error("parseGLTF function is not implemented yet.");
}

export function parsePLY(objText) {
    throw new Error("parsePLY function is not implemented yet.");
}

export function interpolate_heat_color(x) {
    x = Math.min(.99,Math.max(0, x));
    let colors = [
        new Color(0xFFFFFF),
        new Color(0xFFFFC0),
        new Color(0xFFEE70),
        new Color(0xFFCC40),
        new Color(0xFF9930),
        new Color(0xFF6622),
        new Color(0xDD2200),
        new Color(0x990000)
    ]
    let idx = Math.floor(x*7)
    if (idx == colors.length-1) {
        let color = colors[idx];
        return color.r, color.g, color.b
    }

    let start = colors[idx];
    let end = colors[idx+1];

    let f = (colors.length-1)*x - idx;
    let r = start.r + f *(end.r - start.r)
    let g = start.g + f *(end.g - start.g)
    let b = start.b + f *(end.b - start.b)
    return {
        r: r, 
        g: g, 
        b: b
    }
}

