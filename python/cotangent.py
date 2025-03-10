import numpy as np
import scipy.sparse as sp

def cotan(x, y):
    return np.dot(x, y) / np.linalg.norm(np.cross(x, y))

def cotangent_laplacian(vertices, faces):
    """
    Computes the cotangent Laplacian matrix for a triangular mesh.

    Args:
        vertices (numpy.ndarray): An array of vertex coordinates (N, 3).
        faces (numpy.ndarray): An array of face indices (M, 3).

    Returns:
        scipy.sparse.csr_matrix: The cotangent Laplacian matrix.
    """
    num_vertices = vertices.shape[0]
    # Initialize row, column and data arrays for sparse matrix construction
    row_indices = [i for i in range(num_vertices)]
    col_indices = [i for i in range(num_vertices)]
    data_values = [0 for _ in range(num_vertices)]

    for i in range(faces.shape[0]):
        face = faces[i]
        v0, v1, v2 = face[0], face[1], face[2]
        
        # Compute edge vectors
        e_A = vertices[v1] - vertices[v0]
        e_B = vertices[v2] - vertices[v1]
        e_C = vertices[v0] - vertices[v2]

        # Compute cotangent weights
        cotC = cotan(-e_A, e_B)
        cotA = cotan(-e_B, e_C) 
        cotB = cotan(-e_C, e_A)
        
        # Update entries
        row_indices.extend([v0, v1, v1, v2, v2, v0])
        col_indices.extend([v1, v0, v2, v1, v0, v2])
        data_values.extend([cotA, cotA, cotB, cotB, cotC, cotC])

        data_values[v0] -= cotC + cotA
        data_values[v1] -= cotB + cotA
        data_values[v2] -= cotC + cotB

    L = sp.csc_matrix((data_values, (row_indices, col_indices)), shape=(num_vertices, num_vertices))
    return 0.5 * L

def mean_spacing(V, F):
    T = V[F, :]
    u = T[:,1,:] - T[:,0,:]
    v = T[:,2,:] - T[:,1,:]
    w = T[:,0,:] - T[:,2,:]
    L1 = np.linalg.norm(u, axis=1)
    L2 = np.linalg.norm(v, axis=1)
    L3 = np.linalg.norm(w, axis=1)
    return (L1.mean() + L2.mean() + L3.mean())/3

def face_area_normals(V,F):
    T = V[F, :]
    u = T[:,1,:] - T[:,0,:]
    v = T[:,2,:] - T[:,0,:]
    return 0.5 * np.cross(u, v)

def face_normals(V,F):
    A = face_area_normals(V,F)
    norms = np.linalg.norm(A, axis=1)
    return A / norms[:, None]

def face_area(V,F):
    return np.linalg.norm(face_area_normals(V,F), axis=1)

def vertex_area(V,F):
    A = np.repeat(face_area(V,F), 3)
    A = np.bincount(np.ravel(F), A)
    return A / 3

def face_grad(V,F):
    N = face_normals(V,F)
    A = face_area(V,F)

    u = np.repeat(F[:,0], 3)
    v = np.repeat(F[:,1], 3)
    w = np.repeat(F[:,2], 3)
    uv = V[F[:,1]] - V[F[:,0]]
    vw = V[F[:,2]] - V[F[:,1]]
    wu = V[F[:,0]] - V[F[:,2]]

    G1 = np.cross(N, vw) / A[:, None]
    G2 = np.cross(N, wu) / A[:, None]
    G3 = np.cross(N, uv) / A[:, None]
    J = np.arange(3*F.shape[0])
    rows = np.tile(J, 3)
    cols = np.concatenate([u, v, w])
    data = np.concatenate([G1.ravel(), G2.ravel(), G3.ravel()])
    g = sp.csc_matrix((data, (rows, cols)), shape=(3*F.shape[0], V.shape[0]))
    return 0.5 * g

def div(V,F):
    # ∇⋅ is |V|×3|F|
    uv = V[F[:,1],:] - V[F[:,0],:]
    vw = V[F[:,2],:] - V[F[:,1],:]
    wu = V[F[:,0],:] - V[F[:,2],:]
    cos1 = -np.sum(uv * wu, axis=1)
    cos2 = -np.sum(vw * uv, axis=1)
    cos3 = -np.sum(wu * vw, axis=1)

    sin1 = np.linalg.norm(np.cross(uv, wu), axis=1)
    sin2 = np.linalg.norm(np.cross(vw, uv), axis=1)
    sin3 = np.linalg.norm(np.cross(wu, vw), axis=1)
    cotan1 = cos1 / sin1
    cotan2 = cos2 / sin2
    cotan3 = cos3 / sin3
    u = np.repeat(F[:,0],3)
    v = np.repeat(F[:,1],3)
    w = np.repeat(F[:,2],3)
    J = np.arange(3*F.shape[0])
    A = np.ravel(-cotan2[:,None] * wu + cotan3[:,None] * uv)
    B = np.ravel(cotan1[:,None] * vw - cotan3[:,None] * uv)
    C = np.ravel(-cotan1[:,None] * vw + cotan2[:,None] * wu)
    rows = np.concatenate([u, v, w])
    cols = np.concatenate([J, J, J])
    data = np.concatenate([A, B, C])
    div = sp.csc_matrix((data, (rows, cols)), shape=(V.shape[0], 3 * F.shape[0])) 
    return 0.5 * div


def heat_implicit(L, A, init, dt=0.001, steps=1):

    D = sp.diags(A) - dt * L
    heat = init
    for _ in range(steps):
        heat = sp.linalg.spsolve(D, heat)
    
    heat = np.where(heat < 0.0, 1e-50, heat)
    return heat

def heat_method(origin, V, F, L, A, Grad, Div):
    u0 = np.zeros(L.shape[0])
    for u in origin:
        u0[u] = 1.0

    print("Tolerance check ", np.sum(np.abs(L - Div * Grad)))
    h = mean_spacing(V, F)

    ut = heat_implicit(L, A, u0, dt=h*h, steps=1)
    grads = np.reshape(-Grad * ut, (-1, 3))
    norms = np.linalg.norm(grads, axis=1)
    grads = grads / norms[:, None]
    X = Div * np.ravel(grads)
    distance = sp.linalg.spsolve(L, X)
    distance = distance - distance.min()
    return distance